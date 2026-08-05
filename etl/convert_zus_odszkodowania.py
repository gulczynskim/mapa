"""
Convert ZUS "Jednorazowe odszkodowania z tytułu wypadku przy pracy lub
choroby zawodowej" Excel publication into the compact frontend format.

Source file: data/Jednorazowe_odszkodowania_w_2025_r._na_płeć_i_powiaty_(1).xlsx
Sheet "JO 2025", header spans two rows (Ogółem/Mężczyźni/Kobiety, then
"liczba jednorazowych odszkodowań"/"przeciętna wysokość w zł" under each).
TERYT column ("TERYT \n(4 znaki)") is already a 4-digit zero-padded string,
confirmed to match data/powiaty.json's own keyset exactly (380/380, no
crosswalk needed) -- unlike PKW/BDL historical imports elsewhere in this
project. Single year (2025) as published; re-run with a new EDITIONS entry
if ZUS publishes a later year the same way.

Two measures, both raw (not derived): "liczba" (count of one-time
compensations paid) and "wysokosc_srednia" (average payout, zł) --
sharesMeaningful gating for the latter handled in variables.js/app.js
(isRateMeasure's "_srednia" suffix), not here.

Statistical-secrecy unmasking (k_liczba only): ZUS's own footnote says
"(0) -- ... liczebności 3 i więcej osób" -- any sex/powiat cell with fewer
than 3 people is displayed as a literal 0, not left blank/null. Confirmed
in the 2025 data: m_liczba is never masked (min nonzero value across all
380 powiaty is exactly 3), but k_liczba is masked in exactly 6 powiaty
(all with t_liczba != m_liczba + k_liczba as published). Since t_liczba
and m_liczba are both published unmasked, the true k is trivially
k = t - m (always 1 or 2 in these 6 rows, consistent with "<3") -- the
masking doesn't actually hide anything a reader of the published table
couldn't already reconstruct, so we restore the real value here rather
than storing a misleading literal 0 or nulling a value we can derive
exactly. k_wysokosc (average payout) is NOT masked in these rows even
though k_liczba is -- used as published.
"""

import json
import os

import pandas as pd

OUT_DIR = "../data"
EDITIONS = {
    2025: {
        "file": "../data/Jednorazowe_odszkodowania_w_2025_r._na_płeć_i_powiaty_(1).xlsx",
        "sheet": "JO 2025",
        "header_row": 6,  # 1-indexed row with "Ogółem"/"Mężczyźni"/"Kobiety"
    },
}

COLS = ["Województwo", "Powiat", "TERYT", "t_liczba", "t_wysokosc", "m_liczba", "m_wysokosc", "k_liczba", "k_wysokosc"]


def load_powiat_rows(path, sheet, header_row):
    # dtype=str on the TERYT column specifically -- otherwise pandas
    # re-infers it as float and silently drops the leading zero (confirmed
    # via openpyxl directly: the source cells are already zero-padded
    # strings like "0226", but pd.read_excel's own type inference still
    # converts them to 226.0 without this).
    df = pd.read_excel(path, sheet_name=sheet, skiprows=header_row + 1, header=None, dtype={2: str})
    df = df.iloc[:, :9]
    df.columns = COLS
    df = df[df["TERYT"].notna()].copy()
    df["TERYT"] = df["TERYT"].astype(str).str.strip().str.zfill(4)
    return df


if __name__ == "__main__":
    out = {}
    for year, cfg in EDITIONS.items():
        df = load_powiat_rows(cfg["file"], cfg["sheet"], cfg["header_row"])
        unmasked = 0
        for _, row in df.iterrows():
            teryt = row["TERYT"]
            t_liczba, m_liczba, k_liczba = int(row["t_liczba"]), int(row["m_liczba"]), int(row["k_liczba"])
            if t_liczba != m_liczba + k_liczba:
                real_k = t_liczba - m_liczba
                assert k_liczba == 0 and 0 < real_k < 3, (teryt, t_liczba, m_liczba, k_liczba)
                k_liczba = real_k
                unmasked += 1
            out.setdefault(teryt, {}).setdefault(str(year), {})["default__liczba"] = {
                "t": t_liczba, "m": m_liczba, "k": k_liczba
            }
            out.setdefault(teryt, {}).setdefault(str(year), {})["default__wysokosc_srednia"] = {
                "t": round(float(row["t_wysokosc"]), 2), "m": round(float(row["m_wysokosc"]), 2), "k": round(float(row["k_wysokosc"]), 2)
            }
        print(f"{year}: {len(df)} powiat rows, {unmasked} k_liczba secrecy-masks unmasked via t-m")

    path = os.path.join(OUT_DIR, "jednorazowe_odszkodowania.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"jednorazowe_odszkodowania: {len(out)} regions -> {path}")
