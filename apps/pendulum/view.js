// Pendulum (Маятник) — a contemplative dowsing pendulum swinging between the two poles of a duality, one
// full swing to a breath. The body is a FULL-SCREEN three.js scene: a dark, luminous bob (ringed by a soft
// lavender glow) swinging in real 3D. The pole word lives INSIDE the bob and rides it: it fades UP as the
// pendulum settles at each pole and fades OUT through empty at the fast centre-crossing, so it never pulls
// the eye off the swing. Tap anywhere to turn to the next duality — the bob blooms and the words cross to
// the new pair; there is no pause, no transport bar. The pendulum and the words are the whole interface.
//
// The swing math is the systemic, unit-tested /_rt/pendulum.js. three.js is lazy-imported and only started
// on a real device with WebGL; under the gate (preflight in linkedom, CI Chromium on localhost) there is no
// WebGL, so a lightweight DOM pendulum fallback renders with the same data-stage / data-bob / data-pole
// hooks. One rAF loop drives both from elapsed time. Reduced motion holds the arm. Fully offline, no emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
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
const PULSE_MS = 720;  // the bloom when the pair changes
const GATE_PH = 0.12;  // a still, deterministic frame for the gate / fallback
const ARM = "60vh";
const PIVOT = "8vh";
const INK = 0xECECEE, ACCENT = 0x9F8CF6;

