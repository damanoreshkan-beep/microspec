// Grain — record two seconds of the world and play it. The take is granulated: a cloud of short windowed
// slices of YOUR recording, pitched to a scale, so a door, a cup or a voice becomes an instrument. Three
// tabs: Play (the fields you strike + Flow, the auto-generated phrase), Shape (the head: where in the sample
// it reads, how long each grain is, how far they scatter) and Takes (saved recordings, exported as WAV).
//
// Every number that decides HOW grains are scheduled lives in /_rt/grain.js — pure, unit-tested, and shared
// by the live scheduler and the offline export, which is the only reason the exported file is what you heard.
// The recipe and its sources are in RESEARCH.md; the two facts that shape this file:
//   · getUserMedia can neither resolve nor reject if the prompt is ignored, so nothing waits on the mic;
//   · ctx.resume() can stay pending forever without activation, so nothing is sequenced behind it.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Transport, Island, Slider } from "/_rt/ui.js";
import { AC, audioSupported, createEngine, midiToFreq } from "/_rt/audio.js";
import { downloadBlob } from "/_rt/apk.js";
import { hannCurve, planGrains, conditionSample, detectPitch, encodeWav, syntheticSample, semisToRate, grainRate } from "/_rt/grain.js";
import { generateMelody } from "/_rt/melody.js";
import { Parallax } from "/_rt/spectrum.js";
import { collection } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { mic, tilt, wakeLock } from "/_rt/sensors.js";
import { MicPrime } from "/_rt/camprime.js";
import { holdAudio } from "/_rt/mediasession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;
const N = 16, STEPS = [...Array(N).keys()];
const LOOKAHEAD = 0.1, TICK = 25, LEAD = 0.08;              // "A tale of two clocks", the farm's numbers
const TAKE_SECONDS = 2;

