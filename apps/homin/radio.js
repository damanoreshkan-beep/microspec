// homin — the one owner of the radio, shared by every surface in the app.
//
// The dial (view.js) and the live list (stream.js) are two readings of the SAME events, so the worker, the
// stores and the audio all live here and both import them. Two independent copies of this wiring would drift
// the moment one of them learned something.
//
// Audio follows the fmradio precedent: the worker posts finished PCM chunks, the main thread schedules them
// end to end into one AudioContext, and a gain node is the mute. Nothing decodes on the main thread.
import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { USB_FILTERS, usbSupported } from "/_rt/rtlsdr.js";
import { channelCentre, LPD433 } from "/_rt/chan433.js";

// Preflight has no Worker and the gate needs geometry from the first frame — a blank screen is the one state
// whose layout nobody measures, so a11y, overflow and the whole breakpoint matrix would be reading a waiting
// screen no user ever sees. These marks carry the WIDEST states (a tone label, a decoded payload, the crowded
// channel) because the string nobody measures is the one that overflows.
//
// They are NOT the gate's data. The gate runs the real pipeline over fixture BYTES and its events arrive
// marked src:"radio", which is what e2e asserts on, so a seed can never be mistaken for a working pipeline.
const SEED = [
  { id: "seed-voice-12", channel: 12, kind: "voice", strength: 0.8, toneHz: 100.0, count: 3, src: "seed" },
  { id: "seed-burst-35", channel: 35, kind: "burst", strength: 0.62, count: 11, crowded: true, src: "seed",
    proto: "Fine Offset WH2", payload: "21.4 C · 60 % · id 0x8a", rawHex: "8a 3f 21 60 4c" },
  { id: "seed-voice-47", channel: 47, kind: "voice", strength: 0.45, toneHz: 118.8, count: 2, src: "seed" },
  { id: "seed-burst-58", channel: 58, kind: "burst", strength: 0.3, count: 1, src: "seed",
    proto: "fixed code", rawHex: "500 1500 500 1500 1500 500 500 1500" },
];
const NO_WORKER_ENV = typeof Worker === "undefined";
export const $events = atom(gate || NO_WORKER_ENV ? SEED.map((e) => ({ ...e, lastSeen: Date.now() })) : []);
export const $connected = atom(false);
export const $freshAt = atom(0);
export const $listening = atom(null);      // channel number currently being demodulated, or null

const NO_WORKER = typeof Worker === "undefined";
let worker = null;

// ---- audio ----
let ctx = null, gainNode = null, nextAt = 0;
function audio() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC({ latencyHint: "playback" });
  gainNode = ctx.createGain();
  gainNode.gain.value = 1;
  gainNode.connect(ctx.destination);
  return ctx;
}
function pushAudio(pcm, rate) {
  const c = ctx;
  if (!c || !pcm.length) return;
  const buf = c.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(pcm, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(gainNode);
  // Schedule strictly end to end. Falling behind the clock means a gap was already audible, so re-anchor to
  // now rather than trying to catch up and stacking chunks on top of each other.
  const now = c.currentTime;
  if (nextAt < now + 0.02) nextAt = now + 0.06;
  src.start(nextAt);
  nextAt += buf.duration;
}

export function ensureWorker() {
  if (worker || NO_WORKER) return worker;
  try { worker = new Worker(new URL("./radio.worker.js", import.meta.url), { type: "module" }); }
  catch { return null; }
  worker.onmessage = (e) => {
    const d = e.data || {};
    if (d.type === "events" && d.events?.length) {
      // The first real packet retires any seed outright: a screen showing both would be half honest.
      const by = new Map($events.get().filter((x) => x.src === "radio").map((x) => [x.id, x]));
      for (const ev of d.events) {
        if (!by.has(ev.id)) $freshAt.set(Date.now());
        by.set(ev.id, { ...ev, src: "radio" });
      }
      $events.set([...by.values()]);
    } else if (d.type === "state") {
      $connected.set(!!d.connected);
      if (!d.connected) $listening.set(null);
    } else if (d.type === "audio") {
      pushAudio(new Float32Array(d.buf), d.rate);
    }
  };
  worker.postMessage({ type: "start", gate });
  if (gate) $connected.set(true);
  return worker;
}

export function stopWorker() {
  try { worker?.postMessage({ type: "stop" }); worker?.terminate(); } catch { /* */ }
  worker = null;
}

// WebUSB only ever hands over a device the user picked from Chrome's chooser, and that chooser can ONLY be
// opened inside a user gesture. navigator.usb.getDevices() — what the worker calls — returns only devices
// granted in an earlier session, so without this there is never a grant to find.
export async function requestReceiver() {
  if (!usbSupported()) return "unsupported";
  try {
    const dev = await navigator.usb.requestDevice({ filters: USB_FILTERS });
    if (!dev) return "none";
  } catch { return "none"; }
  ensureWorker()?.postMessage({ type: "start", gate });
  return "ok";
}

// Listening is a user gesture away from an AudioContext, so it must be started from a click handler.
export async function listen(channel) {
  const cur = $listening.get();
  if (cur === channel) return stopListening();
  const c = audio();
  if (c && c.state === "suspended") { try { await c.resume(); } catch { /* */ } }
  nextAt = 0;
  $listening.set(channel);
  ensureWorker()?.postMessage({ type: "listen", channel });
}

export function stopListening() {
  $listening.set(null);
  nextAt = 0;
  worker?.postMessage({ type: "listen", channel: null });
}

// Everything a surface needs to render one signal as a human row. Numbers stay locale-free; the words come
// from the caller's `t`, so the list re-labels itself when the language switches.
export function describe(ev, t) {
  const hz = channelCentre(LPD433, ev.channel);
  const kind = ev.kind === "voice" ? t.kindVoice : ev.kind === "burst" ? t.kindBurst : t.kindUnknown;
  return {
    ...ev,
    name: `${t.rowChannel} ${ev.channel}`,
    detail: kind,
    kindLabel: kind,
    channelLabel: String(ev.channel),
    freqLabel: hz ? (hz / 1e6).toFixed(3) + " MHz" : "",
    toneLabel: ev.toneHz ? ev.toneHz.toFixed(1) + " Hz" : "",
    countLabel: "x" + (ev.count || 1),
  };
}
