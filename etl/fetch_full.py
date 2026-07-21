"""
Full-coverage ETL pass: for the 5 "tight" subjects (already narrowly scoped,
not exploded into hundreds of unrelated dimensions), pull every variable and
every level (podregion/powiat/gmina) that actually has data.

employment_by_pkd (756 variables) and schools (1053 variables) are NOT
expanded here -- their curated subset in variables.py already captures the
target concept (PKD-by-sex for a future segregation index; liceum-by-sex),
and expanding either would pull in a lot of unrelated dimensions. Only their
level coverage is expanded (still using the curated field list), pending the
segregation-index-formula decision before going further.

Level-aware TERYT: unit_id_to_teryt() takes a level argument now (fixed
2026-07-21, validated against real gmina TERYT via boundary data -- see its
docstring). Podregion (level=4) still uses the powiat-width slice as a best
effort and hasn't been separately verified; raw unit_id/unit_name are kept
in every output file so it can be corrected later without re-fetching.
"""

import os

import pandas as pd
from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt
from discover import list_variables, probe_levels, dimension_label
from variables import VARIABLE_GROUPS

load_dotenv()

OUT_DIR = "data_raw"

TIGHT_SUBJECTS = {
    "labor_force_activity": "P4309",
    "unemployment": "P2670",
    "population_by_age_sex": "P4253",
    "agricultural_census": "P4272",
}
# general_county_stats spans 3 subject ids
GENERAL_SUBJECTS = ["P2425", "P1688", "P2381"]


def fetch_and_save(group_name, entries):
    """entries: list of (variable_id, label, level) -- one entry per (variable, level) pair."""
    all_rows = []
    for var_id, label, level in entries:
        raw = fetch_variable_data(var_id, unit_level=level)
        rows = flatten(label, raw)
        for r in rows:
            r["level"] = level
        all_rows.extend(rows)

    df = pd.DataFrame(all_rows)
    if df.empty:
        print(f"  no data for {group_name}")
        return
    df["teryt"] = df.apply(lambda r: unit_id_to_teryt(r["unit_id"], level=r["level"]), axis=1)

    os.makedirs(OUT_DIR, exist_ok=True)
    for level, level_df in df.groupby("level"):
        wide = level_df.pivot_table(
            index=["teryt", "unit_id", "unit_name", "year"],
            columns="variable_id",
            values="value",
        ).reset_index()
        out_path = os.path.join(OUT_DIR, f"{group_name}_level{level}.csv")
        wide.to_csv(out_path, index=False)
        print(f"  level {level}: saved {len(wide)} rows to {out_path}")


def discover_subject(subject_id):
    """Full variable list for a subject, with detected levels, as [(var_id, label, level), ...]."""
    variables = list_variables(subject_id)
    print(f"  {len(variables)} variables in {subject_id}, probing levels...")
    entries = []
    for var in variables:
        var_id = str(var["id"])
        label = dimension_label(var) or var_id
        for level in probe_levels(var_id):
            entries.append((var_id, f"{label} [{level}]", level))
    return entries


if __name__ == "__main__":
    for name, subject_id in TIGHT_SUBJECTS.items():
        print(f"Discovering {name} ({subject_id})")
        entries = discover_subject(subject_id)
        print(f"  {len(entries)} (variable, level) pairs with real data -- fetching")
        fetch_and_save(name, entries)

    # general_county_stats: merge the 3 subject ids into one discovery pass
    print("Discovering general_county_stats (P2425/P1688/P2381)")
    entries = []
    for sid in GENERAL_SUBJECTS:
        entries.extend(discover_subject(sid))
    print(f"  {len(entries)} (variable, level) pairs with real data -- fetching")
    fetch_and_save("general_county_stats_full", entries)

    # Curated broad subjects (employment_by_pkd, schools): keep existing field
    # picks, but expand level coverage for each.
    for group_name in ["employment_by_pkd", "schools"]:
        group = VARIABLE_GROUPS[group_name]
        print(f"Expanding level coverage for curated {group_name}")
        entries = []
        for var_id, our_name in group["fields"].items():
            for level in probe_levels(var_id):
                entries.append((var_id, our_name, level))
        print(f"  {len(entries)} (variable, level) pairs -- fetching")
        fetch_and_save(group_name, entries)
