"""
Convert GUS "Rozkład wynagrodzeń w gospodarce narodowej wg płci" Excel
publications into the compact frontend format. Two measures (mean/median),
one age group ("default" -- BDL/GUS doesn't offer wages by age AND sex AND
powiat simultaneously).

Table numbering shifts between editions (Tabl. 7 in the 2024 edition,
Tabl. 11 in 2025 -- confirmed by the actual sheet titles, not just position),
and the header row shifts by one row between them. Both editions share the
same underlying table shape once the header is found: columns
KTS/Makroregion/Województwo/Region/Podregion/Powiat/WYSZCZEGÓLNIENIE/
Ogółem/Mężczyźni/Kobiety, with national/makroregion/województwo/podregion
rows mixed in (Powiat == "00") above the actual powiat rows.

sharesMeaningful: false -- wages are a rate/statistic, not a headcount, so
% kobiet/% mężczyzn would be meaningless here.
"""

import json
import os

import pandas as pd

OUT_DIR = "../data"
EDITIONS = {
    2024: {"file": "../data/wages_GUS/rozklad_wynagrodzen_w_gospodarce_narodowej_w_styczniu_2024_r._tablice.xlsx",
           "mean_sheet": "Tabl. 7.A", "median_sheet": "Tabl. 7.B", "skiprows": [0, 1]},
    2025: {"file": "../data/wages_GUS/rozklad_wynagrodzen_w_gospodarce_narodowej_w_styczniu_2025_r._tablice.xlsx",
           "mean_sheet": "Tabl. 11.A", "median_sheet": "Tabl. 11.B", "skiprows": [0, 1, 2]},
}


def load_powiat_rows(path, sheet, skiprows):
    """Reads one GUS wages Excel sheet, filters out non-powiat aggregate rows
    (national/makroregion/województwo totals, where "Powiat" is blank/0),
    and builds each remaining row's 4-digit teryt from its Województwo+Powiat
    columns."""
    df = pd.read_excel(path, sheet_name=sheet, skiprows=skiprows)
    # Województwo/Powiat load as float64 (e.g. 12.0), not strings -- a
    # string comparison against "00" silently matched nothing, letting
    # national/makroregion/województwo aggregate rows leak through as if
    # they were powiat rows. Filter numerically, then zero-pad as strings.
    df = df[(df["Powiat"].notna()) & (df["Powiat"] != 0)].copy()
    df["teryt"] = df["Województwo"].astype(int).astype(str).str.zfill(2) + df["Powiat"].astype(int).astype(str).str.zfill(2)
    return df[["teryt", "Ogółem", "Mężczyźni", "Kobiety"]]


if __name__ == "__main__":
    out = {}
    for year, cfg in EDITIONS.items():
        mean_df = load_powiat_rows(cfg["file"], cfg["mean_sheet"], cfg["skiprows"])
        median_df = load_powiat_rows(cfg["file"], cfg["median_sheet"], cfg["skiprows"])
        for teryt, row in mean_df.set_index("teryt").iterrows():
            out.setdefault(teryt, {}).setdefault(str(year), {})["default__mean"] = {
                "t": row["Ogółem"], "m": row["Mężczyźni"], "k": row["Kobiety"]
            }
        for teryt, row in median_df.set_index("teryt").iterrows():
            out.setdefault(teryt, {}).setdefault(str(year), {})["default__median"] = {
                "t": row["Ogółem"], "m": row["Mężczyźni"], "k": row["Kobiety"]
            }
        print(f"{year}: {len(mean_df)} powiat rows (mean), {len(median_df)} (median)")

    path = os.path.join(OUT_DIR, "wages.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wages: {len(out)} regions -> {path}")
