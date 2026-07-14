// Ambient — a soundscape mixer that SYNTHESISES everything in the browser (no audio files). Noise beds
// (white = random samples; pink = Paul Kellett's filter; brown = leaky integrator) run through
// BiquadFilters + Oscillator-LFOs; tonal/rhythmic layers (chimes, birds, crickets, heartbeat, bowl…) are
// built from scheduled enveloped oscillators. 20 layers across 6 categories, stack any number at once,
// each with its own volume; a sleep timer clears the mix. Refs: noise.js (zacharydenton) · Noisehack · MDN.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, noiseSource as src, filter as bqf, lfo, strike, createEngine } from "/_rt/audio.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const GROUPS = [
  { cat: "catWater", items: [
    { key: "rain", name: "nRain", icon: "lucide:cloud-rain" },
    { key: "downpour", name: "nDownpour", icon: "lucide:cloud-rain-wind" },
    { key: "ocean", name: "nOcean", icon: "lucide:waves" },
    { key: "stream", name: "nStream", icon: "lucide:droplets" },
    { key: "underwater", name: "nUnderwater", icon: "lucide:fish" },
  ] },
  { cat: "catWeather", items: [
    { key: "wind", name: "nWind", icon: "lucide:wind" },
    { key: "thunder", name: "nThunder", icon: "lucide:cloud-lightning" },
  ] },
  { cat: "catNature", items: [
    { key: "crickets", name: "nCrickets", icon: "lucide:bug" },
    { key: "birds", name: "nBirds", icon: "lucide:bird" },
    { key: "frogs", name: "nFrogs", icon: "lucide:leaf" },
    { key: "fire", name: "nFire", icon: "lucide:flame" },
  ] },
  { cat: "catTonal", items: [
    { key: "bowl", name: "nBowl", icon: "lucide:disc-3" },
    { key: "chimes", name: "nChimes", icon: "lucide:bell" },
    { key: "space", name: "nSpace", icon: "lucide:sparkles" },
    { key: "heartbeat", name: "nHeartbeat", icon: "lucide:heart-pulse" },
  ] },
  { cat: "catNoise", items: [
    { key: "white", name: "nWhite", icon: "lucide:audio-lines" },
    { key: "pink", name: "nPink", icon: "lucide:radio" },
    { key: "brown", name: "nBrown", icon: "lucide:audio-waveform" },
  ] },
  { cat: "catMachine", items: [
    { key: "fan", name: "nFan", icon: "lucide:fan" },
    { key: "train", name: "nTrain", icon: "lucide:train-front" },
  ] },
];
const LAYERS = GROUPS.flatMap((g) => g.items);
const TIMERS = [15, 30, 60];

// ---- synthesis (all generated) — noise/node/tone primitives live in /_rt/audio.js ----
// per-layer node kit: tracks nodes + scheduler timers so a layer tears down cleanly.
function makeKit(ctx, out) {
  const nodes = [], timers = [];
  return {
    ctx, out, nodes, timers,
    add: (...ns) => { nodes.push(...ns); return ns[0]; },
    // repeating one-shot with a jittered gap (min + up to span ms)
    loop(min, span, fn) { const tick = () => { try { fn(); } catch { /* */ } timers.push(setTimeout(tick, min + Math.random() * span)); }; timers.push(setTimeout(tick, min + Math.random() * span)); },
    // struck/plucked tone (fundamental + inharmonic partials, exp decay) — the systemic strike()
    hit: (freq, opts) => strike(ctx, out, freq, opts),
    stop() { for (const t of timers) clearTimeout(t); for (const n of nodes) { try { n.stop && n.stop(); } catch { /* */ } try { n.disconnect && n.disconnect(); } catch { /* */ } } },
  };
}

