// apps/sigil/viz.js — the Forge's cosmic kaleidoscope + the theme-safe 2D renderer (fallback / thumbnails /
// share). See apps/sigil/RESEARCH.md "Visual system v2".
//
// The scene lives on a canvas INSIDE the Forge view (fixed z-0, content z-10) — the app's body stays opaque,
// so every tab's text keeps its contrast (an app-wide transparent backdrop fought the a11y gate; the cosmos
// belongs on the hero screen). Probe-guarded on getContext('webgl') (NOT gate-guarded) → CI's headless Chrome
// renders the real 3D; no WebGL → the Canvas2D kaleidoscope. No GLSL (Points / Sprites / meshes + additive
// bloom, CPU-driven) so the `render=webgl` regression gate stays honest and every frame is verifiable.
//
// Layers, designed per-frame:
//   • star field   — 3 parallax layers of additive Points: slow drift + opacity breathing + gyro parallax.
//   • nebula       — 2 soft radial-gradient sprites (additive): drift + breathe.
//   • kaleidoscope — the sigil tube in 6-fold mirror symmetry (a living mandala): counter-rotate + breathe.
//   • cosmic draw  — eased drawRange 0→1; a bright forge-head sprite rides the curve, trailing spark sprites.
// Theme-adaptive (ink=--color-base-content, accent=--color-primary): deep-space in dark, faint in light.

import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { tilt } from "/_rt/sensors.js";
import { smooth } from "/_rt/sigil.js";

const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
const SECTORS = 6;

