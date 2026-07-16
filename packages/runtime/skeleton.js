// microspec runtime — modern loading placeholders. NO content-less spinners and NO layout-hiding "loading
// screens": the app's real structure renders immediately, and only the not-yet-known VALUES are atomic
// skeletons in place — text decodes (a letters/digits scramble that resolves into the value; also the reveal
// when EN is translated to the locale), images are blinking pixels. Skeletons hold for a MIN time (no flash)
// then reveal smoothly. All decorative bits are aria-hidden and go INSTANT (final value, no animation) in the
// gate/preflight and under prefers-reduced-motion, so shots + e2e stay deterministic; the effect is device-only.
import { html } from "htm/preact";
import { useRef, useEffect, useState } from "preact/hooks";

const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789абвгґдежзиклмнпрстуфхцч#%&/<>";
const rc = () => CH[(Math.random() * CH.length) | 0];
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const forceAnim = typeof location !== "undefined" && location.search.includes("__anim");   // gate hook: exercise animations
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const instant = () => !forceAnim && (isGate || reduced());

// Scramble — atomic value slot. With a value it holds a scramble for ~minMs (no flash on a fast load) then
// DECODES into the value; without one it's a perpetual placeholder bar. Value slots decode smoothly; the
// gate/reduced-motion show the final value instantly.
export function Scramble({ text, len = 14, cls = "", speed = 32, minMs = 900 }) {
  const ref = useRef(), born = useRef(0);
  const ph = !(typeof text === "string" && text.trim());
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!born.current) born.current = now();
    const target = ph ? null : text;
    // A known value scrambles at its OWN full length — never a capped stand-in. The 72-char cap used to
    // apply here too, so a 600-char description spent ~900ms as 72 random characters and then jumped to its
    // real size: the block grew ~8× and everything under it moved. A skeleton that misreports the size of
    // what is coming is worse than none — it guarantees the layout shift it exists to prevent.
    // The cap still bounds a PLACEHOLDER (no text yet), where `len` is only the caller's guess.
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
      // With a target, scramble the text IN PLACE: `\S` → noise, whitespace untouched. That keeps the exact
      // length, the word shapes and therefore the wrap points, so the paragraph occupies its final box from
      // the first frame and resolves into itself. A run of N random glyphs cannot do that — it wraps
      // differently and reflows on decode.
      } else el.textContent = target ? target.replace(/\S/g, rc) : Array.from({ length: n }, rc).join("");
      timer = setTimeout(tick, speed);
    };
    tick();
    return () => clearTimeout(timer);
  }, [text, len]);
  return html`<span ref=${ref} aria-hidden=${ph ? "true" : null} class=${`${ph ? "font-mono tracking-tight" : ""} ${cls}`}></span>`;
}

// Pixels — a blinking-pixel image placeholder on a <canvas>, sized to its box. Neutral grey (both themes).
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

// useReveal(ready, minMs) — hold a whole skeleton for a MIN time (no flash on a fast load), then reveal.
// Returns false while a skeleton should show. Instant in the gate / reduced-motion (deterministic).
export function useReveal(ready, minMs = 1000) {
  const born = useRef(0), [, bump] = useState(0);
  if (!born.current) born.current = now();
  if (isGate || reduced()) return !!ready;
  const left = born.current + minMs - now();
  useEffect(() => { if (ready && left > 0) { const id = setTimeout(() => bump((x) => x + 1), left + 20); return () => clearTimeout(id); } }, [ready, left > 0]);
  return !!ready && left <= 0;
}

// Content that fades in when it replaces a skeleton (smooth, fast). Frozen (final state) in the gate.
export const Reveal = ({ children, cls = "" }) => html`<div class=${`ms-reveal ${cls}`}>${children}</div>`;

// Loading — a LAST-RESORT modern loading block (a few decoding lines) for a view with no meaningful structure
// to show yet. Prefer rendering the real layout with atomic Scramble/Pixels slots instead of this.
export function Loading({ lines = [15, 22, 18, 25, 14] } = {}) {
  return html`<div class="flex flex-col gap-3 py-8 px-1" role="status" aria-busy="true">
    ${lines.map((n, i) => html`<div class="text-base-content/70 text-sm truncate" key=${i}><${Scramble} len=${n} /></div>`)}
  </div>`;
}
