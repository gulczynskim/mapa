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
is genuinely rare, not a systemic yearly problem.

SPLITS: a split's "before" shape is just the union of its own current pieces
(both still exist today, so no external historical source is needed).

MERGES need the actual pre-dissolution geometry of a unit that no longer
exists anywhere in current data. Sourced from OpenStreetMap's historical
Overpass API (`[date:"..."]` queries, which can reconstruct a relation's past
state even after later deletion) for gmina Ostrowice (dissolved 2019-01-01,
OSM relation 2895997, queried as of 2018-12-31) and gmina Zielona Góra
wiejska (dissolved 2015-01-01, relation 2613209, queried as of 2014-12-31).
Frozen one-time snapshots saved in etl/historical_fixtures/ -- these
represent the historical shape as OSM had it mapped, not something to
re-fetch on every ETL run.

Cross-checked Ostrowice's split against the actual 2019 Dz.U. bulletin (Dz.
U. z 2018 r. poz. 1527): 7 of its cadastral districts went to gm. Drawsko
Pomorskie, 9 to gm. Złocieniec, official areas 6533 ha / 8494 ha (43.5% /
56.5%) -- computed by INTERSECTING the reconstructed historical shape with
each destination gmina's CURRENT shape (not by trusting the incidental way
the reconstructed ring happens to split into disconnected pieces, which
turned out to not align with the real administrative split at all: the
first attempt's naive 2-piece MultiPolygon overlapped BOTH destinations)
gives 43.2% / 56.3% -- matches almost exactly.

