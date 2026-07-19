// horoscope — a deterministic, offline "reading" for a sign on a given day. No API (they are flaky, CORS-
// blocked, and no more "real" than this): the reading is SEEDED by (sign, date), so it is stable within a day,
// changes every day, works offline and is unit-testable. The app owns the localized prose banks; this module
// owns only the science-free but deterministic selection maths — indices/ratings as 0..1 selectors + 2..5
// ratings — so the same sign+date always yields the same reading, in any language. Depth lives here, like groove.js.
import { mulberry32 } from "./groove.js";

// Glyphs are NOT here: the sign symbol is a hand-drawn SVG in `/_rt/zodiac.js` (`Sign`) — never an emoji.
// This module owns only the maths (names/glyphs are presentation, owned by the app + zodiac.js).

// Calendar-ordered sign starts: a date belongs to the LAST entry whose start it is ≥ (Jan 1–19 → Capricorn,
// which also opens the list, so the wrap at year-end needs no special case).
const ORDER = [[1, 1, 9], [1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3], [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9]];
export function sunSign(month, day) {   // month 1..12
  let idx = ORDER[0][2];
  for (const [m, d, s] of ORDER) if (month > m || (month === m && day >= d)) idx = s;
  return idx;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// reading(signIdx, dateKey "YYYY-MM-DD") → deterministic selectors + ratings. The app maps the 0..1 selectors
// into its localized phrase banks (`bank[Math.floor(sel * bank.length)]`), so bank length can differ per
// locale without breaking. Ratings skew 2..5 (a horoscope that tells you "1/5 love" every other day is not fun).
export function reading(signIdx, dateKey) {
  const rng = mulberry32((hash(`${signIdx}|${dateKey}`) ^ 0x9e3779b9) >>> 0);
  const sel = () => rng();                       // a 0..1 phrase/colour selector
  const rate = () => 2 + Math.floor(rng() * 4);  // 2..5 stars
  return {
    open: sel(), focus: sel(), advice: sel(), mood: sel(), color: sel(),
    love: rate(), work: rate(), health: rate(),
    lucky: 1 + Math.floor(rng() * 40),           // a lucky number 1..40
  };
}
