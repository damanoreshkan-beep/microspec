
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { DEFAULTS, logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope } from "/_rt/spectrum.js";
import { byteCloud, seedBytes, helixStrand, helixAt } from "/_rt/v2m.js";

const N = DEFAULTS.bars;
const DPR = () => Math.min(1.5, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const H_LOW = 42, H_HIGH = 176;

let _getBytes = null;
export function bindAudio(fn) { _getBytes = fn; }

let _getProgress = null;
export function bindProgress(fn) { _getProgress = fn; }

let _cloud = byteCloud(seedBytes());
let _strand = helixStrand(seedBytes());
let _cloudGen = 0;
export function setTuneBytes(buf) {
  const u8 = buf && buf.byteLength ? new Uint8Array(buf) : seedBytes();
  const next = byteCloud(u8);
  if (next.length) { _cloud = next; _strand = helixStrand(u8); _cloudGen++; }
}

const EDGES = logBandEdges();
const env = Envelope(0.55, 0.12, N);
const subs = new Set();
const SILENT = new Uint8Array(1024);
let pumpRaf = null, phase = 0, resting = false;
export const invalidate = () => { resting = false; };
let lastGen = -1, lastProgress = -1;
function pump() {
  const live = (_getBytes && _getBytes()) || null;
  const progress = (_getProgress && _getProgress()) || 0;
  const changed = _cloudGen !== lastGen || Math.abs(progress - lastProgress) > 0.0005;
  if (live) { resting = false; phase += reducedMotion ? 0.012 : 0.04; }
  else if (resting && !changed) { pumpRaf = requestAnimationFrame(pump); return; }
  lastGen = _cloudGen; lastProgress = progress;
  const u8 = live || SILENT;
  const st = {
    levels: env.update(bandLevels(u8, EDGES)),
    bands: splitBands(u8),
    hue: spectralCentroid(u8).hue,
    phase,
    live: !!live,
    progress: (_getProgress && _getProgress()) || 0,
  };
  for (const fn of subs) { try { fn(st); } catch {  } }
  if (!live) resting = true;                           
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

  const attr = { current: null };
  const geoDone = new THREE.BufferGeometry();
  const geoTodo = new THREE.BufferGeometry();
  const matDone = new THREE.PointsMaterial({ size: 0.038, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const matTodo = new THREE.PointsMaterial({ size: 0.022, sizeAttenuation: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const done = new THREE.Points(geoDone, matDone);
  const todo = new THREE.Points(geoTodo, matTodo);

  const headGeo = new THREE.IcosahedronGeometry(0.075, 1);
  const headMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, toneMapped: false });
  const head = new THREE.Mesh(headGeo, headMat);
  const haloGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const haloMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Mesh(haloGeo, haloMat);

  const shellGeo = new THREE.IcosahedronGeometry(SHELL_R, 1);
  const shellMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.12, toneMapped: false });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  group.add(todo, done, halo, head, shell);
  let light = null;

  let gen = -1, n = 0;
  const sync = () => {
    if (gen === _cloudGen) return;
    gen = _cloudGen;
    n = _strand.n;
    attr.current = new THREE.BufferAttribute(_strand.pos.slice(), 3);
    geoDone.setAttribute("position", attr.current);
    geoTodo.setAttribute("position", attr.current);
    geoDone.computeBoundingSphere();
    geoTodo.computeBoundingSphere();
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
        const mode = lt ? THREE.NormalBlending : THREE.AdditiveBlending;
        matDone.blending = matTodo.blending = mode;
        matDone.needsUpdate = matTodo.needsUpdate = true;
      }
      const hue = ((st.bands.treble * 1.6 > 0.5 ? H_HIGH : H_LOW) + (st.hue - 235) * 0.04) / 360;
      const h01 = ((hue % 1) + 1) % 1;

      const k = Math.max(0, Math.min(n, Math.round(st.progress * n)));
      geoDone.setDrawRange(0, k);
      geoTodo.setDrawRange(k, Math.max(0, n - k));

      group.scale.setScalar(1 + st.bands.bass * 0.2);
      group.rotation.y += st.bands.mid * 0.014 + st.bands.treble * 0.006;
      group.rotation.x = -0.12 + st.bands.bass * 0.16;

      matDone.size = 0.03 + st.bands.treble * 0.03;
      matDone.opacity = lt ? 0.9 : 0.7 + st.bands.mid * 0.3;
      matDone.color.setHSL(h01, lt ? 0.7 : 0.75, lt ? 0.42 : 0.64);
      matTodo.size = 0.018 + st.bands.treble * 0.012;
      matTodo.opacity = lt ? 0.5 : 0.3;
      matTodo.color.setHSL(H_LOW / 360, lt ? 0.4 : 0.45, lt ? 0.55 : 0.5);

      const [hx, hy, hz] = helixAt(st.progress);
      head.position.set(hx, hy, hz);
      halo.position.set(hx, hy, hz);
      const pulse = 0.85 + st.bands.bass * 0.9;
      head.scale.setScalar(pulse);
      halo.scale.setScalar(0.9 + st.bands.bass * 1.6);
      head.rotation.y += st.bands.treble * 0.12;
      headMat.color.setHSL(h01, lt ? 0.75 : 0.8, lt ? 0.45 : 0.72);
      haloMat.color.setHSL(h01, 0.8, lt ? 0.5 : 0.6);
      haloMat.opacity = (lt ? 0.12 : 0.14) + st.bands.bass * 0.25;

      shell.rotation.y -= st.bands.mid * 0.006;
      shellMat.opacity = (lt ? 0.13 : 0.06) + st.bands.bass * 0.1;
      shellMat.color.setHSL(H_LOW / 360, 0.5, lt ? 0.42 : 0.6);
    },
    dispose() {
      geoDone.dispose(); geoTodo.dispose(); matDone.dispose(); matTodo.dispose();
      headGeo.dispose(); headMat.dispose(); haloGeo.dispose(); haloMat.dispose();
      shellGeo.dispose(); shellMat.dispose();
    },
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
  const hue = st.bands.treble * 1.6 > 0.5 ? H_HIGH : H_LOW;   
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
      invalidate();                                    
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
