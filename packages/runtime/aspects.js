// microspec runtime — astrological aspects: the angular relationships between planets (SYSTEMIC, pure).
//
// A transit chart is not just where the planets ARE, it's how they relate — the aspects are the interpretive
// heart. Pure math, no UI deps, so it unit-tests without an import map (like tarot.js / groove.js). Consumed
// by apps/transit (the wheel chords + the AI reading) and re-exported from astro.js.

// The five Ptolemaic aspects with traditional orbs. `nature`: soft (flow/opportunity), hard (tension),
// neutral (a blend of the two bodies). The orb windows are disjoint, so a pair matches at most one aspect.
export const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8, nature: "neutral" },
  { type: "sextile", angle: 60, orb: 4, nature: "soft" },
  { type: "square", angle: 90, orb: 6, nature: "hard" },
  { type: "trine", angle: 120, orb: 6, nature: "soft" },
  { type: "opposition", angle: 180, orb: 8, nature: "hard" },
];

const norm360 = (d) => (((d % 360) + 360) % 360);
// short-arc separation (0..180) between two ecliptic longitudes.
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

// aspects(positions[, prevLon]) — every aspecting pair among {key, lon} positions, tightest orb first.
// A luminary (Sun/Moon) in the pair widens the orb by 2° (they radiate a wider influence). If a previous-day
// {key: lon} map is given, each aspect is flagged `applying` (orb shrinking toward exact → building the day's
// theme) or separating (fading). `orb` is the distance from exact — smaller = stronger.
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
        break; // bands are disjoint → the first match is the only one
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
