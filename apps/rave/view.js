// Rave — a minimal techno groove player. Pick a style, hit play, sweep one filter. Everything is SYNTHESISED
// (no samples): four light voices (kick, hat, clap, acid bass) through a single master lowpass — the macro
// "Filter" knob. Grooves are Euclidean (bjorklund, from the unit-tested /_rt/groove.js) so each style is a
// musical four-on-the-floor/offbeat pattern, not hand-drawn. Deliberately lean: the previous build stacked a
// 16-voice engine + per-hit 2× waveshapers + a convolution reverb and starved the audio thread on a phone
// (stutter); here a hit is 1–3 nodes and a bar is a couple dozen, so it never throttles. The engine + transport
// live at MODULE scope so playback survives tab switches. Timing = a lookahead scheduler (Chris Wilson, "Two
// Clocks"). Refs: MDN Web Audio · Euclidean rhythm (Toussaint).
import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { bjorklund } from "/_rt/groove.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const N = 16;
const steps = (arr) => { const b = Array(N).fill(false); for (const s of arr) b[s] = true; return b; };
const RIFF = [0, 0, 12, 0, 0, 7, 0, 3, 0, 0, 12, 0, 5, 0, 7, 0];    // acid-ish bass line (semitones over the root)

// a style = a groove. kick/hat/bass via Euclidean fills; clap on the backbeat. root is the bass MIDI note.
const St = (id, key, bpm, kk, hk, clap, bk, root) => ({ id, key, bpm, kick: bjorklund(kk, N), hat: bjorklund(hk, N), clap: steps(clap), bass: bjorklund(bk, N), root });
const STYLES = [
  St("techno", "pTechno", 132, 4, 8, [4, 12], 5, 36),
  St("acid", "pAcid", 130, 4, 8, [4, 12], 9, 34),
  St("house", "pHouse", 124, 4, 8, [4, 12], 4, 38),
  St("minimal", "pMinimal", 126, 4, 5, [12], 3, 36),
  St("rave", "pRave", 140, 4, 11, [4, 12], 7, 36),
  St("hardgroove", "pHardgroove", 138, 4, 11, [4, 12], 9, 33),
  St("dub", "pDub", 120, 3, 4, [8], 3, 31),
  St("electro", "pElectro", 128, 5, 8, [4, 12], 6, 36),
];

// ---- module-scope engine + transport (survive the view unmounting on tab switch) ----
const $style = atom(0), $playing = atom(false), $filt = atom(0.82), $cur = atom(-1);
let eng = null, mf = null, sched = null, raf = null, nextT = 0, stepN = 0, q = [];
const filtHz = (v) => 200 * Math.pow(90, Math.max(0, Math.min(1, v)));

function ensure() {
  if (!audioSupported) return null;
  if (!eng) {
    eng = createEngine({ master: 0.9, noise: true });
    if (!eng) return null;
    mf = eng.ctx.createBiquadFilter(); mf.type = "lowpass"; mf.Q.value = 1.1; mf.frequency.value = filtHz($filt.get()); mf.connect(eng.master);
  }
  eng.resume();
  return eng;
}
const applyFilter = () => { if (mf) try { mf.frequency.setTargetAtTime(filtHz($filt.get()), eng.ctx.currentTime, 0.03); } catch { mf.frequency.value = filtHz($filt.get()); } };

// voices — each self-frees; all route through the master filter (the one macro knob)
function kick(ctx, t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.connect(g); g.connect(mf); o.start(t); o.stop(t + 0.34); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; }
function noiseHit(ctx, buf, t, { type, freq, q: Q, peak, dur }) { const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q != null) f.Q.value = Q; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(mf); s.start(t); s.stop(t + dur + 0.02); s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* */ } }; }
function bass(ctx, t, freq, dur) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.setValueAtTime(0.5, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(mf); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; }

