// Camera (Камера) — a pocket camera dressed as a handheld game console: one square viewfinder "screen" set
// in a modern ink-and-glass chassis, and a deck loaded with every control — filters, exposure, zoom, torch,
// self-timer, thirds grid, mirror, front/back and a 1:1 · 4:5 · 16:9 frame — under a big shutter. The live
// stream is getUserMedia (front/back via facingMode; torch/zoom via the track's capabilities where the
// device supports them); the shot is drawn to a canvas with the chosen filter/mirror/zoom baked in and
// saved (or shared) — never uploaded. The gate has no camera, so it seeds a viewfinder gradient and shows
// the whole console for the still. No emoji — icons are lucide glyphs, the shutter is a drawn ring.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { CameraPrime } from "/_rt/camprime.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

const FX = [
  ["fxNone", ""],
  ["fxNoir", "grayscale(1) contrast(1.35) brightness(0.95)"],
  ["fxMono", "grayscale(1)"],
  ["fxSepia", "sepia(0.7) contrast(1.05) brightness(1.02)"],
  ["fxWarm", "saturate(1.25) sepia(0.22) brightness(1.03)"],
  ["fxCool", "saturate(1.1) hue-rotate(14deg) contrast(1.04)"],
  ["fxVivid", "saturate(1.6) contrast(1.16)"],
  ["fxFade", "contrast(0.82) brightness(1.1) saturate(0.78)"],
];
const ASPECTS = ["1:1", "4:5", "16:9"];
const arOf = (a) => (a === "4:5" ? 4 / 5 : a === "16:9" ? 16 / 9 : 1);

