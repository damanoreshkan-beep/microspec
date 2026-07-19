import { mulberry32 } from "./groove.js";

export const SPREADS = [
  { id: "daily", pos: ["posToday"] },
  { id: "ppf", pos: ["posPast", "posPresent", "posFuture"] },
  { id: "sao", pos: ["posSituation", "posAction", "posResult"] },
  { id: "celtic", pos: ["posHeart", "posCross", "posBelow", "posBehind", "posAbove", "posBefore", "posSelfC", "posEnv", "posHopes", "posFinal"] },
];
export const spreadById = (id) => SPREADS.find((s) => s.id === id) || SPREADS[0];

export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function draw(seed, size, deckLen = 78) {
  const rng = mulberry32(seed >>> 0);
  const idx = Array.from({ length: deckLen }, (_, i) => i);
  const n = Math.max(0, Math.min(size, deckLen));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (deckLen - i));
    const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
  }
  return idx.slice(0, n).map((card) => ({ card, reversed: rng() < 0.5 }));
}
