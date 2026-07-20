"""
Catalog of BDL variable IDs identified for the gender inequality map project.

Cross-checked against the user's existing GUS_API.ipynb pipeline
(/home/gulczynek/Studia/Florencja/Boys education/Poland/), which already pulls
most of these for a different (boys' education) project.

BDL unit levels (verified against the /levels endpoint): 4 = podregion, 5 = powiat,
6 = gmina. Level availability varies per variable and must be checked per-variable,
not assumed -- e.g. labor force activity is powiat-only (0 gmina records), while
population-by-age is available at both powiat and gmina.

NOTE (2026-07-20): this catalog currently only pulls powiat-level data and a hand-
picked subset of each variable's age-group breakdown. Both are known-incomplete --
deferred per user request while the website skeleton gets built first. Before
relying on this for the real site, replace the hand-picked `fields` dicts with
per-subject auto-discovery (query /variables per subject with no level filter,
then check each result's actual level + n1/n2/n3/n4 dimension labels) so every
available level and age bracket gets pulled, not just the ones a human eyeballed.
"""

VARIABLE_GROUPS = {
    "labor_force_activity": {
        "subject_id": "P4309",
        "level": 5,
        "fields": {
            "1670866": "activity_rate_total",
            "1670873": "activity_rate_men",
            "1670880": "activity_rate_women",
            "1670874": "activity_rate_men_15_24",
            "1670881": "activity_rate_women_15_24",
        },
        "notes": "From NSP (census), not annual -- check actual year coverage on pull.",
    },
    "unemployment": {
        "subject_id": "P2670",
        "level": 5,
        "fields": {
            "79214": "unemployment_rate_total",
            "79215": "unemployment_rate_men",
            "79216": "unemployment_rate_women",
        },
    },
    "employment_by_pkd": {
        "subject_id": "P4283",
        "level": 5,
        "fields": {
            "1651167": "employed_total",
            "1651168": "employed_men",
            "1651169": "employed_women",
            "1651170": "employed_agri_total",
            "1651171": "employed_agri_men",
            "1651172": "employed_agri_women",
            "1651173": "employed_industry_total",
            "1651174": "employed_industry_men",
            "1651175": "employed_industry_women",
            # Full A-S PKD section breakdown (18 more sections x 3 sexes) is in
            # GUS_API.ipynb code cell 51 -- add here once the segregation-index
            # method is decided, no point pulling all of it before then.
        },
        "notes": "Raw input for an occupational segregation index (e.g. Duncan "
                 "dissimilarity) -- formula still TBD with user.",
    },
    "population_by_age_sex": {
        "subject_id": "P4253",
        "level": 5,
        "fields": {
            "1644517": "pop_men_25_29",
            "1644518": "pop_men_30_34",
            "1644537": "pop_women_25_29",
            "1644538": "pop_women_30_34",
        },
        "notes": "Basis for the 25-34 sex-ratio 'selective migration' proxy "
                 "(demo_sh_men2534 in the notebook).",
    },
    "schools": {
        "subject_id": "P2144",
        "level": 5,
        "fields": {
            "270621": "liceum_pupils_men",
            "270655": "liceum_pupils_women",
            "270602": "liceum_graduates_men",
            "270638": "liceum_graduates_women",
        },
        "notes": "Full list of school-related var IDs (vocational, technical, "
                 "1st-grade breakdowns) is in GUS_API.ipynb code cell 41.",
    },
    "agricultural_census": {
        "subject_id": "P4272",
        "level": 5,
        "fields": {
            "1647646": "agri_owners_total",
            "1647647": "agri_owners_men",
            "1647648": "agri_owners_women",
        },
        "notes": "One-off (Powszechny Spis Rolny 2020), not annual.",
    },
    "general_county_stats": {
        "subject_id": None,  # spans P2425 / P1688 / P2381
        "level": 5,
        "fields": {
            "60559": "population_density",
            "1645341": "population_total",
            "1645343": "population_women",
            "1645344": "population_men",
            "1725015": "population_urban",
        },
    },
}

# Known gaps -- not yet in the existing notebook, need fresh lookups or user input:
#   - life expectancy (podregion level)
#   - wages by sex (existing notebook sources this from a GUS Excel publication,
#     not the BDL API -- BDL doesn't appear to expose powiat-level wages by sex
#     directly)
#   - PKW gender-of-elected-officials data (existing PKW work in the notebook is
#     presidential election results, a different dataset)
#   - CKE egzamin osmoklasisty sex breakdown at powiat level
