// apps/rave/viz.js — the app's audio-reactive 3D layer: a GALLERY of ten fundamentally different three.js
// spectrum scenes behind ONE full-bleed stage. All ten read the SAME live signal — a Uint8Array FFT frame
// tapped off the engine's master bus in view.js (bindAudio) — or, when there's no audio (paused, headless
// gate), a deterministic seeded curve, so the visual is never a dead flatline. The perceptual DSP + the
// reusable layout maths live in /_rt/spectrum.js (unit-tested); this file is the thin three.js binding.
//
// Following reference_webgl_threejs_in_farm: three is LAZY-imported inside the effect; init is PROBE-guarded
// on getContext('webgl') — NOT gate-guarded — so CI's headless Chrome renders the real 3D, while preflight's
// linkedom (no WebGL, no `three` in its import map) throws → caught → Canvas2D fallback. No GLSL: every scene
// is built from InstancedMesh / Points / Line + MeshBasicMaterial (verifiable from a screenshot), and every
// "shader displacement" from the references is done CPU-side by writing matrices/positions each frame.
//
// Perf discipline (research): ONE WebGLRenderer reused for the whole app; scenes are lazily built and fully
// disposed on switch (never 10 live contexts → context loss). DPR capped at 1.5. Scratch objects hoisted per
// scene, zero per-frame allocation. Additive back-shells (depthWrite:false) fake glow — no post-processing.
// One module rAF "pump" computes the frame once and drives the active scene. Refs: Codrops 3D visualizer
// (2025), Bruno Simon galaxy generator, Maxime Heckel vaporwave scene, Codrops infinite tubes / exploding
// objects — all confirmed in apps/rave/RESEARCH.md; their GLSL is reproduced with CPU InstancedMesh/Points.

import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { DEFAULTS, logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, seedFrame, sampleBand, idle, fib, galaxyDisc, Parallax } from "/_rt/spectrum.js";
import { mulberry32 } from "/_rt/groove.js";
import { compass, tilt } from "/_rt/sensors.js";

const N = DEFAULTS.bars;                                        // 28 log-octave bands
const TAU = Math.PI * 2;
const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);   // heavy 3D → cap hard
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// ---- palette: bass → purple (255°), treble → cyan (190°); the spectral-centroid hue only nudges, so the
// scene stays Linear-tasteful (ink + one accent) instead of a rave-rainbow. Saturation held ≤ 0.8. ----
const H_BASS = 255, H_TREB = 190;
const bandHue = (frac, st) => H_BASS + (H_TREB - H_BASS) * frac + (st.hue - 235) * 0.12;   // degrees

// ---- audio binding — view.js hands us a getter returning the live Uint8Array while playing, else null ----
let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }

// ---- immersion — gyro parallax + compass rotation, opt-in behind a gesture (iOS gates the permission).
// heading0 is the DYNAMIC scene centre — captured the instant immersion turns on, so the world starts on
// wherever you already face; we rotate only by the RELATIVE turn from there, heavily low-passed. ----
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

// ---- the shared pump — one rAF, one FFT read, one enveloped frame; the active scene subscribes ----
const EDGES = logBandEdges();
const env = Envelope(0.55, 0.12, N);
const subs = new Set();
const TURN_MAX = 0.42;
let pumpRaf = null, phase = 0;
function pump() {
  phase += 0.045;
  const live = _getBytes && !isGate ? _getBytes() : null;
  const u8 = live || seedFrame(1024, phase);                   // paused/gate → gentle seeded idle
  const levels = env.update(bandLevels(u8, EDGES));            // asymmetric attack-fast/release-slow, per band
  const bands = splitBands(u8);
  const { hue } = spectralCentroid(u8);
  let target = 0;
  if (immersion.on && immersion.heading0 != null) {
    const d = Math.atan2(Math.sin(immersion.headingRaw - immersion.heading0), Math.cos(immersion.headingRaw - immersion.heading0));
    target = Math.max(-1, Math.min(1, d / Math.PI)) * TURN_MAX;
  }
  immersion.turn += 0.05 * (target - immersion.turn);
  const st = { levels, bands, hue, phase, turn: immersion.turn };
  for (const fn of subs) { try { fn(st); } catch { /* a dead surface must not stall the pump */ } }
  pumpRaf = requestAnimationFrame(pump);
}
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

