// Eyedropper (Піпетка) — point the rear camera at anything and read the colour under the reticle live:
// HEX / RGB / HSL, plus the frame's dominant palette. The camera capability (/_rt/sensors.js `camera`) is
// new to the runtime — this is its first consumer. The pixel maths (average, median-cut palette, HEX/HSL,
// readable ink) lives in /_rt/colour.js, unit-tested, so it runs in the headless gate on a seeded buffer:
// the gate has no camera and no canvas, so we never sample a live frame there — we seed the reading and
// draw the palette as a gradient. Freeze holds a reading; every swatch taps to copy its HEX.
import { html } from "htm/preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { camera } from "/_rt/sensors.js";
import { avgColor, palette, rgbToHex, rgbToHsl } from "/_rt/colour.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

// A synthetic frame for the gate: five saturated bands. The real colour.js runs on it (deterministic
// palette + a picked colour), so the seeded shot exercises the maths, never a live capture.
function seedBuffer() {
  const bands = [[233, 90, 74], [228, 185, 60], [70, 196, 110], [63, 199, 192], [122, 90, 200]];
  const px = new Uint8ClampedArray(bands.length * 24 * 4);
  let o = 0;
  for (const c of bands) for (let i = 0; i < 24; i++) { px[o++] = c[0]; px[o++] = c[1]; px[o++] = c[2]; px[o++] = 255; }
  return px;
}

export function pipette({ S }) {
  const t = useStore(S.t);
  const gate = isGate || MOCK;
  // gate seed: picked = the palette's middle swatch, which is exactly the 135° gradient's centre — so the
  // reticle dot matches what it sits on in the seeded shot (on a real device picked IS the centre pixel).
  const seed = useMemo(() => { if (!gate) return null; const pal = palette(seedBuffer(), 5); return { pal, picked: pal[2] || pal[0] }; }, []);
  const [picked, setPicked] = useState(seed ? seed.picked : null);
  const [pal, setPal] = useState(seed ? seed.pal : []);
  const [err, setErr] = useState(null);
  const [frozen, setFrozen] = useState(false);
  const videoRef = useRef(), canvasRef = useRef(), frozenRef = useRef(false);
  frozenRef.current = frozen;

  useEffect(() => {
    if (gate) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let live = true, timer = null, stop = () => {};
    const sample = () => {
      const v = videoRef.current, cv = canvasRef.current;
      if (!v || !cv || v.readyState < 2 || frozenRef.current) return;
      try {
        const W = 48, H = Math.max(24, Math.round(48 * ((v.videoHeight || 4) / (v.videoWidth || 3))));
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, W, H);
        const cx = (W >> 1) - 3, cy = (H >> 1) - 3;
        setPicked(avgColor(ctx.getImageData(cx, cy, 6, 6).data));
        setPal(palette(ctx.getImageData(0, 0, W, H).data, 5));
        setErr(null);
      } catch { /* transient decode / read */ }
    };
    camera.start(videoRef.current, (e) => { if (live) setErr(e); }).then((s) => {
      if (!live) { s(); return; }
      stop = s; timer = setInterval(sample, 150);
    });
    return () => { live = false; clearInterval(timer); stop(); };
  }, []);

  const copy = async (rgb) => {
    const hex = rgbToHex(rgb);
    try { await navigator.clipboard.writeText(hex); S.toast?.(T(t, "copied", { v: hex })); } catch { /* clipboard blocked */ }
  };

  const hex = picked ? rgbToHex(picked) : "—";
  const rgbStr = picked ? `rgb(${picked.join(" ")})` : "";
  const hslStr = picked ? (([h, s, l]) => `hsl(${h} ${s}% ${l}%)`)(rgbToHsl(picked)) : "";
  const grad = pal.length ? `linear-gradient(135deg, ${pal.map(rgbToHex).join(", ")})` : "#18181b";

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <!-- preview -->
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      ${!gate && !err ? html`<video ref=${videoRef} autoplay muted playsinline class="absolute inset-0 w-full h-full object-cover"></video>` : null}
      ${gate ? html`<div class="absolute inset-0" style=${`background:${grad}`}></div>` : null}
      <canvas ref=${canvasRef} class="hidden"></canvas>
      ${!err ? html`<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-16 h-16 rounded-full border-2 border-white/90" style="box-shadow:0 0 0 2px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.35)">
          <div class="w-full h-full rounded-full flex items-center justify-center">
            <div class="w-5 h-5 rounded-full border border-white/80" style=${picked ? `background:${hex}` : ""}></div>
          </div>
        </div>
      </div>` : null}
      ${err ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-base-200">
        ${Icon("lucide:camera-off", "text-4xl text-base-content/50")}
        <div class="font-semibold">${T(t, err === "denied" ? "permBlocked" : "permUnavailable")}</div>
        ${err === "denied" ? html`<button class="btn btn-primary btn-sm rounded-2xl" onClick=${() => S.screen.set("perms")}>${T(t, "permEnable")}</button>` : null}
      </div>` : null}
    </div>

    <!-- readout -->
    <div class="shrink-0 bg-base-100 border-t border-base-300 px-4 pt-3 pb-3 flex flex-col gap-3 max-w-md w-full mx-auto">
      <div class="flex items-center gap-3">
        <button aria-label=${hex} onClick=${() => picked && copy(picked)} class="w-14 h-14 rounded-2xl shrink-0 border border-base-300 active:scale-95 transition" style=${picked ? `background:${hex}` : ""}></button>
        <div class="flex-1 min-w-0">
          <div data-live class="text-2xl font-bold font-mono tabular-nums leading-tight">${hex}</div>
          <div class="text-[0.7rem] text-base-content/60 font-mono leading-snug truncate">${rgbStr}</div>
          ${hslStr ? html`<div class="text-[0.7rem] text-base-content/60 font-mono leading-snug truncate">${hslStr}</div>` : null}
        </div>
        <button data-freeze aria-label=${T(t, frozen ? "live" : "freeze")} aria-pressed=${frozen} onClick=${() => setFrozen((f) => !f)} class=${`btn btn-circle btn-sm ${frozen ? "btn-primary" : "btn-ghost"}`}>${Icon(frozen ? "lucide:play" : "lucide:snowflake", "text-lg")}</button>
      </div>
      <div class="flex gap-2">
        ${(pal.length ? pal : Array(5).fill(null)).map((c, i) => c
          ? html`<button data-swatch aria-label=${rgbToHex(c)} onClick=${() => copy(c)} class="flex-1 h-9 rounded-lg border border-base-300 active:scale-95 transition" style=${`background:${rgbToHex(c)}`} key=${i}></button>`
          : html`<div class="flex-1 h-9 rounded-lg bg-base-300/40" key=${i}></div>`)}
      </div>
    </div>
  </div>`;
}
