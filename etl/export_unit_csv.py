"""
Exports every variable's data for ONE map unit (a single powiat/gmina/
podregion/wojewodztwo) as a CSV: one row per (variable, age group, measure,
year) combination the unit actually has data for, with the same 8 "Widok"
values the map itself computes (Kobiety/Mężczyźni/Ogółem/Różnica/Proporcja
K:M/Proporcja M:K/% kobiet/% mężczyzn) -- see VIEWS in app.js, replicated
here rather than imported since this is Python reading app.js's JS data, not
the other way around.

A view's value is blank in two different situations, both intentional:
- The unit's raw t/m/k is null for that row (missing data, or the view's
  natural precondition -- e.g. Różnica needs both k and m).
- % kobiet/% mężczyzn specifically also go blank when the variable doesn't
  opt into sharesMeaningful, or the measure is already a "_per100k" rate --
  the site hides these for the same reason (dividing two already-adjusted
  rates isn't a meaningful "share"), see isRateMeasure()'s comment in
  app.js. This is the one gate not already implied by raw nulls, so it's
  the only one replicated explicitly below.

Usage:
  python3 export_unit_csv.py --level powiat --name pleszewski
  python3 export_unit_csv.py --teryt 3020
  python3 export_unit_csv.py --level gmina --name "Pleszew" --out plesz.csv
"""

import argparse
import csv
import json
import os
import unicodedata

from jsobj import extract_const

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BOUNDARY_FILES = {"powiat": "powiaty", "gmina": "gminy", "podregion": "podregiony", "wojewodztwo": "wojewodztwa"}

VIEW_COLUMNS = [
    ("Kobiety", 1),
    ("Mężczyźni", 1),
    ("Ogółem", 1),
    ("Różnica (K - M)", 1),
    ("Proporcja (K / M)", 2),
    ("Proporcja (M / K)", 2),
    ("% kobiet", 1),
    ("% mężczyzn", 1),
]


def fold(s):
    """Case/diacritic-insensitive compare -- lets --name pleszewski match "powiat pleszewski"."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def resolve_unit(level, name=None, teryt=None):
    """Resolves a boundary unit at `level` by exact teryt (raising if not
    found) or by a case/diacritic-insensitive name substring (raising if
    zero or multiple matches, listing the candidates on ambiguity). Returns
    (teryt, name)."""
    boundary = json.load(open(f"{ROOT}/data/{BOUNDARY_FILES[level]}.json", encoding="utf-8"))
    features = boundary["features"]
    if teryt is not None:
        for f in features:
            if f["properties"]["JPT_KOD_JE"] == teryt:
                return teryt, f["properties"]["JPT_NAZWA_"]
        raise SystemExit(f"No {level} with teryt {teryt!r} in {BOUNDARY_FILES[level]}.json")

    needle = fold(name)
    matches = [f["properties"] for f in features if needle in fold(f["properties"]["JPT_NAZWA_"])]
    if not matches:
        raise SystemExit(f"No {level} name matching {name!r}")
    if len(matches) > 1:
        options = ", ".join(f"{p['JPT_NAZWA_']} ({p['JPT_KOD_JE']})" for p in matches)
        raise SystemExit(f"Ambiguous name {name!r}, matches: {options} -- rerun with --teryt")
    return matches[0]["JPT_KOD_JE"], matches[0]["JPT_NAZWA_"]


def is_rate_measure(measure_key):
    """Mirrors isRateMeasure() in app.js -- "_per100k", "_udzial" and
    "_srednia" are excluded from shares, "_odsetek" is not (matches the
    app's own actual behavior, an existing quirk rather than something this
    export should second-guess)."""
    return (measure_key.endswith("_per100k") or measure_key.endswith("_udzial")
            or measure_key.endswith("_srednia") or measure_key.endswith("_na_pracujacego"))


def safe_div(a, b):
    """`a / b`, or None if `b` is zero."""
    return a / b if b != 0 else None


def view_values(t, m, k, shares_ok):
    """Computes every one of the map's derived views (diff, ratio, inverse
    ratio, % kobiet, % mężczyzn) from one raw {t,m,k} triple, mirroring
    app.js's own per-view formulas."""
    women = k
    men = m
    total = t
    diff = k - m if k is not None and m is not None else None
    ratio = safe_div(k, m) if k is not None and m is not None else None
    ratio_inv = safe_div(m, k) if k is not None and m is not None else None
    share_women = share_men = None
    if shares_ok and k is not None and m is not None and (k + m) != 0:
        share_women = k / (k + m) * 100
        share_men = m / (k + m) * 100
    return [women, men, total, diff, ratio, ratio_inv, share_women, share_men]


