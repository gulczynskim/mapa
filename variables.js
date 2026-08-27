// Metadata registry for variables wired up in the frontend so far.
// Each entry: what it measures (meaning), where the raw numbers come from
// (source + accessNote, incl. BDL variable codes where applicable), and its
// available dimensions -- levels (aggregation), ageGroups, measures. Each
// dimension is a list of {key, label}; a single-entry list still renders a
// (disabled) selector showing that one value, so the UI shape stays
// consistent whether or not a variable actually offers a choice.
//
// Optional flags:
//   sharesMeaningful: true -- enables the "% kobiet" / "% mężczyzn" views,
//     which compute k/(k+m). Only set this on COUNT variables (pupils,
//     population, votes, elected officials), never on rates/scores, where
//     that arithmetic is meaningless. None of the current variables qualify;
//     future ones like liceum pupil counts or population 25-34 will.
//   hasTotal: false (on an ageGroup/measure option) -- marks slices whose
//     combined-sexes total can't be derived; disables "Ogółem" there.
//   sexScope: "women" -- for a variable that ONLY conceptually exists for
//     one sex (e.g. a screening program covering only women), not merely
//     one where the other sex's data happens to be missing. Forces every
//     view except Kobiety off (Ogółem, Mężczyźni, Różnica, Proporcje,
//     %kobiet/%mężczyzn), store the value under "k" (see mammografia/
//     cytologia below). Also valid on a single ageGroup option, for a
//     variable that is two-sex overall but has one one-sex slice --
//     absencje's "Ciąża, poród i okres połogu", where men have no rows in
//     that ICD chapter at all while the other 21 chapters compare normally.
//     Resolved by sexScopeFor() in app.js; a variable-level scope wins.
//   topic: one of the TOPICS keys below -- groups the variable under
//     "Temat" in both the map controls and the download panel.
const TOPICS = {
  rynek_pracy: "Rynek pracy",
  edukacja: "Edukacja",
  polityka: "Polityka",
  ludnosc: "Ludność",
  zdrowie: "Zdrowie",
  rolnictwo: "Rolnictwo",
  // Deliberate exception to the alphabetical Temat order everywhere else
  // (see topicsInUse in app.js) -- a catch-all for variables that don't
  // share a clean theme belongs at the end of the list, not wherever
  // "Inne" would alphabetically fall.
  inne: "Inne",
};

