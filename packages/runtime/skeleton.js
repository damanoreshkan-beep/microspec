/* @ts-self-types="./skeleton.d.ts" */
/**
 * Modern loading placeholders — no content-less spinners and no layout-hiding loading screens: the real
 * structure renders at once and only the not-yet-known VALUES are atomic skeletons in place. Exports the
 * Scramble text decode, the Pixels image placeholder, useReveal (hold a skeleton a minimum time, then
 * reveal), Reveal and a last-resort Loading block. Everything goes instant in the gate and under
 * prefers-reduced-motion so shots and e2e stay deterministic.
 * @module
 */
import { html } from "htm/preact";
import { useRef, useEffect, useState } from "preact/hooks";

const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789абвгґдежзиклмнпрстуфхцч#%&/<>";
const rc = () => CH[(Math.random() * CH.length) | 0];
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const forceAnim = typeof location !== "undefined" && location.search.includes("__anim");   
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const instant = () => !forceAnim && (isGate || reduced());

/**
 * Atomic text value slot: holds a scramble for ~minMs then decodes into `text`; a perpetual placeholder bar without one.
 * @param props `text` (the value, or none for a placeholder), `len` (placeholder length guess), `cls`, `speed` (ms per tick), `minMs` (hold before decoding)
 * @returns the <span> the slot renders into
 */
export function Scramble({ text, len = 14, cls = "", speed = 32, minMs = 900 }) {
  const ref = useRef(), born = useRef(0);
  const ph = !(typeof text === "string" && text.trim());
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!born.current) born.current = now();
    const target = ph ? null : text;
    const n = Math.max(1, target ? target.length : Math.min(72, len));
    if (instant()) { el.textContent = target ?? "".padEnd(n, "░"); return; }
    const decodeAt = born.current + minMs;
    let timer, decodeStart = 0;
    const tick = () => {
      const t0 = now();
      if (target && t0 >= decodeAt) {
        if (!decodeStart) decodeStart = t0;
        const done = Math.floor(Math.min(1, (t0 - decodeStart) / 480) * n);
        if (done >= n) { el.textContent = target; return; }
        el.textContent = target.slice(0, done) + target.slice(done).replace(/\S/g, rc);
      } else el.textContent = target ? target.replace(/\S/g, rc) : Array.from({ length: n }, rc).join("");
      timer = setTimeout(tick, speed);
    };
    tick();
    return () => clearTimeout(timer);
  }, [text, len]);
  return html`<span ref=${ref} aria-hidden=${ph ? "true" : null} class=${`${ph ? "font-mono tracking-tight [overflow-wrap:anywhere] min-w-0" : ""} ${cls}`}></span>`;
}

/**
 * A blinking-pixel image placeholder on a <canvas> sized to its box; a single frozen frame in the gate.
 * @param props `cls` — extra classes on the canvas
 * @returns the aria-hidden <canvas>
 */
export function Pixels({ cls = "" }) {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current, ctx = cv && cv.getContext && cv.getContext("2d"); if (!ctx) return;
    const cell = 13; let W = 0, H = 0, cols = 0, rows = 0, timer;
    const resize = () => { const r = cv.getBoundingClientRect(); W = cv.width = Math.max(1, Math.round(r.width)); H = cv.height = Math.max(1, Math.round(r.height)); cols = Math.ceil(W / cell); rows = Math.ceil(H / cell); };
    const draw = () => { ctx.clearRect(0, 0, W, H); for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { ctx.fillStyle = `rgba(140,140,150,${0.05 + Math.random() * 0.16})`; ctx.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1); } };
    resize(); draw();
    if (instant()) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); }) : null; ro && ro.observe(cv);
    const loop = () => { draw(); timer = setTimeout(loop, 95); }; loop();
    return () => { clearTimeout(timer); ro && ro.disconnect(); };
  }, []);
  return html`<canvas ref=${ref} aria-hidden="true" class=${`w-full h-full block ${cls}`}></canvas>`;
}

/**
 * Hold a whole skeleton for a minimum time (no flash on a fast load), then reveal.
 * @param ready whether the real content is available
 * @param minMs the minimum hold since first render
 * @returns false while the skeleton should still show, true once it may reveal
 */
export function useReveal(ready, minMs = 1000) {
  const born = useRef(0), [, bump] = useState(0);
  if (!born.current) born.current = now();
  if (isGate || reduced()) return !!ready;
  const left = born.current + minMs - now();
  useEffect(() => { if (ready && left > 0) { const id = setTimeout(() => bump((x) => x + 1), left + 20); return () => clearTimeout(id); } }, [ready, left > 0]);
  return !!ready && left <= 0;
}

/** Wrapper whose children fade in when they replace a skeleton (the `ms-reveal` class); final state in the gate. */
export const Reveal = ({ children, cls = "" }) => html`<div class=${`ms-reveal ${cls}`}>${children}</div>`;

/**
 * Last-resort loading block: a few decoding lines for a view with no meaningful structure to show yet.
 * @param props `lines` — the placeholder length of each line
 * @returns the role="status" block
 */
export function Loading({ lines = [15, 22, 18, 25, 14] } = {}) {
  return html`<div class="flex flex-col gap-3 py-8 px-1" role="status" aria-busy="true">
    ${lines.map((n, i) => html`<div class="text-base-content/70 text-sm truncate" key=${i}><${Scramble} len=${n} /></div>`)}
  </div>`;
}