// ======================= the ten scenes (InstancedMesh / Points / Line, no GLSL) =======================
// Contract: make(THREE) → { scene, cam, frame(st, p), resize(w, h), dispose() }. frame() mutates geometry +
// camera; the STAGE owns the shared renderer and does renderer.render(scene, cam). Each scene hoists its own
// scratch (colour, Object3D, Vector3) so the frame loop never allocates.

const glowMat = (THREE, opacity = 0.14) => new THREE.MeshBasicMaterial({ transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

// 1 · RADIAL BAR RING — 28 bars on a circle grow up from a fixed baseline, purple→cyan, wireframe icosa core.
function makeRing(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(52, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const geo = new THREE.BoxGeometry(0.16, 1, 0.16); geo.translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), N); bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const glow = new THREE.InstancedMesh(geo, glowMat(THREE, 0.16), N);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.4, toneMapped: false }));
  group.add(glow, bars, core);
  const R = 3, C = new THREE.Color(), d = new THREE.Object3D(); let spin = 0;
  for (let i = 0; i < N; i++) bars.setColorAt(i, C.setHSL(0.6, 0.7, 0.5));
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      spin += 0.0016 + st.bands.treble * 0.02;
      const br = idle(st.phase);
      for (let i = 0; i < N; i++) {
        const lv = st.levels[i] || 0, a = (i / N) * TAU + st.phase * 0.15;
        d.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); d.rotation.set(0, -a, 0);
        d.scale.set(1, (0.15 + lv * 3.2) * br, 1); d.updateMatrix(); bars.setMatrixAt(i, d.matrix);
        d.scale.set(1.7, (0.15 + lv * 3.2) * br, 1.7); d.updateMatrix(); glow.setMatrixAt(i, d.matrix);
        bars.setColorAt(i, C.setHSL(((bandHue(i / N, st)) % 360) / 360, 0.78, 0.42 + lv * 0.34));
      }
      bars.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      core.scale.setScalar((1 + st.bands.bass * 0.3) * br); core.rotation.y += 0.01 + st.bands.treble * 0.03; core.rotation.x = 0.3;
      core.material.color.setHSL(((bandHue(0.5, st)) % 360) / 360, 0.6, 0.6); core.material.opacity = 0.22 + st.bands.mid * 0.4;
      group.rotation.y = spin + st.turn;
      cam.position.set(p.x * 1.1, 2.5 - p.y * 0.7, 7); cam.lookAt(0, 0.4 + st.bands.bass * 0.3, 0);
    },
    dispose() { geo.dispose(); bars.material.dispose(); glow.material.dispose(); core.geometry.dispose(); core.material.dispose(); },
  };
}

// 2 · SYNTHWAVE TERRAIN — two wireframe planes scroll toward the camera (modulo), heightfield from the bands,
// a flat "road" down the middle, fog matched to the background so ridges dissolve into the horizon.
function makeTerrain(THREE) {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x07070a, 4, 13);
  const cam = new THREE.PerspectiveCamera(78, 1, 0.1, 24), group = new THREE.Group(); scene.add(group);
  const SEGX = 32, SEGZ = 48, LEN = 13, WID = 7;
  const mk = () => { const g = new THREE.PlaneGeometry(WID, LEN, SEGX, SEGZ); g.rotateX(-Math.PI / 2); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.55, toneMapped: false })); };
  const planes = [mk(), mk()]; group.add(...planes);
  const base = planes.map((m) => Float32Array.from(m.geometry.attributes.position.array));
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const scroll = (st.phase * 2.2) % LEN;
      planes.forEach((m, k) => {
        m.position.z = k === 0 ? scroll : scroll - LEN;
        const pos = m.geometry.attributes.position.array, b = base[k];
        for (let i = 0; i < pos.length; i += 3) {
          const x = b[i], z = b[i + 2], road = Math.min(1, Math.abs(x) / (WID * 0.22));
          const wz = z + m.position.z, band = sampleBand(st.levels, (x / WID + 0.5));
          const ridge = Math.sin(wz * 0.7 + st.phase * 3) * 0.14;
          pos[i + 1] = road * (ridge + band * 1.5 + st.bands.bass * 0.5);
        }
        m.geometry.attributes.position.needsUpdate = true;
        m.material.color.setHSL(((bandHue(0.4, st)) % 360) / 360, 0.7, 0.5);
      });
      group.rotation.y = st.turn * 0.4;
      cam.position.set(p.x * 0.4, 0.9 - p.y * 0.2, 4); cam.rotation.z = st.turn * 0.3; cam.lookAt(p.x * 0.4, 0.3, -4);
    },
    dispose() { planes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); },
  };
}

