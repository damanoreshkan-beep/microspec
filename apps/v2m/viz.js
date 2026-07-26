
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { DEFAULTS, logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, seedFrame, idle } from "/_rt/spectrum.js";
import { byteCloud, seedBytes } from "/_rt/v2m.js";

const N = DEFAULTS.bars;
const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const H_LOW = 262, H_HIGH = 190;

let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }

let _cloud = byteCloud(seedBytes());
let _cloudGen = 0;
export function setTuneBytes(buf) {
  const next = buf && buf.byteLength ? byteCloud(new Uint8Array(buf)) : byteCloud(seedBytes());
  if (next.length) { _cloud = next; _cloudGen++; }
}

const EDGES = logBandEdges();
const env = Envelope(0.55, 0.12, N);
const subs = new Set();
let pumpRaf = null, phase = 0;
function pump() {
  phase += reducedMotion ? 0.012 : 0.04;
  const u8 = (_getBytes && _getBytes()) || seedFrame(1024, phase);
  const st = {
    levels: env.update(bandLevels(u8, EDGES)),
    bands: splitBands(u8),
    hue: spectralCentroid(u8).hue,
    phase,
  };
  for (const fn of subs) { try { fn(st); } catch {  } }
  pumpRaf = requestAnimationFrame(pump);
}
function subscribe(fn) {
  subs.add(fn);
  if (!pumpRaf && typeof requestAnimationFrame !== "undefined") pumpRaf = requestAnimationFrame(pump);
  return () => { subs.delete(fn); if (!subs.size && pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = null; } };
}

const SHELL_R = 1.34;
const FOV = 46;
function fitDistance(aspect) {
  const vHalf = (FOV / 2) * (Math.PI / 180);
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, aspect));
  const need = SHELL_R * 1.22;
  return Math.max(need / Math.tan(vHalf), need / Math.tan(hHalf));
}

const isLight = () => {
  try { return /light/.test(document.documentElement.getAttribute("data-theme") || ""); } catch { return false; }
};

function makeScene(THREE) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  cam.position.set(0, 0, fitDistance(1));
  const group = new THREE.Group();
  scene.add(group);

  const geo = new THREE.BufferGeometry();
  const mat = new THREE.PointsMaterial({
    size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);

  const shellGeo = new THREE.IcosahedronGeometry(SHELL_R, 1);
  const shellMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.12, toneMapped: false });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  group.add(pts, shell);
  let light = null;

  let gen = -1;
  const sync = () => {
    if (gen === _cloudGen) return;
    gen = _cloudGen;
    geo.setAttribute("position", new THREE.BufferAttribute(_cloud.slice(), 3));
    geo.computeBoundingSphere();
  };
  sync();

  return {
    scene, cam,
    resize(w, h) {
      cam.aspect = w / h;
      cam.position.z = fitDistance(cam.aspect);
      cam.updateProjectionMatrix();
    },
    frame(st) {
      sync();
      const lt = isLight();
      if (lt !== light) {                              
        light = lt;
        mat.blending = lt ? THREE.NormalBlending : THREE.AdditiveBlending;
        mat.needsUpdate = true;
      }
      const br = idle(st.phase);
      const hue = (H_LOW + (H_HIGH - H_LOW) * Math.min(1, st.bands.treble * 1.6) + (st.hue - 235) * 0.1) / 360;
      const scale = (1 + st.bands.bass * 0.22) * br;
      group.scale.setScalar(scale);
      group.rotation.y += 0.0016 + st.bands.mid * 0.006;
      group.rotation.x = Math.sin(st.phase * 0.08) * 0.18;
      mat.size = 0.026 + st.bands.treble * 0.03;
      mat.opacity = lt ? 0.75 + st.bands.mid * 0.25 : 0.55 + st.bands.mid * 0.4;
      mat.color.setHSL(((hue % 1) + 1) % 1, lt ? 0.68 : 0.72, lt ? 0.42 : 0.62);
      shell.rotation.y -= 0.0012;
      shellMat.opacity = (lt ? 0.14 : 0.07) + st.bands.bass * 0.13;
      shellMat.color.setHSL(H_LOW / 360, 0.5, lt ? 0.42 : 0.6);
    },
    dispose() { geo.dispose(); mat.dispose(); shellGeo.dispose(); shellMat.dispose(); },
  };
}

function ctx2d(canvas) {
  try { const c = canvas.getContext("2d"); return c && typeof c.fillRect === "function" && typeof c.arc === "function" ? c : null; } catch { return null; }
}
function drawFallback(canvas, st) {
  const g = ctx2d(canvas); if (!g) return;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.3 * (1 + st.bands.bass * 0.25);
  const a = st.phase * 0.25, ca = Math.cos(a), sa = Math.sin(a);
  g.clearRect(0, 0, w, h);
  const hue = H_LOW + (H_HIGH - H_LOW) * Math.min(1, st.bands.treble * 1.6);
  const lt = isLight();
  g.fillStyle = `hsl(${hue} 70% ${(lt ? 40 : 55) + st.bands.mid * 15}%)`;
  const r = Math.max(1, w * 0.0035);
  const step = Math.max(3, Math.ceil(_cloud.length / 3 / 2200) * 3);
  for (let i = 0; i < _cloud.length; i += step) {
    const x = _cloud[i], y = _cloud[i + 1], z = _cloud[i + 2];
    const px = x * ca - z * sa;
    g.beginPath();
    g.arc(cx + px * R, cy + y * R, r, 0, Math.PI * 2);
    g.fill();
  }
}

export function ByteStage() {
  const ref = useRef();
  const store = useRef({ renderer: null, scene: null, unsub: null, ro: null }).current;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    let dead = false;
    const dims = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
    const size = () => {
      const [w, h] = dims(), dpr = DPR();
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      store.renderer?.setSize(canvas.width, canvas.height, false);
      store.scene?.resize(canvas.width, canvas.height);
    };
    const webgl = hasWebGL();
    canvas.setAttribute("data-haswebgl", webgl ? "yes" : "no");
    (async () => {
      if (webgl) {
        try {
          const THREE = await import("three"); if (dead) return;
          store.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
          store.scene = makeScene(THREE);
        } catch (e) {
          store.renderer = null; store.scene = null;
          canvas.setAttribute("data-err", String(e && e.message || e).slice(0, 80));
        }
      }
      canvas.setAttribute("data-render", store.scene ? "webgl" : "2d");
      size();
      store.unsub = subscribe((st) => {
        if (store.scene && store.renderer) {
          try { store.scene.frame(st); store.renderer.render(store.scene.scene, store.scene.cam); } catch {  }
        } else drawFallback(canvas, st);
      });
      if (typeof ResizeObserver !== "undefined") { store.ro = new ResizeObserver(size); store.ro.observe(canvas); }
    })();
    return () => {
      dead = true; store.unsub?.(); store.ro?.disconnect();
      try { store.scene?.dispose(); store.renderer?.renderLists?.dispose(); store.renderer?.dispose(); } catch {  }
      store.scene = null; store.renderer = null;
    };
  }, []);
  return html`<canvas ref=${ref} data-stage aria-hidden="true"
    class="absolute inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
