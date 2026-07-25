"""
One-off export: every VARIABLE_META entry -> one CSV row, for the 2026-07-25
data-quality review. Not part of the regular ETL pipeline, doesn't touch
data/ or variables.js -- read-only like audit_data.py.

Columns: source, BDL group code (topic, e.g. P4251), BDL variable code(s),
description (meaning text), available levels, unit, and one column per
"Widok" (map view) with "X" when that view is disabled for the variable,
empty when available to users.

View availability replicates updateViewAvailability()/hasSexData()/
hasTotalFor() in app.js:
- sexScope: "women" -> only Kobiety available, everything else X.
- hasSexData: empirical, scanned from the actual data file (any non-null m
  or k anywhere), same as app.js's own cached check -- not just assumed from
  the declared ageGroups/measures.
- Ogółem: X only if EVERY ageGroup x measure combination has hasTotal:false
  (a partial restriction, e.g. e8's Mediana only, is noted in the
  description text instead, not spelled out per-cell here).
- % kobiet / % mężczyzn: X unless sharesMeaningful is true.

Usage: python3 build_variable_csv.py   (from anywhere; paths relative to this file)
"""

import csv
import json
import os
import re

from jsobj import extract_const

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VIEW_COLUMNS = [
    ("Kobiety", "women"),
    ("Mężczyźni", "men"),
    ("Ogółem", "total"),
    ("Różnica (K - M)", "diff"),
    ("Proporcja (K / M)", "ratio"),
    ("Proporcja (M / K)", "ratioInverse"),
    ("% kobiet", "shareWomen"),
    ("% mężczyzn", "shareMen"),
]

TOPIC_CODE_RE = re.compile(r"\bP\d{3,4}\b")

# accessNote is free prose (numbers like "10 tys.", "1 klasie", "100 000"
# show up next to real 1-8 digit BDL ids like radni_gminy's "6"/"7"/"8"), so
# a length- or position-based regex can't tell real codes from prose text
# reliably -- hand-curated per variable instead, cross-checked against the
# live BDL API and etl/fetch_*.py during the 2026-07-25 review. Empty string
# for non-BDL sources (CKE, PKW, GUS Excel, BASiW) and for variables whose
# code count is too large to usefully list (accessNote points to the fetch
# script instead; see those entries' meaning/accessNote text in variables.js).
VARIABLE_CODES = {
    "unemployment": "79214 (ogółem), 79215 (mężczyźni), 79216 (kobiety)",
    "labor_force_activity": "1670866/73/80 (15+), 1670867/74/81 (15-24), 1670868/75/82 (25-34), 1670869/76/83 (35-44), 1670870/77/84 (45-54), 1670871/78/85 (55-64), 1670872/79/86 (65+) -- wszystkie ogółem/mężczyźni/kobiety",
    "radni_powiatu": "3094 (ogółem), 3095 (mężczyźni), 3096 (kobiety)",
    "radni_gminy": "6 (ogółem), 7 (mężczyźni), 8 (kobiety)",
    "liceum": "270621/270655 (uczniowie, m/k), 270638/270602 (absolwenci, m/k), 378692/378694 (uczniowie w 1 klasie, m/k)",
    "population_25_34": "1644517/1644518 (ogółem 25-29/30-34), 1644537/1644538 (mężczyźni 25-29/30-34), 1644557/1644558 (kobiety 25-29/30-34)",
    "pkd_zatrudnienie": "756 kodów (12 miesięcy x 20 sekcji x 3 płcie), odkrywane na żywo -- zob. etl/fetch_pkd.py",
    "life_expectancy": "101554/101555 (od urodzenia, m/k), 105836/105837 (15), 105845/105846 (30), 105854/105855 (45), 105863/105864 (60), 101563/101564 (65)",
    "population_by_age": "30 kodów (15 grup wieku x 2 płcie) -- zob. etl/bdl_variables.py",
    "median_age": "746289 (ogółem), 746290 (mężczyźni), 746291 (kobiety)",
    "rolnictwo_pracujacy": "1623387/1623386 (gosp. rolne ogółem, k/m), 1623390/1623389 (gosp. indywidualne, k/m)",
    "rolnictwo_kierujacy": "1623159/1623152 (kierujący, k/m), 1623180/1623173 (użytkownik, k/m)",
    "rolnictwo_uzytkownicy": "1647648 (kobiety), 1647647 (mężczyźni)",
    "szkoly_policealne": "~35 kodów (5 typów szkół x do 3 miar x 2 płcie) -- zob. etl/bdl_variables.py",
    "zasadnicze_zawodowe": "~36 kodów (6 typów szkół x do 3 miar x 2 płcie) -- zob. etl/bdl_variables.py",
    "uczelnie": "377825/377823 (studenci, k/m), 377820/377824 (absolwenci, k/m)",
    "wypadki_przy_pracy": "58357 (kobiety), 58355 (mężczyźni)",
    "kluby_sportowe": "59629 (kobiety), 60313 (mężczyźni)",
    "zamachy_samobojcze": "1365336/1365335 (wszystkie, k/m), 1365341/1365340 (zakończone zgonem, k/m)",
    "wyksztalcenie_nsp": "20 kodów (10 poziomów wykształcenia x 2 płcie) -- zob. etl/bdl_variables.py",
    "stan_cywilny_nsp": "1652569/1652563 (wszystkie, k/m), 1652570/1652564, 1652571/1652565, 1652572/1652566, 1652573/1652567, 1652574/1652568",
    "ludnosc_roczniki_nsp": "1644755 (kobiety), 1644663 (mężczyźni)",
    "gestosc_zaludnienia": "60559",
    "wynagrodzenia": "64428 (przeciętne wynagrodzenie), 64429 (wzgl. średniej krajowej)",
    "bezdomnosc_mieszkancy": "1609986 (kobiety), 1609987 (mężczyźni), 72323 (ogółem)",
    "bezdomnosc_bezdomni": "195855",
    "zgwalcenia": "1749162",
    "fundusz_alimentacyjny": "1728280, 1728281, 1728282, 1728293, 1728294, 1728296",
}