// 3 · PARTICLE NEBULA — a volumetric SPHERE cloud (Fibonacci directions × per-point radius) that breathes
// outward from its rest positions with the bass and drifts; near-white core, purple rim. Additive, no bloom.
function makeNebula(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const COUNT = 4000, rng = mulberry32(0x9e3779b1);
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), base = new Float32Array(COUNT * 3), rad = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) { const [x, y, z] = fib(i, COUNT), r = 1.6 + Math.pow(rng(), 0.5) * 2.4; rad[i] = r; base[i * 3] = x * r; base[i * 3 + 1] = y * r; base[i * 3 + 2] = z * r; }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.06, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); group.add(points);
  const cIn = new THREE.Color(), cOut = new THREE.Color(); let recolor = 0;
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const breathe = (1 + st.bands.bass * 0.4) * idle(st.phase, 0.97, 0.03);
      for (let i = 0; i < COUNT * 3; i++) pos[i] = base[i] * breathe;
      geo.attributes.position.needsUpdate = true;
      if ((recolor = (recolor + 1) % 3) === 0) {               // throttle colour writes (matrices lead, colour lags)
        cIn.setHSL(((bandHue(0.55, st)) % 360) / 360, 0.5, 0.85); cOut.setHSL((H_BASS % 360) / 360, 0.8, 0.5);
        const maxR = 4;
        for (let i = 0; i < COUNT; i++) { const t = Math.min(1, rad[i] / maxR); col[i * 3] = cIn.r + (cOut.r - cIn.r) * t; col[i * 3 + 1] = cIn.g + (cOut.g - cIn.g) * t; col[i * 3 + 2] = cIn.b + (cOut.b - cIn.b) * t; }
        geo.attributes.color.needsUpdate = true;
      }
      points.material.size = 0.05 + st.bands.treble * 0.05;
      group.rotation.y += st.turn + 0.0007; group.rotation.x = Math.sin(st.phase * 0.15) * 0.2;
      cam.position.set(p.x * 0.8, p.y * -0.6, 6 - st.bands.bass * 0.6); cam.lookAt(0, 0, 0);
    },
    dispose() { geo.dispose(); points.material.dispose(); },
  };
}

