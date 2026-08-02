"""
Extends fix_thin_peninsulas.py's water-inclusion fix from 3 gminy/2 powiaty
(Hel, Jastarnia, Krynica Morska, pucki, nowodworski -- the worst, severely
under-sampled cases) to EVERY coastal gmina/powiat along the Polish Baltic
coast, after the user reported that Gdańsk and Gdynia (among others) still
rendered with large chunks of sea included.

COASTAL UNIT DETECTION: dissolve all powiat polygons (data/powiaty.json)
into Poland's outline via unary_union, take the exterior ring, keep only the
Baltic-facing northern arc (lat > 53.85 and lon < 19.9, to exclude the NE
land border with Lithuania/Kaliningrad), buffer it ~0.01 deg, then test
which gmina/powiat polygons share enough boundary length with that buffer
(>0.01 deg) to count as "coastal". Gives 34 gminy / 13 powiaty, incl. the 5
already fixed by fix_thin_peninsulas.py and Sopot (2264011) -- which is
correctly EXCLUDED, since its boundary doesn't extend past the shoreline
and needs no fix.

GML PARSING BUG (found and fixed this round): fix_thin_peninsulas.py's
fetch_prg_bbox() blindly flattens every <gml:posList> found anywhere inside
a feature into one "rings" list, then builds Polygon(rings[0], holes=
rings[1:]). That's wrong whenever a unit's real PRG geometry is a
<gml:MultiSurface> with multiple separate <gml:surfaceMember><gml:Polygon>
parts (disjoint pieces, not holes-in-one-polygon) -- confirmed for Gdynia,
whose first surfaceMember is a tiny ~10-point exclave and the second is the
real ~2014-point main city boundary. The naive parser silently grabbed only
the first (tiny, wrong) ring, computing a bogus 26.5 km2 for Gdańsk (real
~262 km2) and 0 relevant coastline ways for Gdynia (so it got skipped
outright). Fixed here by walking gml:surfaceMember > gml:Polygon >
exterior/interior explicitly and keeping every part.

LAND/SEA CLASSIFICATION: same core idea as fix_thin_peninsulas.py --
polygonize(admin_polygon.boundary + nearby OSM coastline ways) into faces,
keep the LAND ones. Two classifiers are used:
  - classify_v1 (default): each face's centroid is matched to its nearest
    coastline way, and OSM's land-left/sea-right winding convention decides
    the side. Correct for the large majority of units, including verified
    against known figures (Gdańsk 260.7 km2, Gdynia 132.7 km2, Hel 21.4 km2,
    Jastarnia 8.1 km2, Stegna 170.7 km2).
  - classify_v7 (two units only: Sztutowo 2210052, Elbląg-gmina 2804012):
    seeds land from the admin polygon's pole of inaccessibility (its most
    "interior" point -- reliable here because water-inclusion is a minority
    of the polygon reaching in from one edge) and flood-fills face adjacency,
    flipping side on every face-to-face shared edge. v1 gave visibly wrong
    results for exactly these two (confirmed by testing whether the
    resulting land region contains known real village locations, and by
    visual inspection of the polygonize output) -- both are Vistula/Zalew
    Wiślany lagoon-mouth cases with dozens of short, locally tangled OSM
    coastline fragments where "nearest way to an interior centroid" picks
    up an unrelated nearby fragment instead of the fragment that actually
    borders that face.
No single method got every unit right; each was cross-checked against the
other and, for every disagreement, resolved by visual plot and/or a
known-real-world reference point (a village guaranteed to be on land, or a
documented land-area figure) before picking a winner -- see the 2026-07-22
conversation for the full per-unit adjudication.

EXCLUDED from this pass:
  - Hel (2211011), Jastarnia (2211023), Krynica Morska (2210011), powiat
    pucki (2211), powiat nowodworski (2210): already fixed and verified by
    fix_thin_peninsulas.py; re-running this script's method on them with the
    broader (noisier) merged coastline dataset gave slightly different,
    unverified numbers, so their existing geometry is left untouched.
  - Wicko (2208052): flagged by the coastal-detection heuristic (its
    polygon falls within the buffered coastal-arc zone) but its admin
    boundary does not actually reach any OSM-tagged coastline -- confirmed
    by direct plot, the boundary stays entirely inland of Łebsko lake/the
    national park dune strip. No fix needed; land == admin already.

This is NOT meant to be re-run casually -- like fix_thin_peninsulas.py it
depends on slow/flaky live services (GUGiK PRG WFS, Overpass, several
mirrors and manual bbox-splitting were needed to get full coastline
coverage) and on the per-unit method choice documented above, which was
derived through manual cross-checking, not something this script can
re-derive on its own. It's committed as the record of how the current
geometry for these 30 gminy / 11 powiaty was produced.
"""

