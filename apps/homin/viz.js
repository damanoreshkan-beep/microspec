// homin — the dial as a lit plate in space.
//
// Same map as the SVG it sits behind, so nothing new has to be learned to read it: the angle around the
// plate is FREQUENCY (a full turn is the 69 LPD channels), the radius is TIME (an event is born at the rim
// and drifts inward as it ages), and the height of a spike is how strong the signal was. Voice takes the
// accent colour, devices take ink. Nothing here is placed anywhere it was not measured.
//
// Follows reference_webgl_threejs_in_farm exactly as handpan and rave do: three is LAZY-imported inside the
// effect and init is PROBE-guarded on getContext('webgl') — NOT gate-guarded — so CI's headless Chrome
// renders the real 3D into the shots, while preflight's linkedom simply fails the probe and the SVG dial in
// view.js stays the whole picture. The SVG always renders and always owns data-mark, the aria label and the
// tap targets, so e2e and a11y never depend on WebGL existing.
//
// Colours are READ FROM CSS (getComputedStyle) and re-read by a MutationObserver on data-theme, per sigil:
// a WebGL scene cannot use a DaisyUI class, but it must still flip with the theme rather than bake one.
import { useState, useEffect } from "preact/hooks";
import { LPD433 } from "/_rt/chan433.js";
import { Parallax } from "/_rt/spectrum.js";
import { tilt } from "/_rt/sensors.js";

const R_OUT = 1, R_IN = 0.37, MAX_SPIKES = LPD433.count + 8;
const AGE_MS = 60_000;
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const DPR = () => Math.min(2, (typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1);

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

function readTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--color-base-content").trim() || "#ECECEE";
    const accent = cs.getPropertyValue("--app-accent").trim() || cs.getPropertyValue("--color-primary").trim() || "#E9A23B";
    const dt = document.documentElement.getAttribute("data-theme");
    const dark = dt ? dt !== "light" : (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
    return { ink, accent, dark };
  } catch { return { ink: "#ECECEE", accent: "#E9A23B", dark: true }; }
}

const angleOf = (ch) => ((ch - 1) / LPD433.count) * Math.PI * 2 - Math.PI / 2;

