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

# 94 individual wiejska->miejsko-wiejska recodes scattered across 1996-2022
# (each gmina promoted to "miasto" status at ITS OWN point, not one dated
# bulletin like the two waves above) -- found 2026-07-28 via a full,
# GENERAL auto-detection pass (not a specific year search): for every
# 6-digit TERYT prefix with both a kind=2 and a kind=3 code present as keys
# in radni_gminy.json, checked for a clean cutover (no year overlap, new
# code's first year = old code's last year + 1) AND an exact councillor-
# count match (t) at that boundary, mirroring the exact validation bar the
# two waves above already used. 107 candidates matched the clean-cutover
# test; only the 94 below ALSO matched the seat-count test -- the other 13
# are NOT included here despite passing the cutover test, because seat
# count is NOT sufficient by itself: one of them (Władysławowo, 2211041->
# 2211043) turned out to be a REAL 2015 boundary change (it lost several
# localities -- Chłapowo, Jastrzębia Góra, Rozewie, Chałupy, Tupadły,
# Karwia, Ostrowo -- which became independent gminy, not a pure status
# relabel), which a blind merge would have silently mismodeled as "same
# geometry throughout." The remaining 12 mismatches are unverified either
# way and need the same kind of individual research before being merged
# OR handled as a real split (see build_gmina_historical_overrides.py).
RECODED_PAIRS_AUTODETECTED_1996_2022 = [
    ("1206142", "1206143"),  # Świątniki Górne
    ("1214022", "1214023"),  # Koszyce
    ("1214032", "1214033"),  # Nowe Brzesko
    ("1204072", "1204073"),  # Szczucin
    ("1216012", "1216013"),  # Ciężkowice
    ("1216052", "1216053"),  # Radłów
    ("1216062", "1216063"),  # Ryglice
    ("1216132", "1216133"),  # Wojnicz
    ("1216142", "1216143"),  # Zakliczyn
    ("1211021", "1211023"),  # Szczawnica
    ("2404122", "2404123"),  # Olsztyn
    ("2405062", "2405063"),  # Sośnicowice
    ("2411032", "2411033"),  # Krzanowice
    ("0804072", "0804073"),  # Otyń
    ("3006012", "3006013"),  # Jaraczewo
    ("3007052", "3007053"),  # Koźminek
    ("3007082", "3007083"),  # Opatówek
    ("3020012", "3020013"),  # Chocz
    ("3020032", "3020033"),  # Dobrzyca
    ("3030032", "3030033"),  # Nekla
    ("3001022", "3001023"),  # Budzyń
    ("3019032", "3019033"),  # Kaczory
    ("3201042", "3201043"),  # Tychowo
    ("3208032", "3208033"),  # Gościno
    ("3209052", "3209053"),  # Mielno
    ("3204072", "3204073"),  # Stepnica
    ("3207012", "3207013"),  # Dziwnów
    ("0210052", "0210053"),  # Olszyna
    ("0202031", "0202033"),  # Pieszyce
    ("0224032", "0224033"),  # Kamieniec Ząbkowicki
    ("0223082", "0223083"),  # Siechnice
    ("1609122", "1609123"),  # Tułowice
    ("0408072", "0408073"),  # Skępe
    ("0411052", "0411053"),  # Piotrków Kujawski
    ("0414082", "0414083"),  # Pruszcz
    ("2211021", "2211023"),  # Jastarnia
    ("2213011", "2213013"),  # Czarna Woda
    ("2815062", "2815063"),  # Miłakowo
    ("2815072", "2815073"),  # Miłomłyn
    ("2817082", "2817083"),  # Wielbark
    ("1008062", "1008063"),  # Lutomiersk
    ("1010112", "1010113"),  # Wolbórz
    ("1018042", "1018043"),  # Lututów
    ("1004062", "1004063"),  # Piątek
    ("1015012", "1015013"),  # Bolimów
    ("2604052", "2604053"),  # Daleszyce
    ("2604072", "2604073"),  # Łagów
    ("2604122", "2604123"),  # Morawica
    ("2604132", "2604133"),  # Nowa Słupia
    ("2604152", "2604153"),  # Pierzchnica
    ("2605042", "2605043"),  # Radoszyce
    ("2601032", "2601033"),  # Nowy Korczyn
    ("2601042", "2601043"),  # Pacanów
    ("2601062", "2601063"),  # Stopnica
    ("2601082", "2601083"),  # Wiślica
    ("2602092", "2602093"),  # Wodzisław
    ("2603042", "2603043"),  # Opatowiec
    ("2606022", "2606023"),  # Iwaniska
    ("2609032", "2609033"),  # Klimontów
    ("2609042", "2609043"),  # Koprzywnica
    ("2612032", "2612033"),  # Oleśnica
    ("0602062", "0602063"),  # Goraj
    ("0603112", "0603113"),  # Siedliszcze
    ("0603152", "0603153"),  # Rejowiec
    ("0606042", "0606043"),  # Izbica
    ("0618052", "0618053"),  # Lubycza Królewska
    ("0618062", "0618063"),  # Łaszczów
    ("0618122", "0618123"),  # Tyszowce
    ("0608052", "0608053"),  # Kamionka
    ("0605062", "0605063"),  # Modliborzyce
    ("0607082", "0607083"),  # Urzędów
    ("0612022", "0612023"),  # Józefów nad Wisłą
    ("1805052", "1805053"),  # Kołaczyce
    ("1804072", "1804073"),  # Pruchnik
    ("1809052", "1809053"),  # Narol
    ("1813022", "1813023"),  # Dubiecko
    ("1803022", "1803023"),  # Brzostek
    ("1811072", "1811073"),  # Przecław
    ("1818052", "1818053"),  # Zaklików
    ("2002072", "2002073"),  # Michałowo
    ("2011042", "2011043"),  # Krynki
    ("2011092", "2011093"),  # Suchowola
    ("2013032", "2013033"),  # Czyżew
    ("2013092", "2013093"),  # Szepietowo
    ("1412042", "1412043"),  # Cegłów
    ("1412072", "1412073"),  # Halinów
    ("1412122", "1412123"),  # Mrozy
    ("1420082", "1420083"),  # Nowe Miasto
    ("1420112", "1420113"),  # Sochocin
    ("1437032", "1437033"),  # Lubowidz
    ("1409062", "1409063"),  # Solec nad Wisłą
    ("1425062", "1425063"),  # Jedlnia-Letnisko
    ("1404042", "1404043"),  # Sanniki
    ("1438052", "1438053"),  # Wiskitki
]

