// FM radio DSP worker. Streams the HackRF's 2 Msps IQ, demodulates FM (audio), decodes RDS metadata off the
// composite MPX, and runs the auto-scan / seek. All the 4 MB/s USB I/O + DSP live here, off the main thread.
// A single-owner state machine (mode) guarantees only ONE read loop runs at a time so retuning during a scan
// never races the streaming pipeline. Chain + protocol + RDS are the tested runtime modules; this is the glue.
import { FmReceiver, pilotRatioDb, rssiFromBytes, IN_RATE, IF_RATE, OFFSET_HZ } from "/_rt/fmradio.js";
import { Rds } from "/_rt/rds.js";
import { HackRF } from "/_rt/hackrf.js";

const IN_FLIGHT = 8;
const BAND_LO = 87_500_000, BAND_HI = 108_000_000, STEP = 100_000;
const PILOT_ON = 4, PILOT_VALID = 6, RSSI_DELTA = 10, MIN_SPACING = 200_000;
const post = (m, transfer) => self.postMessage(m, transfer || []);

let rx = null, recv = null, rds = null, cfg = null;
let mode = "idle", curFreq = 100e6, seekDir = 1;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const tune = (hz) => rx.setFreq(hz - OFFSET_HZ);                     // offset-tune (SW shift brings it to baseband)

async function run(c) {
  cfg = c;
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  try {
    await rx.open();
    await rx.setSampleRate(IN_RATE);
    await rx.setBasebandFilter(1_750_000);
    await rx.setAmp(cfg.amp); await rx.setLnaGain(cfg.lna); await rx.setVgaGain(cfg.vga);
    curFreq = cfg.freq; await tune(curFreq);
    await rx.startRx();
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
  recv = new FmReceiver({ tcUs: cfg.tcUs }); rds = new Rds(IF_RATE);
  mode = "stream"; post({ type: "started" });
  controller();
}

async function controller() {
  while (true) {
    if (mode === "stream") await streamOnce();
    else if (mode === "scanReq") await runScan();
    else if (mode === "seekReq") await runSeek(seekDir);
    else if (mode === "stopReq") { try { await rx.stop(); } catch { /* */ } post({ type: "stopped" }); return; }
    else return;
  }
}

// Runs the audio + RDS pipeline while mode==="stream"; returns (after draining in-flight reads) when mode changes.
async function streamOnce() {
  const queue = [];
  for (let k = 0; k < IN_FLIGHT; k++) queue.push(rx.read());
  let block = 0;
  while (mode === "stream") {
    let bytes; try { bytes = await queue.shift(); } catch { break; }
    if (mode !== "stream") break;
    queue.push(rx.read());
    if (!bytes.length) continue;
    const { audio, mpx } = recv.process(bytes);
    if (audio.length) post({ type: "audio", buf: audio.buffer }, [audio.buffer]);
    rds.process(mpx);
    if (block % 12 === 0) post({ type: "signal", rssi: rssiFromBytes(bytes), stereo: pilotRatioDb(mpx) > PILOT_ON });
    if (block % 24 === 0) post({ type: "rds", ...rds.parser.snapshot() });
    block++;
  }
  await Promise.allSettled(queue);
}

// Measure one channel: retune, settle (discard 2 reads), then read one block → { rssi, pilot }.
async function measure(f, sr) {
  await tune(f);
  try { await rx.read(); await rx.read(); } catch { /* */ }
  const bytes = await rx.read();
  if (!bytes.length) return { freq: f, rssi: -120, pilot: -20 };
  const { mpx } = sr.process(bytes);
  return { freq: f, rssi: rssiFromBytes(bytes), pilot: pilotRatioDb(mpx) };
}

async function runScan() {
  post({ type: "scanStart" });
  const sr = new FmReceiver({ tcUs: cfg.tcUs }), results = [];
  for (let f = BAND_LO; f <= BAND_HI; f += STEP) {
    if (mode !== "scanReq") break;                                  // a stop/seek can interrupt a scan
    results.push(await measure(f, sr));
    post({ type: "scanProgress", frac: (f - BAND_LO) / (BAND_HI - BAND_LO) });
  }
  const floor = median(results.map((r) => r.rssi));
  const cand = results.filter((r) => r.pilot > PILOT_VALID || r.rssi > floor + RSSI_DELTA);
  const stations = [];                                              // dedupe adjacent leakage: local max per ≥200 kHz
  const score = (x) => x.pilot * 2 + x.rssi;
  for (const c of cand) {
    const last = stations[stations.length - 1];
    if (last && c.freq - last.freq < MIN_SPACING) { if (score(c) > score(last)) stations[stations.length - 1] = c; }
    else stations.push(c);
  }
  post({ type: "scanDone", stations: stations.map((s) => ({ freq: s.freq, pilot: Math.round(s.pilot), rssi: Math.round(s.rssi), stereo: s.pilot > PILOT_ON })) });
  rds = new Rds(IF_RATE); await tune(curFreq); mode = "stream";     // resume the previously-tuned station
}

async function runSeek(dir) {
  post({ type: "scanStart" });
  const sr = new FmReceiver({ tcUs: cfg.tcUs });
  let f = curFreq, found = null;
  for (let i = 0; i < 210 && mode === "seekReq"; i++) {
    f += dir * STEP; if (f > BAND_HI) f = BAND_LO; if (f < BAND_LO) f = BAND_HI;
    const m = await measure(f, sr);
    post({ type: "scanProgress", freq: f });
    if (m.pilot > PILOT_VALID) { found = f; break; }                // pilot = confident stereo station
  }
  if (found != null) curFreq = found;
  rds = new Rds(IF_RATE); await tune(curFreq);
  post({ type: "seekDone", freq: curFreq, found: found != null });
  mode = "stream";
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "start") { run(m); }
  else if (m.type === "tune") { curFreq = m.freq; if (rx) try { await tune(m.freq); } catch { /* */ } rds = new Rds(IF_RATE); post({ type: "rds", pi: 0, pty: 0, ptyName: "", ps: "", rt: "", tp: 0, ms: 0 }); }
  else if (m.type === "gain") { if (rx) try { await rx.setAmp(m.amp); await rx.setLnaGain(m.lna); await rx.setVgaGain(m.vga); } catch { /* */ } }
  else if (m.type === "deemph") { if (recv) recv.setDeemphasis(m.tcUs); }
  else if (m.type === "scan") { if (mode === "stream") mode = "scanReq"; }
  else if (m.type === "seek") { seekDir = m.dir; if (mode === "stream") mode = "seekReq"; }
  else if (m.type === "stop") { mode = "stopReq"; }
};
