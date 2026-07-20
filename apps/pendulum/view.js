// Pendulum (Маятник) — a contemplative dowsing pendulum swinging between the two poles of a duality, one
// full swing to a breath. The body is a FULL-SCREEN three.js scene: a luminous bob on a fine rod, swinging
// in real 3D with a soft additive glow and a travelling point light. The two pole words float above it and
// crossfade with the breath — the accent lights on whichever pole the pendulum is drawn toward. There is no
// pause and no transport bar: tap anywhere and the orb blooms as it turns to the next duality.
//
// three.js is lazy-imported and only started on a real device with WebGL; under the gate (preflight in
// linkedom, CI Chromium on localhost) there is no WebGL, so a lightweight DOM pendulum fallback renders with
// the same data-stage / data-bob / data-pole hooks. The swing/crossfade math is the systemic, unit-tested
// /_rt/pendulum.js; one rAF loop drives both paths from elapsed time. Reduced motion holds the arm and
// stills the float. Fully offline, no emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate } from "motion";
import { T } from "/_rt/i18n.js";
import { state as pstate } from "/_rt/pendulum.js";
import { gate } from "/_rt/gate.js";

const buzz = () => { try { navigator.vibrate?.(10); } catch { /* unsupported */ } };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const DUALITIES = [
  ["dThoughtIn", "dThoughtOut"],
  ["dLife", "dDeath"],
  ["dCreate", "dDestroy"],
  ["dAll", "dNothing"],
  ["dInhale", "dExhale"],
  ["dLove", "dUnlove"],
  ["dCertain", "dUncertain"],
  ["dWaking", "dReverie"],
];
const N = DUALITIES.length;

const PERIOD = 8000;   // one breath (in + out), ms
const AMP = 15;        // swing amplitude, degrees
const ADVANCE = 6;     // breaths before the duality turns over on its own (tap turns it sooner)
const PULSE_MS = 700;  // the bloom when the pair changes
const GATE_PH = 0.12;  // a still, deterministic frame for the gate / fallback
const ARM = "58vh";
const PIVOT = "8vh";
const INK = 0xECECEE, ACCENT = 0x9F8CF6;

// Build the three.js pendulum into `host`. Returns a small handle or null if WebGL is unavailable.
async function makeScene(host) {
  let THREE;
  try { THREE = await import("three"); } catch { return null; }
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  // Frame the pendulum in the upper two-thirds; a jewel, not a wall — pull back a touch so it isn't too big.
  const fit = () => {
    const w = host.clientWidth || 360, h = host.clientHeight || 640;
    renderer.setSize(w, h); camera.aspect = w / h;
    camera.position.set(0, 0.9, 10.4); camera.lookAt(0, 0.9, 0); camera.updateProjectionMatrix();
  };
  fit();

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.5); key.position.set(2, 4, 5); scene.add(key);

  const pivot = new THREE.Group(); pivot.position.set(0, 3.3, 0); scene.add(pivot);
  pivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 20), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6, transparent: true, opacity: 0.5 })));
  const L = 3.0;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, L, 16), new THREE.MeshStandardMaterial({ color: INK, emissive: ACCENT, emissiveIntensity: 0.12, roughness: 0.5, transparent: true, opacity: 0.5 }));
  rod.position.y = -L / 2; pivot.add(rod);

  // The bob group (orb + glow shells + light) scales for the bloom pulse. A luminous near-white core with a
  // soft lavender glow — the ethereal orb.
  const bobGroup = new THREE.Group(); bobGroup.position.y = -L; pivot.add(bobGroup);
  bobGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 48), new THREE.MeshStandardMaterial({ color: 0xF3F0FF, emissive: ACCENT, emissiveIntensity: 1.3, roughness: 0.32, metalness: 0.1 })));
  const shells = [[0.74, 0.2], [1.1, 0.085], [1.6, 0.03]].map(([r, o]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 28), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    bobGroup.add(m); return { m, o };
  });
  const glowLight = new THREE.PointLight(ACCENT, 22, 12, 2); bobGroup.add(glowLight);

  return {
    setAngle: (deg) => { pivot.rotation.z = (deg * Math.PI) / 180; },
    setPulse: (scale, bloom) => { bobGroup.scale.setScalar(scale); shells.forEach((s) => (s.m.material.opacity = s.o * (1 + 1.6 * bloom))); glowLight.intensity = 22 * (1 + 1.2 * bloom); },
    render: () => renderer.render(scene, camera),
    resize: fit,
    dispose: () => { renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); cv.remove(); },
  };
}