// 4 · AUDIO TUNNEL — a stack of ring "slices" freezes the spectrum at spawn and carries it backward while the
// camera flies forward through its own recent audio history; wide FOV + fog vanishing point sell the depth.
function makeTunnel(THREE) {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x07070a, 8, 30);
  const cam = new THREE.PerspectiveCamera(92, 1, 0.1, 40);
  const RINGS = 40, SEG = N, DZ = 1.3, SPEED = 0.16;
  const rings = [], colors = []; const C = new THREE.Color();
  for (let k = 0; k < RINGS; k++) {
    const g = new THREE.BufferGeometry(), a = new Float32Array((SEG + 1) * 3);
    g.setAttribute("position", new THREE.BufferAttribute(a, 3)); g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const loop = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ transparent: true, toneMapped: false }));
    loop.position.z = -k * DZ; loop.userData.age = k; scene.add(loop); rings.push(loop); colors.push(new THREE.Color(0x223));
  }
  const stamp = (loop, st) => {                                 // freeze the current spectrum into this ring
    const arr = loop.geometry.attributes.position.array; let avg = 0;
    for (let s = 0; s <= SEG; s++) { const i = s % SEG, a = (i / SEG) * TAU, lv = st.levels[i] || 0; avg += lv; const r = 1.5 + lv * 1.3 + st.bands.bass * 0.4; arr[s * 3] = Math.cos(a) * r; arr[s * 3 + 1] = Math.sin(a) * r; arr[s * 3 + 2] = 0; }
    loop.geometry.attributes.position.needsUpdate = true;
    loop.material.color.copy(C.setHSL(((bandHue(avg / SEG, st)) % 360) / 360, 0.8, 0.6));
    loop.rotation.z += 0.05;
  };
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const adv = SPEED * (1 + st.bands.bass);
      for (const loop of rings) {
        loop.position.z += adv;
        if (loop.position.z > 2) { loop.position.z -= RINGS * DZ; stamp(loop, st); }
        const dist = 2 - loop.position.z; loop.material.opacity = Math.max(0.05, Math.min(1, 1 - dist / (RINGS * DZ)));
      }
      cam.rotation.z += 0.002 + st.turn * 0.01;
      cam.position.set(p.x * 0.3, p.y * -0.3, 2); cam.lookAt(Math.sin(st.phase * 0.4) * 0.6, Math.cos(st.phase * 0.3) * 0.6, -10);
    },
    dispose() { rings.forEach((l) => { l.geometry.dispose(); l.material.dispose(); }); },
  };
}

// 5 · SPHERE URCHIN — cones mounted on a low-poly icosahedron's even Fibonacci directions, oriented radially
// with real quaternions and growing from their base at the surface; the whole urchin breathes on the kick.
function makeUrchin(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(46, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const K = 60, UP = new THREE.Vector3(0, 1, 0), dirs = [];
  for (let i = 0; i < K; i++) { const [x, y, z] = fib(i, K); dirs.push(new THREE.Vector3(x, y, z)); }
  const cone = new THREE.ConeGeometry(0.06, 1, 6); cone.translate(0, 0.5, 0);
  const spikes = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ toneMapped: false }), K); spikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const glow = new THREE.InstancedMesh(cone, glowMat(THREE, 0.12), K);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 1), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.35, toneMapped: false }));
  group.add(glow, spikes, core);
  const C = new THREE.Color(), d = new THREE.Object3D();
  for (let i = 0; i < K; i++) spikes.setColorAt(i, C.setHSL(0.55, 0.7, 0.5));
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const br = idle(st.phase);
      for (let i = 0; i < K; i++) {
        const band = sampleBand(st.levels, i / (K - 1)), len = (0.25 + band * 1.4 + st.bands.mid * 0.3) * br;
        d.position.copy(dirs[i]); d.quaternion.setFromUnitVectors(UP, dirs[i]); d.scale.set(1, len, 1); d.updateMatrix();
        spikes.setMatrixAt(i, d.matrix); d.scale.set(1.6, len, 1.6); d.updateMatrix(); glow.setMatrixAt(i, d.matrix);
        spikes.setColorAt(i, C.setHSL(((bandHue(i / (K - 1), st)) % 360) / 360, 0.8, 0.4 + band * 0.4));
      }
      spikes.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true; if (spikes.instanceColor) spikes.instanceColor.needsUpdate = true;
      core.scale.setScalar((1 + st.bands.bass * 0.18) * br);
      group.rotation.y += st.turn + 0.002; group.rotation.x = Math.sin(st.phase * 0.2) * 0.15;
      cam.position.set(p.x * 0.6, p.y * -0.5, 6 - st.bands.bass * 0.5); cam.lookAt(0, 0, 0);
    },
    dispose() { cone.dispose(); spikes.material.dispose(); glow.material.dispose(); core.geometry.dispose(); core.material.dispose(); },
  };
}

