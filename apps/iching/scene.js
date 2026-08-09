// apps/iching/scene.js — the hexagram as a solid you can turn.
//
// A hexagram is not a picture, it is six stacked lines, so the 3D form is the stack itself: six rings on a
// vertical axis. Yang is a closed ring; yin is the same ring cut in two. The cuts are placed on OPPOSITE
// sides (0° and 180°) so a break is visible from any angle — a single gap would vanish as you turned it,
// and a figure that reads only from the front is a picture with extra steps.
//
// Movement keeps the notation the SVG established, translated into geometry rather than colour:
//   9  old yang   closed ring + a concentric halo ring   (about to open)
//   6  old yin    cut ring   + a concentric halo ring    (about to close)
// The halo is a shape, so it survives greyscale, both themes, and anyone who cannot separate two hues.
// Accent colour is added on top as reinforcement, never as the only signal.
//
// Farm rules this follows (reference_webgl_threejs_in_farm, and apps/rave/viz.js which proved them):
//   · `three` is LAZY-imported inside the effect and lives in this app's own import map. NOTE: it is in
//     apps/iching/index.html, which scaffold.mjs keeps rather than regenerates (scaffold.mjs:146) — a
//     `scaffold --force` would drop it and the scene would silently fall back to 2D.
//   · init is PROBE-guarded on getContext('webgl'), never gate-guarded: CI's headless Chrome renders the
//     real scene, while preflight's linkedom has no WebGL and no `three`, throws, and takes the 2D path.
//   · ONE renderer, disposed on unmount. DPR capped at 1.5. No GLSL — plain geometry and standard
//     materials, so what ships is verifiable from a screenshot.
//   · prefers-reduced-motion stops the idle spin; dragging still works.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { bitOf, isMoving } from "/_rt/iching.js";

const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// Geometry, in scene units. The pitch is wider than the tube so the stack reads as six DISTINCT levels
// rather than a cylinder — that separation is the whole legibility of a hexagram.
const R = 1.0, TUBE = 0.085, PITCH = 0.46, GAP_DEG = 26, HALO = 0.16;
const RAD = Math.PI / 180;

/** Build the six-ring figure. Returns the group plus a dispose(). */
function buildFigure(THREE, lines, ink, accent) {
  const group = new THREE.Group();
  const kept = [];
  const mat = (colour, dim) => {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.65 });
    if (dim) m.opacity = 0.9, m.transparent = true;
    kept.push(m);
    return m;
  };
  const inkMat = mat(ink), accentMat = mat(accent);

  lines.forEach((v, i) => {
    const yang = bitOf(v) === 1, moving = isMoving(v);
    const y = (i - 2.5) * PITCH;                       // index 0 is the BOTTOM line — it sits lowest
    const material = moving ? accentMat : inkMat;

    if (yang) {
      const g = new THREE.TorusGeometry(R, TUBE, 14, 96);
      kept.push(g);
      const m = new THREE.Mesh(g, material);
      m.rotation.x = Math.PI / 2;                      // lay the ring flat, around the vertical axis
      m.position.y = y;
      group.add(m);
    } else {
      // Two arcs with the gaps at 0° and 180°, so a break faces the viewer from either side.
      const arc = (Math.PI - 2 * GAP_DEG * RAD);
      for (const start of [GAP_DEG * RAD, Math.PI + GAP_DEG * RAD]) {
        const g = new THREE.TorusGeometry(R, TUBE, 14, 64, arc);
        kept.push(g);
        const m = new THREE.Mesh(g, material);
        m.rotation.x = Math.PI / 2;
        m.rotation.z = -start;                         // torus arcs start at +X and sweep counter-clockwise
        m.position.y = y;
        group.add(m);
      }
    }

    if (moving) {
      // The halo: a thinner concentric ring marking a line that is about to change. Geometry, not colour.
      const g = new THREE.TorusGeometry(R + HALO, TUBE * 0.45, 10, 72);
      kept.push(g);
      const m = new THREE.Mesh(g, accentMat);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      group.add(m);
    }
  });

  return {
    group,
    dispose() { for (const k of kept) { try { k.dispose?.(); } catch { /* */ } } },
  };
}

