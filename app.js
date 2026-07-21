// Prototype dashboard. Boundaries: powiat level only for now (levels/age
// groups/measures are modeled per-variable in variables.js and the UI
// enables/disables accordingly, ready for when more levels get wired in).

// 8 buckets for magnitude views (per user request for finer resolution than
// the earlier 6) -- evenly spaced steps from the validated blue ramp.
const SEQUENTIAL_STEPS = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#1c5cab", "#184f95", "#0d366b"];
// Diverging: center is WHITE (no difference), poles are the blue/red pair.
// 7 buckets (3 per arm + center) -- a diverging scale needs an odd count so
// white stays exactly at the center. Grey (MISSING_COLOR) is reserved
// exclusively for missing data so it's never confused with "no difference
// between sexes".
const DIVERGING_STEPS = [
  "#2a78d6",
  "color-mix(in oklch, #2a78d6 63%, #ffffff)",
  "color-mix(in oklch, #2a78d6 30%, #ffffff)",
  "#ffffff",
  "color-mix(in oklch, #e34948 30%, #ffffff)",
  "color-mix(in oklch, #e34948 63%, #ffffff)",
  "#e34948",
];
const MISSING_COLOR = "#d9d8d2";

// "Różnica" = kobiety - mężczyźni. Kept as a fixed, mechanical convention --
// NOT a built-in judgment about which sex is disadvantaged, since that
// depends on the variable (e.g. higher female unemployment is a disadvantage,
// but a higher female share of liceum graduates isn't inherently one).
// Each view optionally overrides "unit" (falls back to the variable's own
// unit, e.g. "%") and "decimals" (display precision) -- lets ratio/share
// views render sensibly (2 decimals, no unit for a bare ratio; 1 decimal
// with a hardcoded "%" for a share) without scattering view-specific
// checks through the formatting code.
const VIEWS = {
  women: { label: "Kobiety", kind: "sequential", pick: (d) => d.k, decimals: 1 },
  men: { label: "Mężczyźni", kind: "sequential", pick: (d) => d.m, decimals: 1 },
  total: { label: "Ogółem", kind: "sequential", pick: (d) => d.t, decimals: 1 },
  diff: { label: "Różnica (K - M)", kind: "diverging", pick: (d) => d.k - d.m, center: 0, decimals: 1 },
  // logScale: a ratio can never go negative, and 2x / 0.5x are equally far
  // from "equal" multiplicatively -- linear spread around center=1 would
  // let the color scale (and any tick derived from it) drift negative,
  // which is meaningless for a ratio. Symmetrize in log space instead.
  ratio: { label: "Proporcja (K / M)", kind: "diverging", pick: (d) => d.k / d.m, center: 1, logScale: true, decimals: 2, unit: "" },
  ratioInverse: { label: "Proporcja (M / K)", kind: "diverging", pick: (d) => d.m / d.k, center: 1, logScale: true, decimals: 2, unit: "" },
  // Useful for compositional data (e.g. share of women among elected
  // officials or students) where the natural "total" is a headcount, not a
  // percentage -- these compute the share directly from k/m regardless of
  // what the variable's own unit is.
  shareWomen: { label: "% kobiet", kind: "sequential", pick: (d) => (d.k / (d.k + d.m)) * 100, decimals: 1, unit: "%" },
  shareMen: { label: "% mężczyzn", kind: "sequential", pick: (d) => (d.m / (d.k + d.m)) * 100, decimals: 1, unit: "%" },
};

const POLAND_BOUNDS = L.latLngBounds([48.9, 13.8], [55.0, 24.2]);

let state = {
  variable: "unemployment",
  view: "total",
  year: null, // set to the most recent available year once data is loaded (see syncYearSlider)
  level: "powiat",
  ageGroup: "default",
  measure: "default",
};

let loadedData = {}; // variable -> {teryt: {year: {"<ageGroup>__<measure>": {t,m,k}}}}
let boundaries = null;
let geoLayer = null;
let map = null;
let attributionControl = null;
let currentSourceAttribution = null;
let terytToLayer = {};
let terytToName = {};
let lastDomain = [];

// The map's own attribution control shows the source for whichever variable
// is currently selected (CKE for E8, PKW for election data once added, BDL
// GUS for the rest) -- not a fixed list of every source the site ever uses.
function updateMapAttribution() {
  if (!attributionControl) return;
  if (currentSourceAttribution) attributionControl.removeAttribution(currentSourceAttribution);
  currentSourceAttribution = "Dane: " + VARIABLE_META[state.variable].source;
  attributionControl.addAttribution(currentSourceAttribution);
}

function sliceKey(ageGroup, measure) {
  return `${ageGroup}__${measure}`;
}

function showLoading(msg) {
  const el = document.getElementById("map-status");
  el.textContent = msg;
  el.style.display = "block";
  el.classList.remove("error");
}
function hideLoading() {
  document.getElementById("map-status").style.display = "none";
}
function showError(msg) {
  const el = document.getElementById("map-status");
  el.textContent = msg;
  el.style.display = "block";
  el.classList.add("error");
}

