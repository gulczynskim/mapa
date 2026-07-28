"""
Declarative registry of every BDL-sourced variable in variables.js: which
topic (subject id) it comes from, which unit level, and the BDL variable id
for each (ageGroup, measure, sex) slice. fetch_bdl.py reads this and does the
actual fetching -- replaces the old fetch_batch2.py/fetch_batch3.py/
fetch_new_vars.py/fetch_life_expectancy.py/variables.py split, which had
near-identical fetch/combine logic duplicated across each "batch" (named for
when each was written, not what it contains), making it hard to tell where
any one variable's ids actually lived or whether the whole set was even
reproducible (some of it wasn't -- see fetch_bdl.py's liceum comment).

Every id below was re-verified live against the BDL API during the
2026-07-25 review (subject id via /variables/{id}, sex/age labels via
n1/n2/n3), not just copied from the old scripts.

Not every BDL variable in variables.js is here:
- pkd_zatrudnienie (P4283) discovers its 756 ids live (see fetch_pkd.py) --
  forcing that into a static id map here would defeat the point.
- population_25_34 sums two NSP age bands (25-29 + 30-34) per sex before
  storage -- a real combine step, not just a fetch, so it stays as its own
  small function in fetch_bdl.py rather than warping this schema for one
  variable.

Slice format: "slices" maps ageGroup -> measure -> {"t"/"m"/"k": id, ...}.
- Sex ids present with no "t" key: total is computed as t = m + k (valid for
  headcounts -- the default case).
- "t" key present: fetched directly instead of computed. Required for
  anything non-additive across sexes (medians, rates, index numbers) --
  BDL usually publishes a direct "ogółem" variable for these anyway.
- "noTotal": True on a slice: never compute or fetch a total, even when m/k
  are both present (life_expectancy: BDL only publishes per-sex figures, and
  averaging two life expectancies without population weights would be wrong
  the same way a combined exam-score median would be).
- A slice with only "t" (no m/k at all): BDL doesn't publish this concept
  broken down by sex (gęstość zaludnienia, wynagrodzenia, fundusz
  alimentacyjny, bezdomni, zgwałcenia).
"""

POWIAT = 5
GMINA = 6
PODREGION = 4

