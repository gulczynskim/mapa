"""
Fixes gminy.json's three most severely under-simplified coastal boundaries:
Hel (2211011), Jastarnia (2211023), and Krynica Morska (2210011). All three
are thin peninsula/spit towns represented with only 11-20 points in the
vendored source (github.com/waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-
Gminy) -- by far the coarsest of any gmina nationally. At that point count, a
long thin curving shape can only be approximated by straight chords that cut
across the bay/lagoon rather than following the coast, ballooning the
polygon's area to 4.5-5.5x the real land area (confirmed live against
official government data below) and rendering as an unrecognizable blob
instead of a peninsula.

Every other coastal gmina in this dataset ALSO legitimately extends into
adjacent sea/bay water (that's real, official Polish administrative
geography, e.g. Gdynia's official area is ~2.9x its land area) -- but they
have 60-390 points, enough to still read as a recognizable coastline. This
script deliberately does NOT touch those; the problem here is specifically
the combination of water-inclusion AND severe under-sampling, not water-
inclusion alone. Run `audit_data.py` or re-derive the point-count table in
this docstring's investigation if other candidates ever need checking.

Method (verified live, see the 2026-07-22 conversation for the full
investigation):
  1. Fetch the OFFICIAL boundary from GUGiK's PRG WFS (mapy.geoportal.gov.pl),
     the authoritative Polish government source this vendored file was
     itself ultimately derived from -- CQL_FILTER is silently ignored by
     this server (returns the entire national layer, ~150MB+), so a small
     bbox filter is used instead. Geometry comes back in EPSG:2180 (Poland
     CS92) with axis order (N, E), not (E, N) -- confirmed by the resulting
     coordinates landing outside Poland entirely when un-swapped.
  2. This official boundary has 10-20x more points than the vendored file
     but the SAME water-inclusive area -- confirming the water inclusion is
     a genuine feature of the official boundary, not a vendoring bug. Most
     of its perimeter (>95% of points) tightly hugs the real coast; only one
     contiguous stretch per gmina (a straight-ish maritime/lagoon boundary
     crossing open water) accounts for nearly all the excess area.
  3. Fetch OSM natural=coastline ways for the same area (Overpass), which
     -- unlike the admin boundary -- are drawn with a consistent land-left/
     sea-right winding convention.
  4. Use the coastline ways as internal cutting lines against the official
     polygon's own boundary (shapely polygonize on the union of both),
     classify each resulting face LAND/SEA via that winding convention, and
     keep only the LAND faces. Validated by area: Hel's result (21.4 km²)
     matches its commonly-cited land area almost exactly.

This is NOT meant to be re-run casually -- it depends on two live external
services (GUGiK WFS, Overpass) that were slow/unreliable when this was built
(multiple mirrors and long timeouts were needed). It's committed as the
record of how the current data/gminy.json geometry for these 3 units was
produced, not as a routinely-scheduled ETL step.
"""

import json
import os
import time

import numpy as np
import requests
from pyproj import Transformer
from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union
from shapely.validation import make_valid

OUT_DIR = "../data"

PRG_WFS_URL = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries"
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

# (teryt, PRG fetch bbox, coastline fetch bbox) -- bboxes are generous enough
# to cover the whole peninsula/spit body, not just the one gmina, since Hel
# and Jastarnia share a landmass and need each other's coastline context.
UNITS = {
    "2211011": "Hel",
    "2211023": "Jastarnia",
    "2210011": "Krynica Morska",
}
PRG_BBOXES = {
    "hel_peninsula": (54.55, 18.40, 54.79, 18.90),  # covers Hel + Jastarnia
    "krynica": (54.30, 19.10, 54.50, 19.75),
}
COASTLINE_BBOXES = PRG_BBOXES  # same regions


def fetch_prg_bbox(bbox):
    """bbox = (minlat, minlon, maxlat, maxlon). Returns {teryt: {name, rings}}
    with rings already reprojected to WGS84 lon/lat. CQL_FILTER on this
    server returns the whole national layer regardless of the filter value
    (confirmed: a filtered request came back at 150MB+ and was still
    growing when killed) -- bbox is the only reliable way to scope this."""
    minlat, minlon, maxlat, maxlon = bbox
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": "ms:A03_Granice_gmin",
        # axis order must be lat,lon with an explicit CRS URN -- plain
        # lon,lat bbox silently matched zero features on this server.
        "bbox": f"{minlat},{minlon},{maxlat},{maxlon},urn:ogc:def:crs:EPSG::4326",
    }
    # This server (mapy.geoportal.gov.pl) is slow and occasionally times out
    # outright rather than erroring -- a plain retry on the same URL has
    # succeeded after a prior timeout every time this was observed.
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

    from lxml import etree

    root = etree.fromstring(r.content)
    ns = {"gml": "http://www.opengis.net/gml/3.2", "ms": "http://mapserver.gis.umn.edu/mapserver"}
    # EPSG:2180 posList axis order here is (N, E), confirmed by the transform
    # landing in eastern Poland/Belarus (~lon 22-23) when left unswapped.
    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)

    out = {}
    for member in root.findall(".//ms:A03_Granice_gmin", ns):
        kod = member.find("ms:JPT_KOD_JE", ns).text
        nazwa = member.find("ms:JPT_NAZWA_", ns).text
        rings = []
        for poslist in member.findall(".//gml:posList", ns):
            nums = [float(x) for x in poslist.text.split()]
            en_pairs = list(zip(nums[1::2], nums[0::2]))  # -> (E, N)
            rings.append([transformer.transform(e, n) for e, n in en_pairs])
        out[kod] = {"name": nazwa, "rings": rings}
    return out


