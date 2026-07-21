// Prototype dashboard. Boundaries exist for powiat/gmina/podregion (levels/
// age groups/measures are modeled per-variable in variables.js and the UI
// enables/disables accordingly); each variable's data is only fetched at
// ONE of those levels, so the map swaps its boundary layer whenever the
// selected variable's level differs from what's currently rendered.
const BOUNDARY_FILES = {
  powiat: "data/powiaty.json",
  gmina: "data/gminy.json",
  podregion: "data/podregiony.json",
};

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

const COLOR_SCALES = { linear: "Liniowa (równe przedziały)", log: "Logarytmiczna", quantile: "Kwantyle" };

let state = {
  variable: "unemployment",
  view: "total",
  year: null, // set to the most recent available year once data is loaded (see syncYearSlider)
  level: "powiat",
  ageGroup: "default",
  measure: "default",
  colorScale: "linear",
};

let loadedData = {}; // variable -> {teryt: {year: {"<ageGroup>__<measure>": {t,m,k}}}}
let loadedBoundaries = {}; // level -> GeoJSON, fetched lazily and cached
let currentLevel = null; // level actually rendered on the map right now
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

// Plain fitBounds leaves a lot of empty margin on this layout: the sidebar
// makes the map viewport much wider than Poland's Mercator-projected shape
// (nearly square, since latitude is stretched relative to longitude at this
// latitude), so height is always the binding constraint and there's a lot of
// unused width. There's no way to fill that width without zooming in past
// the tight vertical fit -- any further zoom necessarily crops a bit of the
// north/south extremes. One zoomSnap step in is a deliberately mild version
// of that trade-off (a few percent off the Baltic coast/Tatra tips, verified
// visually), not the aggressive crop a bigger bump would cause.
//
// {animate: false} is required, not a style choice: Leaflet's CSS-transition
// zoom animation doesn't reliably finish in some automated/headless browser
// contexts, silently leaving `_zoom` at its pre-call value forever (found
// while testing this very function -- setView appeared to do nothing at all).
function setDefaultView() {
  // invalidateSize is required, not defensive: Leaflet caches the container
  // size at construction time, and on this layout the sidebar/map are still
  // reflowing when init() runs, so the cached size can be stale (seen for
  // real: fitBounds silently collapsed to a single point). Cheap no-op if
  // the size hadn't actually changed.
  map.invalidateSize();
  const tightZoom = map.getBoundsZoom(POLAND_BOUNDS, false);
  // A fixed minZoom (6, tuned against a wide desktop viewport) turned out to
  // silently clip the map on narrow/tall mobile screens: Poland's tight fit
  // there needs a LOWER zoom (its Mercator shape is roughly square, so a
  // narrow viewport is width-bound), and the fixed floor prevented reaching
  // it, cropping ~20% off the east/west edges by default -- found by testing
  // the mobile viewport directly, not visible on desktop. Deriving minZoom
  // from the actual tight fit keeps a similar "don't zoom out too far" floor
  // on any screen shape without ever fighting the fit itself.
  map.setMinZoom(Math.min(6, tightZoom - 0.5));
  map.setView(POLAND_BOUNDS.getCenter(), tightZoom + map.options.zoomSnap, { animate: false });
}

// Builds the Leaflet layer for one level's boundary GeoJSON and swaps it
// onto the map, replacing whatever was there before. Pulled out of init()
// so switching variables across levels (e.g. powiat unemployment -> gmina
// radni) can rebuild the same layer instead of only ever creating it once.
function renderBoundaries(data) {
  if (geoLayer) map.removeLayer(geoLayer);
  // Fresh per level: a stale teryt from the previous level would either not
  // exist here (search/rankings silently show nothing for it) or, worse,
  // collide with an unrelated region that happens to share the same code.
  terytToLayer = {};
  terytToName = {};
  geoLayer = L.geoJSON(data, {
    style: () => ({ fillOpacity: 0.9, color: "#ffffff", weight: 0.3 }),
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
      layer.bindTooltip("", { className: "region-tooltip", sticky: true });
    },
  }).addTo(map);
}

// Fetches (and caches) a level's boundary GeoJSON without touching the map
// -- used both by ensureLevel below and by init(), which needs the data
// loaded before the map object even exists.
async function loadBoundaries(level) {
  if (!loadedBoundaries[level]) {
    loadedBoundaries[level] = await fetch(BOUNDARY_FILES[level]).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }
  return loadedBoundaries[level];
}

