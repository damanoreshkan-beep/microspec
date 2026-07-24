// microspec runtime — generative-ambient music theory. The maths behind "generate an evolving ambient track
// that is mathematically sweet to the ear", so the drift app doesn't reinvent it. Pure functions, zero deps,
// no DOM and no Web Audio → fully unit-testable by the browser-free gate (runtime_test.js). The claim
// "this is consonant, not random" is mechanically PROVEN there. The SYNTHESIS (oscillators, envelopes,
// reverb) lives in the app (apps/drift/synth.js) — it can't run in Deno; only the note/chord SELECTION does.
//
// Grounded in: Plomp–Levelt / Sethares critical-band consonance (small-integer ratios sound sweet because
// partials coincide), 5-limit just intonation, the low-interval limit (thirds muddy in the bass), and Brian
// Eno's asynchronous tape loops (several coprime loop lengths → a combination that never repeats). See
// apps/drift/RESEARCH.md for the full numeric recipe and sources.

import { mulberry32 } from "./groove.js";
import { midiToFreq } from "./audio.js";

export { midiToFreq };

// ---- 1. consonance: score an interval by how "sweet" it is. Plomp–Levelt roughness has local minima exactly
// at the small-integer ratios; this 12-entry lookup (by semitone interval mod 12) captures their ranking so a
// generator can pick the most consonant candidate cheaply. Perfect 5th (3:2) is the sweetest non-octave. ----
export const CONS = [1.00, 0.13, 0.16, 0.20, 0.23, 0.28, 0.10, 0.39, 0.19, 0.26, 0.18, 0.15];
export const consonance = (semitones) => CONS[(((semitones % 12) + 12) % 12)];

// summed pairwise consonance over a set of MIDI pitches — the voicing "sweetness" a voicer maximises.
export function voicingScore(midis) {
  let s = 0;
  for (let i = 0; i < midis.length; i++) for (let j = i + 1; j < midis.length; j++) s += consonance(midis[i] - midis[j]);
  return s;
}

// ---- 2. modes: semitone offsets from the root, one octave. Half-step-free scales (pentatonics, whole-tone,
// yo) are safest for random triggering — ANY subset is consonant. ----
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  majpent: [0, 2, 4, 7, 9],
  minpent: [0, 3, 5, 7, 10],
  whole: [0, 2, 4, 6, 8, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  insen: [0, 1, 5, 7, 10],
  yo: [0, 2, 5, 7, 9],
  kumoi: [0, 2, 3, 7, 9],
};

// ---- 3. lush, non-harsh chord types: intervals (semitones) above the chord root. add9/maj9/sus/quartal keep
// the "shimmer without a clash". Values > 11 deliberately voice tensions an octave up. ----
export const CHORDS = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  add9: [0, 4, 7, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  six9: [0, 4, 7, 9, 14],
  quartal: [0, 5, 10, 15],
};

// Low-interval limit: below ~C3 (MIDI 48) only roots/5ths/octaves stay clear; thirds and 9ths turn to mud.
// So the bass voice may sit low, but every UPPER voice is lifted to at least this floor.
export const VOICE_FLOOR = 48;   // C3
export const VOICE_CEIL = 88;    // E6 — keep the pad out of the piercing top

// ---- 4. build a scale as concrete MIDI pitches across `octaves`, from a root MIDI note ----
export function buildScale(rootMidi, modeKey, octaves = 3) {
  const steps = MODES[modeKey] || MODES.major;
  const out = [];
  for (let o = 0; o < octaves; o++) for (const s of steps) out.push(rootMidi + s + 12 * o);
  return out;
}

// pitch classes of a chord (for membership tests)
export const chordPitchClasses = (rootMidi, intervals) => new Set(intervals.map((iv) => (((rootMidi + iv) % 12) + 12) % 12));

// ---- 5. voice-leading: place a chord so it (a) anchors the root as the bass, (b) lifts every upper voice
// above VOICE_FLOOR (the low-interval limit → no muddy thirds), and (c) minimises total semitone motion from
// the previous voicing (each upper voice octave-shifted to hug its nearest previous pitch → the "held drone"
// glue). Pure + deterministic. Returns MIDI pitches ascending. ----
export function voiceLead(prev, chordRootMidi, intervals) {
  const raw = intervals.map((iv) => chordRootMidi + iv);
  const bass = raw[0];
  const uppers = raw.slice(1).map((m) => {
    let best = m;
    // lift above the floor first
    while (best < VOICE_FLOOR) best += 12;
    if (prev && prev.length) {
      // among octave placements that stay in [FLOOR, CEIL], pick the one closest to any previous pitch
      let bd = Infinity, pick = best;
      for (let cand = best - 12; cand <= VOICE_CEIL; cand += 12) {
        if (cand < VOICE_FLOOR) continue;
        const d = Math.min(...prev.map((p) => Math.abs(p - cand)));
        if (d < bd) { bd = d; pick = cand; }
      }
      best = pick;
    } else {
      while (best > VOICE_CEIL) best -= 12;
      if (best < VOICE_FLOOR) best += 12;
    }
    return best;
  });
  return [bass, ...uppers].sort((a, b) => a - b);
}

