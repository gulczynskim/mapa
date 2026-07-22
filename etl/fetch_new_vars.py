"""
Pulls the second batch of BDL variables (chosen 2026-07-20): radni powiatu,
radni gminy, liceum pupils/graduates, population 25-34. Life expectancy is
handled separately (convert_life_expectancy.py) since its dimension shape
(age threshold) doesn't fit the simple sex-only pattern here.

Radni gminy pulls at gmina level even though the frontend can't render it
yet -- data is cheap to have ready, rendering is a separate boundary task.
"""

import json
import os

import pandas as pd
from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"


def resolve_gmina_teryt(unit_id, unit_name):
    """unit_id_to_teryt's positional slicing assumes standard post-2002 gmina
    unit_ids -- it was never meant for BDL's separate pre-2002 "Warszawa"
    legacy block (confirmed live: e.g. id 071412831041 named "Warszawa -
    Centrum do 2001"), which it silently mis-decodes into fake-looking but
    plausible 7-digit codes sharing an "1431..." prefix. Those aren't real
    TERYT gminas; the block mixes one citywide-total row with individual
    (now nonexistent) dzielnica rows at the same nominal level.

    The citywide row ("M.st.Warszawa do <year>") is the direct predecessor
    of today's single Warszawa gmina (1465011, confirmed continuous from
    2002 onward in this same BDL variable) -- remapped there. The dzielnica/
    union/undetermined rows have no current single-gmina equivalent and are
    dropped, matching the "exclude Warsaw's district races entirely, don't
    roll them up" convention already used for the PKW election data.
    """
    if unit_name and unit_name.startswith("M.st.Warszawa do "):
        return "1465011"
    if unit_name and (
        unit_name.startswith("Warszawa - ")
        or unit_name.startswith("Związek gmin dzielnic Warszawy")
        or unit_name.startswith("GMINY-DZIELNICY WARSZAWY")
    ):
        return None
    return unit_id_to_teryt(unit_id, level=6)


def fetch_sex_slice(ids, level):
    """ids: {'t': var_id, 'm': var_id, 'k': var_id} (t optional). Returns {teryt: {year: {t,m,k}}}."""
    all_rows = []
    for sex, var_id in ids.items():
        raw = fetch_variable_data(var_id, unit_level=level)
        all_rows.extend(flatten(sex, raw))

    df = pd.DataFrame(all_rows)
    if level == 6:
        df["teryt"] = df.apply(lambda r: resolve_gmina_teryt(r["unit_id"], r["unit_name"]), axis=1)
        df = df[df["teryt"].notna()]
    else:
        df["teryt"] = df["unit_id"].apply(lambda u: unit_id_to_teryt(u, level=level))

    out = {}
    for (teryt, year), g in df.groupby(["teryt", "year"]):
        vals = dict(zip(g["variable_id"], g["value"]))
        m = vals.get("m")
        k = vals.get("k")
        t = vals.get("t")
        if t is None and m is not None and k is not None:
            t = m + k  # counts: total = sum of parts (valid here, unlike rates)
        out.setdefault(teryt, {})[str(int(year))] = {"t": t, "m": m, "k": k}
    return out


def pull_sex_variable(name, ids, level):
    """Single-measure variable: writes {teryt: {year: {"default__default": {t,m,k}}}}."""
    slice_data = fetch_sex_slice(ids, level)
    out = {teryt: {year: {"default__default": vals} for year, vals in years.items()} for teryt, years in slice_data.items()}
    path = os.path.join(OUT_DIR, f"{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {len(out)} regions -> {path}")


if __name__ == "__main__":
    print("--- Radni powiatu (P1317) ---")
    pull_sex_variable("radni_powiatu", {"t": "3094", "m": "3095", "k": "3096"}, level=5)

    print("--- Radni gminy (P1312) -- data ready, NOT wired into frontend (no gmina boundaries yet) ---")
    pull_sex_variable("radni_gminy", {"t": "6", "m": "7", "k": "8"}, level=6)

    print("--- Liceum: uczniowie (270621 m / 270655 k) + absolwenci (270638 m / 270602 k) -> one variable, two measures ---")
    uczniowie = fetch_sex_slice({"m": "270621", "k": "270655"}, level=5)
    absolwenci = fetch_sex_slice({"m": "270638", "k": "270602"}, level=5)
    liceum_out = {}
    for teryt, years in uczniowie.items():
        for year, vals in years.items():
            liceum_out.setdefault(teryt, {}).setdefault(year, {})["default__uczniowie"] = vals
    for teryt, years in absolwenci.items():
        for year, vals in years.items():
            liceum_out.setdefault(teryt, {}).setdefault(year, {})["default__absolwenci"] = vals
    liceum_path = os.path.join(OUT_DIR, "liceum.json")
    with open(liceum_path, "w", encoding="utf-8") as f:
        json.dump(liceum_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"liceum: {len(liceum_out)} regions -> {liceum_path}")

    print("--- Population 25-34 (P4253, NSP 2021): sum of 25-29 + 30-34 bands ---")
    all_rows = []
    ids = {"m_2529": "1644517", "m_3034": "1644518", "k_2529": "1644537", "k_3034": "1644538"}
    for label, var_id in ids.items():
        raw = fetch_variable_data(var_id, unit_level=5)
        all_rows.extend(flatten(label, raw))
    df = pd.DataFrame(all_rows)
    df["teryt"] = df["unit_id"].apply(unit_id_to_teryt)
    out = {}
    for (teryt, year), g in df.groupby(["teryt", "year"]):
        vals = dict(zip(g["variable_id"], g["value"]))
        m = (vals.get("m_2529") or 0) + (vals.get("m_3034") or 0)
        k = (vals.get("k_2529") or 0) + (vals.get("k_3034") or 0)
        out.setdefault(teryt, {})[str(int(year))] = {"default__default": {"t": m + k, "m": m, "k": k}}
    path = os.path.join(OUT_DIR, "population_25_34.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"population_25_34: {len(out)} regions -> {path}")