// The 2D path, for preflight (linkedom has no WebGL). Deliberately the same figure seen head-on, so a
// screenshot taken without WebGL still shows a hexagram rather than an empty box. linkedom returns a
// non-null 2d stub, so the context is checked for real methods before anything is drawn.
function ctx2d(canvas) {
  try { const c = canvas.getContext("2d"); return c && typeof c.arc === "function" && typeof c.stroke === "function" ? c : null; } catch { return null; }
}
function draw2D(canvas, lines, ink, accent) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height; if (!w || !h) return;
  const cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.3, pitch = Math.min(w, h) * 0.1;
  g.clearRect(0, 0, w, h);
  g.lineWidth = Math.max(2, Math.min(w, h) * 0.022);
  g.lineCap = "round";
  lines.forEach((v, i) => {
    const yang = bitOf(v) === 1, moving = isMoving(v);
    const y = cy + (2.5 - i) * pitch;                  // index 0 at the BOTTOM, as everywhere else
    g.strokeStyle = moving ? accent : ink;
    if (yang) { g.beginPath(); g.moveTo(cx - rad, y); g.lineTo(cx + rad, y); g.stroke(); }
    else {
      const gap = rad * 0.24;
      g.beginPath(); g.moveTo(cx - rad, y); g.lineTo(cx - gap, y); g.stroke();
      g.beginPath(); g.moveTo(cx + gap, y); g.lineTo(cx + rad, y); g.stroke();
    }
    if (moving) { g.beginPath(); g.arc(cx, y, rad * 0.1, 0, Math.PI * 2); g.stroke(); }
  });
}

/**
 * Full-bleed stage. `lines` are the cast, bottom-first. Drag turns the figure; it idles with a slow spin
 * so it reads as a solid before anyone touches it.
 */
export function HexStage({ lines }) {
  const ref = useRef();
  const store = useRef({ THREE: null, renderer: null, fig: null, scene: null, cam: null, raf: 0, yaw: 0.6, pitch: 0.35, spin: true }).current;

  useEffect(() => {
    const canvas = ref.current; if (!canvas || !lines) return;
    let dead = false;
    const css = getComputedStyle(document.documentElement);
    const ink = (css.getPropertyValue("--color-base-content") || "#e6e6e8").trim() || "#e6e6e8";
    const accent = (css.getPropertyValue("--color-primary") || "#c9a227").trim() || "#c9a227";

    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => {
      const [w, h] = dims(), dpr = DPR();
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (store.renderer) { store.renderer.setSize(canvas.width, canvas.height, false); store.cam.aspect = w / h; store.cam.updateProjectionMatrix(); }
      else draw2D(canvas, lines, ink, accent);
    };

    // Drag to turn. Pointer events rather than a controls addon: one dependency fewer, and the vertical
    // axis is clamped so the figure can never end up read edge-on, where six rings become six slivers.
    let dragging = false, lastX = 0, lastY = 0;
    const down = (e) => { dragging = true; store.spin = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      store.yaw += (e.clientX - lastX) * 0.008;
      store.pitch = Math.max(-0.9, Math.min(1.1, store.pitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    };
    const up = (e) => { dragging = false; try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* */ } };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    (async () => {
      if (hasWebGL()) {
        try {
          const THREE = await import("three"); if (dead) return;
          store.THREE = THREE;
          store.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
          store.scene = new THREE.Scene();
          store.cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
          store.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
          const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(3, 5, 4); store.scene.add(key);
          const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(-4, -1, -3); store.scene.add(rim);
          store.fig = buildFigure(THREE, lines, ink, accent);
          store.scene.add(store.fig.group);
        } catch { store.THREE = null; store.renderer = null; }
      }
      size();
      if (!store.renderer) return;                     // 2D path already drew; nothing to animate

      const idle = !reduced();
      const tick = () => {
        if (dead) return;
        if (store.spin && idle) store.yaw += 0.0035;
        const d = 5.4;
        store.cam.position.set(
          Math.sin(store.yaw) * Math.cos(store.pitch) * d,
          Math.sin(store.pitch) * d,
          Math.cos(store.yaw) * Math.cos(store.pitch) * d,
        );
        store.cam.lookAt(0, 0, 0);
        try { store.renderer.render(store.scene, store.cam); } catch { /* */ }
        store.raf = requestAnimationFrame(tick);
      };
      tick();
    })();

    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(size); ro.observe(canvas); }

    return () => {
      dead = true;
      cancelAnimationFrame(store.raf);
      ro?.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      try { store.fig?.dispose(); } catch { /* */ }
      try { store.renderer?.dispose(); } catch { /* */ }
      store.renderer = null; store.fig = null;
    };
  }, [lines && lines.join("")]);

  return html`<canvas ref=${ref} data-stage data-live class="fixed inset-0 z-0 w-full h-full touch-none"
    role="img" aria-label=${lines ? lines.join(" ") : ""}></canvas>`;
}
