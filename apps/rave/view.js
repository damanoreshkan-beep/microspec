// Rave — a techno groove box over ONE shared pattern + engine (module scope, so playback and the pattern
// survive tab switches). Three tabs: Beat (the simple player + a generator), Pads (the full editable matrix +
// a settings sheet), Saved (IndexedDB beats). Everything is SYNTHESISED. The power without the stutter: voices
// are LIGHT (1–3 nodes/hit, no per-hit waveshaper, no per-hit reverb), while the FULL FX rack — drive, crush,
// feedback delay, a single shared convolution reverb, a master filter and swing — lives on the master bus,
// built ONCE. That shared bus is what the old build got wrong by rebuilding heavy nodes per hit. The generator
// is the research-backed one (/_rt/groove.js: Euclidean rhythms, LHL syncopation, Witek's inverted-U,
// harmonicity) picking a genre archetype and searching for the most danceable bar. Refs: MDN · Chris Wilson.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { generateGroove, mulberry32 } from "/_rt/groove.js";
import { collection } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { isGate } from "/_rt/gate.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const N = 16, STEPS = [...Array(N).keys()], ROOT = 36;
const RIFF = [0, 0, 12, 0, 0, 7, 0, 3, 0, 0, 12, 0, 5, 0, 7, 0];
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;

