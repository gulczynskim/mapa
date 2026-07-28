"""
Historical powiat boundaries, mirroring build_gmina_historical_overrides.py's
approach but for the powiat level, which has NO override mechanism at all yet.

Two real, confirmed events (2026-07-28 audit -- see gender_inequality_map_
project memory for the full research trail):

1. 7 NEW POWIATS created 2002-01-01 (brzeziński, gołdapski, leski, łobeski,
   sztumski, węgorzewski, wschowski). Every piece of territory involved
   already exists as CURRENT geometry (gmina or powiat level) -- unlike
   Wesoła, no external historical geometry sourcing is needed at all, just
   re-unioning today's polygons the way they were grouped before 2002.
   gołdapski and łobeski are NOT simple 1-parent splits: gołdapski's
   territory split between giżycki (Banie Mazurskie gmina) and "olecko-
   gołdapski" (today's olecki, Dubeninki+Gołdap gminy); łobeski's territory
   came from THREE different parents (goleniowski/Dobra, gryficki/Resko+
   Radowo Małe, stargardzki/Łobez+Węgorzyno). Rather than model this as
   parent/child override PAIRS (which would apply out of order when two
   different splits both touch the same parent, e.g. giżycki needing BOTH
   węgorzewski wholesale AND gołdapski's Banie Mazurskie sub-piece), this
   script precomputes each parent's COMPLETE 2001 shape once and emits a
   flat replace/hide list for years <= 2001 -- see module docstring in
   app.js's applyPowiatHistoricalOverrides for how it's applied.

2. Wałbrzych TEMPORARILY absorbed into powiat wałbrzyski 2003-2012 (miasto
   na prawach powiatu status lost 2003-01-01, restored 2013-01-01 -- unlike
   every gmina-level override so far, this is a WINDOW, not a permanent
   before/after cutover: years outside [2003,2012] (both earlier AND
   later) show Wałbrzych independent, only the window itself needs the
   merged shape. Confirmed via data/gestosc_zaludnienia.json's own density
   figures for powiat wałbrzyski (0221): 139.1 (2002) -> 366.1 (2003) ->
   344.9 (2012, still elevated) -> 134.4 (2013, back down) -- a clean
   signature of a temporary land-area change, not a data-collection gap.
"""

import json
import os

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

DATA_DIR = "../data"
MIN_FRAGMENT_AREA = 0.001  # same threshold as build_gmina_historical_overrides.py


def clean(geom):
    """Drops seam-mismatch sliver fragments from a MultiPolygon below
    MIN_FRAGMENT_AREA, collapsing to a plain Polygon if only one real piece
    remains (same pattern as build_gmina_historical_overrides.py's own
    clean())."""
    if geom.geom_type != "MultiPolygon":
        return geom
    kept = [p for p in geom.geoms if p.area > MIN_FRAGMENT_AREA]
    return kept[0] if len(kept) == 1 else type(geom)(kept)


if __name__ == "__main__":
    def fix(geom):
        """Repairs an invalid geometry via the standard buffer(0) trick;
        passes valid geometry through unchanged."""
        return geom if geom.is_valid else geom.buffer(0)

    powiaty = json.load(open(os.path.join(DATA_DIR, "powiaty.json"), encoding="utf-8"))
    powiat_by_teryt = {f["properties"]["JPT_KOD_JE"]: fix(shape(f["geometry"])) for f in powiaty["features"]}

    gminy = json.load(open(os.path.join(DATA_DIR, "gminy.json"), encoding="utf-8"))
    gmina_by_teryt = {f["properties"]["JPT_KOD_JE"]: fix(shape(f["geometry"])) for f in gminy["features"]}

    def p(teryt):
        """Looks up a powiat's (already validity-fixed) shapely geometry by
        its 4-digit teryt."""
        return powiat_by_teryt[teryt]

    def g(teryt):
        """Looks up a gmina's (already validity-fixed) shapely geometry by
        its 7-digit teryt."""
        return gmina_by_teryt[teryt]

    # --- 2001 reconstruction (powiats hidden, replacements computed) ---
    hide_2001 = ["1821", "2216", "1021", "0812", "2819", "2818", "3218"]
    replace_2001 = {
        "1801": clean(unary_union([p("1801"), p("1821")])),  # bieszczadzki + leski
        "2209": clean(unary_union([p("2209"), p("2216")])),  # malborski + sztumski
        "1006": clean(unary_union([p("1006"), p("1021")])),  # łódzki wschodni + brzeziński
        "0804": clean(unary_union([p("0804"), p("0812")])),  # nowosolski + wschowski
        # giżycki: + węgorzewski (whole) + gołdapski's Banie Mazurskie gmina only
        "2806": clean(unary_union([p("2806"), p("2819"), g("2818012")])),
        # olecki ("olecko-gołdapski"): + gołdapski's Dubeninki/Gołdap gminy only
        "2813": clean(unary_union([p("2813"), g("2818022"), g("2818033")])),
        # łobeski's 3 parents, each getting only ITS OWN contributing gminy
        "3204": clean(unary_union([p("3204"), g("3218013")])),  # goleniowski + Dobra
        "3205": clean(unary_union([p("3205"), g("3218043"), g("3218032")])),  # gryficki + Resko + Radowo Małe
        "3214": clean(unary_union([p("3214"), g("3218023"), g("3218053")])),  # stargardzki + Łobez + Węgorzyno
    }

    # Sanity check: replaced parents' areas must exceed their current areas
    # by roughly the hidden child's area (catches a wrong gmina code or a
    # union that silently no-op'd due to a typo).
    checks = [
        ("1801", ["1821"]), ("2209", ["2216"]), ("1006", ["1021"]), ("0804", ["0812"]),
    ]
    for parent, children in checks:
        expected = p(parent).area + sum(p(c).area for c in children)
        actual = replace_2001[parent].area
        print(f"{parent}: expected ~{expected:.5f}, got {actual:.5f} (diff {abs(expected-actual):.6f})")

    giz_expected = p("2806").area + p("2819").area + g("2818012").area
    print(f"2806 (giżycki): expected ~{giz_expected:.5f}, got {replace_2001['2806'].area:.5f}")
    ole_expected = p("2813").area + g("2818022").area + g("2818033").area
    print(f"2813 (olecki): expected ~{ole_expected:.5f}, got {replace_2001['2813'].area:.5f}")
    goldap_total = g("2818012").area + g("2818022").area + g("2818033").area
    print(f"gołdapski total {p('2818').area:.5f} vs sum of its 3 gminy {goldap_total:.5f}")
    lobez_total = g("3218013").area + g("3218043").area + g("3218032").area + g("3218023").area + g("3218053").area
    print(f"łobeski total {p('3218').area:.5f} vs sum of its 5 gminy {lobez_total:.5f}")

    out = {
        "asOf2001": {
            "hide": hide_2001,
            "replace": {teryt: mapping(geom) for teryt, geom in replace_2001.items()},
        },
        "temporaryMerges": {
            # Wałbrzych's own shape hasn't changed physically, just its
            # status -- so its CURRENT polygon already IS the right shape
            # to show as absorbed within powiat wałbrzyski for 2003-2012.
            "0265": {
                "name": "Wałbrzych",
                "activeYears": [2003, 2012],
                "absorberTeryt": "0221",
                "absorberGeometry": mapping(clean(unary_union([p("0221"), p("0265")]))),
            }
        },
    }
    path = os.path.join(DATA_DIR, "powiaty_historical_overrides.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {path}")
