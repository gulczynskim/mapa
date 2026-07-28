"""
Miasta na prawach powiatu (BDL unit "kind": "2", e.g. "Powiat m. Kraków") don't
have their own separate "rada powiatu" -- their single city council performs
both the gmina-council and powiat-council roles, but BDL only counts it under
the gmina-level council subject (P1312/radni_gminy). Their powiat-level
council subject (P1317/radni_powiatu) reports a literal 0 for all 67 of them,
which reads as a data gap/anomaly on the map rather than what it actually is.

This patches radni_powiatu.json in place: for each of the 66 currently-active
city-powiats (crosswalk built from BDL's own unit hierarchy, kind=2 units,
verified against real gmina.json boundaries -- one historical-only unit,
"Powiat m. Wałbrzych do 2002", doesn't match a current gmina and is skipped),
copy that year's radni_gminy value over the powiat-level entry.

Run once after regenerating either radni_powiatu.json or radni_gminy.json.
"""

import json
import os
import re
import time

import requests

from bdl_client import unit_id_to_teryt

OUT_DIR = "../data"


def _get(url, params):
    """GET with retry-on-429 (sleeping for the Retry-After header, or 5s if
    absent), up to 6 attempts."""
    for attempt in range(6):
        r = requests.get(url, params=params)
        if r.status_code == 429:
            m = re.search(r"\d+", r.headers.get("Retry-After", ""))
            time.sleep(int(m.group()) if m else 5)
            continue
        r.raise_for_status()
        return r
    return r


def build_crosswalk():
    """Pages through BDL's powiat-level units, filters down to miasta na
    prawach powiatu (kind "2"), and builds the crosswalk this script uses to
    backfill their zero-valued radni_powiatu.json placeholders."""
    all_powiats = []
    page = 0
    while True:
        r = _get("https://bdl.stat.gov.pl/api/v1/units/search", {"level": 5, "format": "json", "page-size": 100, "page": page})
        results = r.json().get("results", [])
        if not results:
            break
        all_powiats.extend(results)
        page += 1

    city_powiats = [u for u in all_powiats if u.get("kind") == "2"]

    with open(os.path.join(OUT_DIR, "gminy.json"), encoding="utf-8") as f:
        gmina_teryts = set(f2["properties"]["JPT_KOD_JE"] for f2 in json.load(f)["features"])

    crosswalk = {}
    for u in city_powiats:
        powiat_teryt = unit_id_to_teryt(u["id"], level=5)
        gmina_teryt = powiat_teryt + "011"
        if gmina_teryt in gmina_teryts:
            crosswalk[powiat_teryt] = gmina_teryt
    return crosswalk


if __name__ == "__main__":
    crosswalk = build_crosswalk()
    print(f"crosswalk: {len(crosswalk)} city-powiats")

    powiat_path = os.path.join(OUT_DIR, "radni_powiatu.json")
    gmina_path = os.path.join(OUT_DIR, "radni_gminy.json")
    with open(powiat_path, encoding="utf-8") as f:
        radni_powiatu = json.load(f)
    with open(gmina_path, encoding="utf-8") as f:
        radni_gminy = json.load(f)

    patched_years = 0
    for powiat_teryt, gmina_teryt in crosswalk.items():
        if gmina_teryt not in radni_gminy:
            print(f"  WARNING: {gmina_teryt} (for powiat {powiat_teryt}) not in radni_gminy.json, skipping")
            continue
        radni_powiatu.setdefault(powiat_teryt, {})
        for year, slices in radni_gminy[gmina_teryt].items():
            radni_powiatu[powiat_teryt][year] = slices
            patched_years += 1

    with open(powiat_path, "w", encoding="utf-8") as f:
        json.dump(radni_powiatu, f, ensure_ascii=False, separators=(",", ":"))
    print(f"patched {patched_years} teryt-year entries -> {powiat_path}")