// Fields are semitone offsets from the take's own pitch — the recording IS the root, so an unpitched slam
// works exactly like a struck bowl; only the LABEL differs (a note name is claimed for neither).
const SCALES = [
  { id: "pent", name: "scPent", offs: [0, 3, 5, 7, 10, 12, 15, 17] },
  { id: "minor", name: "scMinor", offs: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "major", name: "scMajor", offs: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "wide", name: "scWide", offs: [-12, -7, -5, 0, 5, 7, 12, 19] },
];
const scaleById = (id) => SCALES.find((s) => s.id === id) || SCALES[0];
const PC = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (hz) => { const m = Math.round(69 + 12 * Math.log2(hz / 440)); return PC[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };

// ---- state ----
const $take = atom(null);                                   // { pcm, sr, dur, hz, pitched, name, id? }
const $grainMs = atom(70), $spray = atom(60), $density = atom(4), $pos = atom(0.25), $drift = atom(0.35);
const $scale = atom("pent"), $tilted = atom(false), $tone = atom(1);
const $playing = atom(false), $cur = atom(-1), $lit = atom(new Set()), $loop = atom(Array.from({ length: N }, () => -1));
const $bpm = atom(84), $capture = atom("idle"), $err = atom(null), $level = atom(0), $busy = atom(false);
const TAKES = collection("grainTakes");
const emptyLoop = () => Array.from({ length: N }, () => -1);

// ---- engine (module scope: a cloud ringing and a loop playing survive a tab switch) ----
let eng = null, busIn = null, toneFilter = null, buf = null, sched = null, raf = null;
let nextT = 0, stepN = 0, q = [], voices = new Set(), wl = null, np = null, _dict = {};
const HANN = hannCurve();                                   // ONE curve, reused by every grain — no per-grain allocation
const spb = () => 60 / $bpm.get() / 2;

function ensure() {
  if (!audioSupported) return null;
  if (!eng) {
    const e = createEngine({ master: 0.9, noise: false }); if (!e) return null;
    const ctx = e.ctx;
    const comp = ctx.createDynamicsCompressor();            // overlap sums fast; without this a dense cloud clips
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
    toneFilter = ctx.createBiquadFilter(); toneFilter.type = "lowpass"; toneFilter.frequency.value = 12000; toneFilter.Q.value = 0.6;
    busIn = ctx.createGain(); busIn.gain.value = 0.9;
    busIn.connect(toneFilter); toneFilter.connect(comp); comp.connect(e.master);
    eng = e;
  }
  eng.resume();                                             // never awaited: it can stay pending forever
  syncBuffer();
  return eng;
}
// the decoded take as an AudioBuffer, rebuilt only when the take changes
let bufFor = null;
function syncBuffer() {
  const tk = $take.get();
  if (!eng || !tk || bufFor === tk) return;
  const b = eng.ctx.createBuffer(1, tk.pcm.length, tk.sr);
  b.copyToChannel ? b.copyToChannel(tk.pcm, 0) : b.getChannelData(0).set(tk.pcm);
  buf = b; bufFor = tk;
}

// fireGrain — one windowed slice. The gain node carries the SHARED Hann curve (0..1) and the voice node
// carries the level, so the curve is never scaled and never reallocated.
function fireGrain(ctx, dest, srcBuf, g, when) {
  const s = ctx.createBufferSource(); s.buffer = srcBuf; s.playbackRate.value = g.rate;
  const gn = ctx.createGain(); gn.gain.value = 0;
  try { gn.gain.setValueCurveAtTime(HANN, when, g.dur); } catch { gn.gain.value = 0.7; }
  s.connect(gn); gn.connect(dest);
  s.start(when, g.offset, g.dur * g.rate + 0.02);
  s.stop(when + g.dur + 0.02);
  s.onended = () => { try { s.disconnect(); gn.disconnect(); } catch { /* */ } };
}

// A voice is a precomputed PLAN plus a cursor. Precomputing (rather than drawing jitter per tick) is what
// makes the offline export identical to the live pass — same seed, same grains.
function makeVoice({ semis, vel = 1, seed, span = 8 }) {
  const tk = $take.get(); if (!tk) return null;
  return {
    plan: planGrains({ span, grainMs: $grainMs.get(), overlap: $density.get(), sprayMs: $spray.get(),
      pos: $pos.get() * tk.dur, advance: $drift.get(), semis, sampleDur: tk.dur, seed, peak: vel }),
    i: 0, t0: 0, release: 0, node: null,
  };
}
function startVoice(v, when, vel = 1) {
  const c = eng.ctx, node = c.createGain();
  node.gain.value = clamp(vel, 0, 1); node.connect(busIn);
  v.node = node; v.t0 = when; voices.add(v);
}
function releaseVoice(v) {
  if (!v || v.release) return;
  v.release = eng.ctx.currentTime + 0.05;
  try { v.node?.gain.setTargetAtTime(0, v.release, 0.25); } catch { /* */ }
  setTimeout(() => { voices.delete(v); try { v.node?.disconnect(); } catch { /* */ } }, 2200);
}

// tilt macro: SIZE on the front/back axis, TONE on the roll. Tone is a bus filter rather than the spray of
// RESEARCH.md §7 — spray is baked into a voice's plan at trigger time, so twisting it mid-note would have to
// re-plan (and break export parity), while a filter is one live param and just as expressive under the hand.
const tiltMacro = { size: 1, tone: 1 };
function applyTone() {
  if (!toneFilter || !eng) return;
  const v = clamp($tone.get() * tiltMacro.tone, 0.05, 1.6);
  try { toneFilter.frequency.setTargetAtTime(clamp(400 * Math.pow(30, v), 300, 16000), eng.ctx.currentTime, 0.08); } catch { /* */ }
}

const flash = (i) => { const s = new Set($lit.get()); s.add(i); $lit.set(s); setTimeout(() => { const n = new Set($lit.get()); n.delete(i); $lit.set(n); }, 420); };

// strike a field: hold = a sustaining cloud released on lift, else a short burst.
function strike(idx, { hold = false, vel = 0.9, when = 0 } = {}) {
  const e = ensure(); if (!e || !buf) return null;
  const offs = scaleById($scale.get()).offs; if (idx < 0 || idx >= offs.length) return null;
  const v = makeVoice({ semis: offs[idx], vel, seed: (randSeed() ^ (idx * 2654435761)) >>> 0, span: hold ? 12 : 1.1 });
  if (!v) return null;
  v.plan = v.plan.map((g) => ({ ...g, dur: clamp(g.dur * tiltMacro.size, 0.008, 0.6) }));
  startVoice(v, Math.max(when, e.ctx.currentTime + 0.02), vel);
  flash(idx);
  if (!hold) setTimeout(() => releaseVoice(v), 900);
  return v;
}

function tick() {
  const e = eng; if (!e) return;
  const until = e.ctx.currentTime + LOOKAHEAD;
  for (const v of voices) {
    while (v.i < v.plan.length && v.t0 + v.plan[v.i].t < until) {
      const g = v.plan[v.i++];
      const at = v.t0 + g.t;
      if (v.release && at > v.release) { v.i = v.plan.length; break; }
      fireGrain(e.ctx, v.node, buf, g, at);
    }
    if (v.i >= v.plan.length && !v.release) releaseVoice(v);
  }
  if (!$playing.get()) return;
  const dt = spb();
  if (nextT < e.ctx.currentTime) nextT = e.ctx.currentTime;   // returning from background: drop what was missed,
  while (nextT < until) {                                     // never replay it as a burst
    const idx = $loop.get()[stepN];
    if (idx >= 0) { const v = strike(idx, { vel: 0.85, when: nextT }); if (v) setTimeout(() => releaseVoice(v), dt * 1400); }
    if (q.length < 128) q.push({ time: nextT, step: stepN });
    nextT += dt; stepN = (stepN + 1) % N;
  }
}
const draw = () => { const e = eng; if (e) { const now = e.ctx.currentTime; while (q.length && q[0].time <= now) $cur.set(q.shift().step); } raf = requestAnimationFrame(draw); };

function pump() { if (!sched) sched = setInterval(tick, TICK); if (!raf) raf = requestAnimationFrame(draw); }
function start() {
  const e = ensure(); if (!e) return;
  $playing.set(true);
  wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: takeTitle(), artist: "microspec", onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => e.resume() });
  np.setPlaying(takeTitle());
  q = []; nextT = e.ctx.currentTime + LEAD; stepN = 0; pump();
}
function stop() {
  $playing.set(false); $cur.set(-1);
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
  for (const v of voices) releaseVoice(v);
}
const toggle = () => { buzz(12); $playing.get() ? stop() : start(); };
const takeTitle = () => { const tk = $take.get(); return tk ? tk.name : "Grain"; };

