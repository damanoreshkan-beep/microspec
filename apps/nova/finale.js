// nova — the finale. A full-screen star-field celebrating the developers you lifted today: their avatars
// arranged as a constellation over a live canvas of twinkling stars and expanding rings.
//
// WHY Canvas2D, not WebGL. The star-field draws no external images (avatars are DOM <img> layered above), so
// the canvas never taints and needs no CORS dance, it runs everywhere, and — crucially — it is deterministic
// under the headless gate: seeded with mulberry32 and frozen to a single frame when `gate`, so the shot is
// reproducible. The math (star seeding, ring phase) is trivially reused; nothing here needs three.js.
//
// The canvas is decorative (aria-hidden, pointer-events-none) and sits behind an OPAQUE body, so the axe
// contrast gate reads the real foreground. Theme-aware: it re-reads --color-base-content / --color-secondary.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { mulberry32 } from "/_rt/groove.js";
import { letterTile } from "/_rt/tile.js";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // 137.5° — the angle that spreads points without clumping
const MAX_AV = 12;                             // constellation caps here; the rest fold into a "+N" chip

// Read the two theme tokens the scene paints with (ink for stars, accent for rings). Re-read on each mount so
// a theme flip before opening the finale is honoured.
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v, f) => (cs.getPropertyValue(v).trim() || f);
  return { ink: g("--color-base-content", "#ECECEE"), accent: g("--color-secondary", "#9F8CF6") };
}

// Position n avatars on a golden-angle spiral inside a unit box (0..1), returned as {x,y} fractions. One point
// sits dead centre; the rest spiral out evenly. Deterministic — same n → same constellation.
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

export function Finale({ devs = [], t, onClose }) {
  const canvasRef = useRef(null);
  const n = devs.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.dataset.render = "2d";
    let raf = 0, dead = false, W = 0, H = 0, dpr = 1;
    const theme = readTheme();
    const rng = mulberry32(0x5eed51);    // fixed seed → the same star-field every time (gate-reproducible)
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

      // soft central glow — the light the constellation sits in
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
      g.addColorStop(0, hexA(theme.accent, 0.16));
      g.addColorStop(1, hexA(theme.accent, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // twinkling stars
      for (const s of stars) {
        const tw = s.base + 0.35 * Math.sin(time * s.speed + s.phase);
        ctx.globalAlpha = Math.max(0.05, Math.min(1, tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = theme.ink; ctx.fill();
      }
      ctx.globalAlpha = 1;

      // three expanding rings radiating from the centre — the "star effect" of the reveal, gently looping
      const period = 3.4;
      for (let k = 0; k < 3; k++) {
        const p = ((time / period) + k / 3) % 1;
        const rad = p * Math.max(W, H) * 0.6;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(theme.accent, 0.28 * (1 - p));
        ctx.lineWidth = 1.5; ctx.stroke();
      }
    };

    resize();
    const onResize = () => { if (!dead) resize(); };
    addEventListener("resize", onResize);

    if (gate) {
      // deterministic single frame — no motion for the shot / reduced-motion users
      draw(0.6);
    } else {
      const t0 = performance.now();
      const loop = (now) => { if (dead) return; draw((now - t0) / 1000); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { dead = true; cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
  }, []);

  const shown = devs.slice(0, MAX_AV);
  const pts = constellation(shown.length);
  const extra = n - shown.length;
  const avatarSrc = (d) => (d.avatar
    ? `${d.avatar}${d.avatar.includes("?") ? "&" : "?"}size=120`
    : letterTile(d.name || d.owner || "?", { w: 96, h: 96, light: 32 }));   // letterTile already returns a data URI

  return html`<div data-live role="dialog" aria-modal="true"
    class="fixed inset-0 z-40 bg-base-100 overflow-hidden flex flex-col"
    style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
    <canvas ref=${canvasRef} aria-hidden="true" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>

    <button id="finale-close" class="btn btn-ghost btn-sm btn-circle absolute right-3 z-20" style="top:calc(env(safe-area-inset-top) + 0.5rem)"
      aria-label=${T(t, "close")} onClick=${onClose}>
      <iconify-icon icon="lucide:x" class="text-xl"></iconify-icon>
    </button>

    <!-- constellation of the developers you lifted -->
    <div class="relative z-10 flex-1 min-h-0 mx-auto w-full max-w-md">
      <div class="absolute inset-x-4 top-[6%] bottom-[34%]">
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
        ${extra > 0 ? html`<div class="absolute left-1/2 bottom-0 -translate-x-1/2 text-xs font-medium text-base-content/60">${T(t, "andMore").replace("{n}", String(extra))}</div>` : null}
      </div>
    </div>

    <!-- the message -->
    <div class="relative z-10 text-center px-8 pb-[env(safe-area-inset-bottom)] mb-6 space-y-2">
      <div class="inline-flex items-center gap-2 text-secondary">
        <iconify-icon icon="lucide:sparkles" class="text-lg"></iconify-icon>
      </div>
      <h1 class="text-2xl font-extrabold tracking-tight">${T(t, "finaleTitle").replace("{n}", String(n))}</h1>
      <p class="text-sm text-base-content/70 leading-relaxed max-w-xs mx-auto">${T(t, "finaleBody")}</p>
      <button class="btn btn-primary rounded-2xl gap-2 mt-3" data-haptic="bump" onClick=${onClose}>
        ${T(t, "finaleBack")}<iconify-icon icon="lucide:arrow-right"></iconify-icon>
      </button>
    </div>
  </div>`;
}