export function pendulum({ S }) {
  const t = useStore(S.t);
  const [durIdx, setDurIdx] = useState(0);
  const [webgl, setWebgl] = useState(false);

  const stageRef = useRef();
  const sceneRef = useRef(null), webglRef = useRef(false);
  const armRef = useRef();                            // DOM fallback arm
  const aRef = useRef(), bRef = useRef();             // pole words (crossfade)
  const aWrapRef = useRef(), bWrapRef = useRef();     // float wrappers
  const totalRef = useRef(0), advanceAtRef = useRef(ADVANCE), pulseAtRef = useRef(-PULSE_MS);

  // Crossfade the two poles; also rotate the DOM fallback arm (harmless while hidden behind the canvas).
  const paint = (st) => {
    if (armRef.current) armRef.current.style.transform = `rotate(${st.angle.toFixed(2)}deg)`;
    const set = (el, w) => { if (el) { el.style.opacity = (0.6 + 0.4 * w).toFixed(3); el.style.color = w >= 0.5 ? "var(--color-accent)" : ""; } };
    set(aRef.current, st.weightA);
    set(bRef.current, st.weightB);
  };

  const advance = () => { pulseAtRef.current = performance.now(); buzz(); setDurIdx((i) => (i + 1) % N); advanceAtRef.current = totalRef.current + ADVANCE; };

  // three.js — real device only. Under the gate (no WebGL) this never runs and the DOM fallback stays.
  useEffect(() => {
    if (gate || !stageRef.current) return;
    let live = true;
    makeScene(stageRef.current).then((s) => {
      if (!live || !s) { s?.dispose?.(); return; }
      sceneRef.current = s; webglRef.current = true; setWebgl(true);
      window.addEventListener("resize", s.resize);
    });
    return () => { live = false; const s = sceneRef.current; if (s) { window.removeEventListener("resize", s.resize); s.dispose(); } sceneRef.current = null; webglRef.current = false; };
  }, []);

  // One rAF loop: swing, bloom pulse, word crossfade and the auto-turn — for both paths.
  useEffect(() => {
    if (gate) return;
    const reduce = reduced();
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      if (reduce) st.angle = 0;
      paint(st);
      const bloom = Math.sin(clamp01((now - pulseAtRef.current) / PULSE_MS) * Math.PI);
      const s = sceneRef.current;
      if (s) { s.setAngle(st.angle); s.setPulse(1 + 0.14 * bloom, bloom); s.render(); }
      if (st.breath !== runLast) {
        runLast = st.breath; totalRef.current += 1;
        if (totalRef.current >= advanceAtRef.current) advance();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The calm floating drift of the two words.
  useEffect(() => {
    if (gate || reduced() || !aWrapRef.current || !bWrapRef.current) return;
    const opts = { ease: "easeInOut", repeat: Infinity, repeatType: "mirror" };
    const a1 = animate(aWrapRef.current, { y: [-6, 6] }, { duration: 5.6, ...opts });
    const a2 = animate(bWrapRef.current, { y: [6, -6] }, { duration: 6.7, delay: 0.5, ...opts });
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const [aKey, bKey] = DUALITIES[durIdx];
  const init = gate ? pstate(GATE_PH * PERIOD, PERIOD, AMP) : pstate(0, PERIOD, AMP);
  const poleStyle = (w) => `opacity:${(0.6 + 0.4 * w).toFixed(3)};color:${w >= 0.5 ? "var(--color-accent)" : "inherit"}`;

  return html`<${Fragment}>
    <!-- full-screen pendulum body; tap (or Enter) turns to the next duality. three.js mounts here -->
    <button ref=${stageRef} data-stage type="button" class="fixed inset-0 z-0 overflow-hidden cursor-pointer appearance-none bg-transparent border-0 p-0 block" onClick=${advance} aria-label=${T(t, "aTurn")}>
      <div class=${webgl ? "hidden" : ""} aria-hidden="true">
        <div ref=${armRef} style=${`position:absolute;left:50%;top:${PIVOT};transform-origin:top center;transform:rotate(${init.angle.toFixed(2)}deg)`}>
          <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;border-radius:9999px;background:var(--color-base-content);opacity:0.3"></div>
          <div style=${`width:2px;height:${ARM};margin-left:-1px;background:linear-gradient(to bottom, transparent, color-mix(in oklch, var(--color-base-content) 70%, transparent));opacity:0.22`}></div>
          <div data-bob style=${`position:absolute;top:${ARM};left:0;width:6rem;height:6rem;transform:translate(-50%,-50%);border-radius:9999px;background:radial-gradient(circle at 50% 42%, color-mix(in oklch, var(--color-primary) 85%, transparent) 0%, color-mix(in oklch, var(--color-accent) 48%, transparent) 42%, transparent 68%)`}></div>
        </div>
      </div>
    </button>

    <!-- the two pole words, floating above the orb; the one the breath favours takes the accent -->
    <div class="fixed inset-x-0 z-10 pointer-events-none flex justify-center px-4" style="top:26vh">
      <div class="grid grid-cols-2 gap-5 w-full max-w-sm text-center">
        <div ref=${aWrapRef} style="will-change:transform"><div ref=${aRef} data-pole data-pole-a class="text-[1.6rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightA)}>${T(t, aKey)}</div></div>
        <div ref=${bWrapRef} style="will-change:transform"><div ref=${bRef} data-pole data-pole-b class="text-[1.6rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightB)}>${T(t, bKey)}</div></div>
      </div>
    </div>
  </${Fragment}>`;
}
