// Pendulum (Маятник) — a contemplative dowsing pendulum swinging between the two poles of a duality, one
// full swing to a breath. The pendulum is a FULL-SCREEN ambient layer BEHIND the content (fixed inset-0,
// -z-10): a long arm pivoting from the top of the viewport, its glowing bob swinging low — so it never
// crops, it breathes with the whole screen. On top float the two pole words: a calm, weightless drift via
// the systemic `motion` (an eased, mirrored, infinite y-oscillation, each word on its own period), while
// the breath crossfades the accent onto whichever pole it's drawn toward — colour = meaning.
//
// The swing/crossfade math is the systemic, unit-tested /_rt/pendulum.js. ONE rAF loop computes each frame
// from elapsed time (no drift) and mutates the arm transform + pole opacity/colour via refs — no per-frame
// Preact render. Reduced motion holds the arm and stills the float, keeping only the gentle crossfade; the
// gate paints one deterministic still. Fully offline, no API, no emoji — the only imagery is the pendulum.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate } from "motion";
import { T } from "/_rt/i18n.js";
import { state as pstate } from "/_rt/pendulum.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The dualities, as [pole-A, pole-B] i18n keys. Pole A (left, lit at the top of the in-breath) is the
// drawing-in / affirming side; pole B (right) is the releasing / negating side. The words are content and
// live in i18n (en + uk); this is only their order and pairing.
const DUALITIES = [
  ["dThoughtIn", "dThoughtOut"],
  ["dLife", "dDeath"],
  ["dCreate", "dDestroy"],
  ["dAll", "dNothing"],
  ["dInhale", "dExhale"],
  ["dLove", "dUnlove"],
  ["dCertain", "dUncertain"],
  ["dWaking", "dReverie"],
];
const N = DUALITIES.length;

const PERIOD = 8000;   // one breath (in + out), ms
const AMP = 16;        // swing amplitude, degrees (a calm arc for a screen-tall pendulum)
const ADVANCE = 5;     // breaths spent on each duality before it turns over on its own
const GATE_PH = 0.12;  // a still, deterministic frame for the server-rendered gate shot
const ARM = "66vh";    // arm length — pendulum spans the viewport, bob swinging low
const PIVOT = "6vh";   // pivot near the top edge