# The 3 REAL powiat/voivodeship reassignments already trusted and used by
# pkw_prepare_merge.py's GMINA_REMAP_6DIGIT (Szerzyny/Rejowiec/Tarczyn --
# see that file's own comments for the underlying real-world event), applied
# there to PKW's 6-digit scheme but NEVER to radni_gminy.json's native
# 7-digit codes until now (found 2026-07-28 during the same audit as the 94
# above -- these 3 aren't a type-digit recode, geometry didn't change, just
# which powiat/voivodeship the gmina is administratively grouped under, so
# the "same geometry, just merge the data" mechanism still applies). Clean
# cutovers, seat-count (t) matches exactly for Szerzyny/Tarczyn; Rejowiec's
# t also matches exactly at its 2006 cutover (only the elected m/k split
# differs, expected since 2006 was a real election year, not evidence of a
# boundary change).
RECODED_PAIRS_KNOWN_REASSIGNMENTS = [
    ("1805102", "1216162"),  # Szerzyny: changed voivodship in 2003
    ("0606082", "0603153"),  # Rejowiec: changed poviat in 2006
    ("1406102", "1418063"),  # Tarczyn: changed poviat in 2006
]

# 10 of the 13 seat-count MISMATCHES from the auto-detection pass above,
# individually researched 2026-07-28 and confirmed to be pure "nadanie praw
# miejskich" status changes with no boundary/territory change found for
# that specific gmina (each search explicitly turned up no boundary
# mention, unlike Władysławowo). The seat-count blip at each cutover is a
# normal between-election-cycle recalculation, not evidence of a real
# geometry change.
RECODED_PAIRS_VERIFIED_STATUS_ONLY = [
    ("1205032", "1205033"),  # Bobowa: city rights restored 2009-01-01
    ("1202032", "1202033"),  # Czchów
    ("0220022", "0220023"),  # Prusice: city rights 2000-01-01
    ("1609102", "1609103"),  # Prószków: city status 2004
    ("2817042", "2817043"),  # Pasym: city rights restored 1997-01-01
    ("1006102", "1006103"),  # Rzgów: city rights restored 2006-01-01
    ("2602032", "2602033"),  # Małogoszcz: city rights restored 1995/1996
    ("0607022", "0607023"),  # Annopol: city rights restored 1996-01-01
    ("1420042", "1420043"),  # Czerwińsk nad Wisłą: city status 2020-01-01, wiejska->miejsko-wiejska
    ("1429052", "1429053"),  # Kosów Lacki: city rights restored 2000-01-01
]
# The other 3 mismatches are deliberately NOT merged:
# - Władysławowo (2211041->2211043): confirmed REAL 2015 boundary change
#   (lost several localities to newly-independent gminy) -- see comment
#   near RECODED_PAIRS_AUTODETECTED_1996_2022 above.
# - Szydłów (2612082->2612083) and Boguchwała (1816032->1816033): city
#   status changes confirmed (2019 and 2008 respectively), but research
#   couldn't rule out a boundary change either way for these two
#   specifically -- Szydłów's own 2019 wave was reported to include
#   boundary shifts for SOME of that wave's municipalities (unclear if
#   Szydłów itself), and Boguchwała's seat-count swing (21->18) is the
#   second-largest of the whole batch after Władysławowo's. Held out
#   pending more specific research rather than risk a second wrong merge.

ALL_RECODED_PAIRS = (
    RECODED_PAIRS_2023_MIEJSKA_RECLASSIFY
    + RECODED_PAIRS_2024_WIEJSKA_TO_MIEJSKO_WIEJSKA
    + RECODED_PAIRS_AUTODETECTED_1996_2022
    + RECODED_PAIRS_KNOWN_REASSIGNMENTS
    + RECODED_PAIRS_VERIFIED_STATUS_ONLY
)

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
