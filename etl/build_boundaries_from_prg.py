"""
Replaces the vendored powiat/gmina boundary source (github.com/waszkiewiczja/
GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy) with GUGiK's own official PRG
(Panstwowy Rejestr Granic) shapefile export -- user-supplied as
data/00_jednostki_administracyjne.zip. Fixes the "dirty map" border artifact
at its root instead of patching it after the fact (see the 2026-07-26
conversation for the full investigation, including a vertex-snapping attempt
that had to be abandoned -- it created worse overlaps than the original
misalignment, since snapping vertices independently doesn't preserve path
order along a curve).

Why this source fixes the problem the vendored one couldn't:
- The vendored file was independently simplified per polygon (no shared
  topology), so two neighbors' "same" border were really two different
  lines, tens of meters to >1km apart -- confirmed via direct measurement.
- PRG is a single authoritative national registry. Building topology from
  it via the topojson package (which detects shared arcs and, at fine
  quantization, snaps near-duplicate vertices together) reduces that same
  worst-case pair's misalignment from ~1100m to under 20m -- verified live.
  A leftover few-meter residual is quantization granularity, not a real
  gap, and is irrelevant at any zoom level this map renders at.
- PRG also carries far more coastline detail than the vendored file (Hel:
  274 vertices vs the vendored file's 12 at full precision; even after
  toposimplify at the epsilon gmina needs for a reasonable file size, Hel
  keeps 32 -- still ~2.7x the vendored file's, and enough to read as a
  peninsula instead of a blob). fix_thin_peninsulas.py/
  fix_coastal_boundaries.py, which hand-patched exactly these features
  before, are OBSOLETE once this runs -- don't re-run them against
  PRG-derived data.

Two DIFFERENT toposimplify epsilons, not one: powiat features are large
enough that 0.0015 deg (~165m) barely matters, and lands the file near the
vendored original's size. The same epsilon applied to gmina destroys small
coastal features (Hel dropped to 19 vertices, worse than doing nothing) --
gminy need their own, smaller epsilon (0.0005). Tried patching just the
~34 small coastal gminy with a separately-simplified high-detail version
instead of lowering the whole level's epsilon -- confirmed live this is
UNSAFE: two toposimplify() calls at different epsilons on the same
Topology object do not reliably preserve identical shared-arc endpoints,
so splicing one gmina's geometry from a different epsilon run than its
neighbors created 97 new overlapping pairs (up to 15 sq km) between
coastal and inland gminy. One epsilon per whole level, no mixing.

toposimplify can still leave a handful of self-intersecting rings (29 in
this gmina run) -- clean_geometry() runs make_valid() + extract_polygonal()
over every feature regardless of whether find_touching_pairs-style checks
flagged it, since which features end up invalid isn't predictable ahead of
time.

Field names (JPT_KOD_JE, JPT_NAZWA_) match the existing GeoJSON schema
exactly, so no changes are needed elsewhere in the codebase.

Gmina count mismatch: this PRG snapshot is from 2022-06-27, predating the
two 2025-01-01 splits (Grabowka off Suprasl, Szczawa off Kamienica) --
2477 features here vs the current 2479. Both parent units still exist in
PRG as their pre-split (combined) shape; split_2025_gminy() carves the
PARENT (Kamienica, Suprasl) out first via intersection with a small buffer
around its own current vendored shape, then gives the CHILD (Szczawa,
Grabowka) whatever's left via .difference() -- guarantees the two pieces
exactly partition the original area (no overlap, no gap) regardless of how
precise the vendored dividing line itself is, per the user's own "we don't
need so much precision" scoping. Only affects 2 of 2479 units.

etl/build_gmina_historical_overrides.py reads data/gminy.json directly (its
SPLITS/MERGES tables need the new Kamienica/Szczawa/Suprasl/Grabowka
geometry to stay internally consistent with the rest of the new base data)
-- re-run it after this script, it'll regenerate gminy_historical_
overrides.json from the new shapes automatically, no table changes needed.

Podregiony (build_podregiony.py, GISCO NUTS3) and wojewodztwa
(build_wojewodztwa.py, PRG's own A01 layer) are BOTH already independently
sourced, not dissolved from powiaty.json (see their own docstrings, and
git history around 2026-07-25 for why the old powiat-dissolve approach was
dropped) -- neither needs to be touched or re-run after this script.
"""