// 6 · DNA DOUBLE HELIX — two intertwined strands of instanced spheres, rungs a LineSegments ladder; the bass
// inflates the whole radius, and only the loudest rungs light (a travelling ladder of colour, not all-on).
function makeHelix(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const RUNGS = 56, HH = 15, sph = new THREE.SphereGeometry(1, 10, 10);
  const balls = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ toneMapped: false }), RUNGS * 2); balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rg = new THREE.BufferGeometry(), rpos = new Float32Array(RUNGS * 2 * 3), rcol = new Float32Array(RUNGS * 2 * 3);
  rg.setAttribute("position", new THREE.BufferAttribute(rpos, 3)); rg.setAttribute("color", new THREE.BufferAttribute(rcol, 3)); rg.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const rungs = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  group.add(balls, rungs);
  const C = new THREE.Color(), d = new THREE.Object3D();
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const R = 2.2 * (1 + st.bands.bass * 0.6) * idle(st.phase);
      for (let k = 0; k < RUNGS; k++) {
        const t = k / (RUNGS - 1), y = (t - 0.5) * HH, a = t * TAU * 3 + st.phase * 0.6, band = sampleBand(st.levels, t), s = 0.12 + band * 0.34;
        for (let strand = 0; strand < 2; strand++) {
          const ang = a + strand * Math.PI, x = Math.cos(ang) * R, z = Math.sin(ang) * R, idx = k * 2 + strand;
          d.position.set(x, y, z); d.scale.setScalar(s); d.updateMatrix(); balls.setMatrixAt(idx, d.matrix);
          balls.setColorAt(idx, C.setHSL(((bandHue(t, st)) % 360) / 360, 0.5, 0.55 + band * 0.3));
          rpos[idx * 3] = x; rpos[idx * 3 + 1] = y; rpos[idx * 3 + 2] = z;
          const lit = band * band;                              // selective: only loud rungs glow
          C.setHSL(((bandHue(t, st)) % 360) / 360, 0.8, 0.15 + lit * 0.6);
          rcol[idx * 3] = C.r; rcol[idx * 3 + 1] = C.g; rcol[idx * 3 + 2] = C.b;
        }
      }
      balls.instanceMatrix.needsUpdate = true; if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      rg.attributes.position.needsUpdate = rg.attributes.color.needsUpdate = true;
      group.rotation.y += 0.004 + st.turn; group.rotation.z = Math.sin(st.phase * 0.15) * 0.08;
      cam.position.set(Math.sin(st.phase * 0.15) * 2 + p.x, p.y * -0.5, 17); cam.lookAt(0, 0, 0);
    },
    dispose() { sph.dispose(); balls.material.dispose(); rg.dispose(); rungs.material.dispose(); },
  };
}

// 7 · FLOWING RIBBON — a single Catmull-Rom stroke synthesized from the 28 bands (no waveform exists),
// centred vertically so silence sits mid-frame, living in 3D with a Z-wobble; a calligraphic phosphor line.
function makeRibbon(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const CTRL = N, SAMPLES = 220, W = 13, A = 4.2;
  const pts = []; for (let i = 0; i < CTRL; i++) pts.push(new THREE.Vector3((i / (CTRL - 1) - 0.5) * W, 0, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const g = new THREE.BufferGeometry(), lpos = new Float32Array((SAMPLES + 1) * 3), lcol = new Float32Array((SAMPLES + 1) * 3);
  g.setAttribute("position", new THREE.BufferAttribute(lpos, 3)); g.setAttribute("color", new THREE.BufferAttribute(lcol, 3)); g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const glow = new THREE.Line(g, glowMat(THREE, 0.2)); glow.scale.set(1, 1.04, 1);
  group.add(glow, line);
  const C = new THREE.Color(), v = new THREE.Vector3();
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const br = idle(st.phase, 0.9, 0.12);
      for (let i = 0; i < CTRL; i++) { const band = st.levels[i] || 0; pts[i].y = (band - 0.4) * A * br; pts[i].z = Math.sin(i * 0.5 + st.phase) * 1.2; }
      for (let s = 0; s <= SAMPLES; s++) { curve.getPoint(s / SAMPLES, v); lpos[s * 3] = v.x; lpos[s * 3 + 1] = v.y; lpos[s * 3 + 2] = v.z; const band = sampleBand(st.levels, s / SAMPLES); C.setHSL(((bandHue(s / SAMPLES, st)) % 360) / 360, 0.75, 0.5 + band * 0.4); lcol[s * 3] = C.r; lcol[s * 3 + 1] = C.g; lcol[s * 3 + 2] = C.b; }
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
      group.rotation.z = Math.sin(st.phase * 0.2) * 0.14 + st.turn; group.scale.y = 1 + st.bands.bass * 0.4;
      cam.position.set(p.x * 0.5, 0.5 + p.y * -0.4, 9); cam.lookAt(0, 0, 0);
    },
    dispose() { g.dispose(); line.material.dispose(); glow.material.dispose(); },
  };
}