import json
import os
import time

import numpy as np
import requests
from lxml import etree
from pyproj import Transformer
from shapely.algorithms.polylabel import polylabel
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import polygonize, unary_union
from shapely.validation import make_valid

OUT_DIR = "../data"

PRG_WFS_URL = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries"
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

ALREADY_FIXED_GMINAS = {"2211011", "2211023", "2210011"}
ALREADY_FIXED_POWIATY = {"2211", "2210"}
NO_FIX_NEEDED_GMINAS = {"2208052"}  # Wicko -- doesn't reach the coast
USE_FLOODFILL = {"2210052", "2804012"}  # Sztutowo, Elblag -- see module docstring

# Baltic-facing coastal gminy/powiaty, derived via the dissolve+buffer
# method described in the module docstring (regenerate with
# find_coastal_units() below if boundaries change enough to matter).
COASTAL_GMINAS = [
    "2211023", "2211043", "2211011", "2211062", "3263011", "2212102", "2212092",
    "3213032", "3213052", "2208021", "3209053", "3207043", "2262011", "3208011",
    "2802022", "2804093", "3205072", "3205083", "3207013", "2215042", "2261011",
    "3208042", "3208072", "2210042", "2210052", "3209073", "2212011", "2211052",
    "3209012", "3213011", "2802033", "2208052", "2210011", "2804012",
]
COASTAL_POWIATY = [
    "2211", "2210", "3263", "3208", "3207", "3209", "3205", "2802", "2262",
    "2208", "2215", "2261", "2804",
]

# Generous regional bboxes covering the whole coast, split to stay under
# Overpass/GUGiK size & timeout limits (minlat, minlon, maxlat, maxlon).
#
# Real coverage gap found and fixed 2026-08-02: for lon > 17.00, no tile
# covered lat < 54.30 -- Elbląg-gmina (2804012, lat 54.03-54.28, lon
# 19.25-19.59) and powiat elbląski (2804, lat down to 53.93) fall entirely
# in that gap, causing a KeyError crash mid-run (before any file write, so
# harmless) rather than a silent bad result. Tile 5 below closes it.
GMINA_BBOXES = [
    (53.85, 14.20, 54.10, 15.10),
    (53.75, 14.80, 54.60, 17.00),
    (54.30, 16.55, 54.85, 18.05),
    (54.30, 17.85, 54.85, 19.90),
    (53.85, 17.75, 54.40, 20.10),
]
POWIAT_BBOXES = GMINA_BBOXES


