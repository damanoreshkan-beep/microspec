// LoRa Watch — tune a HackRF to a LoRa channel (868 MHz), SEE the chirps in a waterfall, DETECT LoRa
// activity (the preamble) with its SF/BW, and DECODE packets to raw bytes (preamble sync → CFO/STO →
// symbol extraction → gray/interleave/hamming/whiten/CRC codec, ported from LoRaPHY). A Web Worker does
// the DSP (/_rt/lora.js decodeLoraSignal). See docs/research/lora-detect.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Island } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { LORA_PRESETS } from "/_rt/lora.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const fMhz = (hz) => (hz / 1e6).toFixed(3);
const NORM_LO = -95, NORM_HI = -35;
const norm = (db) => Math.max(0, Math.min(1, (db - NORM_LO) / (NORM_HI - NORM_LO)));

const $connected = atom(false), $usbOk = atom(true), $detect = atom(null), $active = atom(false), $packets = atom([]);
let pid = 0;
const asciiOf = (bytes) => bytes.map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "·")).join("");
const hexOf = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
const $preset = persistentAtom("lorawatch:preset", "longfast", { encode: String, decode: (s) => (LORA_PRESETS.some((p) => p.key === s) ? s : "longfast") });
const preset = () => LORA_PRESETS.find((p) => p.key === $preset.get()) || LORA_PRESETS[0];

let worker = null, wfCanvas = null;
function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "waterfall") drawRows(wfCanvas, new Float32Array(m.buf), m.nrows, m.cols);
    else if (m.type === "detect") $detect.set({ sf: m.sf, bw: m.bw, count: m.count });
    else if (m.type === "packet") $packets.set([{ id: ++pid, bytes: m.bytes, crcOk: m.crcOk, sf: m.sf }, ...$packets.get()].slice(0, 30));
    else if (m.type === "level") $active.set(!!m.active);
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
  const p = preset(); worker.postMessage({ type: "start", freq: p.freq, sf: p.sf, bw: p.bw });
}
function stopWorker() { if (!worker) return; try { worker.postMessage({ type: "stop" }); } catch { /* */ } const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 400); }

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; }
  if (!dev) return;
  $usbOk.set(true); $connected.set(true); startWorker();
}
function disconnect() { buzz(); stopWorker(); $connected.set(false); $detect.set(null); $active.set(false); }
function setPreset(k) { buzz(); $preset.set(k); $detect.set(null); $active.set(false); if (worker) { const p = preset(); worker.postMessage({ type: "stop" }); startWorker(); } }

