"""
Data-quality audit across every variable in variables.js, written for the
2026-07-22 review (see that conversation for the full write-up of what each
finding meant and which ones turned out to be real bugs vs. real-but-benign
extremes vs. false positives from big cities). Rerun after any data refresh --
it's read-only, doesn't touch data/ or variables.js.

For each variable: cross-references its data file's teryt keys against the
boundary file for its level (missing/orphan units), checks year coverage,
null t/m/k, missing declared ageGroup__measure slices, negative values,
%>100 on percent variables, k+m vs t (only for sharesMeaningful count
variables -- summing rates is meaningless), IQR-based outliers, and >6x
consecutive-year jumps.

Caveats baked into the design, worth remembering before trusting a finding:
- Outlier flags are dominated by big cities (Warszawa/Kraków/...) just being
  much bigger than an average powiat -- that's expected, not a data problem.
  Cross-check against boundary_names before treating one as real.
- A null t with populated m/k is often the site's own `hasTotal: false` flag
  working as intended (e.g. medians, or slices whose combined-sexes total
  can't be derived), not a gap.
- This is a heuristic scan, not ground truth -- BDL's own `attrId` field
  (not fetched here) is the authoritative "value vs. suppressed-as-zero"
  signal; see etl/fetch_pkd.py's section B/D zeros for a real example where
  it mattered (attrId 91 = statistical secrecy, not a genuine 0).

Usage: python3 audit_data.py   (from anywhere; paths are relative to this file)
"""

import json
import os
from collections import defaultdict

from jsobj import extract_const

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP_N = 12

BOUNDARY_FILES = {"powiat": "powiaty", "gmina": "gminy", "podregion": "podregiony", "wojewodztwo": "wojewodztwa"}


def fmt(v):
    return f"{v:.3g}" if isinstance(v, float) else str(v)


def load_boundaries():
    teryts, names = {}, {}
    for level, fname in BOUNDARY_FILES.items():
        d = json.load(open(f"{ROOT}/data/{fname}.json", encoding="utf-8"))
        teryts[level] = {f["properties"]["JPT_KOD_JE"] for f in d["features"]}
        names[level] = {f["properties"]["JPT_KOD_JE"]: f["properties"]["JPT_NAZWA_"] for f in d["features"]}
    return teryts, names


