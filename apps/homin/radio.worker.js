import { RtlSdr, usbSupported } from "/_rt/rtlsdr.js";
import { channelPowers, findRuns, channelFloor, classifyChannel, extractChannel, DEFAULT_GEOM, CROWDED_CHANNEL } from "/_rt/scan433.js";
import { LPD433, TUNE_HZ, channelCentre } from "/_rt/chan433.js";
import { detectCtcss } from "/_rt/ctcss.js";
import { instantFreq, magnitude } from "/_rt/burst.js";
import { decodeOOK, PROTO_NAMES } from "/_rt/ism433.js";
import { synthBand } from "/_rt/fixture433.js";

const post = (m, transfer) => self.postMessage(m, transfer || []);
const SAMPLE_RATE = 2_400_000;
const CHUNK_MS = 250;

let mode = "idle", rx = null, gate = false, listenCh = null;
const seen = new Map();

function record(ev) {
  const prev = seen.get(ev.id), now = Date.now();
  const rec = { ...ev, firstSeen: prev?.firstSeen ?? now, lastSeen: now, count: (prev?.count ?? 0) + 1 };
  seen.set(ev.id, rec);
  return rec;
}

function ookTimings(bytes, hz) {
  const ch = extractChannel(bytes, { deltaHz: hz - TUNE_HZ, decim: 16, channelHz: 75_000, taps: 256 });
  const mag = magnitude(ch.re, ch.im);
  if (!mag.length) return { timings: [], usPerSample: 0 };
  const sorted = Float32Array.from(mag).sort();
  const noise = sorted[Math.floor(sorted.length / 2)];          
  const peak = sorted[sorted.length - 1];
  if (peak <= noise * 2) return { timings: [], usPerSample: 0 };
  const thr = (noise + peak) / 2;
  const usPerSample = 1e6 / ch.sampleRate;
  const timings = [];
  let on = mag[0] >= thr, run = 1;
  for (let i = 1; i < mag.length; i++) {
    const now = mag[i] >= thr;
    if (now === on) { run++; continue; }
    timings.push(Math.round(run * usPerSample));
    on = now; run = 1;
  }
  timings.push(Math.round(run * usPerSample));
  return { timings, usPerSample };
}

function analyse(bytes) {
  const { frames, frameMs } = channelPowers(bytes, DEFAULT_GEOM, LPD433);
  if (!frames.length) return [];
  const peak = new Float32Array(frames[0].length);
  for (const f of frames) for (let c = 0; c < f.length; c++) if (f[c] > peak[c]) peak[c] = f[c];
  const floor = channelFloor(peak);
  const out = [];

  for (let c = 0; c < frames[0].length; c++) {
    const series = Float32Array.from(frames, (f) => f[c]);
    const runs = findRuns(series, { floor, minFrames: 2 });
    if (!runs.length) continue;
    const n = c + 1, hz = channelCentre(LPD433, n);
    const durationMs = runs.reduce((a, r) => a + (r.end - r.start) * frameMs, 0);

    let cls;
    try { cls = classifyChannel(bytes, { channelHz: hz, durationMs, taps: 512 }); } catch { continue; }

    let proto = null, payload = null, rawHex = null, decoded = null;
    if (cls.kind !== "voice") {
      try {
        const { timings } = ookTimings(bytes, hz);
        if (timings.length > 4) {
          rawHex = timings.slice(0, 24).map((u) => Math.min(9999, u)).join(" ");
          const hits = decodeOOK(timings, { ts: Date.now() });
          if (hits.length) {
            decoded = hits[0];
            proto = PROTO_NAMES?.[decoded.proto] || decoded.proto || null;
            if (decoded.bytes) rawHex = decoded.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
            payload = [
              decoded.temperature != null ? decoded.temperature.toFixed(1) + " C" : null,
              decoded.humidity != null ? decoded.humidity + " %" : null,
              decoded.id != null ? "id 0x" + (decoded.id >>> 0).toString(16) : null,
            ].filter(Boolean).join(" · ") || null;
          }
        }
      } catch {  }
    }

    let tone = null;
    if (cls.kind === "voice") {
      try {
        const ch = extractChannel(bytes, { deltaHz: hz - TUNE_HZ, taps: 512 });
        tone = detectCtcss(instantFreq(ch.re, ch.im), ch.sampleRate);
      } catch {  }
    }

    out.push(record({
      id: `${cls.kind}-${n}${tone ? "-" + tone.toneHz : ""}`,
      channel: n,
      kind: cls.kind,
      crowded: n === CROWDED_CHANNEL,
      strength: Math.max(0.05, Math.min(1, Math.log10(1 + peak[c] / floor) / 2)),
      freqHz: hz,
      toneHz: tone?.toneHz ?? null,
      durationMs,
      transitions: cls.transitions,
      proto, payload, rawHex,
    }));
  }
  return out;
}

function demod(bytes) {
  if (listenCh == null) return;
  const hz = channelCentre(LPD433, listenCh);
  if (hz == null) return;
  let ch;
  try { ch = extractChannel(bytes, { deltaHz: hz - TUNE_HZ, taps: 512 }); } catch { return; }
  const f = instantFreq(ch.re, ch.im);
  if (!f.length) return;
  const g = ch.sampleRate / (2 * Math.PI * 2500);
  const pcm = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i] * g));
  post({ type: "audio", rate: ch.sampleRate, buf: pcm.buffer }, [pcm.buffer]);
}

async function openRadio() {
  if (!usbSupported()) return null;
  const dev = await RtlSdr.fromGranted();
  if (!dev) return null;
  await dev.open();
  await dev.setSampleRate(SAMPLE_RATE);
  await dev.setAgc(true);                   
  await dev.setFreq(TUNE_HZ);
  await dev.startRx();
  return dev;
}

async function run() {
  mode = "scan";
  if (gate) {
    const bytes = synthBand({ ms: CHUNK_MS });
    while (mode === "scan") {
      post({ type: "events", events: analyse(bytes) });
      demod(bytes);
      await new Promise((r) => setTimeout(r, 900));
    }
    return;
  }
  try { rx = await openRadio(); } catch { rx = null; }
  if (!rx) { post({ type: "state", connected: false }); mode = "idle"; return; }
  post({ type: "state", connected: true });
  while (mode === "scan") {
    let bytes;
    try { bytes = await rx.read(); } catch { break; }
    if (!bytes.length) continue;
    post({ type: "events", events: analyse(bytes) });
    demod(bytes);
  }
  try { await rx.stop(); } catch {  }
  rx = null;
  post({ type: "state", connected: false });
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === "start") { gate = !!m.gate; if (mode !== "scan") await run(); }
  else if (m.type === "stop") { mode = "idle"; }
  else if (m.type === "listen") { listenCh = m.channel ?? null; }
};
