"""
Build gmina-level mayor (wójt/burmistrz/prezydent) candidate-gender data from raw
PKW files in the "Bitwa o wozy i Parytety" Input/Mayors folder (2002-2024).

Two-round elections: candidates are the round-1 field; round-2 participants are a
subset re-running against each other. Output has separate votes_r1_*/votes_r2_*
columns (round 2 is 0 for candidates who didn't make the runoff). "elected" is the
final winner regardless of which round decided it.

Input files are NOT part of this repo -- point INPUT_DIR at the folder containing
Mayors/... before running. Output: wojtowie.csv in etl/pkw_review/. Not wired into
the site yet -- for manual review first.
"""
import os
import pandas as pd

INPUT_DIR = "/home/gulczynek/Studia/Moje rozważania/Bitwa o wozy i Parytety w Polsce/Parytety w Polsce/Projekt/Input"
OUT_DIR = os.path.join(os.path.dirname(__file__), "pkw_review")

SEX_MAP = {"K": "k", "M": "m", "Kobieta": "k", "Mężczyzna": "m"}


def normalize_teryt6(raw):
    """Normalizes a raw TERYT value (which Excel/pandas may load as a float
    like 146501.0) into a zero-padded 6-digit string."""
    s = str(raw).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(6)


def to_votes(series):
    """Coerces a votes column to numeric, treating unparseable/missing
    values as 0."""
    return pd.to_numeric(series, errors="coerce").fillna(0)


def standardize(year, teryt6, sex_raw, votes_r1, votes_r2, elected):
    """Assembles one year's already-round-merged candidate rows into the
    common long-table shape (year, teryt6, sex, votes_r1, votes_r2, elected,
    candidate), dropping any row with an unrecognized sex value."""
    sex = sex_raw.map(SEX_MAP)
    out = pd.DataFrame({
        "year": year,
        "teryt6": teryt6.map(normalize_teryt6),
        "sex": sex,
        "votes_r1": to_votes(votes_r1).fillna(0),
        "votes_r2": to_votes(votes_r2).fillna(0),
        "elected": elected.fillna(False).astype(bool),
        "candidate": 1,
    })
    dropped = out["sex"].isna()
    if dropped.any():
        print(f"  dropping {dropped.sum()} rows with unrecognized sex")
    return out[~dropped]


def merge_rounds(df1, df2, key_cols):
    """Left-join round-2 rows (already renamed to avoid name clashes) onto the round-1 candidate list."""
    before = len(df1)
    merged = df1.merge(df2, on=key_cols, how="left")
    if len(merged) != before:
        print(f"  WARNING: round merge changed row count {before} -> {len(merged)} (duplicate keys)")
    return merged


def load_2002():
    """Loads the 2002 mayor election file, splits it into round-1/round-2
    candidate rows, merges the rounds on identifying columns, and
    standardizes the result -- 2002's own column names/win-code ("T")."""
    path = os.path.join(INPUT_DIR, "Mayors/2002/wojt2002.xls")
    print(f"Reading 2002: {path}")
    df = pd.read_excel(path)
    key = ["TERYT", "Nazwisko", "1. Imie", "2. Imie", "Wiek"]
    r1 = df[df["Tura"] == 1].copy()
    r2 = df[df["Tura"] == 2][key + ["Wybrany", "Gł. na kand."]].copy()
    r2.columns = [c if c in key else c + "_r2only" for c in r2.columns]
    m = merge_rounds(r1, r2, key)
    elected = (m["Wybrany"] == "T") | (m.get("Wybrany_r2only") == "T")
    return standardize(2002, m["TERYT"], m["Plec"], m["Gł. na kand."], m.get("Gł. na kand._r2only", 0), elected)


def load_2006():
    """Loads the 2006 mayor election file, splits/merges its two rounds, and
    standardizes the result -- 2006's own column names/win-code ("T")."""
    path = os.path.join(INPUT_DIR, "Mayors/2006/Wojtowie/wojt2006-zbiorówka.xls")
    print(f"Reading 2006: {path}")
    df = pd.read_excel(path)
    key = ["TERYT", "Nazwisko", "Imiona", "Wiek"]
    r1 = df[df["Tura"] == 1].copy()
    r2 = df[df["Tura"] == 2][key + ["Mandat", "Kandydat"]].copy()
    r2.columns = [c if c in key else c + "_r2only" for c in r2.columns]
    m = merge_rounds(r1, r2, key)
    elected = (m["Mandat"] == "T") | (m.get("Mandat_r2only") == "T")
    return standardize(2006, m["TERYT"], m["Płeć"], m["Kandydat"], m.get("Kandydat_r2only", 0), elected)


def load_2010():
    """Loads the 2010 mayor election file and merges its rounds -- unlike
    every other year, 2010 can have a "Tura" 3 (a re-run vote for a gmina
    whose round 2 was itself contested/voided), so any gmina with a round-3
    row uses that instead of its round-2 row as the "round 2" data."""
    path = os.path.join(INPUT_DIR, "Mayors/2010-kand-wbp.csv")
    print(f"Reading 2010: {path}")
    df = pd.read_csv(path)
    key = ["TERYT", "Nazwisko", "Imiona", "Wiek"]
    r1 = df[df["Tura"] == 1].copy()
    r3_teryts = set(df[df["Tura"] == 3]["TERYT"])
    r2 = df[(df["Tura"] == 2) & (~df["TERYT"].isin(r3_teryts)) | (df["Tura"] == 3)]
    r2 = r2[key + ["Wybrany", "L. głosów"]].copy()
    r2.columns = [c if c in key else c + "_r2only" for c in r2.columns]
    m = merge_rounds(r1, r2, key)
    elected = (m["Wybrany"] == "T") | (m.get("Wybrany_r2only") == "T")
    return standardize(2010, m["TERYT"], m["Płec"], m["L. głosów"], m.get("L. głosów_r2only", 0), elected)


