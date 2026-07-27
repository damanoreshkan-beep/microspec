import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { mulberry32 } from "/_rt/groove.js";
import { letterTile } from "/_rt/tile.js";
import { Sheet } from "/_rt/ui.js";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));   
const MAX_AV = 12;                             

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v, f) => (cs.getPropertyValue(v).trim() || f);
  return { ink: g("--color-base-content", "#ECECEE"), accent: g("--color-secondary", "#9F8CF6") };
}

function constellation(n) {
  if (n <= 1) return [{ x: 0.5, y: 0.5 }];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.46 * Math.sqrt((i + 0.6) / n);
    const a = i * GOLDEN;
    pts.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
  }
  return pts;
}

export function Finale({ devs = [], t, open = false, onClose }) {
  const canvasRef = useRef(null);
  const n = devs.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.dataset.render = "2d";
    let raf = 0, dead = false, W = 0, H = 0, dpr = 1;
    const theme = readTheme();
    const rng = mulberry32(0x5eed51);    
    let stars = [];

    const seedStars = () => {
      const count = Math.min(220, Math.round((W * H) / 5200));
      stars = Array.from({ length: count }, () => ({
        x: rng() * W, y: rng() * H, r: 0.4 + rng() * 1.5,
        base: 0.25 + rng() * 0.5, phase: rng() * Math.PI * 2, speed: 0.4 + rng() * 1.1,
      }));
    };
    const resize = () => {
      dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
    };

    const hexA = (hex, a) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex);
      if (!m) return `rgba(200,200,220,${a})`;
      const v = parseInt(m[1], 16);
      return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
    };

    const draw = (time) => {
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.42;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
      g.addColorStop(0, hexA(theme.accent, 0.16));
      g.addColorStop(1, hexA(theme.accent, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const tw = s.base + 0.35 * Math.sin(time * s.speed + s.phase);
        ctx.globalAlpha = Math.max(0.05, Math.min(1, tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = theme.ink; ctx.fill();
      }
      ctx.globalAlpha = 1;

      const period = 3.4;
      for (let k = 0; k < 3; k++) {
        const p = ((time / period) + k / 3) % 1;
        const rad = p * Math.max(W, H) * 0.6;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(theme.accent, 0.28 * (1 - p));
        ctx.lineWidth = 1.5; ctx.stroke();
      }
    };

    const measure = () => { if (dead) return; resize(); if (gate) draw(0.6); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);

    if (!gate) {
      const t0 = performance.now();
      const loop = (now) => { if (dead) return; draw((now - t0) / 1000); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const shown = devs.slice(0, MAX_AV);
  const pts = constellation(shown.length);
  const extra = n - shown.length;
  const avatarSrc = (d) => (d.avatar
    ? `${d.avatar}${d.avatar.includes("?") ? "&" : "?"}size=120`
    : letterTile(d.name || d.owner || "?", { w: 96, h: 96, light: 32 }));   

  return html`<${Sheet} id="finale" open=${open} onClose=${onClose} size="lg" icon="lucide:sparkles"
    title=${T(t, "finaleTitle").replace("{n}", String(n))}>
    <div data-live class="flex flex-col gap-[var(--ms-gap)] min-w-0">
      <div class="sf-inset relative w-full h-[clamp(11rem,42dvh,20rem)] overflow-hidden rounded-[var(--ms-r)]">
        <canvas ref=${canvasRef} aria-hidden="true" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
        <div class="absolute inset-x-3 inset-y-8">
          ${shown.map((d, i) => html`<a key=${`${d.owner}/${d.repo}`} href=${d.url} target="_blank" rel="noopener"
            class="ms-reveal absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
            style=${`left:${pts[i].x * 100}%;top:${pts[i].y * 100}%;animation-delay:${i * 90}ms`}>
            <span class="relative block">
              <span class="absolute -inset-1.5 rounded-full blur-md" style="background:radial-gradient(circle,var(--color-secondary),transparent 70%);opacity:.5"></span>
              <img src=${avatarSrc(d)} alt=${d.name || d.owner} width="44" height="44" loading="lazy"
                class="relative w-11 h-11 rounded-full object-cover ring-2 ring-base-100 bg-base-300" />
            </span>
            <span class="text-[0.6rem] font-mono text-base-content/75 max-w-[5rem] truncate">${d.name || d.owner}</span>
          </a>`)}
        </div>
        
        ${extra > 0 ? html`<div class="absolute right-3 bottom-2 text-xs font-medium text-muted">${T(t, "andMore").replace("{n}", String(extra))}</div>` : null}
      </div>

      <p class="text-sm text-base-content/70 leading-relaxed text-center max-w-xs mx-auto">${T(t, "finaleBody")}</p>
      <button class="btn btn-primary rounded-2xl gap-2 self-center" data-haptic="bump" onClick=${onClose}>
        ${T(t, "finaleBack")}<iconify-icon icon="lucide:arrow-right"></iconify-icon>
      </button>
    </div>
  </${Sheet}>`;
}
