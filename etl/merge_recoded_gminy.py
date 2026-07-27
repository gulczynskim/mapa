"""
Fixes gminy whose TERYT type digit was reclassified without any real
boundary change -- same geometry throughout, only the code's last digit
changes (1=miejska, 2=wiejska, 3=miejsko-wiejska whole gmina, 4/5=miasto/
obszar-wiejski sub-parts of a type-3 gmina). Two separate, unrelated real-
world events found so far, kept as two distinct lists below since they
have different causes and were discovered in different audits -- don't
merge them into one list, a future third wave needs its own documented
list the same way.

Without this fix, any data reported under a NEW code that data/gminy.json
doesn't have (it's a GUGiK PRG snapshot from 2022-06-27, so it predates
both waves) has no matching polygon and rendered as "brak danych".

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

Run once. Safe to re-run (a pair with no old-code data left, and a
boundary already on the new code, is a no-op for that pair).
"""

import json

DATA_DIR = "../data"
GMINY_FILE = f"{DATA_DIR}/gminy.json"

# (old kind=2 "miejska" teryt, new kind=3 "miejsko-wiejska" teryt) for BDL's
# 2023 reporting year -- verified live against BDL's own unit hierarchy
# (e.g. Jeżów: 051011521042 kind=2 -> 051011521043 kind=3, with 044/045
# "miasto"/"obszar wiejski" sub-parts). Council size is identical in the
# last old year and first new year for every one of the 15 (e.g. Jeżów: 15
# seats, 10M/5K, both 2022 and 2023), confirming a pure code relabeling.
# Checked all of data/*.json for either code (2026-07-27): only
# radni_gminy.json actually had old-code-only years needing a merge --
# wybory_rady_gmin.json/wybory_wojtowie.json already stored every election
# year (even pre-2023 ones) under the NEW code, since that source project
# does its own gmina TERYT crosswalk and had already normalized.
RECODED_PAIRS_2023_MIEJSKA_RECLASSIFY = [
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

# (old kind=2 "wiejska" teryt, new kind=3 "miejsko-wiejska" teryt), effective
# 2024-01-01 -- a national wave of village-to-town promotions ("nadanie praw
# miejskich", Rada Ministrów rozporządzenie 2023-07-31), each one flipping
# its home gmina from a plain rural gmina to an urban-rural one. Found via a
# full audit of radni_gminy.json/wybory_rady_gmin.json/wybory_wojtowie.json
# against data/gminy.json (2026-07-27) -- confirmed via clean, non-
# overlapping year cutovers at exactly the 2023/2024 boundary in every one
# of the 41, and independently corroborated against public reporting (e.g.
# Bobrowniki/Gąsawa/Kikół were 3 of "34 new cities" effective that date).
# Impact before this fix: radni_gminy.json showed a gap for just 2024-2025
# for these 41 (old code has 1995-2023, new code has 2024-2025); the two
# election files showed a COMPLETE blackout for every year (their PKW
# source had already normalized ALL history, even pre-2024 elections, onto
# the new code -- so the old code has no data there at all, and merging
# is a no-op for those two files, same as the 2023 wave above).
RECODED_PAIRS_2024_WIEJSKA_TO_MIEJSKO_WIEJSKA = [
    ("0408022", "0408023"),  # Bobrowniki
    ("0408052", "0408053"),  # Kikół
    ("0419022", "0419023"),  # Gąsawa
    ("0601112", "0601113"),  # Piszczac
    ("0602142", "0602143"),  # Turobin
    ("0614052", "0614053"),  # Końskowola
    ("0614062", "0614063"),  # Kurów
    ("0614102", "0614103"),  # Wąwolnica
    ("0615032", "0615033"),  # Czemierniki
    ("0811032", "0811033"),  # Brody
    ("1004042", "1004043"),  # Grabów
    ("1005052", "1005053"),  # Kiernozia
    ("1007012", "1007013"),  # Białaczów
    ("1007082", "1007083"),  # Żarnów
    ("1016052", "1016053"),  # Inowłódz
    ("1017052", "1017053"),  # Osjaków
    ("1018012", "1018013"),  # Bolesławiec
    ("1020072", "1020073"),  # Parzęczew
    ("1403072", "1403073"),  # Maciejowice
    ("1407022", "1407023"),  # Głowaczów
    ("1407062", "1407063"),  # Magnuszew
    ("1409022", "1409023"),  # Ciepielów
    ("1409052", "1409053"),  # Sienno
    ("1412062", "1412063"),  # Dobre
    ("1412132", "1412133"),  # Siennica
    ("1417062", "1417063"),  # Osieck
    ("1423022", "1423023"),  # Gielniów
    ("1423042", "1423043"),  # Odrzywół
    ("1425092", "1425093"),  # Przytyk
    ("1436012", "1436013"),  # Kazanów
    ("1605032", "1605033"),  # Strzeleczki
    ("1813012", "1813013"),  # Bircza
    ("1814042", "1814043"),  # Jawornik Polski
    ("2212062", "2212063"),  # Kobylnica
    ("2404142", "2404143"),  # Przyrów
    ("2602082", "2602083"),  # Sobków
    ("2605022", "2605023"),  # Gowarczów
    ("2612012", "2612013"),  # Bogoria
    ("3008062", "3008063"),  # Rychtal
    ("3025052", "3025053"),  # Zaniemyśl
    ("3028042", "3028043"),  # Mieścisko
]

ALL_RECODED_PAIRS = RECODED_PAIRS_2023_MIEJSKA_RECLASSIFY + RECODED_PAIRS_2024_WIEJSKA_TO_MIEJSKO_WIEJSKA

VARIABLE_FILES = [
    "radni_gminy.json",
    "wybory_rady_gmin.json",
    "wybory_wojtowie.json",
]


def merge_variable_file(path, pairs):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return
    if not isinstance(d, dict):
        return
    changed = False
    for old, new in pairs:
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


def update_gminy_boundaries(pairs):
    d = json.load(open(GMINY_FILE, encoding="utf-8"))
    by_teryt = {f["properties"]["JPT_KOD_JE"]: f for f in d["features"]}
    updated = 0
    for old, new in pairs:
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
        merge_variable_file(f"{DATA_DIR}/{fname}", ALL_RECODED_PAIRS)
    print("Updating gminy.json to use current TERYT codes...")
    update_gminy_boundaries(ALL_RECODED_PAIRS)
