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

Unlike wojewodztwa (which now fetch a real PRG boundary layer directly --
see build_wojewodztwa.py -- since podregiony have no such source and must
still be dissolved), the seam-mismatch sliver problem here is fixed at the
source with shapely.set_precision(): every input powiat polygon is snapped
onto a common coordinate grid *before* unary_union, so vertices that are
"almost" identical between two neighboring powiats become exactly
identical and the shared edge cancels out cleanly, instead of leaving a
thin ribbon-shaped sliver for unary_union to produce and then filtering it
out by area afterward. GRID_SIZE (1e-7 deg, ~1cm at this latitude) is sized
to close floating-point/digitization noise between two copies of the same
nominal vertex without moving real detail.
"""

import json
import os

import requests
from shapely import set_precision
from shapely.geometry import MultiPolygon, shape, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

from bdl_client import unit_id_to_teryt

OUT_DIR = "../data"
GRID_SIZE = 1e-7

# Kept as a defensive backstop after precision snapping, not the primary
# fix anymore -- confirmed live (2026-07-25): before this file dissolved
# powiat polygons unsnapped, 6 of 73 podregiony came out as MultiPolygon
# with extra disjoint parts (up to 21 for Podregion Szczeciński), rendering
# as stray "powiat border" lines/shapes on the map since each part gets its
# own outline. Same clean order-of-magnitude gap as wojewodztwa's old
# dissolve between real islands/spits (>=0.0026 sq deg) and seam artifacts
# (<=0.00053 sq deg) held here too.
#
# Caveat: GRID_SIZE assumes the mismatch is floating-point/digitization
# noise between two copies of the same source. The 13 coastal powiats
# (fix_coastal_boundaries.py) were patched from GUGiK PRG while their
# neighbors are still the original third-party GeoJSON repo -- a genuinely
# different digitization, possibly meters apart, not millimeters. If
# slivers persist specifically at those seams after snapping, this
# MIN_FRAGMENT_AREA filter is still here to catch them -- but the real fix
# at that point is unifying the powiat source (re-fetch all of
# data/powiaty.json from PRG's A02 layer), not enlarging GRID_SIZE.
MIN_FRAGMENT_AREA = 0.001


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
        # conflict"), so repair each one individually first. Snap onto a
        # common grid after repairing so neighboring powiats' shared-border
        # vertices collapse to exactly the same point (see GRID_SIZE above).
        g["geoms"].append(set_precision(make_valid(shape(feature["geometry"])), GRID_SIZE))

    if unmatched:
        print(f"WARNING: {len(unmatched)} powiat boundary features had no crosswalk entry: {unmatched}")

    features = []
    for podregion_teryt, g in sorted(groups.items()):
        dissolved = unary_union(g["geoms"])
        # unary_union can spit out a GeometryCollection with degenerate
        # zero-area LineString/Point artifacts at seams alongside the real
        # polygon(s), even when every input was individually make_valid-ed --
        # confirmed live for 10 of the 73 podregiony (Lubelski, Skierniewicki,
        # Krakowski, Ciechanowski, Nyski, Krośnieński, Łomżyński, Słupski,
        # Kielecki, Elbląski) before this fix. Real disconnected landmasses
        # (islands, a spit cut by a shipping canal) survive this filter fine
        # since they're non-degenerate Polygon parts, not zero-area slivers.
        if dissolved.geom_type == "GeometryCollection":
            polys = [p for p in dissolved.geoms if p.geom_type in ("Polygon", "MultiPolygon") and p.area > 0]
            dissolved = polys[0] if len(polys) == 1 else MultiPolygon(
                [p for poly in polys for p in (poly.geoms if poly.geom_type == "MultiPolygon" else [poly])]
            )
        # Seam-mismatch slivers survive the GeometryCollection cleanup above
        # since they're non-degenerate (positive-area) Polygon parts -- drop
        # them here by size instead (see MIN_FRAGMENT_AREA above).
        if dissolved.geom_type == "MultiPolygon":
            kept = [p for p in dissolved.geoms if p.area > MIN_FRAGMENT_AREA]
            dissolved = kept[0] if len(kept) == 1 else MultiPolygon(kept)
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
