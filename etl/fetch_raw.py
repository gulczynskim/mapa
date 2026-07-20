import os

import pandas as pd
from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt
from variables import VARIABLE_GROUPS

load_dotenv()

OUT_DIR = "data_raw"


def fetch_group(group_name, group):
    print(f"Fetching group: {group_name}")
    all_rows = []
    for bdl_id, field_name in group["fields"].items():
        raw = fetch_variable_data(bdl_id, unit_level=group["level"])
        all_rows.extend(flatten(field_name, raw))

    df = pd.DataFrame(all_rows)
    if df.empty:
        print(f"  no data returned for {group_name}")
        return

    df["teryt"] = df["unit_id"].apply(unit_id_to_teryt)
    wide = df.pivot_table(
        index=["teryt", "unit_id", "unit_name", "year"],
        columns="variable_id",
        values="value",
    ).reset_index()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{group_name}.csv")
    wide.to_csv(out_path, index=False)
    print(f"  saved {len(wide)} rows to {out_path}")


if __name__ == "__main__":
    for name, group in VARIABLE_GROUPS.items():
        fetch_group(name, group)
