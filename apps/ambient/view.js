// Ambient — a soundscape mixer that SYNTHESISES everything in the browser (no audio files). White noise =
// random samples; pink = Paul Kellett's filter; brown = leaky integrator; rain/wind = noise through
// BiquadFilters; ocean/gusts = an Oscillator-LFO modulating gain/filter. Layer several at once, each with
// its own volume; a sleep timer fades out. Refs: noise.js (zacharydenton) · Noisehack · MDN.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const LAYERS = [
  { key: "rain", name: "nRain", icon: "lucide:cloud-rain" },
  { key: "ocean", name: "nOcean", icon: "lucide:waves" },
  { key: "wind", name: "nWind", icon: "lucide:wind" },
  { key: "fire", name: "nFire", icon: "lucide:flame" },
  { key: "white", name: "nWhite", icon: "lucide:audio-lines" },
  { key: "pink", name: "nPink", icon: "lucide:radio" },
];
const TIMERS = [15, 30, 60];

// ---- synthesis (all generated) ----
function noiseBuffer(ctx, type, seconds = 4) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  if (type === "white") { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  else if (type === "pink") { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }
  else { let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } }
  return buf;
}
const bqf = (ctx, type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q; return f; };
const lfo = (ctx, hz, depth, target, base) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); target.value = base; o.start(); return o; };

function startLayer(eng, key) {
  const ctx = eng.ctx, vol = ctx.createGain(); vol.gain.value = 0; vol.connect(eng.master);
  const src = ctx.createBufferSource(); src.loop = true;
  const nodes = [src, vol]; let timer = null;
  if (key === "rain") { src.buffer = eng.buf.white; const hp = bqf(ctx, "highpass", 500), lp = bqf(ctx, "lowpass", 6500); src.connect(hp); hp.connect(lp); lp.connect(vol); nodes.push(hp, lp); }
  else if (key === "ocean") { src.buffer = eng.buf.brown; const lp = bqf(ctx, "lowpass", 550); const swell = ctx.createGain(); src.connect(lp); lp.connect(swell); swell.connect(vol); nodes.push(lp, swell, lfo(ctx, 0.07, 0.42, swell.gain, 0.55)); }
  else if (key === "wind") { src.buffer = eng.buf.pink; const bp = bqf(ctx, "bandpass", 500, 2.5); const gust = ctx.createGain(); src.connect(bp); bp.connect(gust); gust.connect(vol); nodes.push(bp, gust, lfo(ctx, 0.1, 260, bp.frequency, 520), lfo(ctx, 0.13, 0.4, gust.gain, 0.6)); }
  else if (key === "fire") { src.buffer = eng.buf.brown; const lp = bqf(ctx, "lowpass", 420); src.connect(lp); lp.connect(vol); nodes.push(lp);
    const cSrc = ctx.createBufferSource(); cSrc.buffer = eng.buf.white; cSrc.loop = true; const cHp = bqf(ctx, "highpass", 2600); const cg = ctx.createGain(); cg.gain.value = 0; cSrc.connect(cHp); cHp.connect(cg); cg.connect(vol); cSrc.start(); nodes.push(cSrc, cHp, cg);
    const pop = () => { const t = ctx.currentTime; cg.gain.cancelScheduledValues(t); cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.005); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.06); timer = setTimeout(pop, 40 + Math.random() * 260); };
    pop();
  }
  else { src.buffer = key === "white" ? eng.buf.white : eng.buf.pink; src.connect(vol); }
  src.start();
  eng.layers.set(key, { vol, stop: () => { try { for (const n of nodes) { try { n.stop && n.stop(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } } } catch { /* */ } if (timer) clearTimeout(timer); }, setVol: (v) => { try { vol.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.08); } catch { vol.gain.value = v * 0.9; } } });
}