def label_lookup(options, key):
    """Finds `key`'s human-readable label in a list of {key, label} option
    dicts (ageGroups or measures), falling back to the raw key if the data
    has a slice the metadata doesn't declare."""
    for o in options:
        if o["key"] == key:
            return o.get("label", key)
    return key  # data has a slice metadata doesn't declare -- keep the raw key rather than dropping the row


def main():
    """CLI entry point: resolves the requested unit, walks every variable in
    VARIABLE_META that covers `--level`, and writes one CSV row per
    variable/ageGroup/measure/year with that unit's raw and derived values."""
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", choices=list(BOUNDARY_FILES), default="powiat")
    ap.add_argument("--name", help="Substring of the unit's name, e.g. 'pleszewski' (case/diacritic-insensitive)")
    ap.add_argument("--teryt", help="Exact TERYT code -- use instead of --name to skip lookup/disambiguation")
    ap.add_argument("--out", help="Output CSV path (default: derived from the unit name)")
    args = ap.parse_args()
    if not args.name and not args.teryt:
        ap.error("pass --name or --teryt")

    teryt, unit_name = resolve_unit(args.level, name=args.name, teryt=args.teryt)
    print(f"Unit: {unit_name} ({teryt}, {args.level})")

    meta_all = extract_const(open(f"{ROOT}/variables.js", encoding="utf-8").read(), "VARIABLE_META")

    rows = []
    skipped = []
    for varkey, meta in meta_all.items():
        levels = [l["key"] for l in meta.get("levels", [])]
        if args.level not in levels:
            skipped.append(varkey)
            continue

        data = json.load(open(f"{ROOT}/{meta['file']}", encoding="utf-8"))
        unit_data = data.get(teryt)
        if not unit_data:
            continue

        age_groups = meta.get("ageGroups", [{"key": "default"}])
        measures = meta.get("measures", [{"key": "default"}])
        shares_ok = bool(meta.get("sharesMeaningful", False))

        for year in sorted(unit_data, key=int):
            for slice_key, vals in unit_data[year].items():
                age_key, _, measure_key = slice_key.partition("__")
                age_label = label_lookup(age_groups, age_key)
                measure_opt = next((m for m in measures if m["key"] == measure_key), None)
                measure_label = measure_opt.get("label", measure_key) if measure_opt else measure_key
                unit_label = (measure_opt or {}).get("unit", meta.get("unit", ""))

                row_shares_ok = shares_ok and not is_rate_measure(measure_key)
                values = view_values(vals.get("t"), vals.get("m"), vals.get("k"), row_shares_ok)

                row = {
                    "zmienna": meta["label"],
                    "grupa wieku": age_label,
                    "miara": measure_label,
                    "rok": year,
                    "jednostka": unit_label,
                }
                for (col, decimals), v in zip(VIEW_COLUMNS, values):
                    row[col] = round(v, decimals) if v is not None else ""
                rows.append(row)

    if skipped:
        print(f"Skipped (no {args.level}-level data): {', '.join(skipped)}")

    # unit_name already includes a level word for powiat/gmina/podregion
    # ("powiat pleszewski", "gmina Nowy Targ", "Podregion Jeleniogórski") --
    # only wojewodztwo names are bare, so only that level needs one added.
    slug = fold(unit_name).replace(" ", "_")
    if args.level == "wojewodztwo":
        slug = f"wojewodztwo_{slug}"
    out_path = args.out or f"{ROOT}/dane_{slug}.csv"
    fieldnames = ["zmienna", "grupa wieku", "miara", "rok", "jednostka"] + [c for c, _ in VIEW_COLUMNS]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"wrote {len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    main()
