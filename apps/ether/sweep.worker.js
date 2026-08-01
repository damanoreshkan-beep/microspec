// Ether DSP worker. Drives the HackRF over WebUSB in two firmware modes, off the main thread:
//   • RADAR / channel-finding  → RX_SWEEP: the firmware sweeps a span and streams 0x7f-headed blocks; we FFT
//     each block (sweep.js) into a coarse spectrum, then classify peaks into named bands (bandplan.js).
//   • LISTEN                   → fixed-tune RECEIVE at 2 Msps + Demodulator (demod.js) → audio.
// A single-owner `mode` guarantees one read loop at a time, so a mode switch never races the pipeline. The
// maths (sweep parse, spectrum, demod, classify) are the unit-tested runtime modules; this is the glue. No
// import map exists in a Worker, so every import is a path the build rewrites /_rt/ → ../_rt/.
import { HackRF, MODE } from "/_rt/hackrf.js";
import { initSweepTransfer, sweepBlocks, blockSpectrum, planRange, noiseFloor, peaks, DEFAULT_SAMPLE_RATE, DEFAULT_BB_FILTER } from "/_rt/sweep.js";
import { Demodulator } from "/_rt/demod.js";
import { bandAt, RADAR_SPAN } from "/_rt/bandplan.js";
import { IN_RATE, OFFSET_HZ, rssiFromBytes } from "/_rt/fmradio.js";

const post = (m, transfer) => self.postMessage(m, transfer || []);
const SWEEP_FFT = 64;          // power-of-2 FFT bins for the radar spectrum (bin ≈ 312 kHz) — coarse is fine
const FIND_FFT = 256;          // finer for channel-finding within one band
const WF_COLS = 128, WF_ROWS = 48;

let rx = null, mode = "idle";
let demod = null, preset = null, squelch = true;
let targets = [], targetIdx = 0;
const wfBuf = [];              // rolling waterfall rows for the engineer sheet

async function ensureOpen() {
  if (rx) return true;
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error" }); return false; }
  try { await rx.open(); return true; } catch { post({ type: "error" }); rx = null; return false; }
}
async function halt() { try { await rx?.setMode(MODE.OFF); } catch { /* */ } }
async function configureSweep(gains = { lna: 24, vga: 20, amp: false }) {
  await rx.setSampleRate(DEFAULT_SAMPLE_RATE);
  await rx.setBasebandFilter(DEFAULT_BB_FILTER);
  await rx.setLnaGain(gains.lna); await rx.setVgaGain(gains.vga); await rx.setAmp(gains.amp);
}

// Sweep `ranges` (MHz pairs) for one pass, accumulating max dB per ~0.1 MHz bucket. Returns { freqs, db }.
async function sweepOnce(ranges, fftSize, maxTransfers) {
  const planned = ranges.map(([a, z]) => { const p = planRange(a, z); return [p.startMHz, p.stopMHz]; });
  await rx.initSweep(initSweepTransfer({ ranges: planned }));
  await rx.startRxSweep();
  const acc = new Map(), startHz = planned[0][0] * 1e6;
  let transfers = 0, sawStart = 0;
  while (mode !== "idle" && mode !== "stopReq" && transfers < maxTransfers) {
    let bytes; try { bytes = await rx.read(); } catch { break; }
    transfers++;
    for (const { headerHz, iq } of sweepBlocks(bytes)) {
      if (iq.length < 2 * fftSize) continue;
      const { hz, db } = blockSpectrum(iq, fftSize, { sampleRate: DEFAULT_SAMPLE_RATE });
      for (let i = 0; i < db.length; i++) {
        const bucket = Math.round((headerHz + hz[i]) / 1e5);           // 0.1 MHz buckets
        const prev = acc.get(bucket);
        if (prev == null || db[i] > prev) acc.set(bucket, db[i]);
      }
      if (Math.abs(headerHz - startHz) < DEFAULT_SAMPLE_RATE) sawStart++;
    }
    if (sawStart >= 2) break;                                          // completed one full pass
  }
  await halt();
  const keys = [...acc.keys()].sort((a, b) => a - b);
  return { freqs: keys.map((k) => k * 1e5), db: keys.map((k) => acc.get(k)) };
}

