// apps/sigil/viz.js — the app-wide COSMIC KALEIDOSCOPE system + the theme-safe 2D renderer (fallback /
// thumbnails / share). See apps/sigil/RESEARCH.md "Visual system v2".
//
// ONE persistent scene mounted to document.body (fixed z-0), ONE WebGLRenderer, ONE rAF pump — it lives
// OUTSIDE the Preact view tree, so the dynamic background survives every tab switch. Probe-guarded on
// getContext('webgl') (NOT gate-guarded) → CI's headless Chrome renders the real 3D; no WebGL → the Canvas2D
// kaleidoscope fallback. No GLSL (all Points / Sprites / Instanced-free meshes + additive bloom, CPU-driven)
// so the `render=webgl` regression gate stays honest and every frame is screenshot-verifiable.
//
// Layers, each designed per-frame:
//   • star field   — 3 parallax layers of additive Points: slow drift + opacity breathing + gyro parallax.
//   • nebula       — 2 soft radial-gradient sprites (additive, low opacity): drift + breathe.
//   • kaleidoscope — the sigil tube in 6-fold mirror symmetry (a living mandala): counter-rotate + breathe.
//   • cosmic draw  — eased drawRange 0→1; a bright forge-head sprite rides the curve, trailing spark sprites.
// Theme-adaptive (ink=--color-base-content, accent=--color-primary): rich deep-space in dark, faint in light.

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
    return { ink, accent, dark, deep: dark ? "#07070A" : "#EFEFF2" };
  } catch { return { ink: "#ECECEE", accent: "#8B7CF6", dark: true, deep: "#07070A" }; }
}

// soft radial-gradient sprite texture (nebula glow + forge-head + sparks) — a 2D canvas, works everywhere
function radialTex(THREE, rgb, hardness = 0.0) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 64 * hardness, 64, 64, 64);
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

