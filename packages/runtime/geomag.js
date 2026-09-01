/* @ts-self-types="./geomag.d.ts" */
/**
 * The Earth's magnetic field from the World Magnetic Model (WMM2025), so a compass can turn a magnetic
 * bearing into a true one — the declination depends on where you are and drifts every year, and it is
 * proven against NOAA's 100 official test points rather than a demo. Exports `field` (X/Y/Z/H/F plus
 * declination and inclination), `declination`, `trueFrom`, `decimalYear`, `inRange` and the
 * `EPOCH`/`VALID_UNTIL` bounds.
 * @module
 */

/** The model epoch as a decimal year; secular variation is applied relative to it. */
export const EPOCH = 2025.0;
/** End of the model's validity as a decimal year (exclusive); beyond it the coefficients are extrapolation. */
export const VALID_UNTIL = 2030.0;
const NMAX = 12;

const COF = `1 0 -29351.8 0.0 12.0 0.0,1 1 -1410.8 4545.4 9.7 -21.5,2 0 -2556.6 0.0 -11.6 0.0,2 1 2951.1 -3133.6 -5.2 -27.7,2 2 1649.3 -815.1 -8.0 -12.1,3 0 1361.0 0.0 -1.3 0.0,3 1 -2404.1 -56.6 -4.2 4.0,3 2 1243.8 237.5 0.4 -0.3,3 3 453.6 -549.5 -15.6 -4.1,4 0 895.0 0.0 -1.6 0.0,4 1 799.5 278.6 -2.4 -1.1,4 2 55.7 -133.9 -6.0 4.1,4 3 -281.1 212.0 5.6 1.6,4 4 12.1 -375.6 -7.0 -4.4,5 0 -233.2 0.0 0.6 0.0,5 1 368.9 45.4 1.4 -0.5,5 2 187.2 220.2 0.0 2.2,5 3 -138.7 -122.9 0.6 0.4,5 4 -142.0 43.0 2.2 1.7,5 5 20.9 106.1 0.9 1.9,6 0 64.4 0.0 -0.2 0.0,6 1 63.8 -18.4 -0.4 0.3,6 2 76.9 16.8 0.9 -1.6,6 3 -115.7 48.8 1.2 -0.4,6 4 -40.9 -59.8 -0.9 0.9,6 5 14.9 10.9 0.3 0.7,6 6 -60.7 72.7 0.9 0.9,7 0 79.5 0.0 -0.0 0.0,7 1 -77.0 -48.9 -0.1 0.6,7 2 -8.8 -14.4 -0.1 0.5,7 3 59.3 -1.0 0.5 -0.8,7 4 15.8 23.4 -0.1 0.0,7 5 2.5 -7.4 -0.8 -1.0,7 6 -11.1 -25.1 -0.8 0.6,7 7 14.2 -2.3 0.8 -0.2,8 0 23.2 0.0 -0.1 0.0,8 1 10.8 7.1 0.2 -0.2,8 2 -17.5 -12.6 0.0 0.5,8 3 2.0 11.4 0.5 -0.4,8 4 -21.7 -9.7 -0.1 0.4,8 5 16.9 12.7 0.3 -0.5,8 6 15.0 0.7 0.2 -0.6,8 7 -16.8 -5.2 -0.0 0.3,8 8 0.9 3.9 0.2 0.2,9 0 4.6 0.0 -0.0 0.0,9 1 7.8 -24.8 -0.1 -0.3,9 2 3.0 12.2 0.1 0.3,9 3 -0.2 8.3 0.3 -0.3,9 4 -2.5 -3.3 -0.3 0.3,9 5 -13.1 -5.2 0.0 0.2,9 6 2.4 7.2 0.3 -0.1,9 7 8.6 -0.6 -0.1 -0.2,9 8 -8.7 0.8 0.1 0.4,9 9 -12.9 10.0 -0.1 0.1,10 0 -1.3 0.0 0.1 0.0,10 1 -6.4 3.3 0.0 0.0,10 2 0.2 0.0 0.1 -0.0,10 3 2.0 2.4 0.1 -0.2,10 4 -1.0 5.3 -0.1 0.1,10 5 -0.6 -9.1 -0.3 -0.1,10 6 -0.9 0.4 0.0 0.1,10 7 1.5 -4.2 -0.1 0.0,10 8 0.9 -3.8 -0.1 -0.1,10 9 -2.7 0.9 -0.0 0.2,10 10 -3.9 -9.1 -0.0 -0.0,11 0 2.9 0.0 0.0 0.0,11 1 -1.5 0.0 -0.0 -0.0,11 2 -2.5 2.9 0.0 0.1,11 3 2.4 -0.6 0.0 -0.0,11 4 -0.6 0.2 0.0 0.1,11 5 -0.1 0.5 -0.1 -0.0,11 6 -0.6 -0.3 0.0 -0.0,11 7 -0.1 -1.2 -0.0 0.1,11 8 1.1 -1.7 -0.1 -0.0,11 9 -1.0 -2.9 -0.1 0.0,11 10 -0.2 -1.8 -0.1 0.0,11 11 2.6 -2.3 -0.1 0.0,12 0 -2.0 0.0 0.0 0.0,12 1 -0.2 -1.3 0.0 -0.0,12 2 0.3 0.7 0.0 0.0,12 3 1.2 1.0 -0.0 -0.1,12 4 -1.3 -1.4 -0.0 0.1,12 5 0.6 -0.0 -0.0 -0.0,12 6 0.6 0.6 0.1 -0.0,12 7 0.5 -0.1 -0.0 -0.0,12 8 -0.1 0.8 0.0 0.0,12 9 -0.4 0.1 0.0 0.0,12 10 -0.2 -1.0 -0.1 -0.0,12 11 -1.3 0.1 -0.0 0.0,12 12 -0.7 0.2 -0.1 -0.1`;