const VARIABLE_META = {
  unemployment: {
    label: "Bezrobocie rejestrowane",
    unit: "%",
    topic: "rynek_pracy",
    file: "data/unemployment.json",
    meaning:
      "Stopa bezrobocia rejestrowanego – odsetek osób bezrobotnych zarejestrowanych w " +
      "urzędach pracy wśród ludności aktywnej zawodowo w wieku produkcyjnym. Dane roczne, powiaty.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2670, poziom powiat. Kody zmiennych: 79214 (ogółem), 79215 (mężczyźni), " +
      "79216 (kobiety) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Wiek produkcyjny" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
  labor_force_activity: {
    label: "Aktywność zawodowa (NSP)",
    unit: "%",
    topic: "rynek_pracy",
    file: "data/labor_force_activity.json",
    meaning:
      "Współczynnik aktywności zawodowej – odsetek osób aktywnych zawodowo (pracujących " +
      "lub aktywnie poszukujących pracy) w danej grupie wieku. Jednorazowy pomiar z " +
      "Narodowego Spisu Powszechnego 2021, nie dane roczne. Wszystkie grupy wieku (15+ i sześć " +
      "przedziałów 10-letnich) mają wartość \"ogółem\" publikowaną wprost przez BDL.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Temat BDL P4309, poziom powiat. Kody zmiennych (ogółem/mężczyźni/kobiety): 1670866/73/80 " +
      "(15+), 1670867/74/81 (15-24), 1670868/75/82 (25-34), 1670869/76/83 (35-44), 1670870/77/84 " +
      "(45-54), 1670871/78/85 (55-64), 1670872/79/86 (65+) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "15plus", label: "15 lat i więcej" },
      { key: "15_24", label: "15-24 lata" },
      { key: "25_34", label: "25-34 lata" },
      { key: "35_44", label: "35-44 lata" },
      { key: "45_54", label: "45-54 lata" },
      { key: "55_64", label: "55-64 lata" },
      { key: "65plus", label: "65 lat i więcej" },
    ],
    measures: [{ key: "default", label: "Wartość" }],
  },
  e8_polski: {
    label: "Egzamin ósmoklasisty – język polski",
    unit: "%",
    topic: "edukacja",
    file: "data/e8_polski.json",
    meaning:
      "Wynik procentowy z egzaminu ósmoklasisty z języka polskiego, wg powiatu zamieszkania " +
      "szkoły. \"Ogółem\" dla średniej to średnia ważona liczbą zdających kobiet i mężczyzn; " +
      "dla mediany brak wartości \"ogółem\" – mediany dwóch grup nie da się poprawnie połączyć " +
      "w medianę całości.",
    source: "Centralna Komisja Egzaminacyjna (CKE)",
    accessNote:
      "Dane pozyskane w ramach dostępu do informacji publicznej (nie są publicznie dostępne " +
      "przez API). Pliki źródłowe: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", lata 2022-2025.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ósmoklasiści" }],
    measures: [
      { key: "mean", label: "Średnia" },
      { key: "median", label: "Mediana", hasTotal: false }, // sub-group medians can't be correctly combined
    ],
  },
  e8_matematyka: {
    label: "Egzamin ósmoklasisty – matematyka",
    unit: "%",
    topic: "edukacja",
    file: "data/e8_matematyka.json",
    meaning:
      "Wynik procentowy z egzaminu ósmoklasisty z matematyki, wg powiatu zamieszkania szkoły. " +
      "\"Ogółem\" dla średniej to średnia ważona liczbą zdających kobiet i mężczyzn; dla mediany " +
      "brak wartości \"ogółem\".",
    source: "Centralna Komisja Egzaminacyjna (CKE)",
    accessNote:
      "Dane pozyskane w ramach dostępu do informacji publicznej (nie są publicznie dostępne " +
      "przez API). Pliki źródłowe: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", lata 2022-2025.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ósmoklasiści" }],
    measures: [
      { key: "mean", label: "Średnia" },
      { key: "median", label: "Mediana", hasTotal: false }, // sub-group medians can't be correctly combined
    ],
  },
  wybory_rady_gmin: {
    label: "Wybory do rady gminy",
    unit: "osób",
    topic: "polityka",
    file: "data/wybory_rady_gmin.json",
    meaning:
      "Kandydaci, wybrani radni i oddane głosy w wyborach do rad gmin, wg płci. Dane tylko z lat " +
      "wyborczych 1998-2024 (nieciągłe, w przeciwieństwie do \"Radni gminy\" z BDL). Warszawa liczona " +
      "jako jedna rada miasta – rady dzielnic m.st. Warszawy są celowo pominięte. 52 gminy z lat " +
      "1998-2014 (głównie dawne odrębne gminy Warszawy sprzed unifikacji w 2002 r.) nie mają dzisiejszego " +
      "odpowiednika administracyjnego i figurują pod swoim historycznym 6-cyfrowym TERYT-em – nie pojawią " +
      "się na mapie.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika (\"Bitwa o wozy i Parytety w Polsce\") " +
      "– zob. etl/pkw_councils.py i etl/pkw_prepare_merge.py.",
    levels: [{ key: "gmina", label: "Gmina" }],
    ageGroups: [{ key: "default", label: "Wszyscy kandydaci/radni" }],
    measures: [
      { key: "candidates", label: "Kandydaci", unit: "osób" },
      { key: "elected", label: "Wybrani radni", unit: "osób" },
      { key: "votes", label: "Zdobyte głosy", unit: "głosów" },
    ],
    sharesMeaningful: true,
  },
  wybory_rady_powiatow: {
    label: "Wybory do rady powiatu",
    unit: "osób",
    topic: "polityka",
    file: "data/wybory_rady_powiatow.json",
    meaning:
      "Kandydaci, wybrani radni i oddane głosy w wyborach do rad powiatów, wg płci. Dane z lat " +
      "wyborczych 1998-2024 (nieciągłe, tak jak \"Wybory do rady gminy\"). Miasta na prawach powiatu " +
      "(Kraków, Warszawa itd.) nie mają osobnej rady powiatu, więc nie występują w tym zbiorze – " +
      "ich radni są liczeni wyłącznie pod \"Wybory do rady gminy\".",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika. Dane za 2024 pochodzą z innego " +
      "folderu źródłowego niż pozostałe lata (Regional/2024/, nie Councils/ – PKW zmieniło strukturę " +
      "publikacji tego rocznika) – zob. etl/pkw_councils.py.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Wszyscy kandydaci/radni" }],
    measures: [
      { key: "candidates", label: "Kandydaci", unit: "osób" },
      { key: "elected", label: "Wybrani radni", unit: "osób" },
      { key: "votes", label: "Zdobyte głosy", unit: "głosów" },
    ],
    sharesMeaningful: true,
  },
  wybory_sejmiku: {
    label: "Wybory do sejmiku województwa",
    unit: "osób",
    topic: "polityka",
    file: "data/wybory_sejmiku.json",
    meaning:
      "Kandydaci, wybrani radni sejmiku i oddane głosy w wyborach do sejmików województw, wg płci. Dane " +
      "tylko z lat wyborczych 1998-2024. Granice województw na tej mapie są dociągnięte przez połączenie " +
      "powiatów – nie pochodzą z osobnego źródła granic.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika; dane 2024 z Regional/2024/ – zob. " +
      "etl/pkw_councils.py i etl/build_wojewodztwa.py.",
    levels: [{ key: "wojewodztwo", label: "Województwo" }],
    ageGroups: [{ key: "default", label: "Wszyscy kandydaci/radni" }],
    measures: [
      { key: "candidates", label: "Kandydaci", unit: "osób" },
      { key: "elected", label: "Wybrani radni", unit: "osób" },
      { key: "votes", label: "Zdobyte głosy", unit: "głosów" },
    ],
    sharesMeaningful: true,
  },
  wybory_wojtowie: {
    label: "Wybory wójtów/burmistrzów/prezydentów miast",
    unit: "osób",
    topic: "polityka",
    file: "data/wybory_wojtowie.json",
    meaning:
      "Kandydaci, wybrany kandydat i oddane głosy w wyborach na wójta/burmistrza/prezydenta miasta, " +
      "wg płci. \"Kandydaci\" to pole I tury (wszyscy zarejestrowani); \"Zdobyte głosy I tura\"/" +
      "\"Zdobyte głosy II tura\" liczone osobno – kandydaci, którzy nie weszli do II tury, mają tam 0. \"Wybrani\" " +
      "obejmuje zwycięzcę niezależnie od tego, w której turze rozstrzygnęły się wybory.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika – zob. etl/pkw_mayors.py i " +
      "etl/pkw_prepare_merge.py.",
    levels: [{ key: "gmina", label: "Gmina" }],
    ageGroups: [{ key: "default", label: "Wszyscy kandydaci" }],
    measures: [
      { key: "candidates", label: "Kandydaci", unit: "osób" },
      // binary: true -- exactly one winner per gmina/year, so k or m is 0 in
      // the overwhelming majority of rows (that's the normal outcome, not a
      // gap). Proporcja (K/M)/(M/K) divide straight through zero there --
      // see isBinaryMeasure()/applicableViewKeys() in app.js.
      { key: "elected", label: "Wybrani", unit: "osób", binary: true },
      { key: "votes_r1", label: "Zdobyte głosy I tura", unit: "głosów" },
      { key: "votes_r2", label: "Zdobyte głosy II tura", unit: "głosów" },
    ],
    sharesMeaningful: true,
  },
  population_25_34: {
    label: "Ludność 25-34 lata (NSP)",
    unit: "osób",
    topic: "ludnosc",
    file: "data/population_25_34.json",
    meaning:
      "Liczba ludności rezydującej w wieku 25-34 lata (suma grup 25-29 i 30-34), wg płci – przybliżony " +
      "wskaźnik migracji selektywnych młodych dorosłych. \"Ludność rezydująca\" to koncepcja BDL oparta o " +
      "faktyczne miejsce zamieszkania w dniu spisu, nie o zameldowanie – różni się od bieżącej, corocznej " +
      "ewidencji ludności użytej w innych zmiennych tej mapy. Jednorazowy pomiar z NSP 2021 (stan na 31 " +
      "marca 2021), nie dane roczne.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Temat BDL P4253 (\"Ludność rezydująca wg grup wieku i płci\"), poziom powiat. Kody zmiennych: " +
      "1644517/1644518 (ogółem 25-29/30-34), 1644537/1644538 (mężczyźni 25-29/30-34), 1644557/1644558 " +
      "(kobiety 25-29/30-34) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "25-34 lata" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  wages: {
    label: "Wynagrodzenia",
    unit: "zł",
    topic: "rynek_pracy",
    file: "data/wages.json",
    meaning:
      "Przeciętne miesięczne wynagrodzenie brutto wg płci i miejsca zamieszkania (nie miejsca " +
      "pracy).",
    source: "GUS, \"Rozkład wynagrodzeń w gospodarce narodowej\" (publikacja roczna)",
    accessNote:
      "Nie z API BDL – BDL nie udostępnia wynagrodzeń wg płci na poziomie powiatu. Dane z " +
      "publikacji GUS (plik Excel, tablica \"Miary wynagrodzeń według miejsca zamieszkania i płci\"), " +
      "wgrywane ręcznie co roku.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Pracujący ogółem" }],
    measures: [
      { key: "mean", label: "Średnia" },
      { key: "median", label: "Mediana" },
    ],
    sharesMeaningful: false,
  },
  e8_angielski: {
    label: "Egzamin ósmoklasisty – język angielski",
    unit: "%",
    topic: "edukacja",
    file: "data/e8_angielski.json",
    meaning:
      "Wynik procentowy z egzaminu ósmoklasisty z języka angielskiego, wg powiatu zamieszkania " +
      "szkoły. CKE publikuje też wyniki dla francuskiego/hiszpańskiego/niemieckiego/rosyjskiego/" +
      "włoskiego, pominięte na razie – niewielka i nierówna liczba zdających w większości " +
      "powiatów (przedmiot elekcyjny, zależny od oferty szkoły).",
    source: "Centralna Komisja Egzaminacyjna (CKE)",
    accessNote:
      "Dane pozyskane w ramach dostępu do informacji publicznej (nie są publicznie dostępne " +
      "przez API). Pliki źródłowe: \"Wyniki E8 - powiaty_{K,M}_{rok}.xlsx\", lata 2022-2025.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ósmoklasiści" }],
    measures: [
      { key: "mean", label: "Średnia" },
      { key: "median", label: "Mediana", hasTotal: false }, // sub-group medians can't be correctly combined
    ],
  },
  pkd_zatrudnienie: {
    label: "Pracujący wg sekcji PKD",
    unit: "osób",
    topic: "rynek_pracy",
    file: "data/pkd_zatrudnienie.json",
    agegroupLabel: "Sekcja PKD",
    meaning:
      "Liczba pracujących wg sekcji PKD (Polska Klasyfikacja Działalności) i płci, stan na wybrany " +
      "miesiąc (BDL publikuje ten temat jako 12 niezależnych migawek miesięcznych, nie jedną roczną). " +
      "Miara \"% pracujących\" (dla danego miesiąca): liczba pracujących w danej sekcji podzielona przez " +
      "\"Wszystkie sekcje\" tego samego miesiąca (dla tej samej płci) i pomnożona przez 100.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P4283, poziom powiat – 12 zestawów zmiennych (po jednym na miesiąc), kody odkrywane " +
      "na żywo wg n1/n2/n3, zob. etl/fetch_pkd.py – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem", label: "Wszystkie sekcje" },
      { key: "A", label: "A - Rolnictwo, leśnictwo, łowiectwo i rybactwo" },
      { key: "B", label: "B - Górnictwo i wydobywanie" },
      { key: "C", label: "C - Przetwórstwo przemysłowe" },
      { key: "D", label: "D - Wytwarzanie i zaopatrywanie w energię elektryczną, gaz, wodę" },
      { key: "E", label: "E - Dostawa wody; gospodarowanie ściekami i odpadami" },
      { key: "F", label: "F - Budownictwo" },
      { key: "G", label: "G - Handel hurtowy i detaliczny; naprawa pojazdów" },
      { key: "H", label: "H - Transport i gospodarka magazynowa" },
      { key: "I", label: "I - Zakwaterowanie i gastronomia" },
      { key: "J", label: "J - Informacja i komunikacja" },
      { key: "K", label: "K - Działalność finansowa i ubezpieczeniowa" },
      { key: "L", label: "L - Obsługa rynku nieruchomości" },
      { key: "M", label: "M - Działalność profesjonalna, naukowa i techniczna" },
      { key: "N", label: "N - Usługi administrowania i działalność wspierająca" },
      { key: "O", label: "O - Administracja publiczna i obrona narodowa" },
      { key: "P", label: "P - Edukacja" },
      { key: "Q", label: "Q - Opieka zdrowotna i pomoc społeczna" },
      { key: "R", label: "R - Kultura, rozrywka i rekreacja" },
      { key: "S", label: "S - Pozostała działalność usługowa" },
    ],
    // Month folded into the measure key ("01".."12") instead of a whole new
    // dimension alongside ageGroup/measure -- see fetch_pkd.py. Ordered
    // chronologically so Styczeń (the site's original single-month
    // default, before this went monthly) stays the default selection.
    measures: [
      { key: "01_default", label: "Styczeń – Liczba" },
      { key: "01_odsetek", label: "Styczeń – % pracujących", unit: "%" },
      { key: "02_default", label: "Luty – Liczba" },
      { key: "02_odsetek", label: "Luty – % pracujących", unit: "%" },
      { key: "03_default", label: "Marzec – Liczba" },
      { key: "03_odsetek", label: "Marzec – % pracujących", unit: "%" },
      { key: "04_default", label: "Kwiecień – Liczba" },
      { key: "04_odsetek", label: "Kwiecień – % pracujących", unit: "%" },
      { key: "05_default", label: "Maj – Liczba" },
      { key: "05_odsetek", label: "Maj – % pracujących", unit: "%" },
      { key: "06_default", label: "Czerwiec – Liczba" },
      { key: "06_odsetek", label: "Czerwiec – % pracujących", unit: "%" },
      { key: "07_default", label: "Lipiec – Liczba" },
      { key: "07_odsetek", label: "Lipiec – % pracujących", unit: "%" },
      { key: "08_default", label: "Sierpień – Liczba" },
      { key: "08_odsetek", label: "Sierpień – % pracujących", unit: "%" },
      { key: "09_default", label: "Wrzesień – Liczba" },
      { key: "09_odsetek", label: "Wrzesień – % pracujących", unit: "%" },
      { key: "10_default", label: "Październik – Liczba" },
      { key: "10_odsetek", label: "Październik – % pracujących", unit: "%" },
      { key: "11_default", label: "Listopad – Liczba" },
      { key: "11_odsetek", label: "Listopad – % pracujących", unit: "%" },
      { key: "12_default", label: "Grudzień – Liczba" },
      { key: "12_odsetek", label: "Grudzień – % pracujących", unit: "%" },
    ],
    sharesMeaningful: true,
  },
  life_expectancy: {
    label: "Przeciętne dalsze trwanie życia",
    unit: "lat",
    topic: "zdrowie",
    file: "data/life_expectancy.json",
    agegroupLabel: "Wiek",
    meaning:
      "Oczekiwana liczba lat dalszego życia od danego wieku, wg płci. Dostępne tylko dla " +
      "podregionów – BDL nie publikuje tego wskaźnika dla powiatów ani gmin. Brak wartości " +
      "\"ogółem\": BDL publikuje to wyłącznie osobno dla mężczyzn i kobiet, a uśrednienie dwóch " +
      "oczekiwanych długości życia bez ważenia liczebnością byłoby błędne tak samo, jak przy " +
      "medianie egzaminu ósmoklasisty.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2730, poziom podregion. Kody zmiennych (mężczyźni/kobiety): 101554/101555 (od " +
      "urodzenia), 105836/105837 (od 15 lat), 105845/105846 (od 30 lat), 105854/105855 (od 45 lat), " +
      "105863/105864 (od 60 lat), 101563/101564 (od 65 lat) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "podregion", label: "Podregion" }],
    ageGroups: [
      { key: "0", label: "Od urodzenia", hasTotal: false },
      { key: "15", label: "Od 15 lat", hasTotal: false },
      { key: "30", label: "Od 30 lat", hasTotal: false },
      { key: "45", label: "Od 45 lat", hasTotal: false },
      { key: "60", label: "Od 60 lat", hasTotal: false },
      { key: "65", label: "Od 65 lat", hasTotal: false },
    ],
    measures: [{ key: "default", label: "Wartość" }],
    // Barely changes year to year -- see currentDomain()'s comment in
    // app.js. Pools all years into one color scale per sex/age instead of
    // rescaling to each year's narrow spread.
    fixedScaleAcrossYears: true,
  },
  population_by_age: {
    label: "Ludność wg grup wieku",
    unit: "osób",
    topic: "ludnosc",
    file: "data/population_by_age.json",
    agegroupLabel: "Grupa wieku",
    meaning:
      "Liczba ludności (miasto i wieś łącznie) wg grup wieku i płci. Dwa nakładające się zestawy " +
      "kategorii współistnieją w tych danych: starszy, drobniejszy podział (0-2, 3-6, 7-12, 13-15, " +
      "16-19, 20-24, 25-34, 35-44, 45-54, 55-64, 65 i więcej) i nowszy, szerszy (0-14, 15-64, 16-19, " +
      "19-24) wprowadzony od 2010 – nie sumują się do jednej spójnej piramidy wieku, traktuj je jako " +
      "niezależne kategorie.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P3447, poziom powiat. 15 grup wieku x 2 płcie = 30 kodów zmiennych, zbyt liczne, by " +
      "wypisać tu wszystkie – pełna lista w etl/bdl_variables.py (klucz \"population_by_age\") – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem", label: "Wszystkie grupy wieku" },
      { key: "0-2", label: "0-2 lata" },
      { key: "0-14", label: "0-14 lat" },
      { key: "3-6", label: "3-6 lat" },
      { key: "7-12", label: "7-12 lat" },
      { key: "13-15", label: "13-15 lat" },
      { key: "15-64", label: "15-64 lata" },
      { key: "16-19", label: "16-19 lat" },
      { key: "19-24", label: "19-24 lata" },
      { key: "20-24", label: "20-24 lata" },
      { key: "25-34", label: "25-34 lata" },
      { key: "35-44", label: "35-44 lata" },
      { key: "45-54", label: "45-54 lata" },
      { key: "55-64", label: "55-64 lata" },
      { key: "65plus", label: "65 lat i więcej" },
    ],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  median_age: {
    label: "Mediana wieku ludności",
    unit: "lat",
    topic: "ludnosc",
    file: "data/median_age.json",
    meaning: "Wiek, poniżej i powyżej którego znajduje się połowa populacji (mediana), wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P3814, poziom powiat. Kody zmiennych: 746289 (ogółem), 746290 (mężczyźni), 746291 " +
      "(kobiety) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
  rolnictwo_pracujacy: {
    label: "Pracujący w gospodarstwach rolnych",
    unit: "osób",
    topic: "rolnictwo",
    file: "data/rolnictwo_pracujacy.json",
    agegroupLabel: "Typ gospodarstwa",
    meaning:
      "Członkowie rodziny i pracujący najemni stali w gospodarstwach rolnych, wg płci. \"Gospodarstwa " +
      "rolne ogółem\" obejmuje też gospodarstwa państwowe/spółdzielcze/spółek, \"gospodarstwa " +
      "indywidualne\" to podzbiór – tylko gospodarstwa prywatne. Jednorazowy Powszechny Spis Rolny " +
      "2020, nie dane roczne.",
    source: "Bank Danych Lokalnych GUS (Powszechny Spis Rolny 2020)",
    accessNote:
      "Temat BDL P4081, poziom powiat. Kody zmiennych: 1623387 (kobiety, gospodarstwa rolne ogółem), " +
      "1623386 (mężczyźni, gospodarstwa rolne ogółem), 1623390 (kobiety, gospodarstwa indywidualne), " +
      "1623389 (mężczyźni, gospodarstwa indywidualne) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "gospodarstwa_rolne", label: "Gospodarstwa rolne ogółem" },
      { key: "gospodarstwa_indywidualne", label: "Gospodarstwa indywidualne" },
    ],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  rolnictwo_kierujacy: {
    label: "Kierujący gospodarstwami rolnymi",
    unit: "osób",
    topic: "rolnictwo",
    file: "data/rolnictwo_kierujacy.json",
    agegroupLabel: "Rola",
    meaning:
      "Osoby związane z gospodarstwem indywidualnym, wg płci – \"Kierujący produkcją\" faktycznie " +
      "prowadzi gospodarstwo dzień po dniu, \"Użytkownik\" to formalny posiadacz/właściciel (bywa inną " +
      "osobą niż kierujący). Jednorazowy Powszechny Spis Rolny 2020.",
    source: "Bank Danych Lokalnych GUS (Powszechny Spis Rolny 2020)",
    accessNote:
      "Temat BDL P4077, poziom powiat. Kody zmiennych: 1623159 (kobiety, kierujący produkcją), " +
      "1623152 (mężczyźni, kierujący produkcją), 1623180 (kobiety, użytkownik), 1623173 (mężczyźni, " +
      "użytkownik) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "gospodarstwo", label: "Kierujący produkcją" },
      { key: "uzytkownik", label: "Użytkownik (właściciel)" },
    ],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  rolnictwo_uzytkownicy: {
    label: "Użytkownicy gospodarstw indywidualnych",
    unit: "osób",
    topic: "rolnictwo",
    file: "data/rolnictwo_uzytkownicy.json",
    meaning:
      "Użytkownicy oraz członkowie ich rodzin pracujący w gospodarstwach indywidualnych, wg płci. " +
      "Jednorazowy Powszechny Spis Rolny 2020.",
    source: "Bank Danych Lokalnych GUS (Powszechny Spis Rolny 2020)",
    accessNote:
      "Temat BDL P4272, poziom powiat. Kody zmiennych: 1647648 (kobiety), 1647647 (mężczyźni) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  szkoly_policealne: {
    label: "Uczniowie i absolwenci szkół policealnych",
    unit: "osób",
    topic: "edukacja",
    file: "data/szkoly_policealne.json",
    agegroupLabel: "Typ szkoły",
    meaning:
      "Uczniowie (ogółem i w 1 klasie) oraz absolwenci szkół policealnych, wg typu szkoły i płci. Nie " +
      "każdy typ szkoły ma dane dla wszystkich trzech miar – brakujące kombinacje pokazują brak danych. " +
      "Ogranicza się do dwóch typów: \"Ogółem (bez specjalnych)\" i \"Specjalne\". Rok 2004 pominięty – " +
      "jedyny rok bez podziału na płeć, dane zaczynają się realnie od 2005.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2178, poziom powiat. 2 typy szkół x do 3 miar x 2 płcie = ~12 kodów zmiennych – pełna " +
      "lista w etl/bdl_variables.py (klucz \"szkoly_policealne\") – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "kolegium_bez_specjalnych", label: "Ogółem (bez specjalnych)" },
      { key: "specjalne", label: "Specjalne" },
    ],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "uczniowie_1_klasa", label: "Uczniowie w 1 klasie" },
      { key: "absolwenci", label: "Absolwenci" },
    ],
    sharesMeaningful: true,
  },
  zasadnicze_zawodowe: {
    label: "Zasadnicze szkoły zawodowe",
    unit: "osób",
    topic: "edukacja",
    file: "data/zasadnicze_zawodowe.json",
    agegroupLabel: "Typ szkoły",
    meaning:
      "Uczniowie (ogółem i w 1 klasie) oraz absolwenci zasadniczych szkół zawodowych i pokrewnych, wg " +
      "typu szkoły i płci. Nie każdy typ szkoły ma dane dla wszystkich trzech miar – brakujące " +
      "kombinacje pokazują brak danych.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2143, poziom powiat. 6 typów szkół x do 3 miar x 2 płcie = ~36 kodów zmiennych, zbyt " +
      "liczne, by wypisać tu wszystkie – pełna lista w etl/bdl_variables.py (klucz " +
      "\"zasadnicze_zawodowe\") – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ponadpodstawowe_przysposabiajace", label: "Ponadpodstawowe przysposabiające do pracy (specjalne)" },
      { key: "ponadpodstawowe_zasadnicze_doroslych", label: "Ponadpodstawowe zasadnicze dla dorosłych" },
      { key: "specjalne_przysposabiajace", label: "Szkoły specjalne przysposabiające do pracy" },
      { key: "zawodowe_doroslych", label: "Zawodowe dla dorosłych" },
      { key: "zawodowe_mlodziezy_bez_specjalnych", label: "Zawodowe dla młodzieży (bez specjalnych)" },
      { key: "zawodowe_mlodziezy_specjalne", label: "Zawodowe dla młodzieży (specjalne)" },
    ],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "uczniowie_1_klasa", label: "Uczniowie w 1 klasie" },
      { key: "absolwenci", label: "Absolwenci" },
    ],
    sharesMeaningful: true,
  },
  szkolnictwo_ponadpodstawowe: {
    label: "Uczniowie i absolwenci szkół ponadpodstawowych (wg typu szkoły)",
    unit: "osób",
    topic: "edukacja",
    file: "data/szkolnictwo_ponadpodstawowe.json",
    agegroupLabel: "Typ szkoły",
    meaning:
      "Uczniowie (ogółem i w 1 klasie) oraz absolwenci ponadpodstawowych szkół dziennych dla młodzieży " +
      "(bez szkół specjalnych), wg typu szkoły i płci. Nie każdy typ ma dane dla wszystkich trzech miar " +
      "ani wszystkich lat – licea profilowane tylko 2004-2014 (wygaszone), zasadnicze szkoły zawodowe " +
      "tylko do ok. 2019, szkoły branżowe I stopnia dopiero od 2017 (reforma zastąpiła zasadnicze " +
      "zawodowe branżowymi) – brakujące kombinacje pokazują brak danych. \"Technika\" to samodzielny typ " +
      "(bez ogólnokształcących szkół artystycznych) – te liczone są osobno jako własny typ " +
      "(\"Ogólnokształcące szkoły artystyczne dające uprawnienia zawodowe\").\n" +
      "\"Razem\": suma liceów ogólnokształcących, techników, ogólnokształcących szkół artystycznych " +
      "dających uprawnienia zawodowe, szkół branżowych I stopnia, liceów profilowanych i zasadniczych " +
      "szkół zawodowych (każda płeć liczona osobno) – NIE obejmuje szkół artystycznych niedających " +
      "uprawnień zawodowych ani szkół policealnych (to inny etap kształcenia, osobna zmienna na tej " +
      "mapie). Brakujący typ w danym roku/powiecie liczony jest jako 0 przy sumowaniu (osobno dla kobiet " +
      "i mężczyzn), chyba że WSZYSTKIE typy brakują naraz – wtedy suma również jest brakiem danych.\n" +
      "Miara \"Udział\" (dostępna tylko dla Techników, Liceów ogólnokształcących i Szkół branżowych I " +
      "stopnia): jaki odsetek łącznej liczby uczniów/uczniów w 1 klasie/absolwentów tych TRZECH typów " +
      "przypada na dany typ, liczony osobno dla każdej płci. Przy tym wyliczeniu \"Technika\" obejmuje " +
      "też ogólnokształcące szkoły artystyczne dające uprawnienia zawodowe. \"% kobiet\"/\"% mężczyzn\" " +
      "są wyłączone dla miary \"Udział\".",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Poziom powiat. Licea ogólnokształcące: temat P2035 (te same kody co zmienna \"Uczniowie i " +
      "absolwenci liceów\"). Zasadnicze szkoły zawodowe: temat P2143, typ \"zawodowe dla młodzieży " +
      "(bez specjalnych)\" (te same kody co zmienna \"Zasadnicze szkoły zawodowe\"). Technika i licea " +
      "profilowane: temat P2144. Szkoły artystyczne (oba typy): temat P2179. Szkoły branżowe I " +
      "stopnia: uczniowie/absolwenci temat P3762, uczniowie w 1 klasie temat P3764. Pełna lista " +
      "kodów w etl/bdl_variables.py (klucz \"szkolnictwo_ponadpodstawowe\") oraz etl/build_" +
      "szkolnictwo_ponadpodstawowe.py (scalanie liceum/zasadniczych zawodowych, suma \"Razem\", " +
      "miara \"Udział\") – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "licea_ogolnoksztalcace", label: "Licea ogólnokształcące" },
      { key: "licea_profilowane", label: "Licea profilowane" },
      { key: "artystyczne_dajace_uprawnienia", label: "Ogólnokształcące szkoły artystyczne dające uprawnienia zawodowe" },
      { key: "razem", label: "Razem (licea ogólnokształcące, technika, branżowe I st., licea profilowane, zasadnicze zawodowe)" },
      { key: "artystyczne_niedajace_uprawnien", label: "Szkoły artystyczne niedające uprawnień zawodowych" },
      { key: "branzowe_I_st", label: "Szkoły branżowe I stopnia" },
      { key: "technika", label: "Technika" },
      { key: "zasadnicze_zawodowe", label: "Zasadnicze szkoły zawodowe" },
    ],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "uczniowie_udzial", label: "Uczniowie – udział (technika/licea ogólnokształcące/branżowe I st.)", unit: "%" },
      { key: "uczniowie_1_klasa", label: "Uczniowie w 1 klasie" },
      { key: "uczniowie_1_klasa_udzial", label: "Uczniowie w 1 klasie – udział (technika/licea ogólnokształcące/branżowe I st.)", unit: "%" },
      { key: "absolwenci", label: "Absolwenci" },
      { key: "absolwenci_udzial", label: "Absolwenci – udział (technika/licea ogólnokształcące/branżowe I st.)", unit: "%" },
    ],
    sharesMeaningful: true,
  },
  uczelnie: {
    label: "Studenci i absolwenci uczelni",
    unit: "osób",
    topic: "edukacja",
    file: "data/uczelnie.json",
    meaning: "Liczba studentów i absolwentów szkół wyższych, wg płci i powiatu siedziby uczelni.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P3226, poziom powiat. Kody zmiennych: 377825 (studenci, kobiety), 377823 (studenci, " +
      "mężczyźni), 377820 (absolwenci, kobiety), 377824 (absolwenci, mężczyźni) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "studenci", label: "Studenci" },
      { key: "absolwenci", label: "Absolwenci" },
    ],
    sharesMeaningful: true,
  },
  wypadki_przy_pracy: {
    label: "Wypadki przy pracy",
    unit: "osób",
    topic: "rynek_pracy",
    file: "data/wypadki_przy_pracy.json",
    meaning:
      "Liczba osób poszkodowanych w wypadkach przy pracy (ogółem), wg płci. Miara \"Na 100 000 " +
      "pracujących\": liczba poszkodowanych podzielona przez liczbę pracujących ogółem w CZERWCU danego " +
      "roku (zmienna \"Pracujący wg sekcji PKD\", \"Wszystkie sekcje\", miesiąc czerwiec) i pomnożona " +
      "przez 100 000. \"Pracujący wg sekcji PKD\" ma dane dopiero od 2024 r., więc ta miara pokaże brak " +
      "danych dla wcześniejszych lat.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2276, poziom powiat. Kody zmiennych: 58357 (kobiety), 58355 (mężczyźni) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "default_per100k", label: "Na 100 000 pracujących", unit: "na 100 tys." },
    ],
    sharesMeaningful: true,
  },
  jednorazowe_odszkodowania: {
    label: "Jednorazowe odszkodowania powypadkowe",
    unit: "osób",
    topic: "rynek_pracy",
    file: "data/jednorazowe_odszkodowania.json",
    meaning:
      "Liczba jednorazowych odszkodowań z tytułu wypadku przy pracy lub choroby zawodowej " +
      "wypłaconych przez ZUS w danym roku oraz przeciętna wysokość tych wypłat, wg płci. " +
      "Odszkodowanie przysługuje ubezpieczonemu, który wskutek wypadku przy pracy lub choroby " +
      "zawodowej doznał stałego lub długotrwałego uszczerbku na zdrowiu, a także uprawnionym " +
      "członkom rodziny osoby zmarłej wskutek takiego wypadku lub choroby – wypłacane wyłącznie na " +
      "wniosek, nie automatycznie. Wysokość zależy od procentu uszczerbku na zdrowiu: ZUS wypłaca " +
      "ustaloną kwotę za każdy procent stałego lub długotrwałego uszczerbku (od kwietnia 2025 do " +
      "końca marca 2026 r.: 1636 zł za 1%), stawka aktualizowana raz w roku (od 1 kwietnia). Powiat " +
      "przypisany na podstawie adresu siedziby płatnika składek, NIE miejsca zamieszkania " +
      "poszkodowanego. Nie obejmuje świadczeń realizowanych na mocy umów międzynarodowych. W 6 " +
      "powiatach liczba kobiet była w źródle zamaskowana jako 0 z powodu tajemnicy statystycznej " +
      "(próg <3 osób) – tutaj odtworzona jako ogółem minus mężczyźni.",
    source: "Zakład Ubezpieczeń Społecznych (ZUS)",
    accessNote:
      "Publikacja ZUS \"Jednorazowe odszkodowania z tytułu wypadku przy pracy lub choroby zawodowej " +
      "wypłacone przez ZUS w 2025 r. oraz przeciętna wysokość wypłat według płci i powiatu\" (plik " +
      "Excel, arkusz \"JO 2025\"), wgrywana ręcznie, nie z API – " +
      "https://www.zus.pl/jednorazowe-odszkodowanie-z-tytulu-wypadku-przy-pracy-lub-choroby-zawodowej. " +
      "Konwersja: etl/convert_zus_odszkodowania.py.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "liczba", label: "Liczba osób" },
      { key: "wysokosc_srednia", label: "Przeciętna wysokość", unit: "zł" },
    ],
    sharesMeaningful: true,
  },
  kluby_sportowe: {
    label: "Ćwiczący w klubach sportowych",
    unit: "osób",
    topic: "zdrowie",
    file: "data/kluby_sportowe.json",
    meaning:
      "Liczba ćwiczących w klubach sportowych (łącznie z klubami wyznaniowymi i UKS), wg płci. Miara " +
      "\"Na 100 000 mieszkańców\": liczba ćwiczących podzielona przez ludność ogółem powiatu (zmienna " +
      "\"Ludność wg grup wieku\", grupa \"Wszystkie grupy wieku\", ta sama płeć) i pomnożona przez 100 000.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2155, poziom powiat. Kody zmiennych: 59629 (kobiety), 60313 (mężczyźni) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "default_per100k", label: "Na 100 000 mieszkańców", unit: "na 100 tys." },
    ],
    sharesMeaningful: true,
  },
  zamachy_samobojcze: {
    label: "Zamachy samobójcze",
    unit: "osób",
    topic: "zdrowie",
    file: "data/zamachy_samobojcze.json",
    meaning:
      "Liczba osób w zamachach samobójczych, wg płci – ogółem oraz zakończone zgonem. Miary \"Na " +
      "100 000 mieszkańców\": liczba w danej kategorii podzielona przez ludność ogółem powiatu (zmienna " +
      "\"Ludność wg grup wieku\", grupa \"Wszystkie grupy wieku\", ta sama płeć) i pomnożona przez 100 000.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P3833, poziom powiat. Kody zmiennych: 1365336 (kobiety, wszystkie), 1365335 " +
      "(mężczyźni, wszystkie), 1365341 (kobiety, zakończone zgonem), 1365340 (mężczyźni, zakończone " +
      "zgonem) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "ogolem", label: "Wszystkie – liczba" },
      { key: "ogolem_per100k", label: "Wszystkie – na 100 000 mieszkańców", unit: "na 100 tys." },
      { key: "zakonczone_zgonem", label: "Zakończone zgonem – liczba" },
      { key: "zakonczone_zgonem_per100k", label: "Zakończone zgonem – na 100 000 mieszkańców", unit: "na 100 tys." },
    ],
    sharesMeaningful: true,
  },
  wyksztalcenie_nsp: {
    label: "Wykształcenie ludności 13+ (NSP)",
    unit: "osób",
    topic: "edukacja",
    file: "data/wyksztalcenie_nsp.json",
    agegroupLabel: "Poziom wykształcenia",
    meaning:
      "Ludność rezydująca w wieku 13 lat i więcej wg poziomu wykształcenia i płci. Jednorazowy " +
      "Narodowy Spis Powszechny 2021, nie dane roczne. Miara \"Odsetek\": liczba osób z danym poziomem " +
      "wykształcenia podzielona przez \"Wszystkie poziomy\" (dla tej samej płci) i pomnożona przez 100.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Temat BDL P4318, poziom powiat. 10 poziomów wykształcenia x 2 płcie = 20 kodów zmiennych, zbyt " +
      "liczne, by wypisać tu wszystkie – pełna lista w etl/bdl_variables.py (klucz " +
      "\"wyksztalcenie_nsp\") – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem", label: "Wszystkie poziomy" },
      { key: "wyzsze", label: "Wyższe" },
      { key: "sr_i_pol_ogolem", label: "Średnie i policealne (ogółem)" },
      { key: "sr_ogolnoksztalcace", label: "Średnie ogólnokształcące" },
      { key: "sr_zawodowe", label: "Średnie zawodowe" },
      { key: "zasadnicze_branzowe", label: "Zasadnicze zawodowe/branżowe" },
      { key: "gimnazjalne", label: "Gimnazjalne" },
      { key: "podstawowe_ukonczone", label: "Podstawowe ukończone" },
      { key: "podstawowe_niekonczone", label: "Podstawowe nieukończone / brak wykształcenia" },
      { key: "nieustalony", label: "Nieustalony" },
    ],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "odsetek", label: "Odsetek", unit: "%" },
    ],
    sharesMeaningful: true,
  },
  stan_cywilny_nsp: {
    label: "Stan cywilny ludności 15+ (NSP)",
    unit: "osób",
    topic: "ludnosc",
    file: "data/stan_cywilny_nsp.json",
    agegroupLabel: "Stan cywilny",
    meaning:
      "Ludność rezydująca w wieku 15 lat i więcej wg stanu cywilnego i płci. Jednorazowy Narodowy Spis " +
      "Powszechny 2021, nie dane roczne. Miara \"Odsetek\": liczba osób w danym stanie cywilnym " +
      "podzielona przez \"Wszystkie\" (dla tej samej płci) i pomnożona przez 100.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Temat BDL P4288, poziom powiat. Kody zmiennych (kobiety/mężczyźni): 1652569/1652563 " +
      "(wszystkie), 1652570/1652564 (kawalerowie/panny), 1652571/1652565 (żonaci/zamężne), " +
      "1652572/1652566 (wdowcy/wdowy), 1652573/1652567 (rozwiedzeni), 1652574/1652568 (nieustalony) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem", label: "Wszystkie" },
      { key: "kawalerowie_panny", label: "Kawalerowie / panny" },
      { key: "zonaci_zamezne", label: "Żonaci / zamężne" },
      { key: "wdowcy_wdowy", label: "Wdowcy / wdowy" },
      { key: "rozwiedzeni", label: "Rozwiedzeni" },
      { key: "nieustalony", label: "Nieustalony" },
    ],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "odsetek", label: "Odsetek", unit: "%" },
    ],
    sharesMeaningful: true,
  },
  ludnosc_roczniki_nsp: {
    label: "Ludność ogółem (NSP)",
    unit: "osób",
    topic: "ludnosc",
    file: "data/ludnosc_roczniki_nsp.json",
    meaning:
      "Ludność rezydująca ogółem, wg płci, z tematu BDL który udostępnia też podział na pojedyncze " +
      "roczniki wieku (0,1,2...) – tu wgrany wyłącznie wariant \"ogółem\" (poza podziałem na roczniki).",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Temat BDL P4254, poziom powiat. Kody zmiennych: 1644755 (kobiety), 1644663 (mężczyźni) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  gestosc_zaludnienia: {
    label: "Gęstość zaludnienia",
    unit: "osób/km²",
    topic: "ludnosc",
    file: "data/gestosc_zaludnienia.json",
    meaning: "Liczba ludności na 1 km² powierzchni. BDL nie publikuje tego wskaźnika w podziale na płeć.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Kod zmiennej BDL: 60559 (temat P2425) – https://bdl.stat.gov.pl/api/v1/data/by-variable/60559",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
  wynagrodzenia: {
    label: "Wynagrodzenia ogółem",
    unit: "zł",
    topic: "rynek_pracy",
    file: "data/wynagrodzenia.json",
    meaning:
      "Przeciętne miesięczne wynagrodzenie brutto w powiecie. Miara \"Wzgl. średniej krajowej\" to osobna " +
      "zmienna publikowana wprost przez BDL: przeciętne wynagrodzenie powiatu jako odsetek średniej " +
      "krajowej (Polska = 100). BDL nie publikuje tego wskaźnika w podziale na płeć (dla wynagrodzeń wg " +
      "płci zob. zmienną \"Wynagrodzenia\" opartą o publikację GUS, dostępną wg płci i miejsca " +
      "zamieszkania, albo nowszą \"Mediana wynagrodzeń miesięcznych\" publikowaną wprost przez BDL, wg " +
      "płci i miesiąca).",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2497, poziom powiat. Kody zmiennych: 64428 (przeciętne wynagrodzenie), 64429 " +
      "(wzgl. średniej krajowej) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "default", label: "Przeciętne wynagrodzenie", unit: "zł" },
      { key: "relative", label: "Wzgl. średniej krajowej (Polska=100)", unit: "%" },
    ],
  },
  mediana_wynagrodzen: {
    label: "Mediana wynagrodzeń miesięcznych",
    unit: "zł",
    topic: "rynek_pracy",
    file: "data/mediana_wynagrodzen.json",
    agegroupLabel: "Podstawa",
    meaning:
      "Mediana miesięcznego wynagrodzenia brutto, wg płci i miesiąca (Miara – wszystkie 12 miesięcy, tak " +
      "jak w zmiennej \"Pracujący wg sekcji PKD\"). Dostępne w dwóch równoległych klasyfikacjach " +
      "(Podstawa): \"Wg miejsca zamieszkania\" (miejsce zamieszkania pracownika) oraz \"Wg siedziby " +
      "podmiotu\" (siedziba pracodawcy) – BDL publikuje obie wprost jako osobne zmienne. \"Ogółem\" to " +
      "również osobna zmienna publikowana wprost przez BDL (mediana policzona przez GUS z surowych danych " +
      "jednostkowych).",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P4610, poziom powiat. 12 miesięcy × 2 klasyfikacje × 3 płcie = 72 kody zmiennych, " +
      "za dużo, żeby wypisać tutaj – pełna lista w etl/fetch_mediana_wynagrodzen.py (kody odkrywane " +
      "na żywo przez n1/n2/n3, nie hardkodowane) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "zamieszkania", label: "Wg miejsca zamieszkania" },
      { key: "siedziby", label: "Wg siedziby podmiotu" },
    ],
    measures: [
      { key: "01", label: "Styczeń" },
      { key: "02", label: "Luty" },
      { key: "03", label: "Marzec" },
      { key: "04", label: "Kwiecień" },
      { key: "05", label: "Maj" },
      { key: "06", label: "Czerwiec" },
      { key: "07", label: "Lipiec" },
      { key: "08", label: "Sierpień" },
      { key: "09", label: "Wrzesień" },
      { key: "10", label: "Październik" },
      { key: "11", label: "Listopad" },
      { key: "12", label: "Grudzień" },
    ],
  },
  bezdomnosc_mieszkancy: {
    label: "Mieszkańcy placówek opieki stacjonarnej",
    unit: "osób",
    topic: "inne",
    file: "data/bezdomnosc_mieszkancy.json",
    meaning:
      "Liczba mieszkańców placówek stacjonarnej pomocy społecznej (domy pomocy społecznej, schroniska, " +
      "noclegownie i inne), wg płci – łącznie ze wszystkimi kategoriami mieszkańców, nie tylko osobami " +
      "bezdomnymi (zob. osobna zmienna \"Bezdomni w placówkach opieki\" dla tej węższej kategorii). " +
      "Miara \"Na 100 000 mieszkańców\": liczba mieszkańców placówek podzielona przez ludność ogółem " +
      "powiatu (zmienna \"Ludność wg grup wieku\", grupa \"Wszystkie grupy wieku\", ta sama płeć) i " +
      "pomnożona przez 100 000.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P1799 (pod G267): 1609986 (kobiety), 1609987 (mężczyźni), 72323 (ogółem) – " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Wszyscy mieszkańcy" }],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "default_per100k", label: "Na 100 000 mieszkańców", unit: "na 100 tys." },
    ],
    sharesMeaningful: true,
  },
  bezdomnosc_bezdomni: {
    label: "Bezdomni w placówkach opieki",
    unit: "osób",
    topic: "inne",
    file: "data/bezdomnosc_bezdomni.json",
    meaning:
      "Liczba osób bezdomnych przebywających w noclegowniach, domach i schroniskach dla bezdomnych. " +
      "BDL nie publikuje tego wskaźnika w podziale na płeć. Miara \"Na 100 000 mieszkańców\": liczba " +
      "bezdomnych podzielona przez ludność ogółem powiatu (zmienna \"Ludność wg grup wieku\", grupa " +
      "\"Wszystkie grupy wieku\") i pomnożona przez 100 000.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P1799 (pod G267), zmienna 195855, poziom powiat – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "default_per100k", label: "Na 100 000 mieszkańców", unit: "na 100 tys." },
    ],
  },
  zgwalcenia: {
    label: "Zgwałcenia – przestępstwa stwierdzone",
    unit: "przestępstw",
    topic: "inne",
    file: "data/zgwalcenia.json",
    meaning:
      "Liczba przestępstw zgwałcenia stwierdzonych przez policję. BDL publikuje ten wskaźnik na poziomie " +
      "powiatu dopiero od 2025 r. (jednorazowy punkt danych, nie szereg czasowy) i nie w podziale na " +
      "płeć. Miara \"Na 100 000 mieszkańców\": liczba zgwałceń podzielona przez ludność ogółem powiatu " +
      "(zmienna \"Ludność wg grup wieku\", grupa \"Wszystkie grupy wieku\") i pomnożona przez 100 000.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P4601, zmienna 1749162, poziom powiat – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "default", label: "Liczba" },
      { key: "default_per100k", label: "Na 100 000 mieszkańców", unit: "na 100 tys." },
    ],
  },
  fundusz_alimentacyjny: {
    label: "Fundusz alimentacyjny",
    unit: "osób",
    topic: "inne",
    file: "data/fundusz_alimentacyjny.json",
    meaning:
      "Świadczeniobiorcy i dłużnicy funduszu alimentacyjnego. BDL nie publikuje tego wskaźnika w podziale " +
      "na płeć. Dane dostępne tylko od 2022 r. Sześć miar to sześć osobnych zmiennych publikowanych " +
      "wprost przez BDL, w tym oba wskaźniki \"na 10 tys.\"/\"na 100 tys. ludności\": \"Świadczeniobiorcy " +
      "na 10 tys. ludności\" i \"Świadczeniobiorcy (śr. miesięczna)\" to liczba osób pobierających " +
      "świadczenia z funduszu; \"Dłużnicy na 100 tys. ludności\" to ogólna liczba dłużników " +
      "alimentacyjnych; \"Dłużnicy z postępowaniem ws. uchylania się\" to węższy podzbiór – dłużnicy, " +
      "wobec których toczy się postępowanie o uznanie za uchylającego się od zobowiązań alimentacyjnych; " +
      "\"% środków zwróconych przez dłużników\" to odsetek wypłaconych świadczeń odzyskanych od dłużników " +
      "w drodze egzekucji; \"Suma wydatkowana z funduszu w roku\" to łączna kwota świadczeń wypłaconych w " +
      "danym roku.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P4451, poziom powiat – kody zmiennych: 1728280 (świadczeniobiorcy na 10 tys. ludności), " +
      "1728281 (świadczeniobiorcy, śr. miesięczna), 1728282 (dłużnicy na 100 tys. ludności), 1728293 " +
      "(dłużnicy z postępowaniem ws. uchylania się), 1728294 (% środków zwróconych), 1728296 (suma " +
      "wydatkowana w roku) – https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "recipients_per10k", label: "Świadczeniobiorcy na 10 tys. ludności", unit: "osób" },
      { key: "recipients", label: "Świadczeniobiorcy (śr. miesięczna)", unit: "osób" },
      { key: "debtors_per100k", label: "Dłużnicy na 100 tys. ludności", unit: "osób" },
      { key: "debtors_evasion", label: "Dłużnicy z postępowaniem ws. uchylania się", unit: "osób" },
      { key: "recovered_share", label: "% środków zwróconych przez dłużników", unit: "%" },
      { key: "spent_total", label: "Suma wydatkowana z funduszu w roku", unit: "zł" },
    ],
  },
  dobowy_budzet_czasu: {
    label: "Dobowy budżet czasu",
    unit: "min",
    topic: "inne",
    file: "data/dobowy_budzet_czasu.json",
    agegroupLabel: "Czynność",
    meaning:
      "Przeciętny czas przeznaczany w ciągu doby na poszczególne czynności, wg płci. Dwie miary: " +
      "\"Czas trwania czynności\" to średnia liczona dla CAŁEJ populacji (łącznie z osobami, które " +
      "danej czynności wcale nie wykonały tego dnia) – wartości tej miary dla kategorii poziomu 1 " +
      "sumują się w przybliżeniu do 24 godzin. \"Czas wykonywania czynności\" to średnia liczona " +
      "TYLKO wśród osób, które danego dnia faktycznie wykonały daną czynność – te wartości NIE " +
      "sumują się do 24 godzin.\n" +
      "\"Czynność\" to lista kategorii dwóch poziomów – np. \"Sen\" to podkategoria \"Potrzeb " +
      "fizjologicznych\".\n" +
      "Wartości podane w minutach (GUS zapisuje czas w notacji „H.MM\").\n" +
      "Dostępne tylko na poziomie województwa (16 jednostek) – dane GUS publikuje dodatkowo podział " +
      "na \"region warszawski stołeczny\" i \"region mazowiecki\".",
    source: "Główny Urząd Statystyczny (GUS)",
    accessNote:
      "Plik \"Załącznik_Budżet Czasu Ludności 2023 wg województw i płci.xlsx\" (Tablica 9), " +
      "jednorazowe badanie budżetu czasu za 2023 r., wgrywany ręcznie, nie z API – " +
      "https://stat.gov.pl/obszary-tematyczne/warunki-zycia/dochody-wydatki-i-warunki-zycia-ludnosci/dobowy-budzet-czasu-ludnosci-w-2023r-,35,1.html. " +
      "Konwersja: etl/convert_dobowy_budzet_czasu.py.",
    levels: [{ key: "wojewodztwo", label: "Województwo" }],
    ageGroups: [
      { key: "potrzeby_fizjologiczne", label: "Potrzeby fizjologiczne" },
      { key: "potrzeby_fizjologiczne__sen", label: "— Sen" },
      { key: "potrzeby_fizjologiczne__jedzenie_i_picie", label: "— Jedzenie i picie" },
      { key: "potrzeby_fizjologiczne__inne_potrzeby_osobiste", label: "— Inne potrzeby osobiste" },
      { key: "praca_zawodowa_glowna_i_dodatkowa", label: "Praca zawodowa (główna i dodatkowa)" },
      { key: "nauka", label: "Nauka" },
      { key: "nauka__nauka_w_szkole_na_uczelni", label: "— Nauka w szkole/na uczelni" },
      { key: "nauka__samoksztalcenie_szkolenia_kursy_w_czasie", label: "— Samokształcenie, szkolenia, kursy w czasie wolnym" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp", label: "Prace domowe i opieka nad członkami gospodarstwa domowego" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__obrobka_zywnosci", label: "— Obróbka żywności" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__utrzymanie_porzadku", label: "— Utrzymanie porządku" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__przygotowanie_i_utrzymanie_odziezy", label: "— Przygotowanie i utrzymanie odzieży" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__ogrodnictwo_i_opieka_nad_zwierzetami_dom", label: "— Ogrodnictwo i opieka nad zwierzętami domowymi (nie związane z prowadzeniem gospodarstwa rolnego)" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__budowa_remonty_naprawy", label: "— Budowa, remonty, naprawy" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__zakupy_i_korzystanie_z_uslug", label: "— Zakupy i korzystanie z usług" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__zarzadzanie_gospodarstwem_domowym", label: "— Zarządzanie gospodarstwem domowym" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__opieka_nad_dziecmi", label: "— Opieka nad dziećmi" },
      { key: "prace_domowe_i_opieka_nad_czlonkami_gosp__opieka_nad_doroslymi_czlonkami_gospodars", label: "— Opieka nad dorosłymi członkami gospodarstwa domowego" },
      { key: "wolontariat_pomoc_innym_praktyki_religij", label: "Wolontariat, pomoc innym, praktyki religijne" },
      { key: "wolontariat_pomoc_innym_praktyki_religij__wolontariat_praca_spoleczna_w_ramach_org", label: "— Wolontariat, praca społeczna (w ramach organizacji lub instytucji)" },
      { key: "wolontariat_pomoc_innym_praktyki_religij__nieformalna_pomoc_dla_innych_gospodarstw", label: "— Nieformalna pomoc dla innych gospodarstw domowych" },
      { key: "wolontariat_pomoc_innym_praktyki_religij__zorganizowane_spotkania_praktyki_religij", label: "— Zorganizowane spotkania, praktyki religijne" },
      { key: "zycie_towarzyskie_uczestnictwo_w_rozrywc", label: "Życie towarzyskie, uczestnictwo w rozrywce i kulturze" },
      { key: "zycie_towarzyskie_uczestnictwo_w_rozrywc__zycie_towarzyskie", label: "— Życie towarzyskie" },
      { key: "zycie_towarzyskie_uczestnictwo_w_rozrywc__uczestnictwo_w_rozrywce_i_kulturze_jako_", label: "— Uczestnictwo w rozrywce i kulturze (jako widz/słuchacz)" },
      { key: "zycie_towarzyskie_uczestnictwo_w_rozrywc__odpoczynek_bierny", label: "— Odpoczynek bierny" },
      { key: "uczestnictwo_w_sporcie_i_rekreacji", label: "Uczestnictwo w sporcie i rekreacji" },
      { key: "uczestnictwo_w_sporcie_i_rekreacji__cwiczenia_fizyczne", label: "— Ćwiczenia fizyczne" },
      { key: "uczestnictwo_w_sporcie_i_rekreacji__zbieractwo_lowiectwo_wedkarstwo", label: "— Zbieractwo, łowiectwo, wędkarstwo" },
      { key: "zamilowania_osobiste_hobby_zainteresowan", label: "Zamiłowania osobiste – hobby/zainteresowania i korzystanie z komputera/internetu" },
      { key: "zamilowania_osobiste_hobby_zainteresowan__zamilowania_artystyczne_hobby", label: "— Zamiłowania artystyczne, hobby" },
      { key: "zamilowania_osobiste_hobby_zainteresowan__korzystanie_z_komputera_smartfona_intern", label: "— Korzystanie z komputera, smartfona, Internetu" },
      { key: "zamilowania_osobiste_hobby_zainteresowan__gry_i_zabawy", label: "— Gry i zabawy" },
      { key: "korzystanie_ze_srodkow_masowego_przekazu", label: "Korzystanie ze środków masowego przekazu" },
      { key: "korzystanie_ze_srodkow_masowego_przekazu__czytanie", label: "— Czytanie" },
      { key: "korzystanie_ze_srodkow_masowego_przekazu__ogladanie_telewizji_i_filmow", label: "— Oglądanie telewizji i filmów" },
      { key: "korzystanie_ze_srodkow_masowego_przekazu__sluchanie_muzyki_i_radia", label: "— Słuchanie muzyki i radia" },
      { key: "dojazdy_i_dojscia_oraz_inne_niewymienion", label: "Dojazdy i dojścia oraz inne niewymienione czynności" },
      { key: "dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_do_z_pracy", label: "— Dojazdy (dojścia) do/z pracy" },
      { key: "dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_do_ze_szkoly_lub_uczelni", label: "— Dojazdy (dojścia) do/ze szkoły lub uczelni oraz związane z nauką w czasie wolnym" },
      { key: "dojazdy_i_dojscia_oraz_inne_niewymienion__dojazdy_dojscia_zwiazane_z_zakupami_i_us", label: "— Dojazdy (dojścia) związane z zakupami i usługami" },
    ],
    measures: [
      { key: "trwania", label: "Czas trwania czynności" },
      { key: "wykonywania", label: "Czas wykonywania czynności" },
    ],
  },
  mammografia: {
    label: "Pokrycie badaniami przesiewowymi – Mammografia",
    unit: "%",
    topic: "zdrowie",
    file: "data/mammografia.json",
    meaning:
      "Odsetek kobiet w wieku objętym populacyjnym programem profilaktyki raka piersi, które faktycznie " +
      "przebadano mammografią w danym roku (\"Liczba przebadanych kobiet ogółem\" / \"Roczna populacja do " +
      "przebadania\"). Dotyczy wyłącznie kobiet – dostępny jest tylko widok Kobiety.",
    source: "Baza Analiz Systemowych i Wdrożeniowych (BASiW), Ministerstwo Zdrowia",
    accessNote: "Plik data/Mammografia.xlsx, arkusz \"Mammografia\" – zob. etl/convert_basiw_screening.py.",
    levels: [{ key: "wojewodztwo", label: "Województwo" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Odsetek przebadanych" }],
    sexScope: "women",
  },
  cytologia: {
    label: "Pokrycie badaniami przesiewowymi – Cytologia",
    unit: "%",
    topic: "zdrowie",
    file: "data/cytologia.json",
    meaning:
      "Odsetek kobiet w wieku objętym populacyjnym programem profilaktyki raka szyjki macicy, które " +
      "faktycznie przebadano cytologią w danym roku (\"Liczba przebadanych kobiet ogółem\" / \"Roczna " +
      "populacja do przebadania\"). Dotyczy wyłącznie kobiet – dostępny jest tylko widok Kobiety.",
    source: "Baza Analiz Systemowych i Wdrożeniowych (BASiW), Ministerstwo Zdrowia",
    accessNote: "Plik data/Cytologia.xlsx, arkusz \"Cytologia\" – zob. etl/convert_basiw_screening.py.",
    levels: [{ key: "wojewodztwo", label: "Województwo" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Odsetek przebadanych" }],
    sexScope: "women",
  },
  absencje: {
    label: "Absencje chorobowe",
    unit: "dni",
    topic: "zdrowie",
    file: "data/absencje.json",
    agegroupLabel: "Rozpoznanie",
    meaning:
      "Liczba dni absencji chorobowej i liczba wystawionych zaświadczeń lekarskich (ZLA), wg płci i " +
      "rozpoznania. Absencja chorobowa to niezdolność do pracy z powodu choroby albo konieczności " +
      "osobistego sprawowania opieki nad chorym członkiem rodziny. Dane obejmują osoby ubezpieczone w " +
      "ZUS.\n" +
      "\"Rozpoznanie\" to 22 rozdziały klasyfikacji ICD-10 (poziom 1) oraz dwie sumy: \"Ogółem\" i " +
      "\"Ogółem bez ciąży i porodu\". Rozdział \"Ciąża, poród i okres połogu\" to około jedna trzecia dni " +
      "absencji kobiet i nie występuje u mężczyzn – łącznie z nim kobiety mają więcej dni absencji niż " +
      "mężczyźni, bez niego mniej. Rozdział \"Kody do celów specjalnych (COVID-19)\" występuje dopiero od " +
      "2020 r.\n" +
      "Miara \"Przeciętna długość zwolnienia\" to liczba dni podzielona przez liczbę zaświadczeń. Miary " +
      "\"na 1 pracującego\" dzielą wartość przez liczbę pracujących w powiecie (grudzień danego roku, " +
      "osobno dla kobiet i mężczyzn) – dostępne od 2022 r., bo wcześniejsze lata nie mają na tej mapie " +
      "danych o liczbie pracujących.\n" +
      "Dane w podziale na bardziej szczegółowe kategorie i pojedyncze kody ICD-10 (poziom 2 i 3) " +
      "Ministerstwo Zdrowia udostępnia na wniosek.",
    source: "Ministerstwo Zdrowia (BASiW), dane ZUS",
    accessNote:
      "Pliki przekazane na wniosek przez Departament Analiz i Strategii Ministerstwa Zdrowia " +
      "(pismo AST.461.50.2026.BA z 20.08.2026 r.), 8 plików za lata 2017-2024 – " +
      "https://basiw.mz.gov.pl/mapy-informacje/mapa-2022-2026/analizy/absencje-chorobowe/. " +
      "Konwersja: etl/convert_absencje.py.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem_bez_ciazy", label: "Ogółem bez ciąży i porodu" },
      { key: "ogolem", label: "Ogółem" },
      { key: "zakazne", label: "Wybrane choroby zakaźne i pasożytnicze" },
      { key: "nowotwory", label: "Nowotwory" },
      { key: "krwi", label: "Choroby krwi i narządów krwiotwórczych oraz wybrane choroby przebiegające z udziałem mechanizmów immunologicznych" },
      { key: "wydzielania", label: "Zaburzenia wydzielania wewnętrznego, stanu odżywienia i przemian metabolicznych" },
      { key: "psychiczne", label: "Zaburzenia psychiczne i zaburzenia zachowania" },
      { key: "nerwowy", label: "Choroby układu nerwowego" },
      { key: "oko", label: "Choroby oka i przydatków oka" },
      { key: "ucho", label: "Choroby ucha i wyrostka sutkowatego" },
      { key: "krazenie", label: "Choroby układu krążenia" },
      { key: "oddechowy", label: "Choroby układu oddechowego" },
      { key: "pokarmowy", label: "Choroby układu pokarmowego" },
      { key: "skora", label: "Choroby skóry i tkanki podskórnej" },
      { key: "miesniowo_szkieletowy", label: "Choroby układu mięśniowo-szkieletowego i tkanki łącznej" },
      { key: "moczowo_plciowy", label: "Choroby układu moczowo-płciowego" },
      { key: "ciaza", label: "Ciąża, poród i okres połogu", sexScope: "women" },
      { key: "okoloporodowe", label: "Wybrane stany rozpoczynające się w okresie okołoporodowym" },
      { key: "wady_wrodzone", label: "Wady rozwojowe wrodzone, zniekształcenia i aberracje chromosomowe" },
      { key: "objawy", label: "Objawy, cechy chorobowe oraz nieprawidłowe wyniki badań klinicznych i laboratoryjnych niesklasyfikowane gdzie indziej" },
      { key: "urazy", label: "Urazy, zatrucia i inne określone skutki działania czynników zewnętrznych" },
      { key: "przyczyny_zewnetrzne", label: "Zewnętrzne przyczyny zachorowania i zgonu" },
      { key: "czynniki_zdrowotne", label: "Czynniki wpływające na stan zdrowia i kontakt ze służbą zdrowia" },
      { key: "cele_specjalne", label: "Kody do celów specjalnych (COVID-19)" },
    ],
    measures: [
      { key: "dni", label: "Liczba dni absencji", unit: "dni" },
      { key: "zaswiadczenia", label: "Liczba zaświadczeń", unit: "zaświadczeń" },
      { key: "dlugosc_srednia", label: "Przeciętna długość zwolnienia", unit: "dni" },
      { key: "dni_na_pracujacego", label: "Dni absencji na 1 pracującego", unit: "dni" },
      { key: "zaswiadczenia_na_pracujacego", label: "Zaświadczenia na 1 pracującego", unit: "zaświadczeń" },
    ],
    sharesMeaningful: true,
  },
};