def load_2014():
    """Loads the 2014 mayor election file -- already round-merged in the
    source file itself (columns suffixed _x/_y for round 1/2), so no
    separate merge_rounds call is needed here unlike the other years."""
    path = os.path.join(INPUT_DIR, "Mayors/2014-kand-wbp.xls")
    print(f"Reading 2014: {path}")
    df = pd.read_excel(path)
    elected = (df["Mandat_x"] == "T") | (df["Mandat_y"] == "T")
    return standardize(2014, df["TERYT"], df["Płeć"], df["Gł. na kand._x"], df["Gł. na kand._y"], elected)


def load_2018():
    """Loads the 2018 mayor election's two separate round files and merges
    them -- 2018's own column names/win-code ("Tak")."""
    p1 = os.path.join(INPUT_DIR, "Mayors/2018-kand-wbp-I-tura.xlsx")
    p2 = os.path.join(INPUT_DIR, "Mayors/2018-kand-wbp-II-tura.xlsx")
    print(f"Reading 2018: {p1}")
    df1 = pd.read_excel(p1)
    print(f"Reading 2018: {p2}")
    df2 = pd.read_excel(p2)
    key = ["TERYT", "Nazwisko", "Imię", "Drugie imię", "Wiek"]
    r2 = df2[key + ["Wybrany", 'Głosy\n"za"']].copy()
    r2.columns = [c if c in key else c + "_r2only" for c in r2.columns]
    m = merge_rounds(df1, r2, key)
    elected = (m["Wybrany"] == "Tak") | (m.get("Wybrany_r2only") == "Tak")
    return standardize(2018, m["TERYT"], m["Płeć"], m['Głosy\n"za"'], m.get('Głosy\n"za"_r2only', 0), elected)


def load_2024():
    """Loads the 2024 mayor election's two separate round files and merges
    them -- 2024's own column names/win-code ("Tak")."""
    p1 = os.path.join(INPUT_DIR, "Mayors/2024-kand-wbp.xlsx")
    p2 = os.path.join(INPUT_DIR, "Mayors/2024-kand-wbp2.xlsx")
    print(f"Reading 2024: {p1}")
    df1 = pd.read_excel(p1)
    print(f"Reading 2024: {p2}")
    df2 = pd.read_excel(p2)
    key = ["TERYT", "Nazwisko i imiona", "Wiek"]
    r2 = df2[key + ["Czy uzyskał mandat", "Liczba głosów"]].copy()
    r2.columns = [c if c in key else c + "_r2only" for c in r2.columns]
    m = merge_rounds(df1, r2, key)
    elected = (m["Czy uzyskał mandat"] == "Tak") | (m.get("Czy uzyskał mandat_r2only") == "Tak")
    return standardize(2024, m["TERYT"], m["Płeć"], m["Liczba głosów"], m.get("Liczba głosów_r2only", 0), elected)


def pivot_wide(long_df):
    """Aggregates the combined long table by (teryt, year, sex) into
    candidates/elected/votes_r1/votes_r2 sums, pivots sex into separate
    _m/_k columns, and fills in a computed _t = _m + _k for each metric --
    the final wojtowie.csv shape."""
    g = long_df.groupby(["teryt6", "year", "sex"]).agg(
        candidates=("candidate", "sum"),
        elected=("elected", "sum"),
        votes_r1=("votes_r1", "sum"),
        votes_r2=("votes_r2", "sum"),
    ).reset_index()

    wide = g.pivot(index=["teryt6", "year"], columns="sex",
                    values=["candidates", "elected", "votes_r1", "votes_r2"])
    wide.columns = [f"{metric}_{sex}" for metric, sex in wide.columns]
    wide = wide.fillna(0).reset_index()

    for metric in ["candidates", "elected", "votes_r1", "votes_r2"]:
        m_col, k_col = f"{metric}_m", f"{metric}_k"
        if m_col not in wide.columns:
            wide[m_col] = 0
        if k_col not in wide.columns:
            wide[k_col] = 0
        wide[f"{metric}_t"] = wide[m_col] + wide[k_col]

    int_cols = [c for c in wide.columns if c != "teryt6" and c != "year"]
    wide[int_cols] = wide[int_cols].astype(int)
    wide = wide.rename(columns={"teryt6": "teryt"})
    return wide.sort_values(["teryt", "year"])


def main():
    """Entry point: loads every election year, concatenates them, pivots to
    wide form, and writes wojtowie.csv to etl/pkw_review/."""
    os.makedirs(OUT_DIR, exist_ok=True)
    frames = [load_2002(), load_2006(), load_2010(), load_2014(), load_2018(), load_2024()]
    long_df = pd.concat(frames, ignore_index=True)

    wide = pivot_wide(long_df)
    wide.to_csv(os.path.join(OUT_DIR, "wojtowie.csv"), index=False)
    print("\nwojtowie.csv:", wide.shape, sorted(wide.year.unique()))


if __name__ == "__main__":
    main()
