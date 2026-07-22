// microspec runtime — GSM downlink band model for the HackRF band scanner (app gsmscan). PURE (no DOM/USB),
// so it mounts in preflight, runs in the worker, and is unit-tested. It turns a stitched band power spectrum
// into per-ARFCN carrier powers and picks the active ones. It does NOT decode Cell-IDs or any subscriber data
// — that needs the full gr-gsm stack and is infeasible in-browser. See docs/research/gsm-band-scanner.md.
// ARFCN↔freq per 3GPP TS 45.005; channel spacing 200 kHz.

export const CHAN_HZ = 200_000;
export const BANDS = {
  gsm900: { key: "gsm900", label: "GSM 900", dlLo: 935.2e6, dlHi: 960.0e6, arfcnLo: 1, arfcnHi: 124 },
  dcs1800: { key: "dcs1800", label: "DCS 1800", dlLo: 1805.2e6, dlHi: 1879.8e6, arfcnLo: 512, arfcnHi: 885 },
};

// downlink centre frequency (Hz) of ARFCN n in a band
export function arfcnToFreq(bandKey, n) {
  if (bandKey === "gsm900") return (935.0 + 0.2 * n) * 1e6;
  if (bandKey === "dcs1800") return (1805.2 + 0.2 * (n - 512)) * 1e6;
  return NaN;
}
// nearest ARFCN to a downlink frequency
export function freqToArfcn(bandKey, f) {
  const mhz = f / 1e6;
  if (bandKey === "gsm900") return Math.round((mhz - 935.0) / 0.2);
  if (bandKey === "dcs1800") return 512 + Math.round((mhz - 1805.2) / 0.2);
  return NaN;
}

// spectrum = { f0, df, db: Float32Array } — power (dB) at frequencies f0 + i·df (a stitched band profile).
// Returns per-ARFCN power = peak within ±100 kHz of each channel centre. ARFCNs with no coverage are skipped.
export function arfcnPowers(bandKey, spectrum) {
  const b = BANDS[bandKey]; if (!b) return [];
  const { f0, df, db } = spectrum, out = [];
  for (let n = b.arfcnLo; n <= b.arfcnHi; n++) {
    const fc = arfcnToFreq(bandKey, n);
    const i0 = Math.max(0, Math.floor((fc - CHAN_HZ / 2 - f0) / df));
    const i1 = Math.min(db.length - 1, Math.ceil((fc + CHAN_HZ / 2 - f0) / df));
    if (i1 < i0) continue;
    let peak = -Infinity; for (let i = i0; i <= i1; i++) if (db[i] > peak) peak = db[i];
    if (Number.isFinite(peak)) out.push({ arfcn: n, freq: fc, db: peak });
  }
  return out;
}

// Active carriers = ARFCNs whose power stands out over the band's own noise floor (adaptive: median + Δ),
// like fmradio's scan. Returned strongest-first. Δ default 8 dB.
export function activeArfcns(powers, delta = 8) {
  if (!powers.length) return [];
  const sorted = powers.map((p) => p.db).sort((a, b) => a - b);
  const floor = sorted[sorted.length >> 1];                         // median
  return powers.filter((p) => p.db > floor + delta).sort((a, b) => b.db - a.db);
}

// Likely-BCCH (C0) flag: the BCCH carrier transmits at CONSTANT power on all timeslots, so its per-ARFCN power
// is STEADY across sweeps while traffic carriers fluctuate. Given a short power history per ARFCN, low variance
// + active ⇒ likely BCCH. history: number[] of recent dB readings for one ARFCN.
export function steadyScore(history) {
  const n = history.length; if (n < 3) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / n;
  const varr = history.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return 1 / (1 + varr);                                            // →1 steady, →0 fluctuating
}
