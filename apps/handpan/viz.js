
import { html } from "htm/preact";
import { useRef, useState, useEffect } from "preact/hooks";
import { isGate, gate } from "/_rt/gate.js";
import { RippleField } from "/_rt/ripple.js";
import { Parallax } from "/_rt/spectrum.js";
import { compass, tilt } from "/_rt/sensors.js";

const DPR = () => Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const COLS = 28, ROWS = 28, SP = 0.34;                         
const HX = ((COLS - 1) * SP) / 2, HZ = ((ROWS - 1) * SP) / 2;
const R_IN = 0.4 * Math.min(HX, HZ);                           
const MAXH = 0.4, DOT = 0.044;                                 
const field = RippleField({ speed: 2.4, wavelength: 1.2, width: 0.6, life: 0.9, spread: 0.55, max: 10 });

let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }
const meanByte = (u8) => { let s = 0; for (let i = 0; i < u8.length; i++) s += u8[i]; return u8.length ? s / u8.length / 255 : 0; };

let clock = 0;                                                 
export function strikeRipple(nx, nz, amp = 1, hue = 260) {
  field.strike(nx * R_IN, nz * R_IN, { amp: 0.5 + amp * 0.8, hue, t: clock });
}

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

const TURN_MAX = 0.34;                                         
let pumpRaf = null, ambient = 0, seedT = -1;
function pump() {
  clock += 1 / 60;                                             
  const live = _getBytes && !gate ? _getBytes() : null;
  if (!live && clock - seedT > (gate ? 1.1 : 1.5)) {
    seedT = clock;
    if (gate) {                                                
      const k = Math.floor(clock / 1.1) % 8, a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
      field.strike(Math.cos(a) * R_IN, Math.sin(a) * R_IN, { amp: 1, hue: 260 - k * 7, t: clock });
    } else {                                                   
      const a = clock * 0.7;
      field.strike(Math.cos(a) * R_IN * 0.35, Math.sin(a * 1.3) * R_IN * 0.35, { amp: 0.55, hue: 252 + 30 * Math.sin(a * 0.8), t: clock });
    }
  }
  field.prune(clock);
  const target = live ? meanByte(live) : Math.min(1, field.energy(clock) * 0.4);
  ambient += 0.08 * (target - ambient);
  let tgt = 0;
  if (immersion.on && immersion.heading0 != null) {
    const d = Math.atan2(Math.sin(immersion.headingRaw - immersion.heading0), Math.cos(immersion.headingRaw - immersion.heading0));
    tgt = Math.max(-1, Math.min(1, d / Math.PI)) * TURN_MAX;
  }
  immersion.turn += 0.05 * (tgt - immersion.turn);
  const st = { clock, amb: ambient, hue: field.hue(clock), turn: immersion.turn };
  for (const fn of subs) { try { fn(st); } catch {  } }
  pumpRaf = requestAnimationFrame(pump);
}
const subs = new Set();
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

const CAM_Y = 9.2, CAM_Z = 4.2, MAXD = Math.sqrt(HX * HX + HZ * HZ);   
function makeField(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const geo = new THREE.IcosahedronGeometry(DOT, 0);           
  const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, ROWS * COLS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const col = new THREE.Color(), dummy = new THREE.Object3D();
  const px = new Float32Array(ROWS * COLS), pz = new Float32Array(ROWS * COLS), fade = new Float32Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    const x = -HX + c * SP + 0.18 * Math.sin(i * 12.9898), z = -HZ + r * SP + 0.18 * Math.cos(i * 78.233);
    px[i] = x; pz[i] = z; fade[i] = 1 - Math.min(1, Math.sqrt(x * x + z * z) / MAXD) * 0.85;
    mesh.setColorAt(i, col.setHSL(0.7, 0.5, 0.05));
  }

  return {
    resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const t = st.clock;
      for (let i = 0; i < ROWS * COLS; i++) {
        const s = field.sample(px[i], pz[i], t), glow = field.glow(px[i], pz[i], t, 0.9, 0.8);
        const energy = Math.min(1.4, Math.max(Math.abs(s.h) * 0.5, glow));   
        const lift = Math.min(1, energy * 2.0);
        dummy.position.set(px[i], (s.h * 0.5 + glow * 0.55) * MAXH, pz[i]);
        dummy.scale.setScalar(0.5 + energy * 0.9);            
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        col.setHSL(((s.hue % 360) + 360) % 360 / 360, 0.62 - lift * 0.16, (0.045 + lift * 0.66 + st.amb * 0.04) * fade[i]);
        mesh.setColorAt(i, col);                              
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.rotation.y = st.turn * 0.35 + p.x * 0.04;
      group.position.y = st.amb * 0.06;                       
      cam.position.set(p.x * 0.5, CAM_Y - p.y * 0.3, CAM_Z);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); renderer.dispose(); },
  };
}

function ctx2d(canvas) {
  try { const c = canvas.getContext("2d"); return c && typeof c.fillRect === "function" && typeof c.arc === "function" ? c : null; } catch { return null; }
}
function drawFieldFallback(canvas, st) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height, GC = 26, GR = 30, t = st.clock;
  g.clearRect(0, 0, w, h);
  const hue = ((st.hue % 360) + 360) % 360;
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    const nx = (c / (GC - 1) - 0.5) * 2, nz = (r / (GR - 1) - 0.5) * 2;
    const s = field.sample(nx * HX, nz * HZ, t), mag = Math.min(1.3, Math.abs(s.h));
    const x = (c + 0.5) / GC * w, y = (r + 0.5) / GR * h, rad = Math.max(0.6, w * 0.004) * (0.7 + mag * 1.4);
    const fade = 1 - Math.min(1, Math.hypot(nx, nz) / 1.41) * 0.8;
    g.fillStyle = `hsl(${hue} 55% ${Math.round((10 + mag * 45) * fade)}%)`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
}

function useViz(ref, make, fallback) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    let scene = null, unsub = null, ro = null, dead = false;
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => { const [w, h] = dims(), dpr = DPR(); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); if (scene) scene.resize(canvas.width, canvas.height); };
    (async () => {
      if (hasWebGL()) {
        try { const THREE = await import("three"); if (dead) return; scene = make(canvas, THREE); setWebgl(true); }
        catch { scene = null; }                               
      }
      size();
      const parallax = Parallax({ maxDeg: 20, gain: 1, reduced: immersion.reduced });
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

export function RippleBg() {
  const ref = useRef();
  useViz(ref, makeField, drawFieldFallback);
  return html`<canvas ref=${ref} data-ripple data-live aria-hidden="true" class="absolute inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
