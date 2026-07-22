// GSM band scanner DSP worker. Sweeps a downlink band by stepping the HackRF across it (~6 MHz hops at 8 Msps),
// FFTs each capture, stitches a band power profile, and picks out the active carriers (ARFCNs). It receives the
// network's public broadcast energy only — it does NOT decode Cell-IDs or any subscriber data (infeasible
// in-browser; that's the whole gr-gsm stack). Reuses fmradio's FFT + the HackRF driver. See gsm-band-scanner.md.
import { iqFromBytes, powerSpectrum } from "/_rt/fmradio.js";
import { HackRF } from "/_rt/hackrf.js";
import { BANDS, arfcnPowers, activeArfcns, steadyScore } from "/_rt/gsmband.js";

const SR = 8_000_000, FFT = 8192, USABLE = SR * 0.75, STEP = 6_000_000, GRID = 50_000;
const DISP_BINS = 360, ACTIVE_DELTA = 9;
const post = (m, transfer) => self.postMessage(m, transfer || []);

let rx = null, running = false, band = "gsm900", cfg = null;
const hist = {};                                       // ARFCN → recent dB readings (for the BCCH-steadiness flag)

async function run(c) {
  cfg = c; band = c.band || "gsm900";
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  try {
    await rx.open();
    await rx.setSampleRate(SR);
    await rx.setBasebandFilter(7_000_000);
    await rx.setAmp(false); await rx.setLnaGain(c.lna ?? 24); await rx.setVgaGain(c.vga ?? 32);
    await rx.startRx();
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
  running = true; post({ type: "started" });
  sweep();
}

async function sweep() {
  while (running) {
    const b = BANDS[band], f0 = b.dlLo - 5e5, hi = b.dlHi + 5e5, N = Math.ceil((hi - f0) / GRID);
    const prof = new Float32Array(N).fill(-140);
    const binHz = SR / FFT;
    for (let fc = b.dlLo; fc <= b.dlHi + STEP && running; fc += STEP) {
      let bytes;
      try { await rx.setFreq(fc); await rx.read(); bytes = await rx.read(); } catch { break; }
      if (!bytes || !bytes.length) continue;
      const { i, q } = iqFromBytes(bytes);
      const spec = powerSpectrum(i, q, FFT, 0);         // full FFT, fft-shifted dB (DC = tune centre)
      for (let k = 0; k < FFT; k++) {
        const off = (k - FFT / 2) * binHz;
        if (Math.abs(off) > USABLE / 2 || Math.abs(off) < 60e3) continue;   // drop band edges + the DC spike
        const gi = Math.round((fc + off - f0) / GRID);
        if (gi >= 0 && gi < N && spec[k] > prof[gi]) prof[gi] = spec[k];
      }
      post({ type: "sweepProgress", frac: (fc - b.dlLo) / (b.dlHi - b.dlLo) });
    }
    if (!running) break;
    // per-ARFCN power → active carriers → steadiness (BCCH) flag over successive sweeps
    const active = activeArfcns(arfcnPowers(band, { f0, df: GRID, db: prof }), ACTIVE_DELTA);
    const seen = new Set();
    for (const a of active) {
      seen.add(a.arfcn);
      (hist[a.arfcn] = hist[a.arfcn] || []).push(a.db); if (hist[a.arfcn].length > 6) hist[a.arfcn].shift();
      a.bcch = hist[a.arfcn].length >= 3 && steadyScore(hist[a.arfcn]) > 0.05;
    }
    for (const k of Object.keys(hist)) if (!seen.has(+k)) delete hist[k];   // forget carriers that went quiet
    // downsample the band profile for display
    const disp = new Float32Array(DISP_BINS), step = N / DISP_BINS;
    for (let d = 0; d < DISP_BINS; d++) { let pk = -Infinity; const s0 = Math.floor(d * step), s1 = Math.floor((d + 1) * step); for (let s = s0; s < s1; s++) if (prof[s] > pk) pk = prof[s]; disp[d] = pk; }
    post({ type: "sweep", band, floorLo: b.dlLo, floorHi: b.dlHi, spectrum: disp.buffer, arfcns: active.slice(0, 24).map((a) => ({ arfcn: a.arfcn, freq: a.freq, db: Math.round(a.db), bcch: !!a.bcch })) }, [disp.buffer]);
  }
  try { await rx.stop(); } catch { /* */ }
  post({ type: "stopped" });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "start") run(m);
  else if (m.type === "band") { band = m.band; for (const k of Object.keys(hist)) delete hist[k]; }
  else if (m.type === "gain") { if (rx) try { await rx.setLnaGain(m.lna); await rx.setVgaGain(m.vga); } catch { /* */ } }
  else if (m.type === "stop") running = false;
};
