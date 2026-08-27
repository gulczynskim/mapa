// English overrides for VARIABLE_META (variables.js). DRAFT -- not yet wired
// into app.js. Mirrors variables.js key-for-key; only the user-facing text
// fields are overridden here (label, meaning, source, accessNote, unit,
// agegroupLabel, and each ageGroups/measures entry's own label+unit).
// Structural fields (file, topic, levels, sharesMeaningful, flags like
// hasTotal/binary/sexScope/fixedScaleAcrossYears, and every key) are NOT
// repeated -- the merge at load time (metaFor(variable, "en"), to be added
// in app.js) takes VARIABLE_META[key] as the base and overlays only the
// string fields present here, so a variable with no entry below (or a
// partially-filled one) silently falls back to Polish for whatever's
// missing. Never breaks the page just because a translation isn't done yet.
//
// Each ageGroups/measures entry is either a plain string (overrides only
// that option's label) or, when the ORIGINAL variables.js entry has its own
// `unit` override (e.g. wypadki_przy_pracy's "default_per100k", unit "na
// 100 tys."), an object `{ label, unit }` overriding both. A measures entry
// with no unit override here inherits the variable's own top-level `unit`
// below, exactly mirroring how variables.js itself works (unit is only
// re-specified per-measure when it actually differs from the variable's
// default).
//
// Unit glossary: osób -> people, zł -> PLN, głosów -> votes, lat -> years,
// przestępstw -> crimes, osób/km² -> people/km², na 100 tys. -> per 100,000.
//
// Glossary (verified against each institution's own English materials,
// not just translated ad hoc -- see chat for sourcing):
//   GUS -> Statistics Poland
//   Bank Danych Lokalnych (BDL) -> Local Data Bank
//   Państwowa Komisja Wyborcza (PKW) -> National Electoral Commission
//   Centralna Komisja Egzaminacyjna (CKE) -> Central Examination Board
//   Egzamin ósmoklasisty -> Eighth-grade exam
//   Zakład Ubezpieczeń Społecznych (ZUS) -> Social Insurance Institution
//   wypadek przy pracy -> accident at work (ZUS's own phrasing, not
//     "workplace accident")
//   jednorazowe odszkodowanie -> lump-sum compensation (ZUS's own phrasing,
//     not "one-time compensation")
//   Narodowy Spis Powszechny (NSP) -> National Population and Housing Census
//   Powszechny Spis Rolny -> Agricultural Census
//   powiat -> county, gmina -> municipality, podregion -> subregion,
//     województwo -> voivodeship (user's own explicit choice)
//   wójt/burmistrz/prezydent miasta -> Mayor, uniformly (user's own explicit
//     choice -- the three-way Polish distinction is not preserved in EN)
//   sejmik województwa -> Voivodeship Assembly
//   TERYT -> kept as-is (a proper-noun code-system name, not translated)
//   Place names (gmina/powiat/voivodeship/city names) -> always kept in
//     Polish, never translated (user's own explicit choice)
//   PKD section names (A-S) -> official Eurostat NACE Rev. 2 section titles,
//     since PKD's sections map 1:1 to NACE by design and Eurostat already
//     publishes fixed English wording for exactly these letters
const VARIABLE_META_EN = {
  unemployment: {
    label: "Registered unemployment",
    unit: "%",
    meaning:
      "Registered unemployment rate -- the share of people registered as unemployed at labour " +
      "offices among the working-age, economically active population. Annual data, counties.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2670, county level. Variable codes: 79214 (total), 79215 (men), 79216 (women) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Working age" },
    measures: { default: "Value" },
  },
  labor_force_activity: {
    label: "Labour force participation (Census)",
    unit: "%",
    meaning:
      "Labour force participation rate -- the share of economically active people (working or " +
      "actively looking for work) in a given age group. A one-off measurement from the 2021 " +
      "National Population and Housing Census, not annual data. Every age group (15+ and six " +
      "10-year bands) has a \"total\" value published directly by the LDB.",
    source: "2021 National Population and Housing Census (Local Data Bank, Statistics Poland)",
    accessNote:
      "LDB subject P4309, county level. Variable codes (total/men/women): 1670866/73/80 (15+), " +
      "1670867/74/81 (15-24), 1670868/75/82 (25-34), 1670869/76/83 (35-44), 1670870/77/84 (45-54), " +
      "1670871/78/85 (55-64), 1670872/79/86 (65+) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      "15plus": "15 years and over",
      "15_24": "15-24 years",
      "25_34": "25-34 years",
      "35_44": "35-44 years",
      "45_54": "45-54 years",
      "55_64": "55-64 years",
      "65plus": "65 years and over",
    },
    measures: { default: "Value" },
  },
  e8_polski: {
    label: "Eighth-grade exam -- Polish",
    unit: "%",
    meaning:
      "Percentage score on the eighth-grade exam in Polish, by the county where the school is " +
      "located (not the student's residence). \"Total\" for the mean is a weighted average by the " +
      "number of women/men sitting the exam; no \"total\" for the median -- the medians of two " +
      "subgroups cannot be correctly combined into an overall median.",
    source: "Central Examination Board (CKE)",
    accessNote:
      "Obtained under Poland's public-information-access law (not publicly available via an API). " +
      "Source files: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", 2022-2025.",
    ageGroups: { default: "Eighth-graders" },
    measures: { mean: "Mean", median: "Median" },
  },
  e8_matematyka: {
    label: "Eighth-grade exam -- Mathematics",
    unit: "%",
    meaning:
      "Percentage score on the eighth-grade exam in mathematics, by the county where the school is " +
      "located. \"Total\" for the mean is a weighted average by the number of women/men sitting the " +
      "exam; no \"total\" for the median.",
    source: "Central Examination Board (CKE)",
    accessNote:
      "Obtained under Poland's public-information-access law (not publicly available via an API). " +
      "Source files: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", 2022-2025.",
    ageGroups: { default: "Eighth-graders" },
    measures: { mean: "Mean", median: "Median" },
  },
  wybory_rady_gmin: {
    label: "Municipal council elections",
    unit: "people",
    meaning:
      "Candidates, elected councillors and votes cast in municipal (gmina) council elections, by sex. " +
      "Election years only, 1998-2024 (not continuous, unlike the LDB's own \"Radni gminy\" series). " +
      "Warsaw is counted as a single city council -- the district (dzielnica) councils of the capital are " +
      "deliberately excluded. 52 municipalities from 1998-2014 (mostly the former separate Warsaw " +
      "municipalities that existed before the 2002 unification) have no present-day administrative " +
      "counterpart and are listed under their historical 6-digit TERYT code -- they won't appear on the " +
      "map.",
    source: "National Electoral Commission (PKW)",
    accessNote:
      "PKW candidate data sets from the user's own research project (\"Bitwa o wozy i Parytety w " +
      "Polsce\") -- see etl/pkw_councils.py and etl/pkw_prepare_merge.py.",
    ageGroups: { default: "All candidates/councillors" },
    measures: {
      candidates: { label: "Candidates", unit: "people" },
      elected: { label: "Elected councillors", unit: "people" },
      votes: { label: "Votes received", unit: "votes" },
    },
  },
  wybory_rady_powiatow: {
    label: "County council elections",
    unit: "people",
    meaning:
      "Candidates, elected councillors and votes cast in county (powiat) council elections, by sex. " +
      "Election years only, 1998-2024 (not continuous, same as \"Municipal council elections\"). " +
      "Cities with county rights (Kraków, Warsaw, etc.) have no separate county council, so they " +
      "don't appear in this data set -- their councillors are counted only under \"Municipal " +
      "council elections\".",
    source: "National Electoral Commission (PKW)",
    accessNote:
      "PKW candidate data sets from the user's own research project. 2024 data comes from a " +
      "different source folder than other years (Regional/2024/, not Councils/ -- PKW changed how " +
      "it publishes that year) -- see etl/pkw_councils.py.",
    ageGroups: { default: "All candidates/councillors" },
    measures: {
      candidates: { label: "Candidates", unit: "people" },
      elected: { label: "Elected councillors", unit: "people" },
      votes: { label: "Votes received", unit: "votes" },
    },
  },
  wybory_sejmiku: {
    label: "Voivodeship assembly elections",
    unit: "people",
    meaning:
      "Candidates, elected assembly members and votes cast in voivodeship assembly (sejmik) elections, by " +
      "sex. Election years only, 1998-2024. Voivodeship boundaries on this map are assembled by combining " +
      "counties -- they don't come from a separate boundary source.",
    source: "National Electoral Commission (PKW)",
    accessNote:
      "PKW candidate data sets from the user's own research project; 2024 data from Regional/2024/ -- see " +
      "etl/pkw_councils.py and etl/build_wojewodztwa.py.",
    ageGroups: { default: "All candidates/members" },
    measures: {
      candidates: { label: "Candidates", unit: "people" },
      elected: { label: "Elected members", unit: "people" },
      votes: { label: "Votes received", unit: "votes" },
    },
  },
  wybory_wojtowie: {
    label: "Mayoral elections",
    unit: "people",
    meaning:
      "Candidates, the elected candidate and votes cast in mayoral elections (wójt/burmistrz/" +
      "prezydent miasta, rendered here uniformly as \"Mayor\"), by sex. \"Candidates\" is the round-1 " +
      "field (everyone registered); \"Votes received, round 1\"/\"Votes received, round 2\" are " +
      "counted separately -- candidates who didn't reach round 2 show 0 there. \"Elected\" covers " +
      "the winner regardless of which round decided the election.",
    source: "National Electoral Commission (PKW)",
    accessNote:
      "PKW candidate data sets from the user's own research project -- see etl/pkw_mayors.py and " +
      "etl/pkw_prepare_merge.py.",
    ageGroups: { default: "All candidates" },
    measures: {
      candidates: { label: "Candidates", unit: "people" },
      elected: { label: "Elected", unit: "people" },
      votes_r1: { label: "Votes received, round 1", unit: "votes" },
      votes_r2: { label: "Votes received, round 2", unit: "votes" },
    },
  },
  population_25_34: {
    label: "Population aged 25-34 (Census)",
    unit: "people",
    meaning:
      "Resident population aged 25-34 (the 25-29 and 30-34 bands combined), by sex -- a rough proxy for " +
      "selective migration among young adults. \"Resident population\" is the LDB's own concept, based on " +
      "actual place of residence at census time rather than official registration -- this differs from " +
      "the ongoing annual population register used elsewhere on this map. A one-off measurement from the " +
      "2021 Census (as of 31 March 2021), not annual data.",
    source: "2021 National Population and Housing Census (Local Data Bank, Statistics Poland)",
    accessNote:
      "LDB subject P4253 (\"Resident population by age group and sex\"), county level. Variable codes: " +
      "1644517/1644518 (total 25-29/30-34), 1644537/1644538 (men 25-29/30-34), 1644557/1644558 (women " +
      "25-29/30-34) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "25-34 years" },
    measures: { default: "Value" },
  },
  wages: {
    label: "Wages",
    unit: "PLN",
    meaning: "Average gross monthly wage by sex and place of residence (not place of work).",
    source: "Statistics Poland (GUS), \"Distribution of wages and salaries in the national economy\" (annual publication)",
    accessNote:
      "Not from the LDB API -- the LDB doesn't publish wages by sex at county level. Data from a " +
      "GUS publication (Excel file, table \"Wage measures by place of residence and sex\"), " +
      "uploaded manually each year.",
    ageGroups: { default: "All employed persons" },
    measures: { mean: "Mean", median: "Median" },
  },
  e8_angielski: {
    label: "Eighth-grade exam -- English",
    unit: "%",
    meaning:
      "Percentage score on the eighth-grade exam in English, by the county where the school is " +
      "located. CKE also publishes results for French/Spanish/German/Russian/Italian, omitted for " +
      "now -- a small and uneven number of test-takers in most counties (an elective subject, " +
      "dependent on what each school offers).",
    source: "Central Examination Board (CKE)",
    accessNote:
      "Obtained under Poland's public-information-access law (not publicly available via an API). " +
      "Source files: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", 2022-2025.",
    ageGroups: { default: "Eighth-graders" },
    measures: { mean: "Mean", median: "Median" },
  },
  pkd_zatrudnienie: {
    label: "Employment by economic activity (PKD)",
    unit: "people",
    agegroupLabel: "PKD section",
    meaning:
      "Number of employed persons by PKD section (Polska Klasyfikacja Działalności, Poland's national " +
      "activity classification, aligned with EU NACE Rev. 2) and sex, as of a chosen month (the LDB " +
      "publishes this subject as 12 independent monthly snapshots, not one annual figure). The \"% of " +
      "employed\" measure (for a given month): the number employed in that section divided by \"All " +
      "sections\" for the same month (and sex), times 100.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P4283, county level -- 12 sets of variables (one per month), codes discovered " +
      "live via n1/n2/n3, see etl/fetch_pkd.py -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      ogolem: "All sections",
      A: "A - Agriculture, forestry and fishing",
      B: "B - Mining and quarrying",
      C: "C - Manufacturing",
      D: "D - Electricity, gas, steam and air conditioning supply",
      E: "E - Water supply; sewerage, waste management and remediation activities",
      F: "F - Construction",
      G: "G - Wholesale and retail trade; repair of motor vehicles and motorcycles",
      H: "H - Transportation and storage",
      I: "I - Accommodation and food service activities",
      J: "J - Information and communication",
      K: "K - Financial and insurance activities",
      L: "L - Real estate activities",
      M: "M - Professional, scientific and technical activities",
      N: "N - Administrative and support service activities",
      O: "O - Public administration and defence; compulsory social security",
      P: "P - Education",
      Q: "Q - Human health and social work activities",
      R: "R - Arts, entertainment and recreation",
      S: "S - Other service activities",
    },
    measures: {
      "01_default": "January -- Count", "01_odsetek": { label: "January -- % of employed", unit: "%" },
      "02_default": "February -- Count", "02_odsetek": { label: "February -- % of employed", unit: "%" },
      "03_default": "March -- Count", "03_odsetek": { label: "March -- % of employed", unit: "%" },
      "04_default": "April -- Count", "04_odsetek": { label: "April -- % of employed", unit: "%" },
      "05_default": "May -- Count", "05_odsetek": { label: "May -- % of employed", unit: "%" },
      "06_default": "June -- Count", "06_odsetek": { label: "June -- % of employed", unit: "%" },
      "07_default": "July -- Count", "07_odsetek": { label: "July -- % of employed", unit: "%" },
      "08_default": "August -- Count", "08_odsetek": { label: "August -- % of employed", unit: "%" },
      "09_default": "September -- Count", "09_odsetek": { label: "September -- % of employed", unit: "%" },
      "10_default": "October -- Count", "10_odsetek": { label: "October -- % of employed", unit: "%" },
      "11_default": "November -- Count", "11_odsetek": { label: "November -- % of employed", unit: "%" },
      "12_default": "December -- Count", "12_odsetek": { label: "December -- % of employed", unit: "%" },
    },
  },
  life_expectancy: {
    label: "Life expectancy",
    unit: "years",
    agegroupLabel: "Age",
    meaning:
      "Expected remaining years of life from a given age, by sex. Available only at subregion " +
      "level -- the LDB doesn't publish this indicator for counties or municipalities. No \"total\" " +
      "value: the LDB publishes this only separately for men and women, and averaging two life " +
      "expectancies without weighting by population would be just as wrong as it would be for the " +
      "eighth-grade exam median.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2730, subregion level. Variable codes (men/women): 101554/101555 (from birth), " +
      "105836/105837 (from 15), 105845/105846 (from 30), 105854/105855 (from 45), 105863/105864 " +
      "(from 60), 101563/101564 (from 65) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      "0": "From birth", "15": "From 15", "30": "From 30",
      "45": "From 45", "60": "From 60", "65": "From 65",
    },
    measures: { default: "Value" },
  },
  population_by_age: {
    label: "Population by age group",
    unit: "people",
    agegroupLabel: "Age group",
    meaning:
      "Total population (urban and rural combined) by age group and sex. Two overlapping sets of " +
      "categories coexist in this data: an older, finer breakdown (0-2, 3-6, 7-12, 13-15, 16-19, " +
      "20-24, 25-34, 35-44, 45-54, 55-64, 65 and over) and a newer, broader one (0-14, 15-64, 16-19, " +
      "19-24) introduced from 2010 -- they don't sum into a single consistent age pyramid, treat " +
      "them as independent categories.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P3447, county level. 15 age groups x 2 sexes = 30 variable codes, too many to " +
      "list here -- full list in etl/bdl_variables.py (key \"population_by_age\") -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      ogolem: "All age groups", "0-2": "0-2 years", "0-14": "0-14 years", "3-6": "3-6 years",
      "7-12": "7-12 years", "13-15": "13-15 years", "15-64": "15-64 years", "16-19": "16-19 years",
      "19-24": "19-24 years", "20-24": "20-24 years", "25-34": "25-34 years", "35-44": "35-44 years",
      "45-54": "45-54 years", "55-64": "55-64 years", "65plus": "65 years and over",
    },
    measures: { default: "Value" },
  },
  median_age: {
    label: "Median age of the population",
    unit: "years",
    meaning: "The age below and above which half the population falls (the median), by sex.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P3814, county level. Variable codes: 746289 (total), 746290 (men), 746291 " +
      "(women) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Value" },
  },
  rolnictwo_pracujacy: {
    label: "Workers on farms",
    unit: "people",
    agegroupLabel: "Farm type",
    meaning:
      "Family members and permanent hired workers on farms, by sex. \"All farms\" also includes " +
      "state/cooperative/company farms; \"individual farms\" is a subset -- private farms only. " +
      "A one-off 2020 Agricultural Census, not annual data.",
    source: "Local Data Bank, Statistics Poland (2020 Agricultural Census)",
    accessNote:
      "LDB subject P4081, county level. Variable codes: 1623387 (women, all farms), 1623386 (men, " +
      "all farms), 1623390 (women, individual farms), 1623389 (men, individual farms) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { gospodarstwa_rolne: "All farms", gospodarstwa_indywidualne: "Individual farms" },
    measures: { default: "Value" },
  },
  rolnictwo_kierujacy: {
    label: "Farm managers",
    unit: "people",
    agegroupLabel: "Role",
    meaning:
      "People associated with an individual farm, by sex -- the \"Production manager\" actually " +
      "runs the farm day-to-day, the \"Holder\" is the formal owner/possessor (can be a different " +
      "person than the manager). A one-off 2020 Agricultural Census.",
    source: "Local Data Bank, Statistics Poland (2020 Agricultural Census)",
    accessNote:
      "LDB subject P4077, county level. Variable codes: 1623159 (women, production manager), " +
      "1623152 (men, production manager), 1623180 (women, holder), 1623173 (men, holder) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { gospodarstwo: "Production manager", uzytkownik: "Holder (owner)" },
    measures: { default: "Value" },
  },
  rolnictwo_uzytkownicy: {
    label: "Holders of individual farms",
    unit: "people",
    meaning:
      "Holders and their family members working on individual farms, by sex. A one-off 2020 " +
      "Agricultural Census.",
    source: "Local Data Bank, Statistics Poland (2020 Agricultural Census)",
    accessNote:
      "LDB subject P4272, county level. Variable codes: 1647648 (women), 1647647 (men) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Value" },
  },
  szkoly_policealne: {
    label: "Post-secondary school pupils and graduates",
    unit: "people",
    agegroupLabel: "School type",
    meaning:
      "Pupils (total and first-year) and graduates of post-secondary schools, by school type and sex. Not " +
      "every school type has data for all three measures -- missing combinations show no data. Limited to " +
      "two types: \"Total (excluding special-needs)\" and \"Special-needs\". 2004 omitted -- the only " +
      "year with no breakdown by sex, real data starts in 2005.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2178, county level. 2 school types x up to 3 measures x 2 sexes = ~12 variable " +
      "codes -- full list in etl/bdl_variables.py (key \"szkoly_policealne\") -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      kolegium_bez_specjalnych: "Total (excluding special-needs)",
      specjalne: "Special-needs",
    },
    measures: { uczniowie: "Pupils", uczniowie_1_klasa: "First-year pupils", absolwenci: "Graduates" },
  },
  zasadnicze_zawodowe: {
    label: "Basic vocational schools",
    unit: "people",
    agegroupLabel: "School type",
    meaning:
      "Pupils (total and first-year) and graduates of basic vocational schools and related types, " +
      "by school type and sex. Not every school type has data for all three measures -- missing " +
      "combinations show no data.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2143, county level. 6 school types x up to 3 measures x 2 sexes = ~36 variable " +
      "codes, too many to list here -- full list in etl/bdl_variables.py (key " +
      "\"zasadnicze_zawodowe\") -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      ponadpodstawowe_przysposabiajace: "Post-primary work-preparation (special-needs)",
      ponadpodstawowe_zasadnicze_doroslych: "Post-primary basic vocational for adults",
      specjalne_przysposabiajace: "Special-needs work-preparation schools",
      zawodowe_doroslych: "Vocational for adults",
      zawodowe_mlodziezy_bez_specjalnych: "Vocational for young people (excluding special-needs)",
      zawodowe_mlodziezy_specjalne: "Vocational for young people (special-needs)",
    },
    measures: { uczniowie: "Pupils", uczniowie_1_klasa: "First-year pupils", absolwenci: "Graduates" },
  },
  szkolnictwo_ponadpodstawowe: {
    label: "Secondary school pupils and graduates (by school type)",
    unit: "people",
    agegroupLabel: "School type",
    meaning:
      "Pupils (total and first-year) and graduates of daytime secondary schools for young people " +
      "(excluding special-needs schools), by school type and sex. Not every type has data for all three " +
      "measures or every year -- specialized/profiled general secondary schools (\"licea profilowane\") " +
      "only 2004-2014 (phased out), basic vocational schools only up to about 2019, first-level sectoral " +
      "vocational schools (\"branżowe I stopnia\") only from 2017 (a reform replaced basic vocational " +
      "schools with these) -- missing combinations show no data. \"Technical schools\" is its own type " +
      "here (excluding art-profile schools) -- those are counted separately as their own type (\"General " +
      "art schools granting vocational qualifications\").\n" +
      "\"Total\": the sum of general secondary schools (licea ogólnokształcące), technical schools, " +
      "general art schools granting vocational qualifications, first-level sectoral vocational schools, " +
      "specialized/profiled general secondary schools, and basic vocational schools (each sex counted " +
      "separately) -- does NOT include art schools that don't grant vocational qualifications, nor " +
      "post-secondary schools (a different stage of education, a separate variable on this map). A type " +
      "missing for a given year/county counts as 0 when summing (separately for women and men), unless " +
      "ALL types are missing at once -- then the total is also treated as no data.\n" +
      "The \"Share\" measure (available only for Technical schools, General secondary schools and " +
      "First-level sectoral vocational schools): what share of the combined " +
      "pupil/first-year-pupil/graduate count across these THREE types falls to a given type, computed " +
      "separately per sex. For this calculation, \"Technical schools\" also includes general art schools " +
      "granting vocational qualifications. \"% women\"/\"% men\" are disabled for the \"Share\" measure.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "County level. General secondary schools: subject P2035 (same codes as the \"Secondary school " +
      "pupils and graduates\" -- general secondary\" variable). Basic vocational schools: subject " +
      "P2143, type \"vocational for young people (excluding special-needs)\" (same codes as the " +
      "\"Basic vocational schools\" variable). Technical and specialized/profiled general secondary " +
      "schools: subject P2144. Art schools (both types): subject P2179. First-level sectoral " +
      "vocational schools: pupils/graduates subject P3762, first-year pupils subject P3764. Full " +
      "code list in etl/bdl_variables.py (key \"szkolnictwo_ponadpodstawowe\") and " +
      "etl/build_szkolnictwo_ponadpodstawowe.py (merging general-secondary/basic-vocational data, " +
      "the \"Total\" sum, the \"Share\" measure) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      licea_ogolnoksztalcace: "General secondary schools",
      licea_profilowane: "Specialized/profiled general secondary schools",
      artystyczne_dajace_uprawnienia: "General art schools granting vocational qualifications",
      razem: "Total (general secondary, technical, first-level sectoral vocational, specialized/profiled general secondary, basic vocational)",
      artystyczne_niedajace_uprawnien: "Art schools not granting vocational qualifications",
      branzowe_I_st: "First-level sectoral vocational schools",
      technika: "Technical schools",
      zasadnicze_zawodowe: "Basic vocational schools",
    },
    measures: {
      uczniowie: "Pupils",
      uczniowie_udzial: { label: "Pupils -- share (technical/general secondary/first-level sectoral)", unit: "%" },
      uczniowie_1_klasa: "First-year pupils",
      uczniowie_1_klasa_udzial: { label: "First-year pupils -- share (technical/general secondary/first-level sectoral)", unit: "%" },
      absolwenci: "Graduates",
      absolwenci_udzial: { label: "Graduates -- share (technical/general secondary/first-level sectoral)", unit: "%" },
    },
  },
  uczelnie: {
    label: "University students and graduates",
    unit: "people",
    meaning: "Number of higher-education students and graduates, by sex and the county where the university is based.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P3226, county level. Variable codes: 377825 (students, women), 377823 " +
      "(students, men), 377820 (graduates, women), 377824 (graduates, men) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { studenci: "Students", absolwenci: "Graduates" },
  },
  wypadki_przy_pracy: {
    label: "Accidents at work",
    unit: "people",
    meaning:
      "Number of people injured in accidents at work (total), by sex. \"Per 100,000 employed\" measure: " +
      "the number injured divided by the total number employed in JUNE of that year (the \"Employment by " +
      "economic activity (PKD)\" variable, \"All sections\", June) and multiplied by 100,000. " +
      "\"Employment by economic activity (PKD)\" only has data from 2024, so this measure will show no " +
      "data for earlier years.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2276, county level. Variable codes: 58357 (women), 58355 (men) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Count", default_per100k: { label: "Per 100,000 employed", unit: "per 100,000" } },
  },
  jednorazowe_odszkodowania: {
    label: "Lump-sum compensation for accidents at work",
    unit: "people",
    meaning:
      "Number of lump-sum compensation payments for an accident at work or occupational disease " +
      "paid by ZUS in a given year, and the average amount of those payments, by sex. The " +
      "compensation may be granted to an insured person who has suffered permanent or long-term " +
      "damage to health as a result of an accident at work or occupational disease, and also to " +
      "the eligible family members of a person who died as a result of such an accident or disease " +
      "-- paid only on application, not automatically. The amount depends on the degree of damage " +
      "to health: ZUS pays a set amount for each per cent of permanent or long-term damage (from " +
      "April 2025 to the end of March 2026: PLN 1,636 per 1%), a rate updated once a year (from " +
      "1 April). The county is assigned based on the address of the contribution payer, NOT the " +
      "residence of the injured person. Does not include benefits paid under international " +
      "agreements. In 6 counties, the number of women was masked as 0 in the source for statistical " +
      "confidentiality (a threshold of fewer than 3 people) -- restored here as total minus men.",
    source: "Social Insurance Institution (ZUS)",
    accessNote:
      "ZUS publication \"Jednorazowe odszkodowania z tytułu wypadku przy pracy lub choroby " +
      "zawodowej wypłacone przez ZUS w 2025 r. oraz przeciętna wysokość wypłat według płci i " +
      "powiatu\" (Excel file, sheet \"JO 2025\"), uploaded manually, not from an API -- " +
      "https://lang.zus.pl/benefits/lump-sum-compensations-in-respect-of-an-accident-at-work " +
      "(ZUS's own English page for this benefit). Conversion: etl/convert_zus_odszkodowania.py.",
    ageGroups: { default: "Total" },
    measures: { liczba: "Number of people", wysokosc_srednia: { label: "Average amount", unit: "PLN" } },
  },
  kluby_sportowe: {
    label: "Sports club participants",
    unit: "people",
    meaning:
      "Number of people exercising in sports clubs (including religious clubs and school sports " +
      "clubs), by sex. \"Per 100,000 residents\" measure: the number of participants divided by " +
      "the county's total population (\"Population by age group\", \"All age groups\", same sex) " +
      "and multiplied by 100,000.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2155, county level. Variable codes: 59629 (women), 60313 (men) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Count", default_per100k: { label: "Per 100,000 residents", unit: "per 100,000" } },
  },
  zamachy_samobojcze: {
    label: "Suicide attempts",
    unit: "people",
    meaning:
      "Number of people involved in suicide attempts, by sex -- total and fatal. \"Per 100,000 " +
      "residents\" measures: the number in a given category divided by the county's total " +
      "population (\"Population by age group\", \"All age groups\") and multiplied by 100,000.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P3833, county level. Variable codes: 1365336 (women, all), 1365335 (men, all), " +
      "1365341 (women, fatal), 1365340 (men, fatal) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: {
      ogolem: "All -- count",
      ogolem_per100k: { label: "All -- per 100,000 residents", unit: "per 100,000" },
      zakonczone_zgonem: "Fatal -- count",
      zakonczone_zgonem_per100k: { label: "Fatal -- per 100,000 residents", unit: "per 100,000" },
    },
  },
  wyksztalcenie_nsp: {
    label: "Educational attainment, population 13+ (Census)",
    unit: "people",
    agegroupLabel: "Education level",
    meaning:
      "Resident population aged 13 and over by educational attainment and sex. A one-off 2021 " +
      "National Population and Housing Census, not annual data. \"Share\" measure: the number of " +
      "people with a given education level divided by \"All levels\" (for the same sex) and " +
      "multiplied by 100.",
    source: "2021 National Population and Housing Census (Local Data Bank, Statistics Poland)",
    accessNote:
      "LDB subject P4318, county level. 10 education levels x 2 sexes = 20 variable codes, too many " +
      "to list here -- full list in etl/bdl_variables.py (key \"wyksztalcenie_nsp\") -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      ogolem: "All levels",
      wyzsze: "Higher",
      sr_i_pol_ogolem: "Secondary and post-secondary (total)",
      sr_ogolnoksztalcace: "General secondary",
      sr_zawodowe: "Vocational secondary",
      zasadnicze_branzowe: "Basic vocational/sectoral",
      gimnazjalne: "Lower secondary (gimnazjum)",
      podstawowe_ukonczone: "Primary, completed",
      podstawowe_niekonczone: "Primary, not completed / none",
      nieustalony: "Not established",
    },
    measures: { default: "Count", odsetek: { label: "Share", unit: "%" } },
  },
  stan_cywilny_nsp: {
    label: "Marital status, population 15+ (Census)",
    unit: "people",
    agegroupLabel: "Marital status",
    meaning:
      "Resident population aged 15 and over by marital status and sex. A one-off 2021 National " +
      "Population and Housing Census, not annual data. \"Share\" measure: the number of people " +
      "with a given marital status divided by \"All\" (for the same sex) and multiplied by 100.",
    source: "2021 National Population and Housing Census (Local Data Bank, Statistics Poland)",
    accessNote:
      "LDB subject P4288, county level. Variable codes (women/men): 1652569/1652563 (all), " +
      "1652570/1652564 (never married), 1652571/1652565 (married), 1652572/1652566 (widowed), " +
      "1652573/1652567 (divorced), 1652574/1652568 (not established) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      ogolem: "All",
      kawalerowie_panny: "Never married",
      zonaci_zamezne: "Married",
      wdowcy_wdowy: "Widowed",
      rozwiedzeni: "Divorced",
      nieustalony: "Not established",
    },
    measures: { default: "Count", odsetek: { label: "Share", unit: "%" } },
  },
  ludnosc_roczniki_nsp: {
    label: "Total population (Census)",
    unit: "people",
    meaning:
      "Total resident population, by sex, from an LDB subject that also breaks the population down " +
      "by single year of age (0,1,2...) -- only the \"total\" variant (aggregated across ages) is " +
      "loaded here.",
    source: "2021 National Population and Housing Census (Local Data Bank, Statistics Poland)",
    accessNote:
      "LDB subject P4254, county level. Variable codes: 1644755 (women), 1644663 (men) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Value" },
  },
  gestosc_zaludnienia: {
    label: "Population density",
    unit: "people/km²",
    meaning: "Population per 1 km² of area. The LDB doesn't publish this indicator broken down by sex.",
    source: "Local Data Bank, Statistics Poland",
    accessNote: "LDB variable code: 60559 (subject P2425) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/60559",
    ageGroups: { default: "Total" },
    measures: { default: "Value" },
  },
  wynagrodzenia: {
    label: "Average wages",
    unit: "PLN",
    meaning:
      "Average gross monthly wage in the county. The \"Relative to national average\" measure is a " +
      "separate variable published directly by the LDB: the county's average wage as a percentage of the " +
      "national average (Poland = 100). The LDB doesn't publish this indicator by sex (for wages by sex, " +
      "see the \"Wages\" variable, based on a GUS publication that does break it down by sex and place of " +
      "residence, or the newer \"Median monthly wages\", published directly by the LDB, by sex and " +
      "month).",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P2497, county level. Variable codes: 64428 (average wage), 64429 (relative to " +
      "national average) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: {
      default: { label: "Average wage", unit: "PLN" },
      relative: { label: "Relative to national average (Poland=100)", unit: "%" },
    },
  },
  mediana_wynagrodzen: {
    label: "Median monthly wages",
    unit: "PLN",
    agegroupLabel: "Basis",
    meaning:
      "Median gross monthly wage, by sex and month (Measure -- all 12 months, same as the \"Employment by " +
      "economic activity (PKD)\" variable). Available in two parallel classifications (Basis): \"By place " +
      "of residence\" (the employee's residence) and \"By employer's registered seat\" -- the LDB " +
      "publishes both directly as separate variables. \"Total\" is also a separate variable published " +
      "directly by the LDB (a median computed by GUS from the underlying individual records).",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P4610, county level. 12 months x 2 classifications x 3 sexes = 72 variable codes, " +
      "too many to list here -- full list in etl/fetch_mediana_wynagrodzen.py (codes discovered live " +
      "via n1/n2/n3, not hardcoded) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: {
      zamieszkania: "By place of residence",
      siedziby: "By employer's registered seat",
    },
    measures: {
      "01": "January", "02": "February", "03": "March", "04": "April",
      "05": "May", "06": "June", "07": "July", "08": "August",
      "09": "September", "10": "October", "11": "November", "12": "December",
    },
  },
  bezdomnosc_mieszkancy: {
    label: "Residents of residential care facilities",
    unit: "people",
    meaning:
      "Number of residents of residential social-welfare facilities (care homes, shelters, night " +
      "shelters and others), by sex -- covering every category of resident, not only homeless " +
      "people (see the separate \"Homeless people in care facilities\" variable for that narrower " +
      "category). \"Per 100,000 residents\" measure: the number of facility residents divided by " +
      "the county's total population (\"Population by age group\", \"All age groups\", same sex) " +
      "and multiplied by 100,000.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P1799 (under G267): 1609986 (women), 1609987 (men), 72323 (total) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "All residents" },
    measures: { default: "Count", default_per100k: { label: "Per 100,000 residents", unit: "per 100,000" } },
  },
  bezdomnosc_bezdomni: {
    label: "Homeless people in care facilities",
    unit: "people",
    meaning:
      "Number of homeless people staying in night shelters, homes and shelters for the homeless. " +
      "The LDB doesn't publish this indicator by sex. \"Per 100,000 residents\" measure: the number " +
      "of homeless people divided by the county's total population (\"Population by age group\", " +
      "\"All age groups\") and multiplied by 100,000.",
    source: "Local Data Bank, Statistics Poland",
    accessNote: "LDB subject P1799 (under G267), variable 195855, county level -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Count", default_per100k: { label: "Per 100,000 residents", unit: "per 100,000" } },
  },
  zgwalcenia: {
    label: "Rape -- crimes confirmed by police",
    unit: "crimes",
    meaning:
      "Number of rape offences confirmed by the police. The LDB only publishes this indicator at " +
      "county level from 2025 (a single data point, not a time series) and not by sex. \"Per " +
      "100,000 residents\" measure: the number of rapes divided by the county's total population " +
      "(\"Population by age group\", \"All age groups\") and multiplied by 100,000.",
    source: "Local Data Bank, Statistics Poland",
    accessNote: "LDB subject P4601, variable 1749162, county level -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: { default: "Count", default_per100k: { label: "Per 100,000 residents", unit: "per 100,000" } },
  },
  fundusz_alimentacyjny: {
    label: "Alimony fund",
    unit: "people",
    meaning:
      "Beneficiaries and debtors of the alimony (child-support) fund. The LDB doesn't publish this " +
      "indicator by sex. Data available only from 2022. The six measures are six separate variables " +
      "published directly by the LDB, including both \"per 10,000\"/\"per 100,000 population\" measures: " +
      "\"Beneficiaries per 10,000 population\" and \"Beneficiaries (monthly average)\" are the number of " +
      "people receiving fund benefits; \"Debtors per 100,000 population\" is the overall number of " +
      "alimony debtors; \"Debtors under evasion proceedings\" is a narrower subset -- debtors against " +
      "whom proceedings are underway to formally declare them as evading their alimony obligations; \"% " +
      "of funds recovered from debtors\" is the share of paid-out benefits recovered from debtors through " +
      "enforcement; \"Total spent from the fund that year\" is the total amount of benefits paid out that " +
      "year.",
    source: "Local Data Bank, Statistics Poland",
    accessNote:
      "LDB subject P4451, county level -- variable codes: 1728280 (beneficiaries per 10,000 " +
      "population), 1728281 (beneficiaries, monthly average), 1728282 (debtors per 100,000 " +
      "population), 1728293 (debtors under evasion proceedings), 1728294 (% of funds recovered), " +
      "1728296 (total spent that year) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{code}",
    ageGroups: { default: "Total" },
    measures: {
      recipients_per10k: { label: "Beneficiaries per 10,000 population", unit: "people" },
      recipients: { label: "Beneficiaries (monthly average)", unit: "people" },
      debtors_per100k: { label: "Debtors per 100,000 population", unit: "people" },
      debtors_evasion: { label: "Debtors under evasion proceedings", unit: "people" },
      recovered_share: { label: "% of funds recovered from debtors", unit: "%" },
      spent_total: { label: "Total spent from the fund that year", unit: "PLN" },
    },
  },
  dobowy_budzet_czasu: {
    label: "Daily time budget",
    unit: "min",
    agegroupLabel: "Activity",
    meaning:
      "Average time spent per day on each activity, by sex. Two measures: \"Duration of the " +
      "activity\" is an average over the WHOLE population (including people who didn't do that " +
      "activity at all that day) -- for level-1 categories these values add up to roughly 24 hours. " +
      "\"Participation time in the activity\" is an average ONLY among people who actually did that " +
      "activity that day -- these values do NOT add up to 24 hours.\n" +
      "\"Activity\" is a two-level list of categories -- e.g. \"Sleep\" is a sub-category of " +
      "\"Personal care\".\n" +
      "Values are given in minutes (GUS records time in \"H.MM\" notation).\n" +
      "Available at voivodeship level only (16 units) -- GUS additionally publishes a split into " +
      "\"region warszawski stołeczny\" and \"region mazowiecki\".",
    source: "Statistics Poland (GUS)",
    accessNote:
      "File \"Załącznik_Budżet Czasu Ludności 2023 wg województw i płci.xlsx\" (Table 9), a one-off " +
      "2023 time use survey, uploaded manually, not from an API -- " +
      "https://stat.gov.pl/obszary-tematyczne/warunki-zycia/dochody-wydatki-i-warunki-zycia-ludnosci/dobowy-budzet-czasu-ludnosci-w-2023r-,35,1.html. " +
      "Conversion: etl/convert_dobowy_budzet_czasu.py.",
    ageGroups: {
      potrzeby_fizjologiczne: "Personal care",
      potrzeby_fizjologiczne__sen: "-- Sleep",
      potrzeby_fizjologiczne__jedzenie_i_picie: "-- Eating and drinking",
      potrzeby_fizjologiczne__inne_potrzeby_osobiste: "-- Other personal care",
      praca_zawodowa_glowna_i_dodatkowa: "Employment (main and secondary job)",
      nauka: "Study",
      nauka__nauka_w_szkole_na_uczelni: "-- School or university study",
      nauka__samoksztalcenie_szkolenia_kursy_w_czasie: "-- Self-study, training and courses in free time",
      prace_domowe_i_opieka_nad_czlonkami_gosp: "Household and family care",
      prace_domowe_i_opieka_nad_czlonkami_gosp__obrobka_zywnosci: "-- Food management",
      prace_domowe_i_opieka_nad_czlonkami_gosp__utrzymanie_porzadku: "-- Household upkeep",
      prace_domowe_i_opieka_nad_czlonkami_gosp__przygotowanie_i_utrzymanie_odziezy: "-- Making and caring for textiles",
      prace_domowe_i_opieka_nad_czlonkami_gosp__ogrodnictwo_i_opieka_nad_zwierzetami_dom: "-- Gardening and pet care (not related to running a farm)",
      prace_domowe_i_opieka_nad_czlonkami_gosp__budowa_remonty_naprawy: "-- Construction and repairs",
      prace_domowe_i_opieka_nad_czlonkami_gosp__zakupy_i_korzystanie_z_uslug: "-- Shopping and services",
      prace_domowe_i_opieka_nad_czlonkami_gosp__zarzadzanie_gospodarstwem_domowym: "-- Household management",
      prace_domowe_i_opieka_nad_czlonkami_gosp__opieka_nad_dziecmi: "-- Childcare",
      prace_domowe_i_opieka_nad_czlonkami_gosp__opieka_nad_doroslymi_czlonkami_gospodars: "-- Care for adult household members",
      wolontariat_pomoc_innym_praktyki_religij: "Voluntary work, helping others, religious practices",
      wolontariat_pomoc_innym_praktyki_religij__wolontariat_praca_spoleczna_w_ramach_org: "-- Volunteering, community work (through an organisation or institution)",
      wolontariat_pomoc_innym_praktyki_religij__nieformalna_pomoc_dla_innych_gospodarstw: "-- Informal help to other households",
      wolontariat_pomoc_innym_praktyki_religij__zorganizowane_spotkania_praktyki_religij: "-- Organised gatherings, religious practices",
      zycie_towarzyskie_uczestnictwo_w_rozrywc: "Social life, entertainment and culture",
      zycie_towarzyskie_uczestnictwo_w_rozrywc__zycie_towarzyskie: "-- Social life",
      zycie_towarzyskie_uczestnictwo_w_rozrywc__uczestnictwo_w_rozrywce_i_kulturze_jako_: "-- Entertainment and culture (as spectator/listener)",
      zycie_towarzyskie_uczestnictwo_w_rozrywc__odpoczynek_bierny: "-- Passive rest",
      uczestnictwo_w_sporcie_i_rekreacji: "Sports and outdoor recreation",
      uczestnictwo_w_sporcie_i_rekreacji__cwiczenia_fizyczne: "-- Physical exercise",
      uczestnictwo_w_sporcie_i_rekreacji__zbieractwo_lowiectwo_wedkarstwo: "-- Foraging, hunting, fishing",
      zamilowania_osobiste_hobby_zainteresowan: "Personal interests -- hobbies and use of computer/internet",
      zamilowania_osobiste_hobby_zainteresowan__zamilowania_artystyczne_hobby: "-- Arts and hobbies",
      zamilowania_osobiste_hobby_zainteresowan__korzystanie_z_komputera_smartfona_intern: "-- Use of computer, smartphone, internet",
      zamilowania_osobiste_hobby_zainteresowan__gry_i_zabawy: "-- Games and play",
      korzystanie_ze_srodkow_masowego_przekazu: "Use of mass media",
      korzystanie_ze_srodkow_masowego_przekazu__czytanie: "-- Reading",
      korzystanie_ze_srodkow_masowego_przekazu__ogladanie_telewizji_i_filmow: "-- Watching TV and films",
      korzystanie_ze_srodkow_masowego_przekazu__sluchanie_muzyki_i_radia: "-- Listening to music and radio",
      dojazdy_i_dojscia_oraz_inne_niewymienion: "Travel and other unspecified activities",
      dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_do_z_pracy: "-- Travel to/from work",
      dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_do_ze_szkoly_lub_uczelni: "-- Travel to/from school or university, and free-time-study travel",
      dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_zwiazane_z_zakupami_i_us: "-- Travel related to shopping and services",
    },
    measures: {
      trwania: "Duration of the activity",
      wykonywania: "Participation time in the activity",
    },
  },
  mammografia: {
    label: "Screening coverage -- Mammography",
    unit: "%",
    meaning:
      "Share of women in the age range covered by the population breast-cancer screening programme " +
      "who were actually screened by mammography in a given year (\"Total women screened\" / " +
      "\"Annual population due for screening\"). Concerns women only -- only the Women view is " +
      "available.",
    source: "System and Implementation Analysis Database (BASiW), Ministry of Health",
    accessNote: "File data/Mammografia.xlsx, sheet \"Mammografia\" -- see etl/convert_basiw_screening.py.",
    ageGroups: { default: "Total" },
    measures: { default: "Share screened" },
  },
  cytologia: {
    label: "Screening coverage -- Cervical cytology",
    unit: "%",
    meaning:
      "Share of women in the age range covered by the population cervical-cancer screening " +
      "programme who actually had a cytology test in a given year (\"Total women screened\" / " +
      "\"Annual population due for screening\"). Concerns women only -- only the Women view is " +
      "available.",
    source: "System and Implementation Analysis Database (BASiW), Ministry of Health",
    accessNote: "File data/Cytologia.xlsx, sheet \"Cytologia\" -- see etl/convert_basiw_screening.py.",
    ageGroups: { default: "Total" },
    measures: { default: "Share screened" },
  },
  absencje: {
    label: "Sickness absence",
    unit: "days",
    agegroupLabel: "Diagnosis",
    meaning:
      "Number of sickness absence days and of medical certificates issued (ZLA), by sex and diagnosis. " +
      "Sickness absence means inability to work because of illness or the need to personally care for a " +
      "sick family member. Covers people insured with ZUS, the Social Insurance Institution.\n" +
      "\"Diagnosis\" is the 22 ICD-10 chapters (level 1) plus two totals: \"All causes\" and \"All causes " +
      "excluding pregnancy and childbirth\". The \"Pregnancy, childbirth and the puerperium\" chapter is " +
      "about a third of women's absence days and does not occur among men -- with it included women " +
      "record more absence days than men, without it fewer. The \"Codes for special purposes (COVID-19)\" " +
      "chapter only appears from 2020 on.\n" +
      "The \"Average length of one certificate\" measure is days divided by certificates. The \"per " +
      "employed person\" measures divide by the number of people employed in the county (December of that " +
      "year, separately for women and men) -- available from 2022 on, since earlier years have no " +
      "employment figures on this map.\n" +
      "Data broken down by finer categories and by individual ICD-10 codes (levels 2 and 3) is available " +
      "from the Ministry of Health on request.",
    source: "Ministry of Health (BASiW), ZUS data",
    accessNote:
      "Files supplied on request by the Department of Analyses and Strategy of the Ministry of " +
      "Health (letter AST.461.50.2026.BA of 20 Aug 2026), 8 files covering 2017-2024 -- " +
      "https://basiw.mz.gov.pl/mapy-informacje/mapa-2022-2026/analizy/absencje-chorobowe/. " +
      "Conversion: etl/convert_absencje.py.",
    ageGroups: {
      ogolem_bez_ciazy: "All causes excluding pregnancy and childbirth",
      ogolem: "All causes",
      zakazne: "Certain infectious and parasitic diseases",
      nowotwory: "Neoplasms",
      krwi: "Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism",
      wydzielania: "Endocrine, nutritional and metabolic diseases",
      psychiczne: "Mental and behavioural disorders",
      nerwowy: "Diseases of the nervous system",
      oko: "Diseases of the eye and adnexa",
      ucho: "Diseases of the ear and mastoid process",
      krazenie: "Diseases of the circulatory system",
      oddechowy: "Diseases of the respiratory system",
      pokarmowy: "Diseases of the digestive system",
      skora: "Diseases of the skin and subcutaneous tissue",
      miesniowo_szkieletowy: "Diseases of the musculoskeletal system and connective tissue",
      moczowo_plciowy: "Diseases of the genitourinary system",
      ciaza: "Pregnancy, childbirth and the puerperium",
      okoloporodowe: "Certain conditions originating in the perinatal period",
      wady_wrodzone: "Congenital malformations, deformations and chromosomal abnormalities",
      objawy: "Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified",
      urazy: "Injury, poisoning and certain other consequences of external causes",
      przyczyny_zewnetrzne: "External causes of morbidity and mortality",
      czynniki_zdrowotne: "Factors influencing health status and contact with health services",
      cele_specjalne: "Codes for special purposes (COVID-19)",
    },
    measures: {
      dni: { label: "Absence days", unit: "days" },
      zaswiadczenia: { label: "Certificates issued", unit: "certificates" },
      dlugosc_srednia: { label: "Average length of one certificate", unit: "days" },
      dni_na_pracujacego: { label: "Absence days per employed person", unit: "days" },
      zaswiadczenia_na_pracujacego: { label: "Certificates per employed person", unit: "certificates" },
    },
  },
};
