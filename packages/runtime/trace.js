// microspec runtime — trace geometry: a series of position fixes → something drawable and measurable.
//
// The app owns taste, this owns the maths. That split is why the projection and the fit are unit-tested
// here rather than eyeballed on a phone, and why `share` exists at all: every gate the farm has measures
// overflow, so a drawing that uses a tenth of its stage passes all of them.
//
// A fix is `{ lat, lon, at }` (+ whatever the caller carries). Metres everywhere, degrees never.

const R = 6371008.8;                       // IUGG mean radius
const rad = (d) => (d * Math.PI) / 180;
export const M_PER_DEG_LAT = (R * Math.PI) / 180;
export const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos(rad(lat));

// Haversine. Equirectangular is tempting at a day's scale and is what `project` uses for DRAWING, but a
// distance readout is a claim about the world and gets the exact formula.
export function distanceM(a, b) {
  if (!a || !b) return 0;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Sums CONSECUTIVE fixes, so a gap is counted as a straight line across it. Pass one segment at a time
// (see `segments`) whenever the answer is shown to a user as a distance they travelled.
export function length(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1], points[i]);
  return m;
}

export function bbox(points) {
  if (!points || !points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

export const centre = (box) => box && ({ lat: (box.minLat + box.maxLat) / 2, lon: (box.minLon + box.maxLon) / 2 });

/** {w, h} in metres. Longitude is measured at the box's centre latitude, not at the equator. */
export function spanM(box) {
  if (!box) return { w: 0, h: 0 };
  return {
    w: (box.maxLon - box.minLon) * mPerDegLon(centre(box).lat),
    h: (box.maxLat - box.minLat) * M_PER_DEG_LAT,
  };
}

/** A box of a fixed metre span around a point — how a grid of days shares ONE scale, so a 2 km day
 *  draws smaller than a 40 km one instead of every cell being normalised into the same-sized lie. */
export function boxAround(c, w, h) {
  const dLat = h / 2 / M_PER_DEG_LAT;
  const dLon = w / 2 / mPerDegLon(c.lat);
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLon: c.lon - dLon, maxLon: c.lon + dLon };
}

/**
 * Split into strokes that may be drawn as continuous lines. Two different faults produce the same
 * straight line through untravelled ground: the recorder was not listening (a time gap), and a fix
 * landed somewhere impossible (a jump). Both end a stroke.
 */
export function segments(points, { maxGapMs = 300000, maxJumpM = 500 } = {}) {
  const out = [];
  let cur = [];
  for (const p of points) {
    const prev = cur[cur.length - 1];
    const broken = prev && ((p.at - prev.at) > maxGapMs || distanceM(prev, p) > maxJumpM);
    if (broken) { out.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Douglas–Peucker with the tolerance in METRES. A recorded day is thousands of fixes; a poster is a
 *  few hundred, and the difference is invisible at any size a phone or a sheet of paper can show. */
export function simplify(points, epsilonM = 8) {
  if (!points || points.length < 3) return points ? points.slice() : [];
  const lat0 = points[0].lat;
  const kx = mPerDegLon(lat0), ky = M_PER_DEG_LAT;
  const x = points.map((p) => p.lon * kx), y = points.map((p) => p.lat * ky);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const dx = x[hi] - x[lo], dy = y[hi] - y[lo];
    const den = Math.hypot(dx, dy);
    let far = -1, best = epsilonM;
    for (let i = lo + 1; i < hi; i++) {
      // Degenerate span (start === end) has no perpendicular; the radial distance is the right measure.
      const d = den === 0
        ? Math.hypot(x[i] - x[lo], y[i] - y[lo])
        : Math.abs(dy * (x[i] - x[lo]) - dx * (y[i] - y[lo])) / den;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([lo, far], [far, hi]); }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Project onto a `width × height` stage, aspect preserved and centred, y growing downward like a screen.
 * Equirectangular: over a day's movement the distortion is far below a pixel, and unlike Mercator it
 * keeps north-south and east-west at the same scale, which is what makes the SHAPE of a walk true.
 *
 * `box` is the geographic window — pass a shared one (see `boxAround`) to draw many days at one scale.
 */
export function project(points, { box, width, height, pad = 0 } = {}) {
  if (!points || !points.length || !box) return [];
  const c = centre(box), kx = mPerDegLon(c.lat);
  const span = spanM(box);
  const w = Math.max(0, width - 2 * pad), h = Math.max(0, height - 2 * pad);
  // A single fix, or a day spent in one building, has no span to scale by — it belongs at the centre.
  const k = (span.w > 0 || span.h > 0)
    ? Math.min(span.w > 0 ? w / span.w : Infinity, span.h > 0 ? h / span.h : Infinity)
    : 0;
  const cx = pad + w / 2, cy = pad + h / 2;
  return points.map((p) => ({
    x: cx + (p.lon - c.lon) * kx * k,
    y: cy - (p.lat - c.lat) * M_PER_DEG_LAT * k,
  }));
}

/**
 * What fraction of the stage the ink actually spans, per axis. Every gate in this farm is one-sided —
 * it fails an element for being too big and says nothing about one that is too small — so an instrument
 * that under-uses its stage ships looking timid and nobody's check ever fires. Assert this instead.
 */
export function share(pts, width, height) {
  if (!pts || !pts.length || !width || !height) return { w: 0, h: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { w: (maxX - minX) / width, h: (maxY - minY) / height };
}

/** Longest pause between consecutive fixes, and where it sits — a day is mostly its stops. */
export function stops(points, { minMs = 240000, radiusM = 60 } = {}) {
  const out = [];
  let i = 0;
  while (i < points.length) {
    let j = i + 1;
    while (j < points.length && distanceM(points[i], points[j]) <= radiusM) j++;
    const ms = points[j - 1].at - points[i].at;
    if (j - i > 1 && ms >= minMs) {
      out.push({ at: points[i].at, ms, lat: points[i].lat, lon: points[i].lon });
      i = j;
    } else i++;
  }
  return out;
}