// 8 · VORTEX GALAXY — a flat spiral disc of additive points (Bruno Simon's generator), spinning in a 3/4
// view with a blown-out hot core; hue constrained to a purple→cyan band, never a rainbow pinwheel.
function makeVortex(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const COUNT = 6000, base = galaxyDisc(COUNT, { radius: 6, branches: 5, spin: 1.1, randomness: 0.35, power: 3, thin: 0.35 }, mulberry32(0x1b3984));
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(base), col = new Float32Array(COUNT * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
  const coreGeo = new THREE.SphereGeometry(0.35, 16, 16); const coreMesh = new THREE.Mesh(coreGeo, glowMat(THREE, 0.6));
  group.add(points, coreMesh);
  const cIn = new THREE.Color(), cOut = new THREE.Color(); let recolor = 0;
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const breathe = (1 + st.bands.bass * 0.25) * idle(st.phase, 0.98, 0.02);
      for (let i = 0; i < COUNT * 3; i++) pos[i] = base[i] * breathe; geo.attributes.position.needsUpdate = true;
      if ((recolor = (recolor + 1) % 4) === 0) {
        cIn.setHSL(((bandHue(0.7, st)) % 360) / 360, 0.6, 0.85); cOut.setHSL((H_BASS % 360) / 360, 0.8, 0.45); const maxR = 6.5;
        for (let i = 0; i < COUNT; i++) { const r = Math.hypot(base[i * 3], base[i * 3 + 2]), t = Math.min(1, r / maxR); col[i * 3] = cIn.r + (cOut.r - cIn.r) * t; col[i * 3 + 1] = cIn.g + (cOut.g - cIn.g) * t; col[i * 3 + 2] = cIn.b + (cOut.b - cIn.b) * t; }
        geo.attributes.color.needsUpdate = true;
      }
      coreMesh.scale.setScalar(1 + st.bands.bass * 0.9); coreMesh.material.opacity = 0.4 + st.bands.bass * 0.4;
      group.rotation.y += 0.0016 + st.turn * 0.5 + st.bands.treble * 0.004;
      cam.position.set(p.x, 6 - p.y * 0.8, 9); cam.lookAt(0, 0, 0);
    },
    dispose() { geo.dispose(); points.material.dispose(); coreGeo.dispose(); coreMesh.material.dispose(); },
  };
}

// 9 · CUBE MATRIX — a 16×16 LED dancefloor (one InstancedMesh); bass ripples from the centre outward by
// RADIAL band mapping, heights LERP toward target (LED smoothness) and grow from the floor; low raking camera.
function makeMatrix(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const G = 16, COUNT = G * G, SP = 1.25, geo = new THREE.BoxGeometry(1, 1, 1);
  const cubes = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), COUNT); cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(cubes);
  const C = new THREE.Color(), d = new THREE.Object3D(), cur = new Float32Array(COUNT), frac = new Float32Array(COUNT), cx = (G - 1) / 2;
  const maxD = Math.hypot(cx, cx);
  for (let i = 0; i < COUNT; i++) { const gx = i % G, gz = (i / G) | 0; frac[i] = Math.hypot(gx - cx, gz - cx) / maxD; }
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const br = idle(st.phase, 0.9, 0.1);
      for (let i = 0; i < COUNT; i++) {
        const gx = i % G, gz = (i / G) | 0, band = sampleBand(st.levels, frac[i]);
        const target = (0.2 + band * 6) * br; cur[i] += (target - cur[i]) * 0.25;
        d.position.set((gx - cx) * SP, cur[i] / 2, (gz - cx) * SP); d.scale.set(1, Math.max(0.2, cur[i]), 1); d.updateMatrix(); cubes.setMatrixAt(i, d.matrix);
        cubes.setColorAt(i, C.setHSL(((bandHue(frac[i], st)) % 360) / 360, 0.7, 0.28 + band * 0.5));
      }
      cubes.instanceMatrix.needsUpdate = true; if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
      group.rotation.y = st.turn * 0.5;
      cam.position.set(Math.sin(st.phase * 0.1) * 3 + p.x, 3.6 - p.y * 0.4 + st.bands.bass * 0.3, 12); cam.lookAt(0, 1, 0);
    },
    dispose() { geo.dispose(); cubes.material.dispose(); },
  };
}