export function cam({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [enabled, setEnabled] = useState(gate);
  const [err, setErr] = useState(null);
  const [facing, setFacing] = useState("environment");
  const [fx, setFx] = useState(0);
  const [expo, setExpo] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [torch, setTorch] = useState(false);
  const [timer, setTimer] = useState(0);          // 0 · 3 · 10 s
  const [aspect, setAspect] = useState("1:1");
  const [caps, setCaps] = useState({ torch: false, zoom: null });
  const [shot, setShot] = useState(null);         // last capture (object URL) → thumbnail
  const [count, setCount] = useState(0);          // self-timer countdown
  const [flash, setFlash] = useState(false);

  const videoRef = useRef(), streamRef = useRef(null), trackRef = useRef(null), timerRef = useRef(0);
  const filterStr = () => `${FX[fx][1]} brightness(${expo.toFixed(2)})`.trim();

  // live: open the stream (front/back), read torch/zoom capabilities
  useEffect(() => {
    if (gate || !enabled) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setErr("unsupported"); return; }
    let live = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (!live) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream; const track = stream.getVideoTracks()[0]; trackRef.current = track;
        const v = videoRef.current; if (v) { v.srcObject = stream; v.setAttribute?.("playsinline", ""); try { await v.play?.(); } catch { /* */ } }
        let c = {}; try { c = track.getCapabilities?.() || {}; } catch { /* */ }
        setCaps({ torch: !!c.torch, zoom: c.zoom && c.zoom.max > c.zoom.min ? c.zoom : null });
      } catch (e) { if (live) setErr(e && e.name === "NotAllowedError" ? "denied" : "unavailable"); }
    })();
    return () => { live = false; try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* */ } streamRef.current = null; trackRef.current = null; const v = videoRef.current; try { if (v) v.srcObject = null; } catch { /* */ } };
  }, [enabled, facing]);

  // torch + optical zoom via track constraints (best-effort; digital zoom is CSS below)
  useEffect(() => { const tr = trackRef.current; if (!tr || !caps.torch) return; try { tr.applyConstraints({ advanced: [{ torch }] }); } catch { /* */ } }, [torch, caps.torch]);
  useEffect(() => { const tr = trackRef.current, z = caps.zoom; if (!tr || !z) return; try { tr.applyConstraints({ advanced: [{ zoom: Math.min(z.max, Math.max(z.min, z.min + (zoom - 1) * (z.max - z.min) / 2)) }] }); } catch { /* */ } }, [zoom, caps.zoom]);

  const enable = () => { buzz(); setEnabled(true); };
  const cycleTimer = () => { buzz(); setTimer((v) => (v === 0 ? 3 : v === 3 ? 10 : 0)); };
  const cycleAspect = () => { buzz(); setAspect((a) => ASPECTS[(ASPECTS.indexOf(a) + 1) % ASPECTS.length]); };
  const flip = () => { buzz(); setTorch(false); setFacing((f) => (f === "environment" ? "user" : "environment")); };

  const grab = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try {
      const vw = v.videoWidth, vh = v.videoHeight, src = Math.min(vw, vh) / zoom;   // centred, zoomed square source
      const sx = (vw - src) / 2, sy = (vh - src) / 2;
      const ar = arOf(aspect); let ow = 1200, oh = Math.round(1200 / ar); if (ar < 1) { oh = 1200; ow = Math.round(1200 * ar); }
      const out = document.createElement("canvas"); out.width = ow; out.height = oh;
      const ctx = out.getContext("2d"); ctx.filter = filterStr();
      if (mirror || facing === "user") { ctx.translate(ow, 0); ctx.scale(-1, 1); }
      const scale = Math.max(ow / src, oh / src), dw = src * scale, dh = src * scale;
      ctx.drawImage(v, sx, sy, src, src, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
      out.toBlob((blob) => {
        if (!blob) return; const url = URL.createObjectURL(blob); setShot((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        const file = new File([blob], `cam-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); }
        else { const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); S.toast?.(T(t, "aSaved")); }
      }, "image/jpeg", 0.92);
    } catch { /* capture blocked */ }
    setFlash(true); setTimeout(() => setFlash(false), 160);
  };
  const shoot = () => {
    buzz(14);
    if (timer > 0) { let n = timer; setCount(n); clearInterval(timerRef.current); timerRef.current = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(timerRef.current); setCount(0); grab(); } else { setCount(n); buzz(6); } }, 1000); }
    else grab();
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  const showMirror = mirror !== (facing === "user");   // front camera is mirrored by default; the toggle inverts it
  const Toggle = (on, icon, label, onClick, extra) => html`<button aria-pressed=${!!on} aria-label=${label} onClick=${onClick} class=${`btn btn-circle btn-sm border ${on ? "btn-primary border-transparent" : "border-base-content/15 bg-base-100 text-base-content/80"}`}>${extra || Icon(icon, "text-base")}</button>`;

  return html`<${Fragment}>
    <div class="fixed inset-x-0 z-20 flex items-stretch justify-center px-3 py-2" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
      <!-- the console body -->
      <div class="w-full max-w-sm mx-auto flex flex-col gap-3 rounded-[1.9rem] border border-base-content/10 bg-gradient-to-b from-base-100 to-base-200 p-4 shadow-[0_10px_40px_-12px_rgba(0,0,0,.6),inset_0_1px_0_0_rgba(255,255,255,.06)]">
        <div class="shrink-0 flex items-center justify-between px-0.5">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-primary/85 shadow-[0_0_7px] shadow-primary/60"></span>
            <span class="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-base-content/60">${loc === "uk" ? "μКАМ" : "μCAM"}</span>
          </div>
          <div class="flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-widest text-base-content/45">
            <span>${T(t, FX[fx][0])}</span><span class="text-base-content/25">·</span><span>${aspect}</span>${zoom > 1.02 ? html`<span class="text-secondary">· ${zoom.toFixed(1)}×</span>` : null}
          </div>
        </div>

        <!-- the square viewfinder screen, set in a bezel -->
        <div class="flex-1 min-h-0 flex items-center justify-center">
          <div data-screen class="relative aspect-square max-h-full max-w-full w-full rounded-2xl overflow-hidden bg-black border-[3px] border-base-300 shadow-[inset_0_2px_10px_rgba(0,0,0,.6)]">
            ${gate ? html`<div class="absolute inset-0" style="background:radial-gradient(120% 90% at 30% 20%, #2b2540, #0c0c12 70%)"></div>` : null}
            ${enabled && !err && !gate ? html`<video ref=${videoRef} autoplay muted playsinline class="absolute inset-0 w-full h-full object-cover" style=${`filter:${filterStr()};transform:scale(${zoom.toFixed(3)})${showMirror ? " scaleX(-1)" : ""}`}></video>` : null}
            ${grid ? html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div class="absolute left-1/3 top-0 bottom-0 w-px bg-white/25"></div><div class="absolute left-2/3 top-0 bottom-0 w-px bg-white/25"></div>
              <div class="absolute top-1/3 left-0 right-0 h-px bg-white/25"></div><div class="absolute top-2/3 left-0 right-0 h-px bg-white/25"></div>
            </div>` : null}
            ${aspect !== "1:1" ? cropBars(aspect) : null}
            <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(135deg,rgba(255,255,255,.08),transparent 42%)"></div>
            <div class="absolute inset-3 pointer-events-none" aria-hidden="true">
              ${["top-0 left-0 border-t-2 border-l-2 rounded-tl-md", "top-0 right-0 border-t-2 border-r-2 rounded-tr-md", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-md"].map((c, i) => html`<span key=${i} class=${`absolute w-5 h-5 border-white/30 ${c}`}></span>`)}
            </div>
            ${count > 0 ? html`<div class="absolute inset-0 flex items-center justify-center"><div class="text-[3.5rem] font-bold tabular-nums text-white drop-shadow-lg">${count}</div></div>` : null}
            <div class=${`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? "opacity-80" : "opacity-0"}`}></div>
          </div>
        </div>

        <!-- deck -->
        <div class="shrink-0 flex flex-col gap-3">
          <!-- filters -->
          <div class="-mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div class="flex gap-1.5 w-max">
              ${FX.map(([k], i) => html`<button data-fx=${i} aria-pressed=${fx === i} class=${`shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-medium transition ${fx === i ? "border-secondary bg-secondary/15 text-secondary" : "border-base-content/12 text-base-content/70"}`} onClick=${() => { buzz(); setFx(i); }} key=${k}>${T(t, k)}</button>`)}
            </div>
          </div>
          <!-- exposure + zoom -->
          <div class="flex items-center gap-3">
            ${Icon("lucide:sun", "text-sm text-base-content/55 shrink-0")}
            <input type="range" min="0.6" max="1.6" step="0.02" value=${expo} aria-label=${T(t, "aExposure")} onInput=${(e) => setExpo(+e.target.value)} class="range range-xs range-primary flex-1" />
            ${Icon("lucide:search", "text-sm text-base-content/55 shrink-0")}
            <input type="range" min="1" max="4" step="0.1" value=${zoom} aria-label=${T(t, "aZoom")} onInput=${(e) => setZoom(+e.target.value)} class="range range-xs range-primary flex-1" />
          </div>
          <!-- toggles: a recessed button deck -->
          <div class="flex items-center justify-center gap-2 flex-wrap rounded-2xl border border-base-content/8 bg-base-300/40 px-2.5 py-2.5 shadow-[inset_0_1px_3px_rgba(0,0,0,.45)]">
            ${Toggle(facing === "user", "lucide:switch-camera", T(t, "aFlip"), flip)}
            ${caps.torch ? Toggle(torch, "lucide:flashlight", T(t, "aTorch"), () => { buzz(); setTorch((v) => !v); }) : null}
            ${Toggle(grid, "lucide:grid-3x3", T(t, "aGrid"), () => { buzz(); setGrid((v) => !v); })}
            ${Toggle(timer > 0, "lucide:timer", T(t, "aTimer"), cycleTimer, timer > 0 ? html`<span class="text-xs font-mono font-bold">${timer}</span>` : null)}
            ${Toggle(showMirror, "lucide:flip-horizontal-2", T(t, "aMirror"), () => { buzz(); setMirror((v) => !v); })}
            ${Toggle(false, "lucide:ratio", T(t, "aAspect"), cycleAspect, html`<span class="text-[0.6rem] font-mono font-bold leading-none">${aspect}</span>`)}
          </div>
          <!-- shutter row -->
          <div class="flex items-center justify-between px-2 pt-0.5">
            <div class="w-11 h-11 rounded-xl border border-base-content/12 bg-base-300 overflow-hidden shrink-0">${shot ? html`<img src=${shot} alt="" class="w-full h-full object-cover" />` : null}</div>
            <button data-shutter aria-label=${T(t, "aShutter")} onClick=${shoot} class="w-[4.6rem] h-[4.6rem] rounded-full bg-base-content/10 border border-base-content/20 flex items-center justify-center active:scale-95 transition shadow-lg">
              <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
            </button>
            <div class="w-11 h-11 shrink-0"></div>
          </div>
        </div>
      </div>
    </div>

    ${!enabled || err ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${enable} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
  </${Fragment}>`;
}

function cropBars(aspect) {
  // dark bars overlaying the square viewfinder to show the selected frame
  if (aspect === "4:5") return html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true"><div class="absolute inset-y-0 left-0 w-[10%] bg-black/55"></div><div class="absolute inset-y-0 right-0 w-[10%] bg-black/55"></div></div>`;
  return html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true"><div class="absolute inset-x-0 top-0 h-[22%] bg-black/55"></div><div class="absolute inset-x-0 bottom-0 h-[22%] bg-black/55"></div></div>`;
}
