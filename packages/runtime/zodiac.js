// microspec runtime — zodiac sign glyphs (SYSTEMIC). The 12 traditional astrological symbols hand-drawn
// as clean single-weight line art (stroke = currentColor → theme-aware), instead of the inconsistent,
// "cheap" Unicode emoji. Ancient-engraving feel: thin uniform stroke, round joins. Index 0=Aries..11=Pisces.
// Reusable by any astro app (transit wheel now; a natal chart later).
import { html } from "htm/preact";

export const SIGN_PATHS = [
  // ♈ Aries — the ram's horns
  "M12 20V11 M12 11C12 5.6 8 4.6 6.4 6.5 4.9 8.3 6.2 10.8 8.4 10.2 M12 11C12 5.6 16 4.6 17.6 6.5 19.1 8.3 17.8 10.8 15.6 10.2",
  // ♉ Taurus — bull's head: circle + horns
  "M7 15a5 5 0 1 0 10 0 5 5 0 1 0-10 0 M6.5 9.5C6.5 5.5 9.3 4 12 6.2 14.7 4 17.5 5.5 17.5 9.5",
  // ♊ Gemini — the twins
  "M8 5V19 M16 5V19 M6 5C9.5 3.4 14.5 3.4 18 5 M6 19C9.5 20.6 14.5 20.6 18 19",
  // ♋ Cancer — the two claws
  "M4 10C4 7.5 8.5 6 15 9 M4 10a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0 M20 14C20 16.5 15.5 18 9 15 M20 14a1.9 1.9 0 1 1-3.8 0 1.9 1.9 0 1 1 3.8 0",
  // ♌ Leo — mane loop and tail
  "M6.6 16.6a3.3 3.3 0 1 1 4.8-2.9C13.6 8 15.6 7.6 16.9 9.6 18.4 11.9 16.6 15 14 14.2",
  // ♍ Virgo — the maiden
  "M4 8V16 M4 9C4 7 8 7 8 9V16 M8 9C8 7 12 7 12 9V15C12 18 15.5 18 16.5 15 M12 13C13.5 11 17 12 17 15.5",
  // ♎ Libra — the scales
  "M4 18H20 M4 14H8C8 10 16 10 16 14H20",
  // ♏ Scorpio — the stinger
  "M4 8V16 M4 9C4 7 8 7 8 9V16 M8 9C8 7 12 7 12 9V16L18 20 M18 20 14.5 20 M18 20 18 16.5",
  // ♐ Sagittarius — the archer's arrow
  "M5 19 17 7 M17 7 11 7 M17 7 17 13 M8 10 14 16",
  // ♑ Capricorn — the sea-goat
  "M4 8C4 12 7.5 13 9 8.5 9.5 5.5 11 5.5 12 8.5V15C12 18 16 18 16.5 15a2.6 2.6 0 1 0-2.6-1.6",
  // ♒ Aquarius — the water bearer's waves
  "M4 10q1.5-2.5 3 0 1.5 2.5 3 0 1.5-2.5 3 0 1.5 2.5 3 0 M4 15q1.5-2.5 3 0 1.5 2.5 3 0 1.5-2.5 3 0 1.5 2.5 3 0",
  // ♓ Pisces — the two fish
  "M7 5C4 8 4 16 7 19 M17 5C20 8 20 16 17 19 M4 12H20",
];

// modern planetary rulerships (index 0=Aries..11=Pisces): the traditional ruler + the modern outer
// co-ruler where one is assigned — Scorpio = Mars & Pluto, Aquarius = Saturn & Uranus, Pisces = Jupiter &
// Neptune. A planet can rule two signs (Mercury→Gemini+Virgo, Venus→Taurus+Libra, etc.).
export const RULERS = [
  ["mars"], ["venus"], ["mercury"], ["moon"], ["sun"], ["mercury"],
  ["venus"], ["mars", "pluto"], ["jupiter"], ["saturn"], ["saturn", "uranus"], ["jupiter", "neptune"],
];

// a single sign glyph. `cls` sets size + colour (stroke follows currentColor, so it is theme-aware).
export function Sign({ i, cls = "" }) {
  const d = SIGN_PATHS[i];
  if (d == null) return null;
  return html`<svg viewBox="0 0 24 24" class=${cls} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d}></path></svg>`;
}
