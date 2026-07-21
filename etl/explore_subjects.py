"""
Exploration-only: for a hand-picked list of BDL subject IDs, list every
variable under each (metadata only, no full time series) and report which
of level 5 (powiat) / level 6 (gmina) each variable actually has data at,
its year range, and whether it looks sex-disaggregated (grouped by name
into "families" so a K/M/ogółem triple prints as one row, not three).

Does NOT write anything to data/ -- this is purely a discovery report for
picking what to fetch properly later (see fetch_new_vars.py / fetch_pkd.py
for that pattern once a variable is chosen).
"""

import os
import re
from collections import defaultdict

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://bdl.stat.gov.pl/api/v1"
LEVELS = {5: "powiat", 6: "gmina"}

SUBJECTS = {
    "P2425": "Gęstość zaludnienia oraz wskaźniki",
    "P3447": "Ludność wg funkcjonalnych grup wieku i płci (miasto/wieś)",
    "P3814": "Mediana wieku ludności według płci",
    "P3428": "Urodzenia żywe, zgony i przyrost naturalny na 1000 ludności",
    "P2627": "Dochody na 1 mieszkańca",
    "P2410": "Dochody na 1 mieszkańca",
    "P4081": "Pracujący w gospodarstwach rolnych wg płci",
    "P4075": "Kierujący w gospodarstwach rolnych wg wykształcenia i płci",
    "P4077": "Kierujący w gospodarstwach rolnych wg okresu kierowania i płci",
    "P4272": "Użytkownicy gospodarstw indywidualnych wg płci",
    "P4070": "Użytkownicy/rodziny pracujący w gospodarstwach indywidualnych",
    "P2387": "Współczynniki skolaryzacji (podstawowe/gimnazjalne)",
    "P2035": "Licea ogólnokształcące dla młodzieży",
    "P2801": "Szkoły podstawowe ogółem",
    "P2178": "Szkoły policealne wg typu i gestora",
    "P3480": "Szkoły średnie zawodowe razem",
    "P2143": "Zasadnicze szkoły zawodowe wg gestora i typu",
    "P3481": "Zasadnicze/branżowe/przysposabiające do pracy specjalne razem",
    "P3485": "Szkoły ponadgimnazjalne ogółem",
    "P3477": "Szkoły ponadpodstawowe/ponadgimnazjalne/policealne ogółem",
    "P3466": "Uczniowie na 1 oddział (ogólnokształcące)",
    "P3463": "Uczniowie na 1 oddział (podstawowe)",
    "P3462": "Uczniowie na 1 oddział (policealne)",
    "P3467": "Uczniowie na 1 oddział (średnie zawodowe/artystyczne)",
    "P3464": "Uczniowie na 1 oddział (zasadnicze zawodowe)",
    "P3535": "Absolwenci szkół ponadgimn./ponadpodst. -- wskaźniki",
    "P2717": "Maturzyści/absolwenci liceów -- świadectwo dojrzałości",
    "P2282": "Maturzyści/absolwenci szkół zawodowych -- świadectwo dojrzałości",
    "P3374": "Zdawalność egzaminów maturalnych",
    "P3226": "Uczelnie, studenci i absolwenci",
    "P2276": "Poszkodowani w wypadkach przy pracy",
    "P2589": "Zagrożenia czynnikami mechanicznymi",
    "P2588": "Zagrożenia związane z uciążliwością pracy",
    "P2587": "Zagrożenia związane ze środowiskiem pracy",
    "P2892": "Zatrudnieni w zakładach objętych badaniem",
    "P1688": "Biblioteki publiczne",
    "P2381": "Biblioteki publiczne - wskaźniki",
    "P3760": "Centra, domy, ośrodki kultury, kluby, świetlice",
    "P3904": "Działalność ośrodków kultury -- wskaźniki",
    "P2155": "Kluby sportowe (łącznie z wyznaniowymi i UKS)",
    "P3833": "Osoby w zamachach samobójczych",
    "P3840": "Osoby w zamachach samobójczych wg grup wieku",
    "P4318": "Ludność 13+ wg wykształcenia i płci (NSP)",
    "P4288": "Ludność 15+ wg stanu cywilnego i płci (NSP)",
    "P4254": "Ludność wg pojedynczych roczników i płci (NSP)",
}

# Subjects the user only wants IF they turn out to be sex-disaggregated.
GENDER_GATED = {"P1688", "P2381", "P3760", "P3904", "P2155", "P3833", "P3840"}

SEX_WORDS = re.compile(r"kobiet\w*|mężczy\w*|ogół\w*|razem\b", re.IGNORECASE)


def _headers():
    api_key = os.environ.get("BDL_API_KEY")
    return {"X-ClientId": api_key} if api_key else {}


def list_variables(subject_id):
    results = []
    page = 0
    while True:
        params = {"lang": "pl", "format": "json", "page": page, "page-size": 100, "subject-id": subject_id}
        r = requests.get(f"{BASE_URL}/variables", params=params, headers=_headers())
        r.raise_for_status()
        page_results = r.json().get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    return results


def probe(variable_id, level):
    """One cheap call: does this level have data, and what years (from a single sample unit)?"""
    params = {"unit-level": level, "page-size": 1, "format": "json"}
    r = requests.get(f"{BASE_URL}/data/by-variable/{variable_id}", params=params, headers=_headers())
    r.raise_for_status()
    data = r.json()
    if not data.get("results"):
        return None
    years = [int(v["year"]) for v in data["results"][0].get("values", [])]
    return (min(years), max(years)) if years else None


def dim_label(var):
    parts = [var.get(f"n{i}", "") for i in range(1, 5)]
    return " | ".join(p for p in parts if p)


def family_key(var):
    """Group variables that only differ by a sex word into one family --
    strip the word entirely (not replace it) so a plain, unqualified label
    collapses onto the same key as its kobiety/mężczyźni siblings."""
    label = dim_label(var)
    stripped = SEX_WORDS.sub("", label)
    return re.sub(r"\s+", " ", stripped).strip()


if __name__ == "__main__":
    for subject_id, hint in SUBJECTS.items():
        print(f"... {subject_id}", flush=True)
        variables = list_variables(subject_id)
        if not variables:
            print(f"{subject_id} ({hint}): NIE ZNALEZIONO ZMIENNYCH")
            continue

        families = defaultdict(list)
        for v in variables:
            families[family_key(v)].append(v)

        print(f"\n=== {subject_id}: {hint} ({len(variables)} zmiennych, {len(families)} grup) ===")
        for fam_label, members in families.items():
            sample = members[0]
            has_sex_split = len(members) > 1 and any(SEX_WORDS.search(dim_label(m)) for m in members)
            if subject_id in GENDER_GATED and not has_sex_split:
                continue

            level_info = {}
            for level in LEVELS:
                res = probe(sample["id"], level)
                if res:
                    level_info[LEVELS[level]] = f"{res[0]}-{res[1]}"

            if not level_info:
                continue  # not available at powiat or gmina at all -- skip silently

            ids = ", ".join(str(m["id"]) for m in members)
            levels_str = ", ".join(f"{k}: {v}" for k, v in level_info.items())
            split_str = "PŁEĆ" if has_sex_split else "brak podziału na płeć"
            print(f"  [{ids}] {dim_label(sample) or fam_label} -- {split_str} -- {levels_str}")
