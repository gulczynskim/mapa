// Prototype dashboard. Boundaries exist for powiat/gmina/podregion (levels/
// age groups/measures are modeled per-variable in variables.js and the UI
// enables/disables accordingly); each variable's data is only fetched at
// ONE of those levels, so the map swaps its boundary layer whenever the
// selected variable's level differs from what's currently rendered.
const BOUNDARY_FILES = {
  powiat: "data/powiaty.json",
  gmina: "data/gminy.json",
  podregion: "data/podregiony.json",
  wojewodztwo: "data/wojewodztwa.json",
};

// 8 buckets for magnitude views (per user request for finer resolution than
// the earlier 6) -- evenly spaced steps from the validated blue ramp.
// Kept as the "Mężczyźni" hue -- see SEQUENTIAL_STEPS_RED below, its "Kobiety"
// counterpart. Same blue/red pair as the diverging scale's two poles, so a
// county's color means the same sex whether you're looking at a sequential
// or a diverging view.
const SEQUENTIAL_STEPS_BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#1c5cab", "#184f95", "#0d366b"];
// Built the same way the diverging red pole already was (color-mix in oklch
// from the same #e34948 anchor) rather than hand-picked hex, so it's the
// same hue family as DIVERGING_STEPS' red end -- "more women = darker red"
// reads as the same red whether the view is Kobiety or Proporcja/Różnica.
const SEQUENTIAL_STEPS_RED = [
  "color-mix(in oklch, #e34948 10%, #ffffff)",
  "color-mix(in oklch, #e34948 25%, #ffffff)",
  "color-mix(in oklch, #e34948 40%, #ffffff)",
  "color-mix(in oklch, #e34948 58%, #ffffff)",
  "color-mix(in oklch, #e34948 75%, #ffffff)",
  "color-mix(in oklch, #e34948 90%, #ffffff)",
  "#e34948",
  "color-mix(in oklch, #e34948 82%, #000000)",
];
// "Ogółem" isn't sex-specific, so it deliberately does NOT use either the
// red or blue hue -- reusing one of those would visually claim the map is
// about one sex when it's the combined total.
const SEQUENTIAL_STEPS_NEUTRAL = ["#e4e2da", "#cac7ba", "#b1ad9c", "#98937e", "#7c775f", "#645f49", "#4c4834", "#332f1f"];
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
// Region borders -- grey rather than white so they stay visible even where
// the fill itself is white (the diverging palette's own center color, see
// DIVERGING_STEPS above) or MISSING_COLOR's own pale grey-beige. Used for
// every rendered boundary layer AND the exported PNG/SVG's polygon stroke,
// so the two stay visually consistent.
const BORDER_COLOR = "#9a9a9a";

// "Różnica" = kobiety - mężczyźni. Kept as a fixed, mechanical convention --
// NOT a built-in judgment about which sex is disadvantaged, since that
// depends on the variable (e.g. higher female unemployment is a disadvantage,
// but a higher female share of liceum graduates isn't inherently one).
// Each view optionally overrides "unit" (falls back to the variable's own
// unit, e.g. "%") and "decimals" (display precision) -- lets ratio/share
// views render sensibly (2 decimals, no unit for a bare ratio; 1 decimal
// with a hardcoded "%" for a share) without scattering view-specific
// checks through the formatting code.
// sexColor picks which sequential ramp a view renders with (see
// SEQUENTIAL_STEPS_RED/BLUE/NEUTRAL above) -- "k" is always red, "m" is
// always blue, regardless of variable, so the same hue always means the
// same sex across every variable on the site. Diverging views encode both
// sexes in one scale instead (see reverseDiverging below).
// null (missing data) silently coerces to 0 in JS arithmetic (null - 5 ===
// -5, null / 5 === 0, 5 / null === Infinity) -- every view below that
// combines k and m has to guard against that explicitly, or a county
// missing just ONE of the two would render (and feed the color domain and
// legend) as if the missing side were a real zero instead of "brak danych".
function bothOrNull(a, b, fn) {
  return a === null || b === null ? null : fn(a, b);
}

const VIEWS = {
  women: { label: "Kobiety", kind: "sequential", pick: (d) => d.k, decimals: 1, sexColor: "k" },
  men: { label: "Mężczyźni", kind: "sequential", pick: (d) => d.m, decimals: 1, sexColor: "m" },
  total: { label: "Ogółem", kind: "sequential", pick: (d) => d.t, decimals: 1 },
  diff: { label: "Różnica (K - M)", kind: "diverging", pick: (d) => bothOrNull(d.k, d.m, (k, m) => k - m), center: 0, decimals: 1 },
  // logScale: a ratio can never go negative, and 2x / 0.5x are equally far
  // from "equal" multiplicatively -- linear spread around center=1 would
  // let the color scale (and any tick derived from it) drift negative,
  // which is meaningless for a ratio. Symmetrize in log space instead.
  ratio: { label: "Proporcja (K / M)", kind: "diverging", pick: (d) => bothOrNull(d.k, d.m, (k, m) => k / m), center: 1, logScale: true, decimals: 2, unit: "" },
  // reverseDiverging: DIVERGING_STEPS always runs blue(low)->red(high) by
  // raw position. That's correct for "diff" (K-M > 0 means more women =
  // red, natural ordering) and "ratio" (K/M > 1 also means more women =
  // red), but M/K > 1 means more MEN -- which should be blue, not red. Flip
  // which end of the ramp gets used so a county where men dominate is
  // always blue here too, never red just because the raw ratio is "high".
  ratioInverse: { label: "Proporcja (M / K)", kind: "diverging", pick: (d) => bothOrNull(d.m, d.k, (m, k) => m / k), center: 1, logScale: true, decimals: 2, unit: "", reverseDiverging: true },
  // Useful for compositional data (e.g. share of women among elected
  // officials or students) where the natural "total" is a headcount, not a
  // percentage -- these compute the share directly from k/m regardless of
  // what the variable's own unit is.
  shareWomen: { label: "% kobiet", kind: "sequential", pick: (d) => bothOrNull(d.k, d.m, (k, m) => (k / (k + m)) * 100), decimals: 1, unit: "%", sexColor: "k" },
  shareMen: { label: "% mężczyzn", kind: "sequential", pick: (d) => bothOrNull(d.m, d.k, (m, k) => (m / (m + k)) * 100), decimals: 1, unit: "%", sexColor: "m" },
};

const POLAND_BOUNDS = L.latLngBounds([48.9, 13.8], [55.0, 24.2]);

const COLOR_SCALES = { linear: "Liniowa (równe przedziały)", log: "Logarytmiczna", quantile: "Kwantyle" };
// "year": domain from the currently-shown year only. "all": domain pooled
// across every year (for the current variable/level/ageGroup/measure/view),
// so scrubbing the year slider recolors polygons without renormalizing the
// scale itself -- see currentDomain() below for when each reads better.
const SCALE_SCOPES = { year: "Dla danego roku", all: "Wspólna dla wszystkich lat" };

let state = {
  variable: "e8_matematyka",
  view: "diff",
  year: null, // set to the most recent available year once data is loaded (see syncYearSlider)
  level: "powiat",
  ageGroup: "default",
  measure: "mean",
  colorScale: "linear",
  colorScaleScope: "year",
};

// Every variable defaults to showing the gender GAP (Różnica K-M) first
// rather than a raw total -- that's the map's whole reason for existing.
// Polityka is the one exception: for political representation specifically,
// "% kobiet" (the share of women among officials/candidates) is a more
// immediately legible starting point than a raw headcount difference.
function defaultView(variable) {
  if (VARIABLE_META[variable].sexScope === "women") return "women";
  return VARIABLE_META[variable].topic === "polityka" ? "shareWomen" : "diff";
}

