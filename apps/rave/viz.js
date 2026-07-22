// apps/rave/viz.js — the app's audio-reactive 3D layer, and the farm's first shipped three.js app. Two
// surfaces, ONE signal: a radial spectrum RING (the Beat-tab hero) and a full-screen audio TERRAIN horizon
// (a fixed z-0 background behind the Beat content). Both read the SAME live FFT — tapped off the engine's
// master bus in view.js via bindAudio — or, when there's no audio (paused, or the headless gate), a
// deterministic seeded curve, so the visual is never a dead flatline. All DSP/geometry maths lives in
// /_rt/spectrum.js (unit-tested); this file is the thin binding.
//
// Following reference_webgl_threejs_in_farm to the letter: three is LAZY-imported inside the effect;
// init is PROBE-guarded on a throwaway canvas's getContext('webgl') — NOT gate-guarded — because CI's
// headless Chrome HAS WebGL, so verify.mjs --shots captures the real 3D; preflight/linkedom has neither
// WebGL nor `three` in its import map, so it throws → caught → Canvas2D fallback. No GLSL: 3D is built from
// InstancedMesh (well-trodden, verifiable from a screenshot) rather than a ShaderMaterial I can't compile
// locally. One module rAF "pump" computes the shared frame once and drives every surface, so hero + horizon
// pulse and shift hue in perfect lockstep. Refs: Codrops 3D visualizer, audioMotion-analyzer.

import { html } from "htm/preact";
import { useRef, useState, useEffect } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { DEFAULTS, logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, advanceTerrain, Parallax, seedFrame } from "/_rt/spectrum.js";
import { compass, tilt } from "/_rt/sensors.js";

const DPR = () => Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// ---- audio binding — view.js hands us a getter that returns the live Uint8Array while playing, else null ----
let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }

// ---- immersion — gyro parallax + compass rotation, opt-in behind a gesture (iOS gates the permission).
// tilt.request() covers compass too (one DeviceOrientationEvent grant). Never opened cold; the gate no-ops. ----
// heading0 is the DYNAMIC scene centre — the heading captured the instant immersion turns on, so the world
// starts centred on wherever you're already facing (never snapped to magnetic north). We rotate only by the
// RELATIVE turn from there, heavily low-passed to a gentle `turn` in the pump — a light head-look, not a 1:1
// world spin that jumps with every raw magnetometer sample.
const immersion = { on: false, beta: null, gamma: null, headingRaw: 0, heading0: null, turn: 0, reduced: reducedMotion, _t: null, _c: null };
export const immersionState = immersion;
export const immersionAvailable = tilt.supported && !isGate;   // hide the toggle where it would be a dead control
export async function enableImmersion() {
  if (immersion.on || isGate || !tilt.supported) return false;
  const ok = await tilt.request().catch(() => false);
  if (!ok) return false;
  immersion.on = true; immersion.heading0 = null;             // recentre on wherever you face right now
  immersion._t = tilt.start(({ beta, gamma }) => { immersion.beta = beta; immersion.gamma = gamma; });
  immersion._c = compass.start((deg) => { const h = (deg * Math.PI) / 180; immersion.headingRaw = h; if (immersion.heading0 == null) immersion.heading0 = h; }, { trueNorth: false });
  return true;
}
export function disableImmersion() { immersion._t?.(); immersion._c?.(); immersion.on = false; immersion._t = immersion._c = null; immersion.beta = immersion.gamma = null; immersion.heading0 = null; }

