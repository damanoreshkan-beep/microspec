// Sonar — the phone emits a steady tone near 19 kHz and listens for it coming back. Anything moving reflects
// it Doppler-shifted, so motion appears as energy in the sidebands beside an otherwise pure carrier. This file
// owns only the wiring: the oscillator, the microphone, the analyser and the picture. Every number it shows is
// computed by /_rt/sonar.js, which is browser-free and unit-tested — the gate has no speaker and no mic.
//
// Three facts from RESEARCH.md that this file cannot get wrong:
//   · the carrier is SNAPPED to an exact FFT bin (snapCarrier). Off-bin, Blackman's sidelobes sit right where
//     a slow hand's sideband would be — measured at -60 dB against -187 dB on-bin. It is the whole design.
//   · getUserMedia may neither resolve nor reject, so nothing is sequenced behind it;
//   · ctx.resume() can stay pending forever without activation, so it is never awaited.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Transport, Segmented, Panel, Slider } from "/_rt/ui.js";
import { createEngine, audioSupported } from "/_rt/audio.js";
import { DEFAULTS, snapCarrier, binWidth, analyzeFrame, Calibration, Detector, synthSpectrum, dopplerHz } from "/_rt/sonar.js";
import { MicPrime } from "/_rt/camprime.js";
import { gate, MOCK } from "/_rt/gate.js";
import { wakeLock } from "/_rt/sensors.js";
import { collection } from "/_rt/db.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const CARRIERS = [18000, 19000, 20000];
const VOL_MAX = 0.1;                       // a Web Audio gain has no defined mapping to SPL, so the ceiling is
const AUTO_STOP_MS = 5 * 60 * 1000;        // conservative and the run is time-boxed rather than argued about
const CAL_FRAMES = 30;                     // ~2 s of a still room at rAF rate
const EVENTS = collection("sonarEvents");

const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const kHz = (hz) => `${(hz / 1000).toFixed(1)} kHz`;

// ---- state (module scope: the run survives a tab switch, which is the point of a motion log) ----
const $status = atom("idle");              // idle | listening | denied | unavailable | unsupported
const $primed = persistentAtom("sonar:primed", "0");
const $reading = atom(null);               // the last analyzeFrame result, trimmed to what the UI shows
const $active = atom(false);
const $cal = atom({ frames: 0, ready: false });
const $diag = atom({ ctxRate: 0, micRate: 0, emitted: 0, settings: null });
const $carrier = persistentAtom("sonar:carrier", "19000");
const $volume = persistentAtom("sonar:vol", "0.02");
const $logv = atom(0);                     // bumped when the log changes, so the list reloads

// ---- audio graph ----
let eng = null, analyser = null, stream = null, srcNode = null, osc = null, oscGain = null;
let raf = 0, buf = null, cal = null, det = null, lastT = 0, startedAt = 0, burst = null, frameN = 0;
let paint = null;                          // the row painter, set by the view when its canvas mounts
let gen = 0, wl = null;                    // `gen` invalidates a permission prompt the user walked away from

const carrierHz = () => Number($carrier.get()) || DEFAULTS.carrierHz;
const volume = () => Math.min(VOL_MAX, Math.max(0, Number($volume.get()) || 0));

// The gate's spectrum stream. Deterministic in the frame index — no Math.random, no clock — so a shot, an axe
// run and the breakpoint matrix all measure the SAME populated screen. It calibrates on a still room, then
// runs a hand crossing the beam over and over, which is the state worth measuring (an idle screen is not).
// GATE_STILL must exceed CAL_FRAMES: calibration that swallows moving frames learns the motion as the room's
// baseline and the threshold lands out of reach (measured: on = +47 dB, so the gate's detector never trips).
const GATE_RATE = 48000, GATE_STILL = CAL_FRAMES + 4;
function gateFrame(i) {
  const base = { sampleRate: GATE_RATE, fftSize: DEFAULTS.fftSize, seed: (i % 11) + 1 };
  if (i < GATE_STILL) return synthSpectrum(base);
  const p = ((i - GATE_STILL) % 96) / 96;
  if (p > 0.72) return synthSpectrum(base);                        // the pause between waves
  const swing = Math.sin((Math.PI * p) / 0.72);
  const hz = dopplerHz(0.06 + 0.42 * swing, carrierHz()) * (p < 0.36 ? 1 : -1);
  return synthSpectrum({ ...base, moves: [{ hz, db: -76 + 10 * swing }] });
}

