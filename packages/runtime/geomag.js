// microspec runtime — the Earth's magnetic field, from the World Magnetic Model.
//
// Why this exists: a phone's compass points at MAGNETIC north. True north is somewhere else — in Ukraine
// by about +7°, in parts of Alaska by 20° — and the difference is not a constant you can hardcode: it
// depends on where you are, and it drifts every year. Every compass app that draws "N" from the raw
// magnetometer is wrong, quietly, by a bearing error that matters the moment you use it for anything.
//
// WMM2025: a degree-12 spherical-harmonic model of the core field, 90 Gauss coefficient rows plus their
// secular variation, issued by the US NGA and the UK DGC (NOAA NCEI / BGS), epoch 2025.0, valid to the end
// of 2029. The coefficients below are the official WMM2025.COF, unrounded and untouched.
//
// The point is not that the model is famous — it is that NOAA ships 100 official test points with it, so
// this file's correctness is a MEASUREMENT, not a claim. See runtime_test.js: every one of those points is
// asserted, and a sign error or a botched Legendre recursion cannot survive it. That is the same standard
// as groove.js (bjorklund(3,8) IS the tresillo) — implement the rule, then prove it against the authority.
//
//   const { declination, inclination, F } = field(50.45, 30.52, 0.2, 2026.5);   // Kyiv
//   trueBearing = magneticBearing + declination
//
// Refs: NOAA NCEI WMM2025 (WMM2025COF.zip · WMM2025_TestValues.txt) · The US/UK World Magnetic Model for
// 2025-2030: Technical Report, doi:10.25923/prbc-s316.

export const EPOCH = 2025.0;
export const VALID_UNTIL = 2030.0;
const NMAX = 12;

// "n m g h g' h'" — verbatim from WMM2025.COF. g,h in nT; g',h' in nT/year.
const COF = `1 0 -29351.8 0.0 12.0 0.0,1 1 -1410.8 4545.4 9.7 -21.5,2 0 -2556.6 0.0 -11.6 0.0,2 1 2951.1 -3133.6 -5.2 -27.7,2 2 1649.3 -815.1 -8.0 -12.1,3 0 1361.0 0.0 -1.3 0.0,3 1 -2404.1 -56.6 -4.2 4.0,3 2 1243.8 237.5 0.4 -0.3,3 3 453.6 -549.5 -15.6 -4.1,4 0 895.0 0.0 -1.6 0.0,4 1 799.5 278.6 -2.4 -1.1,4 2 55.7 -133.9 -6.0 4.1,4 3 -281.1 212.0 5.6 1.6,4 4 12.1 -375.6 -7.0 -4.4,5 0 -233.2 0.0 0.6 0.0,5 1 368.9 45.4 1.4 -0.5,5 2 187.2 220.2 0.0 2.2,5 3 -138.7 -122.9 0.6 0.4,5 4 -142.0 43.0 2.2 1.7,5 5 20.9 106.1 0.9 1.9,6 0 64.4 0.0 -0.2 0.0,6 1 63.8 -18.4 -0.4 0.3,6 2 76.9 16.8 0.9 -1.6,6 3 -115.7 48.8 1.2 -0.4,6 4 -40.9 -59.8 -0.9 0.9,6 5 14.9 10.9 0.3 0.7,6 6 -60.7 72.7 0.9 0.9,7 0 79.5 0.0 -0.0 0.0,7 1 -77.0 -48.9 -0.1 0.6,7 2 -8.8 -14.4 -0.1 0.5,7 3 59.3 -1.0 0.5 -0.8,7 4 15.8 23.4 -0.1 0.0,7 5 2.5 -7.4 -0.8 -1.0,7 6 -11.1 -25.1 -0.8 0.6,7 7 14.2 -2.3 0.8 -0.2,8 0 23.2 0.0 -0.1 0.0,8 1 10.8 7.1 0.2 -0.2,8 2 -17.5 -12.6 0.0 0.5,8 3 2.0 11.4 0.5 -0.4,8 4 -21.7 -9.7 -0.1 0.4,8 5 16.9 12.7 0.3 -0.5,8 6 15.0 0.7 0.2 -0.6,8 7 -16.8 -5.2 -0.0 0.3,8 8 0.9 3.9 0.2 0.2,9 0 4.6 0.0 -0.0 0.0,9 1 7.8 -24.8 -0.1 -0.3,9 2 3.0 12.2 0.1 0.3,9 3 -0.2 8.3 0.3 -0.3,9 4 -2.5 -3.3 -0.3 0.3,9 5 -13.1 -5.2 0.0 0.2,9 6 2.4 7.2 0.3 -0.1,9 7 8.6 -0.6 -0.1 -0.2,9 8 -8.7 0.8 0.1 0.4,9 9 -12.9 10.0 -0.1 0.1,10 0 -1.3 0.0 0.1 0.0,10 1 -6.4 3.3 0.0 0.0,10 2 0.2 0.0 0.1 -0.0,10 3 2.0 2.4 0.1 -0.2,10 4 -1.0 5.3 -0.1 0.1,10 5 -0.6 -9.1 -0.3 -0.1,10 6 -0.9 0.4 0.0 0.1,10 7 1.5 -4.2 -0.1 0.0,10 8 0.9 -3.8 -0.1 -0.1,10 9 -2.7 0.9 -0.0 0.2,10 10 -3.9 -9.1 -0.0 -0.0,11 0 2.9 0.0 0.0 0.0,11 1 -1.5 0.0 -0.0 -0.0,11 2 -2.5 2.9 0.0 0.1,11 3 2.4 -0.6 0.0 -0.0,11 4 -0.6 0.2 0.0 0.1,11 5 -0.1 0.5 -0.1 -0.0,11 6 -0.6 -0.3 0.0 -0.0,11 7 -0.1 -1.2 -0.0 0.1,11 8 1.1 -1.7 -0.1 -0.0,11 9 -1.0 -2.9 -0.1 0.0,11 10 -0.2 -1.8 -0.1 0.0,11 11 2.6 -2.3 -0.1 0.0,12 0 -2.0 0.0 0.0 0.0,12 1 -0.2 -1.3 0.0 -0.0,12 2 0.3 0.7 0.0 0.0,12 3 1.2 1.0 -0.0 -0.1,12 4 -1.3 -1.4 -0.0 0.1,12 5 0.6 -0.0 -0.0 -0.0,12 6 0.6 0.6 0.1 -0.0,12 7 0.5 -0.1 -0.0 -0.0,12 8 -0.1 0.8 0.0 0.0,12 9 -0.4 0.1 0.0 0.0,12 10 -0.2 -1.0 -0.1 -0.0,12 11 -1.3 0.1 -0.0 0.0,12 12 -0.7 0.2 -0.1 -0.1`;