def find_coastal_units(gminy_path="../data/gminy.json", powiaty_path="../data/powiaty.json"):
    """Regenerates COASTAL_GMINAS/COASTAL_POWIATY from scratch. Not called by
    __main__ (the lists above are already derived and pinned) -- kept as the
    record of the method in case boundaries change enough to need redoing."""
    from shapely.geometry import shape
    from shapely.ops import unary_union as union_

    powiaty = json.load(open(powiaty_path, encoding="utf-8"))
    polys = [make_valid(shape(f["geometry"])) for f in powiaty["features"]]
    poland = union_(polys)
    poland = max(poland.geoms, key=lambda p: p.area) if poland.geom_type == "MultiPolygon" else poland
    ring = poland.exterior
    coastal_coords = [(x, y) for x, y in ring.coords if y > 53.85 and x < 19.9]
    from shapely.geometry import LineString

    coastal_arc = LineString(coastal_coords).buffer(0.01)

    def is_coastal(geom):
        """True if `geom`'s boundary shares more than 0.01 deg of length
        with the buffered Baltic-facing coastal arc."""
        return geom.boundary.intersection(coastal_arc).length > 0.01

    gminy = json.load(open(gminy_path, encoding="utf-8"))
    gmina_kods = [
        f["properties"]["JPT_KOD_JE"]
        for f in gminy["features"]
        if is_coastal(make_valid(shape(f["geometry"])))
    ]
    powiat_kods = [
        f["properties"]["JPT_KOD_JE"]
        for f in powiaty["features"]
        if is_coastal(make_valid(shape(f["geometry"])))
    ]
    return gmina_kods, powiat_kods


def fetch_prg_bbox(bbox, type_name):
    """Like fix_thin_peninsulas.py's version, but MultiSurface-aware: walks
    gml:surfaceMember > gml:Polygon > exterior/interior explicitly instead
    of flattening every gml:posList in the feature -- see module docstring."""
    minlat, minlon, maxlat, maxlon = bbox
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": type_name,
        "bbox": f"{minlat},{minlon},{maxlat},{maxlon},urn:ogc:def:crs:EPSG::4326",
    }
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(PRG_WFS_URL, params=params, timeout=180)
            r.raise_for_status()
            break
        except requests.RequestException as e:
            last_err = e
            time.sleep(5)
    else:
        raise RuntimeError(f"PRG WFS fetch failed after 3 attempts: {last_err}")

    ns = {"gml": "http://www.opengis.net/gml/3.2", "ms": "http://mapserver.gis.umn.edu/mapserver"}
    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)
    type_local = type_name.split(":")[-1]

    def ring_lonlat(poslist_text):
        """Parses one GML <gml:posList> text blob (flat N,E pairs in
        EPSG:2180) into a list of (lon, lat) tuples in EPSG:4326."""
        nums = [float(x) for x in poslist_text.split()]
        en_pairs = list(zip(nums[1::2], nums[0::2]))  # PRG posList is (N, E) -- swap to (E, N)
        return [transformer.transform(e, n) for e, n in en_pairs]

    root = etree.fromstring(r.content)
    out = {}
    for member in root.findall(f".//ms:{type_local}", ns):
        kod = member.find("ms:JPT_KOD_JE", ns).text
        nazwa = member.find("ms:JPT_NAZWA_", ns).text
        parts = []
        for polygon_el in member.findall(".//gml:Polygon", ns):
            ext = polygon_el.find("gml:exterior/gml:LinearRing/gml:posList", ns)
            if ext is None:
                continue
            holes = [
                ring_lonlat(h.text)
                for h in polygon_el.findall("gml:interior/gml:LinearRing/gml:posList", ns)
            ]
            parts.append((ring_lonlat(ext.text), holes))
        out[kod] = {"name": nazwa, "parts": parts}
    return out


def build_admin_geom(parts):
    """Converts fetch_prg_bbox's per-feature `parts` list (each a (exterior,
    holes) ring pair, since a MultiSurface feature can have several disjoint
    polygon parts) into a single shapely Polygon/MultiPolygon."""
    polys = []
    for ext, holes in parts:
        p = make_valid(Polygon(ext, holes))
        polys.extend(p.geoms if p.geom_type == "MultiPolygon" else [p])
    return polys[0] if len(polys) == 1 else unary_union(polys)


