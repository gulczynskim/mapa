import os

import requests

BASE_URL = "https://bdl.stat.gov.pl/api/v1"


def _headers():
    api_key = os.environ.get("BDL_API_KEY")
    return {"X-ClientId": api_key} if api_key else {}


def fetch_variable_data(variable_id, unit_level=5, year=None):
    """Fetch all pages of BDL time-series data for one variable, across all units at the given level."""
    url = f"{BASE_URL}/data/by-variable/{variable_id}"
    params = {"unit-level": unit_level, "page-size": 100, "format": "json"}
    if year is not None:
        params["year"] = year

    results = []
    page = 0
    while True:
        params["page"] = page
        resp = requests.get(url, params=params, headers=_headers())
        resp.raise_for_status()
        data = resp.json()
        page_results = data.get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    return results


def flatten(label, raw_results):
    """Turn BDL's nested by-unit results into long-format rows: label, unit_id, unit_name, year, value."""
    rows = []
    for entry in raw_results:
        unit_id = entry.get("id")
        unit_name = entry.get("name")
        for v in entry.get("values", []):
            rows.append({
                "variable_id": label,
                "unit_id": unit_id,
                "unit_name": unit_name,
                "year": int(v["year"]),
                "value": v.get("val"),
            })
    return rows


def unit_id_to_teryt(unit_id):
    """BDL unit ids encode województwo+powiat in a fixed pattern (see GUS_API.ipynb precedent).

    The leading zero must be stripped via int conversion first -- BDL ids are
    otherwise inconsistent-width and the slice offsets below only line up
    after normalizing that way (matches the notebook's df['id'].astype(int).astype(str)).
    """
    normalized = str(int(unit_id))
    return normalized[1:3] + normalized[6:8]