function reset() {
  cal = Calibration({ minFrames: CAL_FRAMES });
  det = null; burst = null; frameN = 0;
  $cal.set({ frames: 0, ready: false });
  $active.set(false);
  $reading.set(null);
}

// One frame: analyse, calibrate or detect, and record the burst. `paint` is the picture, kept separate so the
// numbers still happen in a DOM with no canvas (preflight runs in linkedom).
function consume(db, dtMs, sampleRate) {
  const r = analyzeFrame(db, { sampleRate, fftSize: DEFAULTS.fftSize, carrierHz: carrierHz() });
  $reading.set({ ok: r.ok, motionDb: r.motionDb, direction: r.direction, dominantHz: r.dominantHz, snrDb: r.carrier.snrDb });
  if (r.ok) paint?.(db, r);
  if (!r.ok) { $active.set(false); return; }

  if (!cal.ready) {
    cal.push(r.motionDb);
    $cal.set({ frames: cal.frames, ready: cal.ready });
    if (cal.ready) det = Detector(cal.thresholds());
    return;
  }
  const was = $active.get();
  const now = det.update(r.motionDb, dtMs);
  if (now) {
    if (!burst) burst = { t: Date.now(), peak: r.motionDb, dir: r.direction };
    else if (r.motionDb > burst.peak) { burst.peak = r.motionDb; burst.dir = r.direction; }
  } else if (was && burst) {
    const ev = { ...burst, dur: (Date.now() - burst.t) / 1000 };
    burst = null;
    if (ev.dur >= 0.3) EVENTS.put(String(ev.t), ev).then(() => $logv.set($logv.get() + 1)).catch(() => {});
  }
  $active.set(now);
}

function pump() {
  raf = requestAnimationFrame(pump);
  const now = performance.now();
  const dt = lastT ? now - lastT : 16;
  lastT = now;
  if (now - startedAt > AUTO_STOP_MS) { stop(); return; }
  if (gate) { consume(gateFrame(frameN++), dt, GATE_RATE); return; }
  if (!analyser || !buf) return;
  analyser.getFloatFrequencyData(buf);
  consume(buf, dt, eng.ctx.sampleRate);
}

// The gate never waits and never drifts: one synchronous burst fills the calibration, the waterfall and the
// detector, and then STOPS mid-wave. So the first paint is already the settled, populated screen (a screen
// spending its first two seconds calibrating is the screen every gate would otherwise measure), and every
// shot, axe pass and breakpoint measures that identical frame instead of whatever phase rAF landed on.
const GATE_END = GATE_STILL + 96 + 25;     // …25 frames into a wave: moving, decisive, approaching
function gateWarmup() {
  reset();
  for (let i = 0; i < GATE_END; i++) consume(gateFrame(frameN++), 16, GATE_RATE);
}

function teardown() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0; lastT = 0;
  try { osc?.stop(); } catch { /* already stopped */ }
  try { osc?.disconnect(); oscGain?.disconnect(); srcNode?.disconnect(); } catch { /* torn down */ }
  osc = null; oscGain = null; srcNode = null; analyser = null; buf = null;
  try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
  stream = null;
  try { wl?.release(); } catch { /* */ }
  wl = null;
}

function stop() {
  gen++;                                   // a stream still in flight is stopped on arrival, never opened
  teardown();
  burst = null;
  $active.set(false);
  $status.set("idle");
}

// MIC constraints, `ideal` and never `exact`: a device that cannot switch its DSP off answers exact:false with
// OverconstrainedError, and a processed stream is still worth diagnosing. echoCancellation is the dangerous
// one — its job is to subtract the speaker's own output, which IS our signal.
const MIC = { audio: { channelCount: { ideal: 1 }, echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false }, sampleRate: { ideal: 48000 } }, video: false };

