import { RtlSdr, usbSupported } from "/_rt/rtlsdr.js";
import { channelPowers, findRuns, channelFloor, classifyChannel, DEFAULT_GEOM, CROWDED_CHANNEL } from "/_rt/scan433.js";
import { LPD433, TUNE_HZ, channelCentre } from "/_rt/chan433.js";
import { detectCtcss } from "/_rt/ctcss.js";
import { instantFreq } from "/_rt/burst.js";
import { extractChannel } from "/_rt/scan433.js";
import { synthBand } from "/_rt/fixture433.js";

const post = (m) => self.postMessage(m);
const SAMPLE_RATE = 2_400_000;
const CHUNK_MS = 250;                       

let mode = "idle", rx = null, gate = false;
const seen = new Map();                     

function record(ev) {
  const prev = seen.get(ev.id);
  const now = Date.now();
  const rec = {
    ...ev,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
    count: (prev?.count ?? 0) + 1,
  };
  rec.countLabel = "x" + rec.count;
  seen.set(ev.id, rec);
  return rec;
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
    const n = c + 1;
    const hz = channelCentre(LPD433, n);
    const durationMs = runs.reduce((a, r) => a + (r.end - r.start) * frameMs, 0);

    let cls;
    try {
      cls = classifyChannel(bytes, { channelHz: hz, durationMs, taps: 512 });
    } catch { continue; }

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
    }));
  }
  return out;
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
      await new Promise((r) => setTimeout(r, 900));
    }
    return;
  }
  try {
    rx = await openRadio();
  } catch { rx = null; }
  if (!rx) { post({ type: "state", connected: false }); mode = "idle"; return; }
  post({ type: "state", connected: true });
  while (mode === "scan") {
    let bytes;
    try { bytes = await rx.read(); } catch { break; }
    if (!bytes.length) continue;
    post({ type: "events", events: analyse(bytes) });
  }
  try { await rx.stop(); } catch {  }
  rx = null;
  post({ type: "state", connected: false });
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === "start") { gate = !!m.gate; if (mode !== "scan") await run(); }
  else if (m.type === "stop") { mode = "idle"; }
};
