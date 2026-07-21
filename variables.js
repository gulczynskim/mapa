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
//   topic: one of the TOPICS keys below -- groups the variable under
//     "Temat" in both the map controls and the download panel.
const TOPICS = {
  rynek_pracy: "Rynek pracy",
  edukacja: "Edukacja",
  polityka: "Polityka",
  ludnosc: "Ludność",
  zdrowie: "Zdrowie",
};

const VARIABLE_META = {
  unemployment: {
    label: "Bezrobocie rejestrowane",
    unit: "%",
    topic: "rynek_pracy",
    file: "data/unemployment.json",
    meaning:
      "Stopa bezrobocia rejestrowanego -- odsetek osób bezrobotnych zarejestrowanych w " +
      "urzędach pracy wśród ludności aktywnej zawodowo w wieku produkcyjnym. Dane roczne, powiaty.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Kody zmiennych BDL: 79214 (ogółem), 79215 (mężczyźni), 79216 (kobiety) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
      "Współczynnik aktywności zawodowej -- odsetek osób aktywnych zawodowo (pracujących " +
      "lub aktywnie poszukujących pracy) w danej grupie wieku. Jednorazowy pomiar z " +
      "Narodowego Spisu Powszechnego 2021, nie dane roczne.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Kody zmiennych BDL: 1670866/73/80 (15+, ogółem/mężczyźni/kobiety), 1670867/74/81 (15-24) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "15plus", label: "15 lat i więcej" },
      { key: "15_24", label: "15-24 lata", hasTotal: false }, // no combined-group total computed for this slice
    ],
    measures: [{ key: "default", label: "Wartość" }],
  },
  e8_polski: {
    label: "Egzamin ósmoklasisty -- język polski",
    unit: "%",
    topic: "edukacja",
    file: "data/e8_polski.json",
    meaning:
      "Wynik procentowy z egzaminu ósmoklasisty z języka polskiego, wg powiatu zamieszkania " +
      "szkoły. \"Ogółem\" dla średniej to średnia ważona liczbą zdających kobiet i mężczyzn; " +
      "dla mediany brak wartości \"ogółem\" -- mediany dwóch grup nie da się poprawnie połączyć " +
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
    label: "Egzamin ósmoklasisty -- matematyka",
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
  radni_powiatu: {
    label: "Radni powiatu",
    unit: "osób",
    topic: "polityka",
    file: "data/radni_powiatu.json",
    meaning: "Liczba radnych w radach powiatów, wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Kody zmiennych BDL: 3094 (ogółem), 3095 (mężczyźni), 3096 (kobiety) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Wszyscy radni" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  radni_gminy: {
    label: "Radni gminy",
    unit: "osób",
    topic: "polityka",
    file: "data/radni_gminy.json",
    meaning: "Liczba radnych w radach gmin, wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Kody zmiennych BDL: 6 (ogółem), 7 (mężczyźni), 8 (kobiety) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "gmina", label: "Gmina" }],
    ageGroups: [{ key: "default", label: "Wszyscy radni" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  liceum: {
    label: "Uczniowie i absolwenci liceów",
    unit: "osób",
    topic: "edukacja",
    file: "data/liceum.json",
    meaning:
      "Liczba uczniów i absolwentów liceów ogólnokształcących dla młodzieży (bez szkół " +
      "specjalnych), wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Kody zmiennych BDL: uczniowie 270621 (mężczyźni) / 270655 (kobiety), absolwenci " +
      "270638 (mężczyźni) / 270602 (kobiety) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Młodzież licealna" }],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "absolwenci", label: "Absolwenci" },
    ],
    sharesMeaningful: true,
  },
  population_25_34: {
    label: "Ludność 25-34 lata (NSP)",
    unit: "osób",
    topic: "ludnosc",
    file: "data/population_25_34.json",
    meaning:
      "Liczba ludności w wieku 25-34 lata (suma grup 25-29 i 30-34), wg płci -- przybliżony " +
      "wskaźnik migracji selektywnych młodych dorosłych. Jednorazowy pomiar z NSP 2021, nie " +
      "dane roczne (BDL nie publikuje tej konkretnej grupy wieku w bieżącej, corocznej ewidencji " +
      "ludności -- tylko szersze kategorie wieku produkcyjnego/przedprodukcyjnego/poprodukcyjnego).",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Kody zmiennych BDL: 1644517/1644518 (mężczyźni 25-29/30-34), 1644537/1644538 " +
      "(kobiety 25-29/30-34), zsumowane -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
      "Nie z API BDL -- BDL nie udostępnia wynagrodzeń wg płci na poziomie powiatu. Dane z " +
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
    label: "Egzamin ósmoklasisty -- język angielski",
    unit: "%",
    topic: "edukacja",
    file: "data/e8_angielski.json",
    meaning:
      "Wynik procentowy z egzaminu ósmoklasisty z języka angielskiego, wg powiatu zamieszkania " +
      "szkoły. CKE publikuje też wyniki dla francuskiego/hiszpańskiego/niemieckiego/rosyjskiego/" +
      "włoskiego, pominięte na razie -- niewielka i nierówna liczba zdających w większości " +
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
      "Liczba pracujących wg sekcji PKD (Polska Klasyfikacja Działalności) i płci, stan na " +
      "styczeń. Surowe dane sekcja po sekcji -- bez wyliczonego wskaźnika segregacji zawodowej " +
      "(np. indeksu Duncana), którego formuła nie jest jeszcze ustalona.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P4283, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    measures: [{ key: "default", label: "Wartość" }],
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
      "podregionów -- BDL nie publikuje tego wskaźnika dla powiatów ani gmin. Brak wartości " +
      "\"ogółem\": BDL publikuje to wyłącznie osobno dla mężczyzn i kobiet, a uśrednienie dwóch " +
      "oczekiwanych długości życia bez ważenia liczebnością byłoby błędne tak samo, jak przy " +
      "medianie egzaminu ósmoklasisty.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Temat BDL P2730, poziom podregion -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
  },
};
