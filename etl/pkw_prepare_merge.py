"""
Convert the reviewed PKW election CSVs (etl/pkw_review/*.csv) into the site's
per-variable JSON schema, ready to merge into data/. Does NOT write into data/
or touch variables.js -- output stays in etl/pkw_review/ as *.json until the
variable names/grouping are confirmed.

Schema (matches data/radni_gminy.json etc.): {teryt: {year: {"default__<measure>":
{"t":.., "m":.., "k":..}}}}. teryt is 7-digit (WWPPGGR) for gmina, matching
data/gminy.json; 4-digit (WWPP) for powiat, matching data/radni_powiatu.json;
2-digit (WW) for sejmik -- no boundary layer exists yet for voivodeships.

Gmina TERYT crosswalk: PKW files use the 6-digit WWPPGG code (no rodzaj digit).
A handful of gminas from older elections don't match any current gmina (merged,
renamed, or renumbered since); known cases are remapped explicitly, the rest are
dropped with a printed report -- see UNMAPPABLE handling below.
"""
import json
import os

import pandas as pd

REVIEW_DIR = os.path.join(os.path.dirname(__file__), "pkw_review")

# Known historical gmina TERYT changes (source: the original research notebook's
# own reconciliation, cross-checked against data/gminy.json).
GMINA_REMAP_6DIGIT = {
    "180510": "121616",  # Szerzyny: changed voivodship in 2003
    "060608": "060315",  # Rejowiec: changed poviat in 2006
    "140610": "141806",  # Tarczyn: changed poviat in 2006
    "026301": "026501",  # Wałbrzych
    "022109": "026501",  # Wałbrzych
}


def build_gmina_crosswalk():
    with open(os.path.join(os.path.dirname(__file__), "..", "data", "gminy.json"), encoding="utf-8") as f:
        gminy = json.load(f)
    crosswalk = {feat["properties"]["JPT_KOD_JE"][:6]: feat["properties"]["JPT_KOD_JE"] for feat in gminy["features"]}

    # Dissolved gminy (Ostrowice, Zielona Góra wiejska) have no feature of
    # their own in gminy.json -- they only exist via the runtime override
    # layer in gminy_historical_overrides.json, which shows their OWN
    # historical geometry for years <= validUntil. Without this, their PKW
    # rows fell through to the bare 6-digit fallback ("320304"/"080910")
    # instead of the 7-digit code that override layer actually looks data
    # up by (mapValueFor("3203042")), so pre-merger elections rendered as
    # "brak danych" even though the historical polygon displayed correctly
    # (found 2026-07-27: report_unmapped's own printed report already named
    # these two 6-digit codes every run, but nothing acted on it since nothing
    # downstream cross-checks against gminy_historical_overrides.json).
    with open(os.path.join(os.path.dirname(__file__), "..", "data", "gminy_historical_overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    for dissolved_teryt in overrides.get("merges", {}):
        crosswalk[dissolved_teryt[:6]] = dissolved_teryt
    return crosswalk


def map_gmina_teryt(series, crosswalk):
    remapped = series.replace(GMINA_REMAP_6DIGIT)
    mapped = remapped.map(crosswalk)
    return mapped


def report_unmapped(df, mapped_col, label):
    unmapped = df[df[mapped_col].isna()]
    if len(unmapped):
        print(f"  {label}: {len(unmapped)} rows have no current-day gmina match -- "
              f"kept under their original 6-digit TERYT (won't render on the map until "
              f"a matching boundary/crosswalk exists)")
        for year, count in unmapped.groupby("year").size().items():
            print(f"    {year}: {count} gminas")


def to_json_shape(df, teryt_col, measures):
    """measures: dict of {measure_key: (t_col, m_col, k_col)}"""
    out = {}
    for row in df.itertuples(index=False):
        teryt = getattr(row, teryt_col)
        year = str(getattr(row, "year"))
        out.setdefault(teryt, {}).setdefault(year, {})
        for measure_key, (t_col, m_col, k_col) in measures.items():
            out[teryt][year][f"default__{measure_key}"] = {
                "t": int(getattr(row, t_col)),
                "m": int(getattr(row, m_col)),
                "k": int(getattr(row, k_col)),
            }
    return out


def prepare_gmina_level(csv_name, out_name, measures, crosswalk):
    df = pd.read_csv(os.path.join(REVIEW_DIR, csv_name), dtype={"teryt": str})
    df["teryt7"] = map_gmina_teryt(df["teryt"], crosswalk)
    report_unmapped(df, "teryt7", csv_name)
    # No unit is dropped: fall back to the original 6-digit TERYT (the raw,
    # already-remapped code) wherever no current-day 7-digit gmina match exists.
    df["teryt_final"] = df["teryt7"].fillna(df["teryt"].replace(GMINA_REMAP_6DIGIT))

    shaped = to_json_shape(df, "teryt_final", measures)
    out_path = os.path.join(REVIEW_DIR, out_name)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(shaped, f, ensure_ascii=False)
    print(f"  wrote {out_path}: {len(shaped)} teryty")


def prepare_flat_level(csv_name, out_name, measures):
    """powiat (4-digit) / sejmik (2-digit): already in the target key format."""
    df = pd.read_csv(os.path.join(REVIEW_DIR, csv_name), dtype={"teryt": str})
    shaped = to_json_shape(df, "teryt", measures)
    out_path = os.path.join(REVIEW_DIR, out_name)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(shaped, f, ensure_ascii=False)
    print(f"  wrote {out_path}: {len(shaped)} teryty")


def main():
    crosswalk = build_gmina_crosswalk()

    council_measures = {
        "candidates": ("candidates_t", "candidates_m", "candidates_k"),
        "elected": ("elected_t", "elected_m", "elected_k"),
        "votes": ("votes_t", "votes_m", "votes_k"),
    }

    print("rady_gmin.csv -> wybory_rady_gmin.json")
    prepare_gmina_level("rady_gmin.csv", "wybory_rady_gmin.json", council_measures, crosswalk)

    print("rady_powiatow.csv -> wybory_rady_powiatow.json")
    prepare_flat_level("rady_powiatow.csv", "wybory_rady_powiatow.json", council_measures)

    print("sejmik.csv -> wybory_sejmiku.json")
    prepare_flat_level("sejmik.csv", "wybory_sejmiku.json", council_measures)

    mayor_measures = {
        "candidates": ("candidates_t", "candidates_m", "candidates_k"),
        "elected": ("elected_t", "elected_m", "elected_k"),
        "votes_r1": ("votes_r1_t", "votes_r1_m", "votes_r1_k"),
        "votes_r2": ("votes_r2_t", "votes_r2_m", "votes_r2_k"),
    }
    print("wojtowie.csv -> wybory_wojtowie.json")
    prepare_gmina_level("wojtowie.csv", "wybory_wojtowie.json", mayor_measures, crosswalk)


if __name__ == "__main__":
    main()
