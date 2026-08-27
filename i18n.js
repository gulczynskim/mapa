// UI string table (chrome, not variable content -- see variables.en.js for
// that). DRAFT -- not yet wired into app.js/index.html. Covers every static
// string in index.html plus the main reusable app.js constant tables (view
// labels, level labels, scale/scope labels) and the most common dynamic
// messages (errors, gating notices). Not a complete sweep of app.js's ~4000
// lines -- some rarer strings (edge-case error messages, tooltip text built
// deep in less-common code paths) will still need catching during the build
// phase, when every render call site gets wired through a t()-style lookup
// and any remaining hardcoded Polish becomes visible.
//
// Structure: STRINGS.pl / STRINGS.en, same keys both sides. Intended usage
// once wired in: a small t(key) helper reading STRINGS[state.lang][key],
// falling back to STRINGS.pl[key] if a key is ever missing on the "en" side
// (should not happen once this file is complete, but keeps the fallback
// discipline consistent with variables.en.js).
const STRINGS = {
  pl: {
    // <title>, <meta>, og: tags
    page_title: "Interaktywna Mapa Nierówności Płci",
    meta_description: "Interaktywna mapa Polski z danymi z podziałem na płeć -- powiaty, wybór roku, zmiennej i sposobu porównania.",

    // Header
    header_intro: "Mapa powstaje jako narzędzie do eksploracji lokalnych nierówności między kobietami i mężczyznami.",
    header_sources: "Dane pochodzą z BDL GUS, PKW, CKE, ZUS i MPZ.",
    author_link: "O autorze i dane kontaktowe",

    // Main control sidebar
    label_topic: "Temat",
    label_variable: "Zmienna",
    variable_description_summary: "Opis zmiennej",
    label_level: "Poziom agregacji",
    label_agegroup_default: "Grupa wieku", // overridden per-variable by agegroupLabel
    label_measure: "Miara",
    label_view: "Widok",
    label_year: "Rok:",

    // Secondary sidebar (scale/legend/export)
    label_scale_scope: "Zakres skali",
    label_color_scale: "Skala kolorów",
    label_legend: "Legenda",
    label_download_map: "Pobierz mapę",
    label_download_gif: "Pobierz dynamiczną mapę zmian",
    gif_export_note: "Jedna kolorowa skala dla całego zakresu lat -- dostępne tylko przy zakresie skali \"Wspólna dla wszystkich lat\".",
    gif_from: "Od",
    gif_to: "Do",
    gif_generate_btn: "Generuj GIF",
    source_note_boundaries:
      "Granice administracyjne: Państwowy Rejestr Granic (GUGiK) dla powiatów, gmin i województw; " +
      "podregiony wg GISCO/Eurostat (NUTS 3); dwie historyczne granice gmin (Ostrowice, Zielona Góra " +
      "wiejska) uzupełnione na podstawie © OpenStreetMap contributors (ODbL).",

    // Search panel
    search_heading: "Szukaj gminy / powiatu / podregionu / województwa",
    search_placeholder: "Wpisz nazwę lub kod teryt",
    search_note: "Szuka w obrębie poziomu agregacji aktualnie wybranej zmiennej (powiat, gmina, podregion lub województwo).",

    // Rankings panel
    rankings_heading: "Rankingi",
    rankings_top: "Najwyższe 20",
    rankings_bottom: "Najniższe 20",

    // Unit overview panel
    unit_overview_heading: "Sprawdź gminę / powiat / podregion / województwo",
    unit_overview_tab_current: "Stan obecny",
    unit_overview_tab_trend: "Zmiana w czasie",
    unit_overview_widok_label: "Widok",
    unit_overview_csv_btn: "Pobierz CSV",
    unit_overview_no_data_topic: "Brak danych dla tej jednostki w tym temacie.",
    unit_overview_no_variables_level: "Brak zmiennych dla tego poziomu.",

    // Correlation panel
    correlation_heading: "Korelacja zmiennych",
    correlation_note:
      "Możesz porównać dowolne dwie kombinacje zmienna/rok/widok -- np. tę samą zmienną w dwóch " +
      "latach, kobiety vs. mężczyźni, albo którąś z map nierówności (różnica, proporcja, % udziału). " +
      "Obie osie muszą być na tym samym poziomie agregacji (powiat/gmina/podregion/województwo).",
    axis_x: "Oś X",
    axis_y: "Oś Y",
    corr_agegroup_label: "Grupa wieku / Kategoria",
    corr_log_label: "log₁₀ (logarytm dziesiętny)",
    corr_run_btn: "Porównaj",
    corr_download_chart: "Pobierz wykres",
    label_year_bare: "Rok",

    // Download-data panel
    download_data_heading: "Pobierz dane",
    download_data_note:
      "Wybierz zmienne, zakres lat oraz poziomy/grupy wieku/miary/widoki, które mają się znaleźć w " +
      "pliku CSV (można zaznaczyć wiele opcji). Kombinacje niedostępne dla danej zmiennej są " +
      "pomijane; jeśli żadna z zaznaczonych opcji nie pasuje, użyta zostanie domyślna. Kobiety, " +
      "Mężczyźni i Ogółem są eksportowane zawsze — zaznaczone widoki dodają dodatkowe kolumny.",
    select_all_variables: "Zaznacz wszystkie zmienne",
    select_all: "Zaznacz wszystko",
    download_dim_level: "Poziom",
    download_dim_agegroup: "Grupa wieku / Kategoria",
    download_dim_measure: "Miara",
    download_dim_view: "Widok",
    download_year_from: "Rok od",
    download_year_to: "Rok do",
    download_csv_btn: "Pobierz CSV",

    // Footer
    footer_map_by: "Mapa: Michał Gulczyński",
    footer_source_code: "kod źródłowy",
    footer_suggestions: "Jeśli masz sugestie albo coś nie działa,",
    footer_contact: "skontaktuj się z autorem",

    // View (widok) labels -- VIEWS in app.js
    view_women: "Kobiety",
    view_men: "Mężczyźni",
    view_total: "Ogółem",
    view_diff: "Różnica (K - M)",
    view_ratio: "Proporcja (K / M)",
    view_ratio_inverse: "Proporcja (M / K)",
    view_share_women: "% kobiet",
    view_share_men: "% mężczyzn",

    // Level labels -- LEVEL_LABELS in app.js
    level_powiat: "Powiat",
    level_gmina: "Gmina",
    level_podregion: "Podregion",
    level_wojewodztwo: "Województwo",
    level_powiat_plural: "Powiaty",
    level_gmina_plural: "Gminy",
    level_podregion_plural: "Podregiony",
    level_wojewodztwo_plural: "Województwa",

    // Color scale / scope labels -- COLOR_SCALES / SCALE_SCOPES in app.js
    scale_linear: "Liniowa (równe przedziały)",
    scale_log: "Logarytmiczna",
    scale_quantile: "Kwantyle",
    scope_year: "Dla danego roku",
    scope_all: "Wspólna dla wszystkich lat",

    // No-data / gating labels
    no_data: "brak danych",
    no_men: "brak mężczyzn",
    no_women: "brak kobiet",
    not_applicable: "—",
    source_prefix: "Źródło: ",
    data_prefix: "Dane: ",
    reset_view_title: "Przywróć domyślny widok",
    percentage_point_unit: "p.p.",

    // Loading messages (showLoading())
    loading_boundaries: "Wczytywanie granic i danych...",
    loading_data: "Wczytywanie danych...",
    loading_gif_encoding: "Kodowanie GIF-a...",
    loading_gif_frame: (year, i, total) => `Generowanie mapy zmian... rok ${year} (${i}/${total})`,

    // updateMeta() sidebar line prefixes ("Poziom agregacji: X · Lata: Y · ...")
    meta_years_prefix: "Lata",

    // CSV export -- ASCII column headers, kept snake_case/lowercase like the
    // Polish originals rather than Title Case, since they're identifiers
    // meant for spreadsheet/script consumption, not prose.
    csv_header: ["zmienna", "poziom", "grupa_wieku", "miara", "teryt", "powiat", "rok", "kobiety", "mezczyzni", "ogolem"],
    csv_filename_main: "dane_mapa.csv",
    csv_filename_unit_prefix: "dane_",

    // Common error/status messages
    err_file_protocol:
      "Ta strona nie zadziała otwarta bezpośrednio jako plik (file://) -- przeglądarki blokują " +
      "wczytywanie danych w ten sposób. Uruchom lokalny serwer (np. \"python3 -m http.server\" w tym " +
      "folderze) i otwórz http://localhost:8000, albo przeglądaj przez wdrożoną stronę.",
    err_load_failed_retry: "Nie udało się wczytać danych. Spróbuj odświeżyć stronę. (",
    err_load_failed: "Nie udało się wczytać danych: ",
    err_load_failed_link: "Nie udało się wczytać danych z linku: ",
    err_png_failed: "Nie udało się wygenerować obrazu PNG.",
    err_gif_no_years: "Brak dostępnych lat w wybranym zakresie.",
    err_gif_failed: "Nie udało się wygenerować mapy zmian: ",
    err_gif_needs_common_scale: "Dynamiczna mapa zmian wymaga zakresu skali \"Wspólna dla wszystkich lat\".",
    err_select_variable: "Wybierz co najmniej jedną zmienną do pobrania.",
    err_corr_not_enough_data: "Za mało wspólnych danych dla tej kombinacji, żeby policzyć korelację.",
    corr_coefficient_readout: (r, n) => `Korelacja Pearsona: r = ${r} (n = ${n})`,
    err_corr_run_first: "Najpierw wykonaj porównanie (przycisk „Porównaj”), zanim wyeksportujesz wykres.",
    err_corr_level_mismatch: (x, y) => `Wybrane zmienne mają różne poziomy (${x} vs ${y}) i nie można ich porównać -- wybierz dwie zmienne na tym samym poziomie.`,

    // View-gating explanatory notes
    gate_women_only: "Te dane dotyczą wyłącznie kobiet -- dostępny jest tylko widok Kobiety",
    gate_total_unavailable: "Ogółem niedostępne dla tej grupy wieku/miary (patrz opis zmiennej)",
    gate_single_winner: "Zmienna ma dokładnie jednego zwycięzcę -- proporcja K/M dzieli przez zero w większości gmin. Użyj Różnicy lub % kobiet/mężczyzn",
    gate_no_sex_breakdown: "Ta zmienna nie ma danych w podziale na płeć -- dostępne jest tylko Ogółem",
    gate_shares_not_applicable: "Dostępne tylko dla zmiennych liczebnościowych (np. liczba uczniów), nie dla wskaźników i wyników",

    // PNG/SVG/GIF export captions -- only reachable by actually downloading
    // an exported image, not visible in the live UI. export_scale_prefix is
    // combined with export_scale_linear/log/quantile at wiring time ("Skala"
    // + "liniowa" -> "Skala liniowa"); EXPORT_SCALE_ADJ's separate lowercase
    // gendered-adjective forms in app.js (liniowa/logarytmiczna/kwantylowa,
    // agreeing with feminine "Skala") don't need an English equivalent --
    // English adjectives don't inflect, so these can just reuse
    // scale_linear/scale_log/scale_quantile above once wired in (see chat).
    export_watermark: "Interaktywna Mapa Nierówności Płci: Michał Gulczyński · mapa.michalgulczynski.pl",
    export_scale_prefix: "Skala",
    // Bare nouns/adjectives, deliberately WITHOUT the "(równe przedziały)"
    // parenthetical that scale_linear (the sidebar button's own label)
    // bakes in -- the export caption breaks that qualifier onto its own
    // dedicated line (export_scale_linear_paren below) by fixed design, so
    // reusing scale_linear directly here would duplicate it.
    export_scale_linear: "liniowa",
    export_scale_log: "logarytmiczna",
    export_scale_quantile: "kwantylowa",
    export_scale_linear_paren: "(równe przedziały)",
    export_scope_year_line: "dla danego roku",
    export_scope_all_line1: "wspólna dla wszystkich",
    export_scope_all_line2: "dostępnych lat",
  },

  en: {
    page_title: "Interactive Gender Inequality Map of Poland",
    meta_description: "An interactive map of Poland with data broken down by sex -- choose a county, year, variable and comparison view.",

    header_intro: "This map is a tool for exploring local inequalities between women and men.",
    header_sources: "Data comes from Statistics Poland (LDB), the National Electoral Commission (PKW), the Central Examination Board (CKE), the Social Insurance Institution (ZUS), and the Health Needs Map (MPZ).",
    author_link: "About the author and contact details",

    label_topic: "Topic",
    label_variable: "Variable",
    variable_description_summary: "Variable description",
    label_level: "Aggregation level",
    label_agegroup_default: "Age group",
    label_measure: "Measure",
    label_view: "View",
    label_year: "Year:",

    label_scale_scope: "Scale range",
    label_color_scale: "Color scale",
    label_legend: "Legend",
    label_download_map: "Download map",
    label_download_gif: "Download animated change map",
    gif_export_note: "One color scale across the whole year range -- only available when the scale range is set to \"Common across all years\".",
    gif_from: "From",
    gif_to: "To",
    gif_generate_btn: "Generate GIF",
    source_note_boundaries:
      "Administrative boundaries: State Register of Boundaries (GUGiK) for counties, municipalities " +
      "and voivodeships; subregions per GISCO/Eurostat (NUTS 3); two historical municipality " +
      "boundaries (Ostrowice, Zielona Góra wiejska) supplemented from © OpenStreetMap contributors " +
      "(ODbL).",

    search_heading: "Search for a municipality / county / subregion / voivodeship",
    search_placeholder: "Enter a name or TERYT code",
    search_note: "Searches within the aggregation level of the currently selected variable (county, municipality, subregion or voivodeship).",

    rankings_heading: "Rankings",
    rankings_top: "Highest 20",
    rankings_bottom: "Lowest 20",

    unit_overview_heading: "Look up a municipality / county / subregion / voivodeship",
    unit_overview_tab_current: "Current",
    unit_overview_tab_trend: "Change over time",
    unit_overview_widok_label: "View",
    unit_overview_csv_btn: "Download CSV",
    unit_overview_no_data_topic: "No data for this unit in this topic.",
    unit_overview_no_variables_level: "No variables for this level.",

    correlation_heading: "Variable correlation",
    correlation_note:
      "You can compare any two variable/year/view combinations -- e.g. the same variable in two " +
      "years, women vs. men, or one of the inequality views (difference, ratio, % share). Both axes " +
      "must be at the same aggregation level (county/municipality/subregion/voivodeship).",
    axis_x: "X axis",
    axis_y: "Y axis",
    corr_agegroup_label: "Age group / Category",
    corr_log_label: "log₁₀ (base-10 logarithm)",
    corr_run_btn: "Compare",
    corr_download_chart: "Download chart",
    label_year_bare: "Year",

    download_data_heading: "Download data",
    download_data_note:
      "Choose the variables, year range, and levels/age groups/measures/views to include in the CSV " +
      "file (multiple selections allowed). Combinations that don't apply to a given variable are " +
      "skipped; if none of the checked options fit, the default is used. Women, Men and Total are " +
      "always exported -- checked views add extra columns.",
    select_all_variables: "Select all variables",
    select_all: "Select all",
    download_dim_level: "Level",
    download_dim_agegroup: "Age group / Category",
    download_dim_measure: "Measure",
    download_dim_view: "View",
    download_year_from: "Year from",
    download_year_to: "Year to",
    download_csv_btn: "Download CSV",

    footer_map_by: "Map by Michał Gulczyński",
    footer_source_code: "source code",
    footer_suggestions: "If you have suggestions or something isn't working,",
    footer_contact: "contact the author",

    view_women: "Women",
    view_men: "Men",
    view_total: "Total",
    view_diff: "Difference (Women − Men)",
    view_ratio: "Ratio (Women / Men)",
    view_ratio_inverse: "Ratio (Men / Women)",
    view_share_women: "% Women",
    view_share_men: "% Men",

    level_powiat: "County",
    level_gmina: "Municipality",
    level_podregion: "Subregion",
    level_wojewodztwo: "Voivodeship",
    level_powiat_plural: "Counties",
    level_gmina_plural: "Municipalities",
    level_podregion_plural: "Subregions",
    level_wojewodztwo_plural: "Voivodeships",

    scale_linear: "Linear (equal intervals)",
    scale_log: "Logarithmic",
    scale_quantile: "Quantiles",
    scope_year: "For the selected year",
    scope_all: "Common across all years",

    no_data: "no data",
    no_men: "no men",
    no_women: "no women",
    not_applicable: "—",
    source_prefix: "Source: ",
    data_prefix: "Data: ",
    reset_view_title: "Reset to default view",
    percentage_point_unit: "pp",

    err_file_protocol:
      "This page won't work opened directly as a file (file://) -- browsers block loading data that " +
      "way. Run a local server (e.g. \"python3 -m http.server\" in this folder) and open " +
      "http://localhost:8000, or browse the deployed site instead.",
    err_load_failed_retry: "Failed to load data. Try refreshing the page. (",
    err_load_failed: "Failed to load data: ",
    err_load_failed_link: "Failed to load data from the link: ",
    err_png_failed: "Failed to generate the PNG image.",
    err_gif_no_years: "No years available in the selected range.",
    err_gif_failed: "Failed to generate the change map: ",
    err_gif_needs_common_scale: "The animated change map requires the scale range to be set to \"Common across all years\".",
    err_select_variable: "Select at least one variable to download.",
    err_corr_not_enough_data: "Not enough shared data for this combination to compute a correlation.",
    corr_coefficient_readout: (r, n) => `Pearson correlation: r = ${r} (n = ${n})`,
    err_corr_run_first: "Run a comparison first (the \"Compare\" button) before exporting the chart.",
    err_corr_level_mismatch: (x, y) => `The selected variables are at different levels (${x} vs ${y}) and can't be compared -- choose two variables at the same level.`,

    loading_boundaries: "Loading boundaries and data...",
    loading_data: "Loading data...",
    loading_gif_encoding: "Encoding GIF...",
    loading_gif_frame: (year, i, total) => `Generating change map... year ${year} (${i}/${total})`,

    meta_years_prefix: "Years",

    csv_header: ["variable", "level", "age_group", "measure", "teryt", "county", "year", "women", "men", "total"],
    csv_filename_main: "map_data.csv",
    csv_filename_unit_prefix: "data_",

    gate_women_only: "This data applies only to women -- only the Women view is available",
    gate_total_unavailable: "Total is not available for this age group/measure (see variable description)",
    gate_single_winner: "This variable has exactly one winner -- the Women/Men ratio divides by zero in most municipalities. Use Difference or % Women/% Men instead",
    gate_no_sex_breakdown: "This variable has no breakdown by sex -- only Total is available",
    gate_shares_not_applicable: "Only available for headcount variables (e.g. number of pupils), not for rates or scores",

    // See the pl block's comment above -- English needs no separate
    // gendered-adjective form, so export_scale_prefix + scale_linear/
    // scale_log/scale_quantile (already defined above) covers the noun
    // line; only the paren qualifier and scope lines need their own entry.
    export_watermark: "Interactive Gender Inequality Map of Poland: Michał Gulczyński · mapa.michalgulczynski.pl",
    export_scale_prefix: "Scale:",
    export_scale_linear: "Linear",
    export_scale_log: "Logarithmic",
    export_scale_quantile: "Quantile",
    export_scale_linear_paren: "(equal intervals)",
    export_scope_year_line: "for the selected year",
    export_scope_all_line1: "common across all",
    export_scope_all_line2: "available years",
  },
};

// Topic names (TOPICS in variables.js) -- kept here rather than in
// variables.en.js since TOPICS is a small standalone object, not part of
// VARIABLE_META.
const TOPICS_EN = {
  rynek_pracy: "Labor market",
  edukacja: "Education",
  polityka: "Politics",
  ludnosc: "Population",
  zdrowie: "Health",
  rolnictwo: "Agriculture",
  inne: "Other",
};