const TRACKS = [
  { id: "kick", name: "tKick", icon: "lucide:drum", on: "bg-amber-500" },
  { id: "hardkick", name: "tHardkick", icon: "lucide:swords", on: "bg-rose-600" },
  { id: "snare", name: "tSnare", icon: "lucide:disc-2", on: "bg-red-500" },
  { id: "clap", name: "tClap", icon: "lucide:hand", on: "bg-pink-500" },
  { id: "rim", name: "tRim", icon: "lucide:slash", on: "bg-orange-400" },
  { id: "clave", name: "tClave", icon: "lucide:git-commit-horizontal", on: "bg-amber-300" },
  { id: "hat", name: "tHat", icon: "lucide:hash", on: "bg-cyan-400" },
  { id: "ohat", name: "tOpenHat", icon: "lucide:circle-dot", on: "bg-sky-400" },
  { id: "ride", name: "tRide", icon: "lucide:disc-3", on: "bg-teal-400" },
  { id: "crash", name: "tCrash", icon: "lucide:asterisk", on: "bg-yellow-300" },
  { id: "shaker", name: "tShaker", icon: "lucide:egg", on: "bg-lime-300" },
  { id: "cowbell", name: "tCowbell", icon: "lucide:bell", on: "bg-yellow-400" },
  { id: "tom", name: "tTom", icon: "lucide:circle", on: "bg-fuchsia-500" },
  { id: "conga", name: "tConga", icon: "lucide:hexagon", on: "bg-orange-500" },
  { id: "hoover", name: "tHoover", icon: "lucide:tornado", on: "bg-indigo-500" },
  { id: "stab", name: "tStab", icon: "lucide:layers", on: "bg-violet-500" },
  { id: "zap", name: "tZap", icon: "lucide:triangle", on: "bg-red-400" },
  { id: "pluck", name: "tPluck", icon: "lucide:guitar", on: "bg-green-400" },
  { id: "acid", name: "tBass", icon: "lucide:zap", on: "bg-lime-400" },
  { id: "reese", name: "tReese", icon: "lucide:audio-waveform", on: "bg-purple-600" },
  { id: "sub", name: "tSub", icon: "lucide:waves", on: "bg-emerald-500" },
  { id: "rumble", name: "tRumble", icon: "lucide:vibrate", on: "bg-stone-500" },
];
const P = (s) => [...s].map((c) => c === "x");
const PRESETS = [
  { id: "techno", name: "pTechno", kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", acid: "x...x...x...x...", sub: "x...x...x...x..." },
  { id: "acid", name: "pAcid", kick: "x...x...x...x...", clap: "....x.......x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", acid: "x.xxx.x.x.xxx.x.", sub: "x...x...x...x..." },
  { id: "house", name: "pHouse", kick: "x...x...x...x...", clap: "....x.......x...", ohat: "..x...x...x...x.", rim: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "minimal", name: "pMinimal", kick: "x...x...x...x...", clap: "........x.......", hat: "..x...x...x...x.", sub: "x.......x......." },
  { id: "rave", name: "pRave", kick: "x...x...x.x.x...", clap: "....x...x...x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", stab: "x.......x.......", acid: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "hardgroove", name: "pHardgroove", kick: "x...x...x...x...", snare: "....x.......x...", tom: "......x.......x.", cowbell: "..x...x...x...x.", hat: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "dub", name: "pDub", kick: "x.......x.......", stab: "....x.......x...", sub: "x...x...x...x...", hat: "..x...x...x...x.", clap: "............x..." },
  { id: "electro", name: "pElectro", kick: "x..x..x...x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", cowbell: "..x...x...x...x.", sub: "x..x..x...x.x..." },
];
const parse = (p) => Object.fromEntries(TRACKS.map((tr) => [tr.id, P(p[tr.id] || "................")]));
const empty = () => Object.fromEntries(TRACKS.map((tr) => [tr.id, Array(N).fill(false)]));
const PLAYER = [["techno", 132], ["acid", 130], ["house", 124], ["minimal", 126], ["rave", 140], ["hardgroove", 138], ["dub", 120], ["electro", 128]];
const presetById = (id) => PRESETS.find((p) => p.id === id);
const presetName = (id) => (presetById(id) || {}).name;

// ---- generator archetypes: the app owns the taste (which voices per genre, legal onset counts), the runtime
// owns the science (Euclidean search + groove scoring). See /_rt/groove.js. ----
const V = (id, band, ks, rots, p, extra) => ({ id, band, ks, rots, p, ...extra });
const K4 = V("kick", "low", [4], [0], 1);
const ARCHETYPES = [
  { id: "techno", bpm: [130, 138], fx: { drive: [0.08, 0.3], delay: [0, 0.22], reverb: [0.05, 0.28], swing: [0, 0.12] }, voices: [K4, V("sub", "low", [4, 6, 7], [0], 0.85, { bass: true }), V("clap", "mid", [2], [4], 0.85, { backbeat: true }), V("hat", "high", [8, 11, 13], [0, 1, 2], 0.9), V("ohat", "high", [4, 5], [2], 0.5), V("acid", "mid", [5, 7, 9], [0, 1, 2, 3], 0.6, { bass: true }), V("stab", "mid", [2, 3, 4], [0, 2, 4], 0.4), V("rim", "mid", [3, 5], [1, 3], 0.3)] },
  { id: "acid", bpm: [128, 136], fx: { drive: [0.2, 0.5], delay: [0.1, 0.35], reverb: [0.05, 0.25], swing: [0, 0.16] }, voices: [K4, V("sub", "low", [4], [0], 0.7, { bass: true }), V("clap", "mid", [2], [4], 0.8, { backbeat: true }), V("hat", "high", [11, 13, 16], [0, 1], 0.95), V("ohat", "high", [4], [2], 0.6), V("acid", "mid", [7, 9, 11, 13], [0, 1, 2, 3], 1, { bass: true }), V("rim", "mid", [3, 5], [1, 3], 0.25)] },
  { id: "hardtechno", bpm: [140, 150], fx: { drive: [0.35, 0.7], crush: [0, 0.25], delay: [0, 0.2], reverb: [0.05, 0.2], swing: [0, 0.06] }, voices: [V("hardkick", "low", [4, 8], [0], 1), V("rumble", "low", [4, 8], [0, 2], 0.6), V("clap", "mid", [2], [4], 0.7, { backbeat: true }), V("snare", "mid", [4, 8], [2], 0.4, { backbeat: true }), V("ohat", "high", [4, 8], [2], 0.7), V("crash", "high", [1, 2], [0], 0.3), V("reese", "mid", [4, 5, 7], [0, 2], 0.6, { bass: true }), V("hoover", "mid", [2, 3], [0, 4], 0.4)] },
  { id: "minimal", bpm: [126, 132], fx: { drive: [0, 0.15], delay: [0.15, 0.4], reverb: [0.15, 0.45], swing: [0.04, 0.2] }, voices: [K4, V("sub", "low", [4, 6], [0], 0.8, { bass: true }), V("clap", "mid", [1, 2], [4], 0.6, { backbeat: true }), V("shaker", "high", [8, 11], [0], 0.7), V("rim", "mid", [3, 5, 7], [1, 2, 3], 0.6), V("clave", "mid", [3, 5], [0, 2], 0.4), V("stab", "mid", [2, 3], [0, 4], 0.35)] },
  { id: "rave", bpm: [134, 145], fx: { drive: [0.2, 0.45], crush: [0, 0.2], delay: [0.05, 0.3], reverb: [0.1, 0.35], swing: [0, 0.1] }, voices: [K4, V("sub", "low", [4, 6], [0], 0.7, { bass: true }), V("clap", "mid", [2, 4], [4], 0.9, { backbeat: true }), V("hat", "high", [13, 16], [0], 0.9), V("ohat", "high", [4], [2], 0.7), V("hoover", "mid", [2, 3, 5], [0, 4], 0.6), V("stab", "mid", [2, 4, 5], [0, 4], 0.6), V("zap", "high", [2, 3], [2, 6], 0.3)] },
  { id: "electro", bpm: [124, 134], fx: { drive: [0.1, 0.35], crush: [0.05, 0.3], delay: [0.05, 0.25], reverb: [0.05, 0.3], swing: [0, 0.14] }, voices: [V("kick", "low", [4, 5, 6, 7], [0], 1), V("sub", "low", [5, 6, 7], [0, 2], 0.8, { bass: true }), V("snare", "mid", [2], [4], 0.9, { backbeat: true }), V("hat", "high", [8, 11], [0, 1], 0.85), V("cowbell", "mid", [3, 5], [0, 2], 0.4), V("conga", "mid", [3, 5], [2, 6], 0.35), V("pluck", "mid", [3, 5], [0, 2], 0.4, { bass: true })] },
];
const lerp = (rng, [lo, hi]) => lo + rng() * (hi - lo);

// ---- FX rack (all on the shared master bus, built ONCE) ----
const FX = [
  { id: "mfilter", icon: "lucide:filter", label: "fxFilter", min: 0, max: 1, step: 0.02 },
  { id: "drive", icon: "lucide:flame", label: "fxDrive", min: 0, max: 1, step: 0.02 },
  { id: "crush", icon: "lucide:binary", label: "fxCrush", min: 0, max: 1, step: 0.02 },
  { id: "delay", icon: "lucide:repeat-2", label: "fxDelay", min: 0, max: 0.8, step: 0.02 },
  { id: "reverb", icon: "lucide:cloudy", label: "fxReverb", min: 0, max: 0.9, step: 0.02 },
  { id: "swing", icon: "lucide:wind", label: "fxSwing", min: 0, max: 0.6, step: 0.02 },
];
const DFX = { mfilter: 1, drive: 0, crush: 0, delay: 0, reverb: 0, swing: 0 };
const curveOf = (fn) => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
const driveCurve = (a) => curveOf((x) => { const k = a * a * 80; return (1 + k) * x / (1 + k * Math.abs(x)); });
const crushCurve = (a) => { const s = Math.max(2, Math.round(64 * (1 - a) + 2)); return curveOf((x) => Math.round(x * s) / s); };
function makeIR(ctx, seconds = 1.3, decay = 3) { const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return buf; }

// ---- shared state ----
const $tracks = atom(parse(presetById("techno"))), $bpm = atom(132), $fx = atom({ ...DFX }), $riff = atom(RIFF);
const $playing = atom(false), $cur = atom(-1), $style = atom(0), $sweep = atom(-1), $hist = atom({ seeds: [], idx: -1 });
const SAVES = collection("ravePatterns");

// ---- engine (module scope) ----
let eng = null, bus = null, fxN = null, sched = null, raf = null, nextT = 0, stepN = 0, q = [], genT = null;
// ---- keep-alive: hold the screen on + own an OS media session so the beat survives backgrounding (both
// module-scope, like the engine, so they persist across tab switches). See /_rt/mediasession.js. ----
let wl = null, np = null;
const npTitle = () => { const id = (PLAYER[$style.get()] || PLAYER[0])[0]; return `${id[0].toUpperCase()}${id.slice(1)} · ${$bpm.get()} BPM`; };
const artUrl = () => { try { return new URL("icons/icon-512.png", location.href).href; } catch { return null; } };
const syncNP = () => { if (np) np.meta(npTitle()); };
const filtHz = (v) => 200 * Math.pow(90, Math.max(0, Math.min(1, v)));
function applyFx() { if (!fxN) return; const f = $fx.get(), t = eng.ctx.currentTime; fxN.drive.curve = driveCurve(f.drive); fxN.crush.curve = crushCurve(f.crush); try { fxN.dsend.gain.setTargetAtTime(f.delay, t, 0.03); fxN.rsend.gain.setTargetAtTime(f.reverb, t, 0.03); fxN.mf.frequency.setTargetAtTime(filtHz(f.mfilter), t, 0.03); } catch { /* */ } fxN.delay.delayTime.value = 3 * (60 / $bpm.get() / 4); }
function ensure() {
  if (!audioSupported) return null;
  if (!eng) {
    const e = createEngine({ master: 0.85, noise: true }); if (!e) return null; const ctx = e.ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.12; comp.connect(e.master);
    const mf = ctx.createBiquadFilter(); mf.type = "lowpass"; mf.frequency.value = 18000; mf.connect(comp);
    const sum = ctx.createGain(); sum.connect(mf);
    const drive = ctx.createWaveShaper(); drive.oversample = "2x"; drive.curve = driveCurve(0);
    const crush = ctx.createWaveShaper(); crush.curve = crushCurve(0); drive.connect(crush);
    const dry = ctx.createGain(); crush.connect(dry); dry.connect(sum);
    const dsend = ctx.createGain(); dsend.gain.value = 0; const delay = ctx.createDelay(1.5); delay.delayTime.value = 3 * (60 / 130 / 4);
    const dfb = ctx.createGain(); dfb.gain.value = 0.34; const df = ctx.createBiquadFilter(); df.type = "lowpass"; df.frequency.value = 2200;
    crush.connect(dsend); dsend.connect(delay); delay.connect(df); df.connect(dfb); dfb.connect(delay); df.connect(sum);
    const rsend = ctx.createGain(); rsend.gain.value = 0; const rev = ctx.createConvolver(); rev.buffer = makeIR(ctx); crush.connect(rsend); rsend.connect(rev); rev.connect(sum);
    eng = e; bus = drive; fxN = { drive, crush, dsend, rsend, mf, delay }; applyFx();
  }
  eng.resume(); return eng;
}
const setFx = (id, v) => { $fx.set({ ...$fx.get(), [id]: v }); applyFx(); };

// ---- voices (all light, self-freeing, into the shared bus) ----
const env = (g, t, peak, dur, a = 0.004) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
const oscAt = (c, type, f, t) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; };
function drum(c, t, { f0, f1, pf, peak, dur, type = "sine" }) { const o = oscAt(c, type, f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + pf); const g = c.createGain(); env(g, t, peak, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; }
function nz(c, t, buf, { type, freq, q: Q, peak, dur, bursts = 1 }) { const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q != null) f.Q.value = Q; const g = c.createGain(); if (bursts > 1) { let tt = t; for (let i = 0; i < bursts; i++) { g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(peak, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05); tt += 0.02; } } else env(g, t, peak, dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + bursts * 0.02 + 0.02); s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* */ } }; }
function saws(c, t, freqs, { peak, dur, lp }) { const g = c.createGain(); env(g, t, peak, dur, 0.008); let out = g, flt = null; if (lp) { flt = c.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.setValueAtTime(lp * 4, t); flt.frequency.exponentialRampToValueAtTime(lp, t + dur * 0.6); flt.Q.value = 8; g.connect(flt); out = flt; } out.connect(bus); const os = freqs.map((fr) => { const o = oscAt(c, "sawtooth", fr, t); o.connect(g); o.start(t); o.stop(t + dur + 0.02); return o; }); os[0].onended = () => { for (const o of os) { try { o.disconnect(); } catch { /* */ } } try { g.disconnect(); flt && flt.disconnect(); } catch { /* */ } }; }
const VOICES = {
  kick: (c, t) => drum(c, t, { f0: 130, f1: 48, pf: 0.11, peak: 0.9, dur: 0.32 }),
  hardkick: (c, t) => drum(c, t, { f0: 175, f1: 40, pf: 0.06, peak: 1.0, dur: 0.22 }),
  snare: (c, t, o) => { drum(c, t, { f0: 190, f1: 150, pf: 0.05, peak: 0.35, dur: 0.12, type: "triangle" }); nz(c, t, o.b.white, { type: "bandpass", freq: 1900, q: 1, peak: 0.5, dur: 0.16 }); },
  clap: (c, t, o) => nz(c, t, o.b.white, { type: "bandpass", freq: 1600, q: 1.4, peak: 0.5, dur: 0.12, bursts: 3 }),
  rim: (c, t, o) => nz(c, t, o.b.white, { type: "bandpass", freq: 2400, q: 3, peak: 0.5, dur: 0.05 }),
  clave: (c, t) => { const o = oscAt(c, "square", 2500, t); const g = c.createGain(); env(g, t, 0.4, 0.035); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.05); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; },
  hat: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 8500, peak: 0.32, dur: 0.045 }),
  ohat: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 7000, peak: 0.28, dur: 0.18 }),
  ride: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 9500, peak: 0.22, dur: 0.35 }),
  crash: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 6000, peak: 0.24, dur: 0.9 }),
  shaker: (c, t, o) => nz(c, t, o.b.white, { type: "bandpass", freq: 5500, q: 1, peak: 0.2, dur: 0.06 }),
  cowbell: (c, t) => { [587, 845].forEach((f) => { const o = oscAt(c, "square", f, t); const g = c.createGain(); env(g, t, 0.16, 0.12); const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; o.connect(bp); bp.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.14); o.onended = () => { try { o.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* */ } }; }); },
  tom: (c, t) => drum(c, t, { f0: 200, f1: 95, pf: 0.18, peak: 0.7, dur: 0.22 }),
  conga: (c, t) => drum(c, t, { f0: 260, f1: 180, pf: 0.09, peak: 0.6, dur: 0.2 }),
  hoover: (c, t, o) => { const f = o.note(48); saws(c, t, [f * 0.99, f, f * 1.01], { peak: 0.2, dur: 0.3, lp: 1200 }); },
  stab: (c, t, o) => { const f = o.note(48); saws(c, t, [f, f * 2 ** (7 / 12), f * 2], { peak: 0.18, dur: 0.18, lp: 3000 }); },
  zap: (c, t) => { const o = oscAt(c, "sawtooth", 2000, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.15); const g = c.createGain(); env(g, t, 0.3, 0.18); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; },
  pluck: (c, t, o) => saws(c, t, [o.note(48)], { peak: 0.3, dur: 0.16, lp: 2200 }),
  acid: (c, t, o) => saws(c, t, [o.note(36)], { peak: 0.5, dur: o.spb * 0.95, lp: 1200 }),
  reese: (c, t, o) => { const f = o.note(24); saws(c, t, [f * 0.99, f * 1.01], { peak: 0.4, dur: o.spb * 0.95, lp: 400 }); },
  sub: (c, t, o) => drum(c, t, { f0: o.note(24), f1: o.note(24), pf: 0.01, peak: 0.6, dur: o.spb * 0.9, type: "sine" }),
  rumble: (c, t, o) => nz(c, t, o.b.brown, { type: "lowpass", freq: 90, peak: 0.5, dur: o.spb * 0.95 }),
};

