"""
Fetches every variable in bdl_variables.py's BDL_VARIABLES registry from the
live BDL API and writes each straight to data/<file>.json in this map's
{teryt: {year: {"ageGroup__measure": {t, m, k}}}} shape.

One generic fetch loop instead of one bespoke script per "batch" of
variables (the old fetch_batch2.py/fetch_batch3.py/fetch_new_vars.py/
fetch_life_expectancy.py split) -- every variable's actual ids now live in
one place (bdl_variables.py) and the fetch/combine logic that used to be
copy-pasted with small drifts between batches is written once here.

Run after any change to bdl_variables.py, or periodically to refresh all BDL
data. Downstream one-off patches still need their own run afterwards:
  python3 patch_city_powiats.py     (radni_powiatu's miasta-na-prawach-powiatu fix)
  python3 add_derived_measures.py   (_per100k / _odsetek derived measures)
pkd_zatrudnienie (12x20x3 = 756 ids, discovered live, not a static map) has
its own fetch_pkd.py, run separately -- see that file's docstring.
"""

import json
import os

from bdl_client import fetch_variable_data, flatten, resolve_gmina_teryt, unit_id_to_teryt
from bdl_variables import BDL_VARIABLES, GMINA, POWIAT

OUT_DIR = "../data"


def _teryt(row, level):
    """Resolves one BDL API unit row to the site's own teryt: gmina rows
    need name-assisted disambiguation (resolve_gmina_teryt), every other
    level maps its BDL unit id straight through."""
    if level == GMINA:
        return resolve_gmina_teryt(row["unit_id"], row["unit_name"])
    return unit_id_to_teryt(row["unit_id"], level=level)


def fetch_slice(ids, level):
    """ids: {"t"/"m"/"k": variable_id, "noTotal": bool}. Returns
    {teryt: {year: {"t": val, "m": val, "k": val}}}. t is computed as m + k
    when no "t" id was given and noTotal isn't set -- see bdl_variables.py's
    module docstring for when each applies."""
    no_total = ids.get("noTotal", False)
    sex_ids = {sex: vid for sex, vid in ids.items() if sex in ("t", "m", "k")}

    out = {}
    for sex, var_id in sex_ids.items():
        rows = flatten(sex, fetch_variable_data(var_id, unit_level=level))
        for row in rows:
            teryt = _teryt(row, level)
            if teryt is None:
                continue
            year = str(row["year"])
            slot = out.setdefault(teryt, {}).setdefault(year, {"t": None, "m": None, "k": None})
            slot[sex] = row["value"]

    if "t" not in sex_ids and not no_total:
        for years in out.values():
            for vals in years.values():
                if vals["m"] is not None and vals["k"] is not None:
                    vals["t"] = vals["m"] + vals["k"]
    return out


def fetch_variable(name, spec):
    """Fetches every ageGroup/measure slice declared in `spec["slices"]`
    (bdl_variables.py's per-variable entry), assembles them into the site's
    {teryt: {year: {"ageGroup__measure": {t,m,k}}}} shape, and writes the
    result to data/{spec["file"]}."""
    out = {}
    for age_group, measures in spec["slices"].items():
        for measure, ids in measures.items():
            slice_key = f"{age_group}__{measure}"
            for teryt, years in fetch_slice(ids, spec["level"]).items():
                for year, vals in years.items():
                    out.setdefault(teryt, {}).setdefault(year, {})[slice_key] = vals

    path = os.path.join(OUT_DIR, spec["file"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name}: {len(out)} regions -> {path}")


def fetch_population_25_34():
    """Not in BDL_VARIABLES: sums two NSP age bands (25-29 + 30-34) per sex
    before storage, a real combine step rather than a plain fetch. Both bands
    must be present to sum -- a missing band (suppressed or genuinely absent)
    must not silently read as "0 people in that band", which would
    understate rather than null out the combined total."""
    band_ids = {
        "t": ("1644517", "1644518"),
        "m": ("1644537", "1644538"),
        "k": ("1644557", "1644558"),
    }
    per_band = {}  # sex -> [{teryt: {year: val}}, {teryt: {year: val}}]
    for sex, (id_a, id_b) in band_ids.items():
        per_band[sex] = []
        for var_id in (id_a, id_b):
            band = {}
            for row in flatten(sex, fetch_variable_data(var_id, unit_level=POWIAT)):
                teryt = unit_id_to_teryt(row["unit_id"], level=POWIAT)
                band.setdefault(teryt, {})[str(row["year"])] = row["value"]
            per_band[sex].append(band)

    out = {}
    all_teryt_years = {
        (teryt, year)
        for bands in per_band.values()
        for band in bands
        for teryt, years in band.items()
        for year in years
    }
    for teryt, year in all_teryt_years:
        vals = {}
        for sex, (band_a, band_b) in per_band.items():
            a = band_a.get(teryt, {}).get(year)
            b = band_b.get(teryt, {}).get(year)
            vals[sex] = a + b if a is not None and b is not None else None
        out.setdefault(teryt, {})[year] = {"default__default": vals}

    path = os.path.join(OUT_DIR, "population_25_34.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  population_25_34: {len(out)} regions -> {path}")


if __name__ == "__main__":
    for name, spec in BDL_VARIABLES.items():
        print(f"--- {name} ({spec['topic']}) ---")
        fetch_variable(name, spec)

    print("--- population_25_34 (P4253, special: sums two NSP age bands) ---")
    fetch_population_25_34()
