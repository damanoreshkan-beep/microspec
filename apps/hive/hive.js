
import { hexSpiral, hexToXY } from "/_rt/radar.js";

const HEX = 0.5;                 
const GAP = 0.9;                 
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
  scene.add(new THREE.AmbientLight(0xffffff, theme.dark ? 0.62 : 0.78));
  const key = new THREE.DirectionalLight(0xffffff, theme.dark ? 0.85 : 0.7);
  key.position.set(-3, 7, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.25);
  rim.position.set(4, 2, -5);
  scene.add(rim);

  const geo = new THREE.CylinderGeometry(HEX * GAP, HEX * GAP, 1, 6, 1);
  geo.translate(0, 0.5, 0);
  geo.rotateY(Math.PI / 6);                       

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
    floorFor = -1;                                 
  });
  try { obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch {  }

  let stopped = false, raf = 0;
  const grown = new Map();                          

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

    const coords = hexSpiral(Math.max(19, cells.length));
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
      const prev = grown.get(c.key);
      const hgt = reducedMotion || prev == null ? want : prev + (want - prev) * 0.18;
      grown.set(c.key, hgt);

      const age = c.pulse ? now - c.pulse : 1e9;
      const lift = reducedMotion ? 0 : Math.max(0, 1 - age / 700) * 0.09;
      m.visible = true;
      m.position.set(x, lift, y);
      m.scale.set(1, hgt, 1);
      const col = colourFor(c.kind, theme);
      m.material.color.copy(c.target ? col.clone().offsetHSL(0, 0, 0.18) : col);
    }
    for (let i = n; i < pool.length; i++) if (pool[i]) pool[i].visible = false;
    for (const k of [...grown.keys()]) if (!cells.some((c) => c.key === k)) grown.delete(k);

    const pitch = 0.72;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const R = spread * 1.08;
    const dist = 1.06 * Math.max(R / (half * camera.aspect), (R * Math.sin(pitch) + 0.9) / half);
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0.25, 0);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    try { obs.disconnect(); } catch {  }
    geo.dispose();
    for (const m of pool) if (m) m.material.dispose();
    floor.clear();
    try { renderer.dispose(); } catch {  }
  };
}