def fetch_coastline_bbox(bbox):
    """Returns a list of shapely LineStrings for natural=coastline ways in bbox."""
    minlat, minlon, maxlat, maxlon = bbox
    query = f"""
    [out:json][timeout:150];
    way["natural"="coastline"]({minlat},{minlon},{maxlat},{maxlon});
    out geom;
    """
    headers = {"User-Agent": "mapa-nierownosci-plci-etl/1.0 (one-off boundary fix)"}
    last_err = None
    for base in OVERPASS_MIRRORS:
        try:
            r = requests.post(base, data={"data": query}, headers=headers, timeout=170)
            if r.status_code == 200:
                data = r.json()
                lines = []
                for el in data["elements"]:
                    geom = el.get("geometry")
                    if geom and len(geom) >= 2:
                        lines.append(LineString([(p["lon"], p["lat"]) for p in geom]))
                return lines
        except requests.RequestException as e:
            last_err = e
        time.sleep(2)
    raise RuntimeError(f"all Overpass mirrors failed: {last_err}")


def land_only(admin_polygon, coastline_ways):
    """Cuts admin_polygon (water-inclusive) down to just its LAND faces,
    using coastline_ways as internal dividers against the polygon's own
    boundary. Returns a (Multi)Polygon of the land portion(s)."""
    relevant = [w for w in coastline_ways if w.intersects(admin_polygon.buffer(0.001))]
    merged = unary_union(relevant + [admin_polygon.boundary])
    faces = [f for f in polygonize(merged) if f.within(admin_polygon.buffer(0.0005))]

    def classify(pt):
        # Nearest coastline way + nearest segment on it; OSM convention is
        # land-left/sea-right of the way's own direction.
        dist, way = min((w.distance(pt), w) for w in relevant)
        coords = list(way.coords)
        p = np.array(pt.coords[0])
        best = min(
            (
                (np.linalg.norm(p - (a + max(0, min(1, np.dot(p - a, b - a) / (np.dot(b - a, b - a) or 1))) * (b - a))), a, b)
                for a, b in zip(map(np.array, coords), map(np.array, coords[1:]))
            ),
            key=lambda x: x[0],
        )
        _, a, b = best
        direction = b - a
        to_pt = p - a
        cross = direction[0] * to_pt[1] - direction[1] * to_pt[0]
        return cross > 0  # True = land

    land_faces = [f for f in faces if classify(f.centroid)]
    return unary_union(land_faces)


def largest_part(geom):
    if geom.geom_type == "Polygon":
        return geom
    return max(geom.geoms, key=lambda p: p.area)


def main():
    prg_features = {}
    for bbox in PRG_BBOXES.values():
        prg_features.update(fetch_prg_bbox(bbox))

    coastline_by_region = {name: fetch_coastline_bbox(bbox) for name, bbox in COASTLINE_BBOXES.items()}

    hel_poly = make_valid(Polygon(prg_features["2211011"]["rings"][0]))
    jastarnia_poly = make_valid(Polygon(prg_features["2211023"]["rings"][0]))
    krynica_poly = make_valid(Polygon(prg_features["2210011"]["rings"][0]))

    # Hel + Jastarnia share a landmass -- cut them together so the coastline
    # ways along their shared stretch of coast are only classified once,
    # then split the resulting land area back out by which admin polygon
    # each part falls inside.
    peninsula_land = land_only(unary_union([hel_poly, jastarnia_poly]), coastline_by_region["hel_peninsula"])
    hel_final = largest_part(peninsula_land.intersection(hel_poly))
    jastarnia_final = largest_part(peninsula_land.intersection(jastarnia_poly))

    krynica_land = land_only(krynica_poly, coastline_by_region["krynica"])
    # Krynica Morska's land genuinely comes in two separate pieces (a small
    # detached settlement south of the main spit body) -- keep both, unlike
    # Hel's ~2900m2 sliver near the harbor which was dropped as noise.
    krynica_final = krynica_land

    def round_coords(geom_mapping, ndigits=7):
        def rc(c):
            return [round(x, ndigits) for x in c] if isinstance(c[0], (int, float)) else [rc(x) for x in c]

        m = dict(geom_mapping)
        m["coordinates"] = rc(m["coordinates"])
        return m

    new_geoms = {
        "2211011": round_coords(mapping(hel_final)),
        "2211023": round_coords(mapping(jastarnia_final)),
        "2210011": round_coords(mapping(krynica_final)),
    }

    path = os.path.join(OUT_DIR, "gminy.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    replaced = 0
    for feature in data["features"]:
        kod = feature["properties"]["JPT_KOD_JE"]
        if kod in new_geoms:
            feature["geometry"] = new_geoms[kod]
            replaced += 1
            km2 = shape_area_km2(new_geoms[kod])
            print(f"{kod} ({UNITS[kod]}): replaced, land area ~{km2:.1f} km2")

    assert replaced == len(UNITS), f"expected to replace {len(UNITS)} features, replaced {replaced}"

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{path}: {len(data['features'])} features written")


def shape_area_km2(geom_mapping):
    from shapely.geometry import shape

    g = shape(geom_mapping)
    return g.area * 111.32 * 111.32 * 0.586  # rough deg2->km2 at ~54.6N


if __name__ == "__main__":
    main()