// ---- sample packs: open drum kits (Tone.js drum-samples, CORS) as ONLINE add-ons that swap the percussion
// voices for real samples; bass/tonal voices stay synth. Loads lazily on select; until loaded (or offline, or
// the headless gate) the synth voice plays — a seamless fallback, never a broken beat. ----
const PBASE = "https://tonejs.github.io/audio/drum-samples";
const SFILES = ["kick", "snare", "hihat", "tom1", "tom2", "tom3"];
const SMAP = { kick: "kick", hardkick: "kick", snare: "snare", clap: "snare", rim: "snare", hat: "hihat", ohat: "hihat", shaker: "hihat", ride: "hihat", crash: "hihat", tom: "tom1", conga: "tom2", cowbell: "tom3", clave: "tom3" };
const PACKS = [{ id: "LINN", label: "LinnDrum" }, { id: "R8", label: "R-8" }, { id: "CR78", label: "CR-78" }, { id: "KPR77", label: "KPR-77" }, { id: "Techno", label: "Techno" }, { id: "Stark", label: "Stark" }, { id: "Bongos", label: "Bongos" }, { id: "4OP-FM", label: "FM" }, { id: "Kit8", label: "Kit 8" }, { id: "acoustic-kit", label: "Acoustic" }];
const BUF = new Map();
const $pack = atom("synth"), $loading = atom(null);
function playSample(c, buf, t, peak = 0.92) { const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = peak; s.connect(g); g.connect(bus); s.start(t); s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* */ } }; }
async function selectPack(id) {
  buzz(); $pack.set(id);
  if (id === "synth" || isGate) return;                          // gate never hits the network (deterministic e2e)
  if (SFILES.every((f) => BUF.has(`${id}:${f}`))) return;
  const e = ensure(); if (!e) return;
  $loading.set(id);
  await Promise.all(SFILES.map(async (f) => { const k = `${id}:${f}`; if (BUF.has(k)) return; try { const r = await fetch(`${PBASE}/${id}/${f}.mp3`); if (!r.ok) return; BUF.set(k, await e.ctx.decodeAudioData(await r.arrayBuffer())); } catch { /* stays synth */ } }));
  $loading.set(null);
}

