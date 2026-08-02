// dovkola — the decoder worker: drives the HackRF over WebUSB off the main thread and posts uniform packets
//   { type:"packet", id, kind, band, name, freqLabel, payload, strength, rawHex? }
// that stream.js upserts (with count + IndexedDB persistence) into the live list. A single-owner `mode` keeps
// a retune from racing a read loop (apps/ether + apps/fmradio are the proven patterns this mirrors).
//
// Sources so far (both ZERO new DSP — reused, unit-tested runtime chains):
//   • PRESENCE — RX_SWEEP over bandplan RADAR_SPAN, classify peaks into named bands (sweep.js + bandplan.js)
//   • FM + RDS — fixed-tune 2 Msps, FmReceiver → MPX → Rds decoder → real STATION NAMES + RadioText
// ISM byte-decode (real TPMS/weather packets → the matrix) is the next source added to the same loop.
import { HackRF, MODE } from "/_rt/hackrf.js";
import { initSweepTransfer, sweepBlocks, blockSpectrum, planRange, noiseFloor, DEFAULT_SAMPLE_RATE, DEFAULT_BB_FILTER } from "/_rt/sweep.js";
import { bandAt, RADAR_SPAN } from "/_rt/bandplan.js";
import { FmReceiver, pilotRatioDb, rssiFromBytes, IN_RATE, IF_RATE, OFFSET_HZ } from "/_rt/fmradio.js";
import { Rds } from "/_rt/rds.js";
import { capture } from "/_rt/ook.js";
import { decodeOOK } from "/_rt/ism433.js";

const post = (m, transfer) => self.postMessage(m, transfer || []);
const SWEEP_FFT = 64;
let rx = null, mode = "idle";
let scanCfg = {};                                   // which bands to scan (from the pinned toggles); {} = all on
const enabled = (k) => scanCfg[k] !== false;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

const BAND_INFO = {
  fm: { name: "FM-станція", band: "FM" }, air: { name: "Авіа-діапазон", band: "Air" }, ham2m: { name: "Радіоаматор 2 м", band: "Ham" },
  marine: { name: "Морський зв'язок", band: "Marine" }, dab: { name: "Цифрове радіо", band: "DAB" }, ism433: { name: "Пристрій 433 МГц", band: "433 МГц" },
  ham70: { name: "Радіоаматор 70 см", band: "Ham" }, pmr: { name: "Рація PMR", band: "PMR" }, gsmUp: { name: "Телефон поруч", band: "GSM" },
  gsmDn: { name: "Мобільна вежа", band: "GSM" }, ism868: { name: "Пристрій 868 МГц", band: "868 МГц" }, dect: { name: "Радіотелефон", band: "DECT" },
  ism24: { name: "Wi-Fi / Bluetooth", band: "2.4 ГГц" }, wifi5: { name: "Wi-Fi 5 ГГц", band: "5 ГГц" },
};
const human = (b) => BAND_INFO[b.id] || { name: "Невідомий сигнал", band: "?" };

async function ensureOpen() {
  if (rx) return true;
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "no granted device" }); return false; }
  try { await rx.open(); return true; } catch (e) { post({ type: "error", message: String(e && e.message || e) }); rx = null; return false; }
}
async function halt() { try { await rx && rx.setMode(MODE.OFF); } catch { /* */ } }

