// Aura (Аура) — lay the phone flat, front camera up, and play music with finger movements above it. The
// front camera's frame-to-frame motion (/_rt/motion.js — the same detector flux uses) becomes a note: the
// horizontal position of your hand picks a degree of the chosen mood scale (/_rt/chroma.js), the motion
// ENERGY opens the filter and swells the voice. Around your hand a living AURA glows — a three.js particle
// cloud that follows the motion, blooms with energy and takes the note's hue. three.js is lazy-imported and
// guarded by a real WebGL probe (a Canvas2D aura is the fallback where WebGL is absent), so it renders on
// the device AND in the CI gate. No camera/audio/WebGL in preflight → it seeds a played frame. No emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { camera } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { motionCells, motionEnergy, centroidOf } from "/_rt/motion.js";
import { createEngine, midiToFreq, filter } from "/_rt/audio.js";
import { SCALES } from "/_rt/chroma.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];
const ROOT = 48;
const MOODS = [["penta", "moodCalm"], ["minor", "moodWistful"], ["lydian", "moodDream"], ["wholetone", "moodHaze"]];
const noteFor = (cx, scale) => { const s = SCALES[scale] || SCALES.penta; return ROOT + s[Math.max(0, Math.min(s.length - 1, Math.floor(cx * s.length)))]; };
const hueFor = (midi) => (((midi - ROOT) * 34) % 360 + 360) % 360;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* */ } };