// ---- 6. sparse chord change (non-functional / ambient): pick the next chord index from the style's palette,
// weighted, avoiding an immediate repeat when the palette has options. Deterministic given the rng. ----
export function pickChord(palette, currentIdx, rng) {
  if (!palette.length) return 0;
  if (palette.length === 1) return 0;
  const choices = [];
  for (let i = 0; i < palette.length; i++) if (i !== currentIdx) choices.push(i);
  return choices[Math.floor(rng() * choices.length) % choices.length];
}

// ---- 7. probabilistic sparkle note: draw a chord tone and lift it into the sparkle register (octaves above
// the pad), weighted toward the low chord tones (root/3rd/5th) so it always lands consonant. Deterministic. ----
export function sparkleNote(chordRootMidi, intervals, sparkleOctaves, rng) {
  const iv = intervals[Math.floor(rng() * intervals.length) % intervals.length];
  let m = chordRootMidi + iv + 12 * sparkleOctaves;
  while (m < 60) m += 12;
  while (m > 96) m -= 12;
  return m;
}

// ---- 8. Eno asynchronous loops: several loop lengths (seconds) that are mutually near-coprime, each jittered
// ±5 % so no two sessions align and the combined pattern period is effectively unbounded. `count` loops drive
// the sparkle layer; each carries a random phase offset. Deterministic given the rng. ----
export const ENO_BASE = [17.3, 19.7, 23.1, 29.3, 31.7, 37.1, 41.3];
export function enoLoops(count, rng) {
  const n = Math.max(1, Math.min(ENO_BASE.length, count | 0));
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = ENO_BASE[i] * (1 + 0.05 * (rng() * 2 - 1));
    out.push({ len, phase: rng() * len });
  }
  return out;
}
// density (0..1) → how many sparkle loops run
export const loopsForDensity = (density) => Math.max(3, Math.min(ENO_BASE.length, Math.round(3 + density * 4)));

