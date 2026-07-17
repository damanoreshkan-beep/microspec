// air.js — European Air Quality Index (EAQI) + pollen banding. Pure, zero-dependency, unit-tested.
//
// The overall EAQI (EEA scale) is a 0..100+ index in six bands of 20 points each. Each pollutant also has
// its own sub-index, computed from concentration (µg/m³) against the official EEA breakpoints; the overall
// index is the WORST pollutant. We take the overall value straight from the source and derive each
// pollutant's band here so a tile can be coloured by its own contribution — colour = which pollutant is bad.
//
// Bands (index → key): 0 good · 1 fair · 2 moderate · 3 poor · 4 veryPoor · 5 extreme. A missing value → -1.

export const AQI_BANDS = ["good", "fair", "moderate", "poor", "veryPoor", "extreme"];

// Overall EAQI value (0..100, may exceed 100 for "extremely poor") → band index.
export const eaqiBand = (v) =>
  v == null || Number.isNaN(v) ? -1 : v <= 20 ? 0 : v <= 40 ? 1 : v <= 60 ? 2 : v <= 80 ? 3 : v <= 100 ? 4 : 5;

// Official EEA sub-index breakpoints (µg/m³): the UPPER bound of bands 0..4; a value above the last → band 5.
// PM are the running means the API already reports; we band the reported current value.
const BREAKPOINTS = {
  pm2_5: [10, 20, 25, 50, 75],
  pm10: [20, 40, 50, 100, 150],
  no2: [40, 90, 120, 230, 340],
  o3: [50, 100, 130, 240, 380],
  so2: [100, 200, 350, 500, 750],
};

// Concentration (µg/m³) of a named pollutant → EAQI band index. Unknown pollutant or null → -1.
export const pollutantBand = (species, c) => {
  const bp = BREAKPOINTS[species];
  if (!bp || c == null || Number.isNaN(c)) return -1;
  for (let i = 0; i < bp.length; i++) if (c <= bp[i]) return i;
  return 5;
};

// Pollen bands (grains/m³): 0 none · 1 low · 2 moderate · 3 high · 4 veryHigh. Missing → -1.
export const POLLEN_BANDS = ["none", "low", "moderate", "high", "veryHigh"];

// Thresholds are category-specific — a weed grain is symptomatic at a far lower count than a grass grain.
// Upper bounds of low/moderate/high; above the last → veryHigh. (General exposure guide, not a diagnosis.)
const POLLEN_BP = {
  tree: [10, 50, 100], // alder, birch, olive
  grass: [30, 50, 150],
  weed: [10, 50, 100], // mugwort, ragweed
};
const POLLEN_CAT = { alder: "tree", birch: "tree", olive: "tree", grass: "grass", mugwort: "weed", ragweed: "weed" };

export const pollenBand = (species, g) => {
  if (g == null || Number.isNaN(g)) return -1;
  if (g <= 0) return 0;
  const bp = POLLEN_BP[POLLEN_CAT[species]] || POLLEN_BP.grass;
  for (let i = 0; i < bp.length; i++) if (g <= bp[i]) return i + 1;
  return 4;
};