const g0 = [], h0 = [], gsv = [], hsv = [];
for (let n = 0; n <= NMAX; n++) { g0[n] = new Array(NMAX + 1).fill(0); h0[n] = new Array(NMAX + 1).fill(0); gsv[n] = new Array(NMAX + 1).fill(0); hsv[n] = new Array(NMAX + 1).fill(0); }
for (const row of COF.split(",")) {
  const [n, m, g, h, dg, dh] = row.split(" ").map(Number);
  g0[n][m] = g; h0[n][m] = h; gsv[n][m] = dg; hsv[n][m] = dh;
}

// WGS84 + the geomagnetic reference radius the model is defined against.
const A = 6378.137, B = 6356.7523142, RE = 6371.2;
const A2 = A * A, B2 = B * B, C2 = A2 - B2, A4 = A2 * A2, B4 = B2 * B2, C4 = A4 - B4;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// Schmidt semi-normalisation constants, precomputed once: sqrt((2 - δ(m,0)) (n-m)! / (n+m)!) folded into
// the recursion below in the usual normalised form.
const SQ = [];
for (let n = 0; n <= NMAX + 1; n++) { SQ[n] = []; for (let m = 0; m <= NMAX + 1; m++) SQ[n][m] = Math.sqrt(n * n - m * m); }

