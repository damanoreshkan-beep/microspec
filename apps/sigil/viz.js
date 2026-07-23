// apps/sigil/viz.js — the forged-talisman 3D layer + the theme-safe 2D renderer (thumbnails / share / gate).
//
// Following reference_webgl_threejs_in_farm and the rave pattern: `three` is LAZY-imported inside the effect,
// init is PROBE-guarded on getContext('webgl') — NOT gate-guarded — so CI's headless Chrome renders the real
// 3D while preflight's linkedom (no WebGL, no `three` in its map) throws → caught → the Canvas2D fallback.
//
// Powerful/unusual, but screenshot-verifiable (no GLSL): the sigil curve → CatmullRomCurve3 (hash-seeded
// gentle z-relief → a ribbon in space) → TubeGeometry, drawn as a MeshStandardMaterial METAL lit by ONE
// moving PointLight, so a real specular glint travels along the forged line. A "forge" reveal animates the
// tube's index drawRange 0→full; visited kamea nodes flare (accent), the rest stay dim ink. Gyro (tilt) is an
// optional immersion behind a gesture (NOT a required reading) — when absent, a seeded idle keeps the shot
// alive. Perf (rave-proven): ONE reused WebGLRenderer, DPR ≤ 1.5, geometry disposed+rebuilt on regenerate,
// scratch hoisted, additive back-shell for glow, no post-processing. Theme colours are read from CSS vars
// (ink = --color-base-content, accent = --color-primary) and refreshed on a data-theme MutationObserver, so
// the filament stays legible — and flips — in both light and dark.

import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { tilt } from "/_rt/sensors.js";
import { smooth } from "/_rt/sigil.js";

const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }

// ---- theme read: ink filament + accent from the live CSS vars, so it obeys the theme in both directions ----
function readTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--color-base-content").trim() || "#ECECEE";
    const accent = cs.getPropertyValue("--color-primary").trim() || "#8B7CF6";
    const dark = matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.getAttribute("data-theme") !== "light";
    return { ink, accent, dark };
  } catch { return { ink: "#ECECEE", accent: "#8B7CF6", dark: true }; }
}

// ---- gyro immersion (optional, gesture-gated like rave; disabled in the gate) ----
const immersion = { on: false, beta: 0, gamma: 0, reduced: reducedMotion, _t: null };
export const immersionAvailable = tilt.supported && !isGate;
export async function enableImmersion() {
  if (immersion.on || isGate || !tilt.supported) return false;
  const ok = await tilt.request().catch(() => false);
  if (!ok) return false;
  immersion.on = true;
  immersion._t = tilt.start(({ beta, gamma }) => { immersion.beta = beta || 0; immersion.gamma = gamma || 0; });
  return true;
}
export function disableImmersion() { immersion._t?.(); immersion.on = false; immersion._t = null; immersion.beta = immersion.gamma = 0; }

