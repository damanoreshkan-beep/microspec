// Handpan — a playable steel-tongue pan over ONE shared engine + loop (module scope, so a strike ringing and
// a loop playing survive tab switches, exactly like rave). Three tabs: Play (the circular pan you strike +
// Flow, the auto-generator + a live striker-recorder), Weave (the loop as an editable note grid + a settings
// sheet: tempo, space, shimmer, drone, voice, scale), Saved (IndexedDB loops). Everything is SYNTHESISED.
//
// Why it sounds sweet: a real handpan tunes every tone field to three partials in a 1:2:3 ratio — the
// fundamental, its OCTAVE (2×) and the TWELFTH / compound fifth (3×). Those three ringing in phase are the
// warm, bell-like, long-sustain voice of the instrument (Rohner/Schärer Hang acoustics; Saraz). So each
// voice here is built on that 1:2:3 core (+ a faint attack "chiff" and optional shimmer), struck into a
// shared convolution-reverb wash — the wash is what turns single notes into that meditative bloom. The Flow
// generator is the unit-tested /_rt/melody.js scored search (consonance · voice-leading · resolution).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { generateMelody } from "/_rt/melody.js";
import { collection } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { isGate } from "/_rt/gate.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const N = 16, STEPS = [...Array(N).keys()];
const PC = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const letter = (m) => PC[((m % 12) + 12) % 12];
const label = (m) => letter(m) + (Math.floor(m / 12) - 1);
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- scales: ding (index 0, the deep centre note) + tone fields ascending, as absolute MIDI. The famous
// handpan tunings; switching retunes every field. mood is a one-word feel used in the picker. ----
const SCALES = [
  { id: "kurd", name: "scKurd", mood: "scaleMelancholic", midi: [50, 57, 58, 60, 62, 64, 65, 67, 69] },
  { id: "celtic", name: "scCeltic", mood: "scaleWarm", midi: [50, 57, 60, 62, 64, 65, 67, 69] },
  { id: "hijaz", name: "scHijaz", mood: "scaleMystic", midi: [50, 57, 58, 61, 62, 64, 65, 69] },
  { id: "amara", name: "scAmara", mood: "scaleDeep", midi: [50, 57, 58, 62, 64, 65, 69, 72] },
  { id: "pygmy", name: "scPygmy", mood: "scaleNature", midi: [54, 57, 59, 61, 64, 66, 69, 71] },
  { id: "sirena", name: "scSirena", mood: "scaleOceanic", midi: [52, 59, 61, 62, 64, 66, 68, 71] },
  { id: "equinox", name: "scEquinox", mood: "scaleDeep", midi: [47, 54, 57, 59, 61, 62, 64, 66] },
  { id: "integral", name: "scIntegral", mood: "scaleMystic", midi: [49, 56, 59, 61, 63, 64, 68, 71] },
  { id: "golden", name: "scGolden", mood: "scaleDeep", midi: [53, 60, 61, 63, 65, 67, 68, 72] },
  { id: "major", name: "scMajor", mood: "scaleBright", midi: [48, 55, 57, 60, 64, 67, 69, 72] },
];
const scaleById = (id) => SCALES.find((s) => s.id === id) || SCALES[0];

// ---- voices ("add-on sound modes"): all built on the 1:2:3 core, varied in extra partials, decay, brightness
// and a noise "chiff" on the attack. partials are [ratio, gain, decayScale?]. ----
const TIMBRES = [
  { id: "classic", name: "tbClassic", dur: 3.6, attack: 0.004, peak: 0.5, chiff: 0.06, partials: [[1, 1], [2, 0.5], [3, 0.33], [4, 0.12, 0.6], [6, 0.05, 0.4]] },
  { id: "crystal", name: "tbCrystal", dur: 3.0, attack: 0.002, peak: 0.42, chiff: 0.1, partials: [[1, 0.8], [2, 0.6], [3, 0.42], [5, 0.18, 0.5], [7, 0.08, 0.35]] },
  { id: "deep", name: "tbDeep", dur: 4.6, attack: 0.005, peak: 0.55, chiff: 0.03, partials: [[0.5, 0.45], [1, 1], [2, 0.42], [3, 0.2, 0.7]] },
  { id: "bell", name: "tbBell", dur: 2.8, attack: 0.001, peak: 0.4, chiff: 0.05, partials: [[1, 1], [2, 0.5], [2.76, 0.3, 0.7], [5.4, 0.12, 0.4]] },
  { id: "muted", name: "tbMuted", dur: 0.85, attack: 0.002, peak: 0.52, chiff: 0.04, partials: [[1, 1], [2, 0.4], [3, 0.18, 0.7]] },
];
const timbreById = (id) => TIMBRES.find((tb) => tb.id === id) || TIMBRES[0];