def audit_variable(vmeta, boundary_teryts):
    level = vmeta["levels"][0]["key"]
    data = json.load(open(f"{ROOT}/{vmeta['file']}", encoding="utf-8"))

    expected_teryts = boundary_teryts[level]
    data_teryts = set(data.keys())
    missing_boundary_units = sorted(expected_teryts - data_teryts)
    orphan_teryts = sorted(data_teryts - expected_teryts)

    ageGroups = [g["key"] for g in vmeta.get("ageGroups", [{"key": "default"}])]
    measures = [m["key"] for m in vmeta.get("measures", [{"key": "default"}])]
    expected_slices = {f"{a}__{m}" for a in ageGroups for m in measures}
    unit = vmeta.get("unit")
    shares_meaningful = bool(vmeta.get("sharesMeaningful", False))

    year_counts = {t: len(yd) for t, yd in data.items()}
    max_years = max(year_counts.values()) if year_counts else 0
    under_covered = sorted(
        [(t, c) for t, c in year_counts.items() if t in expected_teryts and max_years > 1 and c < max_years * 0.5],
        key=lambda x: x[1],
    )

    null_entries, missing_slice_entries, negative_entries, pct_over_100, sum_mismatch = [], [], [], [], []
    for t, yd in data.items():
        for y, slices in yd.items():
            missing = expected_slices - set(slices.keys())
            if missing:
                missing_slice_entries.append((t, y, sorted(missing)))
            for slice_key, vals in slices.items():
                tt, mm, kk = vals.get("t"), vals.get("m"), vals.get("k")
                if tt is None or mm is None or kk is None:
                    null_entries.append((t, y, slice_key, vals))
                    continue
                for label, val in (("t", tt), ("m", mm), ("k", kk)):
                    if isinstance(val, (int, float)) and val < 0:
                        negative_entries.append((t, y, slice_key, label, val))
                if unit == "%":
                    for label, val in (("t", tt), ("m", mm), ("k", kk)):
                        if isinstance(val, (int, float)) and val > 100:
                            pct_over_100.append((t, y, slice_key, label, val))
                # k+m==t is only a valid identity for a raw count -- a rate
                # derived by add_derived_measures.py (_per100k divides by a
                # DIFFERENT population denominator per sex; _odsetek divides
                # by a different section-total per sex) has no reason to sum
                # across sexes the same way, so skip those measures here
                # rather than flooding this check with expected mismatches.
                measure_key = slice_key.split("__", 1)[1] if "__" in slice_key else slice_key
                is_rate_measure = measure_key.endswith("_per100k") or measure_key.endswith("_odsetek") or measure_key == "odsetek"
                if shares_meaningful and not is_rate_measure and all(isinstance(v, (int, float)) for v in (tt, mm, kk)):
                    diff = abs((mm + kk) - tt)
                    denom = max(abs(tt), 1)
                    if diff > max(1, 0.02 * denom):
                        sum_mismatch.append((t, y, slice_key, tt, mm, kk, diff))

    buckets = defaultdict(list)
    for t, yd in data.items():
        for y, slices in yd.items():
            for slice_key, vals in slices.items():
                tt = vals.get("t")
                if isinstance(tt, (int, float)):
                    buckets[(y, slice_key)].append((t, tt))
    outliers = []
    for (y, slice_key), items in buckets.items():
        vals = sorted(v for _, v in items)
        n = len(vals)
        if n < 10:
            continue
        q1, q3 = vals[n // 4], vals[(3 * n) // 4]
        iqr = q3 - q1
        if iqr == 0:
            continue
        lo, hi = q1 - 3 * iqr, q3 + 3 * iqr
        for t, v in items:
            if v < lo or v > hi:
                outliers.append((t, y, slice_key, v, lo, hi))

    jumps = []
    for t, yd in data.items():
        years_sorted = sorted(yd.keys(), key=int)
        for a, b in zip(years_sorted, years_sorted[1:]):
            if int(b) - int(a) != 1:
                continue  # only consecutive years -- election-year gaps are expected, not jumps
            for slice_key in expected_slices:
                va = yd.get(a, {}).get(slice_key, {}).get("t")
                vb = yd.get(b, {}).get(slice_key, {}).get("t")
                if isinstance(va, (int, float)) and isinstance(vb, (int, float)) and va not in (0, None):
                    ratio = vb / va
                    if ratio > 6 or ratio < (1 / 6):
                        jumps.append((t, a, b, slice_key, va, vb, ratio))
    jumps.sort(key=lambda j: -max(j[6], 1 / j[6]) if j[6] else 0)

    return dict(
        level=level,
        n_boundary=len(expected_teryts),
        n_data_teryts=len(data_teryts),
        missing_boundary_units=missing_boundary_units,
        orphan_teryts=orphan_teryts,
        max_years=max_years,
        under_covered=under_covered,
        null_entries=null_entries,
        missing_slice_entries=missing_slice_entries,
        negative_entries=negative_entries,
        pct_over_100=pct_over_100,
        sum_mismatch=sum_mismatch,
        outliers=outliers,
        jumps=jumps,
    )


FLAG_LABELS = [
    ("missing_boundary_units", "boundary units w/ NO data"),
    ("orphan_teryts", "orphan teryts (not in boundary)"),
    ("under_covered", "units with <50% year coverage"),
    ("null_entries", "null t/m/k entries"),
    ("missing_slice_entries", "teryt-years missing a declared slice"),
    ("negative_entries", "negative values"),
    ("pct_over_100", "values >100% on a % variable"),
    ("sum_mismatch", "k+m != t mismatches"),
    ("outliers", "statistical outliers (>3xIQR)"),
    ("jumps", ">6x year-over-year jumps"),
]


def print_report(results, boundary_names):
    for varkey, r in results.items():
        if "error" in r:
            print(f"\n=== {varkey} === ERROR: {r['error']}")
            continue
        flags = [f"{len(r[key])} {label}" for key, label in FLAG_LABELS if r[key]]
        if not flags:
            continue  # clean variable, skip from report

        print(f"\n=== {varkey} ({r['level']}, {r['n_data_teryts']}/{r['n_boundary']} units) ===")
        for f in flags:
            print(" -", f)

        bn = boundary_names[r["level"]]
        if r["missing_boundary_units"]:
            sample = r["missing_boundary_units"][:TOP_N]
            print("   missing units:", [f"{t}({bn.get(t, '?')})" for t in sample], "..." if len(r["missing_boundary_units"]) > TOP_N else "")
        if r["orphan_teryts"]:
            print("   orphan teryts:", r["orphan_teryts"][:TOP_N], "..." if len(r["orphan_teryts"]) > TOP_N else "")
        if r["under_covered"]:
            sample = r["under_covered"][:TOP_N]
            print("   under-covered:", [f"{t}({bn.get(t, '?')}):{c}/{r['max_years']}yrs" for t, c in sample])
        for e in r["null_entries"][:5]:
            print("   null:", e)
        for e in r["missing_slice_entries"][:5]:
            print("   missing slice:", e)
        for e in r["negative_entries"][:TOP_N]:
            t, y, s, label, val = e
            print(f"   negative: {t}({bn.get(t, '?')}) {y} {s} {label}={fmt(val)}")
        for e in r["pct_over_100"][:TOP_N]:
            t, y, s, label, val = e
            print(f"   >100%: {t}({bn.get(t, '?')}) {y} {s} {label}={fmt(val)}")
        for e in sorted(r["sum_mismatch"], key=lambda e: -e[6])[:TOP_N]:
            t, y, s, tt, mm, kk, diff = e
            print(f"   k+m!=t: {t}({bn.get(t, '?')}) {y} {s} t={fmt(tt)} m={fmt(mm)} k={fmt(kk)} diff={fmt(diff)}")
        for e in sorted(r["outliers"], key=lambda e: -abs(e[3]))[:TOP_N]:
            t, y, s, v, lo, hi = e
            print(f"   outlier: {t}({bn.get(t, '?')}) {y} {s} val={fmt(v)} (expected {fmt(lo)}..{fmt(hi)})")
        for e in r["jumps"][:TOP_N]:
            t, a, b, s, va, vb, ratio = e
            print(f"   jump: {t}({bn.get(t, '?')}) {a}->{b} {s}: {fmt(va)} -> {fmt(vb)} ({ratio:.1f}x)")

    print("\n\n=== SUMMARY (variables with zero flags) ===")
    clean = [k for k, r in results.items() if "error" not in r and not any(r[key] for key, _ in FLAG_LABELS)]
    print(clean)


def main():
    src = open(f"{ROOT}/variables.js", encoding="utf-8").read()
    meta = extract_const(src, "VARIABLE_META")
    boundary_teryts, boundary_names = load_boundaries()

    results = {}
    for varkey, vmeta in meta.items():
        try:
            results[varkey] = audit_variable(vmeta, boundary_teryts)
        except FileNotFoundError:
            results[varkey] = {"error": f"data file not found: {vmeta['file']}"}

    print_report(results, boundary_names)


if __name__ == "__main__":
    main()