// Loads a level's boundaries and renders them if that level isn't already
// the one on screen. Clears any in-progress search, since its results
// reference layers from whichever level was active before.
async function ensureLevel(level) {
  if (level === currentLevel) return;
  const data = await loadBoundaries(level);
  renderBoundaries(data);
  currentLevel = level;
  document.getElementById("search-input").value = "";
  document.getElementById("search-results").innerHTML = "";
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
    await Promise.all([
      loadBoundaries(VARIABLE_META[state.variable].levels[0].key),
      loadVariable(state.variable),
    ]);
  } catch (err) {
    showError("Nie udało się wczytać danych. Spróbuj odświeżyć stronę. (" + err.message + ")");
    return;
  }
  hideLoading();

  // No basemap tile layer -- a real map service would always show slices of
  // neighboring countries at the viewport edges. Plain background (set in
  // CSS) plus the region polygons is the only way to guarantee nothing but
  // Poland is ever visible.
  // zoomSnap/zoomDelta of 0.1 (instead of Leaflet's default whole-level
  // steps) make the +/- buttons and the initial fit change size gradually --
  // a single "+" click no longer jumps from "fits with margin" to "too big".
  map = L.map("map", {
    zoomControl: true,
    maxBounds: POLAND_BOUNDS.pad(0.08),
    minZoom: 6,
    maxZoom: 10.5,
    zoomSnap: 0.1,
    zoomDelta: 0.1,
    attributionControl: false,
  });
  setDefaultView();
  attributionControl = L.control.attribution({ prefix: false }).addTo(map);
  attributionControl.addAttribution('Mapa: <a href="https://mapa.michalgulczynski.pl">Michał Gulczyński</a>');
  updateMapAttribution();

  const ResetViewControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: () => {
      const btn = L.DomUtil.create("button", "leaflet-bar map-reset-btn");
      btn.type = "button";
      btn.title = "Przywróć domyślny widok";
      btn.textContent = "100%";
      L.DomEvent.disableClickPropagation(btn);
      btn.addEventListener("click", setDefaultView);
      return btn;
    },
  });
  map.addControl(new ResetViewControl());

  renderBoundaries(loadedBoundaries[VARIABLE_META[state.variable].levels[0].key]);
  currentLevel = VARIABLE_META[state.variable].levels[0].key;

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
  buildScaleButtons();
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
  // Most variables' second dimension really is an age group, but a few
  // (e.g. PKD economic section) use the same {key,label} list shape for
  // something else entirely -- agegroupLabel lets those override the
  // sidebar's label instead of showing "Grupa wieku" next to a list of
  // industry sections.
  document.getElementById("agegroup-label").textContent = meta.agegroupLabel || "Grupa wieku";
  state.level = populateDimensionSelect(document.getElementById("level-select"), meta.levels, state.level);
  state.ageGroup = populateDimensionSelect(document.getElementById("agegroup-select"), meta.ageGroups, state.ageGroup);
  state.measure = populateDimensionSelect(document.getElementById("measure-select"), meta.measures, state.measure);

  document.getElementById("level-select").onchange = (e) => { state.level = e.target.value; updateAll(); };
  // ageGroup/measure changing can change which years actually have data for
  // this specific slice (not just which years the variable has ANY data
  // for) -- resync the slider so it can never land on a year that's empty
  // for the newly chosen combination.
  document.getElementById("agegroup-select").onchange = (e) => { state.ageGroup = e.target.value; syncYearSlider(); updateViewAvailability(); updateAll(); };
  document.getElementById("measure-select").onchange = (e) => { state.measure = e.target.value; syncYearSlider(); updateViewAvailability(); updateAll(); };
}

// ageGroup/measure are optional: pass them to restrict to years where that
// EXACT slice has data, not just any slice of the variable. Needed because
// a variable's ageGroup/measure combinations aren't guaranteed to all cover
// the same years (none currently diverge, but nothing enforces that they
// can't -- e.g. a newly-added age threshold could start later than others).
function availableYears(variable, ageGroup, measure) {
  const data = loadedData[variable] || {};
  const key = ageGroup !== undefined && measure !== undefined ? sliceKey(ageGroup, measure) : null;
  const years = new Set();
  for (const teryt in data) {
    for (const year in data[teryt]) {
      if (key === null || data[teryt][year][key]) years.add(year);
    }
  }
  return [...years].sort();
}

