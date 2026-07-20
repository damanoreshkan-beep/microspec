import { rgbToHsl } from "./colour.js";

export const SCALES = {
  penta: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21],          
  minor: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],         
  lydian: [0, 2, 4, 6, 7, 11, 12, 14, 16, 18],         
  dorian: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15],          
  wholetone: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],      
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12, 14, 15],   
  blues: [0, 3, 5, 6, 7, 10, 12, 15, 17, 18],          
};
const ROOT = 48; 

export function hueToNote(hue, scale = SCALES.penta, root = ROOT) {
  const h = ((hue % 360) + 360) % 360;
  const idx = Math.min(scale.length - 1, Math.floor((h / 360) * scale.length));
  return root + scale[idx];
}

export function paletteToChord(palette, scale = SCALES.penta, root = ROOT) {
  const notes = [...new Set((palette || []).map((rgb) => hueToNote(rgbToHsl(rgb)[0], scale, root)))];
  return notes.sort((a, b) => a - b);
}

export function brightnessToCutoff(l) {
  const x = Math.max(0, Math.min(1, l));
  return Math.round(300 * (4000 / 300) ** x);
}

export const satToDetune = (s) => Math.round(Math.max(0, Math.min(1, s)) * 14);
