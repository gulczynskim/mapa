"""
Convert CKE egzamin ósmoklasisty (E8) results from data/CKE_E8/*.xlsx into
the compact per-variable JSON format the frontend consumes.

Source files: "Wyniki E8 - powiaty_{K,M}_{year}.xlsx", one sheet per sex,
header row 0 = subject group, header row 1 = metric, data from row 2.
TERYT is given directly (int, needs zero-padding to 4 digits).

Only the three near-universal subjects are converted for now (język polski,
matematyka, język angielski) -- the other five language options have very
few test-takers per powiat (elective, school-dependent) and are left for
later using the same pattern.

Two measures per subject: mean ("wynik średni (%)") and median ("mediana (%)"),
selectable in the frontend as the "measure" dimension. Output shape per
variable: {teryt: {year: {"default__mean": {t,m,k}, "default__median": {t,m,k}}}}
("default" is the age-group slot -- E8 only has one age group, ósmoklasiści).

"Ogółem" (t) for the MEAN measure is computed as an enrollment-weighted
average of the K and M means (using liczba zdających as weights) -- valid,
since a weighted mean of two group means equals the combined-group mean.
For the MEDIAN measure, t is left as null: a combined-group median can NOT
be correctly derived from the two sub-group medians and counts alone (unlike
the mean, median doesn't combine that way), so approximating it would be
actively misleading rather than just imprecise.
"""

import json
import os

import pandas as pd

SRC_DIR = "../data/CKE_E8"
OUT_DIR = "../data"
YEARS = [2022, 2023, 2024, 2025]
SUBJECTS = {
    "język polski": "e8_polski",
    "matematyka": "e8_matematyka",
    "język angielski": "e8_angielski",
}
METRIC_COLUMNS = {"mean": "wynik średni (%)", "median": "mediana (%)"}


def load_sex_sheet(year, sex):
    """Reads one year's single-sex E8 results workbook and extracts, per
    subject in SUBJECTS, the test-taker count and median score into a flat
    per-powiat dataframe."""
    path = os.path.join(SRC_DIR, f"Wyniki E8 - powiaty_{sex}_{year}.xlsx")
    df = pd.read_excel(path, sheet_name=sex, header=None, skiprows=2)
    subject_cols = pd.read_excel(path, sheet_name=sex, header=None, nrows=1).iloc[0].ffill()
    metric_cols = pd.read_excel(path, sheet_name=sex, header=None, nrows=2).iloc[1]

    out = pd.DataFrame()
    out["teryt"] = df[3].apply(lambda v: str(int(v)).zfill(4))
    for subject_name, our_name in SUBJECTS.items():
        cols = [i for i in range(len(subject_cols)) if subject_cols[i] == subject_name]
        n_col = next(i for i in cols if metric_cols[i] == "liczba zdających")
        out[f"{our_name}_n"] = df[n_col]
        for measure_key, col_name in METRIC_COLUMNS.items():
            metric_col = next(i for i in cols if metric_cols[i] == col_name)
            out[f"{our_name}_{measure_key}"] = df[metric_col]
    return out


def build_variable(our_name):
    """Builds the full {teryt: {year: {...}}} JSON for one E8 subject
    (`our_name`) across every year in YEARS, merging that year's K and M
    sheets and computing the combined "t" median where possible."""
    result = {}
    for year in YEARS:
        k = load_sex_sheet(year, "K")
        m = load_sex_sheet(year, "M")
        merged = k.merge(m, on="teryt", suffixes=("_k", "_m"))
        for row in merged.itertuples():
            n_k = getattr(row, f"{our_name}_n_k")
            n_m = getattr(row, f"{our_name}_n_m")
            slices = {}

            mean_k = getattr(row, f"{our_name}_mean_k")
            mean_m = getattr(row, f"{our_name}_mean_m")
            if not (pd.isna(mean_k) and pd.isna(mean_m)):
                total_n = (n_k or 0) + (n_m or 0)
                mean_t = (
                    ((mean_k or 0) * (n_k or 0) + (mean_m or 0) * (n_m or 0)) / total_n
                    if total_n
                    else None
                )
                slices["default__mean"] = {
                    "t": mean_t,
                    "m": None if pd.isna(mean_m) else mean_m,
                    "k": None if pd.isna(mean_k) else mean_k,
                }

            median_k = getattr(row, f"{our_name}_median_k")
            median_m = getattr(row, f"{our_name}_median_m")
            if not (pd.isna(median_k) and pd.isna(median_m)):
                slices["default__median"] = {
                    "t": None,  # not derivable from sub-group medians, see module docstring
                    "m": None if pd.isna(median_m) else median_m,
                    "k": None if pd.isna(median_k) else median_k,
                }

            if slices:
                result.setdefault(row.teryt, {})[str(year)] = slices
    return result


if __name__ == "__main__":
    for subject_name, our_name in SUBJECTS.items():
        data = build_variable(our_name)
        out_path = os.path.join(OUT_DIR, f"{our_name}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{our_name}: {len(data)} regions -> {out_path}")
