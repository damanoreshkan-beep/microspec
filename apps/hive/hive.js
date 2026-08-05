// hive — every radio around you as one hexagonal cell.
//
// What the geometry encodes, and nothing else:
//   · HEIGHT     — signal strength as a percentage of that radio's own honest dBm range. The three radios
//                  are not one quantity (RSRP runs ~40 dB below a BLE advertisement), so each is scaled
//                  against its own floor and ceiling in packages/runtime/radar.js.
//   · RANK       — the spiral packs strongest at the centre. Distance from the middle is ORDER, not metres.
//   · COLOUR     — which radio: accent for BLE, bright ink for Wi-Fi, dim ink for cell.
//
// What it deliberately does NOT encode: direction. A honeycomb has no compass, which is exactly why it
// replaced the dome — a ring around a centre invites reading an angle that no stock phone can measure
// (apps/hive/RESEARCH.md). The one screen with angles is Hunt, where the user earns them by sweeping.
//
// Placement comes from the SAME ordering as the list (orderDevices), so the grid and the rows always
// describe each other, and neither reshuffles on ordinary fading.
//
// three is lazy-imported and init is PROBE-guarded on getContext("webgl") — not gate-guarded — so CI's
// headless Chrome renders the real scene into the shots, while preflight's linkedom fails the probe and
// the DOM list stays the whole picture. Colours are read from CSS and re-read on a data-theme mutation.

import { hexSpiral, hexToXY } from "/_rt/radar.js";

const HEX = 0.5;                 // circumradius of one cell in world units
const GAP = 0.9;                 // cell fill inside its slot — the mortar between the combs
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch { return false; }
}

function readTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--color-base-content").trim() || "#ECECEE";
    const accent = cs.getPropertyValue("--app-accent").trim() || "#D9548E";
    const dt = document.documentElement.getAttribute("data-theme");
    const dark = dt ? dt !== "light" : (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
    return { ink, accent, dark };
  } catch { return { ink: "#ECECEE", accent: "#D9548E", dark: true }; }
}

/**
 * mount(canvas, getState) -> stop()
 * `getState()` is polled per frame: { cells: [{ key, kind, percent, pulse, target }] } already ORDERED.
 */
