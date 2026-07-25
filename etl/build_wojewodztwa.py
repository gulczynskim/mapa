"""
Fetches voivodeship (województwo) boundaries directly from GUGiK PRG's own
WFS layer (ms:A01_Granice_wojewodztw) instead of dissolving powiat polygons.

Unlike podregiony (a NUTS-3-ish statistical grouping with no independent
boundary source -- see build_podregiony.py, which must still dissolve),
województwo is a real administrative level and PRG publishes it directly,
same WFS service family as the ms:A02_Granice_powiatow / ms:A03_Granice_gmin
layers fix_coastal_boundaries.py already fetches. Confirmed live
(2026-07-25): the layer returns the same JPT_KOD_JE (16 two-digit TERYT
codes) / JPT_NAZWA_ (lowercase name) schema as those layers.

This sidesteps the seam-mismatch sliver problem entirely -- no dissolve
means no internal powiat-to-powiat seams to mismatch in the first place --
and inherits GUGiK's own generalization for this scale, instead of the
full powiat-resolution vertex density the old dissolve approach carried
over. Only 16 features nationwide, so unlike the gmina/powiat fetches this
needs no bbox splitting -- one whole-country request is enough.

One consequence: this layer's coastline/land-border is now an independent
digitization from the powiat layer's (which carries the hand-patched
coastal fixes in fix_coastal_boundaries.py) -- they won't coincide
pixel-for-pixel at extreme zoom anymore. That's expected for a genuinely
generalized cartographic product at this scale, and a much smaller gap
than the sliver/generalization problems this replaces.
"""

import json
import os

from shapely.geometry import mapping

from fix_coastal_boundaries import build_admin_geom, fetch_prg_bbox, round_coords

OUT_DIR = "../data"

# Whole-country bbox in one shot -- only 16 features, no need to tile.
POLAND_BBOX = (49.0, 14.0, 55.0, 24.2)

if __name__ == "__main__":
    prg = fetch_prg_bbox(POLAND_BBOX, "ms:A01_Granice_wojewodztw")

    features = []
    for kod, entry in sorted(prg.items()):
        geom = build_admin_geom(entry["parts"])
        features.append(
            {
                "type": "Feature",
                # PRG returns lowercase names (e.g. "dolnośląskie") -- .title()
                # to match the app's existing "Dolnośląskie"-style casing.
                "properties": {"JPT_KOD_JE": kod, "JPT_NAZWA_": entry["name"].title()},
                "geometry": round_coords(mapping(geom)),
            }
        )

    out = {
        "type": "FeatureCollection",
        "meta": {
            "derivedFrom": "GUGiK PRG WFS ms:A01_Granice_wojewodztw (direct fetch, no dissolve)",
            "usage": "Free to use",
        },
        "features": features,
    }
    path = os.path.join(OUT_DIR, "wojewodztwa.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wojewodztwa: {len(features)} regions -> {path}")
