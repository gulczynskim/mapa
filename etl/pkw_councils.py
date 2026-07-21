"""
Build gmina/powiat/sejmik council (rady) candidate-gender data from raw PKW files
in the "Bitwa o wozy i Parytety" Input/Councils folder (1998-2024).

Input files are NOT part of this repo -- point INPUT_DIR at the folder containing
Councils/*.xlsx before running. Output: three review CSVs in etl/pkw_review/.

One row per (unit TERYT, year): candidates/elected/votes counts by gender.
Not wired into the site yet -- for manual review first.
"""
import os
import numpy as np
import pandas as pd

INPUT_DIR = "/home/gulczynek/Studia/Moje rozważania/Bitwa o wozy i Parytety w Polsce/Parytety w Polsce/Projekt/Input"
OUT_DIR = os.path.join(os.path.dirname(__file__), "pkw_review")

WARSAW_TERYT6 = "146501"

# Szczebel (tier) label -> level, across all year-specific spellings encountered.
# Warsaw district councils (DZ/RD/dzielnica) are intentionally left unmapped (=
# dropped): only the city-wide council counts as Warsaw's gmina entry, matching
# the convention used elsewhere in this research (2024andprevious.csv). 'ST' is
# the 1998-only whole-city Warsaw race (pre-dating the modern GM classification)
# and is kept, redirected to Warsaw's canonical gmina teryt.
LEVEL_MAP = {
    "GW": "gmina", "GP": "gmina", "GM": "gmina", "GPW": "gmina", "GPP": "gmina",
    "gmina do 20 tyś.": "gmina", "gmina do 20 tys.": "gmina",
    "gmina pow. 20 tyś.": "gmina", "gmina pow. 20 tys.": "gmina",
    "miasto na prawach powiatu": "gmina", "m.p.p.": "gmina",
    "ST": "warsaw_city",
    "PO": "powiat", "powiat": "powiat",
    "WO": "sejmik", "sejmik": "sejmik", "województwo": "sejmik",
}

SEX_MAP = {"K": "k", "M": "m", "Kobieta": "k", "Mężczyzna": "m"}


def normalize_teryt6(raw):
    s = str(raw).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(6)


# year -> column mapping + elected-code set, for the six "classic" schema files
YEAR_CONFIGS = {
    1998: dict(file="Councils/1998-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Płeć", votes="Gł. kand.", elected="Mand.", elected_codes={"W", "L", "B"}),
    2002: dict(file="Councils/2002-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Płeć", votes="Głosy", elected="Mandat", elected_codes={"G", "L", "B"}),
    2006: dict(file="Councils/2006-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Płeć", votes="Gł. na kand.", elected="Mandat", elected_codes={"T", "B"}),
    2010: dict(file="Councils/2010-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Plec", votes="L. głosów", elected="Wybrany", elected_codes={"T", "B"}),
    2014: dict(file="Councils/2014-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Płeć", votes="Głosy", elected="Mandat", elected_codes={"T", "B"}),
    2018: dict(file="Councils/2018-kand-rady.xlsx", teryt="TERYT", szczebel="Szczebel",
               sex="Płeć", votes="Liczba\ngłosów", elected="Mandat", elected_codes={"T", "B"}),
}

# 2024: two files (split by municipality size), no Szczebel column -- gmina level only
FILES_2024 = [
    "Councils/2024-kandydaci_rady_gmin_do_20k_utf8.xlsx",
    "Councils/2024-kandydaci_rady_gmin_powyzej_20k_utf8.xlsx",
]

# 2024 powiat/sejmik candidate files live in Regional/, not Councils/
FILE_2024_POWIAT = "Regional/2024/kandydaci_rady_powiatow_utf8.xlsx"
FILE_2024_SEJMIK = "Regional/2024/kandydaci_sejmiki_wojewodztw_utf8.xlsx"


def load_classic_year(year, cfg):
    path = os.path.join(INPUT_DIR, cfg["file"])
    print(f"Reading {year}: {path}")
    df = pd.read_excel(path)

    teryt6 = df[cfg["teryt"]].map(normalize_teryt6)
    level = df[cfg["szczebel"]].map(LEVEL_MAP)
    sex = df[cfg["sex"]].map(SEX_MAP)
    elected = df[cfg["elected"]].isin(cfg["elected_codes"])
    votes = pd.to_numeric(df[cfg["votes"]], errors="coerce").fillna(0)

    out = pd.DataFrame({
        "year": year,
        "teryt6": teryt6,
        "level": level,
        "sex": sex,
        "elected": elected,
        "votes": votes,
        "candidate": 1,
    })
    dropped = out["level"].isna() | out["sex"].isna()
    if dropped.any():
        print(f"  dropping {dropped.sum()} rows with unrecognized level/sex")
    return out[~dropped]