// Flow — the same scored search the rest of the farm's instruments use (consonance, voice-leading, cadence).
function flow(seed = randSeed(), { play = true } = {}) {
  const offs = scaleById($scale.get()).offs;
  const g = generateMelody(offs, { seed, len: N, restP: 0.3, tries: 240 });
  const next = emptyLoop();
  g.notes.forEach((n, i) => { if (!n.rest && n.i < offs.length) next[i] = n.i; });
  $loop.set(next);
  if (play && !$playing.get()) start();
}

// ================= capture =================
// Nothing is sequenced behind the mic: the promise may never settle (MDN), so the UI drives the state and
// `record()` owns the timeout and the teardown.
let live = null;
async function capture(onDone) {
  // …and a WRITTEN loop with it: an empty 8×16 grid is a wall of identical slots, so the shot, the a11y
  // sweep and the fit measurements would all be taken on a screen no user with a phrase ever sees.
  if (gate) { adopt(syntheticSample(48000, 1.6), 48000, true); flow(20260731, { play: false }); onDone?.(); return; }
  $err.set(null); $capture.set("arming");
  const h = mic.record({
    seconds: TAKE_SECONDS,
    onErr: (kind) => { $err.set(kind); $capture.set("idle"); $level.set(0); },
    onStream: (stream) => { $capture.set("recording"); meter(stream); },
  });
  live = h;
  const res = await h.done;
  live = null; stopMeter();
  if (!res) { $capture.set("idle"); return; }
  $capture.set("working");
  try {
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(await res.blob.arrayBuffer());
    const chans = []; for (let c = 0; c < decoded.numberOfChannels; c++) chans.push(decoded.getChannelData(c));
    adopt(chans, decoded.sampleRate, false, ctx);
    try { ctx.close(); } catch { /* */ }
  } catch { $err.set("decode"); }
  $capture.set("idle"); onDone?.();
}
function adopt(chans, sr, synthetic) {
  const c = conditionSample(Array.isArray(chans) ? chans : [chans], sr);
  const p = detectPitch(c.pcm, sr);
  $take.set({ pcm: c.pcm, sr, dur: c.dur, hz: p.hz, pitched: p.pitched, quiet: c.quiet, clipped: c.clipped,
    name: p.pitched ? noteName(p.hz) : "", synthetic });
  bufFor = null; if (eng) syncBuffer();
}
// live input level, for the record ring — an AnalyserNode on the capture stream, never on the output bus
let meterCtx = null, meterRaf = 0;
function meter(stream) {
  try {
    meterCtx = new AC();
    const src = meterCtx.createMediaStreamSource(stream), an = meterCtx.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const d = new Uint8Array(an.frequencyBinCount);
    const loop = () => { an.getByteFrequencyData(d); let s = 0; for (let i = 0; i < d.length; i++) s += d[i]; $level.set(clamp(s / d.length / 90, 0, 1)); meterRaf = requestAnimationFrame(loop); };
    meterRaf = requestAnimationFrame(loop);
  } catch { /* a meter is a nicety; never let it break the take */ }
}
function stopMeter() { if (meterRaf) cancelAnimationFrame(meterRaf); meterRaf = 0; $level.set(0); try { meterCtx?.close(); } catch { /* */ } meterCtx = null; }