function makeIR(ctx, seconds = 3.2, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return buf;
}

// ---- shared state ----
const $scale = atom("kurd"), $timbre = atom("classic"), $space = atom(0.5), $shimmer = atom(true), $drone = atom(false);
const $loop = atom(Array.from({ length: N }, () => [])), $bpm = atom(80);
const $playing = atom(false), $recording = atom(false), $cur = atom(-1), $sweep = atom(-1), $lit = atom(new Set()), $hist = atom({ seeds: [], idx: -1 });
const SAVES = collection("handpanLoops");
const curScale = () => scaleById($scale.get());
const offsets = (s) => s.midi.map((m) => m - s.midi[0]);   // semitone offsets from the ding (the tonic)
const emptyLoop = () => Array.from({ length: N }, () => []);

// ---- engine (module scope): dry + a reverb send fan out of one bus, so the wash is built ONCE ----
let eng = null, busIn = null, revSend = null, drone = null, sched = null, raf = null, nextT = 0, stepN = 0, q = [];
let wl = null, np = null;
const npTitle = () => `${T(dictNow(), curScale().name)} · ${T(dictNow(), timbreById($timbre.get()).name)}`;
let _dict = {}; const dictNow = () => _dict;                     // media-session labels need the live dict
const artUrl = () => { try { return new URL("icons/icon-512.png", location.href).href; } catch { return null; } };
const spaceGain = (v) => 0.05 + 0.95 * clamp(v, 0, 1);

function applySpace() { if (revSend && eng) { try { revSend.gain.setTargetAtTime(spaceGain($space.get()), eng.ctx.currentTime, 0.05); } catch { /* */ } } }
function ensure() {
  if (!audioSupported) return null;
  if (!eng) {
    const e = createEngine({ master: 0.9, noise: true }); if (!e) return null; const ctx = e.ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.25; comp.connect(e.master);
    const sum = ctx.createGain(); sum.connect(comp);
    busIn = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.92; busIn.connect(dry); dry.connect(sum);
    const rev = ctx.createConvolver(); rev.buffer = makeIR(ctx); revSend = ctx.createGain(); revSend.gain.value = spaceGain($space.get());
    busIn.connect(revSend); revSend.connect(rev); rev.connect(sum);
    eng = e; applyDrone();
  }
  eng.resume(); return eng;
}

// a struck tone: the 1:2:3 partials (+ voice extras), an optional octave/twelfth shimmer, a noise chiff.
function strikeNote(freq, vel = 1) {
  const e = eng; if (!e) return; const c = e.ctx, t = c.currentTime, tb = timbreById($timbre.get());
  const g = c.createGain(); g.gain.value = 1; g.connect(busIn);
  const parts = tb.partials.slice();
  if ($shimmer.get()) { parts.push([2, 0.1, 0.45], [3, 0.06, 0.3]); }   // extra octave+twelfth sparkle
  for (const [r, pg, ds = 1] of parts) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq * r;
    const og = c.createGain(); const dur = tb.dur * ds;
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(tb.peak * pg * vel, t + tb.attack); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => { try { o.disconnect(); og.disconnect(); } catch { /* */ } };
  }
  if (tb.chiff && e.buffers.white) {                                    // the metallic ping of the mallet on steel
    const s = c.createBufferSource(); s.buffer = e.buffers.white; const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = clamp(freq * 6, 800, 9000); f.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.setValueAtTime(tb.chiff * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    s.connect(f); f.connect(ng); ng.connect(g); s.start(t); s.stop(t + 0.1); s.onended = () => { try { s.disconnect(); f.disconnect(); ng.disconnect(); } catch { /* */ } };
  }
}

