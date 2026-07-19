// Flux (Потік) — paint with motion. The front camera's frame-to-frame difference (/_rt/motion.js, unit-
// tested) says WHERE you moved; the app splats a soft, additively-blended glow there in the world's own
// colours, and the trails fade — your movement leaves light. Save the frame as a wallpaper. The gate has no
// camera and linkedom has no canvas, so both are guarded: in the Chromium gate we paint a deterministic
// seeded composition (real canvas), in preflight we simply mount the DOM.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { camera } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { motionCells, motionEnergy, centroidOf } from "/_rt/motion.js";
import { createEngine, midiToFreq, filter } from "/_rt/audio.js";
import { gate } from "/_rt/gate.js";

// C major pentatonic over two octaves — the vertical position of the movement picks a note, so it always
// sounds musical. Top of frame = high.
const PITCHES = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69];

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// gate seed: a deterministic glowing ribbon (a Lissajous path), so the shot shows a real painted canvas.
function paintSeed(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const N = 300;
  for (let i = 0; i < N; i++) {
    const s = i / N;
    const x = w * (0.5 + 0.34 * Math.sin(s * Math.PI * 6));
    const y = h * (0.5 + 0.32 * Math.sin(s * Math.PI * 4 + 0.7));
    const hue = (s * 320 + 170) % 360, rad = 4 + 10 * Math.abs(Math.sin(s * Math.PI * 7));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${hue},85%,62%,0.5)`); g.addColorStop(1, `hsla(${hue},85%,62%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

export function flux({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [energy, setEnergy] = useState(gate ? 0.42 : 0);
  const [ghost, setGhost] = useState(true);
  const [sound, setSound] = useState(false);
  const [err, setErr] = useState(null);
  const [enabled, setEnabled] = useState(gate);   // camera opens only after the user taps Enable (gate auto-on)
  const videoRef = useRef(), sampleRef = useRef(), paintRef = useRef(), prevRef = useRef(null), rafRef = useRef(0);
  const engRef = useRef(null), oscRef = useRef(null), filtRef = useRef(null), sgainRef = useRef(null), soundRef = useRef(false);
  soundRef.current = sound;

  const fit = () => { const c = paintRef.current; if (!c) return; const r = c.getBoundingClientRect?.(); if (r && r.width) { c.width = Math.round(r.width); c.height = Math.round(r.height); } };

  // gate: paint the seeded composition once (Chromium has canvas; linkedom returns null → guarded skip)
  useEffect(() => {
    if (!gate) return;
    fit();
    // linkedom (preflight) returns a partial 2d stub whose createRadialGradient is undefined — guard by trying.
    try { const c = paintRef.current, ctx = c?.getContext?.("2d"); if (ctx) paintSeed(ctx, c.width || 360, c.height || 480); } catch { /* no real canvas here */ }
  }, []);

  // live: camera + per-frame motion painting
  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let liveFlag = true, stop = () => {};
    fit();
    const onResize = () => fit(); addEventListener("resize", onResize);
    const step = () => {
      if (!liveFlag) return;
      const v = videoRef.current, sc = sampleRef.current, pc = paintRef.current, pctx = pc?.getContext?.("2d");
      if (v && sc && pctx && v.readyState >= 2) {
        try {
          const W = 64, H = 48; sc.width = W; sc.height = H;
          const sctx = sc.getContext("2d", { willReadFrequently: true });
          sctx.drawImage(v, 0, 0, W, H);
          const cur = sctx.getImageData(0, 0, W, H).data;
          const cells = motionCells(prevRef.current, cur, W, H, 22);
          const en = motionEnergy(prevRef.current, cur);
          setEnergy(en);
          prevRef.current = cur.slice(0);
          const pw = pc.width, ph = pc.height;
          pctx.globalCompositeOperation = "destination-out";           // fade the old trails toward transparent
          pctx.fillStyle = "rgba(0,0,0,0.055)"; pctx.fillRect(0, 0, pw, ph);
          pctx.globalCompositeOperation = "lighter";                   // additive glow (rear camera → no mirror)
          const stepN = Math.max(1, Math.floor(cells.length / 240));
          for (let i = 0; i < cells.length; i += stepN) {
            const c = cells[i], x = c.x * pw, y = c.y * ph, rad = 3 + c.m * 13;
            const g = pctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.55)`); g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
            pctx.fillStyle = g; pctx.beginPath(); pctx.arc(x, y, rad, 0, 7); pctx.fill();
          }
          pctx.globalCompositeOperation = "source-over";
          // sound: the movement plays. Y → pitch (top = high, in a pentatonic scale), energy → brightness + gain.
          if (soundRef.current && engRef.current && oscRef.current) {
            const ctx = engRef.current.ctx, now = ctx.currentTime, cen = centroidOf(cells);
            const note = PITCHES[Math.max(0, Math.min(PITCHES.length - 1, Math.floor((1 - cen.y) * PITCHES.length)))];
            try {
              oscRef.current.frequency.setTargetAtTime(midiToFreq(note), now, 0.08);
              filtRef.current.frequency.setTargetAtTime(400 + en * 3200, now, 0.1);
              sgainRef.current.gain.setTargetAtTime(Math.min(0.18, en * 0.5), now, 0.12);
            } catch { /* node gone */ }
          }
        } catch { /* transient decode/read */ }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    camera.start(videoRef.current, (e) => { if (liveFlag) setErr(e); }, { facingMode: "environment" }).then((s) => {
      if (!liveFlag) { s(); return; }
      stop = s; rafRef.current = requestAnimationFrame(step);
    });
    return () => { liveFlag = false; cancelAnimationFrame(rafRef.current); removeEventListener("resize", onResize); stop(); };
  }, [enabled]);

  const clear = () => { const c = paintRef.current, ctx = c?.getContext?.("2d"); if (ctx) ctx.clearRect(0, 0, c.width, c.height); };
  const save = () => {
    const c = paintRef.current; if (!c) return;
    try {
      const out = document.createElement("canvas"); out.width = c.width; out.height = c.height;
      const o = out.getContext("2d"); o.fillStyle = "#0a0a0f"; o.fillRect(0, 0, out.width, out.height); o.drawImage(c, 0, 0);
      const a = document.createElement("a"); a.href = out.toDataURL("image/png"); a.download = "flux.png"; a.click();
      S.toast?.(T(t, "toastSaved"));
    } catch { /* export blocked */ }
  };
  const toggleSound = () => {
    if (sound) { try { sgainRef.current?.gain.setTargetAtTime(0, engRef.current.ctx.currentTime, 0.2); } catch { /* */ } setSound(false); return; }
    try {
      if (!engRef.current) {
        const eng = createEngine({ noise: false }); if (!eng) return;
        const osc = eng.ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = 220;
        const f = filter(eng.ctx, "lowpass", 800, 0.9);
        const g = eng.ctx.createGain(); g.gain.value = 0;
        osc.connect(f); f.connect(g); g.connect(eng.master); osc.start();
        engRef.current = eng; oscRef.current = osc; filtRef.current = f; sgainRef.current = g;
      }
      engRef.current.resume(); setSound(true);
    } catch { /* audio unavailable */ }
  };
  useEffect(() => () => { try { oscRef.current?.stop(); engRef.current?.close(); } catch { /* */ } }, []);

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      ${enabled && !err && !gate ? html`<video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ghost ? "opacity-20" : "opacity-0"}`}></video>` : null}
      <canvas ref=${sampleRef} class="hidden"></canvas>
      <canvas ref=${paintRef} class="absolute inset-0 w-full h-full"></canvas>
      ${enabled && !err ? html`<div class="absolute top-3 left-3 right-3 flex items-center pointer-events-none">
        <div data-live class="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden"><div class="h-full rounded-full bg-white/70 transition-[width] duration-150" style=${`width:${Math.round(energy * 100)}%`}></div></div>
      </div>` : null}
    </div>

    <div class="shrink-0 bg-base-100 border-t border-base-300 px-4 pt-3 pb-3 flex items-center justify-center gap-3">
      <button data-ghost aria-label=${T(t, "ghost")} aria-pressed=${ghost} onClick=${() => setGhost((g) => !g)} class=${`btn btn-circle btn-sm ${ghost ? "btn-primary" : "btn-ghost"}`}>${Icon(ghost ? "lucide:eye" : "lucide:eye-off", "text-lg")}</button>
      <button data-sound aria-label=${T(t, "sound")} aria-pressed=${sound} onClick=${toggleSound} class=${`btn btn-circle btn-sm ${sound ? "btn-primary" : "btn-ghost"}`}>${Icon(sound ? "lucide:volume-2" : "lucide:volume-x", "text-lg")}</button>
      <button data-clear aria-label=${T(t, "clear")} data-haptic="bump" onClick=${clear} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:trash-2", "text-lg")}</button>
      <button data-save aria-label=${T(t, "save")} onClick=${save} class="btn btn-primary rounded-2xl gap-2 px-5">${Icon("lucide:download")}${T(t, "save")}</button>
    </div>
    ${!enabled || err ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${() => setEnabled(true)} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
  </div>`;
}
