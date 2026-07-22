// apps/handpan/viz.js — the pan's audio-reactive 3D layer, the farm's 2nd shipped three.js app. ONE surface:
// a full-screen ambient RESONANCE FIELD behind the Play tab — a tilted 30×30 grid of instanced dots whose
// height is a live ripple field. Every strike (a live tap, or a scheduled loop hit surfaced in view.js's draw
// rAF) launches an expanding, decaying wave from the struck tone-field's position (view.js calls strikeRipple
// with a normalised position + a pitch hue + a velocity amp); the waves interfere and bloom out from behind
// the opaque pan rim — "the instrument resonating into the room." A soft global breathing comes from an
// AnalyserNode tapped off the master (bindAudio), or, when there's no live audio (paused / the headless
// gate), from the field's own energy plus a couple of seeded deterministic ripples so the shot is never dead.
// All wave maths lives in /_rt/ripple.js (unit-tested); this file is the thin three.js binding.
//
// Following reference_webgl_threejs_in_farm to the letter (as rave does): three is LAZY-imported inside the
// effect; init is PROBE-guarded on a throwaway canvas's getContext('webgl') — NOT gate-guarded — because CI's
// headless Chrome HAS WebGL, so verify.mjs captures the real 3D; preflight/linkedom has neither WebGL nor
// `three`, so it throws → caught → Canvas2D fallback. No GLSL: the surface is an InstancedMesh of dots
// (verifiable from a screenshot), never a CPU-mutated BufferGeometry. One module rAF "pump" computes the
// shared frame once and drives the surface.

import { html } from "htm/preact";
import { useRef, useState, useEffect } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { RippleField } from "/_rt/ripple.js";
import { Parallax } from "/_rt/spectrum.js";
import { compass, tilt } from "/_rt/sensors.js";

const DPR = () => Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// ---- field geometry (world units) — one shared field of FINE grains ("glow of sand"), concentrated around
// the pan rather than washing full-bleed. 28×28 tiny dots; a strike lights a NEAT, LOCALISED bloom right at
// the struck field (under the finger / on the tone-field circle in Flow), not a big screen-wide wave. ----
const COLS = 28, ROWS = 28, SP = 0.34;                         // 784 grains, extent ≈ ±4.6 → sits on/around the pan
const HX = ((COLS - 1) * SP) / 2, HZ = ((ROWS - 1) * SP) / 2;
const R_IN = 0.5 * Math.min(HX, HZ);                           // strike ring radius (maps view's field ring, close to the pan)
const MAXH = 0.4, DOT = 0.044;                                 // gentle relief + a fine grain (was big & chunky)
// speed/wavelength small + a STRONG spatial spread → the bloom stays tight around the strike, then fades fast
const field = RippleField({ speed: 2.8, wavelength: 1.25, width: 0.66, life: 1.0, spread: 0.42, max: 10 });

// ---- audio binding — view.js hands us a getter that returns the live Uint8Array (else null) ----
let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }
const meanByte = (u8) => { let s = 0; for (let i = 0; i < u8.length; i++) s += u8[i]; return u8.length ? s / u8.length / 255 : 0; };

// ---- strike → ripple. view.js passes a normalised position (-1..1), a pitch hue and a velocity amp ----
let clock = 0;                                                 // the pump's synthetic seconds — one shared clock
export function strikeRipple(nx, nz, amp = 1, hue = 260) {
  field.strike(nx * R_IN, nz * R_IN, { amp: 0.5 + amp * 0.8, hue, t: clock });
}

// ---- immersion — gyro parallax + a gentle compass head-look, opt-in behind a gesture (iOS gates it). Reused
// from rave verbatim (kept gentle for a meditation instrument). Never opened cold; the gate no-ops. ----
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

