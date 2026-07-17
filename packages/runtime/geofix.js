
export const BIAS_FRAC = 0.5;
const R95 = 2.4477;
const MPD_LAT = 110540;                                   
const mpdLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

const offs = (o, p) => ({ x: (p.lng - o.lng) * mpdLng(o.lat), y: (p.lat - o.lat) * MPD_LAT });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function stationaryTail(buf, { now, maxAgeMs = 25000, radiusM = null } = {}) {
  if (!buf?.length) return [];
  const last = buf[buf.length - 1];
  const t = now ?? last.t ?? 0;
  const r = radiusM ?? Math.max(3, (last.accuracy || 10) * 1.5);
  const out = [];
  for (let i = buf.length - 1; i >= 0; i--) {
    const p = buf[i];
    if (t - (p.t ?? 0) > maxAgeMs) break;
    const d = offs(last, p);
    if (Math.hypot(d.x, d.y) > r) break;
    out.push(p);
  }
  return out.reverse();
}

export function meanFix(ss) {
  if (!ss?.length) return null;
  const n = ss.length;
  const lat = ss.reduce((s, p) => s + p.lat, 0) / n;
  const lng = ss.reduce((s, p) => s + p.lng, 0) / n;
  const accs = ss.map((p) => p.accuracy || 0).filter((a) => a > 0);
  const medA = accs.length ? median(accs) : 0;
  const mean = { lat, lng, accuracy: medA, n };

  const alts = ss.map((p) => p.altitude).filter((a) => typeof a === "number" && isFinite(a));
  if (alts.length) mean.altitude = alts.reduce((s, a) => s + a, 0) / alts.length;
  if (n < 2) return mean;

  const o = { lat, lng };
  const q = ss.map((p) => offs(o, p));
  const vx = q.reduce((s, p) => s + p.x * p.x, 0) / (n - 1);   
  const vy = q.reduce((s, p) => s + p.y * p.y, 0) / (n - 1);
  const sem95 = R95 * Math.sqrt((vx + vy) / 2 / n);            
  const floor = BIAS_FRAC * medA;                             
  mean.accuracy = medA ? Math.min(medA, Math.hypot(sem95, floor)) : sem95;
  return mean;
}

export const segErr = (a, b) => Math.hypot(a?.accuracy || 0, b?.accuracy || 0);

export const totalErr = (errs) => Math.sqrt(errs.reduce((s, e) => s + e * e, 0));

export const ACC_LIMIT = 30;
export const usableFix = (p, limit = ACC_LIMIT) => !!p && typeof p.accuracy === "number" && p.accuracy > 0 && p.accuracy <= limit;