// ---- the shared pump — one rAF, one FFT read, one enveloped frame for every surface ----
const EDGES = logBandEdges();
const env = Envelope(0.55, 0.12, DEFAULTS.bars);
const subs = new Set();
const TURN_MAX = 0.42;                                        // ~24° of world rotation at a full head-turn — light
let pumpRaf = null, phase = 0;
function pump() {
  phase += 0.045;
  const live = _getBytes && !isGate ? _getBytes() : null;
  const u8 = live || seedFrame(1024, phase);                 // paused/gate → gentle seeded idle
  const levels = env.update(bandLevels(u8, EDGES));          // Float32Array(28), attack-fast/release-slow
  const bands = splitBands(u8);
  const { hue } = spectralCentroid(u8);
  // Gentle relative head-look: shortest signed delta from the dynamic centre, clamped small, then a heavy
  // low-pass so it glides instead of snapping with the raw magnetometer. Eases back to centre when off.
  let target = 0;
  if (immersion.on && immersion.heading0 != null) {
    const d = Math.atan2(Math.sin(immersion.headingRaw - immersion.heading0), Math.cos(immersion.headingRaw - immersion.heading0));
    target = Math.max(-1, Math.min(1, d / Math.PI)) * TURN_MAX;
  }
  immersion.turn += 0.05 * (target - immersion.turn);
  const st = { levels, bands, hue, phase, turn: immersion.turn };
  for (const fn of subs) { try { fn(st); } catch { /* a dead surface must not stall the others */ } }
  pumpRaf = requestAnimationFrame(pump);
}
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

// ======================= three.js scenes (InstancedMesh, no GLSL) =======================
const N = DEFAULTS.bars;

// Radial spectrum ring + a pulsing wireframe core. Returns { frame, resize, dispose }.
function makeRing(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const geo = new THREE.BoxGeometry(0.14, 1, 0.14); geo.translate(0, 0.5, 0);   // grow up from the base
  const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const bars = new THREE.InstancedMesh(geo, mat, N);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) bars.setColorAt(i, col.setHSL(0.6, 0.7, 0.5));
  group.add(bars);

  const coreGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }));
  group.add(core);

  const R = 2.2, dummy = new THREE.Object3D();
  let spin = 0;
  return {
    resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      spin += 0.0016 + st.bands.treble * 0.02;
      for (let i = 0; i < N; i++) {
        const lv = st.levels[i] || 0, a = (i / N) * Math.PI * 2;
        dummy.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
        dummy.rotation.set(0, -a, 0);
        dummy.scale.set(1, 0.1 + lv * 2.6, 1);
        dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix);
        bars.setColorAt(i, col.setHSL(((st.hue + i * 3) % 360) / 360, 0.82, 0.36 + lv * 0.32));
      }
      bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      const pulse = 0.55 + st.bands.bass * 0.9;
      core.scale.setScalar(pulse); core.rotation.y += 0.01 + st.bands.treble * 0.03; core.rotation.x = 0.3;
      core.material.color.setHSL((st.hue % 360) / 360, 0.7, 0.55); core.material.opacity = 0.28 + st.bands.mid * 0.4;
      group.rotation.y = spin + st.turn;
      cam.position.set(p.x * 1.1, 2.6 - p.y * 0.7, 5.4); cam.lookAt(0, 0.5 + st.bands.bass * 0.2, 0);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); coreGeo.dispose(); core.material.dispose(); renderer.dispose(); },
  };
}

// Audio terrain — the first-version FIELD OF SPECTRUM PILLARS (the look the owner prefers). Each column's
// height is its band level; the ridge scrolls toward the camera (advanceTerrain). Solid instanced boxes,
// hue by depth, lit by level and fading into the distance. Fixed full-screen, transparent clear so base-200
// reads as the sky. Rotation uses the gentle dynamic-centre head-look (st.turn), not absolute heading.
const ROWS = 20, COLS = 30;
function makeTerrain(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const geo = new THREE.BoxGeometry(0.34, 1, 0.34); geo.translate(0, 0.5, 0);   // grow up from the base
  const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, ROWS * COLS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const grid = new Float32Array(ROWS * COLS), col = new THREE.Color(), dummy = new THREE.Object3D();
  const SX = 0.62, SZ = 0.9, MAXH = 2.6;
  for (let i = 0; i < ROWS * COLS; i++) mesh.setColorAt(i, col.setHSL(0.6, 0.6, 0.2));

  return {
    resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      advanceTerrain(grid, ROWS, COLS, st.levels);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c, v = grid[idx];
        dummy.position.set((c - (COLS - 1) / 2) * SX, -1.5, -r * SZ - 0.5);
        dummy.scale.set(1, 0.02 + v * MAXH, 1);
        dummy.updateMatrix(); mesh.setMatrixAt(idx, dummy.matrix);
        const fade = 1 - (r / ROWS) * 0.72;
        mesh.setColorAt(idx, col.setHSL(((st.hue + r * 3) % 360) / 360, 0.62, (0.12 + v * 0.5) * fade));
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.rotation.y = st.turn * 0.5 + p.x * 0.12;
      cam.position.set(p.x * 0.5, 1.35 - p.y * 0.3, 3.1 + st.bands.bass * 0.25);
      cam.lookAt(0, 0.1, -6);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); renderer.dispose(); },
  };
}