// drone: a soft sustained tonic + fifth pad under everything, into the reverb wash
function applyDrone() {
  if (!eng) return; const c = eng.ctx;
  if (drone) { try { drone.stop(); drone.g.gain.setTargetAtTime(0, c.currentTime, 0.2); } catch { /* */ } drone = null; }
  if (!$drone.get()) return;
  const base = curScale().midi[0] - 12, g = c.createGain(); g.gain.value = 0; g.connect(busIn);
  g.gain.setTargetAtTime(0.09, c.currentTime, 0.6);
  const oscs = [midiToFreq(base), midiToFreq(base + 7), midiToFreq(base + 12)].map((fr, i) => { const o = c.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = fr; const og = c.createGain(); og.gain.value = i === 2 ? 0.3 : 1; o.connect(og); og.connect(g); o.start(); return o; });
  drone = { g, stop: () => oscs.forEach((o) => { try { o.stop(); o.disconnect(); } catch { /* */ } }) };
}

// ---- flash (long ring on a struck field) ----
const flash = (i) => { const s = new Set($lit.get()); s.add(i); $lit.set(s); setTimeout(() => { const n = new Set($lit.get()); n.delete(i); $lit.set(n); }, 520); };
// strike a scale index (0 = ding). Records into the loop when armed.
function strike(idx, vel = 1) {
  const s = curScale(); if (idx < 0 || idx >= s.midi.length) return; ensure(); strikeNote(midiToFreq(s.midi[idx]), vel); flash(idx);
  if ($recording.get() && $playing.get()) { const step = $cur.get() < 0 ? 0 : $cur.get(); const cur = $loop.get(), cell = cur[step] || []; if (!cell.includes(idx)) { const next = cur.slice(); next[step] = [...cell, idx]; $loop.set(next); } }
}

// ---- loop scheduler ----
const spb = () => 60 / $bpm.get() / 2;                              // an 8th-note grid — a flowing, not frantic, pace
function fireStep(step, time) {
  const s = curScale(), cell = $loop.get()[step] || [];
  for (const idx of cell) strikeAtTime(midiToFreq(s.midi[idx]), time);
  if (q.length < 128) q.push({ time, step });
}
// schedule a strike at an absolute time (loop playback) — same voice as strikeNote but time-addressed
function strikeAtTime(freq, t) {
  const e = eng; if (!e) return; const c = e.ctx, tb = timbreById($timbre.get());
  const g = c.createGain(); g.gain.value = 1; g.connect(busIn);
  const parts = tb.partials.slice(); if ($shimmer.get()) parts.push([2, 0.1, 0.45], [3, 0.06, 0.3]);
  for (const [r, pg, ds = 1] of parts) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq * r; const og = c.createGain(); const dur = tb.dur * ds;
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(tb.peak * pg, t + tb.attack); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05); o.onended = () => { try { o.disconnect(); og.disconnect(); } catch { /* */ } };
  }
  if (tb.chiff && e.buffers.white) { const s = c.createBufferSource(); s.buffer = e.buffers.white; const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = clamp(freq * 6, 800, 9000); f.Q.value = 0.7; const ng = c.createGain(); ng.gain.setValueAtTime(tb.chiff, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); s.connect(f); f.connect(ng); ng.connect(g); s.start(t); s.stop(t + 0.1); s.onended = () => { try { s.disconnect(); f.disconnect(); ng.disconnect(); } catch { /* */ } }; }
}
const tick = () => { const e = eng; if (!e) return; const dt = spb(); if (nextT < e.ctx.currentTime) nextT = e.ctx.currentTime; while (nextT < e.ctx.currentTime + 0.12) { fireStep(stepN, nextT); nextT += dt; stepN = (stepN + 1) % N; } };
const draw = () => { const e = eng; if (e) { const now = e.ctx.currentTime; while (q.length && q[0].time <= now) { const it = q.shift(); $cur.set(it.step); const cell = $loop.get()[it.step] || []; cell.forEach(flash); } } raf = requestAnimationFrame(draw); };

