// Rave — a techno generator: a 16-step, 12-voice drum machine + acid/sub bass, all SYNTHESISED (no samples)
// via Web Audio, running through an FX rack (drive → dry/delay/reverb sends → master filter → compressor).
// Timing = the lookahead scheduler (setInterval picks notes ~0.1s ahead on the audio clock; swing shifts odd
// 16ths; the playhead follows via a queue + rAF). The working pattern + FX live in nanostore atoms (survive
// tab switches) and autosave to IndexedDB (/_rt/db.js); a "Saved" tab lists named saves. Refs: MDN Advanced
// techniques · Chris Wilson "A Tale of Two Clocks".
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { collection } from "/_rt/db.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const N = 16, STEPS = [...Array(N).keys()];
const ROOT = 36;                                                    // C2 — the acid bass root
const RIFF = [0, 0, 12, 0, 0, 0, 3, 0, 0, 7, 0, 0, 10, 0, 5, 0];    // per-step semitone offsets → an instant acid line

const TRACKS = [
  { id: "kick", name: "tKick", icon: "lucide:drum", on: "bg-amber-500" },
  { id: "snare", name: "tSnare", icon: "lucide:disc-2", on: "bg-red-500" },
  { id: "clap", name: "tClap", icon: "lucide:hand", on: "bg-pink-500" },
  { id: "rim", name: "tRim", icon: "lucide:slash", on: "bg-orange-400" },
  { id: "hat", name: "tHat", icon: "lucide:hash", on: "bg-cyan-400" },
  { id: "ohat", name: "tOpenHat", icon: "lucide:circle-dot", on: "bg-sky-400" },
  { id: "ride", name: "tRide", icon: "lucide:disc-3", on: "bg-teal-400" },
  { id: "cowbell", name: "tCowbell", icon: "lucide:bell", on: "bg-yellow-400" },
  { id: "tom", name: "tTom", icon: "lucide:circle", on: "bg-fuchsia-500" },
  { id: "stab", name: "tStab", icon: "lucide:layers", on: "bg-violet-500" },
  { id: "acid", name: "tBass", icon: "lucide:zap", on: "bg-lime-400" },
  { id: "sub", name: "tSub", icon: "lucide:waves", on: "bg-emerald-500" },
];
const P = (s) => [...s].map((c) => c === "x");
const PRESETS = [
  { id: "techno", name: "pTechno", kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", acid: "x...x...x...x...", sub: "x...x...x...x..." },
  { id: "acid", name: "pAcid", kick: "x...x...x...x...", clap: "....x.......x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", acid: "x.xxx.x.x.xxx.x.", sub: "x...x...x...x..." },
  { id: "minimal", name: "pMinimal", kick: "x...x...x...x...", clap: "........x.......", hat: "..x...x...x...x.", sub: "x.......x......." },
  { id: "rave", name: "pRave", kick: "x...x...x.x.x...", clap: "....x...x...x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", stab: "x.......x.......", acid: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "hardgroove", name: "pHardgroove", kick: "x...x...x...x...", snare: "....x.......x...", tom: "......x.......x.", cowbell: "..x...x...x...x.", hat: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "trance", name: "pTrance", kick: "x...x...x...x...", ohat: "..x...x...x...x.", stab: "x...x...x...x...", clap: "....x.......x...", sub: ".x.x.x.x.x.x.x.x" },
  { id: "dub", name: "pDub", kick: "x.......x.......", stab: "....x.......x...", sub: "x...x...x...x...", hat: "..x...x...x...x.", clap: "............x..." },
  { id: "hardtechno", name: "pHardtechno", kick: "x.x.x.x.x.x.x.x.", clap: "....x.......x...", snare: "..x...x...x...x.", stab: "x...x...x...x...", acid: "xx.xxx.xxx.xxx.x", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x." },
  { id: "detroit", name: "pDetroit", kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", cowbell: "x..x..x..x..x...", stab: "..x.......x.....", acid: "x...x...x...x..." },
  { id: "electro", name: "pElectro", kick: "x..x..x...x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", cowbell: "..x...x...x...x.", sub: "x..x..x...x.x..." },
  { id: "house", name: "pHouse", kick: "x...x...x...x...", clap: "....x.......x...", ohat: "..x...x...x...x.", rim: "x.x.x.x.x.x.x.x.", sub: "x...x...x...x..." },
  { id: "gabber", name: "pGabber", kick: "xxxxxxxxxxxxxxxx", stab: "x...x...x...x...", ohat: "..x...x...x...x.", clap: "....x.......x..." },
  { id: "breakbeat", name: "pBreakbeat", kick: "x.....x...x.....", snare: "....x.......x...", rim: "..x..x..x..x..x.", ride: "x.x.x.x.x.x.x.x." },
  { id: "psy", name: "pPsy", kick: "x...x...x...x...", sub: "x.xxx.xxx.xxx.xx", acid: ".xxx.xxx.xxx.xxx", ride: "..x...x...x...x." },
  { id: "tribal", name: "pTribal", kick: "x...x...x...x...", tom: "..x.x...x.x.....", cowbell: "x..x..x..x..x...", rim: "..x...x...x...x." },
  { id: "garage", name: "pGarage", kick: "x...x...x...x...", clap: "....x.......x...", ohat: "..x...x...x...x.", sub: "x..x..x...x.x...", hat: "x.x.x.x.x.x.x.x." },
  { id: "industrial", name: "pIndustrial", kick: "x...x...x...x...", snare: "..x...x...x...x.", ride: "xxxxxxxxxxxxxxxx", stab: "x.......x......." },
  { id: "downtempo", name: "pDowntempo", kick: "x.......x.......", snare: "....x.......x...", ride: "..x...x...x...x.", stab: "x...............", sub: "x.......x......." },
];
const parse = (p) => Object.fromEntries(TRACKS.map((tr) => [tr.id, P(p[tr.id] || "................")]));
const empty = () => Object.fromEntries(TRACKS.map((tr) => [tr.id, Array(N).fill(false)]));
const random = () => ({
  kick: STEPS.map((i) => i % 4 === 0), snare: STEPS.map((i) => i % 8 === 4), clap: STEPS.map((i) => i % 8 === 4 && Math.random() < 0.5),
  rim: STEPS.map(() => Math.random() < 0.2), hat: STEPS.map(() => Math.random() < 0.55), ohat: STEPS.map((i) => i % 2 === 1 && Math.random() < 0.4),
  ride: STEPS.map(() => Math.random() < 0.15), cowbell: STEPS.map(() => Math.random() < 0.16), tom: STEPS.map(() => Math.random() < 0.12),
  stab: STEPS.map((i) => i % 4 === 0 && Math.random() < 0.5), acid: STEPS.map(() => Math.random() < 0.4), sub: STEPS.map((i) => i % 4 === 0),
});

const FX = [
  { id: "squelch", icon: "lucide:activity", label: "fxSquelch", min: 200, max: 5000, step: 20 },
  { id: "drive", icon: "lucide:flame", label: "fxDrive", min: 0, max: 1, step: 0.02 },
  { id: "delay", icon: "lucide:repeat-2", label: "fxDelay", min: 0, max: 0.8, step: 0.02 },
  { id: "reverb", icon: "lucide:cloudy", label: "fxReverb", min: 0, max: 0.9, step: 0.02 },
  { id: "mfilter", icon: "lucide:filter", label: "fxFilter", min: 0, max: 1, step: 0.02 },
  { id: "swing", icon: "lucide:wind", label: "fxSwing", min: 0, max: 0.6, step: 0.02 },
];
const DFX = { squelch: 1200, drive: 0, delay: 0, reverb: 0, mfilter: 1, swing: 0 };

// ---- synth voices (generated) ----
const KICK = (ctx, out, t) => {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
  g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
  const c = ctx.createOscillator(), cg = ctx.createGain(); c.type = "triangle"; c.frequency.value = 1000;
  cg.gain.setValueAtTime(0.5, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  c.connect(cg); cg.connect(out); c.start(t); c.stop(t + 0.02);
};
const metallic = (ctx, out, t, { bp, hp, dur, gain, q = 0.8 }) => {
  const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = bp; b.Q.value = q;
  const h = ctx.createBiquadFilter(); h.type = "highpass"; h.frequency.value = hp;
  const g = ctx.createGain(); b.connect(h); h.connect(g); g.connect(out);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 40 * r; o.connect(b); o.start(t); o.stop(t + dur + 0.02); }
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
};
const HAT = (ctx, out, t, open) => metallic(ctx, out, t, { bp: 10000, hp: 7000, dur: open ? 0.32 : 0.055, gain: 0.32 });
const RIDE = (ctx, out, t) => metallic(ctx, out, t, { bp: 8000, hp: 5000, dur: 0.8, gain: 0.2, q: 0.6 });
const noiseBurst = (ctx, out, buf, t, { type, freq, dur, gain, q }) => {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q;
  const g = ctx.createGain(); f.connect(g); g.connect(out);
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(f); s.start(t); s.stop(t + dur + 0.02);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
};
const CLAP = (ctx, out, buf, t) => {
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 1.3;
  const g = ctx.createGain(); bp.connect(g); g.connect(out);
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(bp); s.start(t); s.stop(t + 0.22);
  g.gain.setValueAtTime(0.0001, t);
  for (const off of [0, 0.012, 0.024]) { g.gain.setValueAtTime(0.7, t + off); g.gain.exponentialRampToValueAtTime(0.06, t + off + 0.011); }
  g.gain.setValueAtTime(0.7, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
};
const SNARE = (ctx, out, buf, t) => {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.1);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.13);
  noiseBurst(ctx, out, buf, t, { type: "highpass", freq: 1500, dur: 0.18, gain: 0.5 });
};
const RIM = (ctx, out, buf, t) => {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 440;
  const og = ctx.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.04);
  noiseBurst(ctx, out, buf, t, { type: "highpass", freq: 3000, dur: 0.03, gain: 0.4 });
};
const COWBELL = (ctx, out, t) => {
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2640; bp.Q.value = 1;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  bp.connect(g); g.connect(out);
  for (const f of [540, 800]) { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.27); }
};
const TOM = (ctx, out, t) => {
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
};
const STAB = (ctx, out, t, cutoff) => {
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
  lp.frequency.setValueAtTime(Math.min(cutoff * 4, 9000), t); lp.frequency.exponentialRampToValueAtTime(Math.max(cutoff, 600), t + 0.18);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.26, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  lp.connect(g); g.connect(out);
  for (const n of [0, 3, 7, 12]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = midiToFreq(ROOT + 24 + n); o.connect(lp); o.start(t); o.stop(t + 0.34); }
};
const ACID = (ctx, out, t, freq, cutoff) => {
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 13;
  lp.frequency.setValueAtTime(Math.min(cutoff * 6, 13000), t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
};
const SUB = (ctx, out, t, freq) => {
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
};

// ---- FX helpers ----
function driveCurve(amount) { const k = amount * amount * 80, n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
function makeIR(ctx, seconds = 1.8, decay = 3) { const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return buf; }

// ---- shared state (atoms survive tab switches) + autosave to IndexedDB ----
const SAVES = collection("ravePatterns"), CUR = collection("raveCurrent");
const $tracks = atom(parse(PRESETS[0])), $bpm = atom(130), $fx = atom({ ...DFX });
(async () => { try { const s = await CUR.get("state"); if (s && s.tracks) { $tracks.set(s.tracks); if (s.bpm) $bpm.set(s.bpm); if (s.fx) $fx.set({ ...DFX, ...s.fx }); } } catch { /* no idb → defaults */ } })();

export function rave({ S, toast }) {
  const t = useStore(S.t);
  const tracks = useStore($tracks), bpm = useStore($bpm), fx = useStore($fx);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const eng = useRef(null), sched = useRef(null), raf = useRef(null), nextT = useRef(0), stepN = useRef(0), q = useRef([]);

  const applyFx = (e) => { const f = $fx.get(); e.bus.curve = driveCurve(f.drive); e.fx.dsend.gain.value = f.delay; e.fx.rsend.gain.value = f.reverb; e.fx.mf.frequency.value = 200 * Math.pow(90, f.mfilter); e.fx.delay.delayTime.value = 3 * (60 / $bpm.get() / 4); };
  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) {
      const e = createEngine({ master: 0.9 }), ctx = e.ctx;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12; comp.connect(e.master);
      const mf = ctx.createBiquadFilter(); mf.type = "lowpass"; mf.frequency.value = 18000; mf.connect(comp);
      const sum = ctx.createGain(); sum.connect(mf);
      const drive = ctx.createWaveShaper(); drive.oversample = "2x"; drive.curve = driveCurve(0);
      const dry = ctx.createGain(); drive.connect(dry); dry.connect(sum);
      const dsend = ctx.createGain(); dsend.gain.value = 0; const delay = ctx.createDelay(1.5); delay.delayTime.value = 3 * (60 / 130 / 4);
      const dfb = ctx.createGain(); dfb.gain.value = 0.36; const df = ctx.createBiquadFilter(); df.type = "lowpass"; df.frequency.value = 2200;
      drive.connect(dsend); dsend.connect(delay); delay.connect(df); df.connect(dfb); dfb.connect(delay); df.connect(sum);
      const rsend = ctx.createGain(); rsend.gain.value = 0; const rev = ctx.createConvolver(); rev.buffer = makeIR(ctx);
      drive.connect(rsend); rsend.connect(rev); rev.connect(sum);
      e.bus = drive; e.fx = { drive, dsend, rsend, mf, delay };
      eng.current = e; applyFx(e);
    }
    eng.current.resume(); return eng.current;
  };

  const fire = (s, time) => {
    const e = eng.current; if (!e) return; const ctx = e.ctx, out = e.bus, buf = e.buffers.white, Tr = $tracks.get(), cut = $fx.get().squelch;
    if (Tr.kick[s]) KICK(ctx, out, time);
    if (Tr.snare[s]) SNARE(ctx, out, buf, time);
    if (Tr.clap[s]) CLAP(ctx, out, buf, time);
    if (Tr.rim[s]) RIM(ctx, out, buf, time);
    if (Tr.hat[s]) HAT(ctx, out, time, false);
    if (Tr.ohat[s]) HAT(ctx, out, time, true);
    if (Tr.ride[s]) RIDE(ctx, out, time);
    if (Tr.cowbell[s]) COWBELL(ctx, out, time);
    if (Tr.tom[s]) TOM(ctx, out, time);
    if (Tr.stab[s]) STAB(ctx, out, time, cut);
    if (Tr.acid[s]) ACID(ctx, out, time, midiToFreq(ROOT + RIFF[s]), cut);
    if (Tr.sub[s]) SUB(ctx, out, time, midiToFreq(ROOT + RIFF[s]));
    q.current.push({ s, time });
  };
  const tick = () => { const e = eng.current; if (!e) return; const spb = 60 / $bpm.get() / 4, sw = $fx.get().swing; while (nextT.current < e.ctx.currentTime + 0.1) { const s = stepN.current; fire(s, nextT.current + (s % 2 ? sw * spb : 0)); nextT.current += spb; stepN.current = (s + 1) % N; } };
  const draw = () => { const e = eng.current; if (e) { const now = e.ctx.currentTime; while (q.current.length && q.current[0].time <= now) setCur(q.current.shift().s); } raf.current = requestAnimationFrame(draw); };
  const start = () => { const e = ensure(); setPlaying(true); if (!e) return; nextT.current = e.ctx.currentTime + 0.06; stepN.current = 0; sched.current = setInterval(tick, 25); raf.current = requestAnimationFrame(draw); };
  const stop = () => { if (sched.current) clearInterval(sched.current); if (raf.current) cancelAnimationFrame(raf.current); sched.current = null; raf.current = null; q.current = []; setPlaying(false); setCur(-1); };

  useEffect(() => () => { if (sched.current) clearInterval(sched.current); if (raf.current) cancelAnimationFrame(raf.current); if (eng.current) eng.current.close(); }, []);
  useEffect(() => { CUR.put("state", { tracks, bpm, fx }).catch(() => {}); }, [tracks, bpm, fx]);   // autosave working pattern
  useEffect(() => { const e = eng.current; if (e && e.fx) applyFx(e); }, [fx, bpm]);                // live FX + tempo-synced delay

  const cellToggle = (tid, s) => { ensure(); $tracks.set({ ...tracks, [tid]: tracks[tid].map((v, i) => (i === s ? !v : v)) }); };
  const setFx = (id, v) => $fx.set({ ...fx, [id]: v });
  const save = async () => { try { const list = await SAVES.all(); await SAVES.put("p" + Date.now(), { name: `${T(t, "beatWord")} ${list.length + 1}`, tracks, bpm, fx }); toast?.(T(t, "toastSaved")); } catch { /* no idb */ } };

  return html`<div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <button id="play" aria-label=${playing ? T(t, "aStop") : T(t, "aPlay")} class=${`btn btn-circle btn-lg shadow-lg ${playing ? "btn-secondary" : "btn-primary"}`} onClick=${() => (playing ? stop() : start())}>${Icon(playing ? "lucide:square" : "lucide:play", "text-2xl")}</button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between text-xs mb-0.5"><span class="font-semibold tabular-nums">${bpm} BPM</span></div>
        <input type="range" min="90" max="150" value=${bpm} class="range range-xs range-primary w-full" aria-label=${T(t, "tempo")} onInput=${(e) => $bpm.set(Number(e.target.value))} />
      </div>
      <button id="save" data-save aria-label=${T(t, "aSave")} class="btn btn-circle btn-outline" onClick=${save}>${Icon("lucide:save", "text-xl")}</button>
    </div>

    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
      ${FX.map((f) => html`<div class="flex items-center gap-1.5 min-w-0" key=${f.id}>${Icon(f.icon, "text-base text-base-content/70 shrink-0")}<input type="range" min=${f.min} max=${f.max} step=${f.step} value=${fx[f.id]} class="range range-xs range-accent w-full min-w-0" aria-label=${T(t, f.label)} onInput=${(e) => setFx(f.id, Number(e.target.value))} /></div>`)}
    </div>

    <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      ${PRESETS.map((p) => html`<button data-preset=${p.id} class="btn btn-sm btn-outline shrink-0" onClick=${() => { ensure(); $tracks.set(parse(p)); }} key=${p.id}>${T(t, p.name)}</button>`)}
      <button data-preset="random" aria-label=${T(t, "rand")} class="btn btn-sm btn-square btn-outline shrink-0" onClick=${() => { ensure(); $tracks.set(random()); }}>${Icon("lucide:dices", "text-base")}</button>
      <button data-preset="clear" aria-label=${T(t, "clear")} class="btn btn-sm btn-square btn-ghost shrink-0" onClick=${() => $tracks.set(empty())}>${Icon("lucide:eraser", "text-base")}</button>
    </div>

    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-[3px]">
        <div class="w-7 shrink-0"></div>
        ${STEPS.map((s) => html`<div class=${`flex-1 h-1 rounded-full ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${s === cur ? "bg-primary" : "bg-base-300"}`} key=${s}></div>`)}
      </div>
      ${TRACKS.map((tr) => html`<div class="flex items-center gap-[3px]" key=${tr.id}>
        <div class=${`w-7 shrink-0 flex items-center justify-center ${tracks[tr.id].some(Boolean) ? "text-base-content" : "text-base-content/40"}`}>${Icon(tr.icon, "text-base")}</div>
        ${STEPS.map((s) => { const on = tracks[tr.id][s]; return html`<button data-cell=${`${tr.id}-${s}`} aria-pressed=${on} aria-label=${`${T(t, tr.name)} ${s + 1}`}
          class=${`flex-1 min-w-0 h-8 rounded touch-manipulation transition-colors ${s % 4 === 0 && s > 0 ? "ml-1" : ""} ${on ? tr.on : "bg-base-300"} ${s === cur ? "ring-2 ring-base-content/50" : ""}`}
          onClick=${() => cellToggle(tr.id, s)} key=${s}></button>`; })}
      </div>`)}
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}

// Saved tab — lists named patterns from IndexedDB; tap to load into the sequencer (jumps to the Beat tab).
export function raveSaved({ S }) {
  const t = useStore(S.t);
  const [list, setList] = useState(null);
  const load = () => SAVES.all().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const open = (it) => { $tracks.set({ ...empty(), ...(it.tracks || {}) }); if (it.bpm) $bpm.set(it.bpm); $fx.set({ ...DFX, ...(it.fx || {}) }); S.tab.set("beat"); };
  const del = async (id) => { try { await SAVES.remove(id); } catch { /* */ } load(); };

  if (list === null) return html`<div class="flex justify-center py-20"><span class="loading loading-ring loading-lg"></span></div>`;
  if (!list.length) return html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:bookmark", "text-4xl")}<span>${T(t, "savedEmpty")}</span></div>`;

  return html`<div class="flex flex-col gap-2">
    ${list.map((it) => html`<div data-saved class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition" key=${it.id}>
      <div class="card-body p-3 flex-row items-center gap-3">
        <button data-load class="flex-1 min-w-0 text-left flex flex-col gap-1.5" onClick=${() => open(it)}>
          <span class="font-semibold truncate">${it.name || T(t, "beatWord")}</span>
          <span class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs text-base-content/70 tabular-nums mr-1">${it.bpm || 130} BPM</span>
            ${TRACKS.filter((tr) => it.tracks?.[tr.id]?.some(Boolean)).map((tr) => html`<span class=${`w-2 h-2 rounded-full ${tr.on}`} key=${tr.id}></span>`)}
          </span>
        </button>
        <button data-del aria-label=${T(t, "del")} class="btn btn-ghost btn-sm btn-circle text-base-content/60" onClick=${() => del(it.id)}>${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>`)}
  </div>`;
}