// ---- waterfall drawing (guarded for the 0×0 preflight stub) ----
function ctx2d(cv) { try { return cv && cv.getContext ? cv.getContext("2d") : null; } catch { return null; } }
function heat(v, out) { // v 0..1 → [r,g,b] into `out`
  v = Math.max(0, Math.min(1, v));
  const s = [[0, 8, 9, 14], [0.35, 26, 30, 84], [0.6, 40, 110, 190], [0.8, 90, 200, 180], [1, 240, 240, 210]];
  for (let i = 1; i < s.length; i++) if (v <= s[i][0]) { const a = s[i - 1], b = s[i], f = (v - a[0]) / (b[0] - a[0]); out[0] = a[1] + (b[1] - a[1]) * f | 0; out[1] = a[2] + (b[2] - a[2]) * f | 0; out[2] = a[3] + (b[3] - a[3]) * f | 0; return; }
  out[0] = 240; out[1] = 240; out[2] = 210;
}
function drawRows(cv, flat, nrows, cols) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h || !nrows) return;
  const img = c.createImageData && c.createImageData(w, nrows); if (!img) return;
  const rgb = [0, 0, 0];
  for (let r = 0; r < nrows; r++) for (let x = 0; x < w; x++) {
    heat(norm(flat[r * cols + Math.min(cols - 1, (x / w * cols) | 0)]), rgb);
    const i = (r * w + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  }
  c.drawImage(cv, 0, -nrows);                       // scroll up; newest rows at the bottom
  c.putImageData(img, 0, h - nrows);
}
// deterministic demo: paint a dark channel with a few diagonal LoRa up-chirps sweeping the band
function seedWaterfall(cv) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h) return;
  const img = c.createImageData && c.createImageData(w, h); if (!img) return;
  const rgb = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0.12 + 0.05 * Math.sin(x * 0.3 + y * 0.11);            // noise floor
    for (let k = 0; k < 6; k++) { const start = (k * 41) % h; const bin = ((x - (((y - start + h) % h) / h) * w) % w + w) % w; if (bin < w * 0.06) v = Math.max(v, 0.9); } // 6 up-chirp sweeps
    heat(Math.min(1, v), rgb); const i = (y * w + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

export function lorawatchView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk), pk = useStore($preset);
  const detect = useStore($detect), active = useStore($active), packets = useStore($packets);
  const demo = gate;

  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $detect.set({ sf: 11, bw: 250_000, count: 7 }); $active.set(true);
    $packets.set([
      { id: 1, crcOk: true, sf: 11, bytes: [0x08, 0x1a, 0x4d, 0x65, 0x73, 0x68, 0x21, 0x20, 0x68, 0x69] },
      { id: 2, crcOk: true, sf: 11, bytes: [0x24, 0x03, 0xa7, 0x1f, 0x00, 0x62, 0x11, 0x8c] },
      { id: 3, crcOk: false, sf: 11, bytes: [0xff, 0x13, 0x9c, 0x40, 0x2a] },
    ]);
  }, []);
  const wfRef = useRef(null), wfBox = useRef(null);
  // The waterfall takes its size from its BOX, never from itself. `clientWidth` on a canvas reports the
  // canvas's own INTRINSIC size (its width attribute) for as long as no CSS width applies — and the utility
  // sheet is generated in the browser here, so on a cold open there is a window where it does not. Measuring
  // the canvas inside that window and writing back clientWidth×DPR made the element intrinsically 2× the
  // default 300px, i.e. 600px of layout in a 384px page, and the whole document scrolled with it.
  //   So: measure the box (a plain block with an inline height — right in every window, and its height does
  // not depend on the canvas, so the observer below cannot feed itself), then set BOTH halves of the HiDPI
  // pair — the CSS box in px and the backing store in device px. The canvas can no longer size anything.
  // The observer re-fits when the sheet lands, on rotation, and when the view is narrowed.
  useEffect(() => {
    wfCanvas = wfRef.current; const cv = wfCanvas, box = wfBox.current;
    if (!cv || !box) return;
    const fit = () => {
      const r = box.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return;                                          // not laid out yet — the observer calls back
      cv.style.display = "block"; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
      const ww = w * dpr, hh = h * dpr;
      if (cv.width === ww && cv.height === hh) return;               // resizing the store clears it — only on change
      cv.width = ww; cv.height = hh;
      if (demo) seedWaterfall(cv);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro && ro.observe(box);
    return () => ro && ro.disconnect();
  }, [connected]);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      ${/* A raised plaque, not a tinted box with a hairline: the material says "object", the colour stays on
           the MARK (the glyph) where an arbitrary hue is safe in both themes. */""}
      <div class="w-20 h-20 rounded-3xl grid place-items-center sf-raised sf-e3 text-primary">${Icon("lucide:radio", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning rounded-2xl sf-e2 text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  const p = preset();
  return html`<${Fragment}>
    <div class="@container flex flex-col gap-3 max-w-[440px] mx-auto w-full pb-40">
      <!-- preset selector -->
      <${Segmented} attr="data-preset" scroll variant="outline" size="sm"
        items=${LORA_PRESETS.map((pp) => ({ id: pp.key, label: pp.label }))} value=${pk} onChange=${setPreset} />

      ${/* waterfall (chirps) — the hairline was framing FOREIGN content whose own near-black already draws the
           edge against either theme's page. It is a slab on the page now, so the shadow pair does the edge. */""}
      ${/* The height is inline, not `h-64`: this box is what the canvas is measured against, so it has to be
           the right size from the first frame — before the generated sheet exists — and it must not take its
           height from the thing it sizes. */""}
      <div ref=${wfBox} class="w-full rounded-3xl overflow-hidden bg-[#08090e] sf-e2" style="height:16rem">
        <canvas ref=${wfRef} class="block w-full h-full" role="img" aria-label=${T(t, "waterfall")} data-waterfall></canvas>
      </div>

      ${/* activity — the ring of primary hairline + tint was a THIRD drawing of "detected", which the pulsing
           dot and the headline already say. The panel now answers with the material instead: it stands
           further off the page while there is something to hear (e3) and settles back to e2 when idle. */""}
      <div class=${`rounded-2xl px-4 py-3 flex items-center gap-3 sf-raised ${active ? "sf-e3" : "sf-e2"}`} data-live data-activity>
        ${/* Idle was an ink alpha (`bg-base-content/25`). A 10px LED is far too small for the shadow pair, so
             it takes --sf-track-face — the system's one sanctioned tone step — instead of this app's own
             guess at how dark "off" should be. Live keeps bg-primary: that is meaning, not depth. */""}
        <span class=${`w-2.5 h-2.5 rounded-full shrink-0 ${active ? "bg-primary animate-pulse" : ""}`} style=${active ? "" : "background:var(--sf-track-face)"}></span>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">${T(t, active ? "detected" : "listening")}</div>
          ${detect ? html`<div class="font-mono text-xs text-base-content/70 tabular-nums">SF${detect.sf} · ${Math.round(detect.bw / 1000)} kHz · ${detect.count} ${T(t, "bursts")}</div>` : null}
        </div>
        <span class="font-mono text-xs text-base-content/55 tabular-nums shrink-0">${fMhz(p.freq)}</span>
      </div>

      <!-- decoded packets -->
      ${packets.length ? html`<div class="flex flex-col gap-1.5" data-live data-packets>
        <div class="text-xs uppercase tracking-wide text-base-content/70 px-1">${T(t, "packets")}</div>
        ${packets.map((pkt) => html`<div key=${pkt.id} data-packet class="rounded-2xl sf-raised sf-e2 px-4 py-2.5 flex flex-col gap-1">
          ${/* The CRC pill keeps its hue (that IS the meaning) and loses its outline — a badge is a small
               raised object, so it takes the shallow pair theme.css already gives every `.badge`. */""}
          <div class="flex items-center gap-2">
            <span class=${`rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider sf-e2 ${pkt.crcOk ? "text-primary bg-primary/10" : "text-warning bg-warning/10"}`}>${T(t, pkt.crcOk ? "crcOk" : "crcBad")}</span>
            <span class="font-mono text-[0.62rem] text-base-content/65 tabular-nums">SF${pkt.sf} · ${pkt.bytes.length} B</span>
          </div>
          <div class="font-mono text-[0.72rem] text-base-content/70 break-all leading-snug">${hexOf(pkt.bytes)}</div>
          <div class="font-mono text-sm break-all leading-snug">${asciiOf(pkt.bytes)}</div>
        </div>`)}
      </div>` : null}
    </div>

    <${Island} pinned data-player className="w-full max-w-[440px] flex items-center gap-2.5 rounded-full p-2">
        ${Icon("lucide:radio", `text-lg text-primary ${active ? "animate-pulse" : ""}`)}
        <span class="flex-1 min-w-0 text-sm font-medium truncate">${p.label} <span class="text-base-content/70 font-mono text-xs">${fMhz(p.freq)}</span></span>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/55 shrink-0" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      <//>
    
  </${Fragment}>`;
}