// ================= offline export =================
// The loop rendered through the same plans, so the file IS the performance. OfflineAudioContext needs no
// hardware and no user activation, which is also why the gate can run this path.
async function renderWav(take, loopArr, bpm) {
  const OAC = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null;
  if (!OAC || !take) return null;
  const sr = take.sr, dt = 60 / bpm / 2, bars = 2, len = Math.ceil(sr * (dt * N * bars + 1.5));
  const ctx = new OAC(1, len, sr);
  const src = ctx.createBuffer(1, take.pcm.length, sr);
  src.copyToChannel ? src.copyToChannel(take.pcm, 0) : src.getChannelData(0).set(take.pcm);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
  const offs = scaleById($scale.get()).offs;
  for (let bar = 0; bar < bars; bar++) {
    for (let s = 0; s < N; s++) {
      const idx = loopArr[s]; if (idx < 0 || idx >= offs.length) continue;
      const when = (bar * N + s) * dt;
      const node = ctx.createGain(); node.gain.value = 0.85; node.connect(comp);
      const plan = planGrains({ span: dt * 1.4, grainMs: $grainMs.get(), overlap: $density.get(), sprayMs: $spray.get(),
        pos: $pos.get() * take.dur, advance: $drift.get(), semis: offs[idx], sampleDur: take.dur, seed: (idx * 2654435761 + s) >>> 0, peak: 0.85 });
      node.gain.setValueAtTime(0.85, when);
      node.gain.setTargetAtTime(0, when + dt * 1.1, 0.12);
      for (const g of plan) fireGrain(ctx, node, src, g, when + g.t);
    }
  }
  const out = await ctx.startRendering();
  return encodeWav([out.getChannelData(0)], sr);
}
async function shareWav(bytes, name, t) {
  const blob = new Blob([bytes], { type: "audio/wav" }), file = new File([blob], `${name}.wav`, { type: "audio/wav" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return "shared"; }
  } catch { return "cancel"; }                                // AbortError = the user closed the sheet; not an error
  downloadBlob(blob, `${name}.wav`);   // shell-aware: a bare <a download> saves nothing inside the APK
  return "saved";
}

// ---- waveform: peaks as flex bars. No canvas — linkedom has none and the headless gate would measure a
// blank box, so the shape of the sound must be real DOM. ----
// Amplitude is displayed on a SQUARE ROOT, not linearly: a struck sample decays exponentially, so a linear
// bar chart puts ~90% of the take on the 6px floor and the tail reads as a dotted line rather than a sound
// (measured on the takes row — the 1.6 s fixture rendered as five bars and a row of dots).
function peaks(pcm, n) {
  const out = new Array(n).fill(0); if (!pcm?.length) return out;
  const w = Math.floor(pcm.length / n) || 1;
  for (let i = 0; i < n; i++) { let p = 0; for (let j = i * w, e = Math.min(pcm.length, j + w); j < e; j++) { const a = Math.abs(pcm[j]); if (a > p) p = a; } out[i] = p; }
  const mx = Math.max(0.001, ...out);
  return out.map((v) => Math.sqrt(v / mx));
}
// `dim` = a portrait of the take with no read head: in a list the split would claim a playing position that
// list has no concept of.
function Wave({ take, pos = 0, onSeek, bars = 56, dim = false, className = "" }) {
  const p = useMemo(() => peaks(take?.pcm, bars), [take, bars]);
  const hit = (e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek(clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1)); };
  return html`<div data-live data-wave class=${`relative flex items-center gap-px w-full ${className}`} onPointerDown=${hit}>
    ${p.map((v, i) => { const played = !dim && i / bars <= pos; return html`<span key=${i} class=${`flex-1 rounded-full ${played ? "bg-primary" : dim ? "bg-base-content/40" : ""}`}
      style=${`height:${Math.max(6, Math.round(v * 100))}%${played || dim ? "" : ";background:var(--sf-track-face)"}`}></span>`; })}
  </div>`;
}

