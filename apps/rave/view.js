// Rave — a techno groove box, three ways over ONE shared pattern + engine (module scope, so playback and the
// pattern survive tab switches):
//   • Beat  — the simple player: pick a style, hit play, sweep one filter. (Selecting a style loads its groove
//             into the grid; the player just never shows the grid.)
//   • Pads  — the full 16-voice × 16-step matrix, editable, over the same pattern.
//   • Saved — name/save the current beat to IndexedDB, audition it, load it, delete with undo.
// Everything is SYNTHESISED (no samples). Crucially LIGHT: a hit is 1–3 nodes, there is no per-hit waveshaper
// and no convolution reverb (those, plus a 16-voice stack, are what starved the audio thread and made the old
// build stutter) — voices route straight through a single master lowpass, the one macro "Filter". Timing = a
// lookahead scheduler (Chris Wilson, "Two Clocks"). Refs: MDN Web Audio · /_rt/groove.js (bass riff).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { collection } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const N = 16, STEPS = [...Array(N).keys()];
const RIFF = [0, 0, 12, 0, 0, 7, 0, 3, 0, 0, 12, 0, 5, 0, 7, 0];   // per-step semitones for the bass voices

const TRACKS = [
  { id: "kick", name: "tKick", icon: "lucide:drum", on: "bg-amber-500" },
  { id: "hardkick", name: "tHardkick", icon: "lucide:swords", on: "bg-rose-600" },
  { id: "snare", name: "tSnare", icon: "lucide:disc-2", on: "bg-red-500" },
  { id: "clap", name: "tClap", icon: "lucide:hand", on: "bg-pink-500" },
  { id: "rim", name: "tRim", icon: "lucide:slash", on: "bg-orange-400" },
  { id: "hat", name: "tHat", icon: "lucide:hash", on: "bg-cyan-400" },
  { id: "ohat", name: "tOpenHat", icon: "lucide:circle-dot", on: "bg-sky-400" },
  { id: "ride", name: "tRide", icon: "lucide:disc-3", on: "bg-teal-400" },
  { id: "cowbell", name: "tCowbell", icon: "lucide:bell", on: "bg-yellow-400" },
  { id: "tom", name: "tTom", icon: "lucide:circle", on: "bg-fuchsia-500" },
  { id: "hoover", name: "tHoover", icon: "lucide:tornado", on: "bg-indigo-500" },
  { id: "stab", name: "tStab", icon: "lucide:layers", on: "bg-violet-500" },
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
  { id: "hardtechno", name: "pHardtechno", hardkick: "x.x.x.x.x.x.x.x.", clap: "....x.......x...", snare: "..x...x...x...x.", stab: "x...x...x...x...", acid: "xx.xxx.xxx.xxx.x", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x." },
  { id: "detroit", name: "pDetroit", kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", cowbell: "x..x..x..x..x...", stab: "..x.......x.....", acid: "x...x...x...x..." },
  { id: "gabber", name: "pGabber", hardkick: "xxxxxxxxxxxxxxxx", hoover: "x...x...x...x...", ohat: "..x...x...x...x.", clap: "....x.......x..." },
  { id: "breakbeat", name: "pBreakbeat", kick: "x.....x...x.....", snare: "....x.......x...", rim: "..x..x..x..x..x.", ride: "x.x.x.x.x.x.x.x." },
  { id: "psy", name: "pPsy", kick: "x...x...x...x...", sub: "x.xxx.xxx.xxx.xx", acid: ".xxx.xxx.xxx.xxx", ride: "..x...x...x...x." },
  { id: "tribal", name: "pTribal", kick: "x...x...x...x...", tom: "..x.x...x.x.....", cowbell: "x..x..x..x..x...", rim: "..x...x...x...x." },
  { id: "garage", name: "pGarage", kick: "x...x...x...x...", clap: "....x.......x...", ohat: "..x...x...x...x.", sub: "x..x..x...x.x...", hat: "x.x.x.x.x.x.x.x." },
  { id: "industrial", name: "pIndustrial", hardkick: "x...x...x...x...", snare: "..x...x...x...x.", ride: "xxxxxxxxxxxxxxxx", stab: "x.......x......." },
  { id: "schranz", name: "pSchranz", hardkick: "x...x...x...x...", rumble: "..x...x...x...x.", ohat: "x.x.x.x.x.x.x.x.", ride: "xxxxxxxxxxxxxxxx", reese: "x...x...x...x..." },
  { id: "hardcore", name: "pHardcore", hardkick: "x.x.x.x.x.x.x.x.", hoover: "x.......x.......", clap: "....x.......x...", reese: "x.x.x.x.x.x.x.x." },
  { id: "mentasm", name: "pMentasm", kick: "x...x...x...x...", hoover: "x...x.x.x...x.x.", reese: "x...x...x...x...", ohat: "..x...x...x...x." },
  { id: "rumbletech", name: "pRumbletech", hardkick: "x...x...x...x...", rumble: "x.x.x.x.x.x.x.x.", ohat: "..x...x...x...x.", reese: "x...x...x...x..." },
  { id: "acidcore", name: "pAcidcore", hardkick: "x...x...x...x...", acid: "xxxxxxxxxxxxxxxx", hoover: "x.......x.......", ohat: "..x...x...x...x." },
];
const parse = (p) => Object.fromEntries(TRACKS.map((tr) => [tr.id, P(p[tr.id] || "................")]));
const empty = () => Object.fromEntries(TRACKS.map((tr) => [tr.id, Array(N).fill(false)]));
// the Beat player's chips — a subset with a tempo each; each loads its preset into the shared pattern
const PLAYER = [["techno", 132], ["acid", 130], ["house", 124], ["minimal", 126], ["rave", 140], ["hardgroove", 138], ["dub", 120], ["electro", 128]];
const presetById = (id) => PRESETS.find((p) => p.id === id);
const presetName = (id) => (presetById(id) || {}).name;

// ---- shared state (atoms survive tab switches) ----
const $tracks = atom(parse(presetById("techno"))), $bpm = atom(132), $filt = atom(0.82), $riff = atom(RIFF);
const $playing = atom(false), $cur = atom(-1), $style = atom(0);
const SAVES = collection("ravePatterns");

// ---- lean engine (module scope) ----
let eng = null, mf = null, sched = null, raf = null, nextT = 0, stepN = 0, q = [];
const filtHz = (v) => 200 * Math.pow(90, Math.max(0, Math.min(1, v)));
function ensure() {
  if (!audioSupported) return null;
  if (!eng) { eng = createEngine({ master: 0.9, noise: true }); if (!eng) return null; mf = eng.ctx.createBiquadFilter(); mf.type = "lowpass"; mf.Q.value = 1.1; mf.frequency.value = filtHz($filt.get()); mf.connect(eng.master); }
  eng.resume(); return eng;
}
const applyFilter = () => { if (mf) try { mf.frequency.setTargetAtTime(filtHz($filt.get()), eng.ctx.currentTime, 0.03); } catch { mf.frequency.value = filtHz($filt.get()); } };

// ---- voices (all light: 1–3 nodes, self-freeing, straight into the master filter) ----
const env = (g, t, peak, dur, a = 0.004) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
const oscAt = (c, type, f, t) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; };
function drum(c, t, { f0, f1, pf, peak, dur, type = "sine" }) { const o = oscAt(c, type, f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + pf); const g = c.createGain(); env(g, t, peak, dur); o.connect(g); g.connect(mf); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } }; }
function nz(c, t, buf, { type, freq, q: Q, peak, dur, bursts = 1 }) { const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q != null) f.Q.value = Q; const g = c.createGain(); if (bursts > 1) { let tt = t; for (let i = 0; i < bursts; i++) { g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(peak, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05); tt += 0.02; } } else env(g, t, peak, dur); s.connect(f); f.connect(g); g.connect(mf); s.start(t); s.stop(t + dur + bursts * 0.02 + 0.02); s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* */ } }; }
function saws(c, t, freqs, { peak, dur, lp }) { const g = c.createGain(); env(g, t, peak, dur, 0.008); let out = g; let flt = null; if (lp) { flt = c.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.setValueAtTime(lp * 3, t); flt.frequency.exponentialRampToValueAtTime(lp, t + dur * 0.6); flt.Q.value = 6; g.connect(flt); out = flt; } out.connect(mf); const os = freqs.map((fr) => { const o = oscAt(c, "sawtooth", fr, t); o.connect(g); o.start(t); o.stop(t + dur + 0.02); return o; }); os[0].onended = () => { for (const o of os) { try { o.disconnect(); } catch { /* */ } } try { g.disconnect(); flt && flt.disconnect(); } catch { /* */ } }; }
const VOICES = {
  kick: (c, t) => drum(c, t, { f0: 130, f1: 48, pf: 0.11, peak: 0.9, dur: 0.32 }),
  hardkick: (c, t) => drum(c, t, { f0: 175, f1: 40, pf: 0.06, peak: 1.0, dur: 0.22 }),
  snare: (c, t, o) => { drum(c, t, { f0: 190, f1: 150, pf: 0.05, peak: 0.35, dur: 0.12, type: "triangle" }); nz(c, t, o.b.white, { type: "bandpass", freq: 1900, q: 1, peak: 0.5, dur: 0.16 }); },
  clap: (c, t, o) => nz(c, t, o.b.white, { type: "bandpass", freq: 1600, q: 1.4, peak: 0.5, dur: 0.12, bursts: 3 }),
  rim: (c, t, o) => nz(c, t, o.b.white, { type: "bandpass", freq: 2400, q: 3, peak: 0.5, dur: 0.05 }),
  hat: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 8500, peak: 0.32, dur: 0.045 }),
  ohat: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 7000, peak: 0.28, dur: 0.18 }),
  ride: (c, t, o) => nz(c, t, o.b.white, { type: "highpass", freq: 9500, peak: 0.22, dur: 0.35 }),
  cowbell: (c, t) => { [587, 845].forEach((f) => { const o = oscAt(c, "square", f, t); const g = c.createGain(); env(g, t, 0.16, 0.12); const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; o.connect(bp); bp.connect(g); g.connect(mf); o.start(t); o.stop(t + 0.14); o.onended = () => { try { o.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* */ } }; }); },
  tom: (c, t) => drum(c, t, { f0: 200, f1: 95, pf: 0.18, peak: 0.7, dur: 0.22 }),
  hoover: (c, t, o) => { const f = o.note(48); saws(c, t, [f * 0.99, f, f * 1.01], { peak: 0.2, dur: 0.3, lp: 1200 }); },
  stab: (c, t, o) => { const f = o.note(48); saws(c, t, [f, f * 2 ** (7 / 12), f * 2], { peak: 0.18, dur: 0.18 }); },
  acid: (c, t, o) => saws(c, t, [o.note(36)], { peak: 0.5, dur: o.spb * 0.95 }),
  reese: (c, t, o) => { const f = o.note(24); saws(c, t, [f * 0.99, f * 1.01], { peak: 0.4, dur: o.spb * 0.95, lp: 400 }); },
  sub: (c, t, o) => drum(c, t, { f0: o.note(24), f1: o.note(24), pf: 0.01, peak: 0.6, dur: o.spb * 0.9, type: "sine" }),
  rumble: (c, t, o) => nz(c, t, o.b.brown, { type: "lowpass", freq: 90, peak: 0.5, dur: o.spb * 0.95 }),
};