const BUILDERS = {
  rain: (k, b) => { const s = src(k.ctx, b.white), hp = bqf(k.ctx, "highpass", 500), lp = bqf(k.ctx, "lowpass", 6500); s.connect(hp); hp.connect(lp); lp.connect(k.out); s.start(); k.add(s); },
  downpour: (k, b) => { const s = src(k.ctx, b.white), hp = bqf(k.ctx, "highpass", 250), lp = bqf(k.ctx, "lowpass", 3800), g = k.ctx.createGain(); g.gain.value = 1.1; s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 0.15, 0.22, g.gain, 1.0)); },
  ocean: (k, b) => { const s = src(k.ctx, b.brown), lp = bqf(k.ctx, "lowpass", 550), swell = k.ctx.createGain(); s.connect(lp); lp.connect(swell); swell.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 0.07, 0.42, swell.gain, 0.55)); },
  stream: (k, b) => { const s = src(k.ctx, b.white), bp = bqf(k.ctx, "bandpass", 1400, 1.2), g = k.ctx.createGain(); g.gain.value = 0.7; s.connect(bp); bp.connect(g); g.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 7, 500, bp.frequency, 1400)); k.loop(70, 160, () => k.hit(700 + Math.random() * 900, { dur: 0.09, attack: 0.004, peak: 0.05 })); },
  underwater: (k, b) => { const s = src(k.ctx, b.brown), lp = bqf(k.ctx, "lowpass", 320), g = k.ctx.createGain(); g.gain.value = 0.9; s.connect(lp); lp.connect(g); g.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 0.05, 120, lp.frequency, 320)); k.loop(6000, 6000, () => k.hit(560, { dur: 1.8, attack: 0.01, peak: 0.1 })); },
  wind: (k, b) => { const s = src(k.ctx, b.pink), bp = bqf(k.ctx, "bandpass", 500, 2.5), gust = k.ctx.createGain(); s.connect(bp); bp.connect(gust); gust.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 0.1, 260, bp.frequency, 520), lfo(k.ctx, 0.13, 0.4, gust.gain, 0.6)); },
  thunder: (k, b) => {
    const s = src(k.ctx, b.brown), lp = bqf(k.ctx, "lowpass", 120), g = k.ctx.createGain(); g.gain.value = 0.25; s.connect(lp); lp.connect(g); g.connect(k.out); s.start(); k.add(s);
    k.loop(7000, 12000, () => { const t = k.ctx.currentTime, ns = src(k.ctx, b.brown), bl = bqf(k.ctx, "lowpass", 400), bg = k.ctx.createGain(); bl.frequency.setValueAtTime(400, t); bl.frequency.exponentialRampToValueAtTime(60, t + 2.5); bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(1.1, t + 0.15); bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.8); ns.connect(bl); bl.connect(bg); bg.connect(k.out); ns.start(t); ns.stop(t + 3); });
  },
  crickets: (k) => k.loop(400, 800, () => { const t = k.ctx.currentTime, o = k.ctx.createOscillator(), g = k.ctx.createGain(), trem = k.ctx.createOscillator(), td = k.ctx.createGain(); o.type = "triangle"; o.frequency.value = 4300 + Math.random() * 600; trem.type = "square"; trem.frequency.value = 50; td.gain.value = 0.05; trem.connect(td); td.connect(g.gain); g.gain.setValueAtTime(0.05, t); o.connect(g); g.connect(k.out); const dur = 0.25 + Math.random() * 0.25; o.start(t); trem.start(t); o.stop(t + dur); trem.stop(t + dur); }),
  birds: (k) => { const tweet = () => { const t = k.ctx.currentTime, o = k.ctx.createOscillator(), g = k.ctx.createGain(), f0 = 1800 + Math.random() * 1600; o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.14); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17); o.connect(g); g.connect(k.out); o.start(t); o.stop(t + 0.2); }; k.loop(500, 2400, () => { tweet(); if (Math.random() < 0.45) k.timers.push(setTimeout(tweet, 130 + Math.random() * 120)); }); },
  frogs: (k) => k.loop(600, 2000, () => { const t = k.ctx.currentTime, o = k.ctx.createOscillator(), lp = bqf(k.ctx, "lowpass", 700), g = k.ctx.createGain(), trem = k.ctx.createOscillator(), td = k.ctx.createGain(); o.type = "sawtooth"; o.frequency.value = 150 + Math.random() * 80; trem.type = "square"; trem.frequency.value = 28; td.gain.value = 0.09; trem.connect(td); td.connect(g.gain); g.gain.setValueAtTime(0.09, t); o.connect(lp); lp.connect(g); g.connect(k.out); const dur = 0.25 + Math.random() * 0.2; o.start(t); trem.start(t); o.stop(t + dur); trem.stop(t + dur); }),
  fire: (k, b) => {
    const s = src(k.ctx, b.brown), lp = bqf(k.ctx, "lowpass", 420); s.connect(lp); lp.connect(k.out); s.start(); k.add(s);
    const cSrc = src(k.ctx, b.white), cHp = bqf(k.ctx, "highpass", 2600), cg = k.ctx.createGain(); cg.gain.value = 0; cSrc.connect(cHp); cHp.connect(cg); cg.connect(k.out); cSrc.start(); k.add(cSrc);
    k.loop(40, 240, () => { const t = k.ctx.currentTime; cg.gain.cancelScheduledValues(t); cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.005); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.06); });
  },
  bowl: (k) => { const mix = k.ctx.createGain(); mix.gain.value = 0.5; mix.connect(k.out); const base = 130.8; for (const [r, g] of [[1, 0.5], [2.76, 0.2], [5.42, 0.1], [1.006, 0.45], [2.05, 0.14]]) { const o = k.ctx.createOscillator(), gn = k.ctx.createGain(); o.type = "sine"; o.frequency.value = base * r; gn.gain.value = g; o.connect(gn); gn.connect(mix); o.start(); k.add(o); } k.add(lfo(k.ctx, 0.08, 0.18, mix.gain, 0.5)); },
  chimes: (k) => { const scale = [523.25, 587.33, 698.46, 783.99, 880]; k.loop(1800, 3800, () => k.hit(scale[Math.floor(Math.random() * scale.length)], { dur: 2.6, attack: 0.004, peak: 0.18, partials: [[1, 1], [2.01, 0.4], [3.0, 0.18], [4.2, 0.09]] })); },
  space: (k, b) => {
    const mix = k.ctx.createGain(); mix.gain.value = 0.4; const lp = bqf(k.ctx, "lowpass", 600, 0.7); mix.connect(lp); lp.connect(k.out);
    [65.4, 98, 130.8, 196].forEach((f, i) => { const o = k.ctx.createOscillator(), gn = k.ctx.createGain(); o.type = i % 2 ? "sine" : "triangle"; o.frequency.value = f * (1 + (i - 1.5) * 0.002); gn.gain.value = 0.25; o.connect(gn); gn.connect(mix); o.start(); k.add(o); });
    k.add(lfo(k.ctx, 0.03, 500, lp.frequency, 700));
    const ns = src(k.ctx, b.pink), nl = bqf(k.ctx, "bandpass", 800, 0.5), ng = k.ctx.createGain(); ng.gain.value = 0.05; ns.connect(nl); nl.connect(ng); ng.connect(k.out); ns.start(); k.add(ns);
  },
  heartbeat: (k) => k.loop(950, 200, () => { const t = k.ctx.currentTime, thump = (at, peak) => { const o = k.ctx.createOscillator(), g = k.ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(75, t + at); o.frequency.exponentialRampToValueAtTime(45, t + at + 0.12); g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(peak, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18); o.connect(g); g.connect(k.out); o.start(t + at); o.stop(t + at + 0.22); }; thump(0, 0.9); thump(0.28, 0.6); }),
  white: (k, b) => { const s = src(k.ctx, b.white); s.connect(k.out); s.start(); k.add(s); },
  pink: (k, b) => { const s = src(k.ctx, b.pink); s.connect(k.out); s.start(); k.add(s); },
  brown: (k, b) => { const s = src(k.ctx, b.brown), g = k.ctx.createGain(); g.gain.value = 0.8; s.connect(g); g.connect(k.out); s.start(); k.add(s); },
  fan: (k, b) => { const s = src(k.ctx, b.white), lp = bqf(k.ctx, "lowpass", 900, 0.8), g = k.ctx.createGain(); g.gain.value = 0.9; s.connect(lp); lp.connect(g); g.connect(k.out); s.start(); k.add(s, lfo(k.ctx, 0.7, 0.08, g.gain, 0.9)); const hum = k.ctx.createOscillator(), hg = k.ctx.createGain(); hum.type = "sine"; hum.frequency.value = 110; hg.gain.value = 0.03; hum.connect(hg); hg.connect(k.out); hum.start(); k.add(hum); },
  train: (k, b) => { const s = src(k.ctx, b.brown), lp = bqf(k.ctx, "lowpass", 260), g = k.ctx.createGain(); g.gain.value = 0.5; s.connect(lp); lp.connect(g); g.connect(k.out); s.start(); k.add(s); k.loop(560, 80, () => { const t = k.ctx.currentTime, clack = (at) => { const ns = src(k.ctx, b.white), bp = bqf(k.ctx, "bandpass", 1200, 1.2), cg = k.ctx.createGain(); cg.gain.setValueAtTime(0.0001, t + at); cg.gain.linearRampToValueAtTime(0.5, t + at + 0.005); cg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.08); ns.connect(bp); bp.connect(cg); cg.connect(k.out); ns.start(t + at); ns.stop(t + at + 0.1); }; clack(0); clack(0.13); }); },
};