import json

import shapefile
import topojson as tp
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.validation import make_valid

ROOT = "/home/gulczynek/Claude/mapa"
PRG_DIR = "/tmp/prg_extract"  # unzip 00_jednostki_administracyjne.zip here first (A01/A02/A03 only -- A05/A06 are cadastral-level, not needed)

# Fine enough that adjacent units' truly-identical vertices land in the same
# quantization cell (verified: reduces the worst known pair's misalignment
# from ~1100m to <20m); not so coarse that real detail (Hel, Jastarnia) gets
# rounded away.
PREQUANTIZE = 1_000_000
# Topology-preserving simplification epsilon (degrees), one per level --
# see module docstring for why these can't be the same value.
TOPOSIMPLIFY_EPSILON = {"powiat": 0.0015, "gmina": 0.0005}
MIN_FRAGMENT_AREA_DEG2 = 1e-9  # well under 1 real sq meter -- see clean_geometry


def read_shapefile_as_geojson(base_path):
    sf = shapefile.Reader(base_path)
    feats = []
    for sr in sf.shapeRecords():
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "JPT_KOD_JE": sr.record["JPT_KOD_JE"],
                    "JPT_NAZWA_": sr.record["JPT_NAZWA_"],
                },
                "geometry": sr.shape.__geo_interface__,
            }
        )
    return {"type": "FeatureCollection", "features": feats}


def extract_polygonal(geom):
    """make_valid() on a self-intersecting ring (toposimplify leaves a
    handful behind, see module docstring) can return a MultiPolygon with a
    real part plus a degenerate sliver, or a GeometryCollection mixing in
    stray Point/LineString debris -- same artifact already documented in
    build_podregiony.py/build_wojewodztwa.py's dissolve step. Keep only the
    real polygon area either way, don't assume which shape make_valid()
    handed back."""
    if geom.geom_type == "Polygon":
        return geom
    if geom.geom_type == "MultiPolygon":
        parts = list(geom.geoms)
    elif geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        parts = [p for poly in polys for p in (poly.geoms if poly.geom_type == "MultiPolygon" else [poly])]
    else:
        raise ValueError(f"unexpected geometry type: {geom.geom_type}")
    if not parts:
        raise ValueError("no polygonal area found")
    kept = [p for p in parts if p.area > MIN_FRAGMENT_AREA_DEG2]
    if not kept:
        kept = [max(parts, key=lambda p: p.area)]
    return kept[0] if len(kept) == 1 else MultiPolygon(kept)


def clean_geometry(geojson_dict):
    """toposimplify() can leave a handful of self-intersecting rings behind
    (29 out of 2479 in the gmina run this was built against) -- which
    features are affected isn't predictable ahead of time, so this checks
    every feature rather than trying to guess."""
    fixed = 0
    for f in geojson_dict["features"]:
        g = shape(f["geometry"])
        if not g.is_valid:
            f["geometry"] = mapping(extract_polygonal(make_valid(g)))
            fixed += 1
    if fixed:
        print(f"  fixed {fixed} invalid geometries")
    return geojson_dict


def build_clean_topology(geojson_dict, level):
    topo = tp.Topology(geojson_dict, prequantize=PREQUANTIZE, topology=True)
    topo = topo.toposimplify(TOPOSIMPLIFY_EPSILON[level], prevent_oversimplify=True)
    return clean_geometry(json.loads(topo.to_geojson()))


