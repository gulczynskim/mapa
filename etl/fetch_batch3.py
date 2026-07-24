"""
Third variable batch, chosen 2026-07-24 directly from BDL subject IDs the
user already knew they wanted (not discovered via the subject-catalog sweep
fetch_batch2.py used) -- P2497 (wages, replacing the old dochody_gmina/
dochody_powiat), P1799/G267 (residential social care -- homelessness),
P4601 (rape, established-crimes count), P4451 (alimony fund).

None of these are sex-disaggregated except bezdomnosc_mieszkancy -- for
everything else BDL simply doesn't publish a k/m split, so `t` is the only
populated field (m/k stay null), which already makes updateViewAvailability()
disable every sex-based view and leave only "Ogółem" selectable -- no new
frontend mechanism needed for that (unlike the mammografia/cytologia
variables' sexScope, which needs the OPPOSITE: force Kobiety-only).
"""

import json
import os

from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"
POWIAT = 5


def fetch_multi_single(level, measure_ids):
    """measure_ids: {measureKey: variable_id}. Each measure is its own
    non-gendered single value -- output keys as f"default__{measureKey}"."""
    out = {}
    for measure_key, var_id in measure_ids.items():
        raw = fetch_variable_data(var_id, unit_level=level)
        for row in flatten("t", raw):
            teryt = unit_id_to_teryt(row["unit_id"], level=level)
            year = str(row["year"])
            out.setdefault(teryt, {}).setdefault(year, {})[f"default__{measure_key}"] = {
                "t": row["value"],
                "m": None,
                "k": None,
            }
    return out


def fetch_single(level, variable_id):
    raw = fetch_variable_data(variable_id, unit_level=level)
    out = {}
    for row in flatten("t", raw):
        teryt = unit_id_to_teryt(row["unit_id"], level=level)
        year = str(row["year"])
        out.setdefault(teryt, {}).setdefault(year, {})["default__default"] = {"t": row["value"], "m": None, "k": None}
    return out


def fetch_gendered_single_slice(level, ids):
    """ids: {"k": id, "m": id, "og": id}. One ageGroup/measure ("default__default")."""
    rows_by_sex = {}
    for sex in ("k", "m"):
        rows_by_sex[sex] = flatten(sex, fetch_variable_data(ids[sex], unit_level=level))
    og_rows = flatten("og", fetch_variable_data(ids["og"], unit_level=level)) if ids.get("og") else []

    import pandas as pd

    all_rows = rows_by_sex["k"] + rows_by_sex["m"] + og_rows
    df = pd.DataFrame(all_rows)
    df["teryt"] = df["unit_id"].apply(lambda u: unit_id_to_teryt(u, level=level))
    out = {}
    for (teryt, year), g in df.groupby(["teryt", "year"]):
        vals = dict(zip(g["variable_id"], g["value"]))
        k, m, t = vals.get("k"), vals.get("m"), vals.get("og")
        if t is None and m is not None and k is not None:
            t = m + k
        out.setdefault(teryt, {}).setdefault(str(int(year)), {})["default__default"] = {"t": t, "m": m, "k": k}
    return out


if __name__ == "__main__":
    print("--- Wynagrodzenia (P2497), powiat ---")
    data = fetch_multi_single(POWIAT, {"default": "64428", "relative": "64429"})
    path = os.path.join(OUT_DIR, "wynagrodzenia.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(data)} regions -> {path}")

    print("--- Mieszkańcy placówek opieki wg płci (P1799), powiat ---")
    data = fetch_gendered_single_slice(POWIAT, {"k": "1609986", "m": "1609987", "og": "72323"})
    path = os.path.join(OUT_DIR, "bezdomnosc_mieszkancy.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(data)} regions -> {path}")

    print("--- Bezdomni w placówkach opieki (P1799), powiat ---")
    data = fetch_single(POWIAT, "195855")
    path = os.path.join(OUT_DIR, "bezdomnosc_bezdomni.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(data)} regions -> {path}")

    print("--- Zgwałcenia -- przestępstwa stwierdzone (P4601), powiat ---")
    data = fetch_single(POWIAT, "1749162")
    path = os.path.join(OUT_DIR, "zgwalcenia.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(data)} regions -> {path}")

    print("--- Fundusz alimentacyjny (P4451), powiat ---")
    data = fetch_multi_single(
        POWIAT,
        {
            "recipients_per10k": "1728280",
            "recipients": "1728281",
            "debtors_per100k": "1728282",
            "debtors_evasion": "1728293",
            "recovered_share": "1728294",
            "spent_total": "1728296",
        },
    )
    path = os.path.join(OUT_DIR, "fundusz_alimentacyjny.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(data)} regions -> {path}")
