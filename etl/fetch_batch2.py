"""
Second big variable batch, chosen 2026-07-21 via the BDL subject/variable
catalog exploration (see VARIABLES_PLAN.md history and the bdl_catalog
artifacts). Each entry below was individually verified against the live
BDL API (n1/n2/n3 fields, sex-pairing, level availability) before being
included -- see the conversation for the labeling audit that caught e.g.
three P2035 "gmina-only" variants that looked like totals but weren't
(deliberately excluded here).

FILES: dict of output filename -> spec. Each spec is either:
  - {"level": N, "slices": {ageGroup_key: {measure_key: {"k": id, "m": id,
    "og": id_or_None}}}}  (gendered: t computed as k+m unless "og" given,
    in which case og IS used as t directly since it may not equal k+m
    exactly for some published totals)
  - {"level": N, "single": id}  (non-gendered: only "t", no k/m)
"""

import json
import os

from dotenv import load_dotenv

from bdl_client import fetch_variable_data, flatten, unit_id_to_teryt

load_dotenv()

OUT_DIR = "../data"

POWIAT = 5
GMINA = 6

FILES = {
    "population_by_age.json": {
        "level": POWIAT,
        "slices": {
            "ogolem": {"default": {"k": "453347", "m": "453359"}},
            "0-2": {"default": {"k": "453348", "m": "453360"}},
            "0-14": {"default": {"k": "1613320", "m": "1613317"}},
            "3-6": {"default": {"k": "453349", "m": "453361"}},
            "7-12": {"default": {"k": "453350", "m": "453362"}},
            "13-15": {"default": {"k": "453351", "m": "453363"}},
            "15-64": {"default": {"k": "1613221", "m": "1613218"}},
            "16-19": {"default": {"k": "453352", "m": "453364"}},
            "19-24": {"default": {"k": "1613257", "m": "1613254"}},
            "20-24": {"default": {"k": "453353", "m": "453365"}},
            "25-34": {"default": {"k": "453354", "m": "453366"}},
            "35-44": {"default": {"k": "453355", "m": "453367"}},
            "45-54": {"default": {"k": "453356", "m": "453368"}},
            "55-64": {"default": {"k": "453357", "m": "453369"}},
            "65plus": {"default": {"k": "453358", "m": "453370"}},
        },
    },
    "median_age.json": {
        "level": POWIAT,
        "slices": {"default": {"default": {"k": "746291", "m": "746290"}}},
    },
    "rolnictwo_pracujacy.json": {
        "level": POWIAT,
        "slices": {
            "gospodarstwa_rolne": {"default": {"k": "1623387", "m": "1623386"}},
            "gospodarstwa_indywidualne": {"default": {"k": "1623390", "m": "1623389"}},
        },
    },
    "rolnictwo_kierujacy.json": {
        "level": POWIAT,
        "slices": {
            "gospodarstwo": {"default": {"k": "1623159", "m": "1623152"}},
            "uzytkownik": {"default": {"k": "1623180", "m": "1623173"}},
        },
    },
    "rolnictwo_uzytkownicy.json": {
        "level": POWIAT,
        "slices": {"default": {"default": {"k": "1647648", "m": "1647647"}}},
    },
    "liceum_klasa1.json": {  # merged into liceum.json separately, see merge_liceum.py
        "level": POWIAT,
        "slices": {"default": {"uczniowie_1_klasa": {"og": "378690", "k": "378694", "m": "378692"}}},
    },
    "szkoly_policealne.json": {
        "level": POWIAT,
        "slices": {
            "kolegium_bez_specjalnych": {
                "uczniowie": {"og": "55127", "k": "271118", "m": "271179"},
                "absolwenci": {"og": "55074", "k": "271035", "m": "271077"},
                "uczniowie_1_klasa": {"og": "380088", "k": "380083", "m": "380078"},
            },
            "pomaturalne_doroslych": {
                "absolwenci": {"og": "55210", "k": "271072", "m": "271131"},
                "uczniowie": {"og": "55178", "k": "271121", "m": "271042"},
            },
            "ogolem_z_kolegiami": {
                "absolwenci": {"og": "55082", "k": "271161", "m": "271040"},
                "uczniowie_1_klasa": {"og": "380091", "k": "380086", "m": "380081"},
                "uczniowie": {"og": "55160", "k": "271082", "m": "271150"},
            },
            "pomaturalne_mlodziezy": {
                "absolwenci": {"og": "55085", "k": "271185", "m": "271133"},
                "uczniowie": {"og": "55075", "k": "271099", "m": "271123"},
            },
            "specjalne": {
                "absolwenci": {"og": "55174", "k": "271171", "m": "271031"},
                "uczniowie_1_klasa": {"og": "380089", "k": "380084", "m": "380079"},
                "uczniowie": {"og": "55136", "k": "271076", "m": "271015"},
            },
        },
    },
    "zasadnicze_zawodowe.json": {
        "level": POWIAT,
        "slices": {
            "specjalne_przysposabiajace": {
                "uczniowie": {"og": "49213", "k": "269837", "m": "270023"},
                "uczniowie_1_klasa": {"og": "379351", "k": "379343", "m": "379335"},
                "absolwenci": {"og": "49285", "k": "269971", "m": "270022"},
            },
            "ponadpodstawowe_przysposabiajace": {
                "uczniowie": {"og": "49347", "k": "269841", "m": "270012"},
                "absolwenci": {"og": "49244", "k": "270068", "m": "270042"},
            },
            "zawodowe_mlodziezy_specjalne": {
                "uczniowie": {"og": "49222", "k": "270058", "m": "270019"},
                "uczniowie_1_klasa": {"og": "379354", "k": "379346", "m": "379338"},
                "absolwenci": {"og": "49294", "k": "269886", "m": "270039"},
            },
            "zawodowe_doroslych": {
                "uczniowie": {"og": "49504", "k": "269914", "m": "269901"},
                "absolwenci": {"og": "49496", "k": "269806", "m": "269909"},
            },
            "ponadpodstawowe_zasadnicze_doroslych": {
                "uczniowie": {"og": "49529", "k": "269835", "m": "269945"},
                "absolwenci": {"og": "49524", "k": "270073", "m": "269890"},
            },
            "zawodowe_mlodziezy_bez_specjalnych": {
                "uczniowie": {"og": "49247", "k": "269834", "m": "269878"},
                "uczniowie_1_klasa": {"og": "379353", "k": "379345", "m": "379337"},
                "absolwenci": {"og": "49368", "k": "269895", "m": "269893"},
            },
        },
    },
    "uczelnie.json": {
        "level": POWIAT,
        "slices": {
            "default": {
                "studenci": {"k": "377825", "m": "377823"},
                "absolwenci": {"k": "377820", "m": "377824"},
            }
        },
    },
    "wypadki_przy_pracy.json": {
        "level": POWIAT,
        "slices": {"default": {"default": {"k": "58357", "m": "58355"}}},
    },
    "kluby_sportowe.json": {
        "level": POWIAT,
        "slices": {"default": {"default": {"k": "59629", "m": "60313"}}},
    },
    "zamachy_samobojcze.json": {
        "level": POWIAT,
        "slices": {
            "default": {
                "ogolem": {"k": "1365336", "m": "1365335"},
                "zakonczone_zgonem": {"k": "1365341", "m": "1365340"},
            }
        },
    },
    "wyksztalcenie_nsp.json": {
        "level": POWIAT,
        "slices": {
            "ogolem": {"default": {"k": "1719988", "m": "1719978"}},
            "wyzsze": {"default": {"k": "1719989", "m": "1719979"}},
            "sr_i_pol_ogolem": {"default": {"k": "1719990", "m": "1719980"}},
            "sr_ogolnoksztalcace": {"default": {"k": "1719991", "m": "1719981"}},
            "sr_zawodowe": {"default": {"k": "1719992", "m": "1719982"}},
            "zasadnicze_branzowe": {"default": {"k": "1719993", "m": "1719983"}},
            "gimnazjalne": {"default": {"k": "1719994", "m": "1719984"}},
            "podstawowe_ukonczone": {"default": {"k": "1719995", "m": "1719985"}},
            "podstawowe_niekonczone": {"default": {"k": "1719996", "m": "1719986"}},
            "nieustalony": {"default": {"k": "1719997", "m": "1719987"}},
        },
    },
    "stan_cywilny_nsp.json": {
        "level": POWIAT,
        "slices": {
            "ogolem": {"default": {"k": "1652569", "m": "1652563"}},
            "kawalerowie_panny": {"default": {"k": "1652570", "m": "1652564"}},
            "zonaci_zamezne": {"default": {"k": "1652571", "m": "1652565"}},
            "wdowcy_wdowy": {"default": {"k": "1652572", "m": "1652566"}},
            "rozwiedzeni": {"default": {"k": "1652573", "m": "1652567"}},
            "nieustalony": {"default": {"k": "1652574", "m": "1652568"}},
        },
    },
    "ludnosc_roczniki_nsp.json": {
        "level": POWIAT,
        "slices": {"default": {"default": {"k": "1644755", "m": "1644663"}}},
    },
    "gestosc_zaludnienia.json": {"level": POWIAT, "single": "60559"},
    "dochody_powiat.json": {"level": POWIAT, "single": "60505"},
    "dochody_gmina.json": {"level": GMINA, "single": "76973"},
}