async function loadVariable(name) {
  if (loadedData[name]) return loadedData[name];
  const meta = VARIABLE_META[name];
  const data = await fetch(meta.file).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  loadedData[name] = data;
  return data;
}

async function init() {
  if (location.protocol === "file:") {
    showError(
      "Ta strona nie zadziała otwarta bezpośrednio jako plik (file://) -- przeglądarki blokują " +
      "wtedy wczytywanie danych. Uruchom lokalny serwer (np. \"python3 -m http.server\" w tym " +
      "folderze) i otwórz http://localhost:8000, albo przeglądaj przez wdrożoną stronę."
    );
    return;
  }
  showLoading("Wczytywanie granic i danych...");
  try {
    const [boundariesData] = await Promise.all([
      fetch("data/powiaty.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      loadVariable(state.variable),
    ]);
    boundaries = boundariesData;
  } catch (err) {
    showError("Nie udało się wczytać danych. Spróbuj odświeżyć stronę. (" + err.message + ")");
    return;
  }
  hideLoading();

  // No basemap tile layer -- a real map service would always show slices of
  // neighboring countries at the viewport edges. Plain background (set in
  // CSS) plus the powiat polygons is the only way to guarantee nothing but
  // Poland is ever visible.
  map = L.map("map", {
    zoomControl: true,
    maxBounds: POLAND_BOUNDS.pad(0.05),
    minZoom: 6,
    maxZoom: 10,
    attributionControl: false,
  }).fitBounds(POLAND_BOUNDS);
  attributionControl = L.control.attribution({ prefix: false }).addTo(map);
  attributionControl.addAttribution('Mapa: <a href="https://mapa.michalgulczynski.pl">Michał Gulczyński</a>');
  updateMapAttribution();

  geoLayer = L.geoJSON(boundaries, {
    style: () => ({ fillOpacity: 0.9, color: "#ffffff", weight: 0.6 }),
    onEachFeature: (feature, layer) => {
      const teryt = feature.properties.JPT_KOD_JE;
      const name = feature.properties.JPT_NAZWA_;
      terytToLayer[teryt] = layer;
      terytToName[teryt] = name;
      layer.on({
        mouseover: (e) => highlight(e.target),
        // Explicit closeTooltip: with sticky tooltips some browsers/embedded
        // views don't reliably deliver the internal event Leaflet uses to
        // hide them, leaving the box stuck on screen after the cursor leaves.
        mouseout: (e) => {
          e.target.setStyle(baseStyleFor(mapValueFor(teryt), lastDomain));
          e.target.closeTooltip();
        },
      });
      layer.bindTooltip("", { className: "powiat-tooltip", sticky: true });
    },
  }).addTo(map);

  // Safety net for any highlight or tooltip that outlives its hover (missed
  // mouseout, or the persistent highlight left by a search jump): clicking
  // anywhere on the map repaints every layer and closes all tooltips.
  map.on("click", () => {
    geoLayer.eachLayer((layer) => {
      layer.setStyle(baseStyleFor(mapValueFor(layer.feature.properties.JPT_KOD_JE), lastDomain));
      layer.closeTooltip();
    });
  });

  buildTopicSelect();
  buildVariableSelect();
  buildViewButtons();
  buildSearch();
  buildDownloadPanel();
  await buildCorrelationSelectors();
  await restoreFromUrl();
  buildDimensionSelectors();
  updateViewAvailability();
  buildYearSlider();
  updateMapAttribution();
  updateAll();
  updateMeta();
}

// --- Dimension selectors (level / age group / measure) ---
// A single-option dimension still renders a selector, disabled, showing that
// one value -- so the UI shape is consistent whether or not a variable
// actually offers a choice for that dimension.
function populateDimensionSelect(selectEl, options, selectedKey) {
  selectEl.innerHTML = options.map((o) => `<option value="${o.key}">${o.label}</option>`).join("");
  selectEl.value = options.some((o) => o.key === selectedKey) ? selectedKey : options[0].key;
  selectEl.disabled = options.length <= 1;
  return selectEl.value;
}

function buildDimensionSelectors() {
  const meta = VARIABLE_META[state.variable];
  state.level = populateDimensionSelect(document.getElementById("level-select"), meta.levels, state.level);
  state.ageGroup = populateDimensionSelect(document.getElementById("agegroup-select"), meta.ageGroups, state.ageGroup);
  state.measure = populateDimensionSelect(document.getElementById("measure-select"), meta.measures, state.measure);

  document.getElementById("level-select").onchange = (e) => { state.level = e.target.value; updateAll(); };
  document.getElementById("agegroup-select").onchange = (e) => { state.ageGroup = e.target.value; updateViewAvailability(); updateAll(); };
  document.getElementById("measure-select").onchange = (e) => { state.measure = e.target.value; updateViewAvailability(); updateAll(); };
}

function availableYears(variable) {
  const data = loadedData[variable] || {};
  const years = new Set();
  for (const teryt in data) {
    for (const year in data[teryt]) years.add(year);
  }
  return [...years].sort();
}

async function populateCorrDimensions(prefix) {
  const variable = document.getElementById(`corr-${prefix}-var`).value;
  await loadVariable(variable);
  const meta = VARIABLE_META[variable];
  populateDimensionSelect(document.getElementById(`corr-${prefix}-level`), meta.levels, meta.levels[0].key);
  populateDimensionSelect(document.getElementById(`corr-${prefix}-agegroup`), meta.ageGroups, meta.ageGroups[0].key);
  populateDimensionSelect(document.getElementById(`corr-${prefix}-measure`), meta.measures, meta.measures[0].key);

  const years = availableYears(variable);
  const yearSelect = document.getElementById(`corr-${prefix}-year`);
  yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = years[years.length - 1];
}

async function buildCorrelationSelectors() {
  const keys = Object.keys(VARIABLE_META);
  for (const prefix of ["x", "y"]) {
    const select = document.getElementById(`corr-${prefix}-var`);
    select.innerHTML = keys.map((k) => `<option value="${k}">${VARIABLE_META[k].label}</option>`).join("");
    select.addEventListener("change", () => populateCorrDimensions(prefix));
  }
  document.getElementById("corr-y-var").value = keys[keys.length - 1];
  await Promise.all([populateCorrDimensions("x"), populateCorrDimensions("y")]);
}

function valueFor(variable, teryt, year, ageGroup, measure) {
  const series = loadedData[variable] && loadedData[variable][teryt];
  if (!series) return null;
  const yearData = series[String(year)];
  if (!yearData) return null;
  const slice = yearData[sliceKey(ageGroup, measure)];
  if (!slice) return null;
  const view = VIEWS[state.view];
  const v = view.pick(slice);
  return Number.isFinite(v) ? v : null;
}

function mapValueFor(teryt) {
  return valueFor(state.variable, teryt, state.year, state.ageGroup, state.measure);
}

function currentDomain() {
  const values = [];
  const data = loadedData[state.variable] || {};
  for (const teryt in data) {
    const v = mapValueFor(teryt);
    if (v !== null) values.push(v);
  }
  return values;
}

// logScale views (ratio) are symmetrized in log space -- 2x and 0.5x are
// equally far from "equal", and a ratio can never go negative, so linear
// spread around center=1 would be both lopsided and capable of producing
// meaningless negative tick values.
function divergingSpread(domain, view) {
  const center = view.center ?? 0;
  if (view.logScale) {
    const logCenter = Math.log(center);
    const logSpread = Math.max(...domain.map((v) => Math.abs(Math.log(v) - logCenter)), 1e-9);
    return { center, logCenter, logSpread };
  }
  const spread = Math.max(...domain.map((v) => Math.abs(v - center)), 1e-9);
  return { center, spread };
}

// The N+1 boundary values (original data units) between the N color
// buckets -- shared by colorFor (to assign a color) and updateLegend (to
// label exactly where each color starts/ends), so the two can never drift
// apart the way they briefly did for the ratio view.
function colorBoundaries(domain, view, steps) {
  const n = steps.length;
  if (view.kind === "sequential") {
    const min = Math.min(...domain);
    const max = Math.max(...domain);
    return Array.from({ length: n + 1 }, (_, i) => min + (i / n) * (max - min));
  }
  const s = divergingSpread(domain, view);
  const tBoundaries = Array.from({ length: n + 1 }, (_, i) => -1 + (i * 2) / n);
  return view.logScale
    ? tBoundaries.map((t) => Math.exp(s.logCenter + t * s.logSpread))
    : tBoundaries.map((t) => s.center + t * s.spread);
}

function bucketIndex(value, boundaries) {
  const n = boundaries.length - 1;
  for (let i = 0; i < n; i++) {
    if (value < boundaries[i + 1]) return i;
  }
  return n - 1;
}

function colorFor(value, domain) {
  const view = VIEWS[state.view];
  if (value === null) return MISSING_COLOR;
  const steps = view.kind === "sequential" ? SEQUENTIAL_STEPS : DIVERGING_STEPS;
  return steps[bucketIndex(value, colorBoundaries(domain, view, steps))];
}

function highlight(layer) {
  layer.setStyle({ weight: 2, color: "#0b0b0b" });
  layer.bringToFront();
}

// The actual data-driven fill for a powiat -- used both when painting the
// map and when restoring a layer after hover. NEVER use geoJSON's own
// resetStyle() for that restoration: called with no argument it resets
// EVERY layer in the group to the bare style() callback passed to
// L.geoJSON, which never set fillColor -- Leaflet then falls back to the
// border color (white) for the fill, turning the whole map blank. This bit
// us for real: any mouseout was capable of whiting out the entire map, not
// just the hovered polygon.
function baseStyleFor(value, domain) {
  return { fillColor: colorFor(value, domain), fillOpacity: 0.9, color: "#ffffff", weight: 0.6 };
}

// Polish locale throughout the UI: comma decimal separator, space thousands
// (e.g. "1,5" not "1.5"; "10 000" not "10,000"). Never used for the CSV
// export, which stays machine-readable with plain "." decimals.
function formatPl(n, maxFractionDigits) {
  return n.toLocaleString("pl-PL", { maximumFractionDigits: maxFractionDigits ?? 2, useGrouping: true });
}

function formatValue(v) {
  if (v === null) return "brak danych";
  const view = VIEWS[state.view];
  const unit = view.unit !== undefined ? view.unit : VARIABLE_META[state.variable].unit;
  const formatted = formatPl(v, view.decimals);
  return unit ? formatted + " " + unit : formatted;
}

function updateAll() {
  if (!geoLayer) return;
  const domain = currentDomain();
  lastDomain = domain;
  geoLayer.eachLayer((layer) => {
    const teryt = layer.feature.properties.JPT_KOD_JE;
    const name = layer.feature.properties.JPT_NAZWA_;
    const value = mapValueFor(teryt);
    layer.setStyle(baseStyleFor(value, domain));
    layer.setTooltipContent(
      `<strong>${displayName(teryt, name)}</strong><br>${VIEWS[state.view].label}, ${state.year}: <span class="val">${formatValue(value)}</span>`
    );
  });
  updateLegend(domain);
  updateRankings(domain);
  updateUrl();
}

function legendValueFormat(v) {
  return formatPl(v, VIEWS[state.view].decimals);
}

// One tick per color boundary (N colors -> N+1 ticks), so every edge between
// two swatches has a visible number showing exactly where it falls -- not
// just the overall min/max. Sign (diff) or position relative to 1 (ratio)
// already conveys the M-vs-K direction, so bare numbers are enough.
function updateLegend(domain) {
  const view = VIEWS[state.view];
  const steps = view.kind === "sequential" ? SEQUENTIAL_STEPS : DIVERGING_STEPS;
  document.getElementById("legend-scale").innerHTML = steps.map((c) => `<span style="background:${c}"></span>`).join("");
  const labelsEl = document.getElementById("legend-labels");
  if (domain.length === 0) {
    labelsEl.innerHTML = "";
    return;
  }
  const boundaries = colorBoundaries(domain, view, steps);
  const n = boundaries.length - 1;
  labelsEl.innerHTML = boundaries
    .map((v, i) => {
      const pct = (i / n) * 100;
      const pos = i === 0 ? "left:0" : i === n ? "right:0" : `left:${pct}%;transform:translateX(-50%)`;
      return `<span style="${pos}">${legendValueFormat(v)}</span>`;
    })
    .join("");
}

function updateMeta() {
  const meta = VARIABLE_META[state.variable];
  document.getElementById("variable-description").textContent = meta.meaning;
  document.getElementById("variable-source").textContent = "Źródło: " + meta.source;
  document.getElementById("variable-access").textContent = meta.accessNote;

  const years = availableYears(state.variable).map(Number);
  const yearsStr = years.length > 1 ? `${Math.min(...years)}-${Math.max(...years)}` : String(years[0] ?? "brak danych");
  const levelsStr = meta.levels.map((o) => o.label).join(", ");
  const ageGroupsStr = meta.ageGroups.map((o) => o.label).join(", ");
  const lines = [
    `Poziom agregacji: ${levelsStr}`,
    `Lata: ${yearsStr}`,
    `Grupa wieku: ${ageGroupsStr}`,
  ];
  if (meta.measures.length > 1) {
    lines.push(`Miara: ${meta.measures.map((o) => o.label).join(", ")}`);
  }
  document.getElementById("variable-availability").textContent = lines.join(" · ");
}

// Guards against overlapping selections: if the variable changes again (e.g.
// picking a new Temat right after a slow Zmienna switch) before an in-flight
// loadVariable() resolves, the earlier call's continuation must not be
// allowed to overwrite state with its now-stale target. Found for real:
// rapid automated switching left the UI on an entirely different variable
// than the one actually selected, with a URL/state mismatch to match.
let variableRequestSeq = 0;

async function selectVariable(requested) {
  const seq = ++variableRequestSeq;
  showLoading("Wczytywanie danych...");
  try {
    await loadVariable(requested);
  } catch (err) {
    if (seq !== variableRequestSeq) return; // superseded by a newer selection
    showError("Nie udało się wczytać danych: " + err.message);
    return;
  }
  if (seq !== variableRequestSeq) return; // superseded by a newer selection
  state.variable = requested;
  hideLoading();
  // Reset to the new variable's default dimensions rather than keeping
  // stale keys from the previous variable that might not exist here.
  const meta = VARIABLE_META[state.variable];
  state.level = meta.levels[0].key;
  state.ageGroup = meta.ageGroups[0].key;
  state.measure = meta.measures[0].key;
  document.getElementById("topic-select").value = meta.topic;
  populateVariableOptions(meta.topic);
  document.getElementById("variable-select").value = state.variable;
  buildDimensionSelectors();
  updateViewAvailability();
  syncYearSlider();
  updateMeta();
  updateMapAttribution();
  updateAll();
}

function topicsInUse() {
  return [...new Set(Object.values(VARIABLE_META).map((v) => v.topic))];
}

function populateVariableOptions(topic) {
  const select = document.getElementById("variable-select");
  const keys = Object.keys(VARIABLE_META).filter((k) => VARIABLE_META[k].topic === topic);
  select.innerHTML = keys.map((k) => `<option value="${k}">${VARIABLE_META[k].label}</option>`).join("");
}

function buildTopicSelect() {
  const select = document.getElementById("topic-select");
  select.innerHTML = topicsInUse().map((t) => `<option value="${t}">${TOPICS[t]}</option>`).join("");
  select.value = VARIABLE_META[state.variable].topic;
  select.addEventListener("change", () => {
    populateVariableOptions(select.value);
    const firstVar = Object.keys(VARIABLE_META).find((k) => VARIABLE_META[k].topic === select.value);
    selectVariable(firstVar);
  });
}

function buildVariableSelect() {
  populateVariableOptions(VARIABLE_META[state.variable].topic);
  const select = document.getElementById("variable-select");
  select.value = state.variable;
  select.addEventListener("change", () => selectVariable(select.value));
}

// Keeps the year slider's min/max in sync with whatever the current
// variable actually covers (e.g. 2022-2025 for E8, a single fixed year for
// labor force activity) instead of always showing the full 2003-2025 range
// regardless of variable. Defaults to the most recent available year
// whenever the current one isn't valid for this variable (including on
// first load, where state.year starts unset).
function syncYearSlider() {
  const years = availableYears(state.variable).map(Number);
  if (years.length === 0) return;
  const slider = document.getElementById("year-slider");
  slider.min = Math.min(...years);
  slider.max = Math.max(...years);
  slider.disabled = years.length <= 1;
  if (state.year === null || !years.includes(state.year)) {
    state.year = Math.max(...years);
  }
  slider.value = state.year;
  document.getElementById("year-value").textContent = state.year;
}

function buildViewButtons() {
  const container = document.getElementById("view-buttons");
  container.innerHTML = "";
  for (const key in VIEWS) {
    const btn = document.createElement("button");
    btn.textContent = VIEWS[key].label;
    btn.dataset.viewKey = key;
    btn.className = key === state.view ? "active" : "";
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.view = key;
      [...container.children].forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateAll();
    });
    container.appendChild(btn);
  }
  updateViewAvailability();
}

