// apps/drift — a generative ambient engine. It composes an endless, never-repeating, mathematically consonant
// ambient track live in the browser (no files, offline). The MUSIC THEORY (consonance, scales, chord
// voice-leading, Eno async loops) is the unit-tested /_rt/ambient.js; the TIMBRES are apps/drift/synth.js; this
// file is the conductor + the UI. Ten distinct styles (each its own scale, harmony, register, FX and signature
// sound-pack), ten swappable sound-packs, three macros (density, tone, space).
//
// Signal flow: light self-freeing voices → busIn → [dry] + [reverb send] + [feedback-delay send] → tone filter
// → limiter → master. The heavy FX live on the bus, built ONCE (the farm's anti-stutter rule). A slow conductor
// (setInterval) changes chords sparsely (voice-led for the "held drone" glue) and lets several coprime Eno
// loops sprinkle chord-tone sparkles — so the combination never repeats. Keep-alive (holdAudio + wakeLock) lets
// the track survive backgrounding. The stage (viz.js) breathes with the live mix, tinted to the style's hue.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, createEngine, filter as bqf, lfo } from "/_rt/audio.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import {
  STYLES, styleById, CHORDS, voiceLead, chordRoot, pickChord, sparkleNote,
  enoLoops, loopsForDensity, dwellSeconds, mulberry32, midiToFreq,
} from "/_rt/ambient.js";
import { Segmented, Island, Panel, Slider, Transport } from "/_rt/ui.js";
import { PACKS, packById, padVoice, textureVoice, droneVoice, sparkle, makeIR } from "./synth.js";
import { Field, bindAudio } from "./viz.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;

// tone macro (0..1) ⇄ master cutoff (400 Hz .. 9 kHz, log)
const toneHz = (v) => 400 * Math.pow(22.5, clamp(v, 0, 1));
const cutoffToMacro = (hz) => clamp(Math.log(hz / 400) / Math.log(22.5), 0, 1);

// ---- persisted working set ----
const NS = "drift:";
const JC = (initial) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return initial; } } });
const persisted = (key, initial) => persistentAtom(NS + key, initial, JC(initial));
const D0 = STYLES[0];
const $style = persisted("style", D0.id);
const $pack = persisted("pack", "");                              // "" = follow the style's signature pack
const $density = persisted("density", D0.density);
const $tone = persisted("tone", cutoffToMacro(D0.cutoff));
const $space = persisted("space", D0.reverb);
const $playing = atom(false);
const $tick = atom(0);                                            // bumps on style/pack change to re-render UI

const curStyle = () => styleById($style.get());
const curPack = () => packById($pack.get() || curStyle().pack);
const curDensity = () => $density.get();

// ---- engine (module scope, survives tab switches) ----
let eng = null, busIn = null, toneFilter = null, revSend = null, delSend = null, delay = null, analyser = null, freqBuf = null;
let sched = null, wl = null, np = null;
let padVoices = [], drone = null, texture = null, curVoicing = null, curRoot = 0, curIntervals = null;
let chordIdx = 0, chordDueAt = 0, prevVoicing = null, loops = [], rng = mulberry32(1);
let curT = {};                                                   // latest i18n dict, for the media-session title

const npTitle = () => `Drift · ${T(curT, curStyle().key)}`;
const artUrl = () => { try { return new URL("icons/icon-512.png", location.href).href; } catch { return null; } };

