// Outposts & Stations — a software generator of sci-fi station ambience for focus and sleep. Nothing is a
// file: a single persistent Web Audio graph of six macro beds runs continuously and MORPHS between stations
// (ramping the reactor's oscillator frequencies to the new chord, the ventilation band, the telemetry gap and
// every level), so switching outpost is a seamless crossfade, not a cut. The realism is in the formulas
// (packages/runtime/scifi.js, unit-tested): equal-temperament frequency ratios, a detuned voice cluster whose
// geometric mean stays on the note (the drone beats around its true pitch), and a perceptual dB fader curve.
//   hull    — brown noise, sub-80 Hz lowpass + a slow structural groan
//   vent    — pink noise through a bandpass with a turbulence LFO on the cutoff (life support)
//   reactor — six detuned oscillators (three chord tones × a beating pair) + a sub reactor pulse
//   servo   — scheduled hydraulic actuator sweeps (filtered-noise glides)
//   tele    — scheduled console blips on a pentatonic over the station root
//   deep    — high-band pink "solar wind" + rare distant sine whistles
// Audio is unavailable in the headless gate, so the whole console renders statically for the still.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { createEngine, audioSupported, noiseSource as src, filter as bqf, lfo, noteFreq } from "/_rt/audio.js";
import { STATIONS, LAYERS, station, reactorVoices, faderGain, semiToRatio } from "/_rt/scifi.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const NAME = { reactor: "stReactor", bridge: "stBridge", observation: "stObservation", cryo: "stCryo", derelict: "stDerelict", relay: "stRelay" };
const LMETA = { hull: "lucide:box", vent: "lucide:wind", reactor: "lucide:atom", servo: "lucide:cog", tele: "lucide:activity", deep: "lucide:radio" };
const TIMERS = [15, 30, 60, 90];
const TELE_SCALE = [0, 3, 5, 7, 10, 12];   // minor pentatonic — blips stay musical, never grating