function fire(step, time) {
  const e = eng, tr = $tracks.get(), c = e.ctx, spb = 60 / $bpm.get() / 4, riff = $riff.get(), pk = $pack.get();
  const o = { b: e.buffers, spb, note: (m) => midiToFreq(m + riff[step]) };
  for (const T2 of TRACKS) if (tr[T2.id][step]) { const sf = pk !== "synth" ? SMAP[T2.id] : null, buf = sf ? BUF.get(`${pk}:${sf}`) : null; if (buf) playSample(c, buf, time); else VOICES[T2.id](c, time, o); }
  if (q.length < 128) q.push({ time, step });
}
const tick = () => { const e = eng; if (!e) return; const spb = 60 / $bpm.get() / 4, sw = $fx.get().swing; if (nextT < e.ctx.currentTime) nextT = e.ctx.currentTime; while (nextT < e.ctx.currentTime + 0.1) { const s = stepN; fire(s, nextT + (s % 2 ? sw * spb : 0)); nextT += spb; stepN = (s + 1) % N; } };
const draw = () => { const e = eng; if (e) { const now = e.ctx.currentTime; while (q.length && q[0].time <= now) $cur.set(q.shift().step); } raf = requestAnimationFrame(draw); };
function start() {
  const e = ensure(); $playing.set(true); if (!e) return;
  wl = wakeLock.acquire();                                          // screen stays on while it plays
  if (np) np.release();                                            // one live session; a lingering one is a phantom notification
  np = holdAudio({ title: npTitle(), artist: "microspec", artwork: artUrl(),
    onPlay: () => { if (!$playing.get()) start(); },                // lock-screen / headset transport
    onPause: () => stop(), onPrev: () => stepTrack(-1), onNext: () => stepTrack(1),
    resumeCtx: () => e.resume() });
  np.setPlaying(npTitle());
  if (sched) clearInterval(sched); if (raf) cancelAnimationFrame(raf); q = []; nextT = e.ctx.currentTime + 0.06; stepN = 0; sched = setInterval(tick, 25); raf = requestAnimationFrame(draw);
}
function stop() {
  $playing.set(false);
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
  if (sched) { clearInterval(sched); sched = null; } if (raf) { cancelAnimationFrame(raf); raf = null; } $cur.set(-1);
}
const toggle = () => { buzz(12); $playing.get() ? stop() : start(); };