function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec((h || "").trim()); if (!m) return [236, 236, 238]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function readTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--color-base-content").trim() || "#ECECEE";
    const accent = cs.getPropertyValue("--color-primary").trim() || "#8B7CF6";
    const dt = document.documentElement.getAttribute("data-theme");
    const dark = dt ? dt !== "light" : (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
    return { ink, accent, dark };
  } catch { return { ink: "#ECECEE", accent: "#8B7CF6", dark: true }; }
}
function radialTex(THREE, rgb) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
  grd.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`);
  grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// ---- gyro immersion (optional; disabled in the gate) ----
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

// ---- scene builders ----
function buildStars(THREE, scene, col) {
  const stars = [];
  const LAYERS = [{ n: 850, z: [-22, -12], size: 0.05, drift: 0.006, par: 0.05, op: col.dark ? 0.9 : 0.14 },
                  { n: 850, z: [-12, -6], size: 0.07, drift: 0.011, par: 0.11, op: col.dark ? 0.8 : 0.11 },
                  { n: 550, z: [-6, -2.5], size: 0.10, drift: 0.02, par: 0.2, op: col.dark ? 0.7 : 0.09 }];
  const ink = hexRgb(col.ink), acc = hexRgb(col.accent), tex = radialTex(THREE, [255, 255, 255]);
  for (const L of LAYERS) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(L.n * 3), c = new Float32Array(L.n * 3);
    for (let i = 0; i < L.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 26; pos[i * 3 + 2] = L.z[0] + Math.random() * (L.z[1] - L.z[0]);
      const cc = Math.random() < 0.16 ? acc : ink; c[i * 3] = cc[0] / 255; c[i * 3 + 1] = cc[1] / 255; c[i * 3 + 2] = cc[2] / 255;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    const mat = new THREE.PointsMaterial({ size: L.size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: L.op, blending: THREE.AdditiveBlending, depthWrite: false, map: tex });
    const pts = new THREE.Points(geo, mat); scene.add(pts);
    stars.push({ pts, mat, baseOp: L.op, drift: L.drift, par: L.par, tw: 0.3 + Math.random() * 0.4 });
  }
  return stars;
}
function buildNebula(THREE, scene, col) {
  const neb = [];
  const specs = [{ rgb: hexRgb(col.accent), s: 11, x: -2.5, y: 1.6, z: -8, op: col.dark ? 0.22 : 0.05, spin: 0.01, br: 0.25 },
                 { rgb: hexRgb(col.ink), s: 9, x: 3, y: -2, z: -9, op: col.dark ? 0.1 : 0.03, spin: -0.007, br: 0.18 }];
  for (const s of specs) {
    const mat = new THREE.SpriteMaterial({ map: radialTex(THREE, s.rgb), transparent: true, opacity: s.op, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = new THREE.Sprite(mat); sp.scale.setScalar(s.s); sp.position.set(s.x, s.y, s.z); scene.add(sp);
    neb.push({ sp, baseOp: s.op, baseS: s.s, spin: s.spin, br: s.br, phase: Math.random() * 6 });
  }
  return neb;
}
function buildMandala(THREE, col, sig) {
  const mandala = new THREE.Group(); mandala.position.y = 0.32; mandala.scale.setScalar(0.58);
  const INK = new THREE.Color(col.ink), ACC = new THREE.Color(col.accent);
  const s = sig.seed >>> 0, zAmp = 0.14 + ((s % 97) / 97) * 0.14;
  const v3 = sig.points.map((p, i) => new THREE.Vector3(p.x, p.y, Math.sin(i * 1.3 + (s % 13)) * zAmp));
  const curve = new THREE.CatmullRomCurve3(v3, false, "catmullrom", 0.5);
  const SEG = Math.max(60, sig.points.length * 24);
  const tubeGeo = new THREE.TubeGeometry(curve, SEG, 0.022, 10, false);
  const glowGeo = new THREE.TubeGeometry(curve, SEG, 0.055, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({ color: INK, metalness: 0.92, roughness: 0.2, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: col.dark ? 0.18 : 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  let sector0;
  for (let k = 0; k < SECTORS; k++) {
    const sg = new THREE.Group(); sg.rotation.z = (k * Math.PI * 2) / SECTORS; sg.scale.x = k % 2 ? -1 : 1;
    sg.add(new THREE.Mesh(glowGeo, glowMat), new THREE.Mesh(tubeGeo, tubeMat));
    mandala.add(sg); if (k === 0) sector0 = sg;
  }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(THREE, hexRgb(col.accent)), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  head.scale.setScalar(0.14); sector0.add(head);
  const sparkTex = radialTex(THREE, [255, 255, 255]), sparks = [];
  for (let i = 0; i < 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.001); sector0.add(sp); sparks.push({ sp, life: 0 }); }
  return { group: mandala, curve, tubeGeo, glowGeo, head, sparks, sparkI: 0, reveal: 0, totalIdx: tubeGeo.index.count, glowIdx: glowGeo.index.count, scratch: new THREE.Vector3() };
}
function disposeObj(o) { o.traverse((n) => { n.geometry?.dispose?.(); const m = n.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.(); }); }

// =========================================================================================
// SigilStage — self-contained: builds the cosmos + mandala on its OWN canvas (z-0 in the Forge view),
// leaves the app body opaque. Carries the diagnostic marker (data-sigil / data-render / data-err).
// =========================================================================================
export function SigilStage({ sigil }) {
  const ref = useRef();
  const store = useRef({ THREE: null, renderer: null, scene: null, cam: null, stars: [], nebula: [], m: null, raf: null, ro: null, mo: null, t0: 0, err: null, col: null }).current;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let dead = false;
    const mark = () => { try { canvas.dataset.haswebgl = hasWebGL() ? "yes" : "no"; canvas.dataset.render = store.scene ? "webgl" : "2d"; if (store.err) canvas.dataset.err = String(store.err.message || store.err).slice(0, 140); } catch { /* */ } };
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => { const [w, h] = dims(), dpr = DPR(); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); if (store.renderer) { store.renderer.setSize(canvas.width, canvas.height, false); store.cam.aspect = w / h; store.cam.updateProjectionMatrix(); } };

    store.rebuildMandala = (sig) => {
      if (!store.THREE) return;
      if (store.m) { store.scene.remove(store.m.group); disposeObj(store.m.group); store.m = null; }
      if (sig) { store.m = buildMandala(store.THREE, store.col, sig); store.scene.add(store.m.group); }
      mark();
    };

    const start2D = () => {
      size();
      if (typeof requestAnimationFrame !== "undefined") { const loop = () => { if (dead) return; draw2D(canvas, store.sigil, { live: true }); store.raf = requestAnimationFrame(loop); }; store.raf = requestAnimationFrame(loop); }
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
      mark();
    };

    store.sigil = sigil;
    if (!hasWebGL()) { start2D(); return () => { dead = true; if (store.raf) cancelAnimationFrame(store.raf); store.ro?.disconnect(); }; }

    (async () => {
      const THREE = await import("three").catch((e) => { store.err = e; return null; });
      if (!THREE || dead) { if (!dead) start2D(); return; }
      store.THREE = THREE;
      const col = store.col = readTheme();
      const renderer = store.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setClearColor(0x000000, 0);
      const scene = store.scene = new THREE.Scene();
      const cam = store.cam = new THREE.PerspectiveCamera(52, 1, 0.1, 100); cam.position.set(0, 0, 5);
      scene.add(new THREE.AmbientLight(0xffffff, col.dark ? 0.5 : 0.8));
      store.key = new THREE.PointLight(col.accent, col.dark ? 32 : 18, 40, 2); store.key.position.set(1.6, 1.4, 3); scene.add(store.key);
      store.fill = new THREE.PointLight(0xffffff, col.dark ? 6 : 10, 40, 2); store.fill.position.set(-2, -1.5, 3); scene.add(store.fill);
      store.stars = buildStars(THREE, scene, col);
      store.nebula = buildNebula(THREE, scene, col);
      store.rebuildMandala(store.sigil);
      size();
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
      if (typeof MutationObserver !== "undefined") { store.mo = new MutationObserver(() => { store.col = readTheme(); store.rebuildMandala(store.sigil); }); store.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); }
      const loop = (ms) => { if (dead) return; store.t0 ||= ms; frame(store, (ms - store.t0) / 1000); renderer.render(scene, cam); store.raf = requestAnimationFrame(loop); };
      store.raf = requestAnimationFrame(loop);
      mark();
    })();

    return () => { dead = true; if (store.raf) cancelAnimationFrame(store.raf); store.ro?.disconnect(); store.mo?.disconnect(); if (store.scene) disposeObj(store.scene); try { store.renderer?.dispose?.(); } catch { /* */ } store.renderer = store.scene = store.m = null; };
  }, []);
  useEffect(() => { store.sigil = sigil; store.rebuildMandala?.(sigil); }, [sigil && sigil.seed]);
  return html`<canvas ref=${ref} data-sigil data-live aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

