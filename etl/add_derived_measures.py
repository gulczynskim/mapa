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
   a new measure (usually "odsetek", but see pkd_zatrudnienie below). The
   reference ageGroup itself is included too (trivially yields ~100 always)
   so every ageGroup has a value under the new measure, not just the
   categories -- avoids a confusing "no data" for Wszystkie+Odsetek that
   would otherwise look like a bug.

   pkd_zatrudnienie folds MONTH into the measure key instead of adding a
   whole new dimension (see fetch_pkd.py) -- "01_default".."12_default" for
   the raw count, so its share-of-whole needs one call per month, each
   producing "{month}_odsetek" (not a single "odsetek" measure).

Run once after regenerating any of the affected files (this OR the variable
it depends on, i.e. re-run after refreshing population_by_age.json too).
"""

import json
import os

OUT_DIR = "../data"

POPULATION_REF = ("population_by_age.json", "ogolem", "default")
# June specifically, not the full year -- user's explicit choice, a mid-year
# snapshot rather than January (which happened to be all this project used
# to fetch before pkd_zatrudnienie went monthly) or an average across months.
PRACUJACY_JUNE_REF = ("pkd_zatrudnienie.json", "ogolem", "06_default")

PER_100K = [
    # (data_file, ageGroup, [measure keys to add a "_per100k" sibling for], (reference_file, reference_ageGroup, reference_measure))
    ("zgwalcenia.json", "default", ["default"], POPULATION_REF),
    ("zamachy_samobojcze.json", "default", ["ogolem", "zakonczone_zgonem"], POPULATION_REF),
    ("bezdomnosc_mieszkancy.json", "default", ["default"], POPULATION_REF),
    ("bezdomnosc_bezdomni.json", "default", ["default"], POPULATION_REF),
    ("kluby_sportowe.json", "default", ["default"], POPULATION_REF),
    # Employed people, not general population, is the right denominator for
    # a workplace-accident rate -- see module docstring.
    ("wypadki_przy_pracy.json", "default", ["default"], PRACUJACY_JUNE_REF),
]

# Absencja chorobowa per employed person -- scale 1, not 100 000: "ile dni
# zwolnienia przypada na jednego pracującego" is directly readable (roughly
# 10-25 days), where a per-100k version would not be.
#
# December, not the June used by wypadki_przy_pracy above: pkd_zatrudnienie
# only carries December for 2022 and 2023 (every month exists from 2024 on),
# so June would restrict these two measures to 2024 alone while December
# gives 2022-2024. Absencje itself starts in 2017, so 2017-2021 have no
# employment denominator at all in this project yet and stay empty -- see
# the variable's own description. Swapping in a longer annual "pracujący"
# series here is the one change needed to fill them.
PRACUJACY_DEC_REF = ("pkd_zatrudnienie.json", "ogolem", "12_default")

ABSENCJE_AGE_GROUPS = [
    "ogolem_bez_ciazy", "ogolem", "zakazne", "nowotwory", "krwi", "wydzielania", "psychiczne",
    "nerwowy", "oko", "ucho", "krazenie", "oddechowy", "pokarmowy", "skora",
    "miesniowo_szkieletowy", "moczowo_plciowy", "ciaza", "okoloporodowe", "wady_wrodzone",
    "objawy", "urazy", "przyczyny_zewnetrzne", "czynniki_zdrowotne", "cele_specjalne",
]

PER_EMPLOYED = [
    ("absencje.json", age_group, ["dni", "zaswiadczenia"], PRACUJACY_DEC_REF)
    for age_group in ABSENCJE_AGE_GROUPS
]

SHARE_OF_WHOLE = [
    # (data_file, reference ageGroup, [every ageGroup key incl. reference], measure key, new measure key)
    (
        "stan_cywilny_nsp.json",
        "ogolem",
        ["ogolem", "kawalerowie_panny", "zonaci_zamezne", "wdowcy_wdowy", "rozwiedzeni", "nieustalony"],
        "default",
        "odsetek",
    ),
    *(
        (
            "pkd_zatrudnienie.json",
            "ogolem",
            ["ogolem", *"ABCDEFGHIJKLMNOPQRS"],
            f"{month}_default",
            f"{month}_odsetek",
        )
        for month in (f"{m:02d}" for m in range(1, 13))
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
        "odsetek",
    ),
]


def _divide(numerator, denominator, scale):
    """Safe `numerator / denominator * scale`: None if either input is
    missing or the denominator is zero, instead of raising or returning a
    misleading 0."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator * scale


def add_per_100k(data_file, age_group, measure_keys, reference, scale=100_000, suffix="_per100k"):
    """For each measure in `measure_keys` under `age_group` in `data_file`,
    joins against `reference`'s own {teryt, year} slice (same sex-for-sex)
    and adds a new "..._per100k" sibling measure, then overwrites
    `data_file` in place.

    `scale`/`suffix` cover the per-ONE-person case as well (absencje's
    "na 1 pracującego", scale=1) -- same join, same sex-for-sex matching,
    only the multiplier and the measure-key suffix differ. Sex-for-sex is
    what makes these worth having here: women's absence days over women's
    employment, so the result isn't reading off where women are employed at
    all, the way the raw day counts partly do."""
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
                slices[f"{age_group}__{measure}{suffix}"] = {
                    "t": _divide(vals["t"], pop_slice["t"], scale),
                    "m": _divide(vals["m"], pop_slice["m"], scale),
                    "k": _divide(vals["k"], pop_slice["k"], scale),
                }

    path = os.path.join(OUT_DIR, data_file)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {data_file}: added {suffix} for {measure_keys}")


def add_share_of_whole(data_file, reference_age_group, age_groups, measure, new_measure):
    """For each ageGroup in `age_groups`, divides its `measure` value by
    `reference_age_group`'s own value for the same {teryt, year, sex} and
    stores the result (as a percentage) under `new_measure`, then overwrites
    `data_file` in place."""
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
                slices[f"{age_group}__{new_measure}"] = {
                    "t": _divide(vals["t"], ref["t"], 100),
                    "m": _divide(vals["m"], ref["m"], 100),
                    "k": _divide(vals["k"], ref["k"], 100),
                }

    path = os.path.join(OUT_DIR, data_file)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {data_file}: added {new_measure} (of {reference_age_group}/{measure})")


if __name__ == "__main__":
    print("--- per-100k measures ---")
    for data_file, age_group, measure_keys, reference in PER_100K:
        add_per_100k(data_file, age_group, measure_keys, reference)

    print("--- per-employed-person measures ---")
    for data_file, age_group, measure_keys, reference in PER_EMPLOYED:
        add_per_100k(data_file, age_group, measure_keys, reference, scale=1, suffix="_na_pracujacego")

    print("--- share-of-whole (odsetek) measures ---")
    for data_file, reference_age_group, age_groups, measure, new_measure in SHARE_OF_WHOLE:
        add_share_of_whole(data_file, reference_age_group, age_groups, measure, new_measure)
