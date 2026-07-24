"""
Pracujący wg sekcji PKD i płci (P4283), powiat level -- ALL 12 months, not
just a single annual snapshot. Confirmed live (2026-07-24, while auditing
whether any of this project's BDL variables have finer-than-annual
granularity) that BDL publishes this subject as 12 fully independent
monthly variables per section+sex, not one annual figure -- the earlier
version of this script only ever fetched styczeń (January) and silently
discarded the other 11 months.

Variable IDs are discovered live via /variables?subject-id=P4283 and parsed
by their own n1 (month name) / n2 (section name, with the section letter in
parentheses -- except "ogółem", BDL's own all-sections total) / n3 (sex)
labels, not hardcoded -- the id numbering isn't a clean arithmetic sequence
per month (B/D/E sections live in a separate id range from the rest,
apparently added to the subject later), so guessing offsets the way the
site's other batch-fetch scripts sometimes do would be fragile here.

Output slice key: f"{section}__{month}_default" (e.g. "A__06_default"),
month as zero-padded "01".."12" -- folded into the MEASURE half of the key
rather than adding a whole new "month" dimension to the site's ageGroup/
measure/level architecture, which only this one variable would ever use.
add_derived_measures.py adds the "_odsetek" (% pracujących) sibling per
month on top of this, and wypadki_przy_pracy's "na 100 000 pracujących"
measure references specifically "06_default" (June) as a mid-year snapshot,
not any other month -- both by explicit user choice, not a default.

756 variables total (12 months x 20 sections incl. "ogółem" x 3 sexes) means
756 individual BDL API calls -- this takes a while to run, budget for it.
"""

import json
import os
import re

from dotenv import load_dotenv

from bdl_client import _get, fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"
LEVEL = 5  # powiat
SUBJECT_ID = "P4283"

MONTHS = {
    "styczeń": "01", "luty": "02", "marzec": "03", "kwiecień": "04",
    "maj": "05", "czerwiec": "06", "lipiec": "07", "sierpień": "08",
    "wrzesień": "09", "październik": "10", "listopad": "11", "grudzień": "12",
}
SEXES = {"ogółem": "t", "mężczyźni": "m", "kobiety": "k"}
# Matches a single trailing "(X)" section letter -- deliberately does NOT
# match multi-letter aggregates like "przemysł razem (B, C, D, E)", which
# aren't one of our 19 individual A-S sections and should be skipped.
SECTION_LETTER = re.compile(r"\(([A-Z])\)\s*$")


def list_variables(subject_id):
    # Uses bdl_client's own _get -- has the 429/Retry-After handling this
    # subject's discovery call actually hit live (756 variables under one
    # subject-id makes for a chunky metadata response, and this project had
    # already made plenty of other BDL calls this session).
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
    """{month_key: {section_key: {sex_key: variable_id}}}"""
    id_map = {}
    skipped = 0
    for v in list_variables(SUBJECT_ID):
        month = MONTHS.get(v.get("n1"))
        sex = SEXES.get(v.get("n3"))
        if month is None or sex is None:
            skipped += 1
            continue
        n2 = (v.get("n2") or "").strip()
        if n2 == "ogółem":
            section = "ogolem"
        else:
            m = SECTION_LETTER.search(n2)
            if not m:
                skipped += 1
                continue
            section = m.group(1)
        id_map.setdefault(month, {}).setdefault(section, {})[sex] = str(v["id"])
    print(f"  discovered ids for {len(id_map)} months, skipped {skipped} unrelated variables")
    return id_map


if __name__ == "__main__":
    id_map = build_id_map()

    out = {}
    for month, sections in sorted(id_map.items()):
        for section, ids in sections.items():
            for sex, var_id in ids.items():
                raw = fetch_variable_data(var_id, unit_level=LEVEL)
                for row in flatten(sex, raw):
                    teryt = unit_id_to_teryt(row["unit_id"], level=LEVEL)
                    year = str(row["year"])
                    slice_ = out.setdefault(teryt, {}).setdefault(year, {}).setdefault(
                        f"{section}__{month}_default", {"t": None, "m": None, "k": None}
                    )
                    slice_[sex] = row["value"]
        print(f"  month {month}: done")

    path = os.path.join(OUT_DIR, "pkd_zatrudnienie.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"pkd_zatrudnienie: {len(out)} regions -> {path}")