def fetch_gendered(level, slices):
    out = {}
    for age_key, measures in slices.items():
        for measure_key, ids in measures.items():
            rows_by_sex = {}
            for sex in ("k", "m"):
                raw = fetch_variable_data(ids[sex], unit_level=level)
                rows_by_sex[sex] = flatten(sex, raw)
            og_rows = flatten("og", fetch_variable_data(ids["og"], unit_level=level)) if ids.get("og") else []

            import pandas as pd

            all_rows = rows_by_sex["k"] + rows_by_sex["m"] + og_rows
            df = pd.DataFrame(all_rows)
            df["teryt"] = df["unit_id"].apply(lambda u: unit_id_to_teryt(u, level=level))
            for (teryt, year), g in df.groupby(["teryt", "year"]):
                vals = dict(zip(g["variable_id"], g["value"]))
                k = vals.get("k")
                m = vals.get("m")
                t = vals.get("og")
                if t is None and m is not None and k is not None:
                    t = m + k
                out.setdefault(teryt, {}).setdefault(str(int(year)), {})[f"{age_key}__{measure_key}"] = {"t": t, "m": m, "k": k}
    return out


def fetch_single(level, variable_id):
    raw = fetch_variable_data(variable_id, unit_level=level)
    out = {}
    for row in flatten("t", raw):
        teryt = unit_id_to_teryt(row["unit_id"], level=level)
        year = str(row["year"])
        out.setdefault(teryt, {}).setdefault(year, {})["default__default"] = {"t": row["value"], "m": None, "k": None}
    return out


if __name__ == "__main__":
    for filename, spec in FILES.items():
        print(f"--- {filename} ---")
        if "single" in spec:
            data = fetch_single(spec["level"], spec["single"])
        else:
            data = fetch_gendered(spec["level"], spec["slices"])
        path = os.path.join(OUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {len(data)} regions -> {path}")