function fire(step, time) {
  const e = eng, tr = $tracks.get(), c = e.ctx, spb = 60 / $bpm.get() / 4, riff = $riff.get();
  const o = { b: e.buffers, spb, note: (m) => midiToFreq(m + riff[step]) };
  for (const T2 of TRACKS) if (tr[T2.id][step]) VOICES[T2.id](c, time, o);
  q.push({ time, step });
}
const tick = () => { const e = eng; if (!e) return; const spb = 60 / $bpm.get() / 4; if (nextT < e.ctx.currentTime) nextT = e.ctx.currentTime; while (nextT < e.ctx.currentTime + 0.1) { fire(stepN, nextT); nextT += spb; stepN = (stepN + 1) % N; } };
const draw = () => { const e = eng; if (e) { const now = e.ctx.currentTime; while (q.length && q[0].time <= now) $cur.set(q.shift().step); } raf = requestAnimationFrame(draw); };
function start() { const e = ensure(); $playing.set(true); if (!e) return; if (sched) clearInterval(sched); if (raf) cancelAnimationFrame(raf); q = []; nextT = e.ctx.currentTime + 0.06; stepN = 0; sched = setInterval(tick, 25); raf = requestAnimationFrame(draw); }
function stop() { $playing.set(false); if (sched) { clearInterval(sched); sched = null; } if (raf) { cancelAnimationFrame(raf); raf = null; } $cur.set(-1); }
const toggle = () => { buzz(12); $playing.get() ? stop() : start(); };
const setFilt = (v) => { $filt.set(v); applyFilter(); };

