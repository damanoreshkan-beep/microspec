// microspec runtime — modern loading placeholders. NO content-less spinners: the app chrome always shows,
// and pending content is a skeleton in place. Text decodes (a scramble of letters/digits that resolves into
// the value — also the reveal when an EN body is translated to the active locale); images are blinking
// pixels. Both are decorative (aria-hidden) and go INSTANT (final value, no animation) in the gate/preflight
// and under prefers-reduced-motion, so shots + e2e stay deterministic and the effect is device-only.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";

const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789абвгґдежзиклмнпрстуфхцч#%&/<>";
const rc = () => CH[(Math.random() * CH.length) | 0];
const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const forceAnim = typeof location !== "undefined" && location.search.includes("__anim");   // gate hook: exercise animations
const instant = () => !forceAnim && (isGate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches));

// Scramble — decode text. With `text`: scrambles then resolves into it (once, on each text change → the
// translation reveal). Without `text`: a placeholder bar of `len` scrambling chars. Inherits colour/size.
export function Scramble({ text, len = 14, cls = "", speed = 32 }) {
  const ref = useRef();
  const ph = !(typeof text === "string" && text.trim());               // placeholder (no value) vs real-value decode
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = ph ? null : text;
    const n = Math.max(1, Math.min(72, target ? target.length : len));
    if (instant()) { el.textContent = target ?? "".padEnd(n, "░"); return; }
    let timer, f = 0;
    const tick = () => {
      f++;
      if (target) { const done = Math.floor(f / 2); if (done >= n) { el.textContent = target; return; } el.textContent = target.slice(0, done) + target.slice(done).replace(/\S/g, rc); }
      else el.textContent = Array.from({ length: n }, rc).join("");
      timer = setTimeout(tick, speed);
    };
    tick();
    return () => clearTimeout(timer);
  }, [text, len]);
  // Placeholder text is decorative + mono (stable-width bars); a real-value decode inherits the normal font
  // and stays accessible (screen readers, and reduced-motion → instant final text, read the real value).
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

// Loading — drop-in modern loading block for a custom/tool view (replaces a spinner): a few decoding lines.
export function Loading({ lines = [15, 22, 18, 25, 14] } = {}) {
  return html`<div class="flex flex-col gap-3 py-8 px-1" role="status" aria-busy="true">
    ${lines.map((n, i) => html`<div class="text-base-content/70 text-sm truncate" key=${i}><${Scramble} len=${n} /></div>`)}
  </div>`;
}