// "Ogółem" reads d.t, which is deliberately null for combinations where a
// combined-group total/median can't be correctly derived (E8's median
// measure, labor force's 15-24 age group -- see hasTotal in variables.js).
// Selecting it there silently shows "no data" everywhere with no obvious
// cause, so disable the button and steer away from it instead.
function hasTotalForCurrentSelection() {
  const meta = VARIABLE_META[state.variable];
  const ageGroupOpt = meta.ageGroups.find((o) => o.key === state.ageGroup);
  const measureOpt = meta.measures.find((o) => o.key === state.measure);
  return (ageGroupOpt?.hasTotal ?? true) && (measureOpt?.hasTotal ?? true);
}

function updateViewAvailability() {
  const totalBtn = document.querySelector('#view-buttons button[data-view-key="total"]');
  if (!totalBtn) return;
  const meta = VARIABLE_META[state.variable];

  const totalOk = hasTotalForCurrentSelection();
  totalBtn.disabled = !totalOk;
  totalBtn.title = totalOk ? "" : "Ogółem niedostępne dla tej grupy wieku/miary (patrz opis zmiennej)";

  // % kobiet / % mężczyzn compute k/(k+m) -- only meaningful when k and m
  // are COUNTS (people, pupils, votes), not rates or scores. Adding two
  // unemployment rates and dividing tells you nothing, so these views stay
  // disabled unless the variable opts in with sharesMeaningful: true.
  const sharesOk = meta.sharesMeaningful === true;
  for (const key of ["shareWomen", "shareMen"]) {
    const btn = document.querySelector(`#view-buttons button[data-view-key="${key}"]`);
    if (!btn) continue;
    btn.disabled = !sharesOk;
    btn.title = sharesOk ? "" : "Dostępne tylko dla zmiennych liczebnościowych (np. liczba uczniów), nie dla wskaźników i wyników";
  }

  const currentBlocked =
    (!totalOk && state.view === "total") || (!sharesOk && (state.view === "shareWomen" || state.view === "shareMen"));
  if (currentBlocked) {
    state.view = "women";
    [...document.querySelectorAll("#view-buttons button")].forEach((b) =>
      b.classList.toggle("active", b.dataset.viewKey === state.view)
    );
  }
}