function fire(step, time) {
  const e = eng, s = STYLES[$style.get()], b = e.buffers, ctx = e.ctx, spb = 60 / s.bpm / 4;
  if (s.kick[step]) kick(ctx, time);
  if (s.hat[step]) noiseHit(ctx, b.white, time, { type: "highpass", freq: 8000, peak: 0.32, dur: step % 4 === 2 ? 0.11 : 0.045 });
  if (s.clap[step]) noiseHit(ctx, b.white, time, { type: "bandpass", freq: 1600, q: 1.4, peak: 0.5, dur: 0.12 });
  if (s.bass[step]) bass(ctx, time, midiToFreq(s.root + RIFF[step]), spb * 0.95);
  q.push({ time, step });
}
const tick = () => {
  const e = eng; if (!e) return; const s = STYLES[$style.get()], spb = 60 / s.bpm / 4;
  if (nextT < e.ctx.currentTime) nextT = e.ctx.currentTime;
  while (nextT < e.ctx.currentTime + 0.1) { fire(stepN, nextT); nextT += spb; stepN = (stepN + 1) % N; }
};
const draw = () => { const e = eng; if (e) { const now = e.ctx.currentTime; while (q.length && q[0].time <= now) $cur.set(q.shift().step); } raf = requestAnimationFrame(draw); };

function start() {
  const e = ensure(); $playing.set(true); if (!e) return;
  if (sched) clearInterval(sched); if (raf) cancelAnimationFrame(raf);   // idempotent: never stack a second loop
  q = []; nextT = e.ctx.currentTime + 0.06; stepN = 0; sched = setInterval(tick, 25); raf = requestAnimationFrame(draw);
}
function stop() { $playing.set(false); if (sched) { clearInterval(sched); sched = null; } if (raf) { cancelAnimationFrame(raf); raf = null; } $cur.set(-1); }

export function rave({ S }) {
  const t = useStore(S.t), style = useStore($style), playing = useStore($playing), filt = useStore($filt), cur = useStore($cur);
  useEffect(() => () => { /* keep playing across tab switches; nothing to tear down here */ }, []);
  const s = STYLES[style];

  const pickStyle = (i) => { buzz(); $style.set(i); };
  const shift = (d) => { buzz(); $style.set((style + d + STYLES.length) % STYLES.length); };
  const toggle = () => { buzz(12); playing ? stop() : start(); };
  const setFilt = (v) => { $filt.set(v); applyFilter(); };

  return html`<div class="flex flex-col items-center gap-6 pt-1">
    <!-- style selector -->
    <div class="w-full max-w-[440px] -mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div class="flex gap-2 w-max">
        ${STYLES.map((st, i) => { const on = i === style; return html`<button data-style=${st.id} aria-pressed=${on} onClick=${() => pickStyle(i)} key=${st.id} class=${`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? "border-secondary/60 bg-secondary/12 text-secondary" : "border-base-content/12 text-base-content/70"}`}>${T(t, st.key)}</button>`; })}
      </div>
    </div>

    <!-- step visualiser (read-only) -->
    <div data-viz class="w-full max-w-[440px] grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
      ${[...Array(N)].map((_, i) => { const beat = i % 4 === 0, k = s.kick[i], on = i === cur; return html`<div key=${i} class=${`h-8 rounded-md transition-colors ${on ? "bg-secondary" : k ? "bg-secondary/45" : beat ? "bg-base-content/20" : "bg-base-content/10"}`}></div>`; })}
    </div>

    <!-- transport -->
    <div class="flex items-center gap-5">
      <button aria-label=${T(t, "prevTrack")} onClick=${() => shift(-1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-back", "text-xl")}</button>
      <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${toggle} class="w-20 h-20 rounded-full bg-secondary text-secondary-content grid place-items-center shadow-xl active:scale-95 transition">${Icon(playing ? "lucide:square" : "lucide:play", "text-3xl")}</button>
      <button aria-label=${T(t, "nextTrack")} onClick=${() => shift(1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-forward", "text-xl")}</button>
    </div>
    <div class="-mt-3 font-mono text-xs uppercase tracking-[0.2em] text-base-content/55">${T(t, s.key)} · ${s.bpm} BPM</div>

    <!-- the one macro knob -->
    <div class="w-full max-w-[440px] flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/60 backdrop-blur px-4 py-3">
      ${Icon("lucide:filter", "text-base text-base-content/60 shrink-0")}
      <span class="text-sm font-medium w-24 shrink-0">${T(t, "fxFilter")}</span>
      <input data-filter type="range" min="0.05" max="1" step="0.01" value=${filt} aria-label=${T(t, "fxFilter")} onInput=${(e) => setFilt(Number(e.target.value))} class="range range-xs range-secondary flex-1" />
    </div>

    ${!audioSupported ? html`<div class="text-xs text-base-content/60">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