// ======================= Canvas2D fallbacks (no WebGL / preflight) =======================
// Same signal, flat. Guarded hard: linkedom returns a non-null 2d stub, so bail unless it's a real context.
function ctx2d(canvas) {
  try { const c = canvas.getContext("2d"); return c && typeof c.fillRect === "function" && typeof c.arc === "function" ? c : null; } catch { return null; }
}
function drawRingFallback(canvas, st) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.28;
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2, lv = st.levels[i] || 0, len = R * (0.35 + lv * 1.1);
    g.strokeStyle = `hsl(${(st.hue + i * 2) % 360} 72% ${45 + lv * 30}%)`;
    g.lineWidth = Math.max(1, w * 0.006); g.lineCap = "round";
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); g.stroke();
  }
}
function drawTerrainFallback(canvas, st) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  for (let r = ROWS - 1; r >= 0; r--) {
    const y = h * (0.55 + (r / ROWS) * 0.4), squash = 1 - r / ROWS * 0.6;
    g.beginPath();
    for (let c = 0; c <= COLS; c++) {
      const x = (c / COLS) * w, lv = st.levels[Math.min(N - 1, Math.floor((c / COLS) * N))] || 0;
      const yy = y - lv * h * 0.16 * squash;
      c === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.strokeStyle = `hsl(${(st.hue + r * 3) % 360} 62% ${(18 + squash * 22)}%)`; g.lineWidth = 1.2; g.stroke();
  }
}

// ======================= generic mount (three probe → fallback) =======================
function useViz(ref, make, fallback, { fixed } = {}) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    let scene = null, unsub = null, ro = null, dead = false;
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => {
      const [w, h] = dims(), dpr = DPR();
      if (scene) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); scene.resize(canvas.width, canvas.height); }
      else { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    };
    (async () => {
      if (hasWebGL()) {
        try { const THREE = await import("three"); if (dead) return; scene = make(canvas, THREE); setWebgl(true); }
        catch { scene = null; }                                   // preflight/linkedom lands here → fallback
      }
      size();
      const parallax = Parallax({ maxDeg: 22, gain: 1, reduced: immersion.reduced });
      unsub = subscribe((st) => {
        const p = immersion.on ? parallax.update(immersion.beta, immersion.gamma) : parallax.update(0, 0);
        if (scene) scene.frame(st, p);
        else fallback(canvas, st);
      });
      if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(size); ro.observe(canvas); }
    })();
    return () => { dead = true; unsub?.(); ro?.disconnect(); try { scene?.dispose(); } catch { /* */ } };
  }, []);
  return webgl;
}

// ---- the two components the Beat view mounts ----

// Background audio-terrain: fixed z-0, behind the Beat content (which sits relative z-10), pointer-events-none.
export function TerrainBg() {
  const ref = useRef();
  useViz(ref, makeTerrain, drawTerrainFallback, { fixed: true });
  return html`<canvas ref=${ref} data-terrain aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

// Hero radial spectrum. data-live: it is a live reading of the master bus, seeded under the gate.
export function RingViz() {
  const ref = useRef();
  useViz(ref, makeRing, drawRingFallback);
  return html`<canvas ref=${ref} data-ring data-live aria-hidden="true" class="block w-full max-w-[440px] h-56"></canvas>`;
}
