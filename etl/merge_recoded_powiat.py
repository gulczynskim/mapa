"""
Powiat-level counterpart to merge_recoded_gminy.py: fixes historical powiat
TERYT codes that have real data with no current-day home, found via
audit_data.py flagging them as orphan teryts. Merge logic itself lives in
teryt_recode_merge.py, shared with the gmina-level script -- this file only
holds the powiat-specific (old, new) pairs and which files to apply them to.

Run once (or after any BDL re-fetch of the affected files -- BDL's own
historical unit ids are what surface these old codes again). Safe to re-run:
a pair with no old-code data left is a no-op.
"""

from teryt_recode_merge import merge_variable_file

DATA_DIR = "../data"

# (old teryt, new teryt): Wałbrzych city ("miasto na prawach powiatu") used
# its own separate code 1999-2002, before a 2002-06 Rada Ministrów
# rozporządzenie merged it INTO powiat wałbrzyski (0221) effective
# 2003-01-01 -- confirmed via the dedicated "Powiat wałbrzyski" Wikipedia
# article. 0221 itself is unaffected/unchanged throughout (it already has
# continuous 2002-2025 data under its own current code -- correct, since a
# powiat absorbing territory keeps its own code, same pattern as a gmina
# merge). The city regained separate powiat status 2013-01-01, but under a
# DIFFERENT new code, 0265, rather than reclaiming 0263 -- so 0263's only
# surviving data (2002, its last year as an independent unit before the
# merger) has no current-day match. Confirmed via density: 0263's 2002
# value (1529.9/km²) is close to 0265's own 2013 value (1392.3/km², gradual
# decline), nothing like 0221's rural 139.1/km² -- ground-truth confirmation
# this is really Wałbrzych city's own older code, not noise.
# Found 2026-07-28 via audit_data.py orphan-teryt check across
# gestosc_zaludnienia/wynagrodzenia/kluby_sportowe/wypadki_przy_pracy (the
# only 4 powiat-level BDL variables with data old enough to include 2002).
RECODED_PAIRS = [
    ("0263", "0265"),  # Wałbrzych (miasto), pre-2003 code -> current code
]

VARIABLE_FILES = [
    "gestosc_zaludnienia.json",
    "wynagrodzenia.json",
    "kluby_sportowe.json",
    "wypadki_przy_pracy.json",
]


if __name__ == "__main__":
    print("Merging recoded powiaty's old-code data into their current TERYT...")
    for fname in VARIABLE_FILES:
        merge_variable_file(f"{DATA_DIR}/{fname}", RECODED_PAIRS)