function buildYearSlider() {
  const slider = document.getElementById("year-slider");
  const label = document.getElementById("year-value");
  syncYearSlider();
  slider.addEventListener("input", () => {
    state.year = Number(slider.value);
    label.textContent = state.year;
    updateAll();
  });
}

function normalizePl(s) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// A handful of powiat names are legitimately reused across voivodeships (e.g.
// "powiat opolski" exists in both woj. lubelskie and woj. opolskie -- real
// Polish administrative geography, not a data bug). Disambiguate by
// appending the voivodeship whenever a name isn't unique.
const VOIVODESHIP_BY_CODE = {
  "02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
  "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
  "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
  "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie", "32": "zachodniopomorskie",
};
function displayName(teryt, name) {
  const nameCount = Object.values(terytToName).filter((n) => n === name).length;
  if (nameCount <= 1) return name;
  return `${name} (${VOIVODESHIP_BY_CODE[teryt.slice(0, 2)] || teryt.slice(0, 2)})`;
}

function buildSearch() {
  const input = document.getElementById("search-input");
  const list = document.getElementById("search-results");
  input.addEventListener("input", () => {
    const q = normalizePl(input.value.trim());
    list.innerHTML = "";
    if (q.length < 2) return;
    const matches = Object.entries(terytToName)
      .filter(([, name]) => normalizePl(name).includes(q))
      .slice(0, 8);
    matches.forEach(([teryt, name]) => {
      const item = document.createElement("li");
      item.textContent = displayName(teryt, name);
      item.addEventListener("click", () => {
        const layer = terytToLayer[teryt];
        map.fitBounds(layer.getBounds(), { maxZoom: 9 });
        highlight(layer);
        layer.openTooltip();
        input.value = "";
        list.innerHTML = "";
      });
      list.appendChild(item);
    });
  });
}