// ---- generator: pick an archetype from the seed, search its Euclidean space, write the bar left→right ----
function generate(seed = randSeed(), animate = true) {
  if (animate) ensure();
  if (genT) { clearInterval(genT); genT = null; }
  const arch = ARCHETYPES[seed % ARCHETYPES.length];
  const g = generateGroove(arch.voices, { seed }), rng = mulberry32(seed ^ 0x5bf03635), full = { ...empty(), ...g.tracks };
  $riff.set(g.riff.length === N ? g.riff : RIFF);
  $bpm.set(Math.round(lerp(rng, arch.bpm)));
  $fx.set({ ...DFX, ...Object.fromEntries(Object.entries(arch.fx).filter(([k]) => k in DFX).map(([k, r]) => [k, Math.round(lerp(rng, r) * 100) / 100])) });
  applyFx(); syncNP();
  if (!animate) { $tracks.set(full); $sweep.set(-1); return; }
  $tracks.set(empty()); $sweep.set(0); let c = 0;
  genT = setInterval(() => { const upto = c; $tracks.set(Object.fromEntries(TRACKS.map((tr) => [tr.id, full[tr.id].map((v, i) => (i <= upto ? v : false))]))); $sweep.set(c); if (++c >= N) { clearInterval(genT); genT = null; $sweep.set(-1); } }, 26); }