// ================= Play =================
export function grain({ S, screen, openScreen, closeScreen, toast }) {
  const t = useStore(S.t); _dict = t;
  const loc = useStore(S.locale);
  const take = useStore($take), playing = useStore($playing), lit = useStore($lit), cap = useStore($capture);
  const err = useStore($err), level = useStore($level), scaleId = useStore($scale), busy = useStore($busy), pos = useStore($pos);
  const [denied, setDenied] = useState(false);
  const held = useRef(new Map()), padRef = useRef();

  useEffect(() => { if (gate && !$take.get()) capture(); }, []);
  useEffect(() => () => { for (const v of voices) releaseVoice(v); }, []);
  useEffect(() => { setDenied(err === "denied"); }, [err]);

  // tilt → size + tone, smoothed by the runtime's Parallax (EMA 0.1, clamped ±20°) so the hand does not
  // make it seasick. Writes the macro only; the sound reads it when the next grain is planned.
  const tilted = useStore($tilted);
  useEffect(() => {
    if (!tilted || !tilt.supported) { tiltMacro.size = 1; tiltMacro.tone = 1; applyTone(); return; }
    const p = Parallax({ alpha: 0.12, maxDeg: 20, gain: 1 });
    const off = tilt.start(({ beta, gamma }) => {
      if (beta == null) return;
      const v = p.update(beta, gamma);
      tiltMacro.size = clamp(1 + v.y * 1.1, 0.35, 2.2);
      tiltMacro.tone = clamp(1 + v.x * 0.5, 0.5, 1.5);
      applyTone();
    });
    return () => { off?.(); tiltMacro.size = 1; tiltMacro.tone = 1; applyTone(); };
  }, [tilted]);

  const offs = scaleById(scaleId).offs;
  const fieldAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest && el.closest("[data-field]"); return b ? Number(b.getAttribute("data-field")) : null; };
  const down = (e) => {
    const i = fieldAt(e.clientX, e.clientY); if (i == null || !take) return;
    e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    const v = strike(i, { hold: true }); pump(); if (v) held.current.set(e.pointerId, v);
  };
  const up = (e) => { const v = held.current.get(e.pointerId); if (v) { releaseVoice(v); held.current.delete(e.pointerId); } };

  const rec = async () => { buzz(12); await capture(); if ($err.get()) return; toast?.(T(t, "toastTake")); };
  const save = async () => {
    const tk = $take.get(); if (!tk) return;
    const list = await TAKES.all().catch(() => []);
    const base = tk.pitched ? tk.name : T(t, "unpitched");
    let name = base, k = 2; while (list.some((it) => it.name === name)) name = `${base} ${k++}`;
    await TAKES.put("t" + Date.now(), { name, pcm: tk.pcm, sr: tk.sr, dur: tk.dur, hz: tk.hz, pitched: tk.pitched, scaleId: $scale.get(), bpm: $bpm.get(), loop: $loop.get() });
    toast?.(T(t, "toastSaved"));
  };
  const exportWav = async () => {
    const tk = $take.get(); if (!tk || busy) return;
    $busy.set(true);
    try { const bytes = await renderWav(tk, $loop.get(), $bpm.get()); if (bytes) { const how = await shareWav(bytes, `grain-${tk.pitched ? tk.name : "take"}`, t); if (how === "saved") toast?.(T(t, "toastExport")); } }
    catch { toast?.(T(t, "toastExportFail")); }
    $busy.set(false);
  };

  const recording = cap === "recording", arming = cap === "arming", working = cap === "working";
  // A fixed stage escapes #view's padding, so it consumes the chrome contract itself — and both numbers are
  // MEASURED by render.js, never guessed here: a hardcoded 3.5rem ignores a header that compacts, and on a
  // watch the dock is a right-hand RAIL (--dock-h collapses to 0, --dock-w appears), which a `right-0` stage
  // runs straight underneath. 137px of this column sat under that rail, and the magnitude never moved while
  // I compacted the content — the overlap was horizontal all along.
  return html`<div class="ms-stage z-20 flex flex-col">
    ${!take && !gate ? html`<${MicPrime} loc=${loc} reason=${T(t, "primeWhy")} denied=${denied}
      unavailable=${err === "unavailable" || err === "unsupported" || !mic.supported}
      onEnable=${rec} onSettings=${() => S.screen.set("perms")} />` : null}

    ${/* A fit screen has ONE void that absorbs the height — here the field grid — and everything else is
         shrink-0 sized off the density tokens. The grid earns that role only because its buttons carry
         `min-h-0` and no intrinsic padding floor: with `p-2` and a text line they refused to compress and
         pushed themselves under the dock (17px landscape, 137px on a watch — the gate named the button). */""}
    <div class="flex flex-col flex-1 min-h-0 gap-[var(--ms-gap)]" style="padding:var(--ms-gap) var(--ms-pad)">
      <div class="shrink-0 flex items-center gap-[var(--ms-gap)]">
        <${Segmented} attr="data-scale" scroll variant="outline" label=${T(t, "scale")}
          items=${SCALES.map((s) => ({ id: s.id, label: T(t, s.name) }))} value=${scaleId} onChange=${(id) => { buzz(); $scale.set(id); }} />
      </div>

      ${/* The take itself is the stage: its shape is the only thing on screen that is genuinely YOURS, so it
           gets the width, and tapping it moves the read head. The readout sits INSIDE it — a separate line
           costs a row plus a gap on every screen, to say two short words. */""}
      <div class="shrink-0 relative rounded-[var(--ms-r)] sf-inset px-2 flex items-center h-[clamp(1.75rem,9vh,3.75rem)] overflow-hidden">
        <${Wave} take=${take} pos=${pos} onSeek=${(v) => $pos.set(v)} className="h-[70%]" />
        <span class="absolute right-2 top-0 bottom-0 flex items-center gap-1.5 pl-2 text-[var(--ms-label)] text-base-content/70 pointer-events-none">
          <span class="tabular-nums">${take ? `${take.dur.toFixed(1)}s` : "—"}</span>
          <span data-pitch class="font-semibold text-base-content">${take ? (take.pitched ? take.name : T(t, "unpitched")) : T(t, "noTake")}</span>
        </span>
        ${/* The input level belongs to the RECORDING, so it lives on the take's own box — as a sibling of the
             transport it was a flex-1 next to a shrink-0 widget, and the widget spilled out of the island
             and off the left edge of the screen. Every gate passed that; the screenshot did not. */""}
        ${recording ? html`<span data-level class="absolute left-0 bottom-0 h-1 bg-error transition-[width] duration-100" style=${`width:${Math.round(level * 100)}%`}></span>` : null}
      </div>

      ${/* Two columns, and the rows take whatever height is left — auto-rows-fr plus min-h-0 pads is what
           makes the grid the absorbing void. A `[@media…]` Tailwind variant was here to lay the fields down
           at short heights; it was the only arbitrary media variant in the farm, i.e. an unproven mechanism
           carrying a fix, so it is gone until something needs it enough to prove it. */""}
      <div ref=${padRef} class="flex-1 min-h-0 grid grid-cols-2 auto-rows-fr gap-[var(--ms-gap)]" style="touch-action:none"
        onPointerDown=${down} onPointerUp=${up} onPointerCancel=${up} onPointerLeave=${up}>
        ${/* A field is the one object on this screen you actually strike, so it carries a NAME at title size
             and its interval as a mono micro-label — eight identical boxes with a 0.68rem grey caption read
             as unfinished placeholders, which is exactly what the first shot showed. The accent is a dot:
             a mark, never the text, never a fill behind it. */""}
        ${offs.map((o, i) => html`<button key=${i} data-field=${i} disabled=${!take}
          aria-label=${take?.pitched ? noteName(take.hz * semisToRate(o)) : `${T(t, "field")} ${i + 1}`}
          class=${`relative min-h-0 overflow-hidden rounded-[var(--ms-r)] sf-raised flex flex-col justify-end items-start gap-0.5 p-[var(--ms-pad)] transition-transform duration-150 ${lit.has(i) ? "outline-2 outline-secondary scale-[1.02]" : ""} ${take ? "" : "opacity-40"}`}>
          <span class=${`absolute top-[var(--ms-pad)] right-[var(--ms-pad)] w-1.5 h-1.5 rounded-full transition-opacity duration-150 ${lit.has(i) ? "opacity-100" : "opacity-35"}`} style="background:var(--app-accent)"></span>
          <span class="text-[var(--ms-label)] font-mono tabular-nums text-base-content/70 leading-none">${o > 0 ? `+${o}` : o}</span>
          <span class="text-[var(--ms-title)] font-semibold tabular-nums leading-none truncate max-w-full">${take?.pitched ? noteName(take.hz * semisToRate(o)) : `${T(t, "field")} ${i + 1}`}</span>
        </button>`)}
      </div>

      <div class="shrink-0 flex justify-center">
        ${/* The transport is an @container: it compacts by ITS OWN width, and its keys are shrink-0. So it
             needs a box with a real width and no siblings — a `shrink-0` transport beside a flex-1 meter
             spilled off the screen, and an island hugging its content starved it below the 230px step and
             demoted every action into "…". Same shape as the Shape tab, which never looked wrong. */""}
        <${Island} className="w-full max-w-md">
          <${Transport} locale=${loc} stopIcon playing=${playing} disabled=${!take} onToggle=${toggle} keep=${2}
            moreOpen=${screen === "more"} onMore=${() => openScreen("more")} onMoreClose=${closeScreen}
            subtitle=${recording ? T(t, "recording") : working ? T(t, "working") : null}
            actions=${[
              { id: "flow", icon: "lucide:sparkles", label: T(t, "genFlow"), onClick: () => { buzz(); flow(); }, tone: "accent", attr: { "data-flow": true } },
              { id: "rec", icon: recording || arming ? "lucide:square" : "lucide:mic", label: T(t, "rec"), onClick: rec, tone: "error", active: recording || arming, pulse: recording, attr: { "data-rec": true } },
              { id: "keep", icon: "lucide:save", label: T(t, "aSave"), onClick: save, attr: { "data-save": true } },
              { id: "share", icon: "lucide:share-2", label: T(t, "export"), onClick: exportWav, attr: { "data-export": true } },
              { id: "clear", icon: "lucide:eraser", label: T(t, "clear"), onClick: () => { buzz(); $loop.set(emptyLoop()); }, haptic: "bump", attr: { "data-clear": true } },
            ]} />
        <//>
      </div>
      ${err && err !== "denied" ? html`<div data-err class="shrink-0 text-center text-xs text-base-content/70">${T(t, "err" + err[0].toUpperCase() + err.slice(1))}</div>` : null}
    </div>
  </div>`;
}

