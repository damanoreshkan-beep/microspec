// microspec runtime — sci-fi ambient DSP formulas + station recipes for the "Outposts & Stations" generator.
// Everything here is PURE (no AudioContext) so it unit-tests cleanly; the app builds the Web Audio graph from
// these numbers. The realism lives in the formulas: cents/semitone frequency ratios (equal temperament), a
// detuned-voice spread whose geometric mean stays on the note (so a drone beats around its true pitch, not
// off it), an equal-power crossfade law (constant perceived loudness through a morph) and a perceptual dB
// fader curve. Refs: equal temperament (2^(c/1200)) · constant-power pan law (cos/sin) · dBFS = 20·log10(g).
import { noteFreq } from "./audio.js";

// ---- interval / frequency math (equal temperament) ----
export const centsToRatio = (c) => 2 ** (c / 1200);
export const semiToRatio = (s) => 2 ** (s / 12);
export const beatHz = (f1, f2) => Math.abs(f1 - f2);            // two near-unison tones beat at their difference
export const chord = (rootHz, intervals) => intervals.map((s) => rootHz * semiToRatio(s));

// ---- levels ----
export const dbToGain = (db) => 10 ** (db / 20);
// perceptual fader: 0 → hard mute, 1 → unity (0 dB), tapering to −54 dB near the bottom so the low end of the
// travel is usable instead of jumping from silence to loud (linear gain sliders feel broken for this reason).
export const faderGain = (v) => { const c = Math.max(0, Math.min(1, v)); return c <= 0 ? 0 : dbToGain(-54 * (1 - c)); };

// equal-power crossfade weights for x∈[0,1]: from²+to² = 1 at every point, so a morph holds constant power
// (a linear fade dips ~3 dB through the middle). Used to blend two beds without a loudness sag.
export const equalPower = (x) => { const c = Math.max(0, Math.min(1, x)); return { from: Math.cos(c * Math.PI / 2), to: Math.sin(c * Math.PI / 2) }; };

// detuned voices: `voices` tones spread symmetrically across `spreadCents`, centred on `base`. The spread is
// geometric (in cents), so the geometric mean of the voices is exactly `base` — the cluster beats *around*
// the true pitch. Returns ascending frequencies.
export function detune(base, voices, spreadCents) {
  if (voices <= 1) return [base];
  const out = [];
  for (let i = 0; i < voices; i++) { const t = i / (voices - 1) - 0.5; out.push(base * centsToRatio(t * spreadCents)); }
  return out;
}

// ---- stations (recipes) ----
// Each station is a place with a continuous soundscape. `levels` are the 6 macro beds (0..1); `root`+`iv`
// (three semitone intervals) define the reactor drone chord; `air` is the ventilation band centre (Hz, cold
// rooms sit higher/thinner); `spread` is the reactor beat spread (cents, higher = more unstable/derelict);
// `teleGap` is the mean gap between telemetry blips (ms, lower = busier/more "active"). Moods run focus→sleep.
export const LAYERS = ["hull", "vent", "reactor", "servo", "tele", "deep"];
export const STATIONS = [
  { id: "reactor", icon: "lucide:atom", root: "C1", iv: [0, 7, 12], spread: 9, air: 700, teleGap: 4200, levels: { hull: 0.82, vent: 0.42, reactor: 0.85, servo: 0.3, tele: 0.24, deep: 0.3 } },
  { id: "bridge", icon: "lucide:radar", root: "C2", iv: [0, 7, 12], spread: 7, air: 1150, teleGap: 1700, levels: { hull: 0.46, vent: 0.5, reactor: 0.5, servo: 0.36, tele: 0.72, deep: 0.34 } },
  { id: "observation", icon: "lucide:telescope", root: "G2", iv: [0, 7, 14], spread: 6, air: 1450, teleGap: 3200, levels: { hull: 0.3, vent: 0.56, reactor: 0.4, servo: 0.2, tele: 0.3, deep: 0.62 } },
  { id: "cryo", icon: "lucide:snowflake", root: "C1", iv: [0, 7, 12], spread: 5, air: 1850, teleGap: 6200, levels: { hull: 0.5, vent: 0.5, reactor: 0.3, servo: 0.14, tele: 0.14, deep: 0.42 } },
  { id: "derelict", icon: "lucide:ship-wheel", root: "A1", iv: [0, 1, 7], spread: 16, air: 900, teleGap: 5200, levels: { hull: 0.6, vent: 0.34, reactor: 0.36, servo: 0.46, tele: 0.14, deep: 0.55 } },
  { id: "relay", icon: "lucide:satellite-dish", root: "F2", iv: [0, 7, 12], spread: 7, air: 1300, teleGap: 2300, levels: { hull: 0.26, vent: 0.3, reactor: 0.36, servo: 0.2, tele: 0.42, deep: 0.82 } },
];
export const stationIds = STATIONS.map((s) => s.id);
export const station = (id) => STATIONS.find((s) => s.id === id) || STATIONS[0];

// reactor drone voices: the three chord tones, each split into a beating pair around its true pitch → 6 tones.
export function reactorVoices(st) {
  const rootHz = noteFreq(st.root);
  return chord(rootHz, st.iv).flatMap((f) => detune(f, 2, st.spread));
}