def fetch_coastline_bbox(bbox):
    """Queries Overpass (trying each mirror in OVERPASS_MIRRORS in turn) for
    every OSM way tagged natural=coastline within `bbox`, returning them as
    shapely LineStrings."""
    minlat, minlon, maxlat, maxlon = bbox
    query = f"""
    [out:json][timeout:150];
    way["natural"="coastline"]({minlat},{minlon},{maxlat},{maxlon});
    out geom;
    """
    from shapely.geometry import LineString

    headers = {"User-Agent": "mapa-nierownosci-plci-etl/1.0 (one-off boundary fix)"}
    last_err = None
    for base in OVERPASS_MIRRORS:
        for attempt in range(3):
            try:
                r = requests.post(base, data={"data": query}, headers=headers, timeout=200)
                if r.status_code == 200:
                    data = r.json()
                    return [
                        LineString([(p["lon"], p["lat"]) for p in el["geometry"]])
                        for el in data["elements"]
                        if el.get("geometry") and len(el["geometry"]) >= 2
                    ]
            except requests.RequestException as e:
                last_err = e
            time.sleep(8)
    raise RuntimeError(f"all Overpass mirrors failed: {last_err}")


def build_faces(admin, coastline_ways, buf=0.001):
    """Filters `coastline_ways` down to the ones near `admin`'s boundary,
    then polygonizes their union with `admin`'s own boundary into candidate
    land/sea "faces" for a classifier to sort. Returns (relevant_ways,
    faces), or (None, None) if no coastline way is near enough to matter."""
    relevant = [w for w in coastline_ways if w.intersects(admin.buffer(buf))]
    if not relevant:
        return None, None
    merged = unary_union(relevant + [admin.boundary])
    faces = [f for f in polygonize(merged) if f.within(admin.buffer(buf * 0.5))]
    return relevant, faces


def classify_v1(admin, relevant, faces):
    """Nearest-coastline-way winding (land is left of the way's own
    direction, OSM convention). Default classifier -- see module docstring."""

    def classify(pt):
        """True (land) if `pt` sits to the left of its nearest coastline
        way's own direction of travel -- OSM's land-left/sea-right coastline
        winding convention."""
        way = min(relevant, key=lambda w: w.distance(pt))
        s = way.project(pt)
        eps = max(way.length * 1e-6, 1e-9)
        s0, s1 = max(0, s - eps), min(way.length, s + eps)
        if s1 == s0:
            s1 = min(way.length, s0 + eps)
        a, b = way.interpolate(s0), way.interpolate(s1)
        dx, dy = b.x - a.x, b.y - a.y
        tx, ty = pt.x - a.x, pt.y - a.y
        return (dx * ty - dy * tx) > 0

    land_faces = [f for f in faces if classify(f.centroid)]
    return unary_union(land_faces) if land_faces else None


