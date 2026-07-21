"""
Pracujący wg sekcji PKD i płci (P4283), powiat level. Raw section x sex
breakdown only -- no segregation index computed (the formula, e.g. Duncan
dissimilarity, is still undecided; see VARIABLES_PLAN.md).

Variable IDs found by inspecting GUS_API.ipynb (cell 51) and cross-checked
live against the BDL API (subjectId=P4283, level=5 for every id below).
This is an annual "styczeń" (as-of-January) snapshot -- checked live and
only 2024-2026 exist, it isn't NSP 2021 despite VARIABLES_PLAN.md's original
guess.

"ogolem" is BDL's own all-sections total (not a computed index) -- included
as an extra selectable slice alongside the 19 PKD sections (A-S).
"""

import json
import os

from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"
LEVEL = 5  # powiat

SECTIONS = {
    "ogolem": {"t": "1651167", "m": "1651168", "k": "1651169"},
    "A": {"t": "1651170", "m": "1651171", "k": "1651172"},
    "B": {"t": "1729336", "m": "1729337", "k": "1729338"},
    "C": {"t": "1651176", "m": "1651177", "k": "1651178"},
    "D": {"t": "1729339", "m": "1729340", "k": "1729341"},
    "E": {"t": "1729342", "m": "1729343", "k": "1729344"},
    "F": {"t": "1651179", "m": "1651180", "k": "1651181"},
    "G": {"t": "1651182", "m": "1651183", "k": "1651184"},
    "H": {"t": "1651185", "m": "1651186", "k": "1651187"},
    "I": {"t": "1651188", "m": "1651189", "k": "1651190"},
    "J": {"t": "1651191", "m": "1651192", "k": "1651193"},
    "K": {"t": "1651194", "m": "1651195", "k": "1651196"},
    "L": {"t": "1651197", "m": "1651198", "k": "1651199"},
    "M": {"t": "1651200", "m": "1651201", "k": "1651202"},
    "N": {"t": "1651203", "m": "1651204", "k": "1651205"},
    "O": {"t": "1651206", "m": "1651207", "k": "1651208"},
    "P": {"t": "1651209", "m": "1651210", "k": "1651211"},
    "Q": {"t": "1651212", "m": "1651213", "k": "1651214"},
    "R": {"t": "1651215", "m": "1651216", "k": "1651217"},
    "S": {"t": "1651218", "m": "1651219", "k": "1651220"},
}

if __name__ == "__main__":
    out = {}
    for section, ids in SECTIONS.items():
        for sex, var_id in ids.items():
            raw = fetch_variable_data(var_id, unit_level=LEVEL)
            for row in flatten(sex, raw):
                teryt = unit_id_to_teryt(row["unit_id"], level=LEVEL)
                year = str(row["year"])
                slice_ = out.setdefault(teryt, {}).setdefault(year, {}).setdefault(
                    f"{section}__default", {"t": None, "m": None, "k": None}
                )
                slice_[sex] = row["value"]
        print(f"  section {section}: done")

    path = os.path.join(OUT_DIR, "pkd_zatrudnienie.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"pkd_zatrudnienie: {len(out)} regions -> {path}")
