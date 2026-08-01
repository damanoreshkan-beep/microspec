// Ether — hear the invisible world with a HackRF, entirely on the device. Two instruments, and NO frequencies
// on the surface: Listen (tap a band → the app finds a live channel and plays the analog voice) and Radar
// (scan → a list of NAMED things transmitting around you). A Web Worker (sweep.worker.js) drives WebUSB: it
// sweeps to find/classify signals and fixed-tunes to demodulate audio. The maths lives in /_rt/sweep.js,
// /_rt/demod.js, /_rt/bandplan.js (all unit-tested). See apps/ether/RESEARCH.md.
//
// Two realities: with a HackRF attached the worker feeds real audio + signal + radar hits; under the headless
// gate (and ?mock preview) there is no USB, so the view seeds a plausible listening state + radar list + a
// waterfall so the populated screen — what every downstream gate measures — renders, marked data-live.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Transport, Island } from "/_rt/ui.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { OUT_RATE } from "/_rt/fmradio.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";
import { LISTEN_PRESETS } from "/_rt/bandplan.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const presetOf = (id) => LISTEN_PRESETS.find((p) => p.id === id) || null;

// ---- shared state (module scope, survives tab switches) ----
const $connected = atom(false), $usbOk = atom(true);
const $preset = atom(null);                                    // active Listen band id, or null
const $listenState = atom("idle");                            // idle | searching | live | silent
const $signal = atom(0);                                      // 0..1 channel strength
const $playing = atom(false);
const $scanning = atom(false), $radar = atom([]);            // [{ id, key, strength: 0..1 }]
const $wf = atom(null);                                       // waterfall: { rows, cols, data:Float32 } for the engineer sheet
const $vol = persistentAtom("ether:vol", 0.8, { encode: String, decode: Number });
const $squelch = persistentAtom("ether:sq", "1", { encode: String, decode: (s) => s === "1" });

// ---- audio (main thread): schedule the worker's 48 kHz chunks; a gain node is the mute. ----
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
  const now = c.currentTime; if (nextT < now + 0.08) nextT = now + 0.08;
  s.start(nextT); nextT += f32.length / OUT_RATE;
}
const npTitle = (t) => { const p = presetOf($preset.get()); return p ? T(t, p.key) : T(t, "title"); };

function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./sweep.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "audio") pushAudio(new Float32Array(m.buf));
    else if (m.type === "signal") $signal.set(Math.max(0, Math.min(1, m.level)));
    else if (m.type === "channel") $listenState.set(m.state);            // searching | live | silent
    else if (m.type === "scanProgress") $scanning.set(true);
    else if (m.type === "radar") { $radar.set(m.sources || []); $scanning.set(false); }
    else if (m.type === "waterfall") $wf.set(m.wf);
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
}
function stopWorker() { if (!worker) return; try { worker.postMessage({ type: "stop" }); } catch { /* */ } const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 300); }

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; }
  if (!dev) return;
  const c = ensureAudio(); c?.resume?.();
  $usbOk.set(true); $connected.set(true); startWorker();
}
function disconnect() {
  buzz(); pause(); stopWorker();
  $connected.set(false); $preset.set(null); $listenState.set("idle"); $signal.set(0);
  $scanning.set(false);
}

function listen(t, id) {
  buzz(12);
  const c = ensureAudio(); c?.resume?.();
  $preset.set(id); $listenState.set("searching"); $signal.set(0);
  if (gate || !worker) return;                                            // gate seeds; real worker sweeps→tunes
  worker.postMessage({ type: "listen", preset: presetOf(id) });
  if (!$playing.get()) play(t);
}
function nextChannel() { buzz(12); $listenState.set("searching"); if (worker) worker.postMessage({ type: "next" }); }
function play(t) {
  const c = ensureAudio(); c?.resume?.();
  if (gainNode) gainNode.gain.value = $vol.get();
  $playing.set(true); wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(t), artist: "Ether", onPlay: () => { if (!$playing.get()) play(t); }, onPause: () => pause(), resumeCtx: () => c?.resume?.() });
  np.setPlaying(npTitle(t));
}
function pause() { if (gainNode) gainNode.gain.value = 0; $playing.set(false); if (wl) { wl.release(); wl = null; } if (np) { np.release(); np = null; } }
function setVol(v) { $vol.set(v); if (gainNode && $playing.get()) gainNode.gain.value = v; }
function toggleSquelch() { $squelch.set(!$squelch.get()); if (worker) worker.postMessage({ type: "squelch", on: $squelch.get() }); }

