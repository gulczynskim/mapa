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
const VARIABLE_META = {
  unemployment: {
    label: "Bezrobocie rejestrowane",
    unit: "%",
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
    label: "Aktywność zawodowa",
    unit: "%",
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
  e8_angielski: {
    label: "Egzamin ósmoklasisty -- język angielski",
    unit: "%",
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
};
