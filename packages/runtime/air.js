
export const AQI_BANDS = ["good", "fair", "moderate", "poor", "veryPoor", "extreme"];

export const eaqiBand = (v) =>
  v == null || Number.isNaN(v) ? -1 : v <= 20 ? 0 : v <= 40 ? 1 : v <= 60 ? 2 : v <= 80 ? 3 : v <= 100 ? 4 : 5;

const BREAKPOINTS = {
  pm2_5: [10, 20, 25, 50, 75],
  pm10: [20, 40, 50, 100, 150],
  no2: [40, 90, 120, 230, 340],
  o3: [50, 100, 130, 240, 380],
  so2: [100, 200, 350, 500, 750],
};

export const pollutantBand = (species, c) => {
  const bp = BREAKPOINTS[species];
  if (!bp || c == null || Number.isNaN(c)) return -1;
  for (let i = 0; i < bp.length; i++) if (c <= bp[i]) return i;
  return 5;
};

export const POLLEN_BANDS = ["none", "low", "moderate", "high", "veryHigh"];

const POLLEN_BP = {
  tree: [10, 50, 100], 
  grass: [30, 50, 150],
  weed: [10, 50, 100], 
};
const POLLEN_CAT = { alder: "tree", birch: "tree", olive: "tree", grass: "grass", mugwort: "weed", ragweed: "weed" };

export const pollenBand = (species, g) => {
  if (g == null || Number.isNaN(g)) return -1;
  if (g <= 0) return 0;
  const bp = POLLEN_BP[POLLEN_CAT[species]] || POLLEN_BP.grass;
  for (let i = 0; i < bp.length; i++) if (g <= bp[i]) return i + 1;
  return 4;
};