def split_2025_gminy(gmina_geojson):
    """Divides PRG's pre-split Kamienica and Suprasl into today's 4 units,
    using the CURRENT vendored gminy.json's own Kamienica/Szczawa and
    Suprasl/Grabowka boundary as the dividing line -- see module docstring.

    The PARENT piece (Kamienica, Suprasl -- the name/TERYT that existed
    before AND after the split) is carved out first, via intersection with
    a small buffer around its own current vendored shape (the buffer only
    needs to cover the vendored file's own imprecision, not bridge any real
    gap). The CHILD piece (Szczawa, Grabowka) is then simply "whatever's
    left of the old combined shape" -- old_geom.difference(parent_piece) --
    which guarantees the two pieces exactly partition the original area
    with neither overlap nor gap between them, regardless of exactly how
    accurate the vendored dividing line itself is."""
    vendored = json.load(open(f"{ROOT}/data/gminy.json", encoding="utf-8"))
    vendored_by_teryt = {f["properties"]["JPT_KOD_JE"]: shape(f["geometry"]) for f in vendored["features"]}

    # (old PRG teryt/name, parent (kept) teryt+name+vendored-match, child (new) teryt+name)
    splits = [
        ("1207052", ("1207052", "Kamienica", "1207052"), ("1207132", "Szczawa")),
        ("2002093", ("2002093", "Supraśl", "2002093"), ("2002162", "Grabówka")),
    ]

    by_teryt = {f["properties"]["JPT_KOD_JE"]: f for f in gmina_geojson["features"]}

    for old_teryt, (parent_teryt, parent_name, parent_vendored_teryt), (child_teryt, child_name) in splits:
        old_geom = shape(by_teryt.pop(old_teryt)["geometry"])
        parent_vendored = vendored_by_teryt[parent_vendored_teryt]
        parent_piece = old_geom.intersection(parent_vendored.buffer(0.003))
        child_piece = old_geom.difference(parent_piece)
        for teryt, name, geom in [(parent_teryt, parent_name, parent_piece), (child_teryt, child_name, child_piece)]:
            by_teryt[teryt] = {
                "type": "Feature",
                "properties": {"JPT_KOD_JE": teryt, "JPT_NAZWA_": name},
                "geometry": mapping(geom),
            }

    gmina_geojson["features"] = list(by_teryt.values())
    return gmina_geojson


def main():
    print("Reading PRG powiat shapefile...")
    powiat_raw = read_shapefile_as_geojson(f"{PRG_DIR}/A02_Granice_powiatow")
    print(f"  {len(powiat_raw['features'])} features")

    print("Building clean topology (powiat)...")
    powiat_clean = build_clean_topology(powiat_raw, "powiat")
    json.dump(powiat_clean, open(f"{ROOT}/data/powiaty.json", "w", encoding="utf-8"), ensure_ascii=False)
    print(f"  wrote data/powiaty.json")

    print("Reading PRG gmina shapefile...")
    gmina_raw = read_shapefile_as_geojson(f"{PRG_DIR}/A03_Granice_gmin")
    print(f"  {len(gmina_raw['features'])} features")

    print("Building clean topology (gmina)...")
    gmina_clean = build_clean_topology(gmina_raw, "gmina")

    print("Splitting 2025 gmina divisions (Kamienica/Szczawa, Suprasl/Grabowka)...")
    # Must run before data/gminy.json is overwritten below -- split_2025_gminy
    # reads it as the vendored reference for the split line. A re-run against
    # an updated PRG snapshot would need the vendored file restored first;
    # this is a one-time migration, not a routine re-run.
    gmina_clean = split_2025_gminy(gmina_clean)
    gmina_clean = clean_geometry(gmina_clean)  # intersection/difference in the split above can also produce invalid rings
    print(f"  now {len(gmina_clean['features'])} features")

    json.dump(gmina_clean, open(f"{ROOT}/data/gminy.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("  wrote data/gminy.json")


if __name__ == "__main__":
    main()