def classify_v7_floodfill(admin, faces):
    """Pole-of-inaccessibility seed + face-adjacency flood fill. Only used
    for Sztutowo/Elblag -- see module docstring for why v1 fails there."""
    if len(faces) <= 1:
        return admin
    largest = admin if admin.geom_type == "Polygon" else max(admin.geoms, key=lambda p: p.area)
    seed_pt = polylabel(largest, tolerance=0.0005)
    seed_idx = next((i for i, f in enumerate(faces) if f.contains(seed_pt)), None)
    if seed_idx is None:
        seed_idx = max(range(len(faces)), key=lambda i: faces[i].area)
    n = len(faces)
    adj = [[False] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            shared = faces[i].boundary.intersection(faces[j].boundary)
            if not shared.is_empty and shared.length > 1e-8:
                adj[i][j] = adj[j][i] = True
    classified = {seed_idx: True}
    queue = [seed_idx]
    while queue:
        cur = queue.pop()
        for j in range(n):
            if adj[cur][j] and j not in classified:
                classified[j] = not classified[cur]
                queue.append(j)
    for i in range(n):
        classified.setdefault(i, False)
    land_faces = [faces[i] for i in range(n) if classified[i]]
    return unary_union(land_faces) if land_faces else None


def land_only(admin, coastline_ways, kod):
    """Builds the land-only geometry for one unit: runs build_faces then
    picks classify_v7_floodfill or classify_v1 depending on whether `kod` is
    in USE_FLOODFILL. Returns None if no relevant coastline was found."""
    relevant, faces = build_faces(admin, coastline_ways)
    if relevant is None:
        return None
    if kod in USE_FLOODFILL:
        return classify_v7_floodfill(admin, faces)
    return classify_v1(admin, relevant, faces)


def significant_parts(geom, min_km2=0.02):
    """Returns `geom`'s polygon part(s) whose approximate area (converted
    from degrees² at this latitude) is at least `min_km2`, dropping smaller
    noise fragments."""
    def km2(g):
        """Approximate area of shapely geometry `g`, in km², at this
        latitude."""
        return g.area * 111.32 * 111.32 * 0.586

    if geom.geom_type == "Polygon":
        return [geom] if km2(geom) >= min_km2 else []
    return [p for p in geom.geoms if km2(p) >= min_km2]


def finalize(land):
    """Repairs `land`'s validity, drops insignificant fragments via
    significant_parts, and returns a single Polygon/MultiPolygon (or None if
    nothing significant remains)."""
    land = make_valid(land)
    parts = significant_parts(land)
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


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


def replace_features(path, new_geoms):
    """Overwrites the geometry of every feature in `path` whose teryt is a
    key in `new_geoms`, in place; asserts every requested replacement was
    actually found (catches a typo'd/missing teryt immediately rather than
    silently leaving old geometry behind)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    replaced = 0
    for feature in data["features"]:
        kod = feature["properties"]["JPT_KOD_JE"]
        if kod in new_geoms:
            feature["geometry"] = new_geoms[kod]
            replaced += 1
    assert replaced == len(new_geoms), f"expected {len(new_geoms)} replacements in {path}, got {replaced}"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{path}: replaced {replaced} features")


def run(units, bboxes, type_name, exclude, no_fix, out_path):
    """Entry point for one level (gmina or powiat): fetches PRG geometry and
    OSM coastline for `bboxes`, computes each unit in `units` (skipping
    `exclude`/`no_fix`) down to its land-only shape via land_only+finalize,
    and writes the results into `out_path` via replace_features."""
    prg = {}
    for bbox in bboxes:
        prg.update(fetch_prg_bbox(bbox, type_name))
    coastline = []
    for bbox in bboxes:
        coastline.extend(fetch_coastline_bbox(bbox))

    new_geoms = {}
    for kod in units:
        if kod in exclude or kod in no_fix:
            continue
        admin = build_admin_geom(prg[kod]["parts"])
        land = land_only(admin, coastline, kod)
        if land is None:
            print(f"  {kod} ({prg[kod]['name']}): no relevant coastline found, skipping")
            continue
        final = finalize(land)
        if final is None:
            print(f"  {kod} ({prg[kod]['name']}): finalized geometry empty, skipping")
            continue
        km2 = final.area * 111.32 * 111.32 * 0.586
        print(f"  {kod} ({prg[kod]['name']}): {km2:.1f} km2")
        new_geoms[kod] = round_coords(mapping(final))

    replace_features(out_path, new_geoms)


if __name__ == "__main__":
    print("Fixing coastal gminy...")
    run(COASTAL_GMINAS, GMINA_BBOXES, "ms:A03_Granice_gmin", ALREADY_FIXED_GMINAS, NO_FIX_NEEDED_GMINAS, os.path.join(OUT_DIR, "gminy.json"))
    print("Fixing coastal powiaty...")
    run(COASTAL_POWIATY, POWIAT_BBOXES, "ms:A02_Granice_powiatow", ALREADY_FIXED_POWIATY, set(), os.path.join(OUT_DIR, "powiaty.json"))
    print("Now re-run build_wojewodztwa.py and build_podregiony.py to propagate the powiat fix.")