// ========================= the three.js scene (built from a sigilPath object) =========================
// Contract: makeScene(THREE, sigil) → { scene, cam, group, frame(t), reveal, resize(w,h), setTheme(c), dispose() }.
function makeScene(THREE, sigil) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 100); cam.position.set(0, 0, 3.35);
  const group = new THREE.Group(); scene.add(group);
  group.position.y = 0.34; group.scale.setScalar(0.84);   // centre the glyph in the open canvas above the island
  let col = readTheme();
  const INK = new THREE.Color(col.ink), ACC = new THREE.Color(col.accent);

  scene.add(new THREE.AmbientLight(0xffffff, col.dark ? 0.55 : 0.75));
  const key = new THREE.PointLight(col.accent, col.dark ? 34 : 18, 40, 2); key.position.set(1.6, 1.4, 2.4); group.add(key);
  const fill = new THREE.PointLight(0xffffff, col.dark ? 6 : 10, 40, 2); fill.position.set(-2, -1.5, 2); group.add(fill);

  // 3D control points from the sigil (hash-seeded z-relief so the ribbon lives in space)
  const s = sigil.seed >>> 0;
  const zAmp = 0.16 + ((s % 97) / 97) * 0.16;
  const v3 = sigil.points.map((p, i) => new THREE.Vector3(p.x, p.y, Math.sin(i * 1.3 + (s % 13)) * zAmp));
  const curve = new THREE.CatmullRomCurve3(v3, false, "catmullrom", 0.5);
  const SEG = Math.max(48, sigil.points.length * 22);
  const tubeGeo = new THREE.TubeGeometry(curve, SEG, 0.026, 10, false);
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ color: INK, metalness: 0.94, roughness: 0.19, envMapIntensity: 1 }));
  // additive back-shell glow (helps on dark, negligible on light — legibility comes from the solid tube)
  const glowGeo = new THREE.TubeGeometry(curve, SEG, 0.06, 8, false);
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: col.dark ? 0.16 : 0.09, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  group.add(glow, tube);
  const totalIdx = tubeGeo.index.count, glowIdx = glowGeo.index.count;

  // kamea lattice — a faint node grid; struck cells flare (accent), the rest are dim ink
  const visited = new Set(sigil.cells.map(([r, c]) => `${r},${c}`));
  const nodes = sigil.nodes; const NN = nodes.length;
  const ndGeo = new THREE.SphereGeometry(1, 8, 8);
  const nodeMesh = new THREE.InstancedMesh(ndGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false }), NN);
  const cellW = (1.62 / sigil.order);
  const d = new THREE.Object3D(), C = new THREE.Color();
  const nodeVisited = [];
  for (let i = 0; i < NN; i++) {
    const n = nodes[i]; const isV = i < NN && visited.has(nodeCellKey(n, sigil));
    nodeVisited.push(isV);
    d.position.set(n.x, n.y, -0.02); d.scale.setScalar(isV ? cellW * 0.09 : cellW * 0.05); d.updateMatrix();
    nodeMesh.setMatrixAt(i, d.matrix);
    nodeMesh.setColorAt(i, C.copy(isV ? ACC : INK).multiplyScalar(isV ? 1 : 0.5));
  }
  nodeMesh.instanceMatrix.needsUpdate = true; if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
  group.add(nodeMesh);

  // start ring + end bar (the traditional marks)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(sigil.start.r * 1.3, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: INK, metalness: 0.9, roughness: 0.3 }));
  ring.position.set(sigil.start.x, sigil.start.y, 0.02); group.add(ring);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(sigil.end.len * 2, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: INK, metalness: 0.9, roughness: 0.3 }));
  bar.position.set(sigil.end.x, sigil.end.y, 0.02); bar.rotation.z = sigil.end.a; group.add(bar);

  let reveal = 0;            // 0→1 forge progress
  return {
    scene, cam, group,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    setTheme(c) {
      INK.set(c.ink); ACC.set(c.accent);
      tube.material.color.copy(INK); glow.material.color.copy(ACC); glow.material.opacity = c.dark ? 0.16 : 0.09;
      key.color.set(c.accent); key.intensity = c.dark ? 26 : 16; fill.intensity = c.dark ? 6 : 10;
      ring.material.color.copy(INK); bar.material.color.copy(INK);
      for (let i = 0; i < NN; i++) nodeMesh.setColorAt(i, C.copy(nodeVisited[i] ? ACC : INK).multiplyScalar(nodeVisited[i] ? 1 : 0.5));
      if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
    },
    frame(t) {
      reveal = Math.min(1, reveal + 0.018);
      const eased = reveal * reveal * (3 - 2 * reveal);
      tubeGeo.setDrawRange(0, Math.max(6, Math.floor(totalIdx * eased)));
      glowGeo.setDrawRange(0, Math.max(6, Math.floor(glowIdx * eased)));
      // orbit the key light → a specular glint travels the filament
      const a = t * 0.6; key.position.set(Math.cos(a) * 2.2, Math.sin(a * 0.8) * 1.6 + 0.6, 2.4);
      if (immersion.on && !immersion.reduced) {
        group.rotation.y += 0.06 * ((immersion.gamma / 45) - group.rotation.y);
        group.rotation.x += 0.06 * ((-immersion.beta / 90 + 0.2) - group.rotation.x);
      } else if (!immersion.reduced) {
        group.rotation.y = Math.sin(t * 0.35) * 0.34;
        group.rotation.x = Math.sin(t * 0.24) * 0.12;
      }
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.(); }); },
  };
}
// nodes carry {x,y,v}; map a node to its [row,col] key via its position within the order grid
function nodeCellKey(n, sigil) {
  const span = 1.62, cell = span / sigil.order;
  const c = Math.round((n.x + span / 2 - cell / 2) / cell);
  const r = Math.round((span / 2 - cell / 2 - n.y) / cell);
  return `${r},${c}`;
}

