// chroma.js — colour → music mapping for the synesthesia app ("hear colour"). Pure, unit-tested. The
// scene's dominant palette becomes a chord (each colour's HUE picks a note in a consonant scale, so it
// always sounds musical), and the scene's BRIGHTNESS opens the filter. The audio graph lives in the app;
// the mapping — the part that must be right and testable — lives here.
import { rgbToHsl } from "./colour.js";

// Two octaves of each mode, low→high, so a full hue sweep (0..360) spans a wide, playable range. Degrees
// are semitone offsets from the root.
export const SCALES = {
  penta: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21],   // major pentatonic — no wrong notes
  minor: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],  // natural minor pentatonic-ish, wistful
  lydian: [0, 2, 4, 6, 7, 11, 12, 14, 16, 18],  // bright, floating
};
const ROOT = 48; // C3 — a warm mid-low pad register

// hue (deg) → a MIDI note: split the colour wheel evenly across the scale's degrees.
export function hueToNote(hue, scale = SCALES.penta, root = ROOT) {
  const h = ((hue % 360) + 360) % 360;
  const idx = Math.min(scale.length - 1, Math.floor((h / 360) * scale.length));
  return root + scale[idx];
}

// A palette (array of [r,g,b]) → a sorted, de-duplicated chord of MIDI notes. Colours that map to the same
// note collapse (a scene of one hue is a single sustained note, not a stack of unisons).
export function paletteToChord(palette, scale = SCALES.penta, root = ROOT) {
  const notes = [...new Set((palette || []).map((rgb) => hueToNote(rgbToHsl(rgb)[0], scale, root)))];
  return notes.sort((a, b) => a - b);
}

// scene brightness (0..1) → low-pass cutoff (Hz), exponential 300→4000: darker is muffled, brighter opens up.
export function brightnessToCutoff(l) {
  const x = Math.max(0, Math.min(1, l));
  return Math.round(300 * (4000 / 300) ** x);
}

// saturation (0..1) → detune spread in cents: grey is pure, vivid shimmers.
export const satToDetune = (s) => Math.round(Math.max(0, Math.min(1, s)) * 14);