// ---- the shared pump — one rAF, one field advance, one enveloped frame ----
const TURN_MAX = 0.34;                                         // gentler than rave — this is meditation, not a ride
let pumpRaf = null, ambient = 0, seedT = -1;
function pump() {
  clock += 1 / 60;                                             // synthetic clock → frame-rate-independent maths, fully deterministic under the gate
  const live = _getBytes && !isGate ? _getBytes() : null;
  // paused / gate: seed gentle deterministic ripples (no Math.random) so the surface is alive
  if (!live && clock - seedT > 1.5) {                          // resting: a sparse, gentle sand shimmer near the centre — never big idle waves
    seedT = clock; const a = clock * 0.7;
    field.strike(Math.cos(a) * R_IN * 0.35, Math.sin(a * 1.3) * R_IN * 0.35, { amp: 0.5, hue: 252 + 30 * Math.sin(a * 0.8), t: clock });
  }
  field.prune(clock);
  const target = live ? meanByte(live) : Math.min(1, field.energy(clock) * 0.4);
  ambient += 0.08 * (target - ambient);
  // gentle relative head-look (shortest signed delta from the dynamic centre, clamped small, low-passed)
  let tgt = 0;
  if (immersion.on && immersion.heading0 != null) {
    const d = Math.atan2(Math.sin(immersion.headingRaw - immersion.heading0), Math.cos(immersion.headingRaw - immersion.heading0));
    tgt = Math.max(-1, Math.min(1, d / Math.PI)) * TURN_MAX;
  }
  immersion.turn += 0.05 * (tgt - immersion.turn);
  const st = { clock, amb: ambient, hue: field.hue(clock), turn: immersion.turn };
  for (const fn of subs) { try { fn(st); } catch { /* a dead surface must not stall the others */ } }
  pumpRaf = requestAnimationFrame(pump);
}
const subs = new Set();
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

// ======================= three.js scene (InstancedMesh dot field, no GLSL) =======================
const CAM_Y = 9.2, CAM_Z = 4.2, MAXD = Math.sqrt(HX * HX + HZ * HZ);   // more top-down → rings read as neat circles ON the pan
function makeField(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR());
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  const group = new THREE.Group(); scene.add(group);

  const geo = new THREE.IcosahedronGeometry(DOT, 0);           // 20 tris — a faceted dot, ~identical at this size, far cheaper than a sphere under software WebGL
  const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, ROWS * COLS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const col = new THREE.Color(), dummy = new THREE.Object3D();
  // precompute each node's world XZ + a radial edge-fade so the grid melts into the base (no hard rectangle)
  const px = new Float32Array(ROWS * COLS), pz = new Float32Array(ROWS * COLS), fade = new Float32Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    // small deterministic jitter so the field reads as an organic resonant surface, not a mechanical grid
    const x = -HX + c * SP + 0.18 * Math.sin(i * 12.9898), z = -HZ + r * SP + 0.18 * Math.cos(i * 78.233);
    px[i] = x; pz[i] = z; fade[i] = 1 - Math.min(1, Math.sqrt(x * x + z * z) / MAXD) * 0.85;
    mesh.setColorAt(i, col.setHSL(0.7, 0.5, 0.05));
  }

  return {
    resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const t = st.clock;
      for (let i = 0; i < ROWS * COLS; i++) {
        const s = field.sample(px[i], pz[i], t), mag = Math.min(1.4, Math.abs(s.h));
        const lift = Math.min(1, mag * 2.4);                  // the grain lights up where the bloom passes — a fine glow, not a swelling blob
        dummy.position.set(px[i], s.h * MAXH, pz[i]);
        dummy.scale.setScalar(0.5 + mag * 0.6);               // stays a small grain (was a chunky node)
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        col.setHSL(((s.hue % 360) + 360) % 360 / 360, 0.6 - lift * 0.16, (0.045 + lift * 0.58 + st.amb * 0.04) * fade[i]);
        mesh.setColorAt(i, col);                              // resting grain ≈ black; a struck bloom glows soft violet, tight to the strike
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.rotation.y = st.turn * 0.35 + p.x * 0.04;
      group.position.y = st.amb * 0.06;                       // barely-there breathing with the reverb wash
      cam.position.set(p.x * 0.5, CAM_Y - p.y * 0.3, CAM_Z);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); renderer.dispose(); },
  };
}

// ======================= Canvas2D fallback (no WebGL / preflight) =======================
// Same field, flat: a coarse grid of dots sized/opac'd by |height|. Guarded hard — linkedom returns a
// non-null 2d stub, so bail unless it's a real context.
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

// ======================= generic mount (three probe → fallback) =======================
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
        catch { scene = null; }                               // preflight/linkedom lands here → fallback
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
    return () => { dead = true; unsub?.(); ro?.disconnect(); try { scene?.dispose(); } catch { /* */ } };
  }, []);
  return webgl;
}

// Ambient resonance field: absolute z-0 inside the Play panel, behind the pan (relative z-10),
// pointer-events-none. data-live: it is a live visual of the struck output (seeded under the gate).
export function RippleBg() {
  const ref = useRef();
  useViz(ref, makeField, drawFieldFallback);
  return html`<canvas ref=${ref} data-ripple data-live aria-hidden="true" class="absolute inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
