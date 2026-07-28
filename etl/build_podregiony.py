"""
Podregiony are Poland's NUTS 3 statistical regions -- not dissolved from
powiat polygons anymore. That approach (see git history) guaranteed exact
tiling with the powiat layer but couldn't fully close seams between
coastal powiats (patched from GUGiK PRG, fix_coastal_boundaries.py) and
their non-coastal, third-party-sourced neighbors: even after snapping to a
1cm precision grid, the two digitizations disagreed by more than that near
the coast, leaving thin unclosed-seam artifacts rendered as stray hairline
"borders" inside a single podregion (confirmed live 2026-07-25, worst at
Trójmiejski's Gdańsk/Gdynia harbor).

Instead this fetches Eurostat GISCO's own NUTS 2021 boundary product
directly (https://gisco-services.ec.europa.eu/distribution/v2/nuts/) at
its finest available resolution (01M, 1:1,000,000) and filters to Poland
(CNTR_CODE == "PL") -- confirmed live: exactly 73 features, matching
podregiony 1:1. No dissolve, so no seam to begin with -- same fix as
build_wojewodztwa.py's switch to PRG's native A01 layer.

Tradeoff: GISCO's 01M product is considerably less detailed than the old
powiat-dissolve geometry (~68k total vertices across all 73 regions vs.
~198k before, and far less than wojewodztwa's 852k from PRG's unsimplified
A01 layer) -- podregiony will look visibly coarser than wojewodztwa at
high zoom. That's the price of a pre-generalized authoritative source
instead of dissolving finer-grained polygons; no finer full-resolution
GISCO NUTS3 product exists (01M is the finest of 01M/03M/10M/20M/60M).

GISCO's NUTS_ID/NUTS_NAME carry no relation to GUS's own podregion codes,
so features are matched to the existing JPT_KOD_JE scheme by normalized
name against BDL's own podregion units (unit_id_to_teryt(id, level=4) --
see bdl_client.py) -- confirmed live: all 73 GISCO PL features match a BDL
podregion name 1:1, no manual overrides needed.

GISCO's own 01M product isn't perfectly clean either: make_valid() exposes
tiny self-intersections in ~18 regions as extra MultiPolygon slivers
(0.02-0.7 sq km, suspiciously uniform sizes recurring even in landlocked
regions with no coastline -- Piotrkowski, Sieradzki, Koniński, etc. --
so this is GISCO's own simplification artifact, not a real feature).
MIN_FRAGMENT_AREA_KM2 drops those; the gap to the smallest real remaining
feature (Szczeciński's Wolin/Uznam piece, ~60 sq km) is wide enough that
no real geography is at risk.
"""

import json
import os

import requests
from shapely.geometry import MultiPolygon, shape, mapping
from shapely.validation import make_valid

from bdl_client import unit_id_to_teryt

OUT_DIR = "../data"
NUTS3_URL = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326_LEVL_3.geojson"
MIN_FRAGMENT_AREA_KM2 = 1.0


def drop_tiny_fragments(geom):
    """Drops MultiPolygon parts below MIN_FRAGMENT_AREA_KM2 (converting
    degrees² to an approximate km² at this latitude), keeping the largest
    single part as a fallback if every part would otherwise be dropped."""
    if geom.geom_type != "MultiPolygon":
        return geom
    kept = [p for p in geom.geoms if p.area * 111.32 * 111.32 * 0.586 > MIN_FRAGMENT_AREA_KM2]
    if not kept:
        return max(geom.geoms, key=lambda p: p.area)
    return kept[0] if len(kept) == 1 else MultiPolygon(kept)


def fetch_all_units(level):
    """Pages through BDL's /units/search endpoint for the given unit level,
    returning every unit as a flat list."""
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


def norm(name):
    """Normalizes a podregion name for matching across sources: strips the
    "Podregion "/"podregion " prefix, trims whitespace, lowercases."""
    return name.replace("Podregion ", "").replace("podregion ", "").strip().lower()


def round_coords(geom_mapping, ndigits=7):
    """Rounds every coordinate in a GeoJSON geometry mapping to `ndigits`
    decimal places, recursing through however many levels of nested
    coordinate arrays the geometry type has."""
    def rc(c):
        """Recursively rounds one coordinate array (a bare [x, y] pair or a
        nested list of them) to `ndigits`."""
        return [round(x, ndigits) for x in c] if isinstance(c[0], (int, float)) else [rc(x) for x in c]

    m = dict(geom_mapping)
    m["coordinates"] = rc(m["coordinates"])
    return m


if __name__ == "__main__":
    podregion_units = fetch_all_units(4)
    # normalized name -> (JPT_KOD_JE, "Podregion X" display name)
    crosswalk = {}
    for u in podregion_units:
        teryt = unit_id_to_teryt(u["id"], level=4)
        name = u["name"].title()
        crosswalk[norm(name)] = (teryt, name)
    print(f"BDL podregion units: {len(podregion_units)}")

    r = requests.get(NUTS3_URL, timeout=60)
    r.raise_for_status()
    nuts = r.json()
    pl_features = [f for f in nuts["features"] if f["properties"]["CNTR_CODE"] == "PL"]
    print(f"NUTS3 (01M) Poland features: {len(pl_features)}")

    features = []
    unmatched = []
    for f in pl_features:
        nuts_name = f["properties"]["NUTS_NAME"]
        entry = crosswalk.get(norm(nuts_name))
        if entry is None:
            unmatched.append(nuts_name)
            continue
        teryt, display_name = entry
        geom = drop_tiny_fragments(make_valid(shape(f["geometry"])))
        features.append(
            {
                "type": "Feature",
                "properties": {"JPT_KOD_JE": teryt, "JPT_NAZWA_": display_name},
                "geometry": round_coords(mapping(geom)),
            }
        )

    if unmatched:
        print(f"WARNING: {len(unmatched)} NUTS3 features had no BDL podregion match: {unmatched}")
    assert len(features) == 73, f"expected 73 podregiony, matched {len(features)}"

    features.sort(key=lambda ft: ft["properties"]["JPT_KOD_JE"])
    out = {
        "type": "FeatureCollection",
        "meta": {
            "derivedFrom": "Eurostat GISCO NUTS 2021 (NUTS_RG_01M_2021_4326_LEVL_3, CNTR_CODE=PL), "
            "matched to GUS podregion codes via BDL API unit hierarchy",
            "usage": "Free to use (Eurostat GISCO terms: https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units/countries)",
        },
        "features": features,
    }
    path = os.path.join(OUT_DIR, "podregiony.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"podregiony: {len(features)} regions -> {path}")