// ================= Shape =================
export function grainShape({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t); _dict = t;
  const take = useStore($take), grainMs = useStore($grainMs), spray = useStore($spray), density = useStore($density);
  const pos = useStore($pos), drift = useStore($drift), tone = useStore($tone), tilted = useStore($tilted);
  const loop = useStore($loop), cur = useStore($cur), scaleId = useStore($scale), bpm = useStore($bpm);
  const loc = useStore(S.locale), playing = useStore($playing);
  const offs = scaleById(scaleId).offs;
  const rate = grainRate(grainMs / 1000, density);

  return html`<${Fragment}>
    <div class="flex flex-col gap-3 pb-40">
      <div class="rounded-2xl sf-inset px-2 py-2 h-24 flex items-center">
        <${Wave} take=${take} pos=${pos} bars=${72} onSeek=${(v) => $pos.set(v)} className="h-full" />
      </div>
      <div class="flex items-center justify-between text-xs text-base-content/70">
        <span>${T(t, "head")}</span>
        <span data-rate class="tabular-nums">${Math.round(rate)} ${T(t, "perSec")}</span>
      </div>

      <div class="grid grid-cols-2 gap-x-4 gap-y-3">
        <${Slider} id="gr-size" attr="data-size" label=${T(t, "size")} min=${20} max=${320} step=${5} value=${grainMs} onInput=${(v) => $grainMs.set(v)} />
        <${Slider} id="gr-spray" attr="data-spray" label=${T(t, "spray")} min=${0} max=${250} step=${5} value=${spray} onInput=${(v) => $spray.set(v)} />
        <${Slider} id="gr-density" attr="data-density" label=${T(t, "density")} min=${1} max=${8} step=${0.5} value=${density} onInput=${(v) => $density.set(v)} />
        <${Slider} id="gr-drift" attr="data-drift" label=${T(t, "drift")} min=${-1} max=${1} step=${0.05} value=${drift} onInput=${(v) => $drift.set(v)} />
        <${Slider} id="gr-tone" attr="data-tone" label=${T(t, "tone")} min=${0.05} max=${1.6} step=${0.05} value=${tone} onInput=${(v) => { $tone.set(v); applyTone(); }} />
        <${Slider} id="gr-bpm" attr="data-bpm" label=${T(t, "tempo")} min=${52} max=${132} step=${1} value=${bpm} onInput=${(v) => $bpm.set(v)} />
      </div>

      ${tilt.supported ? html`<button data-tilt aria-pressed=${tilted} onClick=${() => { buzz(); $tilted.set(!tilted); }}
        class=${`btn btn-sm gap-2 ${tilted ? "btn-secondary" : "btn-outline"}`}>${Icon("lucide:orbit", "text-base")}${T(t, "tiltMacro")}</button>` : null}

      ${/* the loop as a grid: rows are fields, columns are the 16 eighths */""}
      <div class="flex flex-col gap-[3px]">
        ${offs.map((o, i) => html`<div class="flex items-center gap-[3px]" key=${i}>
          <div class="w-8 shrink-0 text-center text-xs tabular-nums text-base-content/70">${take?.pitched ? noteName(take.hz * semisToRate(o)) : `${o > 0 ? "+" : ""}${o}`}</div>
          ${STEPS.map((s) => { const on = loop[s] === i; return html`<button key=${s} data-cell=${`${i}-${s}`} aria-pressed=${on}
            aria-label=${`${T(t, "field")} ${i + 1} · ${s + 1}`} onClick=${() => { const nx = loop.slice(); nx[s] = on ? -1 : i; $loop.set(nx); if (!on) strike(i, { vel: 0.8 }); }}
            class=${`flex-1 min-w-0 h-8 rounded-md ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${on ? "sf-e2 bg-primary" : "sf-inset"} ${s === cur ? "outline-2 outline-secondary" : ""}`}></button>`; })}
        </div>`)}
      </div>
    </div>

    <${Island} pinned className="w-full max-w-xl">
      <${Transport} locale=${loc} stopIcon playing=${playing} disabled=${!take} onToggle=${toggle} keep=${2}
        moreOpen=${screen === "smore"} onMore=${() => openScreen("smore")} onMoreClose=${closeScreen}
        actions=${[
          { id: "sflow", icon: "lucide:sparkles", label: T(t, "genFlow"), onClick: () => { buzz(); flow(); }, tone: "accent" },
          { id: "sclear", icon: "lucide:eraser", label: T(t, "clear"), onClick: () => { buzz(); $loop.set(emptyLoop()); }, haptic: "bump" },
          { id: "shelp", icon: "lucide:sliders-horizontal", label: T(t, "preset"), onClick: () => openScreen("preset") },
        ]} />
    <//>

    <${Sheet} id="presetsheet" open=${screen === "preset"} onClose=${closeScreen} title=${T(t, "preset")} icon="lucide:sliders-horizontal">
      <div class="grid grid-cols-1 gap-2">
        ${PRESETS.map((p) => html`<button key=${p.id} data-preset=${p.id} class="btn btn-outline justify-start gap-3 rounded-xl"
          onClick=${() => { buzz(); $grainMs.set(p.size); $spray.set(p.spray); $density.set(p.density); $drift.set(p.drift); closeScreen(); }}>
          ${Icon(p.icon, "text-lg")}<span class="flex flex-col items-start"><span class="font-semibold">${T(t, p.name)}</span><span class="text-xs text-base-content/70">${T(t, p.hint)}</span></span>
        </button>`)}
      </div>
    </${Sheet}>
  </${Fragment}>`;
}