async function start() {
  if ($status.get() === "listening") return;
  reset();
  startedAt = performance.now();
  if (gate) { $status.set("listening"); gateWarmup(); return; }
  if (!audioSupported || !navigator.mediaDevices?.getUserMedia) { $status.set("unsupported"); return; }

  const mine = ++gen;
  let s = null;
  try { s = await navigator.mediaDevices.getUserMedia(MIC); }
  catch (e) {
    if (mine !== gen) return;
    const n = e && e.name;
    $status.set(n === "NotAllowedError" || n === "SecurityError" ? "denied" : "unavailable");
    return;
  }
  // The prompt may be answered long after the user gave up (or never answered at all — getUserMedia can
  // neither resolve nor reject), so a late stream is stopped rather than opened.
  if (mine !== gen) { s.getTracks().forEach((tr) => tr.stop()); return; }
  stream = s;
  $primed.set("1");

  eng = eng || createEngine({ master: 1, noise: false });
  if (!eng) { teardown(); $status.set("unsupported"); return; }
  eng.resume();                                             // never awaited: it can stay pending forever

  const ctx = eng.ctx;
  analyser = ctx.createAnalyser();
  analyser.fftSize = DEFAULTS.fftSize;
  analyser.smoothingTimeConstant = 0;                       // smoothing is an EMA over magnitude — it would
  buf = new Float32Array(analyser.frequencyBinCount);       // blur exactly the transient we are looking for
  srcNode = ctx.createMediaStreamSource(stream);
  srcNode.connect(analyser);

  const emitted = snapCarrier(carrierHz(), ctx.sampleRate, DEFAULTS.fftSize);
  osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = emitted;
  oscGain = ctx.createGain(); oscGain.gain.value = 0;
  osc.connect(oscGain); oscGain.connect(ctx.destination);
  osc.start();
  oscGain.gain.setTargetAtTime(volume(), ctx.currentTime, 0.05);

  let settings = null;
  try { settings = stream.getAudioTracks()[0]?.getSettings?.() || null; } catch { /* telemetry only */ }
  $diag.set({ ctxRate: ctx.sampleRate, micRate: settings?.sampleRate || 0, emitted, settings });

  wl = wakeLock.acquire();
  $status.set("listening");
  raf = requestAnimationFrame(pump);
}

// ---- the picture: a waterfall, time falling down, Doppler shift across ----
// Each row is one spectrum: left of centre is receding, right is approaching. The carrier's own guard band is
// left blank — it is the emitter, not a reflection — and drawn as a CSS hairline so it flips with the theme.
function makePainter(canvas, accent) {
  const c2d = canvas.getContext?.("2d");
  if (!c2d) return null;
  return (db, r) => {
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    c2d.drawImage(canvas, 0, 1);
    c2d.clearRect(0, 0, w, 1);
    const rate = $diag.get().ctxRate || GATE_RATE;
    const width = binWidth(rate, DEFAULTS.fftSize);
    const guard = Math.max(DEFAULTS.guardBins, Math.ceil(DEFAULTS.guardHz / width));
    const span = Math.round(DEFAULTS.bandHz / width);
    const floor = r.lower && r.upper ? Math.min(r.lower.floor, r.upper.floor) : 0;
    const floorDb = floor > 0 ? 10 * Math.log10(floor) : -110;
    for (let x = 0; x < w; x++) {
      const off = Math.round(((x + 0.5) / w - 0.5) * 2 * span);
      if (Math.abs(off) < guard) continue;
      const v = db[r.carrier.bin + off];
      if (!Number.isFinite(v)) continue;
      const a = Math.max(0, Math.min(1, (v - floorDb) / 34));
      if (a < 0.06) continue;
      c2d.fillStyle = `rgba(${accent}, ${a.toFixed(3)})`;
      c2d.fillRect(x, 0, 1, 1);
    }
  };
}

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "91, 141, 239";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