function start() {
  const e = ensure(); $playing.set(true); if (!e) return;
  wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(), artist: "microspec", artwork: artUrl(), onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => e.resume() });
  np.setPlaying(npTitle());
  if (sched) clearInterval(sched); if (raf) cancelAnimationFrame(raf); q = []; nextT = e.ctx.currentTime + 0.08; stepN = 0; sched = setInterval(tick, 25); raf = requestAnimationFrame(draw);
}
function stop() {
  $playing.set(false); $recording.set(false);
  if (wl) { wl.release(); wl = null; } if (np) { np.release(); np = null; }
  if (sched) { clearInterval(sched); sched = null; } if (raf) { cancelAnimationFrame(raf); raf = null; } $cur.set(-1);
}
const toggle = () => { buzz(12); $playing.get() ? stop() : start(); };
const toggleRec = () => { buzz(12); const on = !$recording.get(); $recording.set(on); if (on && !$playing.get()) start(); };

// ---- Flow: auto-generate a sweet meditative line, write it left→right, then play it ----
let genT = null;
function generate(seed = randSeed(), animate = true) {
  ensure(); if (genT) { clearInterval(genT); genT = null; }
  const s = curScale(), g = generateMelody(offsets(s), { seed, len: N, restP: 0.24, tries: 260 });
  const full = emptyLoop(); g.notes.forEach((n, i) => { if (!n.rest && n.i < s.midi.length) full[i] = [n.i]; });
  if (!animate) { $loop.set(full); $sweep.set(-1); if (!$playing.get()) start(); return; }
  $loop.set(emptyLoop()); $sweep.set(0); let c = 0;
  genT = setInterval(() => { const upto = c; $loop.set(full.map((cell, i) => (i <= upto ? cell : []))); $sweep.set(c); if (++c >= N) { clearInterval(genT); genT = null; $sweep.set(-1); if (!$playing.get()) start(); } }, 30);
}
const newFlow = () => { buzz(); const seed = randSeed(); const { seeds } = $hist.get(); const next = [...seeds, seed]; $hist.set({ seeds: next, idx: next.length - 1 }); generate(seed); };
const stepFlow = (d) => { buzz(); let { seeds, idx } = $hist.get(); idx += d; if (idx < 0) { seeds = [randSeed(), ...seeds]; idx = 0; } else if (idx >= seeds.length) { seeds = [...seeds, randSeed()]; idx = seeds.length - 1; } $hist.set({ seeds, idx }); generate(seeds[idx]); };

// ---- saves ----
const loopSig = (r) => JSON.stringify([r.loop, r.scaleId, r.bpm]);
const loopCount = (loop) => (loop || []).reduce((n, cell) => n + (cell ? cell.length : 0), 0);
const autoName = (t, scaleId, loop, list) => { const base = `${T(t, scaleById(scaleId).name)} · ${loopCount(loop)}`; let n = base, i = 2; while (list.some((it) => it.name === n)) n = `${base} (${i++})`; return n; };

