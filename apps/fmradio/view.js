// FM Radio — a broadband-FM receiver for a HackRF One, decoded entirely on the device. WebUSB drives the
// radio; a Web Worker (dsp.worker.js) streams the 2 Msps IQ and runs the demod (/_rt/fmradio.js); this view
// is the instrument: a tuner, a live FFT spectrum + waterfall, and the transport. The HackRF is the first
// WebUSB device in the farm — see docs/research/hackrf-webusb-fm.md.
//
// Two realities: with a device attached the worker feeds real spectrum + audio; under the headless gate (and
// ?mock preview) there is no USB, so the view seeds a deterministic synthetic spectrum so the populated screen
// — the part every downstream gate actually measures — renders, marked data-live.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { seedSpectrum, OUT_RATE } from "/_rt/fmradio.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

const FM_LO = 87.5, FM_HI = 108.0;                 // broadcast FM band (MHz)
const STEP_HZ = 100_000;                            // 0.1 MHz fine step
const clampHz = (hz) => Math.max(FM_LO * 1e6, Math.min(FM_HI * 1e6, Math.round(hz / STEP_HZ) * STEP_HZ));
const fmMhz = (hz) => (hz / 1e6).toFixed(1);
const NBINS = 256, NORM_LO = -85, NORM_HI = -28;   // dB → 0..1 display window (matches fmradio power scale)
const norm = (db) => Math.max(0, Math.min(1, (db - NORM_LO) / (NORM_HI - NORM_LO)));

// ---- shared state (module scope, so it survives tab switches like rave's engine) ----
const $connected = atom(false), $playing = atom(false), $signal = atom(0), $spectrum = atom(null), $usbOk = atom(true);
const $freq = persistentAtom("fmradio:freq", 100e6, { encode: String, decode: Number });
const $vol = persistentAtom("fmradio:vol", 0.8, { encode: String, decode: Number });
const $lna = persistentAtom("fmradio:lna", 16, { encode: String, decode: Number });
const $vga = persistentAtom("fmradio:vga", 20, { encode: String, decode: Number });
const $amp = persistentAtom("fmradio:amp", "0", { encode: String, decode: (s) => s === "1" });
const $tc = persistentAtom("fmradio:tc", 50, { encode: String, decode: Number });

// ---- audio (main thread): schedule the worker's 48 kHz chunks into pooled buffer sources; a gain node is
// the mute — the worker streams the spectrum whether or not you're listening, so muting is just gain→0. ----
let worker = null, audioCtx = null, gainNode = null, nextT = 0, wl = null, np = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  audioCtx = new AC({ latencyHint: "playback" });
  gainNode = audioCtx.createGain(); gainNode.gain.value = 0; gainNode.connect(audioCtx.destination);
  return audioCtx;
}
function pushAudio(f32) {
  const c = audioCtx; if (!c || !f32.length) return;
  const buf = c.createBuffer(1, f32.length, OUT_RATE); buf.copyToChannel(f32, 0);
  const s = c.createBufferSource(); s.buffer = buf; s.connect(gainNode);
  const now = c.currentTime; if (nextT < now + 0.08) nextT = now + 0.08;   // ~80 ms lead absorbs USB/DSP jitter
  s.start(nextT); nextT += f32.length / OUT_RATE;
}
const npTitle = () => `FM ${fmMhz($freq.get())} MHz`;
function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "audio") pushAudio(new Float32Array(m.buf));
    else if (m.type === "spectrum") $spectrum.set(new Float32Array(m.buf));
    else if (m.type === "signal") $signal.set(m.level);
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
  worker.postMessage({ type: "start", freq: $freq.get(), lna: $lna.get(), vga: $vga.get(), amp: $amp.get(), tcUs: $tc.get() });
}
function stopWorker() {
  if (!worker) return;
  try { worker.postMessage({ type: "stop" }); } catch { /* */ }
  const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 400);
}

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; } // cancelled
  if (!dev) return;
  const c = ensureAudio(); c?.resume?.();
  $usbOk.set(true); $connected.set(true);
  startWorker();
}
function disconnect() { buzz(); pause(); stopWorker(); $connected.set(false); $spectrum.set(null); $signal.set(0); }

function play() {
  buzz(12);
  const c = ensureAudio(); c?.resume?.();
  if (gainNode) gainNode.gain.value = $vol.get();
  $playing.set(true);
  wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(), artist: "microspec",
    onPlay: () => { if (!$playing.get()) play(); }, onPause: () => pause(),
    resumeCtx: () => c?.resume?.() });
  np.setPlaying(npTitle());
}
function pause() { if (gainNode) gainNode.gain.value = 0; $playing.set(false); if (wl) { wl.release(); wl = null; } if (np) { np.release(); np = null; } }
function setFreq(hz) { const f = clampHz(hz); $freq.set(f); if (worker) worker.postMessage({ type: "tune", freq: f }); if (np) np.meta(npTitle()); }
function setVol(v) { $vol.set(v); if (gainNode && $playing.get()) gainNode.gain.value = v; }
function pushGain() { if (worker) worker.postMessage({ type: "gain", lna: $lna.get(), vga: $vga.get(), amp: $amp.get() }); }
function setTc(tc) { $tc.set(tc); if (worker) worker.postMessage({ type: "deemph", tcUs: tc }); }