function ensure() {
  if (!audioSupported) return null;
  if (!eng) {
    const e = createEngine({ master: 0.9, noise: true }); if (!e) return null; const ctx = e.ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25; comp.connect(e.master);
    toneFilter = bqf(ctx, "lowpass", toneHz($tone.get()), 0.4); toneFilter.connect(comp);
    lfo(ctx, 0.05, 300, toneFilter.frequency);                   // gentle global brightness drift (adds on top)
    const sum = ctx.createGain(); sum.connect(toneFilter);
    busIn = ctx.createGain(); busIn.connect(sum);                // voices connect here (dry path)
    // reverb send → long convolver
    const rev = ctx.createConvolver(); rev.buffer = makeIR(ctx, 4.5, 2.2); revSend = ctx.createGain(); revSend.gain.value = 0; busIn.connect(revSend); revSend.connect(rev); rev.connect(sum);
    // feedback delay send (darkened tail)
    delSend = ctx.createGain(); delSend.gain.value = 0; delay = ctx.createDelay(1.5); delay.delayTime.value = curStyle().delayTime;
    const dfb = ctx.createGain(); dfb.gain.value = curStyle().delayFb; const dlp = bqf(ctx, "lowpass", 2600, 0.5);
    busIn.connect(delSend); delSend.connect(delay); delay.connect(dlp); dlp.connect(dfb); dfb.connect(delay); dlp.connect(sum);
    eng = e; eng._dfb = dfb;
    // observer tap for the stage (no onward connection → can't alter what you hear)
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
    freqBuf = new Uint8Array(analyser.frequencyBinCount); e.master.connect(analyser);
    bindAudio(() => { if (!analyser || !$playing.get()) return null; analyser.getByteFrequencyData(freqBuf); return freqBuf; });
  }
  eng.resume(); return eng;
}

function applyMix() {
  if (!eng) return; const st = curStyle(), t = eng.ctx.currentTime;
  try {
    revSend.gain.setTargetAtTime($space.get(), t, 0.1);
    delSend.gain.setTargetAtTime(st.delaySend, t, 0.1);
    delay.delayTime.setTargetAtTime(st.delayTime, t, 0.1);
    eng._dfb.gain.setTargetAtTime(st.delayFb, t, 0.1);
    toneFilter.frequency.setTargetAtTime(toneHz($tone.get()), t, 0.1);
  } catch { /* */ }
}

// build/replace the pad bed for a voicing with the current pack timbre (crossfaded)
function voicePad(voicing, t) {
  const st = curStyle(), peak = 0.5 / Math.max(1, voicing.length), old = padVoices;
  padVoices = voicing.map((m) => padVoice(eng.ctx, busIn, midiToFreq(m), curPack(), st, peak, eng.buffers));
  for (const v of old) v.release(t + 0.15);
}

function changeChord(t, init) {
  const st = curStyle();
  chordIdx = init ? 0 : pickChord(st.chords, chordIdx, rng);
  const entry = st.chords[chordIdx], root = chordRoot(st, entry), intervals = CHORDS[entry[1]];
  const voicing = voiceLead(prevVoicing, root, intervals);
  voicePad(voicing, t);
  prevVoicing = voicing; curVoicing = voicing; curRoot = root; curIntervals = intervals;
  chordDueAt = t + dwellSeconds(st, rng);
}

function fireSparkle(t) {
  if (!curIntervals) return;
  if (rng() > 0.35 + curDensity() * 0.5) return;                 // most loops rest → sparse, breathing
  const m = sparkleNote(curRoot, curIntervals, curStyle().sparkleOct, rng);
  sparkle(eng.ctx, busIn, midiToFreq(m), curPack(), 0.1 + curDensity() * 0.07);
}

function conduct() {
  if (!eng) return; const t = eng.ctx.currentTime;
  if (t >= chordDueAt) changeChord(t);
  for (const L of loops) { if (t >= L.nextAt) { fireSparkle(t + 0.05); L.nextAt += L.len; } }
}

function start() {
  const e = ensure(); $playing.set(true); if (!e) return; const ctx = e.ctx, st = curStyle(), t = ctx.currentTime + 0.1;
  rng = mulberry32(randSeed());
  applyMix();
  drone = st.drone ? droneVoice(ctx, busIn, midiToFreq(st.root - 12), 0.2) : null;
  texture = textureVoice(ctx, busIn, e.buffers, st.texture, st.textureGain);
  prevVoicing = null; changeChord(t, true);
  loops = enoLoops(loopsForDensity(curDensity()), rng).map((L) => ({ len: L.len, nextAt: t + L.phase + 1 }));
  wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(), artist: "microspec", artwork: artUrl(), onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), onPrev: () => cycleStyle(-1), onNext: () => cycleStyle(1), resumeCtx: () => e.resume() });
  np.setPlaying(npTitle());
  if (sched) clearInterval(sched); sched = setInterval(conduct, 180);
}

