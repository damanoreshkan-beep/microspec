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
import { motionCells, motionEnergy } from "/_rt/motion.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

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
  const t = useStore(S.t);
  const gate = isGate || MOCK;
  const [energy, setEnergy] = useState(gate ? 0.42 : 0);
  const [ghost, setGhost] = useState(true);
  const [err, setErr] = useState(null);
  const videoRef = useRef(), sampleRef = useRef(), paintRef = useRef(), prevRef = useRef(null), rafRef = useRef(0);

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
    if (gate) return;
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
          setEnergy(motionEnergy(prevRef.current, cur));
          prevRef.current = cur.slice(0);
          const pw = pc.width, ph = pc.height;
          pctx.globalCompositeOperation = "destination-out";           // fade the old trails toward transparent
          pctx.fillStyle = "rgba(0,0,0,0.055)"; pctx.fillRect(0, 0, pw, ph);
          pctx.globalCompositeOperation = "lighter";                   // additive glow
          const stepN = Math.max(1, Math.floor(cells.length / 240));
          for (let i = 0; i < cells.length; i += stepN) {
            const c = cells[i], x = (1 - c.x) * pw, y = c.y * ph, rad = 3 + c.m * 13; // mirror x → matches the ghost
            const g = pctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.55)`); g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
            pctx.fillStyle = g; pctx.beginPath(); pctx.arc(x, y, rad, 0, 7); pctx.fill();
          }
          pctx.globalCompositeOperation = "source-over";
        } catch { /* transient decode/read */ }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    camera.start(videoRef.current, (e) => { if (liveFlag) setErr(e); }, { facingMode: "user" }).then((s) => {
      if (!liveFlag) { s(); return; }
      stop = s; rafRef.current = requestAnimationFrame(step);
    });
    return () => { liveFlag = false; cancelAnimationFrame(rafRef.current); removeEventListener("resize", onResize); stop(); };
  }, []);

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

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      ${!gate && !err ? html`<video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ghost ? "opacity-20" : "opacity-0"}`} style="transform:scaleX(-1)"></video>` : null}
      <canvas ref=${sampleRef} class="hidden"></canvas>
      <canvas ref=${paintRef} class="absolute inset-0 w-full h-full"></canvas>
      ${!err ? html`<div class="absolute top-3 left-3 right-3 flex items-center pointer-events-none">
        <div data-live class="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden"><div class="h-full rounded-full bg-white/70 transition-[width] duration-150" style=${`width:${Math.round(energy * 100)}%`}></div></div>
      </div>` : null}
      ${err ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-base-200">
        ${Icon("lucide:camera-off", "text-4xl text-base-content/50")}
        <div class="font-semibold">${T(t, err === "denied" ? "permBlocked" : "permUnavailable")}</div>
        ${err === "denied" ? html`<button class="btn btn-primary btn-sm rounded-2xl" onClick=${() => S.screen.set("perms")}>${T(t, "permEnable")}</button>` : null}
      </div>` : null}
    </div>

    <div class="shrink-0 bg-base-100 border-t border-base-300 px-4 pt-3 pb-3 flex items-center justify-center gap-3">
      <button data-ghost aria-label=${T(t, "ghost")} aria-pressed=${ghost} onClick=${() => setGhost((g) => !g)} class=${`btn btn-circle btn-sm ${ghost ? "btn-primary" : "btn-ghost"}`}>${Icon(ghost ? "lucide:eye" : "lucide:eye-off", "text-lg")}</button>
      <button data-clear aria-label=${T(t, "clear")} data-haptic="bump" onClick=${clear} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:trash-2", "text-lg")}</button>
      <button data-save aria-label=${T(t, "save")} onClick=${save} class="btn btn-primary rounded-2xl gap-2 px-5">${Icon("lucide:download")}${T(t, "save")}</button>
    </div>
  </div>`;
}