// 10 · BLOOM / SHATTER — a wireframe icosahedron breathes, then SHATTERS on the kick (an asymmetric envelope:
// snap out, slow reform), cross-fading the clean solid into its flying shards + orbiting debris and back.
function makeBloom(THREE) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const coreGeo = new THREE.IcosahedronGeometry(2, 1), core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, toneMapped: false }));
  const shellGeo = new THREE.IcosahedronGeometry(2, 0), shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); shell.scale.setScalar(1.25);
  const SH = 80, shGeo = new THREE.TetrahedronGeometry(0.22), shards = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }), SH); shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const DEB = 300, dg = new THREE.BufferGeometry(), dpos = new Float32Array(DEB * 3);
  const rng = mulberry32(0x51ed270b), dir = [], axis = [], spin = [];
  for (let i = 0; i < SH; i++) { const [x, y, z] = fib(i, SH); dir.push(new THREE.Vector3(x, y, z)); axis.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize()); spin.push(rng() * 6 + 2); }
  for (let i = 0; i < DEB; i++) { const [x, y, z] = fib(i, DEB), r = 2.4 + rng() * 1.6; dpos[i * 3] = x * r; dpos[i * 3 + 1] = y * r; dpos[i * 3 + 2] = z * r; }
  dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3)); dg.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const debris = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xbfb2ff }));
  group.add(shell, core, shards, debris);
  const C = new THREE.Color(), d = new THREE.Object3D(), q = new THREE.Quaternion(); let explode = 0;
  return {
    scene, cam,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    frame(st, p) {
      const target = st.bands.bass; explode += (target > explode ? 0.2 : 0.06) * (target - explode);   // snap out, slow reform
      const e = Math.max(0, Math.min(1, explode));
      const br = idle(st.phase);
      core.scale.setScalar((1 + st.bands.mid * 0.4) * br); core.rotation.y += 0.006 + st.turn; core.rotation.x += 0.003;
      core.material.color.setHSL(((bandHue(0.5, st)) % 360) / 360, 0.35, 0.85); core.material.opacity = (1 - e) * 0.9 + 0.1;
      shell.scale.setScalar(1.25 + st.bands.bass * 0.4); shell.material.color.setHSL((H_BASS % 360) / 360, 0.7, 0.5); shell.material.opacity = 0.08 + st.bands.bass * 0.12;
      for (let i = 0; i < SH; i++) {
        const grow = 1 + e * 4; d.position.copy(dir[i]).multiplyScalar(1.4 * grow);
        q.setFromAxisAngle(axis[i], e * spin[i]); d.quaternion.copy(q); d.scale.setScalar(0.6 + st.bands.treble * 0.6); d.updateMatrix(); shards.setMatrixAt(i, d.matrix);
        shards.setColorAt(i, C.setHSL(((bandHue(i / SH, st)) % 360) / 360, 0.7, 0.35 + e * 0.4));
      }
      shards.instanceMatrix.needsUpdate = true; if (shards.instanceColor) shards.instanceColor.needsUpdate = true; shards.material.opacity = Math.min(1, 0.2 + e);
      debris.scale.setScalar(1 + st.bands.bass * 0.3); debris.rotation.y += 0.0015 + st.turn; debris.rotation.x = Math.sin(st.phase * 0.1) * 0.2;   // debris positions static; breathe via scale
      group.rotation.y += st.turn * 0.2;
      cam.position.set(p.x, p.y * -0.5, 8 - e * 1.5); cam.lookAt(0, 0, 0);
    },
    dispose() { coreGeo.dispose(); core.material.dispose(); shellGeo.dispose(); shell.material.dispose(); shGeo.dispose(); shards.material.dispose(); dg.dispose(); debris.material.dispose(); },
  };
}