const newTrack = () => { buzz(); const seed = randSeed(); const { seeds } = $hist.get(); const next = [...seeds, seed]; $hist.set({ seeds: next, idx: next.length - 1 }); generate(seed); };
const stepTrack = (d) => { buzz(); let { seeds, idx } = $hist.get(); idx += d; if (idx < 0) { seeds = [randSeed(), ...seeds]; idx = 0; } else if (idx >= seeds.length) { seeds = [...seeds, randSeed()]; idx = seeds.length - 1; } $hist.set({ seeds, idx }); generate(seeds[idx]); };

// ---- saves ----
const beatSig = (r) => JSON.stringify([r.tracks, r.bpm, r.riff]);
const beatBars = (tracks) => STEPS.map((s) => TRACKS.reduce((n, tr) => n + (tracks?.[tr.id]?.[s] ? 1 : 0), 0));
const autoName = (t, tracks, bpm, list) => { const key = JSON.stringify(tracks), pre = PRESETS.find((p) => JSON.stringify(parse(p)) === key), base = (pre ? T(t, pre.name) : T(t, "beatWord")) + " · " + bpm; let n = base, i = 2; while (list.some((it) => it.name === n)) n = `${base} (${i++})`; return n; };

// ================= Beat: player + generator =================
export function rave({ S }) {
  const t = useStore(S.t), tracks = useStore($tracks), style = useStore($style), playing = useStore($playing), fx = useStore($fx), cur = useStore($cur), bpm = useStore($bpm), sweep = useStore($sweep);
  const pick = (i) => { buzz(); ensure(); const [id, b] = PLAYER[i]; $style.set(i); $tracks.set(parse(presetById(id))); $bpm.set(b); $hist.set({ seeds: [], idx: -1 }); syncNP(); };
  const kickRow = tracks.kick;

  return html`<div class="flex flex-col items-center gap-5 pt-1">
    <div class="w-full max-w-[440px] -mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div class="flex gap-2 w-max">
        ${PLAYER.map(([id], i) => { const on = i === style; return html`<button data-style=${id} aria-pressed=${on} onClick=${() => pick(i)} key=${id} class=${`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? "border-secondary/60 bg-secondary/12 text-secondary" : "border-base-content/12 text-base-content/70"}`}>${T(t, presetName(id))}</button>`; })}
      </div>
    </div>

    <div data-viz class="w-full max-w-[440px] grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
      ${STEPS.map((i) => { const beat = i % 4 === 0, k = kickRow[i], on = i === cur, sw = i === sweep; return html`<div key=${i} class=${`h-8 rounded-md transition-colors ${sw ? "bg-accent" : on ? "bg-secondary" : k ? "bg-secondary/45" : beat ? "bg-base-content/20" : "bg-base-content/10"}`}></div>`; })}
    </div>

    <div class="flex items-center gap-5">
      <button aria-label=${T(t, "prevTrack")} onClick=${() => stepTrack(-1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-back", "text-xl")}</button>
      <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${toggle} class="w-20 h-20 rounded-full bg-secondary text-secondary-content grid place-items-center shadow-xl active:scale-95 transition">${Icon(playing ? "lucide:square" : "lucide:play", "text-3xl")}</button>
      <button aria-label=${T(t, "nextTrack")} onClick=${() => stepTrack(1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-forward", "text-xl")}</button>
    </div>
    <div class="-mt-2 flex items-center gap-3">
      <div class="font-mono text-xs uppercase tracking-[0.2em] text-base-content/55">${T(t, presetName(PLAYER[style][0]))} · ${bpm} BPM</div>
      <button id="gen" data-gen aria-label=${T(t, "gen")} onClick=${newTrack} class=${`btn btn-sm gap-1.5 ${sweep >= 0 ? "btn-accent" : "btn-outline btn-accent"}`}>${Icon("lucide:sparkles", `text-base ${sweep >= 0 ? "animate-pulse" : ""}`)}${T(t, "gen")}</button>
    </div>

    <div class="w-full max-w-[440px] flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/60 backdrop-blur px-4 py-3">
      ${Icon("lucide:filter", "text-base text-base-content/60 shrink-0")}
      <span class="text-sm font-medium w-24 shrink-0">${T(t, "fxFilter")}</span>
      <input data-filter type="range" min="0" max="1" step="0.01" value=${fx.mfilter} aria-label=${T(t, "fxFilter")} onInput=${(e) => setFx("mfilter", Number(e.target.value))} class="range range-xs range-secondary flex-1" />
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/60">${T(t, "noAudio")}</div>` : null}
  </div>`;
}

// ================= Pads: the matrix + settings sheet =================
export function ravePads({ S, toast, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), tracks = useStore($tracks), bpm = useStore($bpm), playing = useStore($playing), cur = useStore($cur), sweep = useStore($sweep);
  const cellToggle = (tid, s) => { ensure(); $tracks.set({ ...tracks, [tid]: tracks[tid].map((v, i) => (i === s ? !v : v)) }); };
  const save = async () => { try { const list = await SAVES.all(); const rec = { tracks, bpm, riff: $riff.get() }; if (list.find((it) => beatSig(it) === beatSig(rec))) { buzz(); toast?.(T(t, "toastDup", { name: autoName(t, tracks, bpm, list) })); return; } await SAVES.put("p" + Date.now(), { name: autoName(t, tracks, bpm, list), ...rec, fx: $fx.get() }); toast?.(T(t, "toastSaved")); } catch { /* */ } };

  return html`<${Fragment}>
    <div class="pb-40 flex flex-col gap-1">
      <div class="sticky z-10 -mx-4 px-4 bg-base-200/85 backdrop-blur flex items-center gap-[3px] py-1" style="top:calc(3.5rem + env(safe-area-inset-top))">
        <div class="w-7 shrink-0"></div>
        ${STEPS.map((s) => html`<div class=${`flex-1 h-1 rounded-full transition-colors ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${s === sweep ? "bg-accent" : s === cur ? "bg-secondary" : "bg-base-300"}`} key=${s}></div>`)}
      </div>
      ${TRACKS.map((tr) => { const live = tracks[tr.id].some(Boolean); return html`<div class="flex items-center gap-[3px]" key=${tr.id}>
        <div class=${`w-7 shrink-0 flex items-center justify-center ${live ? "text-base-content" : "text-base-content/40"}`} title=${T(t, tr.name)}>${Icon(tr.icon, "text-base")}</div>
        ${STEPS.map((s) => { const on = tracks[tr.id][s]; return html`<button data-cell=${`${tr.id}-${s}`} aria-pressed=${on} aria-label=${`${T(t, tr.name)} ${s + 1}`} onClick=${() => cellToggle(tr.id, s)} key=${s}
          class=${`flex-1 min-w-0 h-8 rounded touch-manipulation transition-all duration-150 ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${on ? tr.on : live ? "bg-base-300" : "bg-base-300/25"} ${s === sweep ? "ring-2 ring-accent scale-105" : s === cur ? "ring-2 ring-base-content/50" : ""}`}></button>`; })}
      </div>`; })}
    </div>

    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)">
      <div class="pointer-events-auto w-full max-w-xl flex items-center gap-2 rounded-[1.35rem] border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-3 py-2">
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} class=${`btn btn-circle shadow-lg shrink-0 ${playing ? "btn-secondary" : "btn-primary"}`} onClick=${toggle}>${Icon(playing ? "lucide:square" : "lucide:play", "text-xl")}</button>
        <button data-gen aria-label=${T(t, "gen")} class="btn btn-circle btn-sm btn-ghost shrink-0" onClick=${newTrack}>${Icon("lucide:sparkles", `text-lg ${sweep >= 0 ? "animate-pulse text-accent" : ""}`)}</button>
        <span class="flex-1 min-w-0 font-mono text-xs tabular-nums text-base-content/70 truncate text-center">${bpm} BPM</span>
        <button data-clear aria-label=${T(t, "clear")} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); $tracks.set(empty()); }}>${Icon("lucide:eraser", "text-lg")}</button>
        <button id="save" data-save aria-label=${T(t, "aSave")} class="btn btn-circle btn-outline btn-sm shrink-0" onClick=${save}>${Icon("lucide:save", "text-lg")}</button>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "fx"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => openScreen("fx")}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
      </div>
    </div>

    <${FxSheet} open=${screen === "fx"} onClose=${closeScreen} t=${t} sweep=${sweep} />
  </${Fragment}>`;
}

// The settings island → a history-backed bottom sheet (S.screen="fx", so system Back closes it): tempo, the
// full FX rack, the generator and the genre presets — out of the way while you edit the grid.
function FxSheet({ open, onClose, t, sweep }) {
  const fx = useStore($fx), bpm = useStore($bpm), tracks = useStore($tracks), pack = useStore($pack), loading = useStore($loading);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const activePreset = PRESETS.find((p) => JSON.stringify(parse(p)) === JSON.stringify(tracks))?.id;
  return html`<dialog id="fxsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-3 max-w-xl mx-auto">${grip}
    <div class="flex flex-col gap-0.5">
      <div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${T(t, "tempo")}</span><span class="font-semibold tabular-nums">${bpm} BPM</span></div>
      <input type="range" min="90" max="150" value=${bpm} class="range range-xs range-primary w-full" aria-label=${T(t, "tempo")} onInput=${(e) => { $bpm.set(Number(e.target.value)); applyFx(); }} />
    </div>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
      ${FX.map((f) => html`<div class="flex flex-col gap-0.5 min-w-0" key=${f.id}><div class="flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-base-content/70">${Icon(f.icon, "text-[0.85em] shrink-0")}<span class="truncate">${T(t, f.label)}</span></div><input data-fx=${f.id} type="range" min=${f.min} max=${f.max} step=${f.step} value=${fx[f.id]} class="range range-xs range-accent w-full min-w-0" aria-label=${T(t, f.label)} onInput=${(e) => setFx(f.id, Number(e.target.value))} /></div>`)}
    </div>
    <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      <button data-gen aria-label=${T(t, "gen")} class=${`btn btn-sm shrink-0 gap-1.5 ${sweep >= 0 ? "btn-accent" : "btn-accent btn-outline"}`} onClick=${newTrack}>${Icon("lucide:sparkles", `text-base ${sweep >= 0 ? "animate-pulse" : ""}`)}<span>${T(t, "gen")}</span></button>
      ${PRESETS.map((p) => html`<button data-preset=${p.id} aria-pressed=${activePreset === p.id} class=${`btn btn-sm shrink-0 ${activePreset === p.id ? "btn-primary" : "btn-outline"}`} onClick=${() => { ensure(); $tracks.set(parse(p)); }} key=${p.id}>${T(t, p.name)}</button>`)}
      <button data-preset="clear" aria-label=${T(t, "clear")} class="btn btn-sm btn-square btn-ghost shrink-0" onClick=${() => $tracks.set(empty())}>${Icon("lucide:eraser", "text-base")}</button>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-[0.6rem] uppercase tracking-wide text-base-content/70 flex items-center gap-1">${Icon("lucide:package", "text-[0.85em]")}${T(t, "packs")}</div>
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        ${[{ id: "synth", label: T(t, "packSynth") }, ...PACKS].map((p) => { const on = pack === p.id, busy = loading === p.id; return html`<button data-pack=${p.id} aria-pressed=${on} aria-busy=${busy} onClick=${() => selectPack(p.id)} key=${p.id} class=${`btn btn-sm shrink-0 ${on ? "btn-secondary" : "btn-outline"} ${busy ? "animate-pulse" : ""}`}>${p.label}</button>`; })}
      </div>
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

