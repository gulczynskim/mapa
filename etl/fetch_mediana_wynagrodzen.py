"""
Mediana wynagrodzeń miesięcznych brutto (P4610), powiat level -- ALL 12
months, two parallel classifications (n2): "wg miejsca zamieszkania"
(employee's residence) and "wg siedziby podmiotu" (employer's registered
seat). Both fetched, modeled as the site's ageGroup dimension (repurposed,
like pkd_zatrudnienie's PKD section or rolnictwo_kierujacy's Role) -- month
lives in the MEASURE half instead, per explicit user request to mirror how
pkd_zatrudnienie already handles month.

"ogółem" (t) IS fetched, at unit-level=5 (powiat) explicitly -- an earlier
version of this script skipped it, wrongly trusting /variables?subject-id's
own "level" field (6, gmina) as if it meant "this variable can ONLY be
queried at that level." That field is evidently just a default/primary-
level hint, not an exclusivity constraint: requesting the SAME "ogółem"
variable id at unit-level=5 via /data/by-variable returns 380 real powiat
results (confirmed live, and cross-checked against a real value: powiat
bocheński's December 2025 "ogółem" (7453.26 zł) falls neatly between its
already-fetched mężczyźni (7598.94) and kobiety (7301.92) for the same
slice -- exactly what a genuine combined median should do, not an
artifact). This is BDL's own independently-computed combined-sexes median
(computed by GUS from the underlying individual wage records, not derived
here from the two subgroup medians) -- unlike e8_polski/e8_matematyka's
median measure or life_expectancy (both genuinely have no combined figure
published anywhere, hence their hasTotal: false), so there's no reason to
withhold it the way an earlier version of this variable's own variables.js
entry wrongly did.

Variable IDs discovered live via /variables?subject-id=P4610 and parsed by
n1 (month)/n2 (classification)/n3 (sex), not hardcoded -- confirmed the id
sequence IS a clean arithmetic progression here (unlike P4283/PKD), but
discovering live is still more robust than hardcoding an assumption that
could silently break if BDL ever inserts/reorders variables under this
subject.

Output slice key: f"{classification}__{month}" (e.g. "zamieszkania__06",
"siedziby__11"), month as zero-padded "01".."12", classification "zamieszkania"
| "siedziby".
"""

import json
import os

from dotenv import load_dotenv

from bdl_client import _get, fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"
LEVEL = 5  # powiat -- requested explicitly for every variable, including
           # "ogółem" ones whose own /variables metadata says level 6; see
           # module docstring for why that field doesn't restrict this.
SUBJECT_ID = "P4610"

MONTHS = {
    "styczeń": "01", "luty": "02", "marzec": "03", "kwiecień": "04",
    "maj": "05", "czerwiec": "06", "lipiec": "07", "sierpień": "08",
    "wrzesień": "09", "październik": "10", "listopad": "11", "grudzień": "12",
}
SEXES = {"ogółem": "t", "mężczyźni": "m", "kobiety": "k"}
CLASSIFICATIONS = {
    "wg miejsca zamieszkania": "zamieszkania",
    "wg siedziby podmiotu": "siedziby",
}


def list_variables(subject_id):
    """Pages through BDL's /variables metadata endpoint for one subject-id,
    returning every variable's metadata as a flat list."""
    results = []
    page = 0
    while True:
        params = {"lang": "pl", "format": "json", "page": page, "page-size": 100, "subject-id": subject_id}
        r = _get("https://bdl.stat.gov.pl/api/v1/variables", params)
        page_results = r.json().get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    return results


def build_id_map():
    """{month_key: {classification_key: {sex_key: variable_id}}}"""
    id_map = {}
    skipped = 0
    for v in list_variables(SUBJECT_ID):
        month = MONTHS.get(v.get("n1"))
        sex = SEXES.get(v.get("n3"))
        classification = CLASSIFICATIONS.get((v.get("n2") or "").strip())
        if month is None or sex is None or classification is None:
            skipped += 1
            continue
        id_map.setdefault(month, {}).setdefault(classification, {})[sex] = str(v["id"])
    print(f"  discovered ids for {len(id_map)} months, skipped {skipped} unrelated variables")
    return id_map


if __name__ == "__main__":
    id_map = build_id_map()

    out = {}
    for month, classifications in sorted(id_map.items()):
        for classification, ids in classifications.items():
            for sex, var_id in ids.items():
                # unit_level=LEVEL explicitly for every id -- including the
                # "ogółem" ones, whose own metadata claims level 6. See
                # module docstring: that claim doesn't hold, level 5 returns
                # real data.
                raw = fetch_variable_data(var_id, unit_level=LEVEL)
                for row in flatten(sex, raw):
                    teryt = unit_id_to_teryt(row["unit_id"], level=LEVEL)
                    year = str(row["year"])
                    slice_ = out.setdefault(teryt, {}).setdefault(year, {}).setdefault(
                        f"{classification}__{month}", {"t": None, "m": None, "k": None}
                    )
                    slice_[sex] = row["value"]
        print(f"  month {month}: done")

    path = os.path.join(OUT_DIR, "mediana_wynagrodzen.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"mediana_wynagrodzen: {len(out)} regions -> {path}")