// ================= Play: the circular pan =================
export function handpan({ S }) {
  const t = useStore(S.t); _dict = t;
  const scaleId = useStore($scale), playing = useStore($playing), recording = useStore($recording), lit = useStore($lit), sweep = useStore($sweep), space = useStore($space);
  const s = scaleById(scaleId), n = s.midi.length - 1;              // fields around the ding
  const ptr = useRef(new Map()), usingPtr = useRef(false);
  const pick = (id) => { buzz(); ensure(); $scale.set(id); applyDrone(); $hist.set({ seeds: [], idx: -1 }); };

  const fieldAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest && el.closest("[data-field]"); return b ? Number(b.getAttribute("data-field")) : null; };
  const onDown = (e) => { const i = fieldAt(e.clientX, e.clientY); if (i == null) return; usingPtr.current = true; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } ptr.current.set(e.pointerId, i); strike(i); };
  const onMove = (e) => { if (!ptr.current.has(e.pointerId)) return; const i = fieldAt(e.clientX, e.clientY); if (i == null) return; if (ptr.current.get(e.pointerId) !== i) { ptr.current.set(e.pointerId, i); strike(i, 0.85); } };
  const onLift = (e) => { ptr.current.delete(e.pointerId); };
  const onClickBoard = (e) => { if (usingPtr.current) return; const b = e.target.closest && e.target.closest("[data-field]"); if (b) strike(Number(b.getAttribute("data-field"))); };

  // field geometry: ding in the centre, fields evenly around a ring starting from the top, ascending clockwise
  const fields = s.midi.slice(1).map((m, k) => { const ang = -Math.PI / 2 + (k / n) * Math.PI * 2; const R = 37; return { idx: k + 1, m, x: 50 + R * Math.cos(ang), y: 50 + R * Math.sin(ang), size: clamp(24 - (m - s.midi[0]) * 0.32, 15, 23) }; });

  return html`<div class="fixed left-0 right-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="shrink-0 flex items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      ${SCALES.map((sc) => { const on = sc.id === scaleId; return html`<button data-scale=${sc.id} aria-pressed=${on} onClick=${() => pick(sc.id)} key=${sc.id} class=${`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-secondary/60 bg-secondary/12 text-secondary" : "border-base-content/12 text-base-content/70"}`}>${T(t, sc.name)}</button>`; })}
    </div>

    <div class="flex-1 min-h-0 relative grid place-items-center px-3">
      <div class="relative w-[min(90vw,62vh)] aspect-square rounded-full bg-gradient-to-br from-base-300/70 to-base-100 border border-base-content/10 shadow-[inset_0_2px_18px_rgba(0,0,0,.45)] select-none" style="touch-action:none"
        onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onLift} onPointerCancel=${onLift} onClick=${onClickBoard}>
        <!-- ding (centre) -->
        <button data-field="0" aria-label=${label(s.midi[0])} class=${`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full transition-all duration-150 ${lit.has(0) ? "ring-2 ring-secondary brightness-125 scale-95" : "ring-1 ring-base-content/15"} bg-gradient-to-br from-base-content/25 to-base-content/5`} style="width:26%;height:26%">
          <span class="pointer-events-none text-sm font-semibold text-base-content/80">${letter(s.midi[0])}</span>
        </button>
        ${fields.map((f) => html`<button data-field=${f.idx} data-note=${letter(f.m)} aria-label=${label(f.m)} key=${f.idx}
          class=${`absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full transition-all duration-150 ${lit.has(f.idx) ? "ring-2 ring-secondary brightness-125 scale-90" : "ring-1 ring-base-content/12"} bg-gradient-to-br from-base-content/18 to-base-content/[0.04]`}
          style=${`left:${f.x}%;top:${f.y}%;width:${f.size}%;height:${f.size}%`}>
          <span class="pointer-events-none text-xs font-medium text-base-content/75">${letter(f.m)}</span>
        </button>`)}
      </div>
    </div>

    <div class="shrink-0 px-3 pb-2 pt-1 flex justify-center">
      <div class="w-full max-w-md flex items-center gap-2 rounded-[1.35rem] border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-3 py-2">
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${toggle} class=${`btn btn-circle shrink-0 ${playing ? "btn-secondary" : "btn-primary"}`}>${Icon(playing ? "lucide:square" : "lucide:play", "text-xl")}</button>
        <button data-flow id="flow" aria-label=${T(t, "genFlow")} onClick=${newFlow} class=${`btn btn-circle btn-sm shrink-0 ${sweep >= 0 ? "btn-accent animate-pulse" : "btn-outline btn-accent"}`}>${Icon("lucide:sparkles", "text-lg")}</button>
        <button data-rec aria-pressed=${recording} aria-label=${T(t, "rec")} onClick=${toggleRec} class=${`btn btn-circle btn-sm shrink-0 ${recording ? "btn-error text-error-content animate-pulse" : "btn-ghost"}`}>${Icon("lucide:circle-dot", "text-lg")}</button>
        <label class="flex items-center gap-1.5 flex-1 min-w-0">
          ${Icon("lucide:cloudy", "text-base text-base-content/60 shrink-0")}
          <input data-space type="range" min="0" max="1" step="0.02" value=${space} aria-label=${T(t, "space")} onInput=${(e) => { $space.set(Number(e.target.value)); applySpace(); }} class="range range-xs range-secondary flex-1 min-w-0" />
        </label>
      </div>
    </div>
    ${!audioSupported ? html`<div class="shrink-0 text-center text-xs text-base-content/70 pb-1">${T(t, "noAudio")}</div>` : null}
  </div>`;
}