export function makeDial(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  const rig = new THREE.Group();                 // parallax rides the rig, never the camera's own target
  rig.add(cam);
  cam.position.set(0, 2.05, 2.35);
  cam.lookAt(0, 0, 0);
  scene.add(rig);

  let col = readTheme();
  const inkC = new THREE.Color(col.ink), accC = new THREE.Color(col.accent);

  // ---- static structure: 69 channel spokes + two rings, one geometry, never rebuilt ----
  const pts = [];
  for (let n = 1; n <= LPD433.count; n++) {
    const a = angleOf(n), major = (n - 1) % 5 === 0;
    const r0 = major ? R_IN - 0.04 : R_IN;
    pts.push(r0 * Math.cos(a), 0, r0 * Math.sin(a), R_OUT * Math.cos(a), 0, R_OUT * Math.sin(a));
  }
  const ring = (r, seg = 180) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(r * Math.cos(a0), 0, r * Math.sin(a0), r * Math.cos(a1), 0, r * Math.sin(a1));
    }
  };
  ring(R_OUT); ring(R_IN);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: inkC, transparent: true, opacity: col.dark ? 0.22 : 0.3 });
  scene.add(new THREE.LineSegments(gridGeo, gridMat));

  // ---- dynamic spikes: ONE geometry, positions + colours rewritten per frame, draw range trimmed ----
  const spikePos = new Float32Array(MAX_SPIKES * 6);
  const spikeCol = new Float32Array(MAX_SPIKES * 6);
  const spikeGeo = new THREE.BufferGeometry();
  spikeGeo.setAttribute("position", new THREE.BufferAttribute(spikePos, 3));
  spikeGeo.setAttribute("color", new THREE.BufferAttribute(spikeCol, 3));
  const spikeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
  const spikes = new THREE.LineSegments(spikeGeo, spikeMat);
  scene.add(spikes);

  // ---- sonar ring: the radar GESTURE, expanding from the centre on a fresh detection ----
  const pulseGeo = new THREE.RingGeometry(0.98, 1.0, 96);
  pulseGeo.rotateX(-Math.PI / 2);
  const pulseMat = new THREE.MeshBasicMaterial({ color: accC, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  scene.add(pulse);

  let lastNew = 0;

  const mo = typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => {
        col = readTheme();
        inkC.set(col.ink); accC.set(col.accent);
        gridMat.color.set(inkC); gridMat.opacity = col.dark ? 0.22 : 0.3;
        pulseMat.color.set(accC);
      })
    : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  return {
    frame(state, p) {
      const { events = [], now = 0, freshAt = 0 } = state || {};
      if (freshAt > lastNew) lastNew = freshAt;

      let v = 0;
      for (const e of events) {
        if (v >= MAX_SPIKES * 6) break;
        const a = angleOf(e.channel);
        const age = Math.min(1, Math.max(0, (now - (e.lastSeen || now)) / AGE_MS));
        const r = R_OUT - age * (R_OUT - R_IN);          // radius is TIME: born at the rim, drifts inward
        const h = 0.06 + (e.strength || 0.3) * 0.62;
        const x = r * Math.cos(a), z = r * Math.sin(a);
        spikePos[v] = x; spikePos[v + 1] = 0; spikePos[v + 2] = z;
        spikePos[v + 3] = x; spikePos[v + 4] = h; spikePos[v + 5] = z;
        const c = e.kind === "voice" ? accC : inkC;
        const fade = 1 - age * 0.7;
        spikeCol[v] = c.r * fade * 0.25; spikeCol[v + 1] = c.g * fade * 0.25; spikeCol[v + 2] = c.b * fade * 0.25;
        spikeCol[v + 3] = c.r * fade; spikeCol[v + 4] = c.g * fade; spikeCol[v + 5] = c.b * fade;
        v += 6;
      }
      spikeGeo.attributes.position.needsUpdate = true;
      spikeGeo.attributes.color.needsUpdate = true;
      spikeGeo.setDrawRange(0, v / 3);

      const since = (now - lastNew) / 1400;
      if (!reducedMotion && since >= 0 && since < 1) {
        const s = R_IN + since * (R_OUT - R_IN) * 1.15;
        pulse.scale.set(s, 1, s);
        pulseMat.opacity = 0.32 * (1 - since);
      } else pulseMat.opacity = 0;

      // Calm parallax only — the plate tips a little with the phone, it never spins.
      rig.rotation.x = (p?.y ?? 0) * 0.16;
      rig.rotation.y = (p?.x ?? 0) * 0.16;
      renderer.render(scene, cam);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.updateProjectionMatrix();
    },
    dispose() {
      mo?.disconnect();
      gridGeo.dispose(); gridMat.dispose();
      spikeGeo.dispose(); spikeMat.dispose();
      pulseGeo.dispose(); pulseMat.dispose();
      renderer.dispose();
    },
  };
}

// Mount: probe → lazy three → rAF. Returns whether WebGL actually came up, so the view can decide how much
// of the SVG to show. `getState()` is called once per frame and must be cheap.
export function useDial(ref, getState) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !hasWebGL()) return;
    let scene = null, raf = 0, ro = null, dead = false, stopTilt = null;
    const parallax = Parallax({ maxDeg: 20, gain: 1, reduced: reducedMotion });
    let beta = 0, gamma = 0;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)), dpr = DPR();
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      scene?.resize(canvas.width, canvas.height);
    };
    (async () => {
      let THREE;
      try { THREE = await import("three"); } catch { return; }       // offline / blocked → SVG stays the picture
      if (dead) return;
      try { scene = makeDial(canvas, THREE); } catch { scene = null; return; }
      setWebgl(true);
      size();
      if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(size); ro.observe(canvas); }
      if (tilt?.supported) { try { stopTilt = tilt.start((t) => { beta = t.beta ?? 0; gamma = t.gamma ?? 0; }); } catch { /* */ } }
      let last = 0;
      const loop = (ts) => {
        raf = requestAnimationFrame(loop);
        if (ts - last < 33) return;                                   // ~30 fps: the DSP worker owns the CPU
        last = ts;
        if (typeof document !== "undefined" && document.hidden) return;
        scene.frame(getState(), parallax.update(beta, gamma));
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      stopTilt?.();
      try { scene?.dispose(); } catch { /* */ }
    };
  }, []);
  return webgl;
}