// Years restricted to this axis's CURRENT ageGroup+measure slice, same
// reasoning as the map's own syncYearSlider -- a year with no data for
// this exact combination shouldn't be pickable at all.
function refreshCorrYears(prefix) {
  const variable = document.getElementById(`corr-${prefix}-var`).value;
  if (!variable) return;
  const ageGroup = document.getElementById(`corr-${prefix}-agegroup`).value;
  const measure = document.getElementById(`corr-${prefix}-measure`).value;
  const years = availableYears(variable, ageGroup, measure);
  const yearSelect = document.getElementById(`corr-${prefix}-year`);
  yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = years[years.length - 1];
}

// "Widok" mirrors the map's own view buttons (Kobiety/Mężczyźni/Ogółem/
// Różnica/Proporcja/% udziału) instead of a bare Ogółem/M/K triad -- lets
// the correlation tool compare e.g. one variable's K/M gap against another
// variable's raw rate. Gated the same way the map gates its view buttons:
// Ogółem only where this ageGroup+measure actually has a combined value,
// shares only for count-type variables. Rebuilt whenever variable/ageGroup/
// measure changes for this axis, since hasTotal can vary within one
// variable (e.g. E8 mean vs median).
function populateCorrViewOptions(prefix) {
  const variable = document.getElementById(`corr-${prefix}-var`).value;
  if (!variable) return;
  const meta = VARIABLE_META[variable];
  const ageGroup = document.getElementById(`corr-${prefix}-agegroup`).value;
  const measure = document.getElementById(`corr-${prefix}-measure`).value;
  const totalOk = hasTotalFor(meta, ageGroup, measure);
  const sharesOk = meta.sharesMeaningful === true;

  const keys = Object.keys(VIEWS).filter((key) => {
    if (key === "total") return totalOk;
    if (key === "shareWomen" || key === "shareMen") return sharesOk;
    return true;
  });

  const select = document.getElementById(`corr-${prefix}-view`);
  const keep = keys.includes(select.value) ? select.value : "women";
  select.innerHTML = keys.map((k) => `<option value="${k}">${VIEWS[k].label}</option>`).join("");
  select.value = keep;
}

async function populateCorrDimensions(prefix) {
  const variable = document.getElementById(`corr-${prefix}-var`).value;
  if (!variable) return; // this axis's current Temat has no variable compatible with corrLevel
  await loadVariable(variable);
  const meta = VARIABLE_META[variable];
  populateDimensionSelect(document.getElementById(`corr-${prefix}-level`), meta.levels, meta.levels[0].key);
  populateDimensionSelect(document.getElementById(`corr-${prefix}-agegroup`), meta.ageGroups, meta.ageGroups[0].key);
  populateDimensionSelect(document.getElementById(`corr-${prefix}-measure`), meta.measures, meta.measures[0].key);
  refreshCorrYears(prefix);
  populateCorrViewOptions(prefix);
}

function levelOf(variableKey) {
  return VARIABLE_META[variableKey].levels[0].key;
}

// Both correlation axes must share a level: two variables from different
// levels can never actually correlate (a 4-digit powiat TERYT and a
// 7-digit gmina TERYT are never equal strings), which used to fail
// silently at runtime as "too little data" with no indication why.
// corrLevel locks to whichever axis's variable was picked most recently.
//
// Temat dropdowns always list every topic, on both axes, unconditionally --
// only the Zmienna list within a topic is filtered to corrLevel. Trying to
// also hide/filter Temat itself created a real bug: whichever axis wasn't
// just edited could get its Temat options silently narrowed, so the next
// time THAT axis was used as the "driver" it would still be filtered by a
// stale corrLevel and could crash picking an option that no longer existed
// for it. A plain empty Zmienna list (still connected to a full Temat list)
// is a simpler, honestly-empty state instead: it says "nothing in this
// topic matches the other axis right now" without ever removing choices
// the user might come back to.
let corrLevel = null;

function corrVariablesFor(topic) {
  return Object.keys(VARIABLE_META).filter(
    (k) => VARIABLE_META[k].topic === topic && (corrLevel === null || levelOf(k) === corrLevel)
  );
}

