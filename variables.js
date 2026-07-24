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
  rolnictwo: "Rolnictwo",
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
    label: "Radni powiatu (BDL GUS)",
    unit: "osób",
    topic: "polityka",
    file: "data/radni_powiatu.json",
    meaning:
      "Liczba radnych w radach powiatów, wg płci. Dla miast na prawach powiatu (Kraków, Warszawa " +
      "itd.) BDL sam w sobie raportuje 0 -- te miasta nie mają osobnej rady powiatu, ich rada " +
      "miasta pełni obie funkcje naraz, ale jest liczona wyłącznie pod radami gmin. Podstawiono tu " +
      "wartość z \"Radni gminy\" dla tych 66 miast zamiast mylącego zera.",
    source: "Bank Danych Lokalnych GUS",
    accessNote:
      "Kody zmiennych BDL: 3094 (ogółem), 3095 (mężczyźni), 3096 (kobiety) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}. Miasta na prawach powiatu podstawione " +
      "z tematu P1312 (radni gminy) -- zob. etl/patch_city_powiats.py.",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Wszyscy radni" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  radni_gminy: {
    label: "Radni gminy (BDL GUS)",
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
  wybory_rady_gmin: {
    label: "Wybory do rady gminy",
    unit: "osób",
    topic: "polityka",
    file: "data/wybory_rady_gmin.json",
    meaning:
      "Kandydaci, wybrani radni i oddane głosy w wyborach do rad gmin, wg płci. Dane tylko z lat " +
      "wyborczych 1998-2024 (nieciągłe, w przeciwieństwie do \"Radni gminy\" z BDL). Warszawa liczona " +
      "jako jedna rada miasta -- rady dzielnic m.st. Warszawy są celowo pominięte, żeby liczby były " +
      "porównywalne z resztą gmin. 52 gminy z lat 1998-2014 (głównie dawne odrębne gminy Warszawy " +
      "sprzed unifikacji w 2002 r.) nie mają dzisiejszego odpowiednika administracyjnego i figurują " +
      "pod swoim historycznym 6-cyfrowym TERYT-em -- nie pojawią się na mapie, dopóki nie powstanie " +
      "dla nich osobna warstwa granic.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika (\"Bitwa o wozy i Parytety w Polsce\") " +
      "-- zob. etl/pkw_councils.py i etl/pkw_prepare_merge.py.",
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
      "Kandydaci, wybrani radni i oddane głosy w wyborach do rad powiatów, wg płci. Dane tylko z lat " +
      "wyborczych 1998-2018 (2024 nie jest dostępny -- zob. accessNote). Miasta na prawach powiatu " +
      "(Kraków, Warszawa itd.) nie mają osobnej rady powiatu, więc nie występują w tym zbiorze -- " +
      "ich radni są liczeni wyłącznie pod \"Wybory do rady gminy\".",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika. Dla 2024 plik z kandydatami do rad " +
      "powiatów nie był dostępny w folderze Councils/, tylko w Regional/2024/ -- zob. " +
      "etl/pkw_councils.py.",
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
      "Kandydaci, wybrani radni sejmiku i oddane głosy w wyborach do sejmików województw, wg płci. " +
      "Dane tylko z lat wyborczych 1998-2024. Granice województw na tej mapie są dociągnięte przez " +
      "połączenie powiatów (etl/build_wojewodztwa.py) -- nie pochodzą z osobnego źródła granic.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika; dane 2024 z Regional/2024/ -- zob. " +
      "etl/pkw_councils.py.",
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
      "\"Zdobyte głosy II tura\" liczone osobno -- kandydaci, którzy nie weszli do II tury, mają tam 0. \"Wybrani\" " +
      "obejmuje zwycięzcę niezależnie od tego, w której turze rozstrzygnęły się wybory.",
    source: "Państwowa Komisja Wyborcza (PKW)",
    accessNote:
      "Zbiory kandydatów PKW z projektu badawczego użytkownika -- zob. etl/pkw_mayors.py i " +
      "etl/pkw_prepare_merge.py.",
    levels: [{ key: "gmina", label: "Gmina" }],
    ageGroups: [{ key: "default", label: "Wszyscy kandydaci" }],
    measures: [
      { key: "candidates", label: "Kandydaci", unit: "osób" },
      { key: "elected", label: "Wybrani", unit: "osób" },
      { key: "votes_r1", label: "Zdobyte głosy I tura", unit: "głosów" },
      { key: "votes_r2", label: "Zdobyte głosy II tura", unit: "głosów" },
    ],
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
      "270638 (mężczyźni) / 270602 (kobiety), uczniowie w 1 klasie 378692 (mężczyźni) / " +
      "378694 (kobiety) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Młodzież licealna" }],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "uczniowie_1_klasa", label: "Uczniowie w 1 klasie" },
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
      "Liczba ludności rezydującej w wieku 25-34 lata (suma grup 25-29 i 30-34), wg płci -- " +
      "przybliżony wskaźnik migracji selektywnych młodych dorosłych. \"Ludność rezydująca\" to " +
      "koncepcja BDL (subjekt P4253, \"Ludność rezydująca wg grup wieku i płci\") oparta o " +
      "faktyczne miejsce zamieszkania w dniu spisu, nie o zameldowanie -- różni się od bieżącej, " +
      "corocznej ewidencji ludności użytej w innych zmiennych tej mapy. Jednorazowy pomiar z " +
      "NSP 2021 (stan na 31 marca 2021), nie dane roczne.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote:
      "Kody zmiennych BDL: 1644517/1644518 (ogółem 25-29/30-34), 1644537/1644538 " +
      "(mężczyźni 25-29/30-34), 1644557/1644558 (kobiety 25-29/30-34) -- " +
      "https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
      "19-24) wprowadzony od 2010 -- nie sumują się do jednej spójnej piramidy wieku, traktuj je jako " +
      "niezależne kategorie.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P3447, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    accessNote: "Temat BDL P3814, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
      "indywidualne\" to podzbiór -- tylko gospodarstwa prywatne. Jednorazowy Powszechny Spis Rolny " +
      "2020, nie dane roczne.",
    source: "Bank Danych Lokalnych GUS (Powszechny Spis Rolny 2020)",
    accessNote: "Temat BDL P4081, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
      "Osoby związane z gospodarstwem indywidualnym, wg płci -- \"Kierujący produkcją\" faktycznie " +
      "prowadzi gospodarstwo dzień po dniu, \"Użytkownik\" to formalny posiadacz/właściciel (bywa inną " +
      "osobą niż kierujący). Jednorazowy Powszechny Spis Rolny 2020.",
    source: "Bank Danych Lokalnych GUS (Powszechny Spis Rolny 2020)",
    accessNote: "Temat BDL P4077, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    accessNote: "Temat BDL P4272, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  szkoly_policealne: {
    label: "Szkoły policealne",
    unit: "osób",
    topic: "edukacja",
    file: "data/szkoly_policealne.json",
    agegroupLabel: "Typ szkoły",
    meaning:
      "Uczniowie (ogółem i w 1 klasie) oraz absolwenci szkół policealnych, wg typu szkoły i płci. Nie " +
      "każdy typ szkoły ma dane dla wszystkich trzech miar -- brakujące kombinacje pokazują brak danych.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2178, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "kolegium_bez_specjalnych", label: "W tym kolegium pracowników służb społecznych (bez specjalnych)" },
      { key: "pomaturalne_doroslych", label: "Pomaturalne dla dorosłych" },
      { key: "ogolem_z_kolegiami", label: "Ogółem (w tym kolegia pracowników służb społecznych)" },
      { key: "pomaturalne_mlodziezy", label: "Pomaturalne dla młodzieży" },
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
      "typu szkoły i płci. Nie każdy typ szkoły ma dane dla wszystkich trzech miar -- brakujące " +
      "kombinacje pokazują brak danych.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2143, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "specjalne_przysposabiajace", label: "Szkoły specjalne przysposabiające do pracy" },
      { key: "ponadpodstawowe_przysposabiajace", label: "Ponadpodstawowe przysposabiające do pracy (specjalne)" },
      { key: "zawodowe_mlodziezy_specjalne", label: "Zawodowe dla młodzieży (specjalne)" },
      { key: "zawodowe_doroslych", label: "Zawodowe dla dorosłych" },
      { key: "ponadpodstawowe_zasadnicze_doroslych", label: "Ponadpodstawowe zasadnicze dla dorosłych" },
      { key: "zawodowe_mlodziezy_bez_specjalnych", label: "Zawodowe dla młodzieży (bez specjalnych)" },
    ],
    measures: [
      { key: "uczniowie", label: "Uczniowie" },
      { key: "uczniowie_1_klasa", label: "Uczniowie w 1 klasie" },
      { key: "absolwenci", label: "Absolwenci" },
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
    accessNote: "Temat BDL P3226, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    meaning: "Liczba osób poszkodowanych w wypadkach przy pracy (ogółem), wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2276, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  kluby_sportowe: {
    label: "Ćwiczący w klubach sportowych",
    unit: "osób",
    topic: "zdrowie",
    file: "data/kluby_sportowe.json",
    meaning: "Liczba ćwiczących w klubach sportowych (łącznie z klubami wyznaniowymi i UKS), wg płci.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2155, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  zamachy_samobojcze: {
    label: "Zamachy samobójcze",
    unit: "osób",
    topic: "zdrowie",
    file: "data/zamachy_samobojcze.json",
    meaning: "Liczba osób w zamachach samobójczych, wg płci -- ogółem oraz zakończone zgonem.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P3833, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [
      { key: "ogolem", label: "Wszystkie" },
      { key: "zakonczone_zgonem", label: "Zakończone zgonem" },
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
      "Narodowy Spis Powszechny 2021, nie dane roczne.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote: "Temat BDL P4318, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    measures: [{ key: "default", label: "Wartość" }],
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
      "Powszechny 2021, nie dane roczne.",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote: "Temat BDL P4288, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [
      { key: "ogolem", label: "Wszystkie" },
      { key: "kawalerowie_panny", label: "Kawalerowie / panny" },
      { key: "zonaci_zamezne", label: "Żonaci / zamężne" },
      { key: "wdowcy_wdowy", label: "Wdowcy / wdowy" },
      { key: "rozwiedzeni", label: "Rozwiedzeni" },
      { key: "nieustalony", label: "Nieustalony" },
    ],
    measures: [{ key: "default", label: "Wartość" }],
    sharesMeaningful: true,
  },
  ludnosc_roczniki_nsp: {
    label: "Ludność ogółem (NSP)",
    unit: "osób",
    topic: "ludnosc",
    file: "data/ludnosc_roczniki_nsp.json",
    meaning:
      "Ludność rezydująca ogółem, wg płci, z tematu BDL który udostępnia też podział na pojedyncze " +
      "roczniki wieku (0,1,2...) -- tu wgrany wyłącznie wariant \"ogółem\" (poza podziałem na roczniki).",
    source: "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)",
    accessNote: "Temat BDL P4254, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
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
    accessNote: "Kod zmiennej BDL: 60559 (temat P2425) -- https://bdl.stat.gov.pl/api/v1/data/by-variable/60559",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
  dochody_powiat: {
    label: "Dochody na 1 mieszkańca (powiat)",
    unit: "zł",
    topic: "rynek_pracy",
    file: "data/dochody_powiat.json",
    meaning: "Dochody budżetu powiatu na 1 mieszkańca. BDL nie publikuje tego wskaźnika w podziale na płeć.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2410, poziom powiat -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "powiat", label: "Powiat" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
  dochody_gmina: {
    label: "Dochody na 1 mieszkańca (gmina)",
    unit: "zł",
    topic: "rynek_pracy",
    file: "data/dochody_gmina.json",
    meaning:
      "Dochody budżetu gminy na 1 mieszkańca -- wszystkie typy gmin łącznie, w tym miasta na prawach " +
      "powiatu. BDL nie publikuje tego wskaźnika w podziale na płeć.",
    source: "Bank Danych Lokalnych GUS",
    accessNote: "Temat BDL P2627, poziom gmina -- https://bdl.stat.gov.pl/api/v1/data/by-variable/{kod}",
    levels: [{ key: "gmina", label: "Gmina" }],
    ageGroups: [{ key: "default", label: "Ogółem" }],
    measures: [{ key: "default", label: "Wartość" }],
  },
};