// Presets are the shortcut past the "most of the slider does nothing" problem: four points in the space that
// each sound like a different instrument built from the same two seconds.
const PRESETS = [
  { id: "tone", name: "psTone", hint: "psToneHint", icon: "lucide:audio-waveform", size: 60, spray: 20, density: 4, drift: 0.2 },
  { id: "cloud", name: "psCloud", hint: "psCloudHint", icon: "lucide:cloudy", size: 240, spray: 180, density: 6, drift: 0.05 },
  { id: "stutter", name: "psStutter", hint: "psStutterHint", icon: "lucide:zap", size: 28, spray: 0, density: 2, drift: 0.9 },
  { id: "freeze", name: "psFreeze", hint: "psFreezeHint", icon: "lucide:snowflake", size: 120, spray: 8, density: 7, drift: 0 },
];

// ================= Takes =================
function gateTake() {
  const sr = 48000, pcm = syntheticSample(sr, 1.6);
  const loop = emptyLoop(); [0, 3, 5, 7, 10, 12].forEach((s, k) => { loop[s] = [0, 2, 4, 1, 5, 3][k]; });
  return { id: "gate-take", name: "A3", pcm, sr, dur: pcm.length / sr, hz: 220, pitched: true, scaleId: "pent", bpm: 84, loop };
}

