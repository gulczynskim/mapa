"""
No boundary source in this project publishes voivodeship (województwo) polygons
directly. Unlike podregiony, no BDL parentId lookup is needed here: a powiat's
voivodeship teryt is just the first 2 digits of its own 4-digit teryt, so we can
dissolve data/powiaty.json straight into 16 groups by that prefix.
"""

import json
import os

from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

OUT_DIR = "../data"

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