// ---------------- PRESENCE (RX_SWEEP → named bands) ----------------
async function configureSweep(gains = { lna: 24, vga: 20, amp: false }) {
  await rx.setSampleRate(DEFAULT_SAMPLE_RATE); await rx.setBasebandFilter(DEFAULT_BB_FILTER);
  await rx.setLnaGain(gains.lna); await rx.setVgaGain(gains.vga); await rx.setAmp(gains.amp);
}
async function sweepOnce(ranges, fftSize, maxTransfers) {
  const planned = ranges.map(([a, z]) => { const p = planRange(a, z); return [p.startMHz, p.stopMHz]; });
  await rx.initSweep(initSweepTransfer({ ranges: planned }));
  await rx.startRxSweep();
  const acc = new Map(), startHz = planned[0][0] * 1e6;
  let transfers = 0, sawStart = 0;
  while (mode === "scan" && transfers < maxTransfers) {
    let bytes; try { bytes = await rx.read(); } catch { break; }
    transfers++;
    for (const { headerHz, iq } of sweepBlocks(bytes)) {
      if (iq.length < 2 * fftSize) continue;
      const { hz, db } = blockSpectrum(iq, fftSize, { sampleRate: DEFAULT_SAMPLE_RATE });
      for (let i = 0; i < db.length; i++) { const bucket = Math.round((headerHz + hz[i]) / 1e5); const prev = acc.get(bucket); if (prev == null || db[i] > prev) acc.set(bucket, db[i]); }
      if (Math.abs(headerHz - startHz) < DEFAULT_SAMPLE_RATE) sawStart++;
    }
    if (sawStart >= 2) break;
  }
  await halt();
  const keys = [...acc.keys()].sort((a, b) => a - b);
  return { freqs: keys.map((k) => k * 1e5), db: keys.map((k) => acc.get(k)) };
}
async function presenceSweep() {
  const ranges = [];
  if (enabled("b433")) ranges.push([430, 450]);
  if (enabled("cell")) ranges.push([860, 960]);
  if (enabled("wifi")) ranges.push([2400, 2484]);
  if (!ranges.length) return;
  await configureSweep();
  const { freqs, db } = await sweepOnce(ranges, SWEEP_FFT, 60);
  if (mode !== "scan" || !freqs.length) return;
  const floor = noiseFloor(Float32Array.from(db));
  const byBand = new Map();
  for (let i = 0; i < freqs.length; i++) {
    if (db[i] < floor + 8) continue;
    const b = bandAt(freqs[i]); if (b.id === "unknown") continue;
    const strength = Math.max(0, Math.min(1, (db[i] - floor) / 30));
    const cur = byBand.get(b.id); if (!cur || strength > cur.strength) byBand.set(b.id, { b, hz: freqs[i], strength });
  }
  for (const { b, hz, strength } of byBand.values()) {
    const info = human(b);
    post({ type: "packet", id: "presence-" + b.id, kind: "presence", band: info.band, name: info.name, freqLabel: (hz / 1e6).toFixed(1) + " MHz", payload: "активність", strength });
  }
}

// ---------------- FM + RDS (fixed-tune → real station names) ----------------
const FM_LO = 87_500_000, FM_HI = 108_000_000, FM_STEP = 200_000;
const tune = (hz) => rx.setFreq(hz - OFFSET_HZ);
async function fmConfigure() {
  await rx.setSampleRate(IN_RATE); await rx.setBasebandFilter(1_750_000);
  await rx.setLnaGain(16); await rx.setVgaGain(20); await rx.setAmp(false);   // fmradio's proven gains — 32/30 clipped strong FM and killed the 57 kHz RDS subcarrier
  await rx.startRx();                                   // enter RECEIVE mode before any read (was the FM bug)
}
async function fmMeasure(f, sr) {
  await tune(f); try { await rx.read(); await rx.read(); } catch { /* */ }
  let bytes; try { bytes = await rx.read(); } catch { return { freq: f, rssi: -120, pilot: -20 }; }
  if (!bytes.length) return { freq: f, rssi: -120, pilot: -20 };
  const { mpx } = sr.process(bytes);
  return { freq: f, rssi: rssiFromBytes(bytes), pilot: pilotRatioDb(mpx) };
}
async function fmDwellRds(freq) {
  await tune(freq);
  const recv = new FmReceiver({ tcUs: 50 }), rds = new Rds(IF_RATE);
  let ps = "", rt = "", t0 = Date.now();
  const q = []; for (let k = 0; k < 8; k++) q.push(rx.read());
  while (mode === "scan" && Date.now() - t0 < 6000) {              // up to 6 s — RDS PS needs a few good groups
    let bytes; try { bytes = await q.shift(); } catch { break; }
    if (mode !== "scan") break;
    q.push(rx.read());
    if (!bytes.length) continue;
    const { mpx } = recv.process(bytes); rds.process(mpx);
    const s = rds.parser.snapshot();
    if (s.ps && s.ps.trim()) ps = s.ps.trim();
    if (s.rt && s.rt.trim()) rt = s.rt.trim();
    if (ps && (rt || Date.now() - t0 > 4200)) break;
  }
  await Promise.allSettled(q);
  return { ps, rt };
}
async function fmScan() {
  await fmConfigure();
  const sr = new FmReceiver({ tcUs: 50 }), results = [];
  for (let f = FM_LO; f <= FM_HI; f += FM_STEP) { if (mode !== "scan") { await halt(); return; } results.push(await fmMeasure(f, sr)); }
  const floor = median(results.map((r) => r.rssi));
  // Permissive by design — show everything the scan picks up (no image/pilot filtering). Only merge the
  // leakage of ONE carrier across adjacent 200 kHz bins so a single station isn't split into three rows.
  const cand = results.filter((r) => r.pilot > 6 || r.rssi > floor + 10);
  const stations = []; const score = (x) => x.pilot * 2 + x.rssi;
  for (const c of cand) { const last = stations[stations.length - 1]; if (last && c.freq - last.freq < 300_000) { if (score(c) > score(last)) stations[stations.length - 1] = c; } else stations.push(c); }
  // emit every station right away (freq name), strongest first — names upgrade as RDS lands
  stations.sort((a, b) => b.rssi - a.rssi);
  for (const st of stations) {
    const mhz = (st.freq / 1e6).toFixed(1);
    post({ type: "packet", id: "fm-" + mhz, kind: "fm", band: "FM", name: mhz + " FM", freqLabel: mhz + " MHz", payload: st.pilot > 4 ? "♪ стерео" : "♪ моно", strength: Math.max(0.1, Math.min(1, (st.rssi + 60) / 40)) });
  }
  // dwell the strongest-PILOT few for the real RDS station name + RadioText (pilot ⇒ a real broadcast ⇒ RDS)
  const dwellList = [...stations].sort((a, b) => b.pilot - a.pilot).slice(0, 4);
  for (const st of dwellList) {
    if (mode !== "scan") break;
    const { ps, rt } = await fmDwellRds(st.freq);
    const mhz = (st.freq / 1e6).toFixed(1);
    post({ type: "packet", id: "fm-" + mhz, kind: "fm", band: "FM", name: ps || (mhz + " FM"), freqLabel: mhz + " MHz", payload: rt || (ps ? "♪ " + mhz + " FM" : "♪ стерео"), strength: Math.max(0.1, Math.min(1, (st.rssi + 60) / 40)) });
  }
  await halt();
}