// ---- canvas drawing (guarded so the linkedom preflight's 0×0 stub canvas never draws or throws) ----
function ctx2d(cv) { try { return cv && cv.getContext ? cv.getContext("2d") : null; } catch { return null; } }
function sizeCanvas(cv) { const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1); const w = (cv?.clientWidth | 0) * dpr, h = (cv?.clientHeight | 0) * dpr; if (w && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; } return dpr; }
function heat(v) {
  v = Math.max(0, Math.min(1, v));
  const s = [[0, 10, 10, 11], [0.42, 40, 34, 92], [0.72, 118, 102, 210], [1, 236, 236, 238]];
  for (let i = 1; i < s.length; i++) if (v <= s[i][0]) { const a = s[i - 1], b = s[i], f = (v - a[0]) / (b[0] - a[0]); return `rgb(${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0},${a[3] + (b[3] - a[3]) * f | 0})`; }
  return "rgb(236,236,238)";
}
function drawSpectrum(cv, bins) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h || !bins) return;
  c.clearRect(0, 0, w, h);
  const n = bins.length, midX = w / 2;
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, x / w * n | 0)]); c.lineTo(x, h - v * h); }
  c.lineTo(w, h); c.closePath();
  const grad = c.createLinearGradient && c.createLinearGradient(0, 0, 0, h);
  if (grad && grad.addColorStop) { grad.addColorStop(0, "rgba(139,127,214,0.55)"); grad.addColorStop(1, "rgba(139,127,214,0.04)"); c.fillStyle = grad; }
  else c.fillStyle = "rgba(139,127,214,0.3)";
  c.fill();
  c.beginPath();
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, x / w * n | 0)]); const y = h - v * h; x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = "rgba(236,236,238,0.85)"; c.lineWidth = Math.max(1, h / 90); c.stroke();
  // center reticle — the tuned carrier sits at 0 Hz (mid-band)
  c.strokeStyle = "rgba(236,236,238,0.14)"; c.lineWidth = 1; c.beginPath(); c.moveTo(midX, 0); c.lineTo(midX, h); c.stroke();
}
function drawWaterRow(cv, bins) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h || !bins) return;
  c.drawImage(cv, 0, 1);                          // scroll everything down 1px; newest row at the top
  const n = bins.length, cols = Math.min(w, 384), cw = w / cols;
  for (let i = 0; i < cols; i++) { c.fillStyle = heat(norm(bins[Math.min(n - 1, i / cols * n | 0)])); c.fillRect(i * cw, 0, Math.ceil(cw), 1); }
}

// ================= views =================
export function fmradioView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const connected = useStore($connected), signal = useStore($signal), freq = useStore($freq), usbOk = useStore($usbOk);
  const spectrum = useStore($spectrum), playing = useStore($playing);
  const demo = gate;

  // Under the gate / ?mock there is no HackRF — seed the connected, populated screen with a deterministic
  // synthetic spectrum so every downstream check measures the real layout, not an empty connect prompt.
  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $freq.set(100e6); $signal.set(0.72); $spectrum.set(seedSpectrum(NBINS, 12));
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary border border-primary/25">${Icon("lucide:radio-tower", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning border border-warning/25 rounded-2xl text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  return html`<${Fragment}>
    <div class="flex flex-col items-center gap-4 max-w-[440px] mx-auto w-full pb-28">
      <div class="flex items-end justify-center gap-4 w-full pt-1" data-live data-readout>
        <div class="flex items-baseline gap-2 font-mono tabular-nums">
          <span class="text-6xl font-semibold leading-none tracking-tight">${fmMhz(freq)}</span>
          <span class="text-sm uppercase tracking-[0.18em] text-base-content/55">${T(t, "unitMhz")}</span>
        </div>
        <${SignalBars} level=${signal} label=${T(t, "sigLabel")} />
      </div>

      <div class="w-full rounded-3xl border border-base-content/10 bg-base-100/50 overflow-hidden backdrop-blur">
        <canvas ref=${useCanvas((cv) => drawSpectrum(cv, $spectrum.get()), spectrum)} class="block w-full h-24" aria-label=${T(t, "spectrum")} data-spectrum></canvas>
        <canvas ref=${useWaterfall(spectrum, demo)} class="block w-full h-32 border-t border-base-content/10" aria-hidden="true" data-waterfall></canvas>
      </div>

      <div class="w-full flex flex-col gap-1.5 px-1">
        <input type="range" min=${FM_LO} max=${FM_HI} step="0.1" value=${(freq / 1e6).toFixed(1)}
          aria-label=${T(t, "band")} onInput=${(e) => setFreq(Number(e.target.value) * 1e6)} class="range range-sm range-primary w-full" />
        <div class="flex justify-between font-mono text-[0.65rem] text-base-content/55 tabular-nums"><span>${FM_LO.toFixed(1)}</span><span>${FM_HI.toFixed(1)}</span></div>
      </div>

      <div class="flex items-center gap-6">
        <button data-tune="down" aria-label=${T(t, "tuneDown")} onClick=${() => setFreq(freq - STEP_HZ)} class="btn btn-circle btn-ghost">${Icon("lucide:minus", "text-2xl")}</button>
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${() => (playing ? pause() : play())}
          class=${`w-20 h-20 rounded-full grid place-items-center shadow-xl active:scale-95 transition ${playing ? "bg-primary text-primary-content" : "bg-base-content text-base-100"}`}>
          ${Icon(playing ? "lucide:volume-2" : "lucide:play", "text-3xl")}
        </button>
        <button data-tune="up" aria-label=${T(t, "tuneUp")} onClick=${() => setFreq(freq + STEP_HZ)} class="btn btn-circle btn-ghost">${Icon("lucide:plus", "text-2xl")}</button>
      </div>
    </div>

    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)">
      <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-2 py-1.5">
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/60" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      </div>
    </div>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