function scan() {
  buzz(12);
  if (gate || !worker) return;                                          // no device under the gate — keep the seeded list
  $scanning.set(true); $radar.set([]);
  worker.postMessage({ type: "scan" });
}

// ================= Listen =================
export function listenView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk);
  const preset = useStore($preset), state = useStore($listenState), signal = useStore($signal);
  const playing = useStore($playing);
  const vol = useStore($vol), squelch = useStore($squelch);
  const demo = gate;

  useEffect(() => {                                                       // gate/?mock: a live listening state
    if (!demo) return;
    $connected.set(true); $preset.set("air"); $listenState.set("live"); $signal.set(0.66); $playing.set(true);
  }, []);

  if (!connected) return html`<${ConnectPrime} t=${t} usbOk=${usbOk} />`;

  const p = presetOf(preset);
  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] max-w-[440px] mx-auto w-full">
    <!-- band tiles: tap one to hear it. The active tile carries the accent as a MARK (ring + tint), not text. -->
    <div class="grid grid-cols-2 gap-[var(--ms-gap)] shrink-0" role="group" aria-label=${T(t, "listenPick")}>
      ${LISTEN_PRESETS.map((b) => {
    const on = preset === b.id;
    return html`<button key=${b.id} data-preset=${b.id} aria-pressed=${on} onClick=${() => listen(t, b.id)}
        class=${`flex items-center gap-2.5 rounded-[var(--ms-r)] px-3.5 py-3 text-left transition ${on ? "sf-e3 bg-primary/10 ring-1 ring-primary/40" : "sf-raised sf-e2"}`}>
        ${Icon(b.icon, `text-2xl shrink-0 ${on ? "text-primary" : "text-muted"}`)}
        <span class=${`font-medium leading-tight ${on ? "" : "text-base-content/80"}`}>${T(t, b.key)}</span>
      </button>`;
  })}
    </div>

    <!-- stage: the current listening state. flex-1 void absorbs the height (fit view, no scroll). -->
    <div class="flex-1 min-h-0 grid place-items-center text-center px-4">
      ${!p ? html`<div class="flex flex-col items-center gap-3 text-muted">
          ${Icon("lucide:radio-tower", "text-5xl")}<span>${T(t, "listenPick")}</span></div>`
    : state === "searching" ? html`<div class="flex flex-col items-center gap-4" data-searching>
          <${Equalizer} level=${0} searching=${true} />
          <span class="text-muted">${T(t, "searching")}</span></div>`
    : state === "silent" ? html`<div class="flex flex-col items-center gap-3 text-muted" data-silent>
          ${Icon("lucide:volume-x", "text-4xl")}<span>${T(t, "silent")}</span>
          <button data-next class="btn btn-sm gap-2 mt-1" onClick=${nextChannel}>${Icon("lucide:skip-forward")}${T(t, "nextChannel")}</button></div>`
    : html`<div class="flex flex-col items-center gap-4" data-live>
          <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon(p.icon, "text-4xl")}</div>
          <div class="flex flex-col items-center gap-1">
            <span class="text-xl font-semibold">${T(t, p.key)}</span>
            <span class="text-xs uppercase tracking-wider text-muted">${T(t, "listening")}</span>
          </div>
          <${Equalizer} level=${signal} />
        </div>`}
    </div>

    <!-- transport island: play/pause · next channel · squelch · record · volume in a sheet -->
    <${Island} pinned data-player className="w-full max-w-[440px] rounded-[1.5rem] p-2">
      <${Transport} locale=${S.locale.get?.() || "en"} size="md"
        playing=${playing} onToggle=${() => (playing ? pause() : play(t))}
        disabled=${!p}
        onNext=${p ? nextChannel : undefined}
        title=${p ? T(t, p.key) : T(t, "listenPick")}
        subtitle=${p ? T(t, state === "live" ? "listening" : state === "silent" ? "silent" : "searching") : null}
        actions=${[
    { id: "squelch", icon: squelch ? "lucide:volume-1" : "lucide:volume-2", label: T(t, "squelch"), onClick: toggleSquelch, active: squelch, pressed: squelch },
    { id: "opts", icon: "lucide:sliders-horizontal", label: T(t, "volume"), onClick: () => { buzz(); openScreen("opts"); }, pressed: screen === "opts" },
  ]} keep=${2} />
    <//>

    <${OptsSheet} open=${screen === "opts"} onClose=${closeScreen} t=${t} vol=${vol} squelch=${squelch} demo=${demo} />
  </div>`;
}

// A compact five-bar equalizer that breathes with the signal level — the "there is a voice here" cue, driven
// by data (data-live) so the gate measures it. Bars are CSS heights off the level; searching = a gentle idle.
function Equalizer({ level, searching = false }) {
  const bars = 5;
  return html`<div class="flex items-end gap-1.5 h-16" role="img" data-eq aria-hidden="true">
    ${[...Array(bars)].map((_, i) => {
    const base = searching ? 22 : 20 + level * 80 * (0.5 + 0.5 * Math.sin(i * 1.3));
    return html`<span key=${i} class=${`w-2.5 rounded-full ${searching ? "animate-pulse" : ""} ${level > 0.05 || searching ? "bg-primary" : ""}`}
      style=${`height:${Math.max(12, Math.min(100, base))}%${level > 0.05 || searching ? "" : ";background:var(--sf-track-face)"}`}></span>`;
  })}
  </div>`;
}

// Listen options → history-backed sheet (S.screen="opts"): volume + squelch + disconnect.
function OptsSheet({ open, onClose, t, vol, squelch, demo }) {
  return html`<${Sheet} id="optsheet" open=${open} onClose=${onClose} title=${T(t, "volume")} icon="lucide:sliders-horizontal">
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${T(t, "volume")}</span>
        <span class="font-mono tabular-nums text-muted">${Math.round(vol * 100)}</span></div>
      <input type="range" min="0" max="1" step="0.01" value=${vol} class="range range-xs range-primary" aria-label=${T(t, "volume")} onInput=${(e) => setVol(Number(e.target.value))} />
    </div>
    <label class="flex items-center justify-between text-sm"><span class="flex items-center gap-2">${Icon("lucide:volume-1", "text-base text-muted")}${T(t, "squelch")}</span>
      <input type="checkbox" class="toggle toggle-primary toggle-sm" checked=${squelch} aria-label=${T(t, "squelch")} onChange=${toggleSquelch} /></label>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-muted self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </${Sheet}>`;
}

// ================= Radar =================
export function radarView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk);
  const scanning = useStore($scanning), radar = useStore($radar);
  const demo = gate;

  useEffect(() => {                                                       // gate/?mock: a plausible radar sweep result
    if (!demo) return;
    $connected.set(true);
    $radar.set([
      { id: "ism24", key: "bandIsm24", strength: 0.9 },
      { id: "gsmUp", key: "bandGsmUp", strength: 0.62 },
      { id: "ism433", key: "bandIsm433", strength: 0.45 },
      { id: "ism868", key: "bandIsm868", strength: 0.3 },
    ]);
    $wf.set(seedWaterfall());
  }, []);

  if (!connected) return html`<${ConnectPrime} t=${t} usbOk=${usbOk} />`;

  return html`<div class="flex flex-col gap-[var(--ms-gap)] max-w-[440px] mx-auto w-full pb-24">
    <div class="flex items-center gap-2 pt-0.5">
      <button data-scan disabled=${scanning} onClick=${scan}
        class="btn btn-primary flex-1 gap-2 rounded-[var(--ms-r)]">${Icon("lucide:radar", `text-lg ${scanning ? "animate-spin" : ""}`)}${T(t, scanning ? "scanning" : "scan")}</button>
      <button data-engineer aria-label=${T(t, "engineer")} aria-expanded=${screen === "eng"} onClick=${() => { buzz(); openScreen("eng"); }}
        class="btn btn-square btn-ghost">${Icon("lucide:activity", "text-lg")}</button>
    </div>

    ${scanning && !radar.length ? html`<div class="flex flex-col gap-[var(--ms-gap)]" data-skel>
        ${[0, 1, 2].map((i) => html`<div key=${i} class="h-[4.5rem] rounded-[var(--ms-r)] sf-inset animate-pulse"></div>`)}
      </div>`
    : radar.length ? html`<div class="flex flex-col gap-[var(--ms-gap)]" data-live>
        ${radar.slice().sort((a, b) => b.strength - a.strength).map((s) => html`
          <div key=${s.id} data-hit=${s.id} class="flex items-center gap-3 rounded-[var(--ms-r)] px-4 py-3 sf-raised sf-e2">
            ${Icon(iconFor(s.id), "text-2xl text-muted shrink-0")}
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">${T(t, s.key)}</div>
              <${StrengthBar} level=${s.strength} />
            </div>
            <span class="text-xs uppercase tracking-wider shrink-0 ${s.strength > 0.55 ? "text-primary" : "text-muted"}">${T(t, s.strength > 0.55 ? "strong" : "faint")}</span>
          </div>`)}
      </div>`
    : html`<div class="flex flex-col items-center text-center text-muted gap-3 py-16 px-6" data-empty>
        ${Icon("lucide:radar", "text-4xl")}<span>${T(t, "radarEmpty")}</span></div>`}

    <${EngineerSheet} open=${screen === "eng"} onClose=${closeScreen} t=${t} />
  </div>`;
}

function StrengthBar({ level }) {
  return html`<div class="h-1.5 rounded-full overflow-hidden mt-1.5" style="background:var(--sf-track-face)" role="img">
    <div class="h-full bg-primary transition-[width] duration-300" style=${`width:${Math.round(Math.max(0.05, Math.min(1, level)) * 100)}%`}></div>
  </div>`;
}

// Engineer escape hatch: the raw waterfall, tucked behind a sheet so it never fronts the "no frequencies" UI.
function EngineerSheet({ open, onClose, t }) {
  const wf = useStore($wf), ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !open) return;
    const data = wf || seedWaterfall();
    drawWaterfall(cv, data);
  }, [open, wf]);
  return html`<${Sheet} id="engsheet" open=${open} onClose=${onClose} title=${T(t, "engineer")} subtitle=${T(t, "engineerHint")} icon="lucide:activity">
    <canvas ref=${ref} data-canvas width="512" height="256" class="w-full rounded-[var(--ms-r)] sf-inset" style="image-rendering:pixelated;aspect-ratio:2/1"></canvas>
  </${Sheet}>`;
}

// ================= shared bits =================
function ConnectPrime({ t, usbOk }) {
  const supported = usbSupported() && usbOk;
  return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
    <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:usb", "text-4xl")}</div>
    <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
    <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
    ${supported
    ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
    : html`<div class="alert bg-warning/12 text-warning rounded-2xl text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
  </div>`;
}

const ICONS = { fm: "lucide:music", air: "lucide:plane", ham2m: "lucide:radio-tower", ham70: "lucide:radio-tower", marine: "lucide:anchor", pmr: "lucide:radio", ism433: "lucide:key-round", ism868: "lucide:gauge", gsmUp: "lucide:smartphone", gsmDn: "lucide:antenna", gps: "lucide:satellite", dect: "lucide:phone", ism24: "lucide:wifi", wifi5: "lucide:wifi", dab: "lucide:radio", unknown: "lucide:signal" };
const iconFor = (id) => ICONS[id] || "lucide:signal";

// Deterministic seeded waterfall so the engineer sheet renders in the gate/preview without hardware.
function seedWaterfall() {
  const rows = 48, cols = 128, data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const carriers = Math.exp(-((c - 30) ** 2) / 40) * 0.9 + Math.exp(-((c - 78) ** 2) / 20) * 0.7 + Math.exp(-((c - 104) ** 2) / 60) * 0.5;
    const noise = 0.12 * ((Math.sin(r * 1.7 + c * 0.9) + 1) / 2);
    data[r * cols + c] = Math.min(1, carriers * (0.7 + 0.3 * Math.sin(r * 0.4)) + noise);
  }
  return { rows, cols, data };
}
function drawWaterfall(cv, { rows, cols, data }) {
  const ctx = cv.getContext("2d"); if (!ctx) return;
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < rows * cols; i++) {
    const v = Math.max(0, Math.min(1, data[i]));
    // ink→accent ramp: dark base, brightening to the app cyan — a heat scale that reads in both themes.
    const R = Math.round(20 + v * 36), G = Math.round(24 + v * 165), B = Math.round(30 + v * 220);
    img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255;
  }
  const tmp = new OffscreenCanvas(cols, rows); tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
}
