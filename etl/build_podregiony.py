"""
No boundary source publishes podregion (NUTS-3-ish statistical grouping)
polygons directly -- podregiony aren't a real administrative layer, just an
official grouping of whole powiaty. So: build them by dissolving (unioning)
our existing powiat polygons (data/powiaty.json) using the real powiat ->
podregion parentage from BDL's own unit hierarchy (GET /units/{id} returns
parentId; confirmed live that a powiat's parent is exactly its podregion,
e.g. Powiat bocheński -> PODREGION KRAKOWSKI).

This guarantees podregion polygons exactly tile the powiat polygons already
on the map (same source, same vertices) -- no seams or mismatched borders
from combining two independently-drawn boundary datasets.
"""

import json
import os

import requests
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

from bdl_client import unit_id_to_teryt

OUT_DIR = "../data"


def fetch_all_units(level):
    units = []
    page = 0
    while True:
        r = requests.get(
            "https://bdl.stat.gov.pl/api/v1/units/search",
            params={"level": level, "format": "json", "page-size": 100, "page": page},
        )
        r.raise_for_status()
        data = r.json()
        results = data.get("results", [])
        if not results:
            break
        units.extend(results)
        page += 1
    return units


if __name__ == "__main__":
    powiat_units = fetch_all_units(5)
    podregion_units = fetch_all_units(4)
    podregion_names = {u["id"]: u["name"].title() for u in podregion_units}

    # powiat TERYT -> podregion TERYT, via each powiat unit's real BDL parentId
    crosswalk = {}
    for u in powiat_units:
        powiat_teryt = unit_id_to_teryt(u["id"], level=5)
        podregion_teryt = unit_id_to_teryt(u["parentId"], level=4)
        crosswalk[powiat_teryt] = (podregion_teryt, podregion_names.get(u["parentId"], podregion_teryt))
    print(f"crosswalk: {len(crosswalk)} powiaty -> {len(set(v[0] for v in crosswalk.values()))} podregiony")

    powiaty = json.load(open(os.path.join(OUT_DIR, "powiaty.json"), encoding="utf-8"))

    groups = {}  # podregion_teryt -> {"name": ..., "geoms": [...]}
    unmatched = []
    for feature in powiaty["features"]:
        powiat_teryt = feature["properties"]["JPT_KOD_JE"]
        entry = crosswalk.get(powiat_teryt)
        if entry is None:
            unmatched.append(powiat_teryt)
            continue
        podregion_teryt, name = entry
        g = groups.setdefault(podregion_teryt, {"name": name, "geoms": []})
        # Real-world boundary polygons routinely have self-intersections too
        # small to see -- unary_union refuses to touch them ("side location
        # conflict"), so repair each one individually first.
        g["geoms"].append(make_valid(shape(feature["geometry"])))

    if unmatched:
        print(f"WARNING: {len(unmatched)} powiat boundary features had no crosswalk entry: {unmatched}")

    features = []
    for podregion_teryt, g in sorted(groups.items()):
        dissolved = unary_union(g["geoms"])
        features.append(
            {
                "type": "Feature",
                "properties": {"JPT_KOD_JE": podregion_teryt, "JPT_NAZWA_": g["name"]},
                "geometry": mapping(dissolved),
            }
        )

    out = {
        "type": "FeatureCollection",
        "meta": {
            "derivedFrom": "data/powiaty.json (JW https://github.com/waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy), dissolved by podregion using BDL API unit hierarchy (parentId)",
            "usage": "Free to use",
        },
        "features": features,
    }
    path = os.path.join(OUT_DIR, "podregiony.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"podregiony: {len(features)} regions -> {path}")
