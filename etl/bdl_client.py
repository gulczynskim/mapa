import os
import re
import time

import requests

BASE_URL = "https://bdl.stat.gov.pl/api/v1"

# BDL tags every value with an attrId qualifying what "val" actually means --
# most values are attrId 0/1 (plain value) or one of several "real value,
# just with a footnote" flags (3/9/11/13/20/21/97: incomplete aggregate,
# preliminary estimate, methodology change, low precision, city+powiat
# combined -- all real numbers, keep as-is) or "genuinely zero" flags (94/98:
# BDL's own docs give natural increase = 0 as the example -- a real zero
# from balancing nonzero inputs) or "rounds to zero" flags (7/17: value
# smaller than the presentation format -- still real, e.g. 0.001%). Confirmed
# live against /attributes (2026-07): only these five mean the cell is
# actually EMPTY, not a real zero -- BDL still reports val=0 for these, which
# would otherwise silently misrepresent "no data" as "zero" on the map:
#   4/14 -- tajemnica statystyczna / brak informacji (statistical secrecy or
#           genuinely unable to fill the cell)
#   91    -- same as 4, kept as a separate id for an older table revision
#   15    -- "-" placeholder, gap from a presentation-level or unit-list change
#   50    -- not yet published ("będzie dostępna")
# Confirmed with a live example: BDL variable 1729439 (P4283, sekcja D,
# grudzień), powiat kozienicki (071422707000) 2022 & 2024 both have
# attrId=91/val=0 for mężczyźni AND kobiety while ogółem is a real nonzero
# value in the same year -- exactly the "unjustified 0" bug this guards
# against.
MISSING_ATTR_IDS = {4, 14, 15, 50, 91}


def _headers():
    api_key = os.environ.get("BDL_API_KEY")
    return {"X-ClientId": api_key} if api_key else {}


def _get(url, params):
    """GET with 429 retry -- BDL's own Retry-After isn't the plain-integer
    HTTP spec format, it's a Polish string like "221 sek", so pull the
    leading number out instead of assuming it parses as a bare float
    (confirmed hitting this for real while fetching a large variable batch)."""
    for attempt in range(6):
        resp = requests.get(url, params=params, headers=_headers())
        if resp.status_code == 429:
            m = re.search(r"\d+", resp.headers.get("Retry-After", ""))
            wait = int(m.group()) if m else 5 * (attempt + 1)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


def fetch_variable_data(variable_id, unit_level=5, year=None):
    """Fetch all pages of BDL time-series data for one variable, across all units at the given level."""
    url = f"{BASE_URL}/data/by-variable/{variable_id}"
    params = {"unit-level": unit_level, "page-size": 100, "format": "json"}
    if year is not None:
        params["year"] = year

    results = []
    page = 0
    while True:
        params["page"] = page
        resp = _get(url, params)
        data = resp.json()
        page_results = data.get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    return results


def flatten(label, raw_results):
    """Turn BDL's nested by-unit results into long-format rows: label, unit_id, unit_name, year, value.
    value is None both when BDL's own "val" is null and when attrId marks the
    cell as suppressed/unavailable (see MISSING_ATTR_IDS) -- callers never
    need to look at attrId themselves."""
    rows = []
    for entry in raw_results:
        unit_id = entry.get("id")
        unit_name = entry.get("name")
        for v in entry.get("values", []):
            val = v.get("val")
            if v.get("attrId") in MISSING_ATTR_IDS:
                val = None
            rows.append({
                "variable_id": label,
                "unit_id": unit_id,
                "unit_name": unit_name,
                "year": int(v["year"]),
                "value": val,
            })
    return rows


def unit_id_to_teryt(unit_id, level=5):
    """BDL unit ids encode województwo+podregion/powiat/gmina in a fixed
    pattern (see GUS_API.ipynb precedent), but the slice offset for the
    second part is DIFFERENT per level -- don't assume one offset generalizes.
    The leading zero must be stripped via int conversion first -- BDL ids
    are otherwise inconsistent-width and the offsets below only line up
    after normalizing that way (matches the notebook's
    df['id'].astype(int).astype(str)).

    Every offset below was cross-checked against an authoritative source,
    not assumed:
      level=5 (powiat): woj(2) + powiat(2) = normalized[1:3] + normalized[6:8].
        Verified 100% match against boundary-file TERYT.
      level=6 (gmina): normalized[1:3] + normalized[6:11] (adds gmina(2) +
        typ(1)). Verified against boundary TERYT for Bochnia/Drwinia/Łapanów.
        The powiat-width slice truncates the gmina digits and type entirely
        (produces garbage like "0000201").
      level=4 (podregion): normalized[1:3] + normalized[4:6] -- a DIFFERENT
        slice position than powiat/gmina, not just a different width.
        Verified against the "Podregion" column in the GUS wage publication
        (Krakowski=1220, Miasto Kraków=1221, Nowosądecki=1222, Nowotarski=
        1269, Bielski=2444). No boundary file exists for this level to cross-
        check against, so this was the only available ground truth.
    """
    normalized = str(int(unit_id))
    if level == 6:
        return normalized[1:3] + normalized[6:11]
    if level == 4:
        return normalized[1:3] + normalized[4:6]
    return normalized[1:3] + normalized[6:8]


def resolve_gmina_teryt(unit_id, unit_name):
    """unit_id_to_teryt's positional slicing assumes standard post-2002 gmina
    unit_ids -- it mis-decodes BDL's separate pre-2002 "Warszawa" legacy block
    (e.g. id 071412831041 named "Warszawa - Centrum do 2001") into fake-
    looking but plausible 7-digit codes sharing a "1431..." prefix. Those
    aren't real TERYT gminas; the block mixes one citywide-total row with
    individual (now nonexistent) dzielnica rows at the same nominal level.

    Any gmina-level (level=6) fetch needs to run its unit_name through this
    first, not just unit_id_to_teryt directly -- the citywide row
    ("M.st.Warszawa do <year>") is the direct predecessor of today's single
    Warszawa gmina (1465011, confirmed continuous from 2002 onward), remapped
    there; the dzielnica/union/undetermined rows have no current single-
    gmina equivalent and resolve to None (caller should drop those rows),
    matching the "exclude Warsaw's district races entirely, don't roll them
    up" convention already used for the PKW election data.
    """
    if unit_name and unit_name.startswith("M.st.Warszawa do "):
        return "1465011"
    if unit_name and (
        unit_name.startswith("Warszawa - ")
        or unit_name.startswith("Związek gmin dzielnic Warszawy")
        or unit_name.startswith("GMINY-DZIELNICY WARSZAWY")
    ):
        return None
    return unit_id_to_teryt(unit_id, level=6)
