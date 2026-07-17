// Breathe — a guided breathing exercise. A soft orb expands on the inhale, holds, and contracts on the
// exhale, driven by ONE rAF loop (compute phase + scale + countdown from elapsed time → perfect sync, no
// drift). Fully offline, no API. Four techniques; the choice persists in localStorage.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// seconds: inhale · hold · exhale · hold
const TECHS = {
  box: { name: "tBox", sub: "sBox", in: 4, h1: 4, out: 4, h2: 4 },
  "478": { name: "t478", sub: "s478", in: 4, h1: 7, out: 8, h2: 0 },
  coherent: { name: "tCoherent", sub: "sCoherent", in: 5, h1: 0, out: 5, h2: 0 },
  calm: { name: "tCalm", sub: "sCalm", in: 4, h1: 0, out: 6, h2: 0 },
};
const ORDER = ["box", "478", "coherent", "calm"];
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2); // easeInOutQuad
const readTech = () => { try { const k = localStorage.getItem("breathe.tech"); return TECHS[k] ? k : "box"; } catch { return "box"; } };

export function breathe({ S }) {
  const t = useStore(S.t);
  const [tech, setTech] = useState(readTech);
  const [playing, setPlaying] = useState(true);
  const orbRef = useRef(), phaseRef = useRef(), countRef = useRef();

  const choose = (k) => { setTech(k); try { localStorage.setItem("breathe.tech", k); } catch { /* private mode */ } };

  useEffect(() => {
    if (!playing) return;
    const c = TECHS[tech], total = c.in + c.h1 + c.out + c.h2;
    const label = { in: T(t, "pIn"), hold: T(t, "pHold"), out: T(t, "pOut") };
    // Reduced motion: keep the phase/count guidance updating, but hold the orb still — the size pulse is
    // exactly the large, repeating motion a sensitive user asked us to suppress.
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf, start = performance.now();
    const loop = (now) => {
      const el = ((now - start) / 1000) % total;
      let scale, ph, rem;
      if (el < c.in) { scale = 0.55 + 0.45 * ease(el / c.in); ph = "in"; rem = c.in - el; }
      else if (el < c.in + c.h1) { scale = 1; ph = "hold"; rem = c.in + c.h1 - el; }
      else if (el < c.in + c.h1 + c.out) { scale = 1 - 0.45 * ease((el - c.in - c.h1) / c.out); ph = "out"; rem = c.in + c.h1 + c.out - el; }
      else { scale = 0.55; ph = "hold"; rem = total - el; }
      if (orbRef.current) orbRef.current.style.transform = `scale(${(reduce ? 0.8 : scale).toFixed(3)})`;
      if (phaseRef.current) phaseRef.current.textContent = label[ph];
      if (countRef.current) countRef.current.textContent = String(Math.ceil(rem));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tech, playing, t]);

  return html`<div class="flex flex-col items-center gap-5 pt-2">
    <div class="flex flex-col items-center gap-1">
      <div class="flex gap-1.5 flex-wrap justify-center px-4">
        ${ORDER.map((k) => html`<button data-tech=${k} aria-pressed=${k === tech} class=${`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${k === tech ? "border-primary bg-primary text-primary-content" : "border-base-300"}`} onClick=${() => choose(k)} key=${k}>${T(t, TECHS[k].name)}</button>`)}
      </div>
      <div class="text-xs text-base-content/70">${T(t, TECHS[tech].sub)}</div>
    </div>

    <div class="w-full flex justify-center py-3">
      <div ref=${orbRef} data-orb class="w-full max-w-[210px] aspect-square rounded-full" style="background:radial-gradient(circle at 38% 32%, #9FEADE, #35A79B 56%, #1E655C);box-shadow:0 0 70px -6px #35A79B99;will-change:transform"></div>
    </div>

    <div class="flex flex-col items-center gap-3 -mt-4">
      <div ref=${phaseRef} data-phase class="text-xl font-semibold text-base-content/80 h-7"></div>
      <div ref=${countRef} class="text-6xl font-bold tabular-nums leading-none h-14"></div>
      <button id="play" aria-label=${playing ? T(t, "aPause") : T(t, "aStart")} class="btn btn-circle btn-primary btn-lg shadow-lg" onClick=${() => setPlaying((p) => !p)}>${Icon(playing ? "lucide:pause" : "lucide:play", "text-2xl")}</button>
    </div>
  </div>`;
}