const g0 = [], h0 = [], gsv = [], hsv = [];
for (let n = 0; n <= NMAX; n++) { g0[n] = new Array(NMAX + 1).fill(0); h0[n] = new Array(NMAX + 1).fill(0); gsv[n] = new Array(NMAX + 1).fill(0); hsv[n] = new Array(NMAX + 1).fill(0); }
for (const row of COF.split(",")) {
  const [n, m, g, h, dg, dh] = row.split(" ").map(Number);
  g0[n][m] = g; h0[n][m] = h; gsv[n][m] = dg; hsv[n][m] = dh;
}

const A = 6378.137, B = 6356.7523142, RE = 6371.2;
const A2 = A * A, B2 = B * B, C2 = A2 - B2, A4 = A2 * A2, B4 = B2 * B2, C4 = A4 - B4;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

const SQ = [];
for (let n = 0; n <= NMAX + 1; n++) { SQ[n] = []; for (let m = 0; m <= NMAX + 1; m++) SQ[n][m] = Math.sqrt(n * n - m * m); }

/**
 * Evaluates the WMM2025 field at a geodetic point.
 * @param latDeg geodetic latitude in degrees
 * @param lonDeg longitude in degrees
 * @param altKm altitude in kilometres above the WGS84 ellipsoid
 * @param year decimal year (see `decimalYear`)
 * @returns `{ X, Y, Z, H, F, declination, inclination }` — components in nT, angles in degrees
 *   (declination positive when magnetic north lies east of true north)
 */
