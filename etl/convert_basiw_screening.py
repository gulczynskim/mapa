"""
BASiW MZ (Baza Analiz Systemowych i Wdrożeniowych, Ministerstwo Zdrowia)
publishes mammography/cytology screening-program coverage as Excel exports,
województwo level only -- the user placed Mammografia.xlsx/Cytologia.xlsx
directly in data/. Both share the same core columns (Rok, Województwo,
Roczna populacja do przebadania, Liczba przebadanych kobiet ogółem, plus a
few programme-specific intermediate columns that differ between the two and
aren't needed here) -- located by header text rather than a hardcoded column
index since the two files' column counts differ.

Value stored is the coverage SHARE (%): przebadane / populacja do
przebadania * 100 -- not a headcount, since population wouldn't be
comparable across województwa of very different sizes.

This is inherently women-only (both are womens' cancer screening programmes)
-- stored under "k" with t/m always null, and the variable's `sexScope:
"women"` in variables.js forces every view except Kobiety off in the
frontend (see updateViewAvailability in app.js), not just the ones that
happen to be empty.

The "POLSKA" row (nationwide aggregate) is skipped -- it isn't a real
województwo teryt and would either error or collide if kept.
"""

import json
import os

import openpyxl

OUT_DIR = "../data"

# Built from the already-committed boundary file itself, not a hardcoded
# table -- build_wojewodztwa.py used to export a VOIVODESHIP_NAMES constant
# for exactly this, but that was a leftover of its old "dissolve from
# powiat" approach and got removed once it started fetching names directly
# from PRG. data/wojewodztwa.json is the current source of truth for
# teryt<->name either way, so read it straight from there.
_wojewodztwa = json.load(open(os.path.join(OUT_DIR, "wojewodztwa.json"), encoding="utf-8"))
NAME_TO_TERYT = {f["properties"]["JPT_NAZWA_"].upper(): f["properties"]["JPT_KOD_JE"] for f in _wojewodztwa["features"]}


def to_number(v):
    """2017-2021 rows store these columns as real numbers; 2022-2024 rows
    store the same columns as text with a non-breaking-space thousands
    separator (e.g. "203\xa0823") -- Excel's own number formatting leaking
    into the cell value rather than just its display, confirmed by
    inspecting the raw cells directly (not a one-off row, applies to every
    2022-2024 row in both files)."""
    if isinstance(v, str):
        return float(v.replace("\xa0", "").replace(" ", ""))
    return v

FILES = {
    "Mammografia.xlsx": ("Mammografia", "data/mammografia.json"),
    "Cytologia.xlsx": ("Cytologia", "data/cytologia.json"),
}


def convert(xlsx_path, sheet_name):
    """Reads one BASiW screening-rate sheet (mammografia or cytologia) from
    `xlsx_path` and converts its rows into the site's {teryt: {year: {...}}}
    JSON shape, keyed by województwo."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    col = {name: i for i, name in enumerate(header) if name}
    year_i = col["Rok"]
    woj_i = col["Województwo"]
    population_i = col["Roczna populacja do przebadania"]
    screened_i = col["Liczba przebadanych kobiet ogółem"]

    out = {}
    skipped = []
    for row in rows[1:]:
        woj_name = (row[woj_i] or "").strip().upper()
        if woj_name == "POLSKA":
            continue
        teryt = NAME_TO_TERYT.get(woj_name)
        if teryt is None:
            skipped.append(woj_name)
            continue
        population = to_number(row[population_i])
        screened = to_number(row[screened_i])
        if not population:
            continue  # no denominator -- can't compute a share
        share = screened / population * 100
        year = str(int(row[year_i]))
        out.setdefault(teryt, {})[year] = {"default__default": {"t": None, "m": None, "k": share}}

    if skipped:
        print(f"  WARNING: {len(set(skipped))} unmatched województwo name(s): {sorted(set(skipped))}")
    return out


if __name__ == "__main__":
    for fname, (sheet, out_rel_path) in FILES.items():
        print(f"--- {fname} ---")
        data = convert(os.path.join(OUT_DIR, fname), sheet)
        out_path = os.path.join("..", out_rel_path)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {len(data)} regions -> {out_path}")
