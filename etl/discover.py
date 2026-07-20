"""
Auto-discovery for BDL subjects: list every variable under a subject, then
probe which of our three levels of interest (4=podregion, 5=powiat,
6=gmina) each variable actually publishes data at.

Replaces hand-picking variable IDs by eyeballing the notebook -- pulls the
full age-group / dimension breakdown for a subject instead of a curated
subset.
"""

import os

import requests

BASE_URL = "https://bdl.stat.gov.pl/api/v1"
LEVELS_OF_INTEREST = [4, 5, 6]  # podregion, powiat, gmina


def _headers():
    api_key = os.environ.get("BDL_API_KEY")
    return {"X-ClientId": api_key} if api_key else {}


def list_variables(subject_id):
    """Full paginated variable listing for a subject, no level filter."""
    url = f"{BASE_URL}/variables"
    results = []
    page = 0
    while True:
        params = {
            "lang": "pl",
            "format": "json",
            "page": page,
            "page-size": 100,
            "subject-id": subject_id,
        }
        resp = requests.get(url, params=params, headers=_headers())
        resp.raise_for_status()
        data = resp.json()
        page_results = data.get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    return results


def probe_levels(variable_id):
    """Which of [4,5,6] actually have data for this variable (cheap page-size=1 check)."""
    available = []
    for level in LEVELS_OF_INTEREST:
        params = {"unit-level": level, "page-size": 1, "format": "json"}
        resp = requests.get(f"{BASE_URL}/data/by-variable/{variable_id}", params=params, headers=_headers())
        resp.raise_for_status()
        if resp.json().get("totalRecords", 0) > 0:
            available.append(level)
    return available


def dimension_label(var):
    """Concatenate n1..n4 into one readable label (sex/age-group/etc dimensions)."""
    parts = [var.get(f"n{i}", "") for i in range(1, 5)]
    return " | ".join(p for p in parts if p)