function updateRankings(domain) {
  const rows = [];
  const data = loadedData[state.variable] || {};
  for (const teryt in data) {
    const v = mapValueFor(teryt);
    if (v !== null) rows.push({ teryt, name: displayName(teryt, terytToName[teryt] || teryt), value: v });
  }
  rows.sort((a, b) => b.value - a.value);

  const top = rows.slice(0, 20);
  const bottom = rows.slice(-20).reverse();

  const render = (el, list) => {
    el.innerHTML = list
      .map((r) => `<li><span>${r.name}</span><span class="val">${formatValue(r.value)}</span></li>`)
      .join("");
  };
  render(document.getElementById("ranking-top"), top);
  render(document.getElementById("ranking-bottom"), bottom);
}

// --- Download panel ---
// Variable selection is two nested expandable lists (Temat -> Zmienna),
// mirroring the map's own Temat/Zmienna controls but independent of them --
// this is its own multi-select, not tied to whatever's on the map. The
// current map variable's topic starts open and its variable pre-checked;
// everything else starts collapsed and unchecked.
function buildDownloadPanel() {
  const container = document.getElementById("download-variables");
  const currentTopic = VARIABLE_META[state.variable].topic;
  container.innerHTML = topicsInUse()
    .map((topic) => {
      const keys = Object.keys(VARIABLE_META).filter((k) => VARIABLE_META[k].topic === topic);
      const items = keys
        .map(
          (key) =>
            `<label class="download-var-item"><input type="checkbox" value="${key}" ${key === state.variable ? "checked" : ""}> ${VARIABLE_META[key].label}</label>`
        )
        .join("");
      return `<details class="download-dim"${topic === currentTopic ? " open" : ""}><summary>${TOPICS[topic]}</summary><div class="dim-options">${items}</div></details>`;
    })
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", updateDownloadDimensionOptions);
  });
  updateDownloadDimensionOptions();
}