// The color scale domain is always established within the current variable
// + level + ageGroup + measure + view (e.g. men's life expectancy at birth
// never shares a scale with men's at 60, or with women's, or with the
// difference view -- currentDomain()/valueFor() already key on all of
// those). colorScaleScope only controls a further axis on top of that: does
// the domain also pool across every year, or just the one currently shown.
// Defaults per variable via fixedScaleAcrossYears (see currentDomain), but
// stays user-overridable via the Zakres skali buttons.
function defaultColorScaleScope(variable) {
  return VARIABLE_META[variable].fixedScaleAcrossYears ? "all" : "year";
}

let loadedData = {}; // variable -> {teryt: {year: {"<ageGroup>__<measure>": {t,m,k}}}}
let loadedBoundaries = {}; // level -> GeoJSON, fetched lazily and cached
let currentLevel = null; // level actually rendered on the map right now
let geoLayer = null;
let map = null;
let attributionControl = null;
let currentSourceAttribution = null;
let terytToLayer = {};
let terytToName = {};
let nameCounts = {}; // name -> how many teryts share it, precomputed per level (see renderBoundaries)
let lastDomain = [];

// Gmina-only (see applyGminaHistoricalOverrides): the only two gmina splits
// in the site's data range (both 2025-01-01) need their pre-split shape
// restored for earlier years, or the newer piece renders as a "no data"
// hole even though its area's value is already correctly included in the
// parent's historical figure. gminyOverrides is fetched lazily (tiny file,
// only ever needed at gmina level) and cached; appliedGminaOverrides tracks
// which ones are CURRENTLY swapped in, so repeated updateAll() calls (e.g.
// every year-slider tick) only touch layers when the state actually flips.
let gminyOverrides = null;
let appliedGminaOverrides = {}; // parentTeryt -> {originalParentLayer, hiddenChildLayers: {teryt: layer}}

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

// This used to call map.setView(POLAND_BOUNDS.getCenter(), tightZoom) by
// hand instead of plain fitBounds, to trim the empty side margin fitBounds
// leaves (the sidebar makes the map viewport wider than Poland's Mercator-
// projected shape, so height is normally the binding constraint and width
// has a lot of unused space; an extra zoomSnap step of zoom used to trade
// away a few percent of the Baltic coast/Tatra tips to fill more of that
// width). Both of those hand-rolled pieces were removed 2026-07-24 because
// together they cropped the very top of Poland off-screen in some browsers:
// (a) the extra zoom step alone already ate into the margin fitBounds relies
// on, and (b) LatLngBounds.getCenter() averages raw lat/lng, which is NOT
// the vertical center of the bounds' actual Mercator-PROJECTED shape (a
// degree of latitude covers more projected pixels the further north it is,
// so the naive lat/lng average sits measurably south of the true center --
// confirmed live: ~19km/0.06 deg south for POLAND_BOUNDS). Centering the
// view there meant the window showed extra empty margin below the south
// coast while running short of the north edge, even at an otherwise-correct
// zoom. Plain fitBounds computes the center from the projection, not raw
// lat/lng, so it doesn't have this problem.
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
  map.fitBounds(POLAND_BOUNDS, { animate: false });
}

// Builds the Leaflet layer for one level's boundary GeoJSON and swaps it
// onto the map, replacing whatever was there before. Pulled out of init()
// so switching variables across levels (e.g. powiat unemployment -> gmina
// radni) can rebuild the same layer instead of only ever creating it once.
// Shared by renderBoundaries' onEachFeature below and by
// applyGminaHistoricalOverrides, which swaps individual layers in/out of an
// already-rendered level rather than rebuilding it -- both need the exact
// same registration/hover/tooltip wiring so a swapped-in override layer
// behaves identically to a normal one.
function bindFeatureLayer(teryt, name, layer) {
  terytToLayer[teryt] = layer;
  terytToName[teryt] = name;
  layer.on({
    // Tooltip content is built lazily here, on actual hover, not for
    // every layer on every updateAll() -- at gmina scale (2479 layers)
    // eagerly rebuilding every tooltip's HTML on every year-slider tick
    // was a real, measured cost for something almost never shown.
    mouseover: (e) => {
      highlight(e.target);
      setTooltipContent(e.target, teryt, name);
    },
    // Explicit closeTooltip: with sticky tooltips some browsers/embedded
    // views don't reliably deliver the internal event Leaflet uses to
    // hide them, leaving the box stuck on screen after the cursor leaves.
    mouseout: (e) => {
      e.target.setStyle(baseStyleFor(mapValueFor(teryt), lastDomain));
      e.target.closeTooltip();
    },
  });
  layer.bindTooltip("", { className: "region-tooltip", sticky: true });
}

function renderBoundaries(data) {
  if (geoLayer) map.removeLayer(geoLayer);
  // Fresh per level: a stale teryt from the previous level would either not
  // exist here (search/rankings silently show nothing for it) or, worse,
  // collide with an unrelated region that happens to share the same code.
  terytToLayer = {};
  terytToName = {};
  appliedGminaOverrides = {};
  geoLayer = L.geoJSON(data, {
    style: () => ({ fillOpacity: 0.9, color: BORDER_COLOR, weight: 0.3 }),
    onEachFeature: (feature, layer) =>
      bindFeatureLayer(feature.properties.JPT_KOD_JE, feature.properties.JPT_NAZWA_, layer),
  }).addTo(map);

  // Precomputed once per level instead of inside displayName() -- that used
  // to re-scan every single name for every single layer it was asked about,
  // an O(n^2) cost (~6 million comparisons at gmina scale) that was the
  // dominant cost of every updateAll() call.
  nameCounts = {};
  for (const n of Object.values(terytToName)) nameCounts[n] = (nameCounts[n] || 0) + 1;
}

// Builds a standalone Leaflet layer for one historical-override geometry
// and wires it up exactly like a normal boundary layer (see bindFeatureLayer)
// -- shared by both the split and merge branches below, which each need to
// swap in or insert a layer that isn't part of the originally-loaded GeoJSON.
function buildOverrideLayer(teryt, name, geometry) {
  const layer = L.geoJSON(
    { type: "Feature", properties: { JPT_KOD_JE: teryt, JPT_NAZWA_: name }, geometry },
    { style: () => ({ fillOpacity: 0.9, color: BORDER_COLOR, weight: 0.3 }) }
  ).getLayers()[0];
  bindFeatureLayer(teryt, name, layer);
  return layer;
}

