// Pendulum (Маятник) — a contemplative dowsing pendulum swinging between the two poles of a duality, one
// full swing to a breath. The body is a FULL-SCREEN three.js scene: a glowing bob on a fine rod, swinging
// in real 3D with soft additive glow and a travelling point light — an ambient layer the whole UI sits on.
// The two pole words float on top (a calm, weightless drift via the systemic `motion`) and the breath
// crossfades the accent onto whichever pole it's drawn toward — colour = meaning.
//
// three.js is lazy-imported and only initialised on a real device with WebGL: under the gate (preflight in
// linkedom, the CI Chromium on localhost) there is no WebGL, so a lightweight DOM pendulum fallback renders
// instead — same data-stage / data-bob / data-pole hooks, so the gates see a real pendulum either way. The
// swing/crossfade math is the systemic, unit-tested /_rt/pendulum.js; one rAF loop drives both paths from
// elapsed time (no drift). Reduced motion holds the arm and stills the float. Fully offline, no emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate } from "motion";
import { T } from "/_rt/i18n.js";
import { state as pstate } from "/_rt/pendulum.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
const ADVANCE = 5;     // breaths spent on each duality before it turns over on its own
const GATE_PH = 0.12;  // a still, deterministic frame for the gate / fallback
const ARM = "62vh";    // DOM-fallback arm length
const PIVOT = "7vh";
const INK = 0xECECEE, ACCENT = 0x9F8CF6;

// Build the three.js pendulum into `host`. Returns { setAngle, render, resize, dispose } or null if WebGL
// is unavailable. Kept out of the component so the async wiring reads straight through.
async function makeScene(host) {
  let THREE;
  try { THREE = await import("three"); } catch { return null; }
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;

  const w = host.clientWidth || 360, h = host.clientHeight || 640;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
  // Frame the pendulum in the UPPER two-thirds — pivot near the top, bob a little above centre — so the
  // glow clears the control island and dock at the bottom.
  const fit = () => { camera.position.set(0, 0.9, 9); camera.lookAt(0, 0.9, 0); };
  fit();

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.5); key.position.set(2, 4, 5); scene.add(key);
  const glowLight = new THREE.PointLight(ACCENT, 26, 12, 2);

  const pivot = new THREE.Group();
  pivot.position.set(0, 3.3, 0);
  scene.add(pivot);

  const L = 3.0;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 24), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6, transparent: true, opacity: 0.55 }));
  pivot.add(cap);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, L, 16), new THREE.MeshStandardMaterial({ color: INK, emissive: ACCENT, emissiveIntensity: 0.12, roughness: 0.5, transparent: true, opacity: 0.55 }));
  rod.position.y = -L / 2; pivot.add(rod);

  const bobY = -L;
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 48), new THREE.MeshStandardMaterial({ color: 0xF3F0FF, emissive: ACCENT, emissiveIntensity: 1.35, roughness: 0.32, metalness: 0.1 }));
  bob.position.y = bobY; pivot.add(bob);
  const halo = (r, o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 28), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.y = bobY; pivot.add(m); return m; };
  halo(0.82, 0.2); halo(1.2, 0.085); halo(1.7, 0.03);
  glowLight.position.set(0, bobY, 0.6); pivot.add(glowLight);

  const resize = () => {
    const nw = host.clientWidth || w, nh = host.clientHeight || h;
    renderer.setSize(nw, nh); camera.aspect = nw / nh; fit(); camera.updateProjectionMatrix();
  };
  return {
    setAngle: (deg) => { pivot.rotation.z = (deg * Math.PI) / 180; },
    render: () => renderer.render(scene, camera),
    resize,
    dispose: () => {
      renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      cv.remove();
    },
  };
}