// Build the three.js pendulum into `host`. Returns a small handle, or null if WebGL is unavailable.
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
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  // Frame the pendulum in the upper two-thirds so the bob sits above the dock.
  const fit = () => {
    const w = host.clientWidth || 360, h = host.clientHeight || 640;
    renderer.setSize(w, h); camera.aspect = w / h;
    camera.position.set(0, 0.9, 9); camera.lookAt(0, 0.9, 0); camera.updateProjectionMatrix();
  };
  fit();

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.45); keyLight.position.set(2.5, 4, 5); scene.add(keyLight);

  const pivot = new THREE.Group(); pivot.position.set(0, 3.3, 0); scene.add(pivot);
  const L = 3.0;
  pivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6, transparent: true, opacity: 0.5 })));
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, L, 16), new THREE.MeshStandardMaterial({ color: INK, emissive: ACCENT, emissiveIntensity: 0.1, roughness: 0.5, transparent: true, opacity: 0.5 }));
  rod.position.y = -L / 2; pivot.add(rod);

  // The bob group (bob + glow shells + light) hangs at the rod's end and scales for the bloom pulse.
  const bobGroup = new THREE.Group(); bobGroup.position.y = -L; pivot.add(bobGroup);
  // A DARK orb so the light word inside stays legible; the glow lives in the additive shells + point light.
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 48), new THREE.MeshStandardMaterial({ color: 0x1b1636, emissive: ACCENT, emissiveIntensity: 0.28, roughness: 0.45, metalness: 0.15 }));
  bobGroup.add(bob);
  const shells = [[0.78, 0.28], [1.05, 0.14], [1.5, 0.07], [2.1, 0.03]].map(([r, o]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 28), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    bobGroup.add(m); return { m, o };
  });
  const glowLight = new THREE.PointLight(ACCENT, 20, 12, 2); glowLight.position.set(0, 0, 0.5); bobGroup.add(glowLight);

  const v = new THREE.Vector3();
  return {
    setAngle: (deg) => { pivot.rotation.z = (deg * Math.PI) / 180; },
    setPulse: (scale, glow) => { bobGroup.scale.setScalar(scale); shells.forEach((s) => (s.m.material.opacity = s.o * (1 + 1.4 * glow))); glowLight.intensity = 20 * (1 + 1.1 * glow); },
    projectBob: () => { bobGroup.getWorldPosition(v); v.project(camera); return { x: (v.x * 0.5 + 0.5) * cv.clientWidth, y: (-v.y * 0.5 + 0.5) * cv.clientHeight }; },
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
  const armRef = useRef(), fbBobRef = useRef();       // DOM fallback arm + bob
  const aRef = useRef(), bRef = useRef();             // the two pole words (ride the bob, fade by swing)
  const totalRef = useRef(0), advanceAtRef = useRef(ADVANCE), pulseAtRef = useRef(-PULSE_MS);

  const advance = () => { pulseAtRef.current = performance.now(); buzz(); setDurIdx((i) => (i + 1) % N); advanceAtRef.current = totalRef.current + ADVANCE; };

  // Place + fade the pole words onto the bob's screen position. Word A rises at one extreme, B at the other;
  // both fade to nothing through the centre. `mult` (0→1 over a bloom) cross-dissolves to a freshly-turned pair.
  const placeWords = (x, y, s, mult) => {
    const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    if (aRef.current) { aRef.current.style.transform = tf; aRef.current.style.opacity = (clamp01((s - 0.12) / 0.62) * mult).toFixed(3); }
    if (bRef.current) { bRef.current.style.transform = tf; bRef.current.style.opacity = (clamp01((-s - 0.12) / 0.62) * mult).toFixed(3); }
  };

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

  // One rAF loop drives the swing, the bloom pulse, the word ride/fade and the auto-turn — for both paths.
  useEffect(() => {
    if (gate) return;
    const reduce = reduced();
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      if (reduce) st.angle = 0;
      const pt = clamp01((now - pulseAtRef.current) / PULSE_MS);
      const bloom = Math.sin(pt * Math.PI);
      const scale = 1 + 0.16 * bloom;
      let bx, by;
      const sc = sceneRef.current;
      if (webglRef.current && sc) {
        sc.setAngle(st.angle); sc.setPulse(scale, bloom); sc.render();
        const p = sc.projectBob(); bx = p.x; by = p.y;
      } else if (armRef.current && fbBobRef.current) {
        armRef.current.style.transform = `rotate(${st.angle.toFixed(2)}deg)`;
        fbBobRef.current.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        const r = fbBobRef.current.getBoundingClientRect(); bx = r.left + r.width / 2; by = r.top + r.height / 2;
      }
      if (bx != null) placeWords(bx, by, st.s, pt);
      if (st.breath !== runLast) {
        runLast = st.breath; totalRef.current += 1;
        if (totalRef.current >= advanceAtRef.current) advance();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [aKey, bKey] = DUALITIES[durIdx];
  const init = gate ? pstate(GATE_PH * PERIOD, PERIOD, AMP) : pstate(0, PERIOD, AMP);
  // Static first frame (also the gate/axe frame): light words centred over the bob, one pole shown.
  const wordBase = "position:absolute;top:58%;left:50%;transform:translate(-50%,-50%);max-width:11rem;will-change:transform,opacity";
  const wordStyle = (w) => `${wordBase};opacity:${(clamp01((w - 0.12) / 0.62)).toFixed(3)}`;

  return html`<${Fragment}>
    <!-- full-screen pendulum body; tap (or Enter) to turn to the next duality. three.js mounts here -->
    <button ref=${stageRef} data-stage type="button" class="fixed inset-0 z-0 overflow-hidden cursor-pointer appearance-none bg-transparent border-0 p-0 block" onClick=${advance} aria-label=${T(t, "aTurn")}>
      <div class=${webgl ? "hidden" : ""} aria-hidden="true">
        <div ref=${armRef} style=${`position:absolute;left:50%;top:${PIVOT};transform-origin:top center;transform:rotate(${init.angle.toFixed(2)}deg)`}>
          <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;border-radius:9999px;background:var(--color-base-content);opacity:0.3"></div>
          <div style=${`width:2px;height:${ARM};margin-left:-1px;background:linear-gradient(to bottom, transparent, color-mix(in oklch, var(--color-base-content) 70%, transparent));opacity:0.22`}></div>
          <div ref=${fbBobRef} data-bob style=${`position:absolute;top:${ARM};left:0;width:7rem;height:7rem;transform:translate(-50%,-50%);border-radius:9999px;background:radial-gradient(circle at 50% 46%, color-mix(in oklch, var(--color-accent) 70%, transparent) 0%, color-mix(in oklch, var(--color-accent) 34%, transparent) 46%, transparent 70%)`}></div>
        </div>
      </div>
    </button>

    <!-- the pole words — inside the orb, riding it, positioned each frame by the loop -->
    <div class="fixed inset-0 z-10 pointer-events-none" aria-live="polite">
      <div ref=${aRef} data-pole data-pole-a class="text-[1.35rem] font-semibold leading-tight text-center break-words text-base-content" style=${wordStyle(init.weightA)}>${T(t, aKey)}</div>
      <div ref=${bRef} data-pole data-pole-b class="text-[1.35rem] font-semibold leading-tight text-center break-words text-base-content" style=${wordStyle(init.weightB)}>${T(t, bKey)}</div>
    </div>
  </${Fragment}>`;
}
