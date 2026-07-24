"""
No boundary source in this project publishes voivodeship (województwo) polygons
directly. Unlike podregiony, no BDL parentId lookup is needed here: a powiat's
voivodeship teryt is just the first 2 digits of its own 4-digit teryt, so we can
dissolve data/powiaty.json straight into 16 groups by that prefix.
"""

import json
import os

from shapely.geometry import MultiPolygon, shape, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

OUT_DIR = "../data"

# The source powiat polygons (third-party GeoJSON) don't share exact vertex
# coordinates along every internal border -- individually invisible (each
# powiat is drawn as its own opaque layer), but dissolving several of them
# together at the coast turns those mismatches into extra disjoint
# MultiPolygon parts. Confirmed live (2026-07-24): every voivodeship's
# dissolve has a clean order-of-magnitude gap between real islands/spits
# (>=0.0026 sq deg -- e.g. the Wolin/Uznam pieces around Świnoujście, the
# Vistula Spit piece east of the Elbląg Canal cut) and this seam noise
# (<=0.00053 sq deg everywhere checked). This threshold sits in that gap.
# Hel is NOT at risk from this filter either way: it's a peninsula attached
# to the mainland by a land bridge, i.e. part of the main polygon, never a
# separate MultiPolygon part to begin with.
MIN_FRAGMENT_AREA = 0.001

# Standard TERYT voivodeship codes -- stable, no API lookup needed.
VOIVODESHIP_NAMES = {
    "02": "Dolnośląskie",
    "04": "Kujawsko-Pomorskie",
    "06": "Lubelskie",
    "08": "Lubuskie",
    "10": "Łódzkie",
    "12": "Małopolskie",
    "14": "Mazowieckie",
    "16": "Opolskie",
    "18": "Podkarpackie",
    "20": "Podlaskie",
    "22": "Pomorskie",
    "24": "Śląskie",
    "26": "Świętokrzyskie",
    "28": "Warmińsko-Mazurskie",
    "30": "Wielkopolskie",
    "32": "Zachodniopomorskie",
}

if __name__ == "__main__":
    powiaty = json.load(open(os.path.join(OUT_DIR, "powiaty.json"), encoding="utf-8"))

    groups = {}  # woj_teryt -> [geoms]
    unmatched = []
    for feature in powiaty["features"]:
        powiat_teryt = feature["properties"]["JPT_KOD_JE"]
        woj_teryt = powiat_teryt[:2]
        if woj_teryt not in VOIVODESHIP_NAMES:
            unmatched.append(powiat_teryt)
            continue
        # Real-world boundary polygons routinely have self-intersections too
        # small to see -- unary_union refuses to touch them ("side location
        # conflict"), so repair each one individually first (same fix as
        # build_podregiony.py).
        groups.setdefault(woj_teryt, []).append(make_valid(shape(feature["geometry"])))

    if unmatched:
        print(f"WARNING: {len(unmatched)} powiat boundary features had no voivodeship match: {unmatched}")

    features = []
    for woj_teryt, geoms in sorted(groups.items()):
        dissolved = unary_union(geoms)
        # unary_union on real (if make_valid-repaired) boundary data can spit
        # out a GeometryCollection with degenerate zero-area LineString/Point
        # artifacts at seams alongside the real polygon(s) -- confirmed live
        # for Pomorskie after swapping in higher-precision coastline data for
        # two of its powiats. Genuinely separate landmasses (e.g. the piece
        # of the Vistula Spit cut off by the shipping canal) survive this
        # filter fine since they're real, non-degenerate Polygon parts.
        if dissolved.geom_type == "GeometryCollection":
            polys = [g for g in dissolved.geoms if g.geom_type in ("Polygon", "MultiPolygon") and g.area > 0]
            dissolved = polys[0] if len(polys) == 1 else MultiPolygon(
                [p for g in polys for p in (g.geoms if g.geom_type == "MultiPolygon" else [g])]
            )
        # Seam-mismatch slivers (see MIN_FRAGMENT_AREA above) survive the
        # GeometryCollection cleanup above since they're non-degenerate
        # (positive-area) Polygon parts -- drop them here by size instead.
        if dissolved.geom_type == "MultiPolygon":
            kept = [p for p in dissolved.geoms if p.area > MIN_FRAGMENT_AREA]
            dissolved = kept[0] if len(kept) == 1 else MultiPolygon(kept)
        features.append(
            {
                "type": "Feature",
                "properties": {"JPT_KOD_JE": woj_teryt, "JPT_NAZWA_": VOIVODESHIP_NAMES[woj_teryt]},
                "geometry": mapping(dissolved),
            }
        )

    out = {
        "type": "FeatureCollection",
        "meta": {
            "derivedFrom": "data/powiaty.json (JW https://github.com/waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy), dissolved by voivodeship (first 2 digits of powiat TERYT)",
            "usage": "Free to use",
        },
        "features": features,
    }
    path = os.path.join(OUT_DIR, "wojewodztwa.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wojewodztwa: {len(features)} regions -> {path}")