// build the persistent graph for a station; returns imperative handles the component drives from effects
function buildEngine(st) {
  const eng = createEngine({ master: 0.0001, noise: true });
  if (!eng) return null;
  const ctx = eng.ctx, b = eng.buffers, nodes = [], timers = [];
  const keep = (...ns) => { nodes.push(...ns); return ns[0]; };
  const loop = (getMin, span, fn) => { const tick = () => { try { fn(); } catch { /* */ } timers.push(setTimeout(tick, getMin() + Math.random() * span)); }; timers.push(setTimeout(tick, getMin() + Math.random() * span)); };
  const gains = {}; for (const L of LAYERS) { const g = ctx.createGain(); g.gain.value = 0; g.connect(eng.master); gains[L] = g; }
  const p = { teleGap: st.teleGap };

  // hull — deep body rumble + slow groan
  { const s = src(ctx, b.brown), lp = bqf(ctx, "lowpass", 72, 0.7), groan = ctx.createGain(); s.connect(lp); lp.connect(groan); groan.connect(gains.hull); s.start(); keep(s, lfo(ctx, 0.055, 0.32, groan.gain, 0.7)); }

  // vent — bandpassed pink air with a turbulence sweep; the band centre retunes per station
  const ventBp = bqf(ctx, "bandpass", st.air, 1.4);
  { const s = src(ctx, b.pink), g = ctx.createGain(); s.connect(ventBp); ventBp.connect(g); g.connect(gains.vent); s.start(); keep(s, lfo(ctx, 0.09, st.air * 0.4, ventBp.frequency, st.air), lfo(ctx, 0.13, 0.18, g.gain, 0.7)); }

  // reactor — six detuned voices → gentle lowpass, plus a sub pulse throbbing under it
  const rlp = bqf(ctx, "lowpass", 380, 0.6); rlp.connect(gains.reactor);
  const oscs = reactorVoices(st).map((f, i) => { const o = ctx.createOscillator(); o.type = i % 2 ? "sine" : "triangle"; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.15; o.connect(og); og.connect(rlp); o.start(); return keep(o); });
  const sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = (noteFreq(st.root) || 65) / 2; const subg = ctx.createGain(); subg.gain.value = 0; sub.connect(subg); subg.connect(gains.reactor); sub.start(); keep(sub, lfo(ctx, 0.18, 0.08, subg.gain, 0.085));

  // servo — occasional hydraulic actuator: white noise through a downward-sweeping bandpass
  loop(() => 4200, 7000, () => { const t = ctx.currentTime, ns = src(ctx, b.white), bp = bqf(ctx, "bandpass", 1400, 6), g = ctx.createGain(); bp.frequency.setValueAtTime(1200 + Math.random() * 500, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.5); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); ns.connect(bp); bp.connect(g); g.connect(gains.servo); ns.start(t); ns.stop(t + 0.7); });

  // tele — console blips on a pentatonic over the station root register; density = p.teleGap
  const teleRoot = (noteFreq(st.root) || 65) * 8;
  loop(() => p.teleGap * 0.7, () => p.teleGap * 0.6 || 2000, () => { const t = ctx.currentTime, semi = TELE_SCALE[Math.floor(Math.random() * TELE_SCALE.length)] + (Math.random() < 0.25 ? 12 : 0), o = ctx.createOscillator(), g = ctx.createGain(); o.type = Math.random() < 0.5 ? "sine" : "square"; o.frequency.value = teleRoot * semiToRatio(semi); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g); g.connect(gains.tele); o.start(t); o.stop(t + 0.14); });

  // deep — high-band solar wind + rare distant whistle sweeps
  const deepBp = bqf(ctx, "bandpass", 3200, 0.7);
  { const s = src(ctx, b.pink), hp = bqf(ctx, "highpass", 2000), g = ctx.createGain(); g.gain.value = 0.5; s.connect(hp); hp.connect(deepBp); deepBp.connect(g); g.connect(gains.deep); s.start(); keep(s, lfo(ctx, 0.04, 1400, deepBp.frequency, 3200), lfo(ctx, 0.07, 0.35, g.gain, 0.5)); }
  loop(() => 11000, 15000, () => { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f0 = 900 + Math.random() * 700; o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.6 : 0.62), t + 2.4); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6); o.connect(g); g.connect(gains.deep); o.start(t); o.stop(t + 2.8); });

  const RT = 0.06;
  return {
    ctx, master: eng.master,
    setFader: (L, v) => { try { gains[L].gain.setTargetAtTime(faderGain(v), ctx.currentTime, RT); } catch { gains[L].gain.value = faderGain(v); } },
    applyFaders: (f) => { for (const L of LAYERS) { try { gains[L].gain.setTargetAtTime(faderGain(f[L] ?? 0), ctx.currentTime, RT); } catch { /* */ } } },
    retune: (s2) => { const t = ctx.currentTime, v = reactorVoices(s2); oscs.forEach((o, i) => o.frequency.setTargetAtTime(v[i], t, 2.5)); try { sub.frequency.setTargetAtTime((noteFreq(s2.root) || 65) / 2, t, 2.5); ventBp.frequency.setTargetAtTime(s2.air, t, 3); } catch { /* */ } p.teleGap = s2.teleGap; },
    setMaster: (on) => { const t = ctx.currentTime; try { eng.master.gain.cancelScheduledValues(t); eng.master.gain.setTargetAtTime(on ? 0.8 : 0.0001, t, on ? 0.5 : 0.4); } catch { /* */ } },
    stop: () => { for (const tm of timers) clearTimeout(tm); for (const n of nodes) { try { n.stop && n.stop(); } catch { /* */ } try { n.disconnect && n.disconnect(); } catch { /* */ } } try { ctx.close(); } catch { /* */ } },
  };
}

