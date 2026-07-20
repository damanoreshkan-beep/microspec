import * as sat from "./satellite.js";
export { sat };

const R_EARTH = 6378.137;   

export const FALLBACK_TLE = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26200.83077020  .00004561  00000+0  90718-4 0  9991",
  line2: "2 25544  51.6315 138.5480 0006793 315.6343  44.4100 15.49054454576813",
};

export const makeSat = (l1, l2) => sat.twoline2satrec(l1.trim(), l2.trim());

export function parseTleText(txt) {
  const lines = String(txt).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const l1 = lines.find((l) => /^1 /.test(l)), l2 = lines.find((l) => /^2 /.test(l));
  return l1 && l2 ? { line1: l1, line2: l2 } : null;
}

export function subpoint(rec, date) {
  const pv = sat.propagate(rec, date);
  if (!pv || !pv.position || !Number.isFinite(pv.position.x)) return null;
  const geo = sat.eciToGeodetic(pv.position, sat.gstime(date));
  const v = pv.velocity;
  return {
    lat: sat.degreesLat(geo.latitude),
    lon: sat.degreesLong(geo.longitude),
    altKm: geo.height,
    velocityKmh: v ? Math.hypot(v.x, v.y, v.z) * 3600 : 0,
    eci: pv.position,
    sunlit: isSunlit(pv.position, date),
  };
}

export function sunEciUnit(date) {
  const jd = sat.jday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  const n = jd - 2451545.0;                                   
  const g = ((357.529 + 0.98560028 * n) % 360) * Math.PI / 180;
  const L = (280.459 + 0.98564736 * n) % 360;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;   
  const eps = (23.439 - 3.6e-7 * n) * Math.PI / 180;          
  return { x: Math.cos(lambda), y: Math.cos(eps) * Math.sin(lambda), z: Math.sin(eps) * Math.sin(lambda) };
}

export function isSunlit(eci, date) {
  const s = sunEciUnit(date), dot = eci.x * s.x + eci.y * s.y + eci.z * s.z;
  if (dot >= 0) return true;
  const px = eci.x - dot * s.x, py = eci.y - dot * s.y, pz = eci.z - dot * s.z;
  return Math.hypot(px, py, pz) > R_EARTH;
}