function startLayer(eng, key) {
  const ctx = eng.ctx, vol = ctx.createGain(); vol.gain.value = 0; vol.connect(eng.master);
  const kit = makeKit(ctx, vol);
  BUILDERS[key](kit, eng.buffers);
  eng.layers.set(key, { stop: () => { kit.stop(); try { vol.disconnect(); } catch { /* */ } }, setVol: (v) => { try { vol.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.08); } catch { vol.gain.value = v * 0.9; } } });
}

export function ambient({ S }) {
  const t = useStore(S.t);
  const [active, setActive] = useState(() => new Set());
  const [vols, setVols] = useState({});
  const [paused, setPaused] = useState(false);
  const [timerMin, setTimerMin] = useState(0);
  const eng = useRef(null), timerRef = useRef(null);

  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) { eng.current = createEngine({ master: 0.8 }); eng.current.layers = new Map(); }
    eng.current.resume();
    return eng.current;
  };

  // sync the audio graph to state (start/stop/volume) — the UI works even if audio is unavailable
  useEffect(() => {
    const e = eng.current; if (!e) return;
    for (const { key } of LAYERS) {
      const on = active.has(key) && !paused;
      if (on && !e.layers.has(key)) startLayer(e, key);
      else if (!on && e.layers.has(key)) { e.layers.get(key).stop(); e.layers.delete(key); }
      if (e.layers.has(key)) e.layers.get(key).setVol(vols[key] ?? 0.55);
    }
  }, [active, paused, vols]);

  // sleep timer → stop everything when it elapses
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (timerMin > 0 && active.size) timerRef.current = setTimeout(() => { setActive(new Set()); setTimerMin(0); }, timerMin * 60000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timerMin, active]);

  useEffect(() => () => { const e = eng.current; if (e) { for (const l of e.layers.values()) l.stop(); e.close(); } }, []);

  const toggle = (key) => { ensure(); setActive((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; }); };
  const setVol = (key, v) => setVols((m) => ({ ...m, [key]: v }));
  const anyOn = active.size > 0;

  return html`<div class="flex flex-col items-center gap-4 pt-1">
    <div class="flex items-center gap-3">
      <button id="pause" aria-label=${paused ? T(t, "aResume") : T(t, "aPause")} disabled=${!anyOn} class="btn btn-circle btn-primary btn-lg shadow-lg disabled:opacity-40" onClick=${() => { ensure(); setPaused((p) => !p); }}>${Icon(paused || !anyOn ? "lucide:play" : "lucide:pause", "text-2xl")}</button>
      ${anyOn ? html`<span class="text-sm text-base-content/70 tabular-nums">${active.size} · ${paused ? T(t, "aResume") : T(t, "playing")}</span>` : null}
    </div>

    <div class="flex flex-col gap-4 w-full max-w-[420px]">
      ${GROUPS.map(({ cat, items }) => html`<div class="flex flex-col gap-2" key=${cat}>
        <div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/70 px-1">${T(t, cat)}</div>
        <div class="grid grid-cols-2 gap-2.5">
          ${items.map(({ key, name, icon }) => { const on = active.has(key); return html`<div data-layer=${key} class=${`rounded-2xl border p-3 flex flex-col gap-2 transition ${on ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"}`} key=${key}>
            <button aria-pressed=${on} class="flex items-center gap-2.5 text-left w-full" onClick=${() => toggle(key)}>
              <span class=${`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${on ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/70"}`}>${Icon(icon, "text-xl")}</span>
              <span class="font-semibold flex-1 min-w-0 truncate">${T(t, name)}</span>
              ${on ? Icon("lucide:volume-2", "text-primary shrink-0") : null}
            </button>
            ${on ? html`<input type="range" min="0" max="1" step="0.02" value=${vols[key] ?? 0.55} class="range range-xs range-primary" aria-label=${T(t, name)} onInput=${(e) => setVol(key, Number(e.target.value))} />` : null}
          </div>`; })}
        </div>
      </div>`)}
    </div>

    <div class="flex items-center gap-2 text-sm flex-wrap justify-center">
      <span class="text-base-content/70 flex items-center gap-1.5">${Icon("lucide:moon")}${T(t, "sleep")}</span>
      ${TIMERS.map((m) => html`<button data-timer=${m} class=${`px-2.5 py-1 rounded-full text-xs font-medium border transition ${timerMin === m ? "border-primary bg-primary/10" : "border-base-300"}`} onClick=${() => setTimerMin((c) => (c === m ? 0 : m))} key=${m}>${m}${T(t, "min")}</button>`)}
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