// ========================= the full-bleed stage component =========================
// Fixed z-0, behind the floating islands (relative z-10). Rebuilds the scene when `sigil` changes identity.
export function SigilStage({ sigil }) {
  const ref = useRef();
  const store = useRef({ renderer: null, THREE: null, scene: null, raf: null, ro: null, mo: null, t0: 0 }).current;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let dead = false;
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => { const [w, h] = dims(), dpr = DPR(), bw = Math.round(w * dpr), bh = Math.round(h * dpr); canvas.width = bw; canvas.height = bh; store.renderer?.setSize(bw, bh, false); store.scene?.resize(bw, bh); };
    store.build = () => {
      if (!store.THREE || !store.sigil) return;
      try { store.scene?.dispose?.(); store.scene = makeScene(store.THREE, store.sigil); const [w, h] = dims(), dpr = DPR(); store.scene.resize(Math.round(w * dpr), Math.round(h * dpr)); } catch { store.scene = null; }
    };
    (async () => {
      if (hasWebGL() && store.sigil) {
        try {
          const THREE = await import("three"); if (dead) return; store.THREE = THREE;
          store.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
          store.renderer.setClearColor(0x000000, 0);
          store.build();
        } catch { store.THREE = null; store.renderer = null; }
      }
      size();
      const loop = (ms) => {
        if (dead) return;
        const t = (store.t0 ||= ms, (ms - store.t0) / 1000);
        if (store.scene && store.renderer) { try { store.scene.frame(t); store.renderer.render(store.scene.scene, store.scene.cam); } catch { /* */ } }
        else draw2D(canvas, store.sigil, { live: true });
        store.raf = requestAnimationFrame(loop);
      };
      store.raf = requestAnimationFrame(loop);
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
      if (typeof MutationObserver !== "undefined") { store.mo = new MutationObserver(() => store.scene?.setTheme(readTheme())); store.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); }
    })();
    return () => { dead = true; if (store.raf) cancelAnimationFrame(store.raf); store.ro?.disconnect(); store.mo?.disconnect(); store.scene?.dispose?.(); try { store.renderer?.dispose?.(); } catch { /* */ } store.renderer = null; };
  }, []);
  useEffect(() => { store.sigil = sigil; if (store.THREE) store.build(); else if (store.scene === null) { /* fallback picks it up via store.sigil */ } }, [sigil && sigil.seed]);
  return html`<canvas ref=${ref} data-sigil data-live aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

// ========================= the theme-safe Canvas2D renderer (fallback + thumbnails + share) =========================
// Draws the smoothed sigil path + kamea dots. `opts.live` reads the page theme (gate/fallback on the stage);
// otherwise it renders a self-contained dark "talisman card" for thumbnails and the shared image.
export function draw2D(canvas, sigil, opts = {}) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx || !sigil) return;
  const W = canvas.width || 0, H = canvas.height || 0; if (!W || !H) return;
  const theme = opts.live ? readTheme() : { ink: "#ECECEE", accent: "#8B7CF6", dark: true };
  const R = Math.min(W, H) * 0.4, cx = W / 2, cy = H / 2;
  const to = (p) => [cx + p.x * R, cy - p.y * R];
  ctx.clearRect(0, 0, W, H);
  if (!opts.live) { ctx.fillStyle = "#0A0A0B"; ctx.fillRect(0, 0, W, H); }

  // faint kamea nodes
  const cellW = (1.62 / sigil.order) * R;
  const visited = new Set(sigil.cells.map(([r, c]) => `${r},${c}`));
  for (const n of sigil.nodes) {
    const [x, y] = to(n); const isV = visited.has(nodeCellKey(n, sigil));
    ctx.beginPath(); ctx.arc(x, y, isV ? cellW * 0.09 : cellW * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = isV ? theme.accent : theme.ink; ctx.globalAlpha = isV ? 0.95 : 0.28; ctx.fill();
  }
  ctx.globalAlpha = 1;

  // the smoothed filament
  const sm = smooth(sigil.points, 16).map(to);
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = theme.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = Math.max(6, R * 0.055);
  ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = theme.ink; ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, R * 0.02);
  ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();

  // start ring + end bar
  const [sx, sy] = to(sigil.start); ctx.beginPath(); ctx.arc(sx, sy, sigil.start.r * R * 1.3, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, R * 0.016); ctx.strokeStyle = theme.ink; ctx.stroke();
  const [ex, ey] = to(sigil.end); const bl = sigil.end.len * R;
  ctx.beginPath(); ctx.moveTo(ex - Math.cos(sigil.end.a) * bl, ey + Math.sin(sigil.end.a) * bl); ctx.lineTo(ex + Math.cos(sigil.end.a) * bl, ey - Math.sin(sigil.end.a) * bl); ctx.stroke();
}

// Render a sigil to a data-URL PNG at `size` px — the shareable talisman card (dark, self-contained).
export function sigilToDataURL(sigil, size = 640) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw2D(c, sigil, { live: false });
  try { return c.toDataURL("image/png"); } catch { return null; }
}