// Rebuilds one axis's Zmienna list for its CURRENT Temat, filtered to
// corrLevel. Returns whether anything was available, so callers can skip
// locking onto an empty selection instead of crashing on it.
function refreshCorrVariableOptions(prefix) {
  const topic = document.getElementById(`corr-${prefix}-topic`).value;
  const varSelect = document.getElementById(`corr-${prefix}-var`);
  const vars = corrVariablesFor(topic);
  const keep = vars.includes(varSelect.value) ? varSelect.value : vars[0];
  varSelect.innerHTML = vars.map((k) => `<option value="${k}">${VARIABLE_META[k].label}</option>`).join("");
  if (vars.length > 0) varSelect.value = keep;
  return vars.length > 0;
}

// Landing point for "this axis's variable is now settled" -- whether that
// came from picking a Zmienna directly or picking a Temat (which reseeds
// Zmienna to that topic's first compatible option). Locks corrLevel to
// match, then re-filters the OTHER axis's Zmienna list so the pair can
// never end up on two different levels.
async function handleCorrVariableChange(prefix) {
  const value = document.getElementById(`corr-${prefix}-var`).value;
  if (!value) return; // this axis's current topic has no compatible variable -- nothing to lock onto
  corrLevel = levelOf(value);
  refreshCorrVariableOptions(prefix === "x" ? "y" : "x");
  await Promise.all([populateCorrDimensions("x"), populateCorrDimensions("y")]);
}