// ---------------- ISM 433 (OOK byte-decode → real TPMS / weather / remote + the raw-byte matrix) ----------------
async function ismScan() {
  await rx.setSampleRate(IN_RATE); await rx.setBasebandFilter(1_750_000);
  await rx.setLnaGain(40); await rx.setVgaGain(40); await rx.setAmp(false);   // ISM bursts are weak — high gain, no RDS to clip here
  await rx.setFreq(433_920_000 - OFFSET_HZ);
  await rx.startRx();
  const t0 = Date.now();
  const q = []; for (let k = 0; k < 8; k++) q.push(rx.read());
  while (mode === "scan" && Date.now() - t0 < 3500) {
    let bytes; try { bytes = await q.shift(); } catch { break; }
    if (mode !== "scan") break;
    q.push(rx.read());
    if (!bytes.length) continue;
    let recs = [];
    try { const timings = capture(bytes); if (timings && timings.length) recs = decodeOOK(timings, { ts: Date.now() }); } catch { /* */ }
    for (const r of recs) emitIsm(r);
  }
  await Promise.allSettled(q);
  await halt();
}
function emitIsm(r) {
  const f = r.fields || {};
  const payload = r.kind === "remote" ? "спрацював"
    : [f.tempC != null ? f.tempC.toFixed(1) + " °C" : null, f.humidity != null ? f.humidity + " %" : null].filter(Boolean).join(" · ") || "сигнал";
  const rawHex = r.bytes && r.bytes.length ? r.bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join(" ") : null;
  const kind = r.kind === "sensor" ? (f.tempC != null ? "weather" : "sensor") : r.kind;
  post({ type: "packet", id: r.proto + "-" + (r.id >>> 0), kind, band: "433 МГц", name: r.name, detail: "id 0x" + (r.id >>> 0).toString(16), freqLabel: "433.9 MHz", payload, strength: 0.55, raw: rawHex ? 1 : 0, rawHex });
}

async function run() {
  if (!(await ensureOpen())) return;
  mode = "scan";
  while (mode === "scan") {
    try {
      await presenceSweep(); if (mode !== "scan") break;
      if (enabled("b433")) { await ismScan(); if (mode !== "scan") break; }
      if (enabled("fm")) { await fmScan(); }
    } catch (e) { post({ type: "error", message: String(e && e.message || e) }); break; }
    await new Promise((r) => setTimeout(r, 600));
  }
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === "configure") { scanCfg = m.scan || {}; }
    else if (m.type === "start") { if (mode !== "scan") await run(); }
    else if (m.type === "stop") { mode = "idle"; try { await rx && rx.stop(); } catch { /* */ } rx = null; }
  } catch (err) { post({ type: "error", message: String(err && err.message || err) }); }
};