export function pendulum({ S }) {
  const t = useStore(S.t);
  const [durIdx, setDurIdx] = useState(0);
  const [breaths, setBreaths] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [webgl, setWebgl] = useState(false);

  const stageRef = useRef();
  const sceneRef = useRef(null);
  const armRef = useRef();                          // DOM fallback arm
  const aRef = useRef(), bRef = useRef();            // pole words (crossfade)
  const aWrapRef = useRef(), bWrapRef = useRef();    // float wrappers
  const totalRef = useRef(0);
  const advanceAtRef = useRef(ADVANCE);

  // Crossfade the two poles; also rotate the DOM fallback arm (harmless while hidden behind the canvas).
  const paint = (st) => {
    if (armRef.current) armRef.current.style.transform = `rotate(${st.angle.toFixed(2)}deg)`;
    const set = (el, w) => { if (el) { el.style.opacity = (0.6 + 0.4 * w).toFixed(3); el.style.color = w >= 0.5 ? "var(--color-accent)" : ""; } };
    set(aRef.current, st.weightA);
    set(bRef.current, st.weightB);
  };

  const prev = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i - 1 + N) % N); };
  const next = () => { buzz(); advanceAtRef.current = totalRef.current + ADVANCE; setDurIdx((i) => (i + 1) % N); };
  const toggle = () => { buzz(); setPlaying((p) => !p); };

  // three.js — real device only. Under the gate (no WebGL) this never runs and the DOM fallback stays.
  useEffect(() => {
    if (gate || !stageRef.current) return;
    let live = true;
    makeScene(stageRef.current).then((s) => {
      if (!live || !s) return;
      sceneRef.current = s; setWebgl(true);
      s.setAngle((reduced() ? 0 : pstate(0, PERIOD, AMP).angle)); s.render();
      window.addEventListener("resize", s.resize);
    });
    return () => { live = false; const s = sceneRef.current; if (s) { window.removeEventListener("resize", s.resize); s.dispose(); } sceneRef.current = null; };
  }, []);

  // The swing + breath clock. Drives the DOM fallback and (once ready) the three.js scene from one loop.
  useEffect(() => {
    if (gate || !playing) return;
    const reduce = reduced();
    let raf, startT = performance.now(), runLast = 0;
    const loop = (now) => {
      const st = pstate(now - startT, PERIOD, AMP);
      if (reduce) st.angle = 0;
      paint(st);
      const s = sceneRef.current;
      if (s) { s.setAngle(st.angle); s.render(); }
      if (st.breath !== runLast) {
        runLast = st.breath;
        totalRef.current += 1;
        setBreaths(totalRef.current);
        if (totalRef.current >= advanceAtRef.current) { advanceAtRef.current += ADVANCE; setDurIdx((i) => (i + 1) % N); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // The calm floating drift of the two words.
  useEffect(() => {
    if (gate || reduced() || !aWrapRef.current || !bWrapRef.current) return;
    const opts = { ease: "easeInOut", repeat: Infinity, repeatType: "mirror" };
    const a1 = animate(aWrapRef.current, { y: [-7, 7] }, { duration: 5.6, ...opts });
    const a2 = animate(bWrapRef.current, { y: [7, -7] }, { duration: 6.7, delay: 0.5, ...opts });
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const [aKey, bKey] = DUALITIES[durIdx];
  const init = gate ? pstate(GATE_PH * PERIOD, PERIOD, AMP) : pstate(0, PERIOD, AMP);
  const poleStyle = (w) => `opacity:${(0.6 + 0.4 * w).toFixed(3)};color:${w >= 0.5 ? "var(--color-accent)" : "inherit"}`;

  return html`<${Fragment}>
    <!-- full-screen pendulum body: the three.js canvas mounts here; a DOM pendulum is the WebGL-less fallback -->
    <div ref=${stageRef} data-stage class="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div class=${webgl ? "hidden" : ""}>
        <div ref=${armRef} style=${`position:absolute;left:50%;top:${PIVOT};transform-origin:top center;transform:rotate(${init.angle.toFixed(2)}deg);will-change:transform`}>
          <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;border-radius:9999px;background:var(--color-base-content);opacity:0.35"></div>
          <div style=${`width:2px;height:${ARM};margin-left:-1px;border-radius:2px;background:linear-gradient(to bottom, transparent, color-mix(in oklch, var(--color-base-content) 70%, transparent));opacity:0.24`}></div>
          <div data-bob style=${`position:absolute;top:${ARM};left:0;width:6.5rem;height:6.5rem;transform:translate(-50%,-50%);border-radius:9999px;background:radial-gradient(circle at 50% 42%, color-mix(in oklch, var(--color-primary) 82%, transparent) 0%, color-mix(in oklch, var(--color-accent) 52%, transparent) 40%, transparent 68%)`}></div>
        </div>
      </div>
    </div>

    <!-- overlay UI, compact so the page never scrolls -->
    <div class="relative z-10 flex flex-col items-center justify-between h-[80dvh]">
      <div class="flex gap-2 pt-1" aria-hidden="true">
        ${DUALITIES.map((_, i) => html`<span class=${`h-2 w-2 rounded-full transition-colors ${i === durIdx ? "bg-accent" : "bg-base-content/40"}`} key=${i}></span>`)}
      </div>

      <div class="grid grid-cols-2 gap-4 w-full max-w-sm text-center">
        <div ref=${aWrapRef} style="will-change:transform"><div ref=${aRef} data-pole data-pole-a class="text-[1.7rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightA)}>${T(t, aKey)}</div></div>
        <div ref=${bWrapRef} style="will-change:transform"><div ref=${bRef} data-pole data-pole-b class="text-[1.7rem] font-semibold leading-tight break-words" style=${poleStyle(init.weightB)}>${T(t, bKey)}</div></div>
      </div>

      <div class="flex flex-col items-center gap-3">
        <div class="flex items-center gap-1.5 rounded-full border border-base-content/10 bg-base-100/80 backdrop-blur-xl px-2 py-1.5 shadow-lg">
          <button data-prev aria-label=${T(t, "aPrev")} class="btn btn-ghost btn-circle btn-sm" onClick=${prev}>${Icon("lucide:chevron-left", "text-lg")}</button>
          <button id="play" aria-label=${playing ? T(t, "aPause") : T(t, "aStart")} class="btn btn-primary btn-circle" onClick=${toggle}>${Icon(playing ? "lucide:pause" : "lucide:play", "text-xl")}</button>
          <button data-next aria-label=${T(t, "aNext")} class="btn btn-ghost btn-circle btn-sm" onClick=${next}>${Icon("lucide:chevron-right", "text-lg")}</button>
        </div>
        <div class="flex items-center gap-1.5 text-xs font-mono text-base-content/45" aria-label=${T(t, "aBreaths")}>
          ${Icon("lucide:wind", "text-sm")}<span data-breaths class="tabular-nums">${breaths}</span>
        </div>
      </div>
    </div>
  </${Fragment}>`;
}