async function buildCorrelationSelectors() {
  const allTopics = topicsInUse();
  for (const prefix of ["x", "y"]) {
    const topicSelect = document.getElementById(`corr-${prefix}-topic`);
    topicSelect.innerHTML = allTopics.map((t) => `<option value="${t}">${TOPICS[t]}</option>`).join("");
    topicSelect.addEventListener("change", () => {
      if (refreshCorrVariableOptions(prefix)) handleCorrVariableChange(prefix);
    });
    document.getElementById(`corr-${prefix}-var`).addEventListener("change", () => handleCorrVariableChange(prefix));
    document.getElementById(`corr-${prefix}-agegroup`).addEventListener("change", () => { refreshCorrYears(prefix); populateCorrViewOptions(prefix); });
    document.getElementById(`corr-${prefix}-measure`).addEventListener("change", () => { refreshCorrYears(prefix); populateCorrViewOptions(prefix); });
  }

  // Seed X freely (first topic/variable overall, with corrLevel still
  // null so nothing is filtered yet), which locks corrLevel; then seed Y
  // constrained to that level, preferring its LAST topic and LAST
  // compatible variable in it so the pair starts on two different
  // variables rather than comparing one against itself. If Y's default
  // topic (last overall) happens to have no compatible variable, fall
  // back to X's own topic, which is guaranteed non-empty.
  const xTopic = allTopics[0];
  document.getElementById("corr-x-topic").value = xTopic;
  refreshCorrVariableOptions("x");
  corrLevel = levelOf(document.getElementById("corr-x-var").value);

  const yTopic = allTopics[allTopics.length - 1];
  document.getElementById("corr-y-topic").value = yTopic;
  if (!refreshCorrVariableOptions("y")) {
    document.getElementById("corr-y-topic").value = xTopic;
    refreshCorrVariableOptions("y");
  }
  const yVarSelect = document.getElementById("corr-y-var");
  const yVars = [...yVarSelect.options].map((o) => o.value);
  yVarSelect.value = yVars[yVars.length - 1];

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

// Most variables scale their color domain to ONLY the currently-shown
// year -- e.g. unemployment's map highlights that year's relative spread
// among powiats, which is the point (2003's rates were structurally
// different from 2025's). Life expectancy is the opposite case: it barely
// moves year to year, and rescaling the palette to each year's narrow
// slice would make small noise look dramatic while making the same color
// mean a different value depending which year happens to be selected.
// fixedScaleAcrossYears opts a variable out of the per-year default,
// pooling every available year (for the current sex/ageGroup/measure) into
// one domain instead, so scrubbing the year slider recolors polygons
// without ever renormalizing the scale itself.
function currentDomain() {
  const values = [];
  const data = loadedData[state.variable] || {};
  if (VARIABLE_META[state.variable].fixedScaleAcrossYears) {
    for (const teryt in data) {
      for (const year in data[teryt]) {
        const v = valueFor(state.variable, teryt, year, state.ageGroup, state.measure);
        if (v !== null) values.push(v);
      }
    }
    return values;
  }
  for (const teryt in data) {
    const v = mapValueFor(teryt);
    if (v !== null) values.push(v);
  }
  return values;
}

// Linear interpolation between the two nearest ranks -- the standard
// "quantile" estimator (same one R's type-7 / numpy's default use).
function quantile(sortedAsc, p) {
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// Sequential, "linear" mode (default): plain equal-WIDTH bins between min
// and max. Simple and intuitive, but a few extreme outliers stretch the
// whole range and crowd everyone else into one or two buckets -- that's what
// the quantile and log modes below exist to fix.
function linearBoundariesSequential(domain, n) {
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  return Array.from({ length: n + 1 }, (_, i) => min + (i / n) * (max - min));
}

// Sequential, "quantile" mode: boundaries sit at the i/n percentile of the
// actual data, so each bucket gets roughly equal COUNT of powiats regardless
// of how the raw values are distributed. This is what fixes variables with a
// few extreme outliers (e.g. a couple of counties with a huge wage gap): the
// bulk of ordinary counties still gets spread across the full color range
// instead of piling into one bucket.
function quantileBoundariesSequential(domain, n) {
  const sorted = [...domain].sort((a, b) => a - b);
  return Array.from({ length: n + 1 }, (_, i) => quantile(sorted, i / n));
}

// Sequential, "log" mode: equal-WIDTH buckets in log space, i.e. equal
// RATIO per bucket rather than equal count. Values <= 0 have no logarithm --
// clamped to a tiny positive epsilon so they still land in the lowest
// bucket instead of breaking the scale.
function logBoundariesSequential(domain, n) {
  const safe = (v) => Math.max(v, 1e-6);
  const positive = domain.filter((v) => v > 0);
  const base = (positive.length ? positive : domain).map(safe);
  const lnMin = Math.log(Math.min(...base));
  const lnMax = Math.log(Math.max(...base));
  return Array.from({ length: n + 1 }, (_, i) => Math.exp(lnMin + (i / n) * (lnMax - lnMin)));
}

// Diverging, "linear" mode (default): a single symmetric spread around
// center, sized by whichever value is furthest from it. One extreme outlier
// on either side stretches the whole scale and crowds everyone else into the
// pale near-center buckets -- e.g. it's what made the wage-gap "Różnica"
// view look almost entirely white (88% of counties landed in one bucket).
function linearBoundariesDiverging(domain, view, n) {
  const center = view.center ?? 0;
  const spread = Math.max(...domain.map((v) => Math.abs(v - center)), 1e-9);
  const tBoundaries = Array.from({ length: n + 1 }, (_, i) => -1 + (i * 2) / n);
  return tBoundaries.map((t) => center + t * spread);
}

// Diverging, "quantile" mode: each arm (below/above center) gets its own
// quantile boundaries, computed independently from that arm's own
// distribution. Unlike linear mode's single global "biggest distance from
// center" spread, one extreme outlier on one side no longer stretches every
// other county (on either side) into the pale near-center buckets.
function quantileBoundariesDiverging(domain, view, n) {
  const center = view.center ?? 0;
  const half = (n + 1) / 2; // n is always odd (a diverging palette needs a true center bucket)
  const below = domain.filter((v) => v < center).map((v) => center - v).sort((a, b) => a - b);
  const above = domain.filter((v) => v >= center).map((v) => v - center).sort((a, b) => a - b);
  const sideDistances = (dists) =>
    dists.length === 0
      ? Array.from({ length: half }, () => 0)
      : Array.from({ length: half }, (_, j) => quantile(dists, (j + 1) / half));

  const left = sideDistances(below).reverse().map((d) => center - d); // ascending: center-maxDist .. center-minDist
  const right = sideDistances(above).map((d) => center + d); // ascending: center+minDist .. center+maxDist
  return [...left, ...right];
}

// Diverging, "log" mode: ratio-style views (center > 0, e.g. K/M) keep the
// original multiplicative symmetry -- 2x and 0.5x land equally far from
// center, which only holds in log space. Difference-style views (center =
// 0) use a "symlog" transform (sign-preserving log1p of the distance from
// center) instead of a plain log, since a plain log is undefined at/below
// zero and a raw difference can be zero or negative.
function logBoundariesDiverging(domain, view, n) {
  const center = view.center ?? 0;
  const tBoundaries = Array.from({ length: n + 1 }, (_, i) => -1 + (i * 2) / n);
  if (view.logScale) {
    const logCenter = Math.log(center);
    const logSpread = Math.max(...domain.map((v) => Math.abs(Math.log(v) - logCenter)), 1e-9);
    return tBoundaries.map((t) => Math.exp(logCenter + t * logSpread));
  }
  const symlog = (v) => Math.sign(v - center) * Math.log1p(Math.abs(v - center));
  const invSymlog = (t) => center + Math.sign(t) * Math.expm1(Math.abs(t));
  const spread = Math.max(...domain.map((v) => Math.abs(symlog(v))), 1e-9);
  return tBoundaries.map((t) => invSymlog(t * spread));
}

// The N+1 boundary values (original data units) between the N color
// buckets -- shared by colorFor (to assign a color) and updateLegend (to
// label exactly where each color starts/ends), so the two can never drift
// apart the way they briefly did for the ratio view.
function colorBoundaries(domain, view, steps) {
  const n = steps.length;
  if (view.kind === "sequential") {
    if (state.colorScale === "log") return logBoundariesSequential(domain, n);
    if (state.colorScale === "quantile") return quantileBoundariesSequential(domain, n);
    return linearBoundariesSequential(domain, n);
  }
  if (state.colorScale === "log") return logBoundariesDiverging(domain, view, n);
  if (state.colorScale === "quantile") return quantileBoundariesDiverging(domain, view, n);
  return linearBoundariesDiverging(domain, view, n);
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
  return { fillColor: colorFor(value, domain), fillOpacity: 0.9, color: "#ffffff", weight: 0.3 };
}

// Polish locale throughout the UI: comma decimal separator, space thousands
// (e.g. "1,5" not "1.5"; "10 000" not "10,000") -- EXCEPT at four digits and
// above, where both the separator and decimals are dropped ("10000" not
// "10 000,0"): a space-grouped decimal reads as cluttered at that magnitude
// (wages, headcounts) and the extra precision isn't meaningful there. Never
// used for the CSV export, which stays machine-readable with plain "." decimals.
function formatPl(n, maxFractionDigits) {
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString("pl-PL", { maximumFractionDigits: 0, useGrouping: false });
  }
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
  const meta = VARIABLE_META[requested];
  try {
    // loadBoundaries only fetches+caches -- it doesn't touch the map, so it's
    // safe to run even if this call ends up superseded. Only actually
    // switching the rendered layer (below) needs the seq guard.
    await Promise.all([loadVariable(requested), loadBoundaries(meta.levels[0].key)]);
  } catch (err) {
    if (seq !== variableRequestSeq) return; // superseded by a newer selection
    showError("Nie udało się wczytać danych: " + err.message);
    return;
  }
  if (seq !== variableRequestSeq) return; // superseded by a newer selection
  // Switch the map's boundary layer only if this variable actually needs a
  // different level -- guarded by seq too, so a slower, now-stale call can
  // never clobber a newer call's already-rendered level.
  if (meta.levels[0].key !== currentLevel) {
    renderBoundaries(loadedBoundaries[meta.levels[0].key]);
    currentLevel = meta.levels[0].key;
    document.getElementById("search-input").value = "";
    document.getElementById("search-results").innerHTML = "";
  }
  state.variable = requested;
  hideLoading();
  // Reset to the new variable's default dimensions rather than keeping
  // stale keys from the previous variable that might not exist here.
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
//
// The track spans literal min..max, not one evenly-spaced step per year, so
// a gap between available years (e.g. a series that resumes after a break:
// ...2014, 2018, 2024) takes proportionally more of the track than a
// one-year gap -- see buildYearSlider's 'input' handler, which snaps
// wherever the thumb gets dragged onto the nearest ACTUAL year.
function syncYearSlider() {
  const years = availableYears(state.variable, state.ageGroup, state.measure).map(Number);
  if (years.length === 0) return;
  const slider = document.getElementById("year-slider");
  if (state.year === null || !years.includes(state.year)) {
    state.year = Math.max(...years);
  }
  if (years.length === 1) {
    // min/max/value all equal would leave the native thumb position
    // browser-dependent -- give the track real span and park the value
    // dead center instead, for a consistent, obviously-disabled look.
    slider.min = 0;
    slider.max = 2;
    slider.value = 1;
  } else {
    slider.min = Math.min(...years);
    slider.max = Math.max(...years);
    slider.step = "any";
    slider.value = state.year;
  }
  slider.disabled = years.length <= 1;
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

function buildScaleButtons() {
  const container = document.getElementById("scale-buttons");
  container.innerHTML = "";
  for (const key in COLOR_SCALES) {
    const btn = document.createElement("button");
    btn.textContent = COLOR_SCALES[key];
    btn.className = key === state.colorScale ? "active" : "";
    btn.addEventListener("click", () => {
      state.colorScale = key;
      [...container.children].forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateAll();
    });
    container.appendChild(btn);
  }
}

// "Ogółem" reads d.t, which is deliberately null for combinations where a
// combined-group total/median can't be correctly derived (E8's median
// measure, labor force's 15-24 age group -- see hasTotal in variables.js).
// Selecting it there silently shows "no data" everywhere with no obvious
// cause, so disable the button and steer away from it instead.
// Pulled out as a pure function (not just reading `state`) so the
// correlation tool can ask the same question per-axis, independent of
// whatever's currently on the map.
function hasTotalFor(meta, ageGroup, measure) {
  const ageGroupOpt = meta.ageGroups.find((o) => o.key === ageGroup);
  const measureOpt = meta.measures.find((o) => o.key === measure);
  return (ageGroupOpt?.hasTotal ?? true) && (measureOpt?.hasTotal ?? true);
}

function hasTotalForCurrentSelection() {
  return hasTotalFor(VARIABLE_META[state.variable], state.ageGroup, state.measure);
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
    const years = availableYears(state.variable, state.ageGroup, state.measure).map(Number);
    const raw = Number(slider.value);
    const nearest = years.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    state.year = nearest;
    slider.value = nearest; // snap the visible thumb, not just the stored state
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
  params.set("scale", state.colorScale);
  history.replaceState(null, "", "?" + params.toString());
}
async function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has("var") && VARIABLE_META[params.get("var")]) state.variable = params.get("var");
  // The initial Promise.all in init() only loaded the default variable's
  // data (and its boundary level) -- if the URL points at a different
  // variable, both its data and (possibly) a different boundary level were
  // never fetched.
  try {
    await Promise.all([
      loadVariable(state.variable),
      ensureLevel(VARIABLE_META[state.variable].levels[0].key),
    ]);
  } catch (err) {
    showError("Nie udało się wczytać danych z linku: " + err.message);
    return;
  }

  if (params.has("view") && VIEWS[params.get("view")]) state.view = params.get("view");
  if (params.has("year")) state.year = Number(params.get("year"));
  if (params.has("level")) state.level = resolveDimension(state.variable, "levels", params.get("level"));
  if (params.has("agegroup")) state.ageGroup = resolveDimension(state.variable, "ageGroups", params.get("agegroup"));
  if (params.has("measure")) state.measure = resolveDimension(state.variable, "measures", params.get("measure"));
  if (params.has("scale") && COLOR_SCALES[params.get("scale")]) state.colorScale = params.get("scale");

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
    view: document.getElementById(`corr-${prefix}-view`).value,
    log: document.getElementById(`corr-${prefix}-log`).checked,
  };
}

