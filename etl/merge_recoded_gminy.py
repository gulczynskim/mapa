"""
Fixes 15 gminy that were reclassified from "gmina miejska" (kind=2) to
"gmina miejsko-wiejska" (kind=3) for BDL's 2023 reporting year, confirmed
live against BDL's own unit hierarchy (e.g. Jeżów: 051011521042 kind=2 ->
051011521043 kind=3, with 044/045 "miasto"/"obszar wiejski" sub-parts) --
council size is identical in the last old year and first new year for
every one of the 15 (e.g. Jeżów: 15 seats, 10M/5K, both 2022 and 2023), so
this is a pure code relabeling, not a real boundary change or merger.

Without this fix, any 2023+ data reported under the new code (radni_gminy
from 2023 on, wybory_rady_gmin's 2024 election) has no matching polygon in
data/gminy.json (which -- before this script -- still carried the OLD
code from GUGiK PRG's 2022-06-27 snapshot, predating the reclassification)
and rendered as "brak danych" for these 15 gminy specifically.

Rather than threading "which code was valid in which year" awareness
through every app.js function that reads loadedData by teryt (mapValueFor,
updateRankings, the CSV export, the correlation panel each do their own
lookup) -- this merges each affected variable's OLD-code year-data into
the NEW code's entry once, at the data layer, and deletes the old key.
One real TERYT per gmina, one merge, and every consumer in app.js works
unmodified -- no runtime override needed (unlike the split/merge cases in
build_gmina_historical_overrides.py, which genuinely need a different
geometry per year; this is the same geometry throughout, only the key
changes).

Checked all of data/*.json for either code (2026-07-27): only
radni_gminy.json actually has old-code-only years needing a merge.
wybory_rady_gmin.json/wybory_wojtowie.json already store every election
year (even pre-2023 ones) under the NEW code -- that source project does
its own gmina TERYT crosswalk and had already normalized to current TERYT
before this was ever an issue here.

Run once. Safe to re-run (a pair with no old-code data left is a no-op).
"""

import json

DATA_DIR = "../data"
GMINY_FILE = f"{DATA_DIR}/gminy.json"

# (old kind=2 teryt, new kind=3 teryt) -- verified live against BDL's unit
# hierarchy for all 15, and cross-checked that old's last data year (2022)
# and new's first data year (2023) never overlap in any affected variable.
RECODED_PAIRS = [
    ("1208042", "1208043"),  # Książ Wielki
    ("1211032", "1211033"),  # Czarny Dunajec
    ("2416092", "2416093"),  # Włodowice
    ("3019052", "3019053"),  # Miasteczko Krajeńskie
    ("0218032", "0218033"),  # Miękinia
    ("1021042", "1021043"),  # Jeżów
    ("1010082", "1010083"),  # Rozprza
    ("1016102", "1016103"),  # Ujazd
    ("1002032", "1002033"),  # Dąbrowice
    ("2604082", "2604083"),  # Łopuszno
    ("2604142", "2604143"),  # Piekoszów
    ("1412102", "1412103"),  # Latowicz
    ("1434062", "1434063"),  # Jadów
    ("1430022", "1430023"),  # Jastrząb
    ("1419022", "1419023"),  # Bodzanów
]

VARIABLE_FILES = [
    "radni_gminy.json",
    "wybory_rady_gmin.json",
    "wybory_wojtowie.json",
]


def merge_variable_file(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return
    if not isinstance(d, dict):
        return
    changed = False
    for old, new in RECODED_PAIRS:
        if old not in d:
            continue
        old_years = d.pop(old)
        overlap = set(old_years) & set(d.get(new, {}))
        if overlap:
            raise ValueError(f"{path}: {old}/{new} share year(s) {overlap} -- not a clean pre/post split, needs manual review")
        d.setdefault(new, {}).update(old_years)
        changed = True
        print(f"  {path}: merged {old} -> {new} ({len(old_years)} year(s))")
    if changed:
        json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False)


def update_gminy_boundaries():
    d = json.load(open(GMINY_FILE, encoding="utf-8"))
    by_teryt = {f["properties"]["JPT_KOD_JE"]: f for f in d["features"]}
    updated = 0
    for old, new in RECODED_PAIRS:
        if old in by_teryt and new not in by_teryt:
            by_teryt[old]["properties"]["JPT_KOD_JE"] = new
            updated += 1
        elif new in by_teryt:
            continue  # already migrated
        else:
            print(f"  WARNING: neither {old} nor {new} found in {GMINY_FILE}")
    d["features"] = list(by_teryt.values())
    json.dump(d, open(GMINY_FILE, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"  {GMINY_FILE}: updated {updated} polygon(s) to their current TERYT")


if __name__ == "__main__":
    print("Merging recoded gminy's old-code data into their current TERYT...")
    for fname in VARIABLE_FILES:
        merge_variable_file(f"{DATA_DIR}/{fname}")
    print("Updating gminy.json to use current TERYT codes...")
    update_gminy_boundaries()