export async function mount(canvas, getState) {
  if (!canvas || !hasWebGL()) return () => {};
  let THREE;
  try { THREE = await import("three"); } catch { return () => {}; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const world = new THREE.Group();
  scene.add(world);

  let theme = readTheme();
  // Lambert rather than Standard: no environment map is loaded, so a PBR material would render nearly
  // black and the extrusion — the entire point — would be invisible.
  scene.add(new THREE.AmbientLight(0xffffff, theme.dark ? 0.62 : 0.78));
  const key = new THREE.DirectionalLight(0xffffff, theme.dark ? 0.85 : 0.7);
  key.position.set(-3, 7, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.25);
  rim.position.set(4, 2, -5);
  scene.add(rim);

  // A 6-sided cylinder IS a hexagonal prism. Anchored at its base so scaling grows it upward instead of
  // through the floor — a centre-anchored column sinks as it rises and the field looks like it is melting.
  const geo = new THREE.CylinderGeometry(HEX * GAP, HEX * GAP, 1, 6, 1);
  geo.translate(0, 0.5, 0);
  geo.rotateY(Math.PI / 6);                       // pointy-top, matching hexToXY's axial layout

  // Plain meshes, one per cell, pooled. An InstancedMesh would batch this into one draw call, but 240
  // hexagonal prisms is nothing for a phone GPU and a per-mesh material is what lets a hunted cell carry
  // its own colour. (It was also blamed, wrongly, for the columns not drawing — see `nowMs` below.)
  const MAX = 240;
  const pool = [];
  function cellAt(i) {
    if (pool[i]) return pool[i];
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial());
    m.visible = false;
    world.add(m);
    pool[i] = m;
    return m;
  }

  // The empty floor: a faint comb so the field reads as a hive even before anything is found.
  const floor = new THREE.Group();
  world.add(floor);
  let floorFor = -1;
  const floorMat = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.ink), transparent: true, opacity: 0.12 });
  function buildFloor(n) {
    if (floorFor === n) return;
    floorFor = n;
    floor.clear();
    const pts = [];
    for (const c of hexSpiral(Math.max(19, n))) {
      const { x, y } = hexToXY(c, HEX);
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push(new THREE.Vector3(x + Math.cos(a) * HEX * GAP, 0, y + Math.sin(a) * HEX * GAP));
        if (i > 0 && i < 6) pts.push(new THREE.Vector3(x + Math.cos(a) * HEX * GAP, 0, y + Math.sin(a) * HEX * GAP));
      }
    }
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), floorMat));
  }

  const colourFor = (kind, t) => {
    if (kind === "ble") return new THREE.Color(t.accent);
    const ink = new THREE.Color(t.ink);
    if (kind === "wifi") return ink;
    return ink.clone().multiplyScalar(t.dark ? 0.55 : 1.0).lerp(new THREE.Color(t.dark ? 0x000000 : 0xffffff), t.dark ? 0 : 0.45);
  };

  const obs = new MutationObserver(() => {
    theme = readTheme();
    floorMat.color = new THREE.Color(theme.ink);
    floorFor = -1;                                 // force the comb to rebuild with the new ink next frame
  });
  try { obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch { /* linkedom */ }

  let stopped = false, raf = 0;
  const grown = new Map();                          // key -> current height, so a new cell rises rather than pops

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const cells = (getState() || {}).cells || [];
    resize();
    buildFloor(cells.length);
    // TWO CLOCKS, and mixing them cost two rounds. `now` here is the rAF timestamp — milliseconds since
    // the page loaded — while `pulse` is Date.now(), an epoch. Subtracting one from the other gave an age
    // of -1.79e12 ms, so `1 - age/700` became 2.6e9 and every column was translated 230 MILLION units
    // above a camera sitting at ~10. They were rendering perfectly, just not in this solar system.
    const nowMs = Date.now();

    const coords = hexSpiral(Math.max(19, cells.length));
    // The field's own radius in world units, so the camera frames what exists rather than a fixed guess.
    let spread = 0;
    for (let i = 0; i < Math.max(19, cells.length); i++) {
      const { x, y } = hexToXY(coords[i], HEX);
      spread = Math.max(spread, Math.hypot(x, y));
    }
    spread += HEX;

    const n = Math.min(cells.length, MAX);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const m = cellAt(i);
      const { x, y } = hexToXY(coords[i], HEX);
      const want = 0.06 + (Math.max(0, Math.min(100, c.percent)) / 100) * 1.5;
      // Ease toward the target so a fading signal settles instead of flickering — the same reason the
      // list sorts on bands: 5-15 dB of stationary fade is normal and must not read as motion.
      const prev = grown.get(c.key);
      const hgt = reducedMotion || prev == null ? want : prev + (want - prev) * 0.18;
      grown.set(c.key, hgt);

      const age = c.pulse ? nowMs - c.pulse : 1e9;
      const lift = reducedMotion ? 0 : Math.max(0, 1 - age / 700) * 0.09;
      m.visible = true;
      m.position.set(x, lift, y);
      m.scale.set(1, hgt, 1);
      const col = colourFor(c.kind, theme);
      m.material.color.copy(c.target ? col.clone().offsetHSL(0, 0, 0.18) : col);
    }
    for (let i = n; i < pool.length; i++) if (pool[i]) pool[i].visible = false;
    for (const k of [...grown.keys()]) if (!cells.some((c) => c.key === k)) grown.delete(k);

    // Frame the hive from both fields of view — a constant distance frames by HEIGHT and runs a wide field
    // off the sides on a phone. Same derivation the dome needed; the lesson outlived the geometry.
    // Pitch follows the aspect, and here it is a real trade rather than the dome's free win: a disc seen
    // low foreshortens to sin(p) and wastes the height of a phone (measured: 30% of the stage), but seen
    // from straight above the COLUMNS lose the very extent they encode. So a tall screen leans to 0.95
    // and landscape stays at 0.62 — which puts the fill at 96% wide / 71% tall on a phone.
    const lean = Math.min(1, Math.max(0, (camera.aspect - 0.45) / 1.15));
    const pitch = 1.02 - 0.40 * lean;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const R = spread * 1.06;
    // The vertical extent is the foreshortened disc PLUS the tallest column standing on it — framing on
    // the disc alone crops the tops off, which is the one thing this scene exists to show.
    const vert = R * Math.sin(pitch) + 1.56 * Math.cos(pitch) * 0.5 + 0.35;
    const dist = 1.04 * Math.max(R / (half * camera.aspect), vert / half);
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0.42, 0);   // the columns midpoint, not the floor, or the field sits low in frame
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    try { obs.disconnect(); } catch { /* never observed */ }
    geo.dispose();
    for (const m of pool) if (m) m.material.dispose();
    floor.clear();
    try { renderer.dispose(); } catch { /* context already lost */ }
  };
}
