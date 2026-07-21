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


def unit_id_to_teryt(unit_id, level=5):
    """BDL unit ids encode województwo+podregion/powiat/gmina in a fixed
    pattern (see GUS_API.ipynb precedent), but the slice offset for the
    second part is DIFFERENT per level -- don't assume one offset generalizes.
    The leading zero must be stripped via int conversion first -- BDL ids
    are otherwise inconsistent-width and the offsets below only line up
    after normalizing that way (matches the notebook's
    df['id'].astype(int).astype(str)).

    Every offset below was cross-checked against an authoritative source,
    not assumed:
      level=5 (powiat): woj(2) + powiat(2) = normalized[1:3] + normalized[6:8].
        Verified 100% match against boundary-file TERYT.
      level=6 (gmina): normalized[1:3] + normalized[6:11] (adds gmina(2) +
        typ(1)). Verified against boundary TERYT for Bochnia/Drwinia/Łapanów.
        The powiat-width slice truncates the gmina digits and type entirely
        (produces garbage like "0000201").
      level=4 (podregion): normalized[1:3] + normalized[4:6] -- a DIFFERENT
        slice position than powiat/gmina, not just a different width.
        Verified against the "Podregion" column in the GUS wage publication
        (Krakowski=1220, Miasto Kraków=1221, Nowosądecki=1222, Nowotarski=
        1269, Bielski=2444). No boundary file exists for this level to cross-
        check against, so this was the only available ground truth.
    """
    normalized = str(int(unit_id))
    if level == 6:
        return normalized[1:3] + normalized[6:11]
    if level == 4:
        return normalized[1:3] + normalized[4:6]
    return normalized[1:3] + normalized[6:8]