def has_sex_data(file_path):
    if not os.path.exists(file_path):
        return None  # file missing -- flag separately, don't silently say False
    data = json.load(open(file_path, encoding="utf-8"))
    for teryt, years in data.items():
        for year, slices in years.items():
            for slice_key, vals in slices.items():
                if vals.get("m") is not None or vals.get("k") is not None:
                    return True
    return False


def extract_topic_code(access_note):
    m = TOPIC_CODE_RE.search(access_note or "")
    return m.group(0) if m else ""


def extract_variable_codes(varkey):
    return VARIABLE_CODES.get(varkey, "")


def all_slices_no_total(meta):
    age_groups = meta.get("ageGroups", [{"key": "default"}])
    measures = meta.get("measures", [{"key": "default"}])
    for ag in age_groups:
        for ms in measures:
            ag_total = ag.get("hasTotal", True)
            ms_total = ms.get("hasTotal", True)
            if ag_total and ms_total:
                return False  # at least one combination keeps Ogółem
    return True


def view_flags(meta, sex_ok):
    women_only = meta.get("sexScope") == "women"
    shares_ok = bool(meta.get("sharesMeaningful", False))
    total_disabled = women_only or all_slices_no_total(meta)

    flags = {}
    flags["women"] = False if women_only else (not sex_ok)
    for key in ("men", "diff", "ratio", "ratioInverse"):
        flags[key] = women_only or (not sex_ok)
    flags["total"] = total_disabled
    flags["shareWomen"] = not shares_ok
    flags["shareMen"] = not shares_ok
    return flags


def main():
    src = open(f"{ROOT}/variables.js", encoding="utf-8").read()
    meta_all = extract_const(src, "VARIABLE_META")

    rows = []
    warnings = []
    for varkey, meta in meta_all.items():
        file_path = f"{ROOT}/{meta['file']}"
        sex_ok = has_sex_data(file_path)
        if sex_ok is None:
            warnings.append(f"{varkey}: data file not found ({meta['file']}), assumed no sex data")
            sex_ok = False

        flags = view_flags(meta, sex_ok)

        levels = ", ".join(l["label"] for l in meta.get("levels", []))
        access_note = meta.get("accessNote", "")
        row = {
            "zmienna (klucz)": varkey,
            "źródło": meta.get("source", ""),
            "kod podgrupy": extract_topic_code(access_note),
            "kod zmiennej": extract_variable_codes(varkey),
            "opis": meta.get("meaning", ""),
            "dostępne poziomy": levels,
            "jednostka": meta.get("unit", ""),
        }
        for label, key in VIEW_COLUMNS:
            row[label] = "X" if flags[key] else ""
        rows.append(row)

    out_path = f"{ROOT}/data_review_widok.csv"
    fieldnames = ["zmienna (klucz)", "źródło", "kod podgrupy", "kod zmiennej", "opis", "dostępne poziomy", "jednostka"] + [
        c[0] for c in VIEW_COLUMNS
    ]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"wrote {len(rows)} rows -> {out_path}")
    if warnings:
        print("warnings:")
        for w_ in warnings:
            print(" -", w_)


if __name__ == "__main__":
    main()