function Waterfall({ t }) {
  const box = useRef(null), canvas = useRef(null);
  useEffect(() => {
    const el = canvas.current, wrap = box.current;
    if (!el || !wrap) return;
    const accent = hexRgb(getComputedStyle(wrap).getPropertyValue("--app-accent"));
    const size = () => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr)), h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      paint = makePainter(el, accent);
    };
    size();
    let ro = null;
    try { ro = new ResizeObserver(size); ro.observe(wrap); } catch { /* linkedom */ }
    return () => { try { ro?.disconnect(); } catch { /* */ } paint = null; };
  }, []);
  return html`<div ref=${box} class="relative flex-1 min-h-0 rounded-[var(--ms-r)] bg-base-100 sf-inset overflow-hidden">
    <canvas ref=${canvas} class="absolute inset-0 w-full h-full"></canvas>
    <div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-base-content/25"></div>
    <div class="absolute inset-x-0 bottom-0 flex justify-between px-2 py-1 font-mono text-[length:var(--ms-label)] uppercase tracking-wide text-base-content/70">
      <span>${T(t, "axisFar")}</span><span>${T(t, "axisNear")}</span>
    </div>
  </div>`;
}

// ---- the main view ----
export function sonar({ t, loc, toast, S }) {
  const status = useStore($status), reading = useStore($reading), active = useStore($active);
  const calS = useStore($cal), primed = useStore($primed);
  const [showPrime, setPrime] = useState(false);

  useEffect(() => {
    setPrime((!gate && primed !== "1") || MOCK === "prime");
    if (gate && $status.get() !== "listening") start();
    const onHide = () => { if (document.hidden && $status.get() === "listening") stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [primed]);

  const listening = status === "listening";
  const err = status === "denied" ? "errDenied" : status === "unavailable" ? "errUnavailable" : status === "unsupported" ? "errUnsupported" : null;
  const weak = listening && reading && !reading.ok;
  const calibrating = listening && !calS.ready && !weak;
  const state = !listening ? "stateOff" : weak ? "stateWeak" : calibrating ? "stateCal" : active ? "stateMotion" : "stateStill";
  const dir = active && reading && Math.abs(reading.direction) >= DEFAULTS.directionMin
    ? (reading.direction > 0 ? "dirNear" : "dirFar") : null;

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] relative">
    <div class="shrink-0 flex items-center gap-3">
      <span class=${`w-3 h-3 rounded-full shrink-0 ${active ? "bg-[var(--app-accent)]" : "bg-base-content/25"}`}></span>
      <div class="min-w-0 flex-1">
        <div class="text-[length:var(--ms-title)] font-semibold leading-tight truncate">${T(t, state)}</div>
        <div class="font-mono text-xs uppercase tracking-wide text-base-content/70 truncate">
          ${dir ? T(t, dir) : calibrating ? `${calS.frames}/${CAL_FRAMES}` : listening ? kHz(carrierHz()) : T(t, "sigAutoStop")}
        </div>
      </div>
    </div>

    <${Waterfall} t=${t} />

    <div class="shrink-0 grid grid-cols-3 gap-[var(--ms-gap)] font-mono tabular-nums">
      <${Metric} label=${T(t, "mSignal")} value=${reading ? num(reading.motionDb) : "—"} unit="dB" live />
      <${Metric} label=${T(t, "mShift")} value=${reading && reading.ok && active ? num(reading.dominantHz) : "—"} unit="Hz" />
      <${Metric} label=${T(t, "mCarrier")} value=${reading && reading.ok ? num(reading.snrDb, 0) : "—"} unit="dB" />
    </div>

    ${err ? html`<div data-err class="shrink-0 text-center text-xs text-base-content/70">${T(t, err)}</div>` : null}

    <${Transport} locale=${loc} playing=${listening} stopIcon
      onToggle=${() => (listening ? stop() : start())}
      actions=${[{ id: "s-cal", icon: "lucide:crosshair", label: T(t, "aCalibrate"), disabled: !listening,
        onClick: () => { reset(); toast?.(T(t, "stateCal")); }, attr: { "data-cal": "1" } }]} />

    ${showPrime ? html`<${MicPrime} loc=${loc} reason=${T(t, "primeWhy")} privacy=${T(t, "primePrivacy")}
      denied=${status === "denied"} unavailable=${status === "unavailable" || status === "unsupported"}
      onEnable=${() => { setPrime(false); start(); }}
      onSettings=${() => S?.screen?.set("permissions")} />` : null}
  </div>`;
}

const Metric = ({ label, value, unit, live }) => html`<div class="rounded-[var(--ms-r)] bg-base-100 sf-inset px-2 py-1.5 min-w-0">
  <div class="text-[length:var(--ms-label)] uppercase tracking-wide text-base-content/70 truncate">${label}</div>
  <div ...${live ? { "data-live": "1" } : {}} class="truncate"><span class="text-[length:var(--ms-title)] font-semibold">${value}</span><span class="text-xs text-base-content/70"> ${unit}</span></div>
</div>`;

// ---- the log ----
const GATE_LOG = [
  { id: "g3", t: 1754600000000, dur: 4.2, peak: 19.4, dir: 0.91 },
  { id: "g2", t: 1754599400000, dur: 1.1, peak: 12.8, dir: -0.44 },
  { id: "g1", t: 1754598100000, dur: 12.6, peak: 21.7, dir: 0.08 },
];

export function sonarLog({ t, loc, toast, confirm, undo }) {
  const v = useStore($logv);
  const [list, setList] = useState(gate ? GATE_LOG : null);
  useEffect(() => {
    if (gate) return;
    let live = true;
    EVENTS.all().then((rows) => live && setList(rows)).catch(() => live && setList([]));
    return () => { live = false; };
  }, [v]);

  const fmt = (ms) => new Date(ms).toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (ms) => new Date(ms).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "short" });

  const del = async (it) => {
    const { id, _ts, ...rec } = it;
    setList((rows) => (rows || []).filter((r) => r.id !== id));   // optimistic: the row leaves under the finger
    try { await EVENTS.remove(id); } catch { /* */ }
    $logv.set($logv.get() + 1);
    undo?.(async () => { try { await EVENTS.put(id, rec); } catch { /* */ } $logv.set($logv.get() + 1); }, T(t, "logDeleted"));
  };
  const clear = () => confirm?.({
    title: T(t, "logClearTitle"),
    body: T(t, "logClearBody", { n: (list || []).length }),
    verb: T(t, "logClear"),
    onConfirm: async () => { try { await EVENTS.clear(); } catch { /* */ } $logv.set($logv.get() + 1); toast?.(T(t, "logCleared")); },
  });

  if (!list) return html`<div class="flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div data-skel key=${i} class="card bg-base-100 rounded-2xl"><div class="card-body p-3 h-14"></div></div>`)}</div>`;
  if (!list.length) {
    return html`<div class="flex flex-col items-center text-center gap-2 px-6 py-20 text-base-content/70">
      ${Icon("lucide:radio", "text-4xl")}
      <span class="font-semibold text-base-content">${T(t, "logEmpty")}</span>
      <span class="text-sm">${T(t, "logEmptyHint")}</span>
    </div>`;
  }
  return html`<div class="flex flex-col gap-2">
    ${list.map((it) => html`<div data-event key=${it.id} class="card bg-base-100 rounded-2xl">
      <div class="card-body p-3 flex-row items-center gap-3">
        <span class=${`w-9 h-9 rounded-full sf-inset shrink-0 flex items-center justify-center ${Math.abs(it.dir) >= DEFAULTS.directionMin ? "text-[var(--app-accent)]" : "text-base-content/70"}`}>
          ${Icon(Math.abs(it.dir) < DEFAULTS.directionMin ? "lucide:waves" : it.dir > 0 ? "lucide:arrow-down-left" : "lucide:arrow-up-right", "text-lg")}
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="font-mono tabular-nums font-semibold">${fmt(it.t)}</span>
            <span class="font-mono text-xs tabular-nums text-base-content/70">${T(t, "logDur", { s: num(it.dur) })}</span>
          </div>
          <div class="font-mono text-xs tabular-nums text-base-content/70 truncate">${day(it.t)} · ${num(it.peak)} dB${Math.abs(it.dir) >= DEFAULTS.directionMin ? ` · ${T(t, it.dir > 0 ? "dirNear" : "dirFar")}` : ""}</div>
        </div>
        <button data-del data-haptic="bump" aria-label=${T(t, "delete")} class="btn btn-ghost btn-sm btn-circle text-base-content/70" onClick=${() => del(it)}>${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>`)}
    <button data-clear data-haptic="bump" class="btn btn-ghost btn-sm self-center mt-2 text-base-content/70" onClick=${clear}>${Icon("lucide:eraser")}${T(t, "logClear")}</button>
  </div>`;
}

// ---- signal: what is actually being emitted and measured, plus what it may not claim ----
export function sonarSignal({ t }) {
  const carrier = useStore($carrier), vol = useStore($volume), diag = useStore($diag), reading = useStore($reading);
  const s = diag.settings || {};
  const proc = (v) => (v === undefined ? T(t, "dUnknown") : v ? T(t, "dProcOn") : T(t, "dProcOff"));
  const rate = diag.ctxRate || 0;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel} title=${T(t, "sigCarrier")}>
      <${Segmented} attr="data-carrier" value=${String(carrier)} onChange=${(v) => { $carrier.set(v); if ($status.get() === "listening") { stop(); start(); } }}
        items=${CARRIERS.map((hz) => ({ id: String(hz), label: kHz(hz) }))} />
      <${Slider} id="s-vol" label=${T(t, "sigVolume")} min=${0.005} max=${VOL_MAX} step=${0.005}
        value=${Number(vol)} onInput=${(v) => { $volume.set(String(v)); if (oscGain && eng) oscGain.gain.setTargetAtTime(Math.min(VOL_MAX, v), eng.ctx.currentTime, 0.05); }} />
    </${Panel}>

    <${Panel} title=${T(t, "sigMeasured")}>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-sm tabular-nums">
        <${Fact} k=${T(t, "dEmitted")} v=${rate ? `${snapCarrier(Number(carrier), rate, DEFAULTS.fftSize).toFixed(2)} Hz` : "—"} />
        <${Fact} k=${T(t, "dSnr")} v=${reading && reading.ok ? `${num(reading.snrDb, 0)} dB` : "—"} />
        <${Fact} k=${T(t, "dRateCtx")} v=${rate ? `${rate} Hz` : "—"} />
        <${Fact} k=${T(t, "dRateMic")} v=${s.sampleRate ? `${s.sampleRate} Hz` : T(t, "dUnknown")} />
        <${Fact} k=${T(t, "dFft")} v=${String(DEFAULTS.fftSize)} />
        <${Fact} k=${T(t, "dBin")} v=${rate ? `${binWidth(rate, DEFAULTS.fftSize).toFixed(3)} Hz` : "—"} />
      </dl>
      <div class="mt-1 font-mono text-xs text-base-content/70">
        ${T(t, "dProcessing")}: AEC ${proc(s.echoCancellation)} · NS ${proc(s.noiseSuppression)} · AGC ${proc(s.autoGainControl)}
      </div>
    </${Panel}>

    <${Panel} title=${T(t, "sigHonestTitle")}>
      <p class="text-sm leading-relaxed">${T(t, "sigHonestReal")}</p>
      <p class="text-sm leading-relaxed text-base-content/70">${T(t, "sigHonestNot")}</p>
    </${Panel}>

    <${Panel} title=${T(t, "sigAudibleTitle")}>
      <p class="text-sm leading-relaxed">${T(t, "sigAudible")}</p>
      <p class="text-sm leading-relaxed text-base-content/70">${T(t, "sigAutoStop")}</p>
    </${Panel}>
  </div>`;
}

const Fact = ({ k, v }) => html`<${Fragment}>
  <dt class="text-base-content/70 truncate">${k}</dt><dd class="text-right truncate">${v}</dd>
</${Fragment}>`;