export function ambient({ S }) {
  const t = useStore(S.t);
  const [active, setActive] = useState(() => new Set());
  const [vols, setVols] = useState({});
  const [paused, setPaused] = useState(false);
  const [timerMin, setTimerMin] = useState(0);
  const eng = useRef(null), timerRef = useRef(null);

  const ensure = () => {
    if (!AC) return null;
    if (!eng.current) { const ctx = new AC(); const master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination); eng.current = { ctx, master, layers: new Map(), buf: { white: noiseBuffer(ctx, "white"), pink: noiseBuffer(ctx, "pink"), brown: noiseBuffer(ctx, "brown") } }; }
    try { eng.current.ctx.resume(); } catch { /* */ }
    return eng.current;
  };

  // sync the audio graph to state (start/stop/volume) — the UI works even if audio is unavailable
  useEffect(() => {
    const e = eng.current; if (!e) return;
    for (const { key } of LAYERS) {
      const on = active.has(key) && !paused;
      if (on && !e.layers.has(key)) startLayer(e, key);
      else if (!on && e.layers.has(key)) { e.layers.get(key).stop(); e.layers.delete(key); }
      if (e.layers.has(key)) e.layers.get(key).setVol(vols[key] ?? 0.6);
    }
  }, [active, paused, vols]);

  // sleep timer → stop everything when it elapses
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (timerMin > 0 && active.size) timerRef.current = setTimeout(() => { setActive(new Set()); setTimerMin(0); }, timerMin * 60000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timerMin, active]);

  useEffect(() => () => { const e = eng.current; if (e) { for (const l of e.layers.values()) l.stop(); try { e.ctx.close(); } catch { /* */ } } }, []);

  const toggle = (key) => { ensure(); setActive((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; }); };
  const setVol = (key, v) => setVols((m) => ({ ...m, [key]: v }));
  const anyOn = active.size > 0;

  return html`<div class="flex flex-col items-center gap-4 pt-1">
    <div class="flex items-center gap-3">
      <button id="pause" aria-label=${paused ? T(t, "aResume") : T(t, "aPause")} disabled=${!anyOn} class="btn btn-circle btn-primary btn-lg shadow-lg disabled:opacity-40" onClick=${() => { ensure(); setPaused((p) => !p); }}>${Icon(paused || !anyOn ? "lucide:play" : "lucide:pause", "text-2xl")}</button>
    </div>

    <div class="grid grid-cols-2 gap-2.5 w-full max-w-[420px]">
      ${LAYERS.map(({ key, name, icon }) => { const on = active.has(key); return html`<div data-layer=${key} class=${`rounded-2xl border p-3 flex flex-col gap-2 transition ${on ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"}`}>
        <button aria-pressed=${on} class="flex items-center gap-2.5 text-left w-full" onClick=${() => toggle(key)}>
          <span class=${`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${on ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/70"}`}>${Icon(icon, "text-xl")}</span>
          <span class="font-semibold flex-1 min-w-0 truncate">${T(t, name)}</span>
          ${on ? Icon("lucide:volume-2", "text-primary shrink-0") : null}
        </button>
        ${on ? html`<input type="range" min="0" max="1" step="0.02" value=${vols[key] ?? 0.6} class="range range-xs range-primary" aria-label=${T(t, name)} onInput=${(e) => setVol(key, Number(e.target.value))} />` : null}
      </div>`; })}
    </div>

    <div class="flex items-center gap-2 text-sm">
      <span class="text-base-content/70 flex items-center gap-1.5">${Icon("lucide:moon")}${T(t, "sleep")}</span>
      ${TIMERS.map((m) => html`<button data-timer=${m} class=${`px-2.5 py-1 rounded-full text-xs font-medium border transition ${timerMin === m ? "border-primary bg-primary/10" : "border-base-300"}`} onClick=${() => setTimerMin((c) => (c === m ? 0 : m))} key=${m}>${m}${T(t, "min")}</button>`)}
    </div>
    ${!AC ? html`<div class="text-xs text-base-content/50">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
