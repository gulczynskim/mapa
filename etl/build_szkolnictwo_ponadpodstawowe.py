"""
Finishes data/szkolnictwo_ponadpodstawowe.json after fetch_bdl.py has fetched
its 5 BDL-sourced ageGroups (technika, artystyczne_dajace_uprawnienia,
branzowe_I_st, licea_profilowane, artystyczne_niedajace_uprawnien -- see
bdl_variables.py). Two more ageGroups are folded in from OTHER already-
fetched files rather than re-fetched from BDL (licea ogolnoksztalcace and
zasadnicze zawodowe both already exist as their own variables/files), then
two derived measures are computed:

1. "razem" ageGroup: uczniowie/uczniowie_1_klasa/absolwenci summed across
   licea_ogolnoksztalcace + technika + branzowe_I_st + licea_profilowane +
   zasadnicze_zawodowe -- deliberately EXCLUDES artystyczne_niedajace_uprawnien
   (not a vocational track) and szkoly_policealne (a different, post-secondary
   variable entirely). "technika" here is BROADENED to include
   artystyczne_dajace_uprawnienia (per user decision 2026-07: kept as its own
   separate, directly-viewable ageGroup, but folded into every sum/share
   wherever "technika" is one of the terms) -- confirmed live that BDL's own
   ready-made "technika wraz z ogolnoksztalcacymi artystycznymi" total (P3480,
   no sex breakdown) is exactly technika + artystyczne_dajace_uprawnienia
   (710241 + 14476 = 724717 vs BDL's own 725616 nationally for 2022, a 0.1%
   residual -- confirms this is a real combination, not just alternate
   naming for the same underlying variable).

   Not every type existed in every year (confirmed live: zasadnicze zawodowe
   2004-2019, branzowe I st. 2017-2024 -- they hand off around the 2017
   reform; licea profilowane only 2004-2014) -- a missing type zero-fills
   PER SEX (k and m independently, not derived from t) UNLESS every single
   contributing type is missing for that teryt+year, in which case the total
   itself stays null rather than a false 0.

2. "_udzial" measure, added only for technika/licea_ogolnoksztalcace/
   branzowe_I_st: each one's share of the combined (licea_ogolnoksztalcace +
   technika[+artystyczne_dajace_uprawnienia] + branzowe_I_st) total, per sex.
   Deliberately a NEW suffix, not "_odsetek" -- that suffix already means
   something else (composition-of-a-whole with %kobiet/%mężczyzn still
   meaningful, see stan_cywilny_nsp/pkd_zatrudnienie) -- isRateMeasure-style
   gating in app.js/export_unit_csv.py disables %kobiet/%mężczyzn for
   "_udzial" specifically, without touching those other variables' existing
   "_odsetek" behavior. Same zero-fill-unless-all-missing rule as the sum
   above.

Run once after fetch_bdl.py refreshes szkolnictwo_ponadpodstawowe.json, or
after liceum.json/zasadnicze_zawodowe.json change.
"""

import json
import os

from add_derived_measures import _divide

OUT_DIR = "../data"
TARGET_FILE = "szkolnictwo_ponadpodstawowe.json"
MEASURES = ["uczniowie", "uczniowie_1_klasa", "absolwenci"]


def _load(name):
    with open(os.path.join(OUT_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def _save(name, data):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def merge_source_agegroup(target, source_file, source_age_group, target_age_group):
    """Copies one ageGroup's slices from an already-fetched file into target,
    under a (possibly different) ageGroup key."""
    source = _load(source_file)
    for teryt, years in source.items():
        for year, slices in years.items():
            for measure in MEASURES:
                key = f"{source_age_group}__{measure}"
                if key not in slices:
                    continue
                target.setdefault(teryt, {}).setdefault(year, {})[f"{target_age_group}__{measure}"] = slices[key]


def combine(*parts):
    """parts: {t,m,k} dicts or None (missing entirely). Zero-fills a missing
    part for each sex independently, UNLESS every part is missing for that
    sex, in which case the combined value is null rather than a false 0."""
    out = {}
    for sex in ("t", "m", "k"):
        vals = [p.get(sex) for p in parts if p is not None]
        if not vals or all(v is None for v in vals):
            out[sex] = None
        else:
            out[sex] = sum(v or 0 for v in vals)
    return out


def add_razem(target):
    """razem = licea_ogolnoksztalcace + (technika + artystyczne_dajace_uprawnienia)
    + branzowe_I_st + licea_profilowane + zasadnicze_zawodowe, per measure."""
    core_groups = ["licea_ogolnoksztalcace", "technika", "artystyczne_dajace_uprawnienia", "branzowe_I_st", "licea_profilowane", "zasadnicze_zawodowe"]
    for teryt, years in target.items():
        for year, slices in years.items():
            for measure in MEASURES:
                parts = [slices.get(f"{g}__{measure}") for g in core_groups]
                if all(p is None for p in parts):
                    continue
                slices[f"razem__{measure}"] = combine(*parts)


def _has_any_value(d):
    return d is not None and any(v is not None for v in d.values())


def add_udzial(target):
    for teryt, years in target.items():
        for year, slices in years.items():
            for measure in MEASURES:
                technika_raw = slices.get(f"technika__{measure}")
                artystyczne_raw = slices.get(f"artystyczne_dajace_uprawnienia__{measure}")
                licea_raw = slices.get(f"licea_ogolnoksztalcace__{measure}")
                branzowe_raw = slices.get(f"branzowe_I_st__{measure}")
                if not any(_has_any_value(d) for d in (technika_raw, artystyczne_raw, licea_raw, branzowe_raw)):
                    continue

                technika = combine(technika_raw, artystyczne_raw)
                denom = combine(technika_raw, artystyczne_raw, licea_raw, branzowe_raw)
                for age_group, raw, numerator in (
                    ("technika", technika_raw, technika),
                    ("licea_ogolnoksztalcace", licea_raw, licea_raw),
                    ("branzowe_I_st", branzowe_raw, branzowe_raw),
                ):
                    if not _has_any_value(raw):
                        continue
                    slices[f"{age_group}__{measure}_udzial"] = {
                        sex: _divide(numerator.get(sex), denom.get(sex), 100) for sex in ("t", "m", "k")
                    }


if __name__ == "__main__":
    target = _load(TARGET_FILE)

    print("--- merging licea_ogolnoksztalcace (from liceum.json) ---")
    merge_source_agegroup(target, "liceum.json", "default", "licea_ogolnoksztalcace")

    print("--- merging zasadnicze_zawodowe (from zasadnicze_zawodowe.json) ---")
    merge_source_agegroup(target, "zasadnicze_zawodowe.json", "zawodowe_mlodziezy_bez_specjalnych", "zasadnicze_zawodowe")

    print("--- computing razem ---")
    add_razem(target)

    print("--- computing _udzial ---")
    add_udzial(target)

    _save(TARGET_FILE, target)
    print(f"  {TARGET_FILE}: {len(target)} regions -> {os.path.join(OUT_DIR, TARGET_FILE)}")