// The Poziom/Grupa wieku/Miara lists only show options that at least one
// CHECKED variable actually has -- e.g. checking only "Radni powiatu" hides
// "Ósmoklasiści"/"Średnia"/"Mediana" entirely rather than leaving them
// visible but pointless. Falls back to the full union when nothing is
// checked yet (first build), and preserves whatever was already
// checked/unchecked for labels that remain available across a rebuild.
function updateDownloadDimensionOptions() {
  const checkedVars = [...document.querySelectorAll("#download-variables input:checked")].map((cb) => cb.value);
  const relevantVars = checkedVars.length ? checkedVars : Object.keys(VARIABLE_META);

  const unionLabelsFor = (dim) => {
    const labels = new Set();
    for (const key of relevantVars) {
      for (const o of VARIABLE_META[key][dim]) labels.add(o.label);
    }
    return [...labels];
  };

  for (const [id, dim] of [["download-level", "levels"], ["download-agegroup", "ageGroups"], ["download-measure", "measures"]]) {
    const container = document.getElementById(id);
    const previouslyChecked = new Set(checkedLabels(id));
    const labels = unionLabelsFor(dim);
    container.innerHTML = labels
      .map((label) => {
        const isChecked = previouslyChecked.size === 0 || previouslyChecked.has(label);
        return `<label class="dim-option"><input type="checkbox" value="${label}" ${isChecked ? "checked" : ""}> ${label}</label>`;
      })
      .join("");
  }
}

function checkedLabels(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((cb) => cb.value);
}

function resolveDimension(variable, dim, chosenKey) {
  const options = VARIABLE_META[variable][dim];
  return options.some((o) => o.key === chosenKey) ? chosenKey : options[0].key;
}