// ---- RADAR ----
async function radar() {
  if (!(await ensureOpen())) return;
  mode = "scan"; post({ type: "scanProgress" });
  await configureSweep();
  const { freqs, db } = await sweepOnce(RADAR_SPAN, SWEEP_FFT, 60);
  if (mode !== "scan") return;
  const floor = noiseFloor(Float32Array.from(db));
  const byBand = new Map();
  for (let i = 0; i < freqs.length; i++) {
    if (db[i] < floor + 8) continue;
    const b = bandAt(freqs[i]), strength = Math.max(0, Math.min(1, (db[i] - floor) / 30));
    const cur = byBand.get(b.id);
    if (!cur || strength > cur.strength) byBand.set(b.id, { id: b.id, key: b.key, strength });
  }
  const sources = [...byBand.values()].filter((s) => s.id !== "unknown" || s.strength > 0.5);
  pushWaterfall(freqs, db, floor);
  post({ type: "radar", sources });
  post({ type: "waterfall", wf: renderWaterfall() });
  mode = "idle";
}

// A rolling waterfall for the engineer sheet: downsample the pass to WF_COLS, normalise off the floor, scroll.
function pushWaterfall(freqs, db, floor) {
  if (!freqs.length) return;
  const row = new Float32Array(WF_COLS), lo = freqs[0], hi = freqs[freqs.length - 1], span = Math.max(1, hi - lo);
  for (let i = 0; i < freqs.length; i++) {
    const c = Math.min(WF_COLS - 1, Math.floor(((freqs[i] - lo) / span) * WF_COLS));
    const v = Math.max(0, Math.min(1, (db[i] - floor) / 30));
    if (v > row[c]) row[c] = v;
  }
  wfBuf.push(row); while (wfBuf.length > WF_ROWS) wfBuf.shift();
}
function renderWaterfall() {
  const rows = wfBuf.length, data = new Float32Array(rows * WF_COLS);
  for (let r = 0; r < rows; r++) data.set(wfBuf[r], r * WF_COLS);
  return { rows, cols: WF_COLS, data };
}

// ---- LISTEN ----
async function startListen(p) {
  if (!(await ensureOpen())) return;
  preset = p; targetIdx = 0;
  mode = "find"; post({ type: "channel", state: "searching" });
  await configureSweep({ lna: 32, vga: 24, amp: false });
  const { freqs, db } = await sweepOnce([p.spanMHz], FIND_FFT, 16);
  const pk = peaks(Float64Array.from(freqs), Float32Array.from(db), { marginDb: 8 });
  targets = pk.slice(0, 12).map((x) => x.hz);
  if (!targets.length) { mode = "idle"; post({ type: "channel", state: "silent" }); return; }
  await tuneListen(targets[targetIdx]);
}
async function tuneListen(hz) {
  await halt();
  await rx.setSampleRate(IN_RATE);
  await rx.setBasebandFilter(1_750_000);
  await rx.setLnaGain(32); await rx.setVgaGain(30); await rx.setAmp(false);
  await rx.setFreq(hz - OFFSET_HZ);                                    // offset-tune: SW shift brings it to baseband
  await rx.startRx();
  demod = new Demodulator({ mode: preset.mode });
  mode = "listen"; post({ type: "channel", state: "live" });
  streamListen();
}
async function streamListen() {
  const queue = []; for (let k = 0; k < 8; k++) queue.push(rx.read());
  let block = 0;
  while (mode === "listen") {
    let bytes; try { bytes = await queue.shift(); } catch { break; }
    if (mode !== "listen") break;
    queue.push(rx.read());
    if (!bytes.length) continue;
    const level = Math.max(0, Math.min(1, (rssiFromBytes(bytes) + 60) / 40));
    const open = !squelch || level > 0.15;
    const { audio } = demod.process(bytes);
    if (open && audio.length) post({ type: "audio", buf: audio.buffer }, [audio.buffer]);
    if (block % 8 === 0) post({ type: "signal", level });
    block++;
  }
  await Promise.allSettled(queue);
}
async function nextChannel() {
  if (!targets.length) return;
  mode = "find"; post({ type: "channel", state: "searching" });
  targetIdx = (targetIdx + 1) % targets.length;
  await tuneListen(targets[targetIdx]);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "listen") { if (mode === "listen") mode = "find"; await startListen(m.preset); }
    else if (m.type === "next") { if (mode === "listen") { mode = "find"; await nextChannel(); } }
    else if (m.type === "scan") { if (mode === "listen") mode = "find"; await radar(); }
    else if (m.type === "squelch") { squelch = !!m.on; }
    else if (m.type === "stop") { mode = "stopReq"; try { await rx?.stop(); } catch { /* */ } rx = null; mode = "idle"; }
  } catch (err) { post({ type: "error", message: String(err && err.message || err) }); }
};