BDL_VARIABLES = {
    "unemployment": {
        "topic": "P2670",
        "level": POWIAT,
        "file": "unemployment.json",
        "slices": {"default": {"default": {"t": "79214", "m": "79215", "k": "79216"}}},
    },
    "labor_force_activity": {
        "topic": "P4309",
        "level": POWIAT,
        "file": "labor_force_activity.json",
        "slices": {
            "15plus": {"default": {"t": "1670866", "m": "1670873", "k": "1670880"}},
            "15_24": {"default": {"t": "1670867", "m": "1670874", "k": "1670881"}},
            "25_34": {"default": {"t": "1670868", "m": "1670875", "k": "1670882"}},
            "35_44": {"default": {"t": "1670869", "m": "1670876", "k": "1670883"}},
            "45_54": {"default": {"t": "1670870", "m": "1670877", "k": "1670884"}},
            "55_64": {"default": {"t": "1670871", "m": "1670878", "k": "1670885"}},
            "65plus": {"default": {"t": "1670872", "m": "1670879", "k": "1670886"}},
        },
    },
    # Removed as standalone variables.js variables 2026-07 (user request) --
    # kept here (and their fetched data/*.json files kept too) purely so
    # they can be restored later without re-discovering the BDL ids. Also
    # still needed as a live ETL dependency regardless: radni_gminy.json is
    # still read by merge_recoded_gminy.py (gmina TERYT recodes) and
    # radni_powiatu.json's own miasta-na-prawach-powiatu backfill still runs
    # via patch_city_powiats.py.
    "radni_powiatu": {
        "topic": "P1317",
        "level": POWIAT,
        "file": "radni_powiatu.json",
        "slices": {"default": {"default": {"t": "3094", "m": "3095", "k": "3096"}}},
    },
    "radni_gminy": {
        "topic": "P1312",
        "level": GMINA,
        "file": "radni_gminy.json",
        "slices": {"default": {"default": {"t": "6", "m": "7", "k": "8"}}},
    },
    # No longer a standalone variables.js entry (removed 2026-07-27 -- fully
    # subsumed by szkolnictwo_ponadpodstawowe's "licea_ogolnoksztalcace"
    # ageGroup, which build_szkolnictwo_ponadpodstawowe.py copies straight
    # from liceum.json). Kept here and still fetched so that copy has a
    # source file to read -- data/liceum.json is now an ETL-internal
    # intermediate, not something the frontend ever loads directly.
    "liceum": {
        "topic": "P2035",
        "level": POWIAT,
        "file": "liceum.json",
        "slices": {
            "default": {
                "uczniowie": {"m": "270621", "k": "270655"},
                "absolwenci": {"m": "270638", "k": "270602"},
                "uczniowie_1_klasa": {"t": "378690", "m": "378692", "k": "378694"},
            },
        },
    },
    "life_expectancy": {
        "topic": "P2730",
        "level": PODREGION,
        "file": "life_expectancy.json",
        "slices": {
            "0": {"default": {"m": "101554", "k": "101555", "noTotal": True}},
            "15": {"default": {"m": "105836", "k": "105837", "noTotal": True}},
            "30": {"default": {"m": "105845", "k": "105846", "noTotal": True}},
            "45": {"default": {"m": "105854", "k": "105855", "noTotal": True}},
            "60": {"default": {"m": "105863", "k": "105864", "noTotal": True}},
            "65": {"default": {"m": "101563", "k": "101564", "noTotal": True}},
        },
    },
    "population_by_age": {
        "topic": "P3447",
        "level": POWIAT,
        "file": "population_by_age.json",
        "slices": {
            "ogolem": {"default": {"m": "453359", "k": "453347"}},
            "0-2": {"default": {"m": "453360", "k": "453348"}},
            "0-14": {"default": {"m": "1613317", "k": "1613320"}},
            "3-6": {"default": {"m": "453361", "k": "453349"}},
            "7-12": {"default": {"m": "453362", "k": "453350"}},
            "13-15": {"default": {"m": "453363", "k": "453351"}},
            "15-64": {"default": {"m": "1613218", "k": "1613221"}},
            "16-19": {"default": {"m": "453364", "k": "453352"}},
            "19-24": {"default": {"m": "1613254", "k": "1613257"}},
            "20-24": {"default": {"m": "453365", "k": "453353"}},
            "25-34": {"default": {"m": "453366", "k": "453354"}},
            "35-44": {"default": {"m": "453367", "k": "453355"}},
            "45-54": {"default": {"m": "453368", "k": "453356"}},
            "55-64": {"default": {"m": "453369", "k": "453357"}},
            "65plus": {"default": {"m": "453370", "k": "453358"}},
        },
    },
    "median_age": {
        "topic": "P3814",
        "level": POWIAT,
        "file": "median_age.json",
        "slices": {"default": {"default": {"t": "746289", "m": "746290", "k": "746291"}}},
    },
    "rolnictwo_pracujacy": {
        "topic": "P4081",
        "level": POWIAT,
        "file": "rolnictwo_pracujacy.json",
        "slices": {
            "gospodarstwa_rolne": {"default": {"m": "1623386", "k": "1623387"}},
            "gospodarstwa_indywidualne": {"default": {"m": "1623389", "k": "1623390"}},
        },
    },
    "rolnictwo_kierujacy": {
        "topic": "P4077",
        "level": POWIAT,
        "file": "rolnictwo_kierujacy.json",
        "slices": {
            "gospodarstwo": {"default": {"m": "1623152", "k": "1623159"}},
            "uzytkownik": {"default": {"m": "1623173", "k": "1623180"}},
        },
    },
    "rolnictwo_uzytkownicy": {
        "topic": "P4272",
        "level": POWIAT,
        "file": "rolnictwo_uzytkownicy.json",
        "slices": {"default": {"default": {"m": "1647647", "k": "1647648"}}},
    },
    # Only 2 of BDL's 5 school types kept (per user decision 2026-07-28) --
    # "ogolem_z_kolegiami", "pomaturalne_doroslych", "pomaturalne_mlodziezy"
    # deliberately dropped from data/szkoly_policealne.json (see
    # variables.js's meaning text). Also drop year 2004 on any re-fetch --
    # the only year with no m/k sex breakdown at all.
    "szkoly_policealne": {
        "topic": "P2178",
        "level": POWIAT,
        "file": "szkoly_policealne.json",
        "slices": {
            "kolegium_bez_specjalnych": {
                "uczniowie": {"t": "55127", "m": "271179", "k": "271118"},
                "absolwenci": {"t": "55074", "m": "271077", "k": "271035"},
                "uczniowie_1_klasa": {"t": "380088", "m": "380078", "k": "380083"},
            },
            "specjalne": {
                "absolwenci": {"t": "55174", "m": "271031", "k": "271171"},
                "uczniowie_1_klasa": {"t": "380089", "m": "380079", "k": "380084"},
                "uczniowie": {"t": "55136", "m": "271015", "k": "271076"},
            },
        },
    },
    "zasadnicze_zawodowe": {
        "topic": "P2143",
        "level": POWIAT,
        "file": "zasadnicze_zawodowe.json",
        "slices": {
            "specjalne_przysposabiajace": {
                "uczniowie": {"t": "49213", "m": "270023", "k": "269837"},
                "uczniowie_1_klasa": {"t": "379351", "m": "379335", "k": "379343"},
                "absolwenci": {"t": "49285", "m": "270022", "k": "269971"},
            },
            "ponadpodstawowe_przysposabiajace": {
                "uczniowie": {"t": "49347", "m": "270012", "k": "269841"},
                "absolwenci": {"t": "49244", "m": "270042", "k": "270068"},
            },
            "zawodowe_mlodziezy_specjalne": {
                "uczniowie": {"t": "49222", "m": "270019", "k": "270058"},
                "uczniowie_1_klasa": {"t": "379354", "m": "379338", "k": "379346"},
                "absolwenci": {"t": "49294", "m": "270039", "k": "269886"},
            },
            "zawodowe_doroslych": {
                "uczniowie": {"t": "49504", "m": "269901", "k": "269914"},
                "absolwenci": {"t": "49496", "m": "269909", "k": "269806"},
            },
            "ponadpodstawowe_zasadnicze_doroslych": {
                "uczniowie": {"t": "49529", "m": "269945", "k": "269835"},
                "absolwenci": {"t": "49524", "m": "269890", "k": "270073"},
            },
            "zawodowe_mlodziezy_bez_specjalnych": {
                "uczniowie": {"t": "49247", "m": "269878", "k": "269834"},
                "uczniowie_1_klasa": {"t": "379353", "m": "379337", "k": "379345"},
                "absolwenci": {"t": "49368", "m": "269893", "k": "269895"},
            },
        },
    },
    # Raw BDL-fetched slices only -- licea_ogolnoksztalcace and zasadnicze_zawodowe
    # ageGroups, plus the "razem" sum and "_udzial" share measures, are added
    # afterward by build_szkolnictwo_ponadpodstawowe.py (copied from
    # liceum.json/zasadnicze_zawodowe.json and computed, not fetched from BDL
    # again) -- see that script's docstring for the full ageGroup list and why
    # "technika" and "artystyczne_dajace_uprawnienia" stay two separate BDL
    # fetches here rather than one pre-combined id (BDL's own combined
    # "Technika (wraz z ogolnoksztalcacymi artystycznymi)" total, P3480, has no
    # sex breakdown at all).
    "szkolnictwo_ponadpodstawowe": {
        "topic": "P2144/P2179/P3762/P3764",
        "level": POWIAT,
        "file": "szkolnictwo_ponadpodstawowe.json",
        "slices": {
            "technika": {
                "uczniowie": {"t": "51991", "m": "270423", "k": "270271"},
                "uczniowie_1_klasa": {"t": "382752", "m": "383484", "k": "382770"},
                "absolwenci": {"t": "51882", "m": "270394", "k": "270383"},
            },
            "artystyczne_dajace_uprawnienia": {
                "uczniowie": {"t": "272502", "m": "272516", "k": "272480"},
                "uczniowie_1_klasa": {"t": "380934", "m": "380926", "k": "380930"},
                "absolwenci": {"t": "272449", "m": "272478", "k": "272485"},
            },
            "branzowe_I_st": {
                "uczniowie": {"t": "569055", "m": "569091", "k": "569064"},
                "uczniowie_1_klasa": {"t": "569116", "m": "569134", "k": "569125"},
                "absolwenci": {"t": "569073", "m": "569100", "k": "569082"},
            },
            # No "uczniowie_1_klasa" id exists for licea profilowane -- BDL
            # never published a 1st-class breakdown for this (largely phased-
            # out) school type, confirmed live: absent from /variables for
            # this n1, not just unfetched.
            "licea_profilowane": {
                "uczniowie": {"t": "52125", "m": "270446", "k": "270232"},
                "absolwenci": {"t": "52229", "m": "270172", "k": "270333"},
            },
            "artystyczne_niedajace_uprawnien": {
                "uczniowie": {"t": "55054", "m": "270115", "k": "270132"},
                "uczniowie_1_klasa": {"t": "380932", "m": "380924", "k": "380928"},
                "absolwenci": {"t": "55058", "m": "270137", "k": "270105"},
            },
        },
    },
    "uczelnie": {
        "topic": "P3226",
        "level": POWIAT,
        "file": "uczelnie.json",
        "slices": {
            "default": {
                "studenci": {"m": "377823", "k": "377825"},
                "absolwenci": {"m": "377824", "k": "377820"},
            },
        },
    },
    "wypadki_przy_pracy": {
        "topic": "P2276",
        "level": POWIAT,
        "file": "wypadki_przy_pracy.json",
        "slices": {"default": {"default": {"m": "58355", "k": "58357"}}},
    },
    "kluby_sportowe": {
        "topic": "P2155",
        "level": POWIAT,
        "file": "kluby_sportowe.json",
        "slices": {"default": {"default": {"m": "60313", "k": "59629"}}},
    },
    "zamachy_samobojcze": {
        "topic": "P3833",
        "level": POWIAT,
        "file": "zamachy_samobojcze.json",
        "slices": {
            "default": {
                "ogolem": {"m": "1365335", "k": "1365336"},
                "zakonczone_zgonem": {"m": "1365340", "k": "1365341"},
            },
        },
    },
    "wyksztalcenie_nsp": {
        "topic": "P4318",
        "level": POWIAT,
        "file": "wyksztalcenie_nsp.json",
        "slices": {
            "ogolem": {"default": {"m": "1719978", "k": "1719988"}},
            "wyzsze": {"default": {"m": "1719979", "k": "1719989"}},
            "sr_i_pol_ogolem": {"default": {"m": "1719980", "k": "1719990"}},
            "sr_ogolnoksztalcace": {"default": {"m": "1719981", "k": "1719991"}},
            "sr_zawodowe": {"default": {"m": "1719982", "k": "1719992"}},
            "zasadnicze_branzowe": {"default": {"m": "1719983", "k": "1719993"}},
            "gimnazjalne": {"default": {"m": "1719984", "k": "1719994"}},
            "podstawowe_ukonczone": {"default": {"m": "1719985", "k": "1719995"}},
            "podstawowe_niekonczone": {"default": {"m": "1719986", "k": "1719996"}},
            "nieustalony": {"default": {"m": "1719987", "k": "1719997"}},
        },
    },
    "stan_cywilny_nsp": {
        "topic": "P4288",
        "level": POWIAT,
        "file": "stan_cywilny_nsp.json",
        "slices": {
            "ogolem": {"default": {"m": "1652563", "k": "1652569"}},
            "kawalerowie_panny": {"default": {"m": "1652564", "k": "1652570"}},
            "zonaci_zamezne": {"default": {"m": "1652565", "k": "1652571"}},
            "wdowcy_wdowy": {"default": {"m": "1652566", "k": "1652572"}},
            "rozwiedzeni": {"default": {"m": "1652567", "k": "1652573"}},
            "nieustalony": {"default": {"m": "1652568", "k": "1652574"}},
        },
    },
    "ludnosc_roczniki_nsp": {
        "topic": "P4254",
        "level": POWIAT,
        "file": "ludnosc_roczniki_nsp.json",
        "slices": {"default": {"default": {"m": "1644663", "k": "1644755"}}},
    },
    "gestosc_zaludnienia": {
        "topic": "P2425",
        "level": POWIAT,
        "file": "gestosc_zaludnienia.json",
        "slices": {"default": {"default": {"t": "60559"}}},
    },
    "wynagrodzenia": {
        "topic": "P2497",
        "level": POWIAT,
        "file": "wynagrodzenia.json",
        "slices": {
            "default": {
                "default": {"t": "64428"},
                "relative": {"t": "64429"},
            },
        },
    },
    "bezdomnosc_mieszkancy": {
        "topic": "P1799",
        "level": POWIAT,
        "file": "bezdomnosc_mieszkancy.json",
        "slices": {"default": {"default": {"t": "72323", "m": "1609987", "k": "1609986"}}},
    },
    "bezdomnosc_bezdomni": {
        "topic": "P1799",
        "level": POWIAT,
        "file": "bezdomnosc_bezdomni.json",
        "slices": {"default": {"default": {"t": "195855"}}},
    },
    "zgwalcenia": {
        "topic": "P4601",
        "level": POWIAT,
        "file": "zgwalcenia.json",
        "slices": {"default": {"default": {"t": "1749162"}}},
    },
    "fundusz_alimentacyjny": {
        "topic": "P4451",
        "level": POWIAT,
        "file": "fundusz_alimentacyjny.json",
        "slices": {
            "default": {
                "recipients_per10k": {"t": "1728280"},
                "recipients": {"t": "1728281"},
                "debtors_per100k": {"t": "1728282"},
                "debtors_evasion": {"t": "1728293"},
                "recovered_share": {"t": "1728294"},
                "spent_total": {"t": "1728296"},
            },
        },
    },
}
