// Pendulum (Маятник) — a contemplative dowsing pendulum swinging between the two poles of a duality, one
// full swing to a breath. A luminous orb on a fine rod, swinging in the lower-centre; the two pole words
// float above it and crossfade with the breath — the accent lights on whichever pole it's drawn toward.
// There is no pause and no transport bar: tap anywhere and the orb blooms as it turns to the next duality.
//
// Pure CSS/DOM (no WebGL) — so it renders identically everywhere (every phone, and the CI gate that
// screenshots it), which is what makes it verifiable and reliable. The swing/crossfade math is the
// systemic, unit-tested /_rt/pendulum.js; one rAF loop drives it from elapsed time (no drift). Reduced
// motion holds the arm and stills the float. Fully offline, no emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate } from "motion";
import { T } from "/_rt/i18n.js";
import { state as pstate } from "/_rt/pendulum.js";
import { gate } from "/_rt/gate.js";

const buzz = () => { try { navigator.vibrate?.(10); } catch { /* unsupported */ } };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

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
const AMP = 15;        // swing amplitude, degrees
const ADVANCE = 6;     // breaths before the duality turns over on its own (tap turns it sooner)
const PULSE_MS = 700;  // the bloom when the pair changes
const GATE_PH = 0.12;  // a still, deterministic frame for the gate / screenshots
const PIVOT = "9vh";   // pivot near the top
const ARM = "47vh";    // rod length — a jewel in the lower-centre, not a wall

// A luminous orb: a bright highlight fading to a deep lavender body, with soft inner depth.
const BOB_BG = "radial-gradient(circle at 42% 36%, #ffffff 0%, #ECE7FF 12%, #BBA9F6 46%, #6E5CC9 78%, #40367F 100%)";

export function pendulum({ S }) {
  const t = useStore(S.t);
  const [durIdx, setDurIdx] = useState(0);

  const armRef = useRef(), bobRef = useRef();
  const aRef = useRef(), bRef = useRef();
  const aWrapRef = useRef(), bWrapRef = useRef();
  const totalRef = useRef(0), advanceAtRef = useRef(ADVANCE), pulseAtRef = useRef(-PULSE_MS);

  const advance = () => { pulseAtRef.current = performance.now(); buzz(); setDurIdx((i) => (i + 1) % N); advanceAtRef.current = totalRef.current + ADVANCE; };

  const paint = (st, bloom) => {
    if (armRef.current) armRef.current.style.transform = `rotate(${st.angle.toFixed(2)}deg)`;
    if (bobRef.current) bobRef.current.style.transform = `translate(-50%,-50%) scale(${(1 + 0.14 * bloom).toFixed(3)})`;
    const set = (el, w) => { if (el) { el.style.opacity = (0.6 + 0.4 * w).toFixed(3); el.style.color = w >= 0.5 ? "var(--color-accent)" : ""; } };
    set(aRef.current, st.weightA);
    set(bRef.current, st.weightB);
  };

  // One rAF loop: swing, bloom pulse, word crossfade and the auto-turn.
  useEffect(() => {
    if (gate) return;
    const reduce = reduced();
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      if (reduce) st.angle = 0;
      paint(st, Math.sin(clamp01((now - pulseAtRef.current) / PULSE_MS) * Math.PI));
      if (st.breath !== runLast) {
        runLast = st.breath; totalRef.current += 1;
        if (totalRef.current >= advanceAtRef.current) advance();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The calm floating drift of the two words.
  useEffect(() => {
    if (gate || reduced() || !aWrapRef.current || !bWrapRef.current) return;
    const opts = { ease: "easeInOut", repeat: Infinity, repeatType: "mirror" };
    const a1 = animate(aWrapRef.current, { y: [-6, 6] }, { duration: 5.6, ...opts });
    const a2 = animate(bWrapRef.current, { y: [6, -6] }, { duration: 6.7, delay: 0.5, ...opts });
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const [aKey, bKey] = DUALITIES[durIdx];
  const init = gate ? pstate(GATE_PH * PERIOD, PERIOD, AMP) : pstate(0, PERIOD, AMP);
  const poleStyle = (w) => `opacity:${(0.6 + 0.4 * w).toFixed(3)};color:${w >= 0.5 ? "var(--color-accent)" : "inherit"}`;

  return html`<${Fragment}>
    <!-- full-screen pendulum body; tap (or Enter) turns to the next duality -->
    <button data-stage type="button" class="fixed inset-0 z-0 overflow-hidden cursor-pointer appearance-none bg-transparent border-0 p-0 block" onClick=${advance} aria-label=${T(t, "aTurn")}>
      <div aria-hidden="true">
        <div ref=${armRef} style=${`position:absolute;left:50%;top:${PIVOT};transform-origin:top center;transform:rotate(${init.angle.toFixed(2)}deg)`}>
          <div style="position:absolute;top:-5px;left:-5px;width:9px;height:9px;border-radius:9999px;background:var(--color-base-content);opacity:0.35"></div>
          <div style=${`width:2px;height:${ARM};margin-left:-1px;background:linear-gradient(to bottom, transparent, color-mix(in oklch, var(--color-base-content) 70%, transparent));opacity:0.28`}></div>
          <div ref=${bobRef} data-bob style=${`position:absolute;top:${ARM};left:0;width:6rem;height:6rem;transform:translate(-50%,-50%)`}>
            <div style="position:absolute;left:50%;top:50%;width:15rem;height:15rem;transform:translate(-50%,-50%);border-radius:9999px;background:radial-gradient(circle, rgba(159,140,246,.34) 0%, rgba(159,140,246,.12) 30%, rgba(159,140,246,0) 62%)"></div>
            <div style=${`position:absolute;inset:0;border-radius:9999px;background:${BOB_BG};box-shadow:inset 0 -5px 13px rgba(52,42,102,.55), 0 3px 12px rgba(0,0,0,.28)`}></div>
          </div>
        </div>
      </div>
    </button>

    <!-- the two pole words, floating above the orb; the one the breath favours takes the accent -->
    <div class="fixed inset-x-0 z-10 pointer-events-none flex justify-center px-4" style="top:27vh">
      <div class="grid grid-cols-2 gap-5 w-full max-w-sm text-center">
        <div ref=${aWrapRef} style="will-change:transform"><div ref=${aRef} data-pole data-pole-a class="text-[1.6rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightA)}>${T(t, aKey)}</div></div>
        <div ref=${bWrapRef} style="will-change:transform"><div ref=${bRef} data-pole data-pole-b class="text-[1.6rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightB)}>${T(t, bKey)}</div></div>
      </div>
    </div>
  </${Fragment}>`;
}