// See gminyOverrides above. Only meaningful at gmina level. Two kinds of
// event, both only mattering for a selected year <= validUntil (reverted
// the moment the year is back at/after it):
//  - splits: swap the parent's polygon for its pre-split (merged) shape and
//    hide the split-off child(ren)'s polygon(s).
//  - merges: insert the dissolved unit's own polygon (it isn't part of the
//    current boundary file at all -- the unit no longer exists today) and
//    shrink each absorbing unit's polygon back to its pre-merger extent.
// Cheap either way (a handful of layers touched, out of 2479 at gmina
// scale), so it's safe to call unconditionally from updateAll() on every
// year-slider tick rather than needing its own separate call sites.
async function applyGminaHistoricalOverrides(year) {
  if (currentLevel !== "gmina") return;
  if (gminyOverrides === null) {
    gminyOverrides = await fetch("data/gminy_historical_overrides.json").then((r) =>
      r.ok ? r.json() : { splits: {}, merges: {} }
    );
  }

  for (const parentTeryt in gminyOverrides.splits) {
    const { validUntil, hides, geometry } = gminyOverrides.splits[parentTeryt];
    const shouldApply = year <= validUntil;
    const isApplied = !!appliedGminaOverrides[parentTeryt];
    if (shouldApply === isApplied) continue;

    if (shouldApply) {
      const originalParentLayer = terytToLayer[parentTeryt];
      geoLayer.removeLayer(originalParentLayer);
      const mergedLayer = buildOverrideLayer(parentTeryt, terytToName[parentTeryt], geometry);
      geoLayer.addLayer(mergedLayer);

      const hiddenChildLayers = {};
      for (const childTeryt of hides) {
        hiddenChildLayers[childTeryt] = terytToLayer[childTeryt];
        geoLayer.removeLayer(terytToLayer[childTeryt]);
        delete terytToLayer[childTeryt];
        delete terytToName[childTeryt];
      }
      appliedGminaOverrides[parentTeryt] = { originalParentLayer, hiddenChildLayers };
    } else {
      const { originalParentLayer, hiddenChildLayers } = appliedGminaOverrides[parentTeryt];
      geoLayer.removeLayer(terytToLayer[parentTeryt]);
      geoLayer.addLayer(originalParentLayer);
      terytToLayer[parentTeryt] = originalParentLayer;
      terytToName[parentTeryt] = originalParentLayer.feature.properties.JPT_NAZWA_;
      for (const childTeryt in hiddenChildLayers) {
        geoLayer.addLayer(hiddenChildLayers[childTeryt]);
        terytToLayer[childTeryt] = hiddenChildLayers[childTeryt];
        terytToName[childTeryt] = hiddenChildLayers[childTeryt].feature.properties.JPT_NAZWA_;
      }
      delete appliedGminaOverrides[parentTeryt];
    }
  }

  for (const dissolvedTeryt in gminyOverrides.merges) {
    const { name, validUntil, geometry, shrinks } = gminyOverrides.merges[dissolvedTeryt];
    const shouldApply = year <= validUntil;
    const isApplied = !!appliedGminaOverrides[dissolvedTeryt];
    if (shouldApply === isApplied) continue;

    if (shouldApply) {
      const insertedLayer = buildOverrideLayer(dissolvedTeryt, name, geometry);
      geoLayer.addLayer(insertedLayer);

      const shrunkAbsorbers = {};
      for (const absorberTeryt in shrinks) {
        shrunkAbsorbers[absorberTeryt] = terytToLayer[absorberTeryt];
        geoLayer.removeLayer(terytToLayer[absorberTeryt]);
        const shrunkLayer = buildOverrideLayer(absorberTeryt, terytToName[absorberTeryt], shrinks[absorberTeryt]);
        geoLayer.addLayer(shrunkLayer);
      }
      appliedGminaOverrides[dissolvedTeryt] = { insertedLayer, shrunkAbsorbers };
    } else {
      const { insertedLayer, shrunkAbsorbers } = appliedGminaOverrides[dissolvedTeryt];
      geoLayer.removeLayer(insertedLayer);
      delete terytToLayer[dissolvedTeryt];
      delete terytToName[dissolvedTeryt];
      for (const absorberTeryt in shrunkAbsorbers) {
        geoLayer.removeLayer(terytToLayer[absorberTeryt]);
        geoLayer.addLayer(shrunkAbsorbers[absorberTeryt]);
        terytToLayer[absorberTeryt] = shrunkAbsorbers[absorberTeryt];
        terytToName[absorberTeryt] = shrunkAbsorbers[absorberTeryt].feature.properties.JPT_NAZWA_;
      }
      delete appliedGminaOverrides[dissolvedTeryt];
    }
  }

  // Recomputed since the swap can change which names collide (see
  // renderBoundaries) -- cheap at the handful-of-entries scale this runs at.
  nameCounts = {};
  for (const n of Object.values(terytToName)) nameCounts[n] = (nameCounts[n] || 0) + 1;
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
    // SVG (Leaflet's default) gives every polygon its own DOM node, so
    // restyling all of them on a data change means that many individual DOM
    // writes -- measured at ~95ms for gmina's 2479 polygons, the dominant
    // cost of every year-slider tick. Canvas draws the whole layer in one
    // paint pass instead of touching per-polygon DOM nodes.
    preferCanvas: true,
  });
  setDefaultView();
  // prefix:false drops Leaflet's own "Leaflet" credit link -- not a license
  // requirement (Leaflet is BSD-2-Clause, which doesn't mandate on-screen
  // attribution), removed per explicit request.
  attributionControl = L.control.attribution({ prefix: false }).addTo(map);
  attributionControl.addAttribution('Interaktywna Mapa Nierówności Płci: <a href="https://mapa.michalgulczynski.pl">Michał Gulczyński</a>');
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
  buildScaleScopeButtons();
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
  const sharesOk = meta.sharesMeaningful === true && !isRateMeasure(measure);
  const womenOnly = meta.sexScope === "women";

  const keys = Object.keys(VIEWS).filter((key) => {
    if (key === "total") return totalOk && !womenOnly;
    if (key === "shareWomen" || key === "shareMen") return sharesOk;
    if (key === "men" || key === "diff" || key === "ratio" || key === "ratioInverse") return !womenOnly;
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
  return variablesInTopic(topic).filter((k) => corrLevel === null || levelOf(k) === corrLevel);
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

// Most variables read best scaled to ONLY the currently-shown year -- e.g.
// unemployment's map highlights that year's relative spread among powiats,
// which is the point (2003's rates were structurally different from
// 2025's). Life expectancy is the opposite case: it barely moves year to
// year, and rescaling the palette to each year's narrow slice would make
// small noise look dramatic while making the same color mean a different
// value depending which year happens to be selected -- fixedScaleAcrossYears
// (see defaultColorScaleScope) defaults THAT variable to "all" instead, but
// state.colorScaleScope is what actually decides it, and the user can
// override either way via the Zakres skali buttons.
function currentDomain() {
  const values = [];
  const data = loadedData[state.variable] || {};
  if (state.colorScaleScope === "all") {
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

// Shared by all three diverging modes below. Each ARM (below/above center)
// is spaced using only that arm's own real distances-from-center -- one
// extreme outlier above center no longer stretches the below-center arm
// too (it used to: a single shared spread mirrored onto both sides is what
// made the wage-gap "Różnica" view look almost entirely white, 88% of
// counties landed in one bucket).
//
// Critically, a POPULATED arm is spaced between its own true MIN and MAX
// distance, not between 0 (center) and its max -- otherwise the boundary
// closest to center is an arbitrary fraction of the max, not a real value,
// which silently reintroduces the exact bug this was meant to fix: for a
// genuinely one-sided variable (life expectancy's K-M is never negative --
// women never live shorter than men), the empty arm still needs to
// collapse to *something*, and collapsing it to `center` leaves a
// nonzero-width "near equality" bucket sitting between `center` and the
// populated arm's true minimum -- which is exactly as wrong as the
// original bug, just one level more subtle (a legend that LOOKS collapsed
// but still starts at 0/1 instead of the real smallest gap). Collapsing
// the empty arm to the POPULATED arm's own innermost boundary instead
// closes that gap to zero width too, so legendBuckets() hides all of it.
//
// `dists` are already-computed positive distances-from-center in whatever
// space this mode spaces evenly in (raw for linear, log-magnitude for
// ratio-style views, symlog-magnitude for difference-style views);
// `combine(distance, sign)` turns a spaced distance back into an actual
// boundary value (sign is -1 for the below-center arm, +1 for above).
function spacedDivergingBoundaries(belowDists, aboveDists, n, combine) {
  const half = (n + 1) / 2; // n is always odd (a diverging palette needs a true center bucket)
  const evenSpace = (dists) => {
    const lo = Math.min(...dists);
    const hi = Math.max(...dists);
    return Array.from({ length: half }, (_, j) => (hi === lo ? lo : lo + (j / (half - 1)) * (hi - lo)));
  };
  if (belowDists.length === 0 && aboveDists.length === 0) {
    const c = combine(0, 1);
    return Array.from({ length: n + 1 }, () => c);
  }
  if (belowDists.length === 0 || aboveDists.length === 0) {
    const belowEmpty = belowDists.length === 0;
    const populated = belowEmpty ? aboveDists : belowDists;
    const inner = evenSpace(populated); // ascending distance, [0] = arm's own true minimum
    const populatedBoundaries = belowEmpty
      ? inner.map((d) => combine(d, 1))
      : inner.slice().reverse().map((d) => combine(d, -1));
    const anchor = populatedBoundaries[belowEmpty ? 0 : half - 1];
    const pad = Array.from({ length: n + 1 - half }, () => anchor);
    return belowEmpty ? [...pad, ...populatedBoundaries] : [...populatedBoundaries, ...pad];
  }
  const belowB = evenSpace(belowDists).reverse().map((d) => combine(d, -1));
  const aboveB = evenSpace(aboveDists).map((d) => combine(d, 1));
  return [...belowB, ...aboveB];
}

// Shared by linear and log/symlog diverging modes (NOT quantile below,
// which has a real, stated reason to scale each arm independently -- an
// outlier on one side shouldn't wash out the other side's spread). Linear
// and log both inherited that same per-arm-only scaling from an earlier
// shared helper with no equivalent justification of their own -- confirmed
// live this was actually wrong: Wynagrodzenia's K-M gap reaches -7056 zł
// on the "men ahead" side but only +1050 zł on "women ahead" (linear), and
// its K/M ratio's innermost boundaries sat at 0.9993/1.0007 -- the closest-
// to-1 real data points on each side -- instead of true equality at 1.0
// (log). Scaling each arm to its own extreme/closest-point gave wildly
// different bucket widths and an off-center "equality" boundary, which
// reads as a construction bug rather than real skew once checked against
// the actual numbers.
//
// `belowDists`/`aboveDists` are already-transformed distances from center
// (raw for linear, log-magnitude for ratio-style log, symlog-magnitude for
// difference-style log -- see the two callers), always >= 0.
// `combine(distance, sign)` turns a spaced distance back into an actual
// boundary value (sign is -1 for the below-center arm, +1 for above).
//
// Both arms share ONE radius -- the larger side's real extreme -- so the
// scale is symmetric around center, with n buckets evenly spaced across
// the full 2*radius span. This also gives the true center bucket a real,
// non-zero width instead of collapsing to whatever the single closest-to-
// center data point happened to be (which is what produced the "0 to 0"
// middle bin E8 matematyka's linear legend showed, and the 0.9993/1.0007
// near-miss on the log ratio scale).
function symmetricDivergingBoundaries(belowDists, aboveDists, n, combine) {
  const belowEmpty = belowDists.length === 0;
  const aboveEmpty = aboveDists.length === 0;
  if (belowEmpty && aboveEmpty) {
    const c = combine(0, 1);
    return Array.from({ length: n + 1 }, () => c);
  }
  // One-sided data (e.g. life expectancy's K-M, never negative): nothing
  // real to mirror on the empty side, so spend the FULL step count
  // sweeping center..max on the side that actually has data instead of
  // reserving half of it for a symmetric-but-empty mirror image.
  if (belowEmpty || aboveEmpty) {
    const maxDist = Math.max(...(belowEmpty ? aboveDists : belowDists));
    return belowEmpty
      ? Array.from({ length: n + 1 }, (_, i) => combine((i / n) * maxDist, 1))
      : Array.from({ length: n + 1 }, (_, i) => combine(((n - i) / n) * maxDist, -1));
  }
  const radius = Math.max(...belowDists, ...aboveDists);
  return Array.from({ length: n + 1 }, (_, i) => {
    const signedDist = (i - n / 2) * ((2 * radius) / n);
    return signedDist < 0 ? combine(-signedDist, -1) : combine(signedDist, 1);
  });
}

// Diverging, "linear" mode (default).
function linearBoundariesDiverging(domain, view, n) {
  const center = view.center ?? 0;
  const below = domain.filter((v) => v < center).map((v) => center - v);
  const above = domain.filter((v) => v >= center).map((v) => v - center);
  return symmetricDivergingBoundaries(below, above, n, (d, sign) => center + sign * d);
}

// Diverging, "quantile" mode: each arm's boundaries sit at real quantiles
// of that arm's own distribution (not evenly spaced), so one extreme
// outlier no longer stretches every other county on that arm into the
// pale near-center buckets. Same one-sided handling as
// spacedDivergingBoundaries above, just with `quantile()` standing in for
// the even-spacing -- quantile(dists, 0) is already that arm's true
// minimum, so the "start at the real min, not at center" fix falls out
// naturally here rather than needing an explicit anchor step.
function quantileBoundariesDiverging(domain, view, n) {
  const center = view.center ?? 0;
  const half = (n + 1) / 2;
  const below = domain.filter((v) => v < center).map((v) => center - v).sort((a, b) => a - b);
  const above = domain.filter((v) => v >= center).map((v) => v - center).sort((a, b) => a - b);
  const sideQuantiles = (dists) => Array.from({ length: half }, (_, j) => quantile(dists, j / (half - 1)));

  if (below.length === 0 && above.length === 0) return Array.from({ length: n + 1 }, () => center);
  if (below.length === 0 || above.length === 0) {
    const belowEmpty = below.length === 0;
    const populated = belowEmpty ? above : below;
    const inner = sideQuantiles(populated);
    const populatedBoundaries = belowEmpty ? inner.map((d) => center + d) : inner.slice().reverse().map((d) => center - d);
    const anchor = populatedBoundaries[belowEmpty ? 0 : half - 1];
    const pad = Array.from({ length: n + 1 - half }, () => anchor);
    return belowEmpty ? [...pad, ...populatedBoundaries] : [...populatedBoundaries, ...pad];
  }
  const left = sideQuantiles(below).reverse().map((d) => center - d);
  const right = sideQuantiles(above).map((d) => center + d);
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
  if (view.logScale) {
    const logCenter = Math.log(center);
    const below = domain.filter((v) => v < center).map((v) => logCenter - Math.log(v));
    const above = domain.filter((v) => v >= center).map((v) => Math.log(v) - logCenter);
    return symmetricDivergingBoundaries(below, above, n, (d, sign) => Math.exp(logCenter + sign * d));
  }
  const symlog = (v) => Math.sign(v - center) * Math.log1p(Math.abs(v - center));
  const invSymlog = (t) => center + Math.sign(t) * Math.expm1(Math.abs(t));
  const below = domain.filter((v) => v < center).map((v) => Math.abs(symlog(v)));
  const above = domain.filter((v) => v >= center).map((v) => Math.abs(symlog(v)));
  return symmetricDivergingBoundaries(below, above, n, (d, sign) => invSymlog(sign * d));
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

// Single source of truth for "which color ramp, in which order, does this
// view use" -- colorFor (map fill) and updateLegend (swatches + labels)
// both call this, so the two can never drift apart the way they briefly
// did for the ratio view in an earlier pass.
function stepsForView(view) {
  if (view.kind === "sequential") {
    if (view.sexColor === "k") return SEQUENTIAL_STEPS_RED;
    if (view.sexColor === "m") return SEQUENTIAL_STEPS_BLUE;
    return SEQUENTIAL_STEPS_NEUTRAL;
  }
  return view.reverseDiverging ? [...DIVERGING_STEPS].reverse() : DIVERGING_STEPS;
}

function colorFor(value, domain) {
  const view = VIEWS[state.view];
  if (value === null) return MISSING_COLOR;
  const steps = stepsForView(view);
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
  return { fillColor: colorFor(value, domain), fillOpacity: 0.9, color: BORDER_COLOR, weight: 0.3 };
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
  let unit = view.unit !== undefined ? view.unit : unitFor(VARIABLE_META[state.variable], state.measure);
  // Subtracting two percentages is a point difference, not itself a
  // percentage (e.g. 65% minus 60% is "5 p.p.", not "5%") -- only applies to
  // Różnica, since ratio/share views already override their own unit above.
  if (state.view === "diff" && unit === "%") unit = "p.p.";
  // Same idea for a "per 100 000" rate: the difference of two such rates
  // isn't itself "per 100 000" of anything -- there's no clean unit for it
  // (unlike % -> p.p.), so it's shown bare rather than with a misleading
  // "na 100 tys." suffix.
  if (state.view === "diff" && unit === "na 100 tys.") unit = "";
  const formatted = formatPl(v, view.decimals);
  return unit ? formatted + " " + unit : formatted;
}

async function updateAll() {
  if (!geoLayer) return;
  await applyGminaHistoricalOverrides(state.year);
  const domain = currentDomain();
  lastDomain = domain;
  // Tooltip content is NOT rebuilt here -- see setTooltipContent, built
  // lazily on hover instead. At gmina scale this loop is already the most
  // expensive per-frame cost (2479 style recalcs); doing 2479 unnecessary
  // string-builds and DOM writes for tooltips nobody is currently looking
  // at made it measurably worse.
  geoLayer.eachLayer((layer) => {
    const teryt = layer.feature.properties.JPT_KOD_JE;
    const value = mapValueFor(teryt);
    layer.setStyle(baseStyleFor(value, domain));
  });
  updateLegend(domain);
  updateRankings(domain);
  updateUrl();
}

function legendValueFormat(v) {
  return formatPl(v, VIEWS[state.view].decimals);
}

// Every bucket gets EQUAL on-screen width regardless of scale mode -- the
// quantile/log/diverging boundary values are real and unevenly spaced by
// design (that's the whole point of a quantile scale), but rendering swatch
// widths proportional to that real spacing squeezed some buckets down to a
// sliver and left their tick labels overlapping their neighbors. Uniform
// widths (standard practice for quantile-scale choropleth legends) fix the
// overlap; the tick VALUES are still the real boundary values, only their
// on-screen position is now index-based, not value-proportional.
//
// Diverging views are different from sequential ones in one respect: a
// per-arm spread (see linear/logBoundariesDiverging) can leave one whole arm
// collapsed to zero-width buckets sitting exactly at `center`, when all the
// real data is on the other side (life expectancy's K-M is never negative --
// women never live shorter than men). Rendering those anyway would show
// several identical duplicate tick labels for a range that never occurs, so
// those are dropped before assigning the (still uniform) positions below.
function legendBuckets(view, boundaries, steps) {
  if (view.kind !== "diverging") {
    const n = steps.length;
    return {
      buckets: steps.map((c, i) => ({ color: c, lo: i / n, hi: (i + 1) / n })),
      ticks: boundaries.map((v, i) => ({ value: v, pos: i / n })),
    };
  }
  const real = [];
  for (let i = 0; i < steps.length; i++) {
    if (boundaries[i + 1] !== boundaries[i]) real.push({ color: steps[i], lo: boundaries[i], hi: boundaries[i + 1] });
  }
  const n = real.length;
  if (n === 0) return { buckets: [], ticks: [] };
  return {
    buckets: real.map((b, i) => ({ color: b.color, lo: i / n, hi: (i + 1) / n })),
    ticks: [real[0].lo, ...real.map((b) => b.hi)].map((v, i) => ({ value: v, pos: i / n })),
  };
}

// One tick per color boundary (N colors -> N+1 ticks, minus any collapsed
// by legendBuckets), so every edge between two swatches has a visible
// number showing exactly where it falls -- not just the overall min/max.
// Sign (diff) or position relative to 1 (ratio) already conveys the M-vs-K
// direction, so bare numbers are enough.
function updateLegend(domain) {
  const view = VIEWS[state.view];
  const steps = stepsForView(view);
  const scaleEl = document.getElementById("legend-scale");
  const labelsEl = document.getElementById("legend-labels");
  if (domain.length === 0) {
    scaleEl.innerHTML = "";
    labelsEl.innerHTML = "";
    return;
  }
  const boundaries = colorBoundaries(domain, view, steps);
  const { buckets, ticks } = legendBuckets(view, boundaries, steps);
  scaleEl.innerHTML = buckets
    .map((b) => `<span style="flex:none;width:${((b.hi - b.lo) * 100).toFixed(3)}%;background:${b.color}"></span>`)
    .join("");
  const n = ticks.length - 1;
  labelsEl.innerHTML = ticks
    .map((t, i) => {
      const pos = i === 0 ? "left:0" : i === n ? "right:0" : `left:${(t.pos * 100).toFixed(3)}%;transform:translateX(-50%)`;
      const label = legendValueFormat(t.value);
      // The sidebar legend is narrow -- a run of 5+ digit ticks (thousands
      // of złoty, headcounts) can overlap its neighbors at the base font
      // size, so shrink just those instead of shrinking every tick always.
      const cls = (label.match(/\d/g) || []).length > 4 ? ' class="tick-long"' : "";
      return `<span style="${pos}"${cls}>${label}</span>`;
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

// --- Map image export (PNG/SVG) ---
// Re-projects each polygon's stored LatLngs to the CURRENT screen pixels via
// Leaflet's own map.latLngToContainerPoint -- not a snapshot of the canvas
// Leaflet actually paints with (preferCanvas above), which would need
// reverse-engineering its devicePixelRatio scaling and pane transform to
// crop correctly. Rebuilding the vector paths ourselves is what lets the
// exact same markup serve as both the .svg download and, rasterized onto a
// canvas, the .png one.
function ringToPathPoints(ring) {
  return ring.map((ll) => {
    const p = map.latLngToContainerPoint(ll);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" L ");
}

// GeoJSON Polygon layers store latlngs 2 levels deep (array of rings);
// MultiPolygon ones store them 3 levels deep (array of polygons of rings) --
// recurse until we hit a ring (array of LatLng) rather than assuming either.
function latlngsToPathData(latlngs) {
  if (!Array.isArray(latlngs[0])) return `M ${ringToPathPoints(latlngs)} Z`;
  if (!Array.isArray(latlngs[0][0])) return latlngs.map((ring) => `M ${ringToPathPoints(ring)} Z`).join(" ");
  return latlngs.map(latlngsToPathData).join(" ");
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Variable name alone -- the large title over the exported map. Kept
// separate from exportFeatureParts() below so the two can use different
// font sizes/weights (title much larger) rather than living in one string.
function exportTitle() {
  return VARIABLE_META[state.variable].label;
}

// Every dimension that affects what's actually drawn, as a LIST (not a
// pre-joined string) so the caller can wrap it across as many lines as it
// needs rather than a fixed one-or-two -- this project now has variables
// with a real choice on every one of these axes (e.g. pkd_zatrudnienie's
// 24 miesiąc+miara combinations, fundusz_alimentacyjny's 6 measures), so
// the exported image needs to spell out exactly which combination is
// shown, not just the variable name. Level is ALWAYS included (even a
// single fixed level isn't obvious from the image alone once it's out of
// the app) -- age group and measure stay conditional on the variable
// actually offering a choice, same condition updateMeta() uses for its own
// sidebar line. Color scale/scope are deliberately NOT here -- see
// exportScaleSentence() below, which reads as its own sentence under the
// legend instead of another " · "-joined fragment up here.
function exportFeatureParts() {
  const meta = VARIABLE_META[state.variable];
  const view = VIEWS[state.view];
  const level = meta.levels.find((o) => o.key === state.level) || meta.levels[0];
  const parts = [String(state.year), level.label];
  if (meta.ageGroups.length > 1) {
    const ag = meta.ageGroups.find((o) => o.key === state.ageGroup);
    if (ag) parts.push(ag.label);
  }
  if (meta.measures.length > 1) {
    const ms = meta.measures.find((o) => o.key === state.measure);
    if (ms) parts.push(ms.label);
  }
  parts.push(view.label, meta.source);
  return parts;
}

// One plain-language sentence describing the color scale, meant to sit
// under the legend in the exported image (not up in exportFeatureParts() --
// this reads as a caption for the legend specifically, not another item in
// the variable/year/measure list). COLOR_SCALES/SCALE_SCOPES (used
// elsewhere for the sidebar's own button labels) are noun phrases, not
// grammatically adjectives agreeing with "Skala" (feminine) -- "Skala
// Kwantyle" wouldn't parse as Polish, so this needs its own adjective forms
// rather than reusing those labels directly.
const EXPORT_SCALE_ADJ = { linear: "liniowa (równe przedziały)", log: "logarytmiczna", quantile: "kwantylowa" };
const EXPORT_SCALE_SCOPE_PHRASE = { year: "dla danego roku", all: "wspólna dla wszystkich dostępnych lat" };
function exportScaleSentence() {
  return `Skala ${EXPORT_SCALE_ADJ[state.colorScale]} ${EXPORT_SCALE_SCOPE_PHRASE[state.colorScaleScope]}.`;
}

function exportFileBaseName() {
  const slug = `${VARIABLE_META[state.variable].label}_${state.view}_${state.year}`
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return `mapa_${slug}`;
}

const EXPORT_PAD_X = 20;
const EXPORT_FOOTER_H = 26; // credit bar, flush against the map's bottom edge
const EXPORT_LEGEND_H = 60; // swatches + tick labels
const EXPORT_SCALE_SENTENCE_H = 30; // one line describing the color scale, under the legend
const EXPORT_TITLE_PAD_TOP = 22;
const EXPORT_TITLE_PAD_BOTTOM = 10;
const EXPORT_FEATURES_LINE_H = 24; // one line of the year/level/measure/.../source text
const EXPORT_FEATURES_PAD_BOTTOM = 16;

// A long title, or a long source citation among exportFeatureParts() (e.g.
// "Narodowy Spis Powszechny Ludności i Mieszkań 2021 (BDL GUS)"), can push
// past the map's width -- an SVG root clips to its viewBox by default, so
// an unfitted line would just be silently cut off rather than visibly
// overflow. Shrinks first, then wrapParts() above spreads the features
// list across as many lines as it needs at that size.
function measureTextWidth(text, fontSize, fontFamily = "system-ui, sans-serif") {
  const ctx = measureTextWidth._ctx || (measureTextWidth._ctx = document.createElement("canvas").getContext("2d"));
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

function fitFontSize(text, baseSize, minSize, maxWidth) {
  const w = measureTextWidth(text, baseSize);
  if (w <= maxWidth) return baseSize;
  return Math.max(minSize, baseSize * (maxWidth / w));
}

// Greedily packs `parts` (joined with " · ") onto as many lines as needed
// to fit maxWidth, instead of a fixed one-or-two -- exportFeatureParts() can
// now return up to 7 parts (year/level/ageGroup/measure/view/scale/scope/
// source), more than a single midpoint-split could ever fit even at the
// font-size floor. A single part wider than maxWidth on its own (e.g. a
// long source citation) still just overflows its own line -- fitFontSize
// already shrunk the font as far as it reasonably can before this runs.
function wrapParts(parts, fontSize, maxWidth) {
  const lines = [];
  let current = [];
  for (const part of parts) {
    const candidate = [...current, part].join(" · ");
    if (current.length > 0 && measureTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current.join(" · "));
      current = [part];
    } else {
      current.push(part);
    }
  }
  if (current.length > 0) lines.push(current.join(" · "));
  return lines;
}

// Full-width legend (unlike the cramped sidebar copy) so the tick labels --
// up to 9 of them, for the 8-bucket sequential scale -- have room to
// breathe. Uses the same legendBuckets() as the sidebar legend, so a
// diverging view's collapsed (zero-width, one-sided) buckets are hidden
// here too instead of exporting an image with duplicate tick labels.
function buildExportLegendSvg(x, y, width, textColor) {
  const view = VIEWS[state.view];
  const steps = stepsForView(view);
  const boundaries = colorBoundaries(lastDomain, view, steps);
  const { buckets, ticks } = legendBuckets(view, boundaries, steps);
  const swatchH = 16;
  let out = buckets
    .map((b) => `<rect x="${(x + b.lo * width).toFixed(1)}" y="${y}" width="${((b.hi - b.lo) * width).toFixed(1)}" height="${swatchH}" fill="${b.color}" />`)
    .join("");
  const tickY = y + swatchH + 16;
  const n = ticks.length - 1;
  out += ticks
    .map((t, i) => {
      const tx = x + t.pos * width;
      const anchor = i === 0 ? "start" : i === n ? "end" : "middle";
      const label = legendValueFormat(t.value);
      // Same reasoning as the sidebar legend: a run of 5+ digit ticks
      // (thousands of złoty, headcounts) can overlap its neighbors,
      // especially now that the legend itself is capped narrower than the
      // map (see EXPORT_LEGEND_MAX_W) -- shrink just those.
      const fontSize = (label.match(/\d/g) || []).length > 4 ? 10 : 12;
      return `<text x="${tx.toFixed(1)}" y="${tickY}" font-size="${fontSize}" font-family="system-ui, sans-serif" fill="${textColor}" text-anchor="${anchor}">${escapeXml(label)}</text>`;
    })
    .join("");
  return out;
}

// pixelScale only widens the <svg> width/height attributes, not the
// viewBox -- everything is authored in one consistent coordinate space, and
// the higher-resolution PNG export just asks the browser to rasterize that
// same markup at a larger physical size (crisp text/lines, no upscaling blur).
// How much of the map container is actually blank margin around Poland's
// shape (kept on-screen for pan/zoom affordance, useless in a static
// export) -- min/max screen Y only need the geometry's north/south
// extremes (not every vertex), since Web Mercator Y is monotonic in
// latitude regardless of longitude; same idea for X and west/east.
const EXPORT_CROP_PAD_Y = 12;
const EXPORT_CROP_PAD_X = 12;
// The legend doesn't need to span the map's full (often quite wide) width
// to be readable -- capped and centered instead, so a handful of swatches
// (common now that one-sided diverging scales collapse to 3-4 real ones,
// see legendBuckets) don't balloon into oversized blocks next to the much
// narrower description/credit text lines above them.
const EXPORT_LEGEND_MAX_W = 360;

function buildExportSvg({ pixelScale = 1 } = {}) {
  const mapEl = document.getElementById("map");
  const fullMapW = mapEl.clientWidth;
  const fullMapH = mapEl.clientHeight;

  const bounds = geoLayer.getBounds();
  const centerLat = bounds.getCenter().lat;
  const centerLng = bounds.getCenter().lng;
  const shapeTopY = map.latLngToContainerPoint([bounds.getNorth(), centerLng]).y;
  const shapeBottomY = map.latLngToContainerPoint([bounds.getSouth(), centerLng]).y;
  const shapeLeftX = map.latLngToContainerPoint([centerLat, bounds.getWest()]).x;
  const shapeRightX = map.latLngToContainerPoint([centerLat, bounds.getEast()]).x;
  const cropTop = Math.max(0, shapeTopY - EXPORT_CROP_PAD_Y);
  const cropBottom = Math.min(fullMapH, shapeBottomY + EXPORT_CROP_PAD_Y);
  const cropLeft = Math.max(0, shapeLeftX - EXPORT_CROP_PAD_X);
  const cropRight = Math.min(fullMapW, shapeRightX + EXPORT_CROP_PAD_X);
  const mapH = cropBottom - cropTop;
  const mapW = cropRight - cropLeft;
  const availW = mapW - EXPORT_PAD_X * 2;

  const creditText = "Interaktywna Mapa Nierówności Płci: Michał Gulczyński · mapa.michalgulczynski.pl";
  const creditFontSize = fitFontSize(creditText, 12, 9, availW);

  // Title: the variable name alone, large, centered above the map.
  const titleText = exportTitle();
  const titleFontSize = fitFontSize(titleText, 26, 18, availW);
  const titleH = EXPORT_TITLE_PAD_TOP + titleFontSize + EXPORT_TITLE_PAD_BOTTOM;

  // Features: every dimension that affects what's actually drawn (year,
  // level, age group/measure if the variable offers a choice, view, color
  // scale + scope, source) -- wrapped across as many lines as it needs.
  // Shrunk only as far as the single LONGEST part requires, not the whole
  // joined list, since wrapping (not shrinking) is what absorbs the rest.
  const featureParts = exportFeatureParts();
  const longestPart = featureParts.reduce((a, b) => (measureTextWidth(b, 16) > measureTextWidth(a, 16) ? b : a));
  const featuresFontSize = fitFontSize(longestPart, 16, 12, availW);
  const featureLines = wrapParts(featureParts, featuresFontSize, availW);
  const featuresH = featureLines.length * EXPORT_FEATURES_LINE_H + EXPORT_FEATURES_PAD_BOTTOM;

  const headerH = titleH + featuresH;
  const scaleSentenceText = exportScaleSentence();
  const scaleSentenceFontSize = fitFontSize(scaleSentenceText, 13, 11, availW);
  const totalH = headerH + mapH + EXPORT_FOOTER_H + EXPORT_LEGEND_H + EXPORT_SCALE_SENTENCE_H;

  // Resolved to concrete hex/rgb here, not left as var(--x) -- the exported
  // file has no stylesheet of its own to resolve custom properties against,
  // so it has to bake in whichever theme (light/dark) is active right now.
  const cs = getComputedStyle(document.documentElement);
  const pageColor = cs.getPropertyValue("--page").trim();
  const surfaceColor = cs.getPropertyValue("--surface-1").trim();
  const textColor = cs.getPropertyValue("--text-primary").trim();

  let polys = "";
  geoLayer.eachLayer((layer) => {
    const fill = layer.options.fillColor || MISSING_COLOR;
    polys += `<path d="${latlngsToPathData(layer.getLatLngs())}" fill="${fill}" fill-rule="evenodd" stroke="${BORDER_COLOR}" stroke-width="0.3" />`;
  });

  const titleSvg = `<text x="${mapW / 2}" y="${EXPORT_TITLE_PAD_TOP + titleFontSize}" font-size="${titleFontSize.toFixed(1)}" font-weight="600" font-family="system-ui, sans-serif" fill="${textColor}" text-anchor="middle">${escapeXml(titleText)}</text>`;
  const featuresSvg = featureLines
    .map((line, i) => `<text x="${mapW / 2}" y="${titleH + EXPORT_FEATURES_LINE_H * 0.75 + i * EXPORT_FEATURES_LINE_H}" font-size="${featuresFontSize.toFixed(1)}" font-family="system-ui, sans-serif" fill="${textColor}" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");

  const footerY = headerH + mapH;
  const legendY = footerY + EXPORT_FOOTER_H;
  const legendW = Math.min(availW, EXPORT_LEGEND_MAX_W);
  const legendX = EXPORT_PAD_X + (availW - legendW) / 2;
  const legendSvg = buildExportLegendSvg(legendX, legendY + 6, legendW, textColor);
  const scaleSentenceSvg = `<text x="${mapW / 2}" y="${legendY + EXPORT_LEGEND_H + 8}" font-size="${scaleSentenceFontSize.toFixed(1)}" font-family="system-ui, sans-serif" fill="${textColor}" text-anchor="middle">${escapeXml(scaleSentenceText)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(mapW * pixelScale)}" height="${Math.round(totalH * pixelScale)}" viewBox="0 0 ${mapW} ${totalH}">
    <rect x="0" y="0" width="${mapW}" height="${totalH}" fill="${pageColor}" />
    ${titleSvg}
    ${featuresSvg}
    <g transform="translate(${(-cropLeft).toFixed(1)}, ${(headerH - cropTop).toFixed(1)})">${polys}</g>
    <rect x="0" y="${footerY}" width="${mapW}" height="${EXPORT_FOOTER_H}" fill="${surfaceColor}" />
    <text x="${mapW / 2}" y="${footerY + EXPORT_FOOTER_H / 2 + 4}" font-size="${creditFontSize.toFixed(1)}" font-family="system-ui, sans-serif" fill="${textColor}" text-anchor="middle">${escapeXml(creditText)}</text>
    ${legendSvg}
    ${scaleSentenceSvg}
  </svg>`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportMapSvg() {
  const svg = buildExportSvg({ pixelScale: 1 });
  downloadBlob(`${exportFileBaseName()}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

// Rasterizes the same SVG markup via an off-DOM <img> + <canvas> -- no extra
// dependency, and since every resource inside the SVG is inline (no external
// images/fonts), the canvas is never tainted and toBlob() works normally.
function exportMapPng() {
  const svg = buildExportSvg({ pixelScale: 2 });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => downloadBlob(`${exportFileBaseName()}.png`, blob), "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showError("Nie udało się wygenerować obrazu PNG.");
  };
  img.src = url;
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
  // stale keys from the previous variable that might not exist here --
  // year included: syncYearSlider() below only resets state.year when it's
  // null or invalid for the new variable, so without this a year that
  // happens to ALSO exist for the new variable would carry over instead of
  // landing on ITS most recent year (the actual desired default whenever a
  // variable is freshly selected).
  state.level = meta.levels[0].key;
  state.ageGroup = meta.ageGroups[0].key;
  state.measure = meta.measures[0].key;
  state.year = null;
  state.colorScaleScope = defaultColorScaleScope(requested);
  state.view = defaultView(requested);
  document.getElementById("topic-select").value = meta.topic;
  populateVariableOptions(meta.topic);
  document.getElementById("variable-select").value = state.variable;
  buildDimensionSelectors();
  buildScaleScopeButtons();
  buildViewButtons();
  syncYearSlider();
  updateMeta();
  updateMapAttribution();
  updateAll();
}

// Polish collation (ą/ć/ł/ń/ó/ś/ź/ż sort where a Pole expects them, not by
// raw code point) -- used everywhere a topic or variable list is built, so
// "Temat" and "Zmienna" are alphabetical in every panel (map sidebar,
// download panel, correlation tool), not just insertion order.
const PL_COLLATOR = new Intl.Collator("pl");

function topicsInUse() {
  // "inne" (see TOPICS in variables.js) is a deliberate exception to the
  // alphabetical order every other topic follows -- a catch-all belongs at
  // the end of the list, not wherever its label would alphabetically fall.
  return [...new Set(Object.values(VARIABLE_META).map((v) => v.topic))].sort((a, b) => {
    if (a === "inne") return 1;
    if (b === "inne") return -1;
    return PL_COLLATOR.compare(TOPICS[a], TOPICS[b]);
  });
}

function variablesInTopic(topic) {
  return Object.keys(VARIABLE_META)
    .filter((k) => VARIABLE_META[k].topic === topic)
    .sort((a, b) => PL_COLLATOR.compare(VARIABLE_META[a].label, VARIABLE_META[b].label));
}

function populateVariableOptions(topic) {
  const select = document.getElementById("variable-select");
  const keys = variablesInTopic(topic);
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

// Rebuilt (not just re-styled) on every variable change, same as
// buildScaleButtons would need to be if colorScale ever got a per-variable
// default -- keeps this in sync whether colorScaleScope changed via a
// variable-switch default, a URL param, or a direct click.
function buildScaleScopeButtons() {
  const container = document.getElementById("scale-scope-buttons");
  container.innerHTML = "";
  for (const key in SCALE_SCOPES) {
    const btn = document.createElement("button");
    btn.textContent = SCALE_SCOPES[key];
    btn.className = key === state.colorScaleScope ? "active" : "";
    btn.addEventListener("click", () => {
      state.colorScaleScope = key;
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

// Measures ending "_per100k" (see etl/add_derived_measures.py) are already
// a population-adjusted rate -- %kobiet/%mężczyzn would divide two such
// rates rather than two raw headcounts, not the same meaningful "share of a
// count" computation sharesMeaningful was designed for. Checked in addition
// to (not instead of) the variable-level sharesMeaningful flag, in both the
// map's own view buttons and the correlation tool's per-axis view list.
function isRateMeasure(measure) {
  return measure.endsWith("_per100k");
}

function hasTotalForCurrentSelection() {
  return hasTotalFor(VARIABLE_META[state.variable], state.ageGroup, state.measure);
}

// Lets a measure override the variable-level unit (e.g. "głosów" for a votes
// measure sitting next to "osób" candidate/elected measures in the same
// variable) -- same lookup pattern as hasTotalFor above.
function unitFor(meta, measure) {
  const measureOpt = meta.measures.find((o) => o.key === measure);
  return measureOpt?.unit ?? meta.unit;
}

// Cached per variable (scanning every row is only worth doing once, same
// idea as nameCounts below) -- true if ANY row has a non-null m or k.
// Variables like gestosc_zaludnienia/dochody_* are never sex-disaggregated
// in the source at all (GUS just doesn't publish that split), so every row
// has m=k=null by design, not by gap -- Kobiety/Mężczyźni need to be
// disabled for those the same way Ogółem/% already are for their own
// not-applicable cases, or clicking them renders an all-"missing data" map.
let sexDataAvailability = {};

function hasSexData(variable) {
  if (variable in sexDataAvailability) return sexDataAvailability[variable];
  const data = loadedData[variable] || {};
  let found = false;
  outer: for (const teryt in data) {
    for (const year in data[teryt]) {
      for (const slice in data[teryt][year]) {
        const v = data[teryt][year][slice];
        if (v.m !== null || v.k !== null) {
          found = true;
          break outer;
        }
      }
    }
  }
  sexDataAvailability[variable] = found;
  return found;
}

function updateViewAvailability() {
  const totalBtn = document.querySelector('#view-buttons button[data-view-key="total"]');
  if (!totalBtn) return;
  const meta = VARIABLE_META[state.variable];
  // Not "the other sex's data happens to be missing" (that's hasSexData
  // below) -- this variable only conceptually exists for women (e.g. a
  // screening program), so Ogółem/Mężczyźni/diverging views are wrong to
  // even offer, not just currently empty.
  const womenOnly = meta.sexScope === "women";

  const totalOk = hasTotalForCurrentSelection() && !womenOnly;
  totalBtn.disabled = !totalOk;
  totalBtn.title = totalOk
    ? ""
    : womenOnly
    ? "Zmienna dotyczy wyłącznie kobiet -- dostępny jest tylko widok Kobiety"
    : "Ogółem niedostępne dla tej grupy wieku/miary (patrz opis zmiennej)";

  // Kobiety/Mężczyźni obviously need m/k, but so do the diverging views --
  // Różnica is k-m, both Proporcje are k/m or m/k -- so all five are gated
  // on the same hasSexData() check, not just the two sequential ones. A
  // womenOnly variable is the one exception: Kobiety itself stays gated on
  // real data (sexOk), but the other four are forced off regardless.
  const sexOk = hasSexData(state.variable);
  for (const key of ["women", "men", "diff", "ratio", "ratioInverse"]) {
    const btn = document.querySelector(`#view-buttons button[data-view-key="${key}"]`);
    if (!btn) continue;
    const enabled = key === "women" ? sexOk : sexOk && !womenOnly;
    btn.disabled = !enabled;
    btn.title = enabled
      ? ""
      : womenOnly
      ? "Zmienna dotyczy wyłącznie kobiet -- dostępny jest tylko widok Kobiety"
      : "Ta zmienna nie ma danych w podziale na płeć -- dostępne jest tylko Ogółem";
  }

  // % kobiet / % mężczyzn compute k/(k+m) -- only meaningful when k and m
  // are COUNTS (people, pupils, votes), not rates or scores. Adding two
  // unemployment rates and dividing tells you nothing, so these views stay
  // disabled unless the variable opts in with sharesMeaningful: true --
  // and even then, disabled again for this variable's own "_per100k"
  // measures specifically, which are themselves already a rate.
  const sharesOk = meta.sharesMeaningful === true && !isRateMeasure(state.measure);
  for (const key of ["shareWomen", "shareMen"]) {
    const btn = document.querySelector(`#view-buttons button[data-view-key="${key}"]`);
    if (!btn) continue;
    btn.disabled = !sharesOk;
    btn.title = sharesOk ? "" : "Dostępne tylko dla zmiennych liczebnościowych (np. liczba uczniów), nie dla wskaźników i wyników";
  }

  // Read back off the DOM rather than re-deriving which of the three
  // disabled-conditions above applies -- one source of truth for "is the
  // currently selected view actually clickable", so a future fourth
  // disabling condition can't be added above without this fallback noticing.
  const currentBtn = document.querySelector(`#view-buttons button[data-view-key="${state.view}"]`);
  if (currentBtn && currentBtn.disabled) {
    state.view = totalOk ? "total" : "women";
    [...document.querySelectorAll("#view-buttons button")].forEach((b) =>
      b.classList.toggle("active", b.dataset.viewKey === state.view)
    );
  }
}

function buildYearSlider() {
  const slider = document.getElementById("year-slider");
  const label = document.getElementById("year-value");
  syncYearSlider();
  // Dragging fires 'input' far faster than updateAll() can keep up with at
  // gmina scale (2479 polygons restyled + rankings re-sorted per call) --
  // without this, a drag queues up dozens of full re-renders that keep
  // running long after the pointer has already moved on, reading as a
  // freeze. Coalescing to one updateAll() per animation frame keeps the
  // thumb/label snappy (those stay untouched, they're cheap) while capping
  // the expensive part to what the screen can actually show anyway.
  let updatePending = false;
  slider.addEventListener("input", () => {
    const years = availableYears(state.variable, state.ageGroup, state.measure).map(Number);
    const raw = Number(slider.value);
    const nearest = years.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    state.year = nearest;
    slider.value = nearest; // snap the visible thumb, not just the stored state
    label.textContent = state.year;
    if (!updatePending) {
      updatePending = true;
      requestAnimationFrame(() => {
        updatePending = false;
        updateAll();
      });
    }
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
  if ((nameCounts[name] || 0) <= 1) return name;
  return `${name} (${VOIVODESHIP_BY_CODE[teryt.slice(0, 2)] || teryt.slice(0, 2)})`;
}

// Shared by the mouseover handler and the search-result jump -- both need
// the tooltip's HTML set immediately before it can actually be shown.
function setTooltipContent(layer, teryt, name) {
  const value = mapValueFor(teryt);
  layer.setTooltipContent(
    `<strong>${displayName(teryt, name)}</strong><br>${VIEWS[state.view].label}, ${state.year}: <span class="val">${formatValue(value)}</span>`
  );
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
        setTooltipContent(layer, teryt, name); // bypasses mouseover, so needs it set explicitly
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
      const keys = variablesInTopic(topic);
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
  params.set("scaleScope", state.colorScaleScope);
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

  state.view = defaultView(state.variable);
  if (params.has("view") && VIEWS[params.get("view")]) state.view = params.get("view");
  if (params.has("year")) state.year = Number(params.get("year"));
  if (params.has("level")) state.level = resolveDimension(state.variable, "levels", params.get("level"));
  if (params.has("agegroup")) state.ageGroup = resolveDimension(state.variable, "ageGroups", params.get("agegroup"));
  if (params.has("measure")) state.measure = resolveDimension(state.variable, "measures", params.get("measure"));
  if (params.has("scale") && COLOR_SCALES[params.get("scale")]) state.colorScale = params.get("scale");
  state.colorScaleScope = defaultColorScaleScope(state.variable);
  if (params.has("scaleScope") && SCALE_SCOPES[params.get("scaleScope")]) state.colorScaleScope = params.get("scaleScope");

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
  document.getElementById("export-png-btn").addEventListener("click", exportMapPng);
  document.getElementById("export-svg-btn").addEventListener("click", exportMapSvg);
  init();
});