// draw to a canvas whenever `dep` changes, and on resize
function useCanvas(draw, dep) {
  const ref = useRef(null);
  useEffect(() => { const cv = ref.current; if (!cv) return; sizeCanvas(cv); draw(cv); }, [dep]);
  useEffect(() => { const cv = ref.current; if (!cv) return; const on = () => { sizeCanvas(cv); draw(cv); }; addEventListener("resize", on); return () => removeEventListener("resize", on); }, []);
  return ref;
}
// waterfall: prefill deterministically under demo (so the shot shows history), then push a row per frame
function useWaterfall(spectrum, demo) {
  const ref = useRef(null); const primed = useRef(false);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; sizeCanvas(cv);
    if (demo && !primed.current) { primed.current = true; for (let r = 0; r < (cv.height | 0); r++) drawWaterRow(cv, seedSpectrum(NBINS, r)); }
    else if (spectrum) drawWaterRow(cv, spectrum);
  }, [spectrum]);
  return ref;
}

function SignalBars({ level, label }) {
  const bars = 5, lit = Math.round(level * bars);
  return html`<div class="flex flex-col items-center gap-1" data-signal>
    <div class="flex items-end gap-[3px] h-8" aria-label=${label}>
      ${[...Array(bars)].map((_, i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${30 + i * 17.5}%`}></span>`)}
    </div>
    <span class="text-[0.6rem] uppercase tracking-wider text-base-content/55">${label}</span>
  </div>`;
}

// settings island → history-backed bottom sheet (S.screen="rf"): gains, de-emphasis, volume, disconnect.
function SettingsSheet({ open, onClose, t, demo }) {
  const vol = useStore($vol), lna = useStore($lna), vga = useStore($vga), amp = useStore($amp), tc = useStore($tc);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const Row = (label, node) => html`<div class="flex flex-col gap-1"><div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${label}</span></div>${node}</div>`;
  return html`<dialog id="rfsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-4 max-w-xl mx-auto">${grip}
    ${Row(html`${T(t, "volume")} <span class="font-mono tabular-nums text-base-content/50">${Math.round(vol * 100)}</span>`, html`<input type="range" min="0" max="1" step="0.01" value=${vol} class="range range-xs range-primary" aria-label=${T(t, "volume")} onInput=${(e) => setVol(Number(e.target.value))} />`)}
    ${Row(html`${T(t, "gainLna")} <span class="font-mono tabular-nums text-base-content/50">${lna} dB</span>`, html`<input type="range" min="0" max="40" step="8" value=${lna} class="range range-xs range-secondary" aria-label=${T(t, "gainLna")} onInput=${(e) => { $lna.set(Number(e.target.value)); pushGain(); }} />`)}
    ${Row(html`${T(t, "gainVga")} <span class="font-mono tabular-nums text-base-content/50">${vga} dB</span>`, html`<input type="range" min="0" max="62" step="2" value=${vga} class="range range-xs range-secondary" aria-label=${T(t, "gainVga")} onInput=${(e) => { $vga.set(Number(e.target.value)); pushGain(); }} />`)}
    <label class="flex items-center justify-between text-sm"><span class="flex items-center gap-2">${Icon("lucide:zap", "text-base text-base-content/60")}${T(t, "gainAmp")} <span class="text-base-content/55 font-mono text-xs">+14 dB</span></span>
      <input type="checkbox" class="toggle toggle-primary toggle-sm" checked=${amp} aria-label=${T(t, "gainAmp")} onChange=${(e) => { $amp.set(e.target.checked); pushGain(); }} /></label>
    <div class="flex flex-col gap-1">
      <span class="text-xs uppercase tracking-wide text-base-content/70">${T(t, "deemph")}</span>
      <div class="grid grid-cols-2 gap-2">
        ${[[50, "deemphEu"], [75, "deemphUs"]].map(([v, k]) => html`<button key=${v} data-tc=${v} aria-pressed=${tc === v} onClick=${() => setTc(v)} class=${`btn btn-sm ${tc === v ? "btn-primary" : "btn-outline border-base-content/20"}`}>${T(t, k)}</button>`)}
      </div>
    </div>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-base-content/60 self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}