export function outpost({ S }) {
  const t = useStore(S.t);
  const [stId, setStId] = useState("bridge");           // a balanced station makes the seeded still self-evident
  const [faders, setFaders] = useState(() => ({ ...station("bridge").levels }));
  const [playing, setPlaying] = useState(false);
  const [timerMin, setTimerMin] = useState(0);
  const eng = useRef(null), timerRef = useRef(null), tweaked = useRef(false);

  const ensure = () => { if (!audioSupported) return null; if (!eng.current) { eng.current = buildEngine(station(stId)); if (eng.current) eng.current.applyFaders(station(stId).levels); } try { eng.current?.ctx.resume(); } catch { /* */ } return eng.current; };

  useEffect(() => { if (eng.current) eng.current.applyFaders(faders); }, [faders]);
  useEffect(() => { const e = eng.current; if (e) { e.retune(station(stId)); e.ctx.resume?.(); } }, [stId]);

  // sleep timer → full standby when it elapses
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (timerMin > 0 && playing) timerRef.current = setTimeout(() => { eng.current?.setMaster(false); setPlaying(false); setTimerMin(0); }, timerMin * 60000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timerMin, playing]);

  useEffect(() => () => { eng.current?.stop(); eng.current = null; }, []);

  const pickStation = (id) => { buzz(); tweaked.current = false; setStId(id); setFaders({ ...station(id).levels }); };
  const setFader = (L, v) => { tweaked.current = true; setFaders((f) => ({ ...f, [L]: v })); };
  const resetMix = () => { buzz(); tweaked.current = false; setFaders({ ...station(stId).levels }); };
  const toggle = () => {
    buzz(12);
    const e = ensure();
    if (!playing) { e?.setMaster(true); setPlaying(true); }
    else { e?.setMaster(false); setPlaying(false); }
  };

  return html`<${Fragment}>
    <!-- ambient nebula wash (theme-safe: only faint colour, base shows through) -->
    <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style="background:radial-gradient(90% 60% at 25% 12%, rgba(159,140,246,.12), transparent 55%), radial-gradient(80% 60% at 82% 78%, rgba(80,150,230,.10), transparent 55%)"></div>

    <div class="relative z-10 flex flex-col items-center gap-6 pt-1 pb-2">
      <!-- station selector -->
      <div class="w-full max-w-[440px] -mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="flex gap-2 w-max">
          ${STATIONS.map((s) => { const on = s.id === stId; return html`<button data-station=${s.id} aria-pressed=${on} onClick=${() => pickStation(s.id)} key=${s.id} class=${`shrink-0 flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? "border-primary/60 bg-primary/12 text-primary" : "border-base-content/12 text-base-content/70 hover:border-base-content/25"}`}>${Icon(s.icon, "text-base")}<span>${T(t, NAME[s.id])}</span></button>`; })}
        </div>
      </div>

      <!-- the core: transport + live cue -->
      <div class="relative grid place-items-center py-1">
        <div class=${`absolute w-44 h-44 rounded-full transition-opacity duration-700 ${playing ? "opacity-100 animate-pulse" : "opacity-0"}`} style="background:radial-gradient(closest-side, rgba(159,140,246,.35), transparent 72%)"></div>
        <div class="absolute w-40 h-40 rounded-full border border-base-content/10"></div>
        <div class=${`absolute w-32 h-32 rounded-full border ${playing ? "border-primary/40" : "border-base-content/10"}`}></div>
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aPause" : "aPlay")} onClick=${toggle} disabled=${!audioSupported} class="relative w-24 h-24 rounded-full bg-base-100/70 backdrop-blur-xl border border-base-content/15 grid place-items-center shadow-xl active:scale-95 transition disabled:opacity-40">
          ${Icon(playing ? "lucide:pause" : "lucide:play", "text-3xl text-base-content")}
        </button>
      </div>
      <div class="-mt-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-base-content/55">
        <span class=${`w-1.5 h-1.5 rounded-full ${playing ? "bg-primary animate-pulse" : "bg-base-content/30"}`}></span>
        ${T(t, NAME[stId])} · ${T(t, playing ? "online" : "offline")}
      </div>

      <!-- fader bank -->
      <div class="w-full max-w-[440px] flex flex-col gap-2.5">
        <div class="flex items-center justify-end">
          <button data-reset onClick=${resetMix} class="flex items-center gap-1.5 text-xs text-base-content/55 hover:text-base-content/80 transition">${Icon("lucide:rotate-ccw", "text-sm")}${T(t, "aReset")}</button>
        </div>
        ${LAYERS.map((L) => html`<div data-fader=${L} key=${L} class="flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/60 backdrop-blur px-3.5 py-2.5">
          <span class="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-base-200 text-base-content/70">${Icon(LMETA[L], "text-lg")}</span>
          <span class="text-sm font-medium w-28 shrink-0">${T(t, "l" + L[0].toUpperCase() + L.slice(1))}</span>
          <input type="range" min="0" max="1" step="0.02" value=${faders[L]} aria-label=${T(t, "l" + L[0].toUpperCase() + L.slice(1))} onInput=${(e) => setFader(L, Number(e.target.value))} class="range range-xs range-primary flex-1" />
        </div>`)}
      </div>

      <!-- sleep timer -->
      <div class="flex items-center gap-2 text-sm flex-wrap justify-center">
        <span class="text-base-content/60 flex items-center gap-1.5">${Icon("lucide:moon")}${T(t, "sleep")}</span>
        ${TIMERS.map((m) => html`<button data-timer=${m} key=${m} class=${`px-2.5 py-1 rounded-full text-xs font-medium border transition ${timerMin === m ? "border-primary bg-primary/12 text-primary" : "border-base-content/12 text-base-content/70"}`} onClick=${() => { buzz(); setTimerMin((c) => (c === m ? 0 : m)); }}>${m}${T(t, "min")}</button>`)}
      </div>

      ${!audioSupported ? html`<div class="text-xs text-base-content/60">${T(t, "noAudio")}</div>` : null}
    </div>
  </${Fragment}>`;
}