// ─── three.js particle aura (lazy, WebGL-probe-guarded — renders wherever real WebGL exists) ───
async function makeAura(host) {
  let THREE; try { THREE = await import("three"); } catch { return null; }
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement; cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"; host.appendChild(cv);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(52, 1, 0.1, 100); cam.position.z = 6;
  const fit = () => { const w = host.clientWidth || 360, h = host.clientHeight || 640; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  fit();
  const N = 700, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = Math.pow((i % 97) / 97, 0.7) * 1.35, a = i * 2.39996, z = (((i * 0.618) % 1) - 0.5) * 1.3; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = z; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const spr = document.createElement("canvas"); spr.width = spr.height = 64; const sc = spr.getContext("2d");
  const rg = sc.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.3, "rgba(255,255,255,0.55)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  sc.fillStyle = rg; sc.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({ size: 0.12, map: new THREE.CanvasTexture(spr), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0x9F8CF6) });
  const grp = new THREE.Group(); grp.add(new THREE.Points(geo, mat)); scene.add(grp);
  const c = new THREE.Color();
  return {
    set: (cx, cy, energy, hue) => {
      const tx = (cx - 0.5) * 4.2, ty = (0.5 - cy) * 4.2;
      grp.position.x += (tx - grp.position.x) * 0.16; grp.position.y += (ty - grp.position.y) * 0.16;
      const s = 0.55 + energy * 1.7; grp.scale.setScalar(grp.scale.x + (s - grp.scale.x) * 0.12);
      grp.rotation.z += 0.003 + energy * 0.02;
      c.setHSL((((hue % 360) + 360) % 360) / 360, 0.72, 0.62); mat.color.copy(c);
      mat.opacity = 0.45 + energy * 0.55; mat.size = 0.09 + energy * 0.13;
    },
    render: () => renderer.render(scene, cam),
    resize: fit,
    dispose: () => { renderer.dispose(); geo.dispose(); mat.dispose(); cv.remove(); },
  };
}

// ─── Canvas2D fallback aura (no WebGL, and the still frame preflight/CI can rasterise) ───
function paintAura(ctx, w, h, cx, cy, energy, hue) {
  ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "rgba(9,9,13,0.30)"; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const x = cx * w, y = cy * h, R = (0.12 + energy * 0.5) * Math.min(w, h);
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `hsla(${hue},78%,66%,${(0.5 + energy * 0.4).toFixed(2)})`); g.addColorStop(0.4, `hsla(${hue},78%,60%,0.14)`); g.addColorStop(1, `hsla(${hue},78%,60%,0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  for (let i = 0; i < 30; i++) { const a = i * 2.39996, rr = R * 0.55 * (0.4 + ((i * 0.37) % 1) * 0.6); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; ctx.fillStyle = `hsla(${hue},85%,72%,${(0.25 + energy * 0.45).toFixed(2)})`; ctx.beginPath(); ctx.arc(px, py, 1.5 + energy * 3.5, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = "source-over";
}

export function aura({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [scale, setScale] = useState("penta");
  const [energy, setEnergy] = useState(gate ? 0.5 : 0);
  const [note, setNote] = useState(gate ? noteFor(0.62, "penta") : null);
  const [enabled, setEnabled] = useState(gate);
  const [err, setErr] = useState(null);
  const [webgl, setWebgl] = useState(false);

  const videoRef = useRef(), sampleRef = useRef(), prevRef = useRef(null), canvasRef = useRef(), stageRef = useRef(), rafRef = useRef(0);
  const auraRef = useRef(null);
  const engRef = useRef(null), oscRef = useRef(null), filtRef = useRef(null), gainRef = useRef(null);
  const st = useRef({ cx: 0.62, cy: 0.4, energy: gate ? 0.5 : 0, hue: hueFor(noteFor(0.62, "penta")), scale: "penta" }).current;
  st.scale = scale;

  const fit = () => { const c = canvasRef.current; if (c) { const r = c.getBoundingClientRect?.(); if (r && r.width) { c.width = Math.round(r.width); c.height = Math.round(r.height); } } };
  const renderAura = () => {
    const a = auraRef.current;
    if (a) { try { a.set(st.cx, st.cy, st.energy, st.hue); a.render(); } catch { /* context lost */ } return; }
    const c = canvasRef.current, ctx = c?.getContext?.("2d");
    if (!ctx || typeof ctx.arc !== "function") return;
    try { paintAura(ctx, c.width || 360, c.height || 640, st.cx, st.cy, st.energy, st.hue); } catch { /* linkedom stub has no real gradients */ }
  };

  // the aura renderer (three.js if WebGL is real; the .then also paints the first/seeded frame)
  useEffect(() => {
    if (!stageRef.current) return;
    let live = true;
    makeAura(stageRef.current).then((a) => {
      if (!live || !a) { a?.dispose?.(); return; }
      auraRef.current = a; setWebgl(true); window.addEventListener("resize", a.resize); renderAura();
    });
    return () => { live = false; const a = auraRef.current; if (a) { window.removeEventListener("resize", a.resize); a.dispose(); } auraRef.current = null; };
  }, []);

  // gate: seed a played frame so the still shows the instrument mid-play (Canvas2D fallback path)
  useEffect(() => { if (!gate) return; fit(); const id = requestAnimationFrame(renderAura); return () => cancelAnimationFrame(id); }, [webgl]);

  // live: front camera → motion → note + energy → audio + aura, every frame
  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let liveFlag = true, stop = () => {};
    fit(); const onResize = () => fit(); addEventListener("resize", onResize);
    const step = () => {
      if (!liveFlag) return;
      const v = videoRef.current, sc = sampleRef.current;
      if (v && sc && v.readyState >= 2) {
        try {
          const W = 64, H = 48; sc.width = W; sc.height = H;
          const sctx = sc.getContext("2d", { willReadFrequently: true });
          sctx.drawImage(v, 0, 0, W, H);
          const cur = sctx.getImageData(0, 0, W, H).data;
          const cells = motionCells(prevRef.current, cur, W, H, 22);
          const en = motionEnergy(prevRef.current, cur);
          prevRef.current = cur.slice(0);
          const cen = centroidOf(cells);
          const cx = 1 - cen.x;                                   // front camera is mirrored → natural left/right
          const m = noteFor(cx, st.scale);
          st.cx = cx; st.cy = cen.y; st.energy = en; st.hue = hueFor(m);
          setEnergy(en); setNote(m);
          if (oscRef.current && engRef.current) {
            const ctx = engRef.current.ctx, now = ctx.currentTime;
            try {
              oscRef.current.frequency.setTargetAtTime(midiToFreq(m), now, 0.06);
              filtRef.current.frequency.setTargetAtTime(360 + en * 3400, now, 0.1);
              gainRef.current.gain.setTargetAtTime(Math.min(0.2, en * 0.55), now, 0.12);
            } catch { /* node gone */ }
          }
          renderAura();
        } catch { /* transient decode/read */ }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    camera.start(videoRef.current, (e) => { if (liveFlag) setErr(e); }, { facingMode: "user" }).then((s) => {
      if (!liveFlag) { s(); return; }
      stop = s; rafRef.current = requestAnimationFrame(step);
    });
    return () => { liveFlag = false; cancelAnimationFrame(rafRef.current); removeEventListener("resize", onResize); stop(); };
  }, [enabled]);

  const enable = () => {
    buzz();
    try {
      if (!engRef.current) {
        const eng = createEngine({ noise: false });
        if (eng) {
          const osc = eng.ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = midiToFreq(noteFor(0.5, scale));
          const f = filter(eng.ctx, "lowpass", 700, 0.9);
          const g = eng.ctx.createGain(); g.gain.value = 0;
          osc.connect(f); f.connect(g); g.connect(eng.master); osc.start();
          engRef.current = eng; oscRef.current = osc; filtRef.current = f; gainRef.current = g;
        }
      }
      engRef.current?.resume();
    } catch { /* audio unavailable */ }
    setEnabled(true);
  };

  return html`<${Fragment}>
    <div class="fixed inset-x-0 z-20 bg-black flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
      <div class="relative flex-1 min-h-0 overflow-hidden">
        ${enabled && !err && !gate ? html`<video ref=${videoRef} autoplay muted playsinline class="absolute inset-0 w-full h-full object-cover opacity-15" style="transform:scaleX(-1)"></video>` : null}
        <div ref=${stageRef} data-stage class="absolute inset-0"></div>
        <canvas ref=${canvasRef} data-live class=${`absolute inset-0 w-full h-full ${webgl ? "hidden" : ""}`}></canvas>
        ${enabled && !err ? html`<div class="absolute top-3 left-3 right-3 flex items-center gap-3 pointer-events-none">
          <div class="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden"><div class="h-full rounded-full bg-white/70 transition-[width] duration-150" style=${`width:${Math.round(energy * 100)}%`}></div></div>
          <div class="font-mono text-sm font-semibold tabular-nums text-white/90 w-8 text-right">${note != null ? noteName(note) : "—"}</div>
        </div>` : null}
      </div>

      <div class="shrink-0 bg-base-100 border-t border-base-300 px-4 pt-3 pb-3 flex flex-wrap items-center gap-2 justify-center max-w-md w-full mx-auto">
        ${MOODS.map(([s, k]) => html`<button data-scale=${s} aria-pressed=${scale === s} class=${`btn btn-xs rounded-full ${scale === s ? "btn-primary" : "btn-ghost"}`} onClick=${() => setScale(s)} key=${s}>${T(t, k)}</button>`)}
      </div>
    </div>

    ${!enabled || err ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${enable} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
  </${Fragment}>`;
}