function triggerCsvDownload(rows, filename) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadCsv() {
  const variables = [...document.querySelectorAll(".download-variables input:checked")].map((cb) => cb.value);
  if (variables.length === 0) {
    showError("Wybierz co najmniej jedną zmienną do pobrania.");
    return;
  }
  await Promise.all(variables.map(loadVariable));

  const chosenAgeGroups = checkedLabels("download-agegroup");
  const chosenMeasures = checkedLabels("download-measure");
  const yearFrom = document.getElementById("download-year-from").value;
  const yearTo = document.getElementById("download-year-to").value;

  // A variable exports every checked (age group x measure) combination it
  // actually has; if none of the checked labels apply to it, fall back to
  // its first option so checking e.g. only "Mediana" doesn't silently drop
  // variables that have no median.
  const matching = (options, chosen) => {
    const hits = options.filter((o) => chosen.includes(o.label));
    return hits.length ? hits : [options[0]];
  };

  const rows = [["zmienna", "poziom", "grupa_wieku", "miara", "teryt", "powiat", "rok", "kobiety", "mezczyzni", "ogolem"]];
  for (const variable of variables) {
    const data = loadedData[variable] || {};
    const meta = VARIABLE_META[variable];
    const levelLabel = meta.levels[0].label;
    for (const ageGroupOpt of matching(meta.ageGroups, chosenAgeGroups)) {
      for (const measureOpt of matching(meta.measures, chosenMeasures)) {
        const key = sliceKey(ageGroupOpt.key, measureOpt.key);
        for (const teryt in data) {
          const name = displayName(teryt, terytToName[teryt] || teryt);
          for (const year in data[teryt]) {
            const y = Number(year);
            if (yearFrom && y < Number(yearFrom)) continue;
            if (yearTo && y > Number(yearTo)) continue;
            const d = data[teryt][year][key];
            if (!d) continue;
            rows.push([meta.label, levelLabel, ageGroupOpt.label, measureOpt.label, teryt, name, year, d.k, d.m, d.t]);
          }
        }
      }
    }
  }
  triggerCsvDownload(rows, "dane_mapa.csv");
}

// --- URL state ---
function updateUrl() {
  const params = new URLSearchParams();
  params.set("var", state.variable);
  params.set("view", state.view);
  params.set("year", state.year);
  params.set("level", state.level);
  params.set("agegroup", state.ageGroup);
  params.set("measure", state.measure);
  history.replaceState(null, "", "?" + params.toString());
}
async function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has("var") && VARIABLE_META[params.get("var")]) state.variable = params.get("var");
  // The initial Promise.all in init() only loaded the default variable's
  // data -- if the URL points at a different one, it was never fetched.
  try {
    await loadVariable(state.variable);
  } catch (err) {
    showError("Nie udało się wczytać danych z linku: " + err.message);
    return;
  }

  if (params.has("view") && VIEWS[params.get("view")]) state.view = params.get("view");
  if (params.has("year")) state.year = Number(params.get("year"));
  if (params.has("level")) state.level = resolveDimension(state.variable, "levels", params.get("level"));
  if (params.has("agegroup")) state.ageGroup = resolveDimension(state.variable, "ageGroups", params.get("agegroup"));
  if (params.has("measure")) state.measure = resolveDimension(state.variable, "measures", params.get("measure"));

  // The variable-select's options are topic-filtered -- if the URL points
  // at a variable outside the default topic, its key wouldn't even be a
  // valid <option> yet, and a bare `.value = state.variable` would fail
  // silently. Repopulate for the right topic first.
  const topic = VARIABLE_META[state.variable].topic;
  document.getElementById("topic-select").value = topic;
  populateVariableOptions(topic);
  document.getElementById("variable-select").value = state.variable;
  [...document.querySelectorAll("#view-buttons button")].forEach((b) => {
    b.classList.toggle("active", b.textContent === VIEWS[state.view].label);
  });
}

// --- Correlation tool ---
function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  return num / Math.sqrt(denX * denY);
}

function axisConfig(prefix) {
  return {
    variable: document.getElementById(`corr-${prefix}-var`).value,
    level: document.getElementById(`corr-${prefix}-level`).value,
    ageGroup: document.getElementById(`corr-${prefix}-agegroup`).value,
    measure: document.getElementById(`corr-${prefix}-measure`).value,
    year: document.getElementById(`corr-${prefix}-year`).value,
    sex: document.getElementById(`corr-${prefix}-sex`).value,
    log: document.getElementById(`corr-${prefix}-log`).checked,
  };
}

function axisValue(cfg, teryt) {
  const series = loadedData[cfg.variable] && loadedData[cfg.variable][teryt];
  const yearData = series && series[cfg.year];
  const slice = yearData && yearData[sliceKey(cfg.ageGroup, cfg.measure)];
  if (!slice) return null;
  let v = slice[cfg.sex];
  if (!Number.isFinite(v)) return null;
  if (cfg.log) {
    if (v <= 0) return null; // log10 undefined for non-positive values
    v = Math.log10(v);
  }
  return v;
}