// ================= Weave: the loop as a note grid + settings sheet =================
export function handpanWeave({ S, toast, screen, openScreen, closeScreen }) {
  const t = useStore(S.t); _dict = t;
  const scaleId = useStore($scale), loop = useStore($loop), playing = useStore($playing), cur = useStore($cur), sweep = useStore($sweep);
  const s = scaleById(scaleId), rows = s.midi.map((m, i) => ({ i, m })).reverse();   // highest pitch on top
  const cellToggle = (i, step) => { ensure(); const cell = loop[step] || []; const has = cell.includes(i); const next = loop.slice(); next[step] = has ? cell.filter((x) => x !== i) : [...cell, i]; $loop.set(next); if (!has) strike(i); };
  const save = async () => { try { const list = await SAVES.all(); const rec = { loop, scaleId, bpm: $bpm.get() }; if (loopCount(loop) === 0) { buzz(); return; } if (list.find((it) => loopSig(it) === loopSig(rec))) { buzz(); toast?.(T(t, "toastDup", { name: autoName(t, scaleId, loop, list) })); return; } await SAVES.put("l" + Date.now(), { name: autoName(t, scaleId, loop, list), ...rec, timbreId: $timbre.get(), space: $space.get() }); toast?.(T(t, "toastSaved")); } catch { /* */ } };

  return html`<${Fragment}>
    <div class="pb-40 flex flex-col gap-[3px]">
      <div class="sticky z-10 -mx-4 px-4 bg-base-200/85 backdrop-blur flex items-center gap-[3px] py-1" style="top:calc(3.5rem + env(safe-area-inset-top))">
        <div class="w-7 shrink-0"></div>
        ${STEPS.map((step) => html`<div class=${`flex-1 h-1 rounded-full transition-colors ${step % 4 === 0 && step > 0 ? "ml-1" : ""} ${step === sweep ? "bg-accent" : step === cur ? "bg-secondary" : "bg-base-300"}`} key=${step}></div>`)}
      </div>
      ${rows.map(({ i, m }) => { const live = loop.some((cell) => cell && cell.includes(i)); return html`<div class="flex items-center gap-[3px]" key=${i}>
        <div class=${`w-7 shrink-0 text-center text-sm font-medium tabular-nums ${i === 0 ? "text-secondary" : live ? "text-base-content" : "text-base-content/70"}`} title=${label(m)}>${letter(m)}</div>
        ${STEPS.map((step) => { const on = (loop[step] || []).includes(i); const beat = step % 4 === 0; return html`<button data-cell=${`${i}-${step}`} aria-pressed=${on} aria-label=${`${label(m)} ${step + 1}`} onClick=${() => cellToggle(i, step)} key=${step}
          class=${`flex-1 min-w-0 h-9 rounded-md touch-manipulation transition-all duration-150 ${beat && step > 0 ? "ml-1" : ""} ${on ? (i === 0 ? "bg-secondary" : "bg-primary") : beat ? "bg-base-300/80" : "bg-base-300/55"} ${step === sweep ? "ring-2 ring-accent scale-105" : step === cur ? "ring-2 ring-base-content/50" : ""}`}></button>`; })}
      </div>`; })}
    </div>

    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)">
      <div class="pointer-events-auto w-full max-w-xl flex items-center gap-2 rounded-[1.35rem] border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-3 py-2">
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} class=${`btn btn-circle shadow-lg shrink-0 ${playing ? "btn-secondary" : "btn-primary"}`} onClick=${toggle}>${Icon(playing ? "lucide:square" : "lucide:play", "text-xl")}</button>
        <button data-flow aria-label=${T(t, "genFlow")} class="btn btn-circle btn-sm btn-ghost shrink-0" onClick=${newFlow}>${Icon("lucide:sparkles", `text-lg ${sweep >= 0 ? "animate-pulse text-accent" : ""}`)}</button>
        <span class="flex-1 min-w-0 font-mono text-xs tabular-nums text-base-content/70 truncate text-center">${T(t, scaleById(scaleId).name)}</span>
        <button data-clear aria-label=${T(t, "clear")} data-haptic="bump" class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); $loop.set(emptyLoop()); }}>${Icon("lucide:eraser", "text-lg")}</button>
        <button id="save" data-save aria-label=${T(t, "aSave")} class="btn btn-circle btn-outline btn-sm shrink-0" onClick=${save}>${Icon("lucide:save", "text-lg")}</button>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "set"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => openScreen("set")}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
      </div>
    </div>

    <${SettingsSheet} open=${screen === "set"} onClose=${closeScreen} t=${t} />
  </${Fragment}>`;
}