// ---- 9. the ten styles — each a fully distinct "world": scale + harmony + tuning + register + FX + signature
// sound-pack + a signature hue (colour = meaning; the viz tints to it). Musical fields drive the pure
// selection above; the mix fields (cutoff/reverb/delay/atk/rel/texture) are plain data the app's synth reads.
// chords are [scaleDegreeIndex, chordType]; the chord root = padRoot + MODES[scale][degree]. ----
export const STYLES = [
  { id: "deepspace", key: "sDeepspace", hue: 262, root: 36, scale: "minor", tuning: "ji",
    chords: [[0, "min7"], [0, "sus2"], [3, "quartal"], [4, "sus2"]], dwell: [16, 32], sparkleOct: 2,
    pack: "sinedrone", drone: true, texture: "pink", textureGain: 0.05,
    cutoff: 320, cutoffLfo: { rate: 0.03, depth: 600 }, reverb: 0.55, delayTime: 0.8, delayFb: 0.55, delaySend: 0.3,
    atk: 8, rel: 12, density: 0.3 },
  { id: "tapeloop", key: "sTapeloop", hue: 33, root: 41, scale: "major", tuning: "et",
    chords: [[0, "maj7"], [3, "add9"], [5, "min7"], [1, "min7"]], dwell: [10, 22], sparkleOct: 2,
    pack: "warmpad", drone: true, texture: "none", textureGain: 0,
    cutoff: 1000, cutoffLfo: { rate: 0.05, depth: 500 }, reverb: 0.35, delayTime: 0.5, delayFb: 0.4, delaySend: 0.25,
    atk: 4, rel: 8, density: 0.35 },
  { id: "glass", key: "sGlass", hue: 190, root: 62, scale: "lydian", tuning: "et",
    chords: [[0, "maj9"], [0, "add9"], [4, "six9"]], dwell: [8, 16], sparkleOct: 1,
    pack: "glassbell", drone: false, texture: "none", textureGain: 0,
    cutoff: 2500, cutoffLfo: { rate: 0.08, depth: 1500 }, reverb: 0.45, delayTime: 0.375, delayFb: 0.5, delaySend: 0.3,
    atk: 1.5, rel: 5, density: 0.45 },
  { id: "oceanic", key: "sOceanic", hue: 205, root: 33, scale: "minpent", tuning: "et",
    chords: [[0, "sus2"], [0, "sus4"], [3, "sus2"]], dwell: [14, 28], sparkleOct: 2,
    pack: "granular", drone: true, texture: "sweep", textureGain: 0.09,
    cutoff: 420, cutoffLfo: { rate: 0.03, depth: 2000 }, reverb: 0.5, delayTime: 0.7, delayFb: 0.45, delaySend: 0.3,
    atk: 6, rel: 10, density: 0.3 },
  { id: "zen", key: "sZen", hue: 140, root: 55, scale: "majpent", tuning: "et",
    chords: [[0, "add9"], [0, "sus2"], [3, "add9"]], dwell: [10, 20], sparkleOct: 1,
    pack: "pluck", drone: false, texture: "none", textureGain: 0,
    cutoff: 1800, cutoffLfo: { rate: 0.06, depth: 1200 }, reverb: 0.4, delayTime: 0.45, delayFb: 0.35, delaySend: 0.25,
    atk: 0.02, rel: 1.6, density: 0.4 },
  { id: "choir", key: "sChoir", hue: 286, root: 40, scale: "dorian", tuning: "et",
    chords: [[0, "min9"], [3, "maj7"], [4, "sus4"]], dwell: [12, 26], sparkleOct: 2,
    pack: "choir", drone: true, texture: "pink", textureGain: 0.04,
    cutoff: 900, cutoffLfo: { rate: 0.04, depth: 1300 }, reverb: 0.6, delayTime: 0.6, delayFb: 0.4, delaySend: 0.3,
    atk: 3, rel: 9, density: 0.3 },
  { id: "tanpura", key: "sTanpura", hue: 22, root: 36, scale: "yo", tuning: "ji",
    chords: [[0, "sus2"], [0, "add9"], [3, "sus2"]], dwell: [16, 30], sparkleOct: 1,
    pack: "bowed", drone: true, texture: "none", textureGain: 0,
    cutoff: 1200, cutoffLfo: { rate: 0.04, depth: 900 }, reverb: 0.35, delayTime: 0.5, delayFb: 0.3, delaySend: 0.2,
    atk: 0.01, rel: 4, density: 0.35 },
  { id: "strings", key: "sStrings", hue: 220, root: 50, scale: "minor", tuning: "et",
    chords: [[0, "min7"], [5, "maj7"], [3, "sus4"], [0, "min9"]], dwell: [12, 24], sparkleOct: 1,
    pack: "bowed", drone: true, texture: "none", textureGain: 0,
    cutoff: 1600, cutoffLfo: { rate: 0.05, depth: 1600 }, reverb: 0.5, delayTime: 0.66, delayFb: 0.45, delaySend: 0.3,
    atk: 2, rel: 6, density: 0.3 },
  { id: "lofi", key: "sLofi", hue: 46, root: 46, scale: "mixo", tuning: "et",
    chords: [[0, "maj7"], [5, "min7"], [3, "add9"]], dwell: [10, 20], sparkleOct: 1,
    pack: "warmpad", drone: true, texture: "pink", textureGain: 0.06,
    cutoff: 700, cutoffLfo: { rate: 0.04, depth: 650 }, reverb: 0.3, delayTime: 0.43, delayFb: 0.5, delaySend: 0.3,
    atk: 1.5, rel: 4, density: 0.35 },
  { id: "shimmer", key: "sShimmer", hue: 168, root: 57, scale: "lydian", tuning: "et",
    chords: [[0, "maj9"], [0, "six9"], [1, "add9"]], dwell: [8, 16], sparkleOct: 1,
    pack: "supersaw", drone: false, texture: "none", textureGain: 0,
    cutoff: 3000, cutoffLfo: { rate: 0.07, depth: 2500 }, reverb: 0.45, delayTime: 0.3, delayFb: 0.55, delaySend: 0.3,
    atk: 1, rel: 4, density: 0.45 },
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

// chord root MIDI for a style's palette entry
export function chordRoot(style, chordEntry) {
  const steps = MODES[style.scale] || MODES.major;
  const [deg] = chordEntry;
  return style.root + (steps[((deg % steps.length) + steps.length) % steps.length] || 0);
}

// dwell seconds for a chord, given the style range and the rng
export const dwellSeconds = (style, rng) => style.dwell[0] + rng() * (style.dwell[1] - style.dwell[0]);

// mulberry32 re-export so the app seeds the same deterministic RNG the tests use
export { mulberry32 };
