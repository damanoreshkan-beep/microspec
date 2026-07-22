
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

let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }

const immersion = { on: false, beta: null, gamma: null, headingRaw: 0, heading0: null, turn: 0, reduced: reducedMotion, _t: null, _c: null };
export const immersionState = immersion;
export const immersionAvailable = tilt.supported && !isGate;   
export async function enableImmersion() {
  if (immersion.on || isGate || !tilt.supported) return false;
  const ok = await tilt.request().catch(() => false);
  if (!ok) return false;
  immersion.on = true; immersion.heading0 = null;             
  immersion._t = tilt.start(({ beta, gamma }) => { immersion.beta = beta; immersion.gamma = gamma; });
  immersion._c = compass.start((deg) => { const h = (deg * Math.PI) / 180; immersion.headingRaw = h; if (immersion.heading0 == null) immersion.heading0 = h; }, { trueNorth: false });
  return true;
}
export function disableImmersion() { immersion._t?.(); immersion._c?.(); immersion.on = false; immersion._t = immersion._c = null; immersion.beta = immersion.gamma = null; immersion.heading0 = null; }

const EDGES = logBandEdges();
const env = Envelope(0.55, 0.12, DEFAULTS.bars);
const subs = new Set();
const TURN_MAX = 0.42;                                        
let pumpRaf = null, phase = 0;
function pump() {
  phase += 0.045;
  const live = _getBytes && !isGate ? _getBytes() : null;
  const u8 = live || seedFrame(1024, phase);                 
  const levels = env.update(bandLevels(u8, EDGES));          
  const bands = splitBands(u8);
  const { hue } = spectralCentroid(u8);
  let target = 0;
  if (immersion.on && immersion.heading0 != null) {
    const d = Math.atan2(Math.sin(immersion.headingRaw - immersion.heading0), Math.cos(immersion.headingRaw - immersion.heading0));
    target = Math.max(-1, Math.min(1, d / Math.PI)) * TURN_MAX;
  }
  immersion.turn += 0.05 * (target - immersion.turn);
  const st = { levels, bands, hue, phase, turn: immersion.turn };
  for (const fn of subs) { try { fn(st); } catch {  } }
  pumpRaf = requestAnimationFrame(pump);
}
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

const N = DEFAULTS.bars;

function makeRing(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const geo = new THREE.BoxGeometry(0.14, 1, 0.14); geo.translate(0, 0.5, 0);   
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

const ROWS = 20, COLS = 31;   
function makeTerrain(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const floorGeo = new THREE.PlaneGeometry(90, 100); floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.y = -1.5; group.add(floor);

  const geo = new THREE.BoxGeometry(0.56, 1, 0.42); geo.translate(0, 0.5, 0);   
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
        dummy.position.set((c - (COLS - 1) / 2) * SX, -1.5, -r * SZ - 4.2);   
        dummy.scale.set(1, 0.02 + v * MAXH, 1);
        dummy.updateMatrix(); mesh.setMatrixAt(idx, dummy.matrix);
        const fade = 1 - (r / ROWS) * 0.72;
        mesh.setColorAt(idx, col.setHSL(((st.hue + r * 3) % 360) / 360, 0.62, (0.12 + v * 0.5) * fade));
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      floorMat.color.setHSL((st.hue % 360) / 360, 0.4, 0.05);   
      group.rotation.y = st.turn * 0.5 + p.x * 0.12;
      cam.position.set(p.x * 0.5, 1.7 - p.y * 0.3, 3.1 + st.bands.bass * 0.25);   
      cam.lookAt(0, -0.2, -7);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); floorGeo.dispose(); floorMat.dispose(); renderer.dispose(); },
  };
}

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
        catch { scene = null; }                                   
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
    return () => { dead = true; unsub?.(); ro?.disconnect(); try { scene?.dispose(); } catch {  } };
  }, []);
  return webgl;
}


export function TerrainBg() {
  const ref = useRef();
  useViz(ref, makeTerrain, drawTerrainFallback, { fixed: true });
  return html`<canvas ref=${ref} data-terrain aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

export function RingViz() {
  const ref = useRef();
  useViz(ref, makeRing, drawRingFallback);
  return html`<canvas ref=${ref} data-ring data-live aria-hidden="true" class="block w-full max-w-[440px] h-56"></canvas>`;
}
