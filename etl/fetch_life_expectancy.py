"""
Trwanie życia (P2730), podregion level -- confirms the pitch's "tylko
podregiony" expectation. Age threshold (0/15/30/45/60/65) becomes the
ageGroups dimension. Only the "ogółem" area variant is pulled (not the
separate w miastach / na wsi split) -- keeps this a straight sex comparison
without a third area dimension.

NOT wired into variables.js/frontend yet: the map has no podregion
boundaries loaded. Data is ready for whenever that gets added.

No combined-sex ("t") value exists in this table at all (BDL only
publishes mężczyźni/kobiety here, no ogółem variant), and averaging two
life-expectancy figures without population weights would be wrong the same
way E8's combined median would be -- so t is left null throughout.
"""

import json
import os

import pandas as pd
from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"
LEVEL = 4  # podregion

# age threshold -> {sex: variable_id}
AGE_VARS = {
    "0": {"m": "101554", "k": "101555"},
    "15": {"m": "105836", "k": "105837"},
    "30": {"m": "105845", "k": "105846"},
    "45": {"m": "105854", "k": "105855"},
    "60": {"m": "105863", "k": "105864"},
    "65": {"m": "101563", "k": "101564"},
}

if __name__ == "__main__":
    out = {}
    for age, ids in AGE_VARS.items():
        for sex, var_id in ids.items():
            raw = fetch_variable_data(var_id, unit_level=LEVEL)
            for row in flatten(sex, raw):
                teryt = unit_id_to_teryt(row["unit_id"], level=LEVEL)
                year = str(row["year"])
                slice_ = out.setdefault(teryt, {}).setdefault(year, {}).setdefault(f"{age}__default", {"t": None, "m": None, "k": None})
                slice_[sex] = row["value"]
        print(f"  age {age}: done")

    path = os.path.join(OUT_DIR, "life_expectancy.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"life_expectancy: {len(out)} regions -> {path}")