Output schema (data/gminy_historical_overrides.json):
  {
    "splits": { parentTeryt: { "validUntil": year, "hides": [childTeryt],
                                "geometry": <merged geometry> } },
    "merges": { dissolvedTeryt: { "validUntil": year,
                                   "geometry": <dissolved unit's own shape>,
                                   "shrinks": { absorbingTeryt: <that
                                     absorbing unit's pre-merger shape> } } }
  }
app.js applies this at render time (see applyGminaHistoricalOverrides):
splits swap the parent's polygon and hide the child; merges insert the
dissolved unit's own polygon and shrink each absorbing unit's polygon --
both only for a selected year <= validUntil, reverting the moment the year
crosses back into the unit's own existence.
"""

import json
import os

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

OUT_DIR = "../data"
FIXTURES_DIR = "historical_fixtures"

# (parentTeryt, [childTeryt, ...], validUntil) -- validUntil is the last year
# the OLD (pre-split) configuration was in effect; both splits took effect
# 2025-01-01, so 2024 is the last year needing the merged shape.
SPLITS = [
    ("1207052", ["1207132"], 2024),  # gm. Kamienica -> + gm. Szczawa
    ("2002093", ["2002162"], 2024),  # gm. Supraśl -> + gm. Grabówka
]

# (dissolvedTeryt, dissolvedName, fixtureFile, validUntil, [absorbingTeryt, ...])
# Wesoła: independent town until absorbed into Warszawa via a 2002-10-27
# referendum. Its "absorber" list is deliberately EMPTY here -- unlike
# Ostrowice/ZG wiejska (each dissolving into one or two already-continuous
# neighbors that just need shrinking), pre-2002 Warszawa itself was 11
# separate gminy plus Wesoła (12 units total), not "today's Warszawa minus
# Wesoła" -- there is no single "core Warszawa" shape from that era to shrink
# INTO. Today's unified Warszawa teryt (1465011) already correctly shows no
# 1998 data for that reason (it isn't one real historical unit that year).
# This entry only adds Wesoła's own polygon back for 1998 -- reconstructing
# the other 11 pre-2002 Warsaw gminy (one of which, Warszawa-Centrum, covered
# several of today's central dzielnice combined and needs its own historical
# verification) is a separate, larger follow-up.
# Fixture note: OSM has no digitized boundary from 2002 for Wesoła (its
# relation was only created in 2012, already as today's district) -- used
# today's district boundary instead. Its area (22.87 sq km, computed here)
# matches the town's own cited historical area (22.94 sq km) closely enough
# to support the standard assumption that annexation preserved the existing
# footprint unchanged, rather than representing any real boundary change.
MERGES = [
    ("3203042", "gm. Ostrowice", "ostrowice_2018.json", 2018, ["3203023", "3203063"]),
    ("0809102", "gm. Zielona Góra (wiejska)", "zielona_gora_wiejska_2014.json", 2014, ["0862011"]),
    ("141203", "Wesoła", "wesola_1998.json", 1998, []),
]

# Both unary_union (splits) and difference/intersection (merges) on this
# third-party boundary data leave seam-mismatch slivers where two
# independently-sourced polygons don't share exact vertices (same root cause
# as build_wojewodztwa.py's dissolve) -- confirmed here too: the Zielona
# Góra city/wiejska difference alone produced ~100 slivers under 2e-4 sq deg
# next to the one real ~0.0076 sq deg piece. No legitimate feature this
# small is expected in any of these results, so a single generous threshold
# well below every real piece observed (>=0.005) and well above every
# artifact observed (<=2e-4) is safe everywhere it's used below.
MIN_FRAGMENT_AREA = 0.001


def clean(geom):
    if geom.geom_type != "MultiPolygon":
        return geom
    kept = [p for p in geom.geoms if p.area > MIN_FRAGMENT_AREA]
    return kept[0] if len(kept) == 1 else type(geom)(kept)


if __name__ == "__main__":
    gminy = json.load(open(os.path.join(OUT_DIR, "gminy.json"), encoding="utf-8"))
    by_teryt = {f["properties"]["JPT_KOD_JE"]: shape(f["geometry"]) for f in gminy["features"]}

    splits_out = {}
    for parent, children, valid_until in SPLITS:
        missing = [t for t in [parent, *children] if t not in by_teryt]
        if missing:
            print(f"WARNING: skipping split {parent} -- teryt(s) not found in gminy.json: {missing}")
            continue
        merged = clean(unary_union([by_teryt[parent], *(by_teryt[c] for c in children)]))
        splits_out[parent] = {"validUntil": valid_until, "hides": children, "geometry": mapping(merged)}
        print(f"split {parent}: merged with {children}, valid for years <= {valid_until}")

    merges_out = {}
    for dissolved, name, fixture, valid_until, absorbers in MERGES:
        missing = [t for t in absorbers if t not in by_teryt]
        if missing:
            print(f"WARNING: skipping merge {dissolved} -- absorbing teryt(s) not in gminy.json: {missing}")
            continue
        historical = shape(json.load(open(os.path.join(FIXTURES_DIR, fixture), encoding="utf-8")))
        if historical.geom_type == "MultiPolygon":
            # The reconstructed ring can come back as several disconnected
            # parts that DON'T align with the real administrative split (see
            # module docstring) -- re-union them into one shape and let the
            # per-absorber intersection below recover the real split instead.
            historical = unary_union(list(historical.geoms))

        shrinks = {}
        for absorber in absorbers:
            piece = historical.intersection(by_teryt[absorber])
            shrunk = clean(by_teryt[absorber].difference(historical))
            shrinks[absorber] = mapping(shrunk)
            print(f"  {absorber}: received {piece.area:.5f} sq deg from {dissolved}, shrunk shape area {shrunk.area:.5f}")

        merges_out[dissolved] = {
            "name": name,
            "validUntil": valid_until,
            "geometry": mapping(clean(historical)),
            "shrinks": shrinks,
        }
        print(f"merge {dissolved} ({name}): {len(absorbers)} absorber(s), valid for years <= {valid_until}")

    out = {"splits": splits_out, "merges": merges_out}
    path = os.path.join(OUT_DIR, "gminy_historical_overrides.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"gminy_historical_overrides: {len(splits_out)} splits, {len(merges_out)} merges -> {path}")
