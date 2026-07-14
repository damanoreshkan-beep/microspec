// Rave — a techno generator: a 16-step drum machine + acid bassline, everything SYNTHESISED (no samples)
// via Web Audio. 909-style kick (pitch-enveloped sine), metallic hats (6 square waves → highpass), clap
// (multi-burst noise), and a 303 acid bass (saw → resonant lowpass with a filter envelope). Timing uses
// the lookahead scheduler (setInterval picks notes ~0.1s ahead on the audio clock → rock-solid; the visual
// playhead follows via a queue + rAF). Refs: MDN Advanced techniques · Chris Wilson "A Tale of Two Clocks".
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const N = 16, STEPS = [...Array(N).keys()];
const ROOT = 36;                                                    // C2 — the acid bass root
const RIFF = [0, 0, 12, 0, 0, 0, 3, 0, 0, 7, 0, 0, 10, 0, 5, 0];    // per-step semitone offsets → an instant acid line

const TRACKS = [
  { id: "kick", name: "tKick", icon: "lucide:drum", on: "bg-amber-500" },
  { id: "clap", name: "tClap", icon: "lucide:hand", on: "bg-pink-500" },
  { id: "hat", name: "tHat", icon: "lucide:hash", on: "bg-cyan-400" },
  { id: "ohat", name: "tOpenHat", icon: "lucide:circle-dot", on: "bg-sky-400" },
  { id: "acid", name: "tBass", icon: "lucide:zap", on: "bg-lime-400" },
];
const P = (s) => [...s].map((c) => c === "x");
const PRESETS = [
  { id: "techno", name: "pTechno", kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", ohat: "................", acid: "x...x...x...x..." },
  { id: "acid", name: "pAcid", kick: "x...x...x...x...", clap: "....x.......x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", acid: "x.xxx.x.x.xxx.x." },
  { id: "minimal", name: "pMinimal", kick: "x...x...x...x...", clap: "........x.......", hat: "..x...x...x...x.", ohat: "................", acid: "x.......x......." },
  { id: "rave", name: "pRave", kick: "x...x...x.x.x...", clap: "....x...x...x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", acid: "x.x.x.x.x.x.x.x." },
];
const parse = (p) => Object.fromEntries(TRACKS.map((tr) => [tr.id, P(p[tr.id])]));
const empty = () => Object.fromEntries(TRACKS.map((tr) => [tr.id, Array(N).fill(false)]));
const random = () => ({ kick: STEPS.map((i) => i % 4 === 0), clap: STEPS.map((i) => i % 8 === 4 || Math.random() < 0.1), hat: STEPS.map(() => Math.random() < 0.55), ohat: STEPS.map((i) => i % 2 === 1 && Math.random() < 0.4), acid: STEPS.map(() => Math.random() < 0.45) });

// ---- drum/synth voices (generated) ----
const KICK = (ctx, out, t) => {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
  g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
  const c = ctx.createOscillator(), cg = ctx.createGain(); c.type = "triangle"; c.frequency.value = 1000;
  cg.gain.setValueAtTime(0.5, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  c.connect(cg); cg.connect(out); c.start(t); c.stop(t + 0.02);
};
const HAT = (ctx, out, t, open) => {
  const dur = open ? 0.32 : 0.055;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
  const g = ctx.createGain(); bp.connect(hp); hp.connect(g); g.connect(out);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 40 * r; o.connect(bp); o.start(t); o.stop(t + dur + 0.02); }
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
};
const CLAP = (ctx, out, buf, t) => {
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 1.3;
  const g = ctx.createGain(); bp.connect(g); g.connect(out);
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(bp); s.start(t); s.stop(t + 0.22);
  g.gain.setValueAtTime(0.0001, t);
  for (const off of [0, 0.012, 0.024]) { g.gain.setValueAtTime(0.7, t + off); g.gain.exponentialRampToValueAtTime(0.06, t + off + 0.011); }
  g.gain.setValueAtTime(0.7, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
};
const ACID = (ctx, out, t, freq, cutoff) => {
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 13;
  lp.frequency.setValueAtTime(Math.min(cutoff * 6, 13000), t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
};

export function rave({ S }) {
  const t = useStore(S.t);
  const [tracks, setTracks] = useState(() => parse(PRESETS[0]));
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(130);
  const [cutoff, setCutoff] = useState(1200);
  const [cur, setCur] = useState(-1);
  const eng = useRef(null), sched = useRef(null), raf = useRef(null), nextT = useRef(0), stepN = useRef(0), q = useRef([]);
  const tRef = useRef(tracks), bRef = useRef(bpm), cRef = useRef(cutoff);
  useEffect(() => { tRef.current = tracks; }, [tracks]);
  useEffect(() => { bRef.current = bpm; }, [bpm]);
  useEffect(() => { cRef.current = cutoff; }, [cutoff]);

  const ensure = () => { if (!audioSupported) return null; if (!eng.current) eng.current = createEngine({ master: 0.6 }); eng.current.resume(); return eng.current; };

  const fire = (s, time) => {
    const e = eng.current; if (!e) return; const ctx = e.ctx, out = e.master, Tr = tRef.current;
    if (Tr.kick[s]) KICK(ctx, out, time);
    if (Tr.clap[s]) CLAP(ctx, out, e.buffers.white, time);
    if (Tr.hat[s]) HAT(ctx, out, time, false);
    if (Tr.ohat[s]) HAT(ctx, out, time, true);
    if (Tr.acid[s]) ACID(ctx, out, time, midiToFreq(ROOT + RIFF[s]), cRef.current);
    q.current.push({ s, time });
  };
  const tick = () => { const e = eng.current; if (!e) return; const spb = 60 / bRef.current / 4; while (nextT.current < e.ctx.currentTime + 0.1) { fire(stepN.current, nextT.current); nextT.current += spb; stepN.current = (stepN.current + 1) % N; } };
  const draw = () => { const e = eng.current; if (e) { const now = e.ctx.currentTime; while (q.current.length && q.current[0].time <= now) setCur(q.current.shift().s); } raf.current = requestAnimationFrame(draw); };
  const start = () => { const e = ensure(); setPlaying(true); if (!e) return; nextT.current = e.ctx.currentTime + 0.06; stepN.current = 0; sched.current = setInterval(tick, 25); raf.current = requestAnimationFrame(draw); };
  const stop = () => { if (sched.current) clearInterval(sched.current); if (raf.current) cancelAnimationFrame(raf.current); sched.current = null; raf.current = null; q.current = []; setPlaying(false); setCur(-1); };

  useEffect(() => () => { if (sched.current) clearInterval(sched.current); if (raf.current) cancelAnimationFrame(raf.current); if (eng.current) eng.current.close(); }, []);

  const cellToggle = (tid, s) => { ensure(); setTracks((Tr) => ({ ...Tr, [tid]: Tr[tid].map((v, i) => (i === s ? !v : v)) })); };

  return html`<div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <button id="play" aria-label=${playing ? T(t, "aStop") : T(t, "aPlay")} class=${`btn btn-circle btn-lg shadow-lg ${playing ? "btn-secondary" : "btn-primary"}`} onClick=${() => (playing ? stop() : start())}>${Icon(playing ? "lucide:square" : "lucide:play", "text-2xl")}</button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between text-xs mb-0.5"><span class="font-semibold tabular-nums">${bpm} BPM</span><span class="flex items-center gap-1 text-base-content/70">${Icon("lucide:filter")}${Math.round(cutoff)}</span></div>
        <input type="range" min="90" max="150" value=${bpm} class="range range-xs range-primary" aria-label=${T(t, "tempo")} onInput=${(e) => setBpm(Number(e.target.value))} />
        <input type="range" min="200" max="5000" step="20" value=${cutoff} class="range range-xs range-accent mt-1" aria-label=${T(t, "filter")} onInput=${(e) => setCutoff(Number(e.target.value))} />
      </div>
    </div>

    <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      ${PRESETS.map((p) => html`<button data-preset=${p.id} class="btn btn-xs btn-outline shrink-0" onClick=${() => { ensure(); setTracks(parse(p)); }} key=${p.id}>${T(t, p.name)}</button>`)}
      <button data-preset="random" class="btn btn-xs btn-outline shrink-0 gap-1" onClick=${() => { ensure(); setTracks(random()); }}>${Icon("lucide:dices")}${T(t, "rand")}</button>
      <button data-preset="clear" class="btn btn-xs btn-ghost shrink-0 gap-1" onClick=${() => setTracks(empty())}>${Icon("lucide:eraser")}${T(t, "clear")}</button>
    </div>

    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-[3px]">
        <div class="w-7 shrink-0"></div>
        ${STEPS.map((s) => html`<div class=${`flex-1 h-1 rounded-full ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${s === cur ? "bg-primary" : "bg-base-300"}`} key=${s}></div>`)}
      </div>
      ${TRACKS.map((tr) => html`<div class="flex items-center gap-[3px]" key=${tr.id}>
        <div class=${`w-7 shrink-0 flex items-center justify-center ${tracks[tr.id].some(Boolean) ? "text-base-content" : "text-base-content/40"}`}>${Icon(tr.icon, "text-lg")}</div>
        ${STEPS.map((s) => { const on = tracks[tr.id][s]; return html`<button data-cell=${`${tr.id}-${s}`} aria-pressed=${on} aria-label=${`${T(t, tr.name)} ${s + 1}`}
          class=${`flex-1 min-w-0 aspect-square rounded-sm touch-manipulation transition-colors ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${on ? tr.on : "bg-base-300"} ${s === cur ? "ring-2 ring-base-content/40" : ""}`}
          onClick=${() => cellToggle(tr.id, s)} key=${s}></button>`; })}
      </div>`)}
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