// =========================================================================================
// Ambient — the singleton app-wide cosmic scene. Mounted once to <body>, persists for the session.
// =========================================================================================
const Ambient = {
  mounted: false, gl: false, THREE: null, renderer: null, scene: null, cam: null, canvas: null,
  raf: null, t0: 0, err: null, markers: new Set(), sigil: null, forgeActive: false,
  stars: [], nebula: [], mandala: null, sig: null, col: null, mo: null, ro: null,

  addMarker(el) { if (el) { this.markers.add(el); this._paintMarker(el); } },
  removeMarker(el) { this.markers.delete(el); },
  _paintMarker(el) { try { el.dataset.haswebgl = hasWebGL() ? "yes" : "no"; el.dataset.render = this.gl ? "webgl" : "2d"; if (this.err) el.dataset.err = String(this.err.message || this.err).slice(0, 140); } catch { /* */ } },
  _paintMarkers() { this.markers.forEach((el) => this._paintMarker(el)); },

  mount() {
    if (this.mounted) return; this.mounted = true;
    if (!hasWebGL()) { this.gl = false; this._paintMarkers(); return; }
    try {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none";
      document.body.prepend(canvas);
      this.canvas = canvas;
      // let the cosmos show through the app
      document.body.style.background = "transparent";
      this._start();
    } catch (e) { this.err = e; this.gl = false; this._paintMarkers(); }
  },

  async _start() {
    const THREE = await import("three").catch((e) => { this.err = e; return null; });
    if (!THREE) { this.gl = false; this._paintMarkers(); return; }
    this.THREE = THREE; this.gl = true;
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(52, 1, 0.1, 100); this.cam.position.set(0, 0, 5);
    this.col = readTheme();
    document.documentElement.style.background = this.col.deep;

    this.scene.add(new THREE.AmbientLight(0xffffff, this.col.dark ? 0.5 : 0.8));
    this.key = new THREE.PointLight(this.col.accent, this.col.dark ? 30 : 16, 40, 2); this.key.position.set(1.6, 1.4, 3); this.scene.add(this.key);
    this.fill = new THREE.PointLight(0xffffff, this.col.dark ? 6 : 10, 40, 2); this.fill.position.set(-2, -1.5, 3); this.scene.add(this.fill);

    this._buildStars(); this._buildNebula();

    const size = () => {
      const w = innerWidth || 360, h = innerHeight || 720, dpr = DPR();
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
      this.renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
    };
    size();
    if (typeof ResizeObserver !== "undefined") { this.ro = new ResizeObserver(size); this.ro.observe(document.documentElement); }
    if (typeof MutationObserver !== "undefined") { this.mo = new MutationObserver(() => this._retheme()); this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); }
    if (this.sigil) this._buildMandala(this.sigil);

    const loop = (ms) => { this.t0 ||= ms; const t = (ms - this.t0) / 1000; this._frame(t); this.renderer.render(this.scene, this.cam); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    this._paintMarkers();
  },

  _buildStars() {
    const THREE = this.THREE, C = this.col;
    const LAYERS = [{ n: 900, z: [-22, -12], size: 0.05, drift: 0.006, par: 0.05, op: C.dark ? 0.9 : 0.16 },
                    { n: 900, z: [-12, -6], size: 0.07, drift: 0.011, par: 0.11, op: C.dark ? 0.8 : 0.13 },
                    { n: 600, z: [-6, -2.5], size: 0.10, drift: 0.02, par: 0.2, op: C.dark ? 0.7 : 0.10 }];
    const ink = hexRgb(C.ink), acc = hexRgb(C.accent);
    for (const L of LAYERS) {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(L.n * 3), col = new Float32Array(L.n * 3);
      for (let i = 0; i < L.n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 26; pos[i * 3 + 2] = L.z[0] + Math.random() * (L.z[1] - L.z[0]);
        const a = Math.random() < 0.16, c = a ? acc : ink;
        col[i * 3] = c[0] / 255; col[i * 3 + 1] = c[1] / 255; col[i * 3 + 2] = c[2] / 255;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: L.size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: L.op, blending: THREE.AdditiveBlending, depthWrite: false, map: radialTex(THREE, [255, 255, 255]) });
      const pts = new THREE.Points(geo, mat); this.scene.add(pts);
      this.stars.push({ pts, mat, baseOp: L.op, drift: L.drift, par: L.par, tw: 0.3 + Math.random() * 0.4 });
    }
  },

  _buildNebula() {
    const THREE = this.THREE, C = this.col;
    const specs = [{ rgb: hexRgb(C.accent), s: 11, x: -2.5, y: 1.5, z: -8, op: C.dark ? 0.22 : 0.05, spin: 0.01, br: 0.25 },
                   { rgb: hexRgb(C.ink), s: 9, x: 3, y: -2, z: -9, op: C.dark ? 0.10 : 0.03, spin: -0.007, br: 0.18 }];
    for (const s of specs) {
      const mat = new THREE.SpriteMaterial({ map: radialTex(THREE, s.rgb), transparent: true, opacity: s.op, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(mat); sp.scale.setScalar(s.s); sp.position.set(s.x, s.y, s.z); this.scene.add(sp);
      this.nebula.push({ sp, mat, baseOp: s.op, baseS: s.s, spin: s.spin, br: s.br, phase: Math.random() * 6 });
    }
  },

  _disposeMandala() {
    if (!this.mandala) return;
    this.scene.remove(this.mandala);
    this.mandala.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else if (m && m !== this._sparkMat) m?.dispose?.(); });
    this.mandala = null; this.sig = null;
  },

  _buildMandala(sig) {
    if (!this.THREE) return;
    this._disposeMandala();
    const THREE = this.THREE, C = this.col;
    this.sig = sig;
    const mandala = new THREE.Group(); mandala.position.y = 0.35; mandala.scale.setScalar(0.6); mandala.visible = this.forgeActive;
    const INK = new THREE.Color(C.ink), ACC = new THREE.Color(C.accent);

    const s = sig.seed >>> 0, zAmp = 0.14 + ((s % 97) / 97) * 0.14;
    const v3 = sig.points.map((p, i) => new THREE.Vector3(p.x, p.y, Math.sin(i * 1.3 + (s % 13)) * zAmp));
    const curve = new THREE.CatmullRomCurve3(v3, false, "catmullrom", 0.5);
    const SEG = Math.max(60, sig.points.length * 24);
    const tubeGeo = new THREE.TubeGeometry(curve, SEG, 0.022, 10, false);
    const glowGeo = new THREE.TubeGeometry(curve, SEG, 0.055, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({ color: INK, metalness: 0.92, roughness: 0.2, side: THREE.DoubleSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: C.dark ? 0.18 : 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

    for (let k = 0; k < SECTORS; k++) {
      const sg = new THREE.Group(); sg.rotation.z = (k * Math.PI * 2) / SECTORS; sg.scale.x = k % 2 ? -1 : 1;
      sg.add(new THREE.Mesh(glowGeo, glowMat), new THREE.Mesh(tubeGeo, tubeMat));
      mandala.add(sg);
      if (k === 0) this._sector0 = sg;
    }

    // cosmic draw: a bright forge-head + a recycled spark trail, on sector 0
    this._sparkMat = this._sparkMat || new THREE.SpriteMaterial({ map: radialTex(THREE, [255, 255, 255]), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(THREE, hexRgb(C.accent)), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    head.scale.setScalar(0.16); this._sector0.add(head);
    const sparks = [];
    for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(this._sparkMat.clone()); sp.scale.setScalar(0.001); this._sector0.add(sp); sparks.push({ sp, life: 0 }); }

    this.scene.add(mandala);
    this.mandala = mandala;
    this._m = { curve, tubeGeo, glowGeo, tubeMat, glowMat, head, sparks, sparkI: 0, reveal: 0, totalIdx: tubeGeo.index.count, glowIdx: glowGeo.index.count, INK, ACC, scratch: new THREE.Vector3() };
    this._paintMarkers();
  },

  _retheme() {
    this.col = readTheme(); const C = this.col;
    document.documentElement.style.background = C.deep;
    if (this.key) { this.key.color.set(C.accent); this.key.intensity = C.dark ? 30 : 16; }
    if (this.fill) this.fill.intensity = C.dark ? 6 : 10;
    // rebuild colour-dependent layers cheaply
    this.stars.forEach((L) => { L.baseOp = L.baseOp; L.mat.opacity *= 1; });
    if (this.sig) this._buildMandala(this.sig);   // simplest correct path for the (rare) theme flip
    this.nebula.forEach((n) => { /* keep textures; opacity already themed at build */ });
  },

  setSigil(sig) { this.sigil = sig; if (this.gl) { if (sig) this._buildMandala(sig); else this._disposeMandala(); } this._paintMarkers(); },
  setForgeActive(b) { this.forgeActive = b; if (this.mandala) this.mandala.visible = b; this._paintMarkers(); },

  _frame(t) {
    const red = immersion.reduced;
    const gx = immersion.on ? Math.max(-1, Math.min(1, immersion.gamma / 45)) : 0;
    const gy = immersion.on ? Math.max(-1, Math.min(1, immersion.beta / 45)) : 0;
    // stars
    for (const L of this.stars) {
      if (!red) L.pts.rotation.z += L.drift * 0.05;
      L.pts.position.x = gx * L.par; L.pts.position.y = -gy * L.par;
      L.mat.opacity = L.baseOp * (0.82 + 0.18 * Math.sin(t * L.tw));
    }
    // nebula
    for (const n of this.nebula) {
      if (!red) n.sp.material.rotation += n.spin * 0.02;
      n.sp.scale.setScalar(n.baseS * (1 + 0.05 * Math.sin(t * n.br + n.phase)));
      n.sp.material.opacity = n.baseOp * (0.75 + 0.25 * Math.sin(t * n.br * 0.7 + n.phase));
      n.sp.position.x += gx * 0.06 * 0 + 0; // nebula holds position; parallax via camera not needed
    }
    // kaleidoscope + cosmic draw
    const M = this._m;
    if (this.mandala && this.mandala.visible && M) {
      M.reveal = Math.min(1, M.reveal + 0.011);
      const e = M.reveal * M.reveal * (3 - 2 * M.reveal);
      M.tubeGeo.setDrawRange(0, Math.max(6, Math.floor(M.totalIdx * e)));
      M.glowGeo.setDrawRange(0, Math.max(6, Math.floor(M.glowIdx * e)));
      if (!red) { this.mandala.rotation.z += 0.0016; this.mandala.rotation.x = gy * 0.25; this.mandala.rotation.y = gx * 0.25; }
      this.mandala.scale.setScalar(0.6 * (1 + 0.02 * Math.sin(t * 0.6)));
      // forge-head rides the curve front; sparks trail it
      if (M.reveal < 1) {
        M.curve.getPoint(M.reveal, M.scratch);
        M.head.position.copy(M.scratch); M.head.material.opacity = 0.9;
        M.head.scale.setScalar(0.13 + 0.05 * Math.sin(t * 9));
        const sp = M.sparks[M.sparkI = (M.sparkI + 1) % M.sparks.length];
        sp.sp.position.set(M.scratch.x + (Math.random() - 0.5) * 0.05, M.scratch.y + (Math.random() - 0.5) * 0.05, M.scratch.z); sp.life = 1;
      } else { M.head.material.opacity *= 0.9; }
      for (const s of M.sparks) { if (s.life > 0) { s.life *= 0.9; s.sp.material.opacity = s.life * 0.8; s.sp.scale.setScalar(0.02 + 0.05 * s.life); } }
      // key light orbit → travelling specular glint along the metal
      const a = t * 0.6; this.key.position.set(Math.cos(a) * 2.4, Math.sin(a * 0.8) * 1.8 + 0.6, 3);
    }
  },
};

// =========================================================================================
// SigilStage — thin Preact wrapper: ensures Ambient is mounted, registers the sigil + forge-active,
// and carries the diagnostic marker (data-sigil). When there is no WebGL it draws the 2D fallback locally.
// =========================================================================================
export function SigilStage({ sigil }) {
  const ref = useRef();
  const store = useRef({ raf: null, ro: null, mo: null }).current;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let dead = false;
    Ambient.mount();
    Ambient.addMarker(canvas);
    Ambient.setSigil(sigil);
    Ambient.setForgeActive(true);
    if (!Ambient.gl) {
      // no WebGL → local 2D kaleidoscope fallback on this canvas
      const size = () => { const r = canvas.getBoundingClientRect(), dpr = DPR(); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); };
      size();
      if (typeof requestAnimationFrame !== "undefined") {
        const loop = () => { if (dead) return; draw2D(canvas, Ambient.sigil, { live: true }); store.raf = requestAnimationFrame(loop); };
        store.raf = requestAnimationFrame(loop);
      }
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
    }
    return () => { dead = true; if (store.raf) cancelAnimationFrame(store.raf); store.ro?.disconnect(); Ambient.setForgeActive(false); Ambient.removeMarker(canvas); };
  }, []);
  useEffect(() => { Ambient.setSigil(sigil); }, [sigil && sigil.seed]);
  // when WebGL runs, the cosmos is on the body canvas; this element is just the marker (transparent).
  return html`<canvas ref=${ref} data-sigil data-live aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

// =========================================================================================
// 2D kaleidoscope renderer — fallback + grimoire thumbnails + shared talisman PNG.
// =========================================================================================
export function draw2D(canvas, sigil, opts = {}) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx || !sigil) return;
  const W = canvas.width || 0, H = canvas.height || 0; if (!W || !H) return;
  const theme = opts.live ? readTheme() : { ink: "#ECECEE", accent: "#8B7CF6", dark: true, deep: "#0A0A0B" };
  const cx = W / 2, cy = opts.live ? H * 0.42 : H / 2, R = Math.min(W, H) * 0.34;
  ctx.clearRect(0, 0, W, H);
  if (!opts.live) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7); g.addColorStop(0, "#141018"); g.addColorStop(1, "#070709"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }

  const sm = smooth(sigil.points, 16).map((p) => [p.x * R, -p.y * R]);
  const [sx, sy] = [sigil.start.x * R, -sigil.start.y * R], sr = sigil.start.r * R * 1.3;
  const [ex, ey] = [sigil.end.x * R, -sigil.end.y * R], bl = sigil.end.len * R;

  const drawArm = () => {
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = theme.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = Math.max(6, R * 0.05);
    ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = theme.ink; ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, R * 0.018);
    ctx.beginPath(); sm.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, R * 0.014); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex - Math.cos(sigil.end.a) * bl, ey + Math.sin(sigil.end.a) * bl); ctx.lineTo(ex + Math.cos(sigil.end.a) * bl, ey - Math.sin(sigil.end.a) * bl); ctx.stroke();
  };

  // 6-fold mirror kaleidoscope
  ctx.save(); ctx.translate(cx, cy); ctx.scale(0.62, 0.62);
  for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate((k * Math.PI * 2) / 6); if (k % 2) ctx.scale(-1, 1); drawArm(); ctx.restore(); }
  ctx.restore(); ctx.globalAlpha = 1;
}

export function sigilToDataURL(sigil, size = 640) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw2D(c, sigil, { live: false });
  try { return c.toDataURL("image/png"); } catch { return null; }
}