def load_2024():
    frames = []
    for rel in FILES_2024:
        path = os.path.join(INPUT_DIR, rel)
        print(f"Reading 2024: {path}")
        df = pd.read_excel(path)
        teryt6 = df["TERYT Gminy"].map(normalize_teryt6)
        sex = df["Płeć"].map(SEX_MAP)
        elected = df["Czy uzyskał mandat"] == "Tak"
        votes = pd.to_numeric(df["Liczba głosów"], errors="coerce").fillna(0)
        out = pd.DataFrame({
            "year": 2024,
            "teryt6": teryt6,
            "level": "gmina",
            "sex": sex,
            "elected": elected,
            "votes": votes,
            "candidate": 1,
        })
        dropped = out["sex"].isna()
        if dropped.any():
            print(f"  dropping {dropped.sum()} rows with unrecognized sex")
        frames.append(out[~dropped])
    return pd.concat(frames, ignore_index=True)


def load_2024_regional(rel_path, teryt_col, level):
    path = os.path.join(INPUT_DIR, rel_path)
    print(f"Reading 2024 ({level}): {path}")
    df = pd.read_excel(path)
    teryt6 = df[teryt_col].map(normalize_teryt6)
    sex = df["Płeć"].map(SEX_MAP)
    elected = df["Czy uzyskał mandat"] == "Tak"
    votes = pd.to_numeric(df["Liczba głosów"], errors="coerce").fillna(0)
    out = pd.DataFrame({
        "year": 2024,
        "teryt6": teryt6,
        "level": level,
        "sex": sex,
        "elected": elected,
        "votes": votes,
        "candidate": 1,
    })
    dropped = out["sex"].isna()
    if dropped.any():
        print(f"  dropping {dropped.sum()} rows with unrecognized sex")
    return out[~dropped]


def build_long_table():
    frames = [load_classic_year(y, cfg) for y, cfg in YEAR_CONFIGS.items()]
    frames.append(load_2024())
    frames.append(load_2024_regional(FILE_2024_POWIAT, "TERYT Powiatu", "powiat"))
    frames.append(load_2024_regional(FILE_2024_SEJMIK, "TERYT Województwa", "sejmik"))
    long_df = pd.concat(frames, ignore_index=True)

    long_df["agg_level"] = long_df["level"].map(
        {"gmina": "gmina", "warsaw_city": "gmina", "powiat": "powiat", "sejmik": "sejmik"}
    )
    long_df["key"] = np.select(
        [long_df["level"] == "warsaw_city", long_df["level"] == "powiat", long_df["level"] == "sejmik"],
        [WARSAW_TERYT6, long_df["teryt6"].str[:4], long_df["teryt6"].str[:2]],
        default=long_df["teryt6"],
    )
    return long_df


def pivot_wide(long_df, agg_level):
    sub = long_df[long_df["agg_level"] == agg_level]
    g = sub.groupby(["key", "year", "sex"]).agg(
        candidates=("candidate", "sum"),
        elected=("elected", "sum"),
        votes=("votes", "sum"),
    ).reset_index()

    wide = g.pivot(index=["key", "year"], columns="sex", values=["candidates", "elected", "votes"])
    wide.columns = [f"{metric}_{sex}" for metric, sex in wide.columns]
    wide = wide.fillna(0).reset_index()

    for metric in ["candidates", "elected", "votes"]:
        m_col, k_col = f"{metric}_m", f"{metric}_k"
        if m_col not in wide.columns:
            wide[m_col] = 0
        if k_col not in wide.columns:
            wide[k_col] = 0
        wide[f"{metric}_t"] = wide[m_col] + wide[k_col]

    int_cols = [c for c in wide.columns if c.startswith("candidates") or c.startswith("elected")]
    wide[int_cols] = wide[int_cols].astype(int)
    wide["votes_m"] = wide["votes_m"].astype(int)
    wide["votes_k"] = wide["votes_k"].astype(int)
    wide["votes_t"] = wide["votes_t"].astype(int)

    wide = wide.rename(columns={"key": "teryt"})
    return wide.sort_values(["teryt", "year"])


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    long_df = build_long_table()

    gmina = pivot_wide(long_df, "gmina")
    powiat = pivot_wide(long_df, "powiat")
    sejmik = pivot_wide(long_df, "sejmik")

    gmina.to_csv(os.path.join(OUT_DIR, "rady_gmin.csv"), index=False)
    powiat.to_csv(os.path.join(OUT_DIR, "rady_powiatow.csv"), index=False)
    sejmik.to_csv(os.path.join(OUT_DIR, "sejmik.csv"), index=False)

    print("\nrady_gmin.csv:", gmina.shape, sorted(gmina.year.unique()))
    print("rady_powiatow.csv:", powiat.shape, sorted(powiat.year.unique()))
    print("sejmik.csv:", sejmik.shape, sorted(sejmik.year.unique()))


if __name__ == "__main__":
    main()