// The gallery, in swipe order (each fundamentally different in topology + motion + material).
export const VIZ = [
  { id: "ring", make: makeRing },
  { id: "terrain", make: makeTerrain },
  { id: "nebula", make: makeNebula },
  { id: "tunnel", make: makeTunnel },
  { id: "urchin", make: makeUrchin },
  { id: "helix", make: makeHelix },
  { id: "ribbon", make: makeRibbon },
  { id: "vortex", make: makeVortex },
  { id: "matrix", make: makeMatrix },
  { id: "bloom", make: makeBloom },
];
export const VIZ_COUNT = VIZ.length;

// ======================= Canvas2D fallback (preflight/linkedom · no WebGL) =======================
// One generic radial spectrum for every scene — it only ever shows where WebGL is absent (preflight); on a
// device and in CI's Chromium the real three.js scene renders. Guarded hard: linkedom returns a non-null 2d
// stub, so bail unless it's a real context.
function ctx2d(canvas) { try { const c = canvas.getContext("2d"); return c && typeof c.fillRect === "function" && typeof c.arc === "function" ? c : null; } catch { return null; } }
function drawFallback(canvas, st) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.22;
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU - Math.PI / 2, lv = st.levels[i] || 0, len = R * (0.4 + lv * 1.3);
    g.strokeStyle = `hsl(${((bandHue(i / N, st)) % 360 + 360) % 360} 72% ${45 + lv * 30}%)`;
    g.lineWidth = Math.max(1, w * 0.006); g.lineCap = "round";
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); g.stroke();
  }
}

// ======================= the stage — one renderer, lazy scene, dispose on switch =======================
function disposeScene(store) {
  const sc = store.scene; if (!sc) return;
  try { sc.dispose?.(); sc.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.(); }); } catch { /* */ }
  store.scene = null; try { store.renderer?.renderLists?.dispose(); } catch { /* */ } }

// Full-bleed spectrum background: fixed z-0, behind the floating islands (relative z-10). `index` picks the
// active scene; changing it disposes the old scene and lazily builds the new one on the SHARED renderer.
export function SpectrumStage({ index = 0 }) {
  const ref = useRef();
  const store = useRef({ renderer: null, THREE: null, scene: null, index, unsub: null, ro: null, parallax: null }).current;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let dead = false;
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => { const [w, h] = dims(), dpr = DPR(), bw = Math.round(w * dpr), bh = Math.round(h * dpr); canvas.width = bw; canvas.height = bh; store.renderer?.setSize(bw, bh, false); store.scene?.resize(bw, bh); };
    store.build = (i) => { if (!store.THREE) return; disposeScene(store); try { store.scene = VIZ[i % VIZ.length].make(store.THREE); const [w, h] = dims(), dpr = DPR(); store.scene.resize(Math.round(w * dpr), Math.round(h * dpr)); } catch { store.scene = null; } };
    (async () => {
      if (hasWebGL()) {
        try {
          const THREE = await import("three"); if (dead) return; store.THREE = THREE;
          store.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
          store.build(store.index);
        } catch { store.THREE = null; store.renderer = null; }
      }
      size();
      store.parallax = Parallax({ maxDeg: 22, gain: 1, reduced: immersion.reduced });
      store.unsub = subscribe((st) => {
        const p = immersion.on ? store.parallax.update(immersion.beta, immersion.gamma) : store.parallax.update(0, 0);
        if (store.scene && store.renderer) { try { store.scene.frame(st, p); store.renderer.render(store.scene.scene, store.scene.cam); } catch { /* */ } }
        else drawFallback(canvas, st);
      });
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
    })();
    return () => { dead = true; store.unsub?.(); store.ro?.disconnect(); disposeScene(store); try { store.renderer?.dispose(); } catch { /* */ } store.renderer = null; };
  }, []);
  // live scene swap after mount (renderer + pump persist; only the scene graph is rebuilt)
  useEffect(() => { store.index = index; if (store.THREE && store.build) store.build(index); }, [index]);
  return html`<canvas ref=${ref} data-stage data-live aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