function stop() {
  $playing.set(false); const t = eng ? eng.ctx.currentTime : 0;
  for (const v of padVoices) v.release(t); padVoices = [];
  if (drone) { drone.stop(); drone = null; }
  if (texture) { texture.stop(); texture = null; }
  if (sched) { clearInterval(sched); sched = null; }
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
  loops = []; prevVoicing = null; curIntervals = null;
}
const toggle = () => { buzz(12); $playing.get() ? stop() : start(); };
const vary = () => { buzz(); if (!$playing.get() || !eng) return; rng = mulberry32(randSeed()); const t = eng.ctx.currentTime; prevVoicing = curVoicing; changeChord(t); loops = enoLoops(loopsForDensity(curDensity()), rng).map((L) => ({ len: L.len, nextAt: t + (L.phase % L.len) + 0.5 })); };

// live handover when the style changes mid-play (no gap): retune drone, swap texture, remix FX, re-voice into
// the new scale, rebuild the loop set.
function restyle() {
  const st = curStyle(); $tick.set($tick.get() + 1);
  if (np) np.meta(npTitle());
  if (!$playing.get() || !eng) return; const ctx = eng.ctx, t = ctx.currentTime;
  applyMix();
  if (texture) texture.stop(); texture = textureVoice(ctx, busIn, eng.buffers, st.texture, st.textureGain);
  if (st.drone) { if (drone) drone.setFreq(midiToFreq(st.root - 12)); else drone = droneVoice(ctx, busIn, midiToFreq(st.root - 12), 0.2); }
  else if (drone) { drone.stop(); drone = null; }
  prevVoicing = null; changeChord(t, true);
  loops = enoLoops(loopsForDensity(curDensity()), rng).map((L) => ({ len: L.len, nextAt: t + (L.phase % L.len) + 0.5 }));
}
function repack() {
  $tick.set($tick.get() + 1);
  if (!$playing.get() || !eng || !curVoicing) return;
  voicePad(curVoicing, eng.ctx.currentTime);
}

// The app's accent token follows the active world. --app-accent is a MARK colour (dots, rings, glow), so
// re-pointing it at the current style's hue is safe in both themes — no text and no text-bearing surface
// is ever painted with it. This is what the token layer buys: one property write re-tints every shared
// component on screen, and not one of them knows drift exists.
const applyAccent = (s) => { try { document.documentElement.style.setProperty("--app-accent", `hsl(${s.hue} 70% 58%)`); } catch { /* */ } };
applyAccent(curStyle());   // the PERSISTED world owns the accent from the first paint, not from the first tap

const setStyle = (id) => { buzz(); const s = styleById(id); $style.set(id); $pack.set(""); $density.set(s.density); $tone.set(cutoffToMacro(s.cutoff)); $space.set(s.reverb); applyAccent(s); restyle(); };
const cycleStyle = (d) => { const i = STYLES.findIndex((s) => s.id === $style.get()); setStyle(STYLES[(i + d + STYLES.length) % STYLES.length].id); };
const setPack = (id) => { buzz(); $pack.set(id); repack(); };
const setDensity = (v) => { $density.set(v); };
const setTone = (v) => { $tone.set(v); if (eng) try { toneFilter.frequency.setTargetAtTime(toneHz(v), eng.ctx.currentTime, 0.1); } catch { /* */ } };
const setSpace = (v) => { $space.set(v); if (eng) try { revSend.gain.setTargetAtTime(v, eng.ctx.currentTime, 0.1); } catch { /* */ } };

// the hue is carried on a small filled DOT (colour = meaning), never on text — arbitrary-hue text fails
// axe contrast in one theme or the other.
const Dot = (hue, cls = "w-2 h-2") => html`<span class=${`${cls} rounded-full shrink-0`} style=${`background:hsl(${hue} 70% 58%)`}></span>`;

