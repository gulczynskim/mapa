"""
Adds two kinds of derived measure, computed from data already fetched --
neither needs its own BDL variable, both patch an existing data/*.json file
in place by adding new "{ageGroup}__{measure}" slices alongside the raw ones.

1. PER_100K: a handful of variables are raw incidence/participation
   headcounts (rapes, suicide attempts, care-facility residents, sports club
   participants, workplace accidents) that only mean something relative to
   the size of whatever population they're drawn from -- a bigger powiat
   naturally has a bigger raw count. Joins against a REFERENCE file's own
   slice (same teryt+year, matched sex-for-sex: k against the reference's k,
   etc.) and adds a sibling measure suffixed "_per100k" = value / reference *
   100 000. Most of these use population_by_age.json's "ogolem__default"
   (the general population) as the reference, but wypadki_przy_pracy uses
   pkd_zatrudnienie.json's "ogolem__default" instead (employed people, not
   general population, is the right denominator for a workplace-accident
   rate) -- the reference file/slice is a per-entry parameter, not hardcoded,
   for exactly this reason. Requires the target and reference variables to
   share a level (both powiat in every case used here).

2. SHARE_OF_WHOLE: a composition variable's ageGroups already sum to a real
   "ogółem" (Wszystkie) total in the SAME file -- no cross-variable join
   needed, just divide each category ageGroup's value by the reference
   ageGroup's value (same measure, same teryt+year, sex-for-sex) and store as
   a new "odsetek" measure. The reference ageGroup itself is included too
   (trivially yields ~100 always) so every ageGroup has a value under the
   new measure, not just the categories -- avoids a confusing "no data" for
   Wszystkie+Odsetek that would otherwise look like a bug.

Run once after regenerating any of the affected files (this OR the variable
it depends on, i.e. re-run after refreshing population_by_age.json too).
"""

import json
import os

OUT_DIR = "../data"

POPULATION_REF = ("population_by_age.json", "ogolem", "default")
PRACUJACY_REF = ("pkd_zatrudnienie.json", "ogolem", "default")

PER_100K = [
    # (data_file, ageGroup, [measure keys to add a "_per100k" sibling for], (reference_file, reference_ageGroup, reference_measure))
    ("zgwalcenia.json", "default", ["default"], POPULATION_REF),
    ("zamachy_samobojcze.json", "default", ["ogolem", "zakonczone_zgonem"], POPULATION_REF),
    ("bezdomnosc_mieszkancy.json", "default", ["default"], POPULATION_REF),
    ("bezdomnosc_bezdomni.json", "default", ["default"], POPULATION_REF),
    ("kluby_sportowe.json", "default", ["default"], POPULATION_REF),
    # Employed people, not general population, is the right denominator for
    # a workplace-accident rate -- see module docstring. pkd_zatrudnienie
    # only has data for 2024-2026 (an annual January snapshot, confirmed in
    # fetch_pkd.py's own docstring), so this measure will show "brak danych"
    # for every wypadki_przy_pracy year outside that overlap (2002-2023).
    ("wypadki_przy_pracy.json", "default", ["default"], PRACUJACY_REF),
]

SHARE_OF_WHOLE = [
    # (data_file, reference ageGroup, [every ageGroup key incl. reference], measure key)
    (
        "stan_cywilny_nsp.json",
        "ogolem",
        ["ogolem", "kawalerowie_panny", "zonaci_zamezne", "wdowcy_wdowy", "rozwiedzeni", "nieustalony"],
        "default",
    ),
    (
        "pkd_zatrudnienie.json",
        "ogolem",
        ["ogolem", *"ABCDEFGHIJKLMNOPQRS"],
        "default",
    ),
    (
        "wyksztalcenie_nsp.json",
        "ogolem",
        [
            "ogolem", "wyzsze", "sr_i_pol_ogolem", "sr_ogolnoksztalcace", "sr_zawodowe",
            "zasadnicze_branzowe", "gimnazjalne", "podstawowe_ukonczone", "podstawowe_niekonczone",
            "nieustalony",
        ],
        "default",
    ),
]


def _divide(numerator, denominator, scale):
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator * scale


def add_per_100k(data_file, age_group, measure_keys, reference):
    reference_file, reference_age_group, reference_measure = reference
    data = json.load(open(os.path.join(OUT_DIR, data_file), encoding="utf-8"))
    reference_data = json.load(open(os.path.join(OUT_DIR, reference_file), encoding="utf-8"))
    reference_key = f"{reference_age_group}__{reference_measure}"

    for teryt, years in data.items():
        reference_years = reference_data.get(teryt, {})
        for year, slices in years.items():
            pop_slice = reference_years.get(year, {}).get(reference_key)
            if not pop_slice:
                continue
            for measure in measure_keys:
                key = f"{age_group}__{measure}"
                if key not in slices:
                    continue
                vals = slices[key]
                slices[f"{age_group}__{measure}_per100k"] = {
                    "t": _divide(vals["t"], pop_slice["t"], 100_000),
                    "m": _divide(vals["m"], pop_slice["m"], 100_000),
                    "k": _divide(vals["k"], pop_slice["k"], 100_000),
                }

    path = os.path.join(OUT_DIR, data_file)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {data_file}: added _per100k for {measure_keys}")


def add_share_of_whole(data_file, reference_age_group, age_groups, measure):
    data = json.load(open(os.path.join(OUT_DIR, data_file), encoding="utf-8"))

    for teryt, years in data.items():
        for year, slices in years.items():
            ref = slices.get(f"{reference_age_group}__{measure}")
            if not ref:
                continue
            for age_group in age_groups:
                key = f"{age_group}__{measure}"
                if key not in slices:
                    continue
                vals = slices[key]
                slices[f"{age_group}__odsetek"] = {
                    "t": _divide(vals["t"], ref["t"], 100),
                    "m": _divide(vals["m"], ref["m"], 100),
                    "k": _divide(vals["k"], ref["k"], 100),
                }

    path = os.path.join(OUT_DIR, data_file)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {data_file}: added odsetek (of {reference_age_group})")


if __name__ == "__main__":
    print("--- per-100k measures ---")
    for data_file, age_group, measure_keys, reference in PER_100K:
        add_per_100k(data_file, age_group, measure_keys, reference)

    print("--- share-of-whole (odsetek) measures ---")
    for data_file, reference_age_group, age_groups, measure in SHARE_OF_WHOLE:
        add_share_of_whole(data_file, reference_age_group, age_groups, measure)
