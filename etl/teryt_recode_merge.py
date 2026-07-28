"""
Shared merge primitive for "pure TERYT relabeling" fixes: an old code and its
current successor represent the SAME real-world unit (identical geometry,
just a renumbering), so any year-data still sitting under the old code gets
moved onto the new one. Used by both merge_recoded_gminy.py (7-digit gmina
codes) and merge_recoded_powiat.py (4-digit powiat codes) -- the merge logic
itself doesn't care about digit count, only the (old, new) pairs and which
files to apply them to differ between the two callers.

Not used for anything that changes UNIT COUNT or actual territory (splits,
merges, land transfers) -- those need build_gmina_historical_overrides.py's
or build_powiat_historical_overrides.py's runtime geometry-swap mechanism
instead, since the current boundary file has no polygon for the old shape at
all. This module is only safe when the current boundary file already has the
right (unchanged) polygon under the NEW code.
"""

import json


def merge_variable_file(path, pairs):
    """For each (old, new) TERYT pair: if `old` is a key in the JSON file at
    `path`, move all of its year-data onto `new` (creating `new` if it
    doesn't exist yet) and delete `old`. Raises if `old` and `new` both have
    data for the same year -- that's not a clean cutover and needs a human
    to look at it rather than silently overwriting. No-op (including no
    file write) if none of the pairs' `old` codes are present, so this is
    safe to re-run after the data has already been merged once."""
    try:
        d = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return
    if not isinstance(d, dict):
        return
    changed = False
    for old, new in pairs:
        if old not in d:
            continue
        old_years = d.pop(old)
        overlap = set(old_years) & set(d.get(new, {}))
        if overlap:
            raise ValueError(f"{path}: {old}/{new} share year(s) {overlap} -- not a clean pre/post split, needs manual review")
        d.setdefault(new, {}).update(old_years)
        changed = True
        print(f"  {path}: merged {old} -> {new} ({len(old_years)} year(s))")
    if changed:
        json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False)