function axisLabel(cfg) {
  const sexLabel = { t: "Ogółem", m: "Mężczyźni", k: "Kobiety" }[cfg.sex];
  const meta = VARIABLE_META[cfg.variable];
  const ageGroupLabel = meta.ageGroups.find((o) => o.key === cfg.ageGroup).label;
  const measureLabel = meta.measures.find((o) => o.key === cfg.measure).label;
  const extra = [ageGroupLabel, measureLabel].filter((l) => l !== "Wartość" && l !== "Ósmoklasiści" && l !== "Wiek produkcyjny");
  const extraStr = extra.length ? ` [${extra.join(", ")}]` : "";
  return `${cfg.log ? "log₁₀ " : ""}${meta.label}${extraStr} (${sexLabel}, ${cfg.year})`;
}

async function runCorrelation() {
  const cfgX = axisConfig("x");
  const cfgY = axisConfig("y");
  await Promise.all([loadVariable(cfgX.variable), loadVariable(cfgY.variable)]);

  const allTeryts = new Set([
    ...Object.keys(loadedData[cfgX.variable] || {}),
    ...Object.keys(loadedData[cfgY.variable] || {}),
  ]);
  const points = [];
  for (const teryt of allTeryts) {
    const x = axisValue(cfgX, teryt);
    const y = axisValue(cfgY, teryt);
    if (x !== null && y !== null) points.push({ x, y, name: displayName(teryt, terytToName[teryt] || teryt) });
  }

  renderScatter(points, axisLabel(cfgX), axisLabel(cfgY), cfgX.log, cfgY.log);
  const coeffEl = document.getElementById("corr-coefficient");
  if (points.length < 2) {
    coeffEl.textContent = "Za mało wspólnych danych dla tej kombinacji, żeby policzyć korelację.";
    return;
  }
  const r = pearson(points.map((p) => p.x), points.map((p) => p.y));
  coeffEl.textContent = `Korelacja Pearsona: r = ${formatPl(r, 3)} (n = ${points.length})`;
}

// Ticks for a linear axis: ~5 evenly spaced steps. For a log10 axis (values
// already log10-transformed upstream), ticks land on integer powers of 10
// within range, labeled with the back-transformed value (10, 100, 1 000...).
function computeTicks(min, max, isLog) {
  if (isLog) {
    const lo = Math.floor(min);
    const hi = Math.ceil(max);
    const ticks = [];
    for (let p = lo; p <= hi; p++) {
      ticks.push({ pos: p, label: formatPl(Math.pow(10, p)) });
    }
    return ticks;
  }
  const steps = 4;
  const ticks = [];
  for (let i = 0; i <= steps; i++) {
    const v = min + ((max - min) * i) / steps;
    ticks.push({ pos: v, label: formatPl(Number(v.toFixed(1))) });
  }
  return ticks;
}

function renderScatter(points, labelX, labelY, isLogX, isLogY) {
  const svg = document.getElementById("corr-svg");
  const W = 520, H = 380, padL = 60, padB = 50, padT = 16, padR = 16;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (v) => padL + ((v - minX) / (maxX - minX || 1)) * (W - padL - padR);
  const sy = (v) => H - padB - ((v - minY) / (maxY - minY || 1)) * (H - padT - padB);

  const dots = points
    .map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="#2a78d6" fill-opacity="0.65"><title>${p.name}: ${formatPl(p.x)}, ${formatPl(p.y)}</title></circle>`)
    .join("");

  const xTicks = computeTicks(minX, maxX, isLogX);
  const yTicks = computeTicks(minY, maxY, isLogY);
  // Tick text/marks use --text-secondary, not --muted -- muted is calibrated
  // for de-emphasized UI chrome, not for numbers someone actually needs to
  // read off a chart. Confirmed by eye in dark mode: --muted (#898781 on
  // both themes) was legible by contrast-ratio math but genuinely hard to
  // read in practice at 9px; --text-secondary is much lighter in dark mode
  // (#c3c2b7) and reads clearly.
  const xTickSvg = xTicks
    .map((t) => {
      const px = sx(t.pos);
      return `<line x1="${px}" y1="${H - padB}" x2="${px}" y2="${H - padB + 4}" stroke="var(--text-secondary)" />
              <text x="${px}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${t.label}</text>`;
    })
    .join("");
  const yTickSvg = yTicks
    .map((t) => {
      const py = sy(t.pos);
      return `<line x1="${padL - 4}" y1="${py}" x2="${padL}" y2="${py}" stroke="var(--text-secondary)" />
              <text x="${padL - 8}" y="${py + 3}" text-anchor="end" font-size="10" fill="var(--text-secondary)">${t.label}</text>`;
    })
    .join("");

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--hairline)" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="var(--hairline)" />
    ${xTickSvg}
    ${yTickSvg}
    <text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--text-secondary)">${labelX}</text>
    <text x="14" y="${(padT + H - padB) / 2}" text-anchor="middle" font-size="11" fill="var(--text-secondary)" transform="rotate(-90 14 ${(padT + H - padB) / 2})">${labelY}</text>
    ${dots}
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("download-btn").addEventListener("click", downloadCsv);
  document.getElementById("corr-run").addEventListener("click", runCorrelation);
  init();
});
