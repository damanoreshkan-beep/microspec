import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";

const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789абвгґдежзиклмнпрстуфхцч#%&/<>";
const rc = () => CH[(Math.random() * CH.length) | 0];
const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const instant = () => isGate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export function Scramble({ text, len = 14, cls = "", speed = 32 }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = (typeof text === "string" && text) ? text : null;
    const n = Math.max(1, Math.min(72, target ? target.length : len));
    if (instant()) { el.textContent = target ?? "".padEnd(n, "░"); return; }
    let timer, f = 0;
    const tick = () => {
      f++;
      if (target) { const done = Math.floor(f / 2); el.textContent = target.slice(0, done) + target.slice(done).replace(/\S/g, rc); if (done >= n) { el.textContent = target; return; } }
      else el.textContent = Array.from({ length: n }, rc).join("");
      timer = setTimeout(tick, speed);
    };
    tick();
    return () => clearTimeout(timer);
  }, [text, len]);
  return html`<span ref=${ref} aria-hidden="true" class=${`font-mono tracking-tight ${cls}`}></span>`;
}

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

export function Loading({ lines = [15, 24, 19, 27, 16] } = {}) {
  return html`<div class="flex flex-col gap-3 py-8 px-1" role="status" aria-busy="true">
    ${lines.map((n, i) => html`<div class="text-base-content/70 text-sm" key=${i}><${Scramble} len=${n} /></div>`)}
  </div>`;
}