// ================= Saved =================
const Spectrum = ({ tracks, live, cur }) => { const bars = beatBars(tracks), mx = Math.max(1, ...bars); return html`<span data-spectrum class="flex items-end gap-px h-5 w-full" aria-hidden="true">${bars.map((v, s) => html`<span class=${`flex-1 rounded-sm transition-colors ${live && s === cur ? "bg-secondary" : v ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${Math.round((v ? 0.25 + 0.75 * (v / mx) : 0.12) * 100)}%`} key=${s}></span>`)}</span>`; };

export function raveSaved({ S, undo }) {
  const t = useStore(S.t);
  const [list, setList] = useState(null);
  const tracks = useStore($tracks), bpm = useStore($bpm), riff = useStore($riff), playing = useStore($playing), cur = useStore($cur);
  const load = () => SAVES.all().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const curSig = beatSig({ tracks, bpm, riff });
  const isCur = (it) => playing && beatSig(it) === curSig;
  const loadBeat = (it) => { $tracks.set({ ...empty(), ...(it.tracks || {}) }); $bpm.set(it.bpm || 130); $riff.set(it.riff?.length === N ? it.riff : RIFF); if (it.fx) { $fx.set({ ...DFX, ...it.fx }); applyFx(); } };
  const open = (it) => { buzz(); loadBeat(it); S.tab.set("pads"); };
  const play = (it) => { buzz(); if (isCur(it)) { stop(); return; } loadBeat(it); start(); };
  const del = async (it) => { const { id, _ts, ...rec } = it; try { await SAVES.remove(id); } catch { /* */ } load(); undo?.(async () => { try { await SAVES.put(id, rec); } catch { /* */ } load(); }, it.name || T(t, "beatWord")); };

  if (!useReveal(list !== null)) return html`<div class="flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div data-skel class="card bg-base-100 border border-base-300 rounded-2xl overflow-hidden" key=${i}><div class="card-body p-3 flex-row items-center gap-3 text-base-content/60"><div class="w-9 h-9 rounded-full bg-base-300 shrink-0"></div><div class="flex-1 min-w-0 flex flex-col gap-1.5"><div class="truncate font-semibold"><${Scramble} len=${12} /></div><div class="h-5"><${Scramble} len=${16} /></div></div></div></div>`)}</div>`;
  if (!list.length) return html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:bookmark", "text-4xl")}<span>${T(t, "savedEmpty")}</span></div>`;

  return html`<div class="flex flex-col gap-2">
    ${list.map((it) => { const on = isCur(it); return html`<div data-saved class="card bg-base-100 border border-base-300 rounded-2xl transition" key=${it.id}>
      <div class="card-body p-3 flex-row items-center gap-3">
        <button data-play aria-label=${on ? T(t, "aStop") : T(t, "aPlay")} class=${`btn btn-circle btn-sm shrink-0 ${on ? "btn-secondary" : "btn-primary"}`} onClick=${() => play(it)}>${Icon(on ? "lucide:square" : "lucide:play", "text-base")}</button>
        <button data-load class="flex-1 min-w-0 text-left flex flex-col gap-1.5" onClick=${() => open(it)}>
          <span class="flex items-baseline justify-between gap-2"><span class="font-semibold truncate">${it.name || T(t, "beatWord")}</span><span class="text-xs text-base-content/70 tabular-nums shrink-0">${it.bpm || 130} BPM</span></span>
          <${Spectrum} tracks=${it.tracks} live=${on} cur=${cur} />
        </button>
        <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-base-content/60" onClick=${() => del(it)}>${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>`; })}
  </div>`;
}
