import { noteFreq } from "./audio.js";

export const centsToRatio = (c) => 2 ** (c / 1200);
export const semiToRatio = (s) => 2 ** (s / 12);
export const beatHz = (f1, f2) => Math.abs(f1 - f2);            
export const chord = (rootHz, intervals) => intervals.map((s) => rootHz * semiToRatio(s));

export const dbToGain = (db) => 10 ** (db / 20);
export const faderGain = (v) => { const c = Math.max(0, Math.min(1, v)); return c <= 0 ? 0 : dbToGain(-54 * (1 - c)); };

export const equalPower = (x) => { const c = Math.max(0, Math.min(1, x)); return { from: Math.cos(c * Math.PI / 2), to: Math.sin(c * Math.PI / 2) }; };

export function detune(base, voices, spreadCents) {
  if (voices <= 1) return [base];
  const out = [];
  for (let i = 0; i < voices; i++) { const t = i / (voices - 1) - 0.5; out.push(base * centsToRatio(t * spreadCents)); }
  return out;
}

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

export function reactorVoices(st) {
  const rootHz = noteFreq(st.root);
  return chord(rootHz, st.iv).flatMap((f) => detune(f, 2, st.spread));
}