export function grainTakes({ S, undo, toast }) {
  const t = useStore(S.t); _dict = t;
  const [list, setList] = useState(null);
  const take = useStore($take), busy = useStore($busy);
  // The gate has no microphone AND an empty database, so the takes list would be its empty state — and the
  // a11y / overflow / watch checks would sign off on a screen no user with takes ever sees. Seed one.
  const load = () => TAKES.all().then((l) => setList(gate ? [gateTake(), ...l] : l)).catch(() => setList(gate ? [gateTake()] : []));
  useEffect(() => { load(); }, []);

  const open = (it) => {
    buzz();
    $take.set({ pcm: it.pcm, sr: it.sr, dur: it.dur, hz: it.hz, pitched: it.pitched, name: it.name });
    bufFor = null; if (eng) syncBuffer();
    if (it.scaleId) $scale.set(it.scaleId);
    if (it.loop) $loop.set(it.loop.slice());
    if (it.bpm) $bpm.set(it.bpm);
    S.tab.set("play");
  };
  const del = async (it) => {
    const { id, _ts, ...rec } = it;
    try { await TAKES.remove(id); } catch { /* */ }
    load();
    undo?.(async () => { try { await TAKES.put(id, rec); } catch { /* */ } load(); }, it.name);
  };
  const share = async (it) => {
    if (busy) return; $busy.set(true);
    try { const bytes = await renderWav(it, it.loop || $loop.get(), it.bpm || 84); if (bytes) { const how = await shareWav(bytes, `grain-${it.name}`, t); if (how === "saved") toast?.(T(t, "toastExport")); } }
    catch { toast?.(T(t, "toastExportFail")); }
    $busy.set(false);
  };

  if (!useReveal(list !== null)) {
    return html`<div class="flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div data-skel class="card bg-base-100 rounded-2xl" key=${i}><div class="card-body p-3 flex-row items-center gap-3 text-muted"><div class="w-9 h-9 rounded-full sf-inset shrink-0"></div><div class="flex-1 min-w-0 flex flex-col gap-1.5"><div class="truncate font-semibold"><${Scramble} len=${10} /></div><div class="h-5"><${Scramble} len=${18} /></div></div></div></div>`)}</div>`;
  }
  if (!list.length) return html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:mic", "text-4xl")}<span>${T(t, "takesEmpty")}</span></div>`;

  return html`<div class="flex flex-col gap-2">
    ${list.map((it) => html`<div data-take class="card bg-base-100 rounded-2xl" key=${it.id}>
      <div class="card-body p-3 flex-row items-center gap-3">
        <button data-open aria-label=${T(t, "aPlay")} class=${`btn btn-circle btn-sm shrink-0 ${take?.name === it.name ? "btn-secondary" : "btn-primary"}`} onClick=${() => open(it)}>${Icon("lucide:play", "text-base")}</button>
        <button class="flex-1 min-w-0 text-left flex flex-col gap-1.5" onClick=${() => open(it)}>
          <span class="flex items-baseline justify-between gap-2"><span class="font-semibold truncate">${it.name}</span><span class="text-xs text-base-content/70 tabular-nums shrink-0">${(it.dur || 0).toFixed(1)} s</span></span>
          <span class="h-5 w-full"><${Wave} take=${it} dim bars=${40} className="h-5" /></span>
        </button>
        <button data-share aria-label=${T(t, "export")} class="btn btn-ghost btn-sm btn-circle text-muted" onClick=${() => share(it)}>${Icon("lucide:share-2", "text-lg")}</button>
        <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-muted" onClick=${() => del(it)}>${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>`)}
  </div>`;
}