// ================= Play: the full-bleed ambient stage + floating islands =================
// A FIT screen (spec: tabs[].fit): the page owns exactly one viewport and can never scroll, so the stage
// stays a stage instead of becoming the top of a document. The three parts are a rail, an elastic void,
// and the transport — the void is what absorbs a 915px phone and a 390px landscape alike, and everything
// else compacts through the --ms-* tokens without a single breakpoint written here.
export function drift({ S }) {
  const t = useStore(S.t); curT = t;
  const loc = useStore(S.locale);
  const playing = useStore($playing); useStore($tick);
  const style = curStyle(), pack = curPack();
  const worlds = STYLES.map((s) => ({ id: s.id, label: T(t, s.key), dot: `hsl(${s.hue} 70% 58%)` }));
  return html`<${Fragment}>
    <${Field} hue=${style.hue} />
    <div aria-hidden="true" class="fixed inset-x-0 bottom-0 z-[1] h-2/5 pointer-events-none bg-gradient-to-t from-black/55 via-black/15 to-transparent"></div>

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <div class="shrink-0"><${Segmented} attr="data-style" scroll variant="outline" label=${T(t, "tabPlay")}
        items=${worlds} value=${style.id} onChange=${setStyle} /></div>

      <div class="flex-1 min-h-0"></div>

      ${/* The transport is the kit's, not this app's: the world/pack pair IS the now-playing line, and
           "vary" is an app action the widget carries (and demotes) rather than a button bolted beside it. */""}
      <${Island} className="shrink-0">
        <${Transport} locale=${loc} playing=${playing} onToggle=${toggle}
          title=${html`<span class="inline-flex items-center gap-2">${Dot(style.hue, "w-2.5 h-2.5")}${T(t, style.key)}</span>`}
          subtitle=${html`<span class="inline-flex items-center gap-1.5">${Icon(pack.icon, "text-base")}${T(t, pack.key)}${playing ? html`<span class="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-1 animate-pulse"></span>` : null}</span>`}
          actions=${[{ id: "vary", icon: "lucide:shuffle", label: T(t, "aVary"), onClick: vary, disabled: !playing, haptic: "off" }]} />
      </${Island}>
      ${!audioSupported ? html`<div class="shrink-0 text-xs text-center text-base-content/70">${T(t, "noAudio")}</div>` : null}
    </div>
  </${Fragment}>`;
}

// ================= Shape: sound-pack + the three macros =================
// Also a FIT screen. The ten packs used to be a 2-column grid of 5 rows — 340px of tiles that pushed the
// macros off a short screen and made the tab a scroller. As a rail they cost ONE row at every height, and
// the choice reads better besides: a sound-pack is a timbre you flick through, not a menu you audit.
export function driftShape({ S }) {
  const t = useStore(S.t);
  const pack = curPack();
  useStore($tick); useStore($density); useStore($tone); useStore($space);
  const packs = PACKS.map((p) => ({ id: p.id, label: T(t, p.key), icon: p.icon }));
  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
    <div class="shrink-0 flex flex-col gap-1.5">
      <div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70 px-1">${T(t, "secSound")}</div>
      <${Segmented} attr="data-pack" scroll variant="outline" label=${T(t, "secSound")}
        items=${packs} value=${pack.id} onChange=${setPack} />
    </div>

    <${Panel} title=${T(t, "secShape")} className="shrink-0">
      <div class="flex flex-col gap-[var(--ms-gap)] ms-cols" style="--ms-cols:3">
        <${Slider} id="density" label=${T(t, "mDensity")} value=${$density.get()} onInput=${setDensity} />
        <${Slider} id="tone" label=${T(t, "mTone")} value=${$tone.get()} onInput=${setTone} />
        <${Slider} id="space" label=${T(t, "mSpace")} value=${$space.get()} onInput=${setSpace} />
      </div>
    </${Panel}>

    <div class="flex-1 min-h-0"></div>
  </div>`;
}