export function pendulum({ S }) {
  const t = useStore(S.t);
  const [durIdx, setDurIdx] = useState(0);
  const [breaths, setBreaths] = useState(0);
  const [playing, setPlaying] = useState(true);

  const armRef = useRef();
  const aRef = useRef(), bRef = useRef();           // the pole words (crossfade)
  const aWrapRef = useRef(), bWrapRef = useRef();   // their float wrappers (drift)
  const totalRef = useRef(0);                       // breaths accumulated across pause/resume
  const advanceAtRef = useRef(ADVANCE);

  // Paint one frame: rotate the arm and crossfade the two poles. Both words stay legible (opacity floor
  // 0.6 → passes contrast); the leading pole takes the accent. Pixels, not intent.
  const paint = (st) => {
    if (armRef.current) armRef.current.style.transform = `rotate(${st.angle.toFixed(2)}deg)`;
    const set = (el, w) => { if (el) { el.style.opacity = (0.6 + 0.4 * w).toFixed(3); el.style.color = w >= 0.5 ? "var(--color-accent)" : ""; } };
    set(aRef.current, st.weightA);
    set(bRef.current, st.weightB);
  };

  const prev = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i - 1 + N) % N); };
  const next = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i + 1) % N); };
  const toggle = () => { buzz(); setPlaying((p) => !p); };

  // The swing + breath clock. Independent of durIdx so the pair turning over never resets the rhythm.
  useEffect(() => {
    if (gate || !playing) return;
    const reduce = reduced();
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      if (reduce) st.angle = 0;                     // hold the arm; keep the gentle crossfade
      paint(st);
      if (st.breath !== runLast) {
        runLast = st.breath;
        totalRef.current += 1;
        setBreaths(totalRef.current);
        if (totalRef.current >= advanceAtRef.current) { advanceAtRef.current += ADVANCE; setDurIdx((i) => (i + 1) % N); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // The calm floating drift of the two words — weightless, eased, mirrored, each on its own slow period.
  useEffect(() => {
    if (gate || reduced() || !aWrapRef.current || !bWrapRef.current) return;
    const opts = { ease: "easeInOut", repeat: Infinity, repeatType: "mirror" };
    const a1 = animate(aWrapRef.current, { y: [-7, 7] }, { duration: 5.6, ...opts });
    const a2 = animate(bWrapRef.current, { y: [7, -7] }, { duration: 6.7, delay: 0.5, ...opts });
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const [aKey, bKey] = DUALITIES[durIdx];
  // The initial frame the JSX renders — the gate's still frame, or the resting top of the in-breath live.
  // Driving the arm transform + pole styles from this (not a hardcoded literal) keeps a Preact re-render
  // reconciling to a CONSISTENT frame; the rAF loop overrides within one frame while playing.
  const init = gate ? pstate(GATE_PH * PERIOD, PERIOD, AMP) : pstate(0, PERIOD, AMP);
  const poleStyle = (w) => `opacity:${(0.6 + 0.4 * w).toFixed(3)};color:${w >= 0.5 ? "var(--color-accent)" : "inherit"}`;

  return html`<${Fragment}>
    <!-- ambient full-screen pendulum, behind the content -->
    <div data-stage class="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div ref=${armRef} style=${`position:absolute;left:50%;top:${PIVOT};transform-origin:top center;transform:rotate(${init.angle.toFixed(2)}deg);will-change:transform`}>
        <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;border-radius:9999px;background:var(--color-base-content);opacity:0.3"></div>
        <div style=${`width:2px;height:${ARM};margin-left:-1px;border-radius:2px;background:linear-gradient(to bottom, transparent, color-mix(in oklch, var(--color-base-content) 62%, transparent));opacity:0.16`}></div>
        <div data-bob style=${`position:absolute;top:${ARM};left:0;width:6.5rem;height:6.5rem;transform:translate(-50%,-50%);border-radius:9999px;background:radial-gradient(circle at 50% 42%, color-mix(in oklch, var(--color-primary) 82%, transparent) 0%, color-mix(in oklch, var(--color-accent) 52%, transparent) 40%, transparent 68%)`}></div>
      </div>
    </div>

    <!-- content, above the pendulum -->
    <div class="relative z-10 flex flex-col items-center justify-between min-h-[82dvh] pb-1">
      <!-- which pair, of the eight -->
      <div class="flex gap-2 pt-1" aria-hidden="true">
        ${DUALITIES.map((_, i) => html`<span class=${`h-2 w-2 rounded-full transition-colors ${i === durIdx ? "bg-accent" : "bg-base-content/40"}`} key=${i}></span>`)}
      </div>

      <!-- the two poles, floating; the one the breath favours takes the accent -->
      <div class="grid grid-cols-2 gap-4 w-full max-w-sm text-center">
        <div ref=${aWrapRef} style="will-change:transform"><div ref=${aRef} data-pole data-pole-a class="text-[1.7rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightA)}>${T(t, aKey)}</div></div>
        <div ref=${bWrapRef} style="will-change:transform"><div ref=${bRef} data-pole data-pole-b class="text-[1.7rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightB)}>${T(t, bKey)}</div></div>
      </div>

      <!-- controls (glass island) + breath count -->
      <div class="flex flex-col items-center gap-3">
        <div class="flex items-center gap-1.5 rounded-full border border-base-content/10 bg-base-100/80 backdrop-blur-xl px-2 py-1.5 shadow-lg">
          <button data-prev aria-label=${T(t, "aPrev")} class="btn btn-ghost btn-circle btn-sm" onClick=${prev}>${Icon("lucide:chevron-left", "text-lg")}</button>
          <button id="play" aria-label=${playing ? T(t, "aPause") : T(t, "aStart")} class="btn btn-primary btn-circle" onClick=${toggle}>${Icon(playing ? "lucide:pause" : "lucide:play", "text-xl")}</button>
          <button data-next aria-label=${T(t, "aNext")} class="btn btn-ghost btn-circle btn-sm" onClick=${next}>${Icon("lucide:chevron-right", "text-lg")}</button>
        </div>
        <div class="flex items-center gap-1.5 text-xs font-mono text-base-content/45" aria-label=${T(t, "aBreaths")}>
          ${Icon("lucide:wind", "text-sm")}<span data-breaths class="tabular-nums">${breaths}</span>
        </div>
      </div>
    </div>
  </${Fragment}>`;
}
