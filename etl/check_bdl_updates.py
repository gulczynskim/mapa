"""
Monthly "is there new data yet" checker for every BDL-sourced variable in
this project. Read-only against both BDL and the repo -- never fetches or
writes any data/*.json map file, only reports which variables have a newer
year (or, for pkd_zatrudnienie, a newer month) published on BDL's live API
than what's currently stored locally. Re-running the real fetch for a
flagged variable is a separate, explicit step (this project's standing rule:
never auto-run a NEW BDL fetch that writes data/*.json without asking the
user first).

Checks every entry in bdl_variables.py's BDL_VARIABLES registry (including
the two no-longer-in-UI entries radni_gminy/radni_powiatu -- they're still
live ETL dependencies, see that module's own comments) plus the two
variables that live outside that registry on purpose: population_25_34
(fetch_bdl.py's own two-band combine step) and pkd_zatrudnienie
(fetch_pkd.py's 756-id monthly discovery, checked here via only the 12
representative "ogółem/ogółem" ids -- one per month -- rather than all 756;
a new month appearing on any of those is a strong enough signal to
recommend re-running the real fetch, which discovers the full id set fresh
itself).

For each (ageGroup, measure) slice: compares the LOCAL latest year (max year
key present in data/<file>.json for that slice, regardless of null values --
a year key exists whenever BDL returned ANY row for it, even a suppressed
one, since that's exactly what fetch_bdl.py itself would have written)
against the REMOTE latest year (MIN, not max, of every contributing id's own
max(years) from GET /variables/{id} -- so a slice needing both m+k isn't
flagged "new" until BOTH sexes actually have the new year published, not
just one of them).

Uses the per-id /variables/{id} endpoint (confirmed reliable, gives a full
"years" list per variable) rather than the bulk /subjects/{id}/variables
listing bdl_variables.py's own docstring already flagged as unreliable --
costs ~270 individual API calls (one per known BDL variable id in the
registry), budget a couple of minutes.
"""

import json
import os

from bdl_client import BASE_URL, _get
from bdl_variables import BDL_VARIABLES
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = "../data"

# Same band ids as fetch_bdl.py's fetch_population_25_34 -- P4253, a one-time
# NSP 2021 census publication, so this will correctly report "no update"
# until the next census (~2031), not a bug.
POPULATION_25_34_BAND_IDS = {
    "t": ("1644517", "1644518"),
    "m": ("1644537", "1644538"),
    "k": ("1644557", "1644558"),
}
POPULATION_25_34_FILE = "population_25_34.json"
POPULATION_25_34_SLICE = "default__default"

PKD_SUBJECT_ID = "P4283"
PKD_FILE = "pkd_zatrudnienie.json"
PKD_MONTHS = {
    "styczeń": "01", "luty": "02", "marzec": "03", "kwiecień": "04",
    "maj": "05", "czerwiec": "06", "lipiec": "07", "sierpień": "08",
    "wrzesień": "09", "październik": "10", "listopad": "11", "grudzień": "12",
}

_years_cache = {}


def variable_years(var_id):
    """GET /variables/{id}, cached for the life of one run."""
    var_id = str(var_id)
    if var_id not in _years_cache:
        resp = _get(f"{BASE_URL}/variables/{var_id}", {"format": "json"})
        _years_cache[var_id] = resp.json().get("years", [])
    return _years_cache[var_id]


def load_data(file_name):
    path = os.path.join(DATA_DIR, file_name)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def local_years_for_slice(data, slice_key):
    years = set()
    for by_year in data.values():
        for year, slices in by_year.items():
            if slice_key in slices:
                years.add(int(year))
    return years


def remote_max_year(var_ids):
    """MIN across ids' own max(years) -- see module docstring for why min,
    not max. None if none of the ids returned any years at all."""
    maxes = [max(years) for years in (variable_years(v) for v in var_ids) if years]
    return min(maxes) if maxes else None


def check_registry():
    findings = []
    for name, spec in BDL_VARIABLES.items():
        data = load_data(spec["file"])
        for age_group, measures in spec["slices"].items():
            for measure, ids in measures.items():
                slice_key = f"{age_group}__{measure}"
                var_ids = [v for k, v in ids.items() if k in ("t", "m", "k")]
                remote_max = remote_max_year(var_ids)
                if remote_max is None:
                    continue
                local_max = max(local_years_for_slice(data, slice_key), default=None)
                if local_max is None or remote_max > local_max:
                    findings.append({
                        "variable": name, "slice": slice_key,
                        "local_max_year": local_max, "remote_max_year": remote_max,
                    })
    return findings


def check_population_25_34():
    all_ids = [i for pair in POPULATION_25_34_BAND_IDS.values() for i in pair]
    remote_max = remote_max_year(all_ids)
    if remote_max is None:
        return []
    data = load_data(POPULATION_25_34_FILE)
    local_max = max(local_years_for_slice(data, POPULATION_25_34_SLICE), default=None)
    if local_max is None or remote_max > local_max:
        return [{"variable": "population_25_34", "slice": POPULATION_25_34_SLICE,
                  "local_max_year": local_max, "remote_max_year": remote_max}]
    return []


def discover_pkd_month_ids():
    """One representative "ogółem/ogółem" id per month, discovered live via
    the subject-variables listing -- BDL's id numbering isn't a clean
    arithmetic sequence per month (fetch_pkd.py's own docstring), so this
    doesn't hardcode ids the way a quick look at the live data might tempt."""
    results, page = [], 0
    while True:
        r = _get(f"{BASE_URL}/variables", {
            "lang": "pl", "format": "json", "page": page, "page-size": 100,
            "subject-id": PKD_SUBJECT_ID,
        })
        page_results = r.json().get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1

    month_ids = {}
    for v in results:
        if v.get("n2") == "ogółem" and v.get("n3") == "ogółem":
            month = PKD_MONTHS.get(v.get("n1"))
            if month:
                month_ids[month] = v["id"]
    return month_ids


def check_pkd():
    month_ids = discover_pkd_month_ids()

    data = load_data(PKD_FILE)
    local_year_months = set()
    for by_year in data.values():
        for year, slices in by_year.items():
            for key in slices:
                if key.startswith("ogolem__") and key.endswith("_default"):
                    month = key.split("__")[1].split("_")[0]
                    local_year_months.add((int(year), month))

    findings = []
    for month, vid in sorted(month_ids.items()):
        for year in variable_years(vid):
            if (year, month) not in local_year_months:
                findings.append({"variable": "pkd_zatrudnienie", "year": year, "month": month})
    return findings


def main():
    print("Checking BDL registry variables for newer published years...")
    findings = check_registry()
    findings += check_population_25_34()
    print(f"Checking pkd_zatrudnienie ({PKD_SUBJECT_ID}) for newer months...")
    pkd_findings = check_pkd()

    if not findings and not pkd_findings:
        print("\nNo new data found -- everything local matches BDL's latest.")
        return

    if findings:
        print(f"\n{len(findings)} slice(s) with newer data on BDL:")
        for f in findings:
            print(f"  {f['variable']} / {f['slice']}: local={f['local_max_year']} -> remote={f['remote_max_year']}")

    if pkd_findings:
        print(f"\n{len(pkd_findings)} pkd_zatrudnienie (year, month) combo(s) newer than local:")
        for f in pkd_findings:
            print(f"  {f['year']}-{f['month']}")


if __name__ == "__main__":
    main()
