// tarot — the pure draw math for the spreads. The DECK data (78 cards + meanings + images) is app-owned
// (apps/tarot/deck.js); this module owns only the deterministic shuffle so a draw is reproducible from a
// seed (a date key for the daily card → stable through the day; a random seed for an interactive draw) and
// unit-testable. Depth lives here, like groove.js / astro.js.
import { mulberry32 } from "./groove.js";

// The spreads. `pos` are i18n keys for each position, in layout order; size = pos.length.
export const SPREADS = [
  { id: "daily", pos: ["posToday"] },
  { id: "ppf", pos: ["posPast", "posPresent", "posFuture"] },
  { id: "sao", pos: ["posSituation", "posAction", "posResult"] },
  { id: "celtic", pos: ["posHeart", "posCross", "posBelow", "posBehind", "posAbove", "posBefore", "posSelfC", "posEnv", "posHopes", "posFinal"] },
];
export const spreadById = (id) => SPREADS.find((s) => s.id === id) || SPREADS[0];

// FNV-1a → uint32, so a string (e.g. a date key) can seed the RNG.
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// draw(seed, size, deckLen) → [{ card: 0..deckLen-1, reversed: bool }] — `size` DISTINCT cards with an
// orientation each, fully determined by (seed, size). Partial Fisher–Yates picks the cards, then one rng
// draw per card sets its orientation (≈50/50). Same seed ⇒ same spread, in any language.
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