// The settings island → a history-backed bottom sheet (S.screen="set"): tempo, space, shimmer, drone, the
// voice ("add-on sound modes") and the scale — the whole sound-design surface, out of the way while you weave.
function SettingsSheet({ open, onClose, t }) {
  const bpm = useStore($bpm), space = useStore($space), shimmer = useStore($shimmer), drone = useStore($drone), timbre = useStore($timbre), scaleId = useStore($scale);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  return html`<dialog id="setsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-3 max-w-xl mx-auto">${grip}
    <div class="grid grid-cols-2 gap-x-4 gap-y-2">
      <div class="flex flex-col gap-0.5">
        <div class="flex items-center justify-between text-[0.6rem] uppercase tracking-wide text-base-content/70"><span>${T(t, "tempo")}</span><span class="font-semibold tabular-nums">${bpm}</span></div>
        <input type="range" min="52" max="132" value=${bpm} class="range range-xs range-primary w-full" aria-label=${T(t, "tempo")} onInput=${(e) => $bpm.set(Number(e.target.value))} />
      </div>
      <div class="flex flex-col gap-0.5">
        <div class="flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-base-content/70">${Icon("lucide:cloudy", "text-[0.85em]")}<span>${T(t, "space")}</span></div>
        <input data-set="space" type="range" min="0" max="1" step="0.02" value=${space} class="range range-xs range-secondary w-full" aria-label=${T(t, "space")} onInput=${(e) => { $space.set(Number(e.target.value)); applySpace(); }} />
      </div>
    </div>
    <div class="flex gap-2">
      <button data-set="shimmer" aria-pressed=${shimmer} onClick=${() => { buzz(); $shimmer.set(!shimmer); }} class=${`btn btn-sm flex-1 gap-1.5 ${shimmer ? "btn-secondary" : "btn-outline"}`}>${Icon("lucide:stars", "text-base")}${T(t, "shimmer")}</button>
      <button data-set="drone" aria-pressed=${drone} onClick=${() => { buzz(); ensure(); $drone.set(!drone); applyDrone(); }} class=${`btn btn-sm flex-1 gap-1.5 ${drone ? "btn-secondary" : "btn-outline"}`}>${Icon("lucide:waves", "text-base")}${T(t, "drone")}</button>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-[0.6rem] uppercase tracking-wide text-base-content/70 flex items-center gap-1">${Icon("lucide:music", "text-[0.85em]")}${T(t, "timbre")}</div>
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        ${TIMBRES.map((tb) => { const on = timbre === tb.id; return html`<button data-tb=${tb.id} aria-pressed=${on} onClick=${() => { buzz(); ensure(); $timbre.set(tb.id); }} key=${tb.id} class=${`btn btn-sm shrink-0 ${on ? "btn-primary" : "btn-outline"}`}>${T(t, tb.name)}</button>`; })}
      </div>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-[0.6rem] uppercase tracking-wide text-base-content/70 flex items-center gap-1">${Icon("lucide:disc-3", "text-[0.85em]")}${T(t, "scale")}</div>
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        ${SCALES.map((sc) => { const on = sc.id === scaleId; return html`<button data-setscale=${sc.id} aria-pressed=${on} title=${T(t, sc.mood)} onClick=${() => { buzz(); ensure(); $scale.set(sc.id); applyDrone(); }} key=${sc.id} class=${`btn btn-sm shrink-0 ${on ? "btn-secondary" : "btn-outline"}`}>${T(t, sc.name)}</button>`; })}
      </div>
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

// ================= Saved =================
const Spectrum = ({ loop, live, cur }) => { const bars = (loop || emptyLoop()).map((c) => (c ? c.length : 0)), mx = Math.max(1, ...bars); return html`<span data-spectrum class="flex items-end gap-px h-5 w-full" aria-hidden="true">${bars.map((v, s) => html`<span class=${`flex-1 rounded-sm transition-colors ${live && s === cur ? "bg-secondary" : v ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${Math.round((v ? 0.25 + 0.75 * (v / mx) : 0.12) * 100)}%`} key=${s}></span>`)}</span>`; };

export function handpanSaved({ S, undo }) {
  const t = useStore(S.t); _dict = t;
  const [list, setList] = useState(null);
  const loop = useStore($loop), scaleId = useStore($scale), bpm = useStore($bpm), playing = useStore($playing), cur = useStore($cur);
  const load = () => SAVES.all().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const curSig = loopSig({ loop, scaleId, bpm });
  const isCur = (it) => playing && loopSig(it) === curSig;
  const loadLoop = (it) => { $scale.set(it.scaleId || "kurd"); $loop.set((it.loop || emptyLoop()).map((c) => (c ? c.slice() : []))); $bpm.set(it.bpm || 80); if (it.timbreId) $timbre.set(it.timbreId); if (typeof it.space === "number") { $space.set(it.space); applySpace(); } applyDrone(); };
  const open = (it) => { buzz(); loadLoop(it); S.tab.set("weave"); };
  const play = (it) => { buzz(); if (isCur(it)) { stop(); return; } loadLoop(it); start(); };
  const del = async (it) => { const { id, _ts, ...rec } = it; try { await SAVES.remove(id); } catch { /* */ } load(); undo?.(async () => { try { await SAVES.put(id, rec); } catch { /* */ } load(); }, it.name || T(t, "loopWord")); };

  if (!useReveal(list !== null)) return html`<div class="flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div data-skel class="card bg-base-100 border border-base-300 rounded-2xl overflow-hidden" key=${i}><div class="card-body p-3 flex-row items-center gap-3 text-base-content/60"><div class="w-9 h-9 rounded-full bg-base-300 shrink-0"></div><div class="flex-1 min-w-0 flex flex-col gap-1.5"><div class="truncate font-semibold"><${Scramble} len=${12} /></div><div class="h-5"><${Scramble} len=${16} /></div></div></div></div>`)}</div>`;
  if (!list.length) return html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:bookmark", "text-4xl")}<span>${T(t, "savedEmpty")}</span></div>`;

  return html`<div class="flex flex-col gap-2">
    ${list.map((it) => { const on = isCur(it); return html`<div data-saved class="card bg-base-100 border border-base-300 rounded-2xl transition" key=${it.id}>
      <div class="card-body p-3 flex-row items-center gap-3">
        <button data-play aria-label=${on ? T(t, "aStop") : T(t, "aPlay")} class=${`btn btn-circle btn-sm shrink-0 ${on ? "btn-secondary" : "btn-primary"}`} onClick=${() => play(it)}>${Icon(on ? "lucide:square" : "lucide:play", "text-base")}</button>
        <button data-load class="flex-1 min-w-0 text-left flex flex-col gap-1.5" onClick=${() => open(it)}>
          <span class="flex items-baseline justify-between gap-2"><span class="font-semibold truncate">${it.name || T(t, "loopWord")}</span><span class="text-xs text-base-content/70 tabular-nums shrink-0">${it.bpm || 80} BPM</span></span>
          <${Spectrum} loop=${it.loop} live=${on} cur=${cur} />
        </button>
        <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-base-content/60" onClick=${() => del(it)}>${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>`; })}
  </div>`;
}
