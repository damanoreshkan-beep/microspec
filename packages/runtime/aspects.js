
export const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8, nature: "neutral" },
  { type: "sextile", angle: 60, orb: 4, nature: "soft" },
  { type: "square", angle: 90, orb: 6, nature: "hard" },
  { type: "trine", angle: 120, orb: 6, nature: "soft" },
  { type: "opposition", angle: 180, orb: 8, nature: "hard" },
];

const norm360 = (d) => (((d % 360) + 360) % 360);
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

export function aspects(positions, prevLon = null) {
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i], b = positions[j];
      if (a.lon == null || b.lon == null) continue;
      const s = sep(a.lon, b.lon);
      const lum = a.key === "sun" || a.key === "moon" || b.key === "sun" || b.key === "moon";
      for (const asp of ASPECTS) {
        const orb = asp.orb + (lum ? 2 : 0);
        const delta = Math.abs(s - asp.angle);
        if (delta > orb) continue;
        let applying = null;
        const pa = prevLon && prevLon[a.key], pb = prevLon && prevLon[b.key];
        if (pa != null && pb != null) applying = Math.abs(sep(pa, pb) - asp.angle) > delta;
        out.push({ a: a.key, b: b.key, type: asp.type, nature: asp.nature, angle: asp.angle, orb: +delta.toFixed(2), applying });
        break; 
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
