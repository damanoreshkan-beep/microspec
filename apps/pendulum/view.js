// Pendulum (Маятник) — a contemplative dowsing pendulum that swings between the two poles of a duality,
// one full swing to a breath. The swing/crossfade math is the systemic, unit-tested /_rt/pendulum.js;
// this view is a thin renderer: ONE rAF loop computes the frame from elapsed time (perfect sync, no
// drift), mutates the arm transform + the two pole words directly via refs (no per-frame Preact render),
// and advances through the dualities every few breaths. The pole the breath is drawn toward lights in the
// accent — colour = meaning. Fully offline, no API. No emoji: the only imagery is the drawn pendulum.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { state as pstate } from "/_rt/pendulum.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };

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
const AMP = 30;        // swing amplitude, degrees
const ADVANCE = 5;     // breaths spent on each duality before it turns over on its own
const GATE_PH = 0.12;  // a still, deterministic frame for the server-rendered gate shot

// pivot + arm geometry, in the SVG's own 320×300 space
const PX = 160, PY = 34, ARM = 204, BOB = 160 + ARM;

export function pendulum({ S }) {
  const t = useStore(S.t);
  const [durIdx, setDurIdx] = useState(0);
  const [breaths, setBreaths] = useState(0);
  const [playing, setPlaying] = useState(true);

  const armRef = useRef();
  const aRef = useRef(), bRef = useRef();
  const totalRef = useRef(0);      // breaths accumulated across pause/resume
  const advanceAtRef = useRef(ADVANCE);

  // Paint one frame's crossfade onto the two pole words. Both stay legible (opacity floor 0.6 → passes
  // contrast); the leading pole takes the accent. Describes pixels, not intent.
  const paint = (st) => {
    const set = (el, w) => {
      if (!el) return;
      el.style.opacity = (0.6 + 0.4 * w).toFixed(3);
      el.style.color = w >= 0.5 ? "var(--color-accent)" : "";
    };
    set(aRef.current, st.weightA);
    set(bRef.current, st.weightB);
    if (armRef.current) armRef.current.setAttribute("transform", `rotate(${st.angle.toFixed(2)} ${PX} ${PY})`);
  };

  const prev = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i - 1 + N) % N); };
  const next = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i + 1) % N); };
  const toggle = () => { buzz(); setPlaying((p) => !p); };

  // The gate has no clock and no animation — paint one still, deterministic frame so the taste shot is
  // reproducible and composed (bob toward pole A, pole A lit).
  useEffect(() => { if (gate) paint(pstate(GATE_PH * PERIOD, PERIOD, AMP)); }, [durIdx]);

  useEffect(() => {
    if (gate || !playing) return;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      // Reduced motion: hold the arm still (the swing is the large repeating motion), keep the gentle
      // opacity crossfade so the in/out rhythm still reads.
      if (reduce) st.angle = 0;
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

  const [aKey, bKey] = DUALITIES[durIdx];

  return html`<${Fragment}>
    <div class="flex flex-col items-center gap-6 pt-1 pb-2 min-h-[78dvh]">
      <!-- which pair, of the eight -->
      <div class="flex gap-1.5" aria-hidden="true">
        ${DUALITIES.map((_, i) => html`<span class=${`h-1.5 w-1.5 rounded-full transition-colors ${i === durIdx ? "bg-accent" : "bg-base-content/25"}`} key=${i}></span>`)}
      </div>

      <!-- the pendulum -->
      <div data-stage class="w-full flex justify-center">
        <svg viewBox="0 0 320 300" class="w-full max-w-[19rem]" aria-hidden="true">
          <!-- swing path -->
          <path d="M55 215 A ${ARM} ${ARM} 0 0 0 265 215" fill="none" stroke="var(--color-base-content)" stroke-opacity="0.1" stroke-width="1.25" stroke-dasharray="2 6" stroke-linecap="round" />
          <!-- pivot -->
          <circle cx=${PX} cy=${PY} r="3.4" fill="var(--color-base-content)" fill-opacity="0.5" />
          <!-- arm + bob (rotated each frame) -->
          <g ref=${armRef} data-arm transform=${`rotate(0 ${PX} ${PY})`}>
            <line x1=${PX} y1=${PY} x2=${PX} y2=${BOB - 18} stroke="var(--color-base-content)" stroke-opacity="0.35" stroke-width="1.75" />
            <circle cx=${PX} cy=${BOB} r="26" fill="var(--color-accent)" fill-opacity="0.18" />
            <circle data-bob cx=${PX} cy=${BOB} r="16" fill="var(--color-primary)" style="filter:drop-shadow(0 0 12px color-mix(in oklch, var(--color-accent) 70%, transparent))" />
          </g>
        </svg>
      </div>

      <!-- the two poles: left = draw-in, right = release; the one the breath favours takes the accent -->
      <div class="grid grid-cols-2 gap-3 w-full max-w-sm text-center">
        <div ref=${aRef} data-pole data-pole-a class="text-2xl font-semibold leading-tight break-words" style="opacity:1;color:var(--color-accent)">${T(t, aKey)}</div>
        <div ref=${bRef} data-pole data-pole-b class="text-2xl font-semibold leading-tight break-words" style="opacity:0.6">${T(t, bKey)}</div>
      </div>

      <div class="flex-1"></div>

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
