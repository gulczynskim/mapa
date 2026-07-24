"""
Handles the only kind of TERYT change that actually breaks the map: a gmina
SPLIT or MERGE that changes the number of gmina-level units. (Boundary-only
adjustments, miejscowość reclassification, or a gmina simply gaining/losing
"miasto" status don't change the unit count and need no special handling --
BDL keeps reporting data under the same code, which already exists on the
current map. Per the user's own scoping (2026-07-24): only count-changing
events matter here.)

Cross-referenced the yearly BDL "Informacja o zmianach w podziale
terytorialnym kraju" bulletins (https://bdl.stat.gov.pl/bdl/metadane/teryt/zmiany)
2014-2026 for gmina-level splits/merges. Found exactly two SPLIT events (both
2025-01-01) and two MERGE events (2019, 2015) in that 13-year window -- this
is genuinely rare, not a systemic yearly problem. Only the splits are handled
here: a split's "before" shape is just the union of its own current pieces
(both still exist today, so no external historical source is needed). A
merge's "before" shape needs the actual pre-dissolution geometry of a unit
that no longer exists anywhere in current data -- gmina Ostrowice (dissolved
2019) and gmina Zielona Góra wiejska (dissolved 2015) are parked for
follow-up (need an external historical source, e.g. OSM's edit history).

Output: data/gminy_historical_overrides.json, keyed by the PARENT teryt
(the code that continues to exist today):
  { parentTeryt: { "validUntil": year, "hides": [childTeryt, ...],
                    "geometry": <merged GeoJSON geometry> } }
app.js applies this at render time: for a selected year <= validUntil, the
parent's polygon is swapped for the merged geometry and the "hides" child
polygon(s) are removed from the map -- restoring the pre-split shape for
years when the child didn't exist yet as its own unit, so a historical
value reported under the parent's code (which already covers the full
pre-split area) doesn't render as a "hole" where the child now is.
"""

import json
import os

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

OUT_DIR = "../data"

# (parentTeryt, [childTeryt, ...], validUntil) -- validUntil is the last year
# the OLD (pre-split) configuration was in effect; the split's "Data wejścia
# w życie" is 2025-01-01, so 2024 is the last year needing the merged shape.
SPLITS = [
    ("1207052", ["1207132"], 2024),  # gm. Kamienica -> + gm. Szczawa
    ("2002093", ["2002162"], 2024),  # gm. Supraśl -> + gm. Grabówka
]

if __name__ == "__main__":
    gminy = json.load(open(os.path.join(OUT_DIR, "gminy.json"), encoding="utf-8"))
    by_teryt = {f["properties"]["JPT_KOD_JE"]: shape(f["geometry"]) for f in gminy["features"]}

    out = {}
    for parent, children, valid_until in SPLITS:
        missing = [t for t in [parent, *children] if t not in by_teryt]
        if missing:
            print(f"WARNING: skipping {parent} -- teryt(s) not found in gminy.json: {missing}")
            continue
        merged = unary_union([by_teryt[parent], *(by_teryt[c] for c in children)])
        # Same seam-mismatch slivers as build_wojewodztwa.py's dissolve (the
        # source polygons don't always share exact vertices along a shared
        # border) -- unlike that voivodeship case, there's no legitimate
        # separate landmass to protect here (Kamienica/Szczawa and
        # Supraśl/Grabówka are plain inland splits), so just keep the largest
        # part instead of needing a size-gap judgment call.
        if merged.geom_type == "MultiPolygon":
            merged = max(merged.geoms, key=lambda p: p.area)
        out[parent] = {"validUntil": valid_until, "hides": children, "geometry": mapping(merged)}
        print(f"{parent}: merged with {children}, valid for years <= {valid_until}")

    path = os.path.join(OUT_DIR, "gminy_historical_overrides.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"gminy_historical_overrides: {len(out)} entries -> {path}")