// field — X (north), Y (east), Z (down) in nT at a geodetic point, plus the derived angles.
// lat/lon in degrees, altitude in KILOMETRES above the WGS84 ellipsoid, year as a decimal year.
export function field(latDeg, lonDeg, altKm = 0, year = EPOCH) {
  const dt = year - EPOCH;
  const rlon = lonDeg * D2R, rlat = latDeg * D2R;
  const srlon = Math.sin(rlon), crlon = Math.cos(rlon);
  const srlat = Math.sin(rlat), crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat, crlat2 = crlat * crlat;

  // Geodetic → geocentric spherical. The model lives on a sphere; the user lives on an ellipsoid, and
  // skipping this conversion is worth tenths of a degree of declination — small, and exactly the kind of
  // small that a test point catches and a demo does not.
  const q = Math.sqrt(A2 - C2 * srlat2);
  const q1 = altKm * q;
  const q2 = ((q1 + A2) / (q1 + B2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r = Math.sqrt(altKm * altKm + 2 * q1 + (A4 - C4 * srlat2) / (q * q));
  const d = Math.sqrt(A2 * crlat2 + B2 * srlat2);
  const ca = (altKm + d) / r;                     // rotation back to geodetic
  const sa = C2 * crlat * srlat / (r * d);

  const sp = [0, srlon], cp = [1, crlon];
  for (let m = 2; m <= NMAX; m++) { sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]; cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1]; }

  // Schmidt semi-normalised associated Legendre P(n,m)(cos θ) and dP/dθ, by the standard recursions.
  const P = [], dP = [];
  for (let n = 0; n <= NMAX; n++) { P[n] = new Array(NMAX + 1).fill(0); dP[n] = new Array(NMAX + 1).fill(0); }
  P[0][0] = 1; dP[0][0] = 0;
  for (let n = 1; n <= NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        // The sectoral recursion is only valid from n=2. Schmidt fixes P(1,1) = sinθ exactly; starting the
        // recursion at n=1 scales it by sqrt(1/2) and every sectoral term after it inherits the error —
        // which reads as a field of almost the right STRENGTH pointing in the wrong DIRECTION. All 100 NOAA
        // test points caught it; none of them would have if this file only had a demo behind it.
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

  let Xp = 0, Yp = 0, Zp = 0;                     // geocentric north / east / down
  for (let n = 1; n <= NMAX; n++) {
    const aor = (RE / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const g = g0[n][m] + dt * gsv[n][m];
      const h = h0[n][m] + dt * hsv[n][m];
      const cosml = cp[m], sinml = sp[m];
      // += , not -=. θ is the geocentric COLATITUDE, so dP/dθ already points south; negating it again puts
      // the north component backwards — which leaves |X| exact, H exact, F exact, inclination exact, and
      // only the DECLINATION reversed. Every scalar check passes and the one thing a compass is for is
      // upside down. It took the reference values to see: Y and Z matched to the last digit while X was
      // exactly negated.
      Xp += aor * (g * cosml + h * sinml) * dP[n][m];
      Zp -= aor * (n + 1) * (g * cosml + h * sinml) * P[n][m];
      Yp += aor * m * (g * sinml - h * cosml) * (st !== 0 ? P[n][m] / st : dP[n][m]);
    }
  }

  // Rotate the geocentric frame back onto the geodetic one. The sign of `sa` is not a convention to pick:
  // it was solved out of the reference data. sa is tiny (~3e-3), so getting it backwards costs ~80 nT here
  // — invisible in a demo, and exactly the sort of error that survives every plausibility check.
  const X = Xp * ca + Zp * sa;
  const Z = -Xp * sa + Zp * ca;
  const Y = Yp;

  const H = Math.hypot(X, Y);
  return {
    X, Y, Z, H,
    F: Math.hypot(H, Z),
    declination: Math.atan2(Y, X) * R2D,          // + = magnetic north lies EAST of true north
    inclination: Math.atan2(Z, H) * R2D,
  };
}

// declination — the only number a compass actually needs: add it to a magnetic bearing to get a true one.
export const declination = (lat, lon, altKm = 0, year = EPOCH) => field(lat, lon, altKm, year).declination;

// decimalYear — the model is a function of time, not a snapshot; a compass that ignores this is stale by
// design. Pass a Date; get what the WMM wants.
export const decimalYear = (d = new Date()) => {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
};

// inRange — WMM2025 is only valid 2025.0–2030.0. Outside that the coefficients are extrapolation, and the
// honest thing is to say so rather than quietly keep drawing an arrow.
export const inRange = (year = decimalYear()) => year >= EPOCH && year < VALID_UNTIL;

// Compose a magnetic heading with the local declination into a true one. The whole correction is this
// single line — which is exactly why it belongs in one place: spread across apps it is one addition each
// of them can get backwards (the sign of declination is east-positive, so it ADDS) or simply never do.
// A null declination means no position, hence no model, hence no correction: the heading stays magnetic.
export const trueFrom = (magneticDeg, dec) => ((dec == null ? magneticDeg : magneticDeg + dec) % 360 + 360) % 360;