// Reuses the map's own VIEWS.pick() -- so "Widok" here offers exactly what
// the map's view buttons offer (Kobiety/Mężczyźni/Ogółem plus the
// inequality views: Różnica, Proporcja, % udziału), not just a raw sex.
function axisValue(cfg, teryt) {
  const series = loadedData[cfg.variable] && loadedData[cfg.variable][teryt];
  const yearData = series && series[cfg.year];
  const slice = yearData && yearData[sliceKey(cfg.ageGroup, cfg.measure)];
  if (!slice) return null;
  let v = VIEWS[cfg.view].pick(slice);
  if (!Number.isFinite(v)) return null;
  if (cfg.log) {
    if (v <= 0) return null; // log10 undefined for non-positive values
    v = Math.log10(v);
  }
  return v;
}

function axisLabel(cfg) {
  const viewLabel = VIEWS[cfg.view].label;
  const meta = VARIABLE_META[cfg.variable];
  const ageGroupLabel = meta.ageGroups.find((o) => o.key === cfg.ageGroup).label;
  const measureLabel = meta.measures.find((o) => o.key === cfg.measure).label;
  const extra = [ageGroupLabel, measureLabel].filter((l) => l !== "Wartość" && l !== "Ósmoklasiści" && l !== "Wiek produkcyjny");
  const extraStr = extra.length ? ` [${extra.join(", ")}]` : "";
  return `${cfg.log ? "log₁₀ " : ""}${meta.label}${extraStr} (${viewLabel}, ${cfg.year})`;
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