// ---- saves ----
const beatSig = (r) => JSON.stringify([r.tracks, r.bpm, r.riff]);   // filter is a live macro → excluded, like the old build
const beatBars = (tracks) => STEPS.map((s) => TRACKS.reduce((n, tr) => n + (tracks?.[tr.id]?.[s] ? 1 : 0), 0));
const autoName = (t, tracks, bpm, list) => { const key = JSON.stringify(tracks); const pre = PRESETS.find((p) => JSON.stringify(parse(p)) === key); const base = (pre ? T(t, pre.name) : T(t, "beatWord")) + " · " + bpm; let n = base, i = 2; while (list.some((it) => it.name === n)) n = `${base} (${i++})`; return n; };

// ================= Beat: the simple player =================
export function rave({ S }) {
  const t = useStore(S.t), tracks = useStore($tracks), style = useStore($style), playing = useStore($playing), filt = useStore($filt), cur = useStore($cur), bpm = useStore($bpm);
  const pick = (i) => { buzz(); ensure(); const [id, b] = PLAYER[i]; $style.set(i); $tracks.set(parse(presetById(id))); $bpm.set(b); };
  const shift = (d) => pick(($style.get() + d + PLAYER.length) % PLAYER.length);
  const kickRow = tracks.kick;

  return html`<div class="flex flex-col items-center gap-6 pt-1">
    <div class="w-full max-w-[440px] -mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div class="flex gap-2 w-max">
        ${PLAYER.map(([id], i) => { const on = i === style; return html`<button data-style=${id} aria-pressed=${on} onClick=${() => pick(i)} key=${id} class=${`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? "border-secondary/60 bg-secondary/12 text-secondary" : "border-base-content/12 text-base-content/70"}`}>${T(t, presetName(id))}</button>`; })}
      </div>
    </div>

    <div data-viz class="w-full max-w-[440px] grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
      ${STEPS.map((i) => { const beat = i % 4 === 0, k = kickRow[i], on = i === cur; return html`<div key=${i} class=${`h-8 rounded-md transition-colors ${on ? "bg-secondary" : k ? "bg-secondary/45" : beat ? "bg-base-content/20" : "bg-base-content/10"}`}></div>`; })}
    </div>

    <div class="flex items-center gap-5">
      <button aria-label=${T(t, "prevTrack")} onClick=${() => shift(-1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-back", "text-xl")}</button>
      <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${toggle} class="w-20 h-20 rounded-full bg-secondary text-secondary-content grid place-items-center shadow-xl active:scale-95 transition">${Icon(playing ? "lucide:square" : "lucide:play", "text-3xl")}</button>
      <button aria-label=${T(t, "nextTrack")} onClick=${() => shift(1)} class="btn btn-circle btn-ghost btn-sm">${Icon("lucide:skip-forward", "text-xl")}</button>
    </div>
    <div class="-mt-3 font-mono text-xs uppercase tracking-[0.2em] text-base-content/55">${T(t, presetName(PLAYER[style][0]))} · ${bpm} BPM</div>

    <div class="w-full max-w-[440px] flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/60 backdrop-blur px-4 py-3">
      ${Icon("lucide:filter", "text-base text-base-content/60 shrink-0")}
      <span class="text-sm font-medium w-24 shrink-0">${T(t, "fxFilter")}</span>
      <input data-filter type="range" min="0.05" max="1" step="0.01" value=${filt} aria-label=${T(t, "fxFilter")} onInput=${(e) => setFilt(Number(e.target.value))} class="range range-xs range-secondary flex-1" />
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/60">${T(t, "noAudio")}</div>` : null}
  </div>`;
}

// ================= Pads: the 16-voice matrix =================
export function ravePads({ S, toast }) {
  const t = useStore(S.t), tracks = useStore($tracks), bpm = useStore($bpm), filt = useStore($filt), playing = useStore($playing), cur = useStore($cur);
  const cellToggle = (tid, s) => { ensure(); $tracks.set({ ...tracks, [tid]: tracks[tid].map((v, i) => (i === s ? !v : v)) }); };
  const save = async () => { try { const list = await SAVES.all(); const rec = { tracks, bpm, riff: $riff.get() }; if (list.find((it) => beatSig(it) === beatSig(rec))) { buzz(); toast?.(T(t, "toastDup", { name: autoName(t, tracks, bpm, list) })); return; } await SAVES.put("p" + Date.now(), { name: autoName(t, tracks, bpm, list), ...rec, filt }); toast?.(T(t, "toastSaved")); } catch { /* */ } };

  return html`<${Fragment}>
    <div class="pb-40 flex flex-col gap-1">
      <!-- tempo + filter -->
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <div class="flex flex-col gap-0.5 min-w-0"><div class="flex items-center justify-between text-[0.6rem] uppercase tracking-wide text-base-content/60"><span>${T(t, "tempo")}</span><span class="font-semibold tabular-nums">${bpm}</span></div><input type="range" min="90" max="150" value=${bpm} class="range range-xs range-primary" aria-label=${T(t, "tempo")} onInput=${(e) => $bpm.set(Number(e.target.value))} /></div>
        <div class="flex flex-col gap-0.5 min-w-0"><div class="flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-base-content/60">${Icon("lucide:filter", "text-[0.85em]")}<span>${T(t, "fxFilter")}</span></div><input data-filter type="range" min="0.05" max="1" step="0.01" value=${filt} class="range range-xs range-secondary" aria-label=${T(t, "fxFilter")} onInput=${(e) => setFilt(Number(e.target.value))} /></div>
      </div>
      <!-- step ruler (sticky under the header) -->
      <div class="sticky z-10 -mx-4 px-4 bg-base-200/85 backdrop-blur flex items-center gap-[3px] py-1" style="top:calc(3.5rem + env(safe-area-inset-top))">
        <div class="w-7 shrink-0"></div>
        ${STEPS.map((s) => html`<div class=${`flex-1 h-1 rounded-full transition-colors ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${s === cur ? "bg-secondary" : "bg-base-300"}`} key=${s}></div>`)}
      </div>
      ${TRACKS.map((tr) => { const live = tracks[tr.id].some(Boolean); return html`<div class="flex items-center gap-[3px]" key=${tr.id}>
        <div class=${`w-7 shrink-0 flex items-center justify-center ${live ? "text-base-content" : "text-base-content/40"}`} title=${T(t, tr.name)}>${Icon(tr.icon, "text-base")}</div>
        ${STEPS.map((s) => { const on = tracks[tr.id][s]; return html`<button data-cell=${`${tr.id}-${s}`} aria-pressed=${on} aria-label=${`${T(t, tr.name)} ${s + 1}`} onClick=${() => cellToggle(tr.id, s)} key=${s}
          class=${`flex-1 min-w-0 h-8 rounded touch-manipulation transition-all duration-150 ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${on ? tr.on : live ? "bg-base-300" : "bg-base-300/25"} ${s === cur ? "ring-2 ring-base-content/50" : ""}`}></button>`; })}
      </div>`; })}
    </div>

    <!-- floating transport island -->
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)">
      <div class="pointer-events-auto w-full max-w-xl flex items-center gap-2 rounded-[1.35rem] border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-3 py-2">
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} class=${`btn btn-circle shadow-lg shrink-0 ${playing ? "btn-secondary" : "btn-primary"}`} onClick=${toggle}>${Icon(playing ? "lucide:square" : "lucide:play", "text-xl")}</button>
        <span class="flex-1 min-w-0 font-mono text-xs tabular-nums text-base-content/70 truncate">${bpm} BPM</span>
        <button data-clear aria-label=${T(t, "clear")} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); $tracks.set(empty()); }}>${Icon("lucide:eraser", "text-lg")}</button>
        <button id="save" data-save aria-label=${T(t, "aSave")} class="btn btn-circle btn-outline btn-sm shrink-0" onClick=${save}>${Icon("lucide:save", "text-lg")}</button>
      </div>
    </div>
  </${Fragment}>`;
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
  const loadBeat = (it) => { $tracks.set({ ...empty(), ...(it.tracks || {}) }); $bpm.set(it.bpm || 130); $riff.set(it.riff?.length === N ? it.riff : RIFF); if (it.filt != null) setFilt(it.filt); };
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