export function field(latDeg, lonDeg, altKm = 0, year = EPOCH) {
  const dt = year - EPOCH;
  const rlon = lonDeg * D2R, rlat = latDeg * D2R;
  const srlon = Math.sin(rlon), crlon = Math.cos(rlon);
  const srlat = Math.sin(rlat), crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat, crlat2 = crlat * crlat;

  const q = Math.sqrt(A2 - C2 * srlat2);
  const q1 = altKm * q;
  const q2 = ((q1 + A2) / (q1 + B2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r = Math.sqrt(altKm * altKm + 2 * q1 + (A4 - C4 * srlat2) / (q * q));
  const d = Math.sqrt(A2 * crlat2 + B2 * srlat2);
  const ca = (altKm + d) / r;                     
  const sa = C2 * crlat * srlat / (r * d);

  const sp = [0, srlon], cp = [1, crlon];
  for (let m = 2; m <= NMAX; m++) { sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]; cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1]; }

  const P = [], dP = [];
  for (let n = 0; n <= NMAX; n++) { P[n] = new Array(NMAX + 1).fill(0); dP[n] = new Array(NMAX + 1).fill(0); }
  P[0][0] = 1; dP[0][0] = 0;
  for (let n = 1; n <= NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        if (n === 1) { P[1][1] = st; dP[1][1] = ct; continue; }
        const k = Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * (st * P[n - 1][n - 1]);
        dP[n][n] = k * (st * dP[n - 1][n - 1] + ct * P[n - 1][n - 1]);
      } else {
        const k1 = (2 * n - 1) / SQ[n][m];
        const k2 = n - 1 >= m ? SQ[n - 1][m] / SQ[n][m] : 0;
        const Pn2 = n - 2 >= m ? P[n - 2][m] : 0;
        const dPn2 = n - 2 >= m ? dP[n - 2][m] : 0;
        P[n][m] = k1 * ct * P[n - 1][m] - k2 * Pn2;
        dP[n][m] = k1 * (ct * dP[n - 1][m] - st * P[n - 1][m]) - k2 * dPn2;
      }
    }
  }

  let Xp = 0, Yp = 0, Zp = 0;                     
  for (let n = 1; n <= NMAX; n++) {
    const aor = (RE / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const g = g0[n][m] + dt * gsv[n][m];
      const h = h0[n][m] + dt * hsv[n][m];
      const cosml = cp[m], sinml = sp[m];
      Xp += aor * (g * cosml + h * sinml) * dP[n][m];
      Zp -= aor * (n + 1) * (g * cosml + h * sinml) * P[n][m];
      Yp += aor * m * (g * sinml - h * cosml) * (st !== 0 ? P[n][m] / st : dP[n][m]);
    }
  }

  const X = Xp * ca + Zp * sa;
  const Z = -Xp * sa + Zp * ca;
  const Y = Yp;

  const H = Math.hypot(X, Y);
  return {
    X, Y, Z, H,
    F: Math.hypot(H, Z),
    declination: Math.atan2(Y, X) * R2D,          
    inclination: Math.atan2(Z, H) * R2D,
  };
}

/**
 * Magnetic declination at a point, in degrees (east-positive).
 * @param lat geodetic latitude in degrees
 * @param lon longitude in degrees
 * @param altKm altitude in kilometres above the WGS84 ellipsoid
 * @param year decimal year
 * @returns the declination to ADD to a magnetic bearing for a true one
 */
export const declination = (lat, lon, altKm = 0, year = EPOCH) => field(lat, lon, altKm, year).declination;

/**
 * Converts a Date to the decimal year the model takes (UTC, fraction of the year elapsed).
 * @param d the date; defaults to now
 * @returns the decimal year
 */
export const decimalYear = (d = new Date()) => {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
};

/**
 * Whether a decimal year falls inside the model's validity window.
 * @param year decimal year; defaults to now
 * @returns true for EPOCH ≤ year < VALID_UNTIL
 */
export const inRange = (year = decimalYear()) => year >= EPOCH && year < VALID_UNTIL;

/**
 * Composes a magnetic heading with the local declination into a true heading, normalised to 0..360.
 * @param magneticDeg magnetic heading in degrees
 * @param dec declination in degrees, or null/undefined to leave the heading magnetic
 * @returns the true heading in degrees
 */
export const trueFrom = (magneticDeg, dec) => ((dec == null ? magneticDeg : magneticDeg + dec) % 360 + 360) % 360;