// one animation iteration: every layer, considered
function frame(store, t) {
  const red = immersion.reduced;
  const gx = immersion.on ? Math.max(-1, Math.min(1, immersion.gamma / 45)) : 0;
  const gy = immersion.on ? Math.max(-1, Math.min(1, immersion.beta / 45)) : 0;
  for (const L of store.stars) {
    if (!red) L.pts.rotation.z += L.drift * 0.05;
    L.pts.position.x = gx * L.par; L.pts.position.y = -gy * L.par;
    L.mat.opacity = L.baseOp * (0.82 + 0.18 * Math.sin(t * L.tw));
  }
  for (const n of store.nebula) {
    if (!red) n.sp.material.rotation += n.spin * 0.02;
    n.sp.scale.setScalar(n.baseS * (1 + 0.05 * Math.sin(t * n.br + n.phase)));
    n.sp.material.opacity = n.baseOp * (0.75 + 0.25 * Math.sin(t * n.br * 0.7 + n.phase));
  }
  const M = store.m;
  if (M) {
    M.reveal = Math.min(1, M.reveal + 0.011);
    const e = M.reveal * M.reveal * (3 - 2 * M.reveal);
    M.tubeGeo.setDrawRange(0, Math.max(6, Math.floor(M.totalIdx * e)));
    M.glowGeo.setDrawRange(0, Math.max(6, Math.floor(M.glowIdx * e)));
    if (!red) { M.group.rotation.z += 0.0016; M.group.rotation.x = gy * 0.25; M.group.rotation.y = gx * 0.25; }
    M.group.scale.setScalar(0.58 * (1 + 0.02 * Math.sin(t * 0.6)));
    if (M.reveal < 1) {
      M.curve.getPoint(M.reveal, M.scratch);
      M.head.position.copy(M.scratch); M.head.material.opacity = 0.9; M.head.scale.setScalar(0.12 + 0.05 * Math.sin(t * 9));
      const sp = M.sparks[M.sparkI = (M.sparkI + 1) % M.sparks.length];
      sp.sp.position.set(M.scratch.x + (Math.random() - 0.5) * 0.05, M.scratch.y + (Math.random() - 0.5) * 0.05, M.scratch.z); sp.life = 1;
    } else { M.head.material.opacity *= 0.9; }
    for (const s of M.sparks) { if (s.life > 0) { s.life *= 0.9; s.sp.material.opacity = s.life * 0.8; s.sp.scale.setScalar(0.02 + 0.05 * s.life); } }
    const a = t * 0.6; store.key.position.set(Math.cos(a) * 2.4, Math.sin(a * 0.8) * 1.8 + 0.6, 3);
  }
}

// =========================================================================================
// 2D kaleidoscope renderer — fallback + grimoire thumbnails + shared talisman PNG.
// =========================================================================================
export function draw2D(canvas, sigil, opts = {}) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx || !sigil) return;
  const W = canvas.width || 0, H = canvas.height || 0; if (!W || !H) return;
  const theme = opts.live ? readTheme() : { ink: "#ECECEE", accent: "#8B7CF6", dark: true };
  const cx = W / 2, cy = opts.live ? H * 0.42 : H / 2, R = Math.min(W, H) * 0.34;
  ctx.clearRect(0, 0, W, H);
  if (!opts.live) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7); g.addColorStop(0, "#141018"); g.addColorStop(1, "#070709"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const sm = smooth(sigil.points, 16).map((p) => [p.x * R, -p.y * R]);
  const [sx, sy] = [sigil.start.x * R, -sigil.start.y * R], sr = sigil.start.r * R * 1.3;
  const [ex, ey] = [sigil.end.x * R, -sigil.end.y * R], bl = sigil.end.len * R;
  const arm = () => {
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = theme.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = Math.max(6, R * 0.05);
    ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = theme.ink; ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, R * 0.018);
    ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, R * 0.014); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex - Math.cos(sigil.end.a) * bl, ey + Math.sin(sigil.end.a) * bl); ctx.lineTo(ex + Math.cos(sigil.end.a) * bl, ey - Math.sin(sigil.end.a) * bl); ctx.stroke();
  };
  ctx.save(); ctx.translate(cx, cy); ctx.scale(0.62, 0.62);
  for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate((k * Math.PI * 2) / 6); if (k % 2) ctx.scale(-1, 1); arm(); ctx.restore(); }
  ctx.restore(); ctx.globalAlpha = 1;
}
export function sigilToDataURL(sigil, size = 640) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw2D(c, sigil, { live: false });
  try { return c.toDataURL("image/png"); } catch { return null; }
}
