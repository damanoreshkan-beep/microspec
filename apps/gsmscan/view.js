// GSM Scanner — sweeps a downlink GSM band with a HackRF (WebUSB) and shows the live band spectrum + the
// active carriers (ARFCNs) around you. It receives the network's PUBLIC broadcast energy only — it does NOT
// decode Cell-IDs, network identifiers, or any subscriber data (that needs the full gr-gsm stack and is
// infeasible in-browser), and it never touches IMSIs. A Web Worker does the sweep. See docs/research/gsm-band-scanner.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { gate } from "/_rt/gate.js";
import { BANDS, arfcnToFreq } from "/_rt/gsmband.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const fMhz = (hz) => (hz / 1e6).toFixed(1);
const NORM_LO = -118, NORM_HI = -48;
const norm = (db) => Math.max(0, Math.min(1, (db - NORM_LO) / (NORM_HI - NORM_LO)));
const BAND_KEYS = ["gsm900", "dcs1800"];

const $connected = atom(false), $usbOk = atom(true), $spectrum = atom(null), $arfcns = atom([]), $sweep = atom({ active: false, frac: 0 });
const $band = persistentAtom("gsmscan:band", "gsm900", { encode: String, decode: (s) => (BANDS[s] ? s : "gsm900") });
const $lna = persistentAtom("gsmscan:lna", 24, { encode: String, decode: Number });
const $vga = persistentAtom("gsmscan:vga", 32, { encode: String, decode: Number });

let worker = null;
function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "sweep") { $spectrum.set(new Float32Array(m.buf || m.spectrum)); $arfcns.set(m.arfcns || []); $sweep.set({ active: true, frac: 1 }); }
    else if (m.type === "sweepProgress") $sweep.set({ active: true, frac: m.frac ?? $sweep.get().frac });
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
  worker.postMessage({ type: "start", band: $band.get(), lna: $lna.get(), vga: $vga.get() });
}
function stopWorker() { if (!worker) return; try { worker.postMessage({ type: "stop" }); } catch { /* */ } const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 400); }

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; }
  if (!dev) return;
  $usbOk.set(true); $connected.set(true); startWorker();
}
function disconnect() { buzz(); stopWorker(); $connected.set(false); $spectrum.set(null); $arfcns.set([]); $sweep.set({ active: false, frac: 0 }); }
function setBand(b) { buzz(); $band.set(b); $arfcns.set([]); $spectrum.set(null); if (worker) worker.postMessage({ type: "band", band: b }); }
function pushGain() { if (worker) worker.postMessage({ type: "gain", lna: $lna.get(), vga: $vga.get() }); }

// ---- band spectrum canvas (guarded for the linkedom 0×0 stub) ----
function ctx2d(cv) { try { return cv && cv.getContext ? cv.getContext("2d") : null; } catch { return null; } }
function drawSpectrum(cv, bins) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h || !bins) return;
  const light = typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light");
  const ink = light ? "24,22,32" : "236,236,238", fill = light ? "99,84,182" : "139,127,214";
  c.clearRect(0, 0, w, h);
  const n = bins.length;
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, (x / w * n) | 0)]); c.lineTo(x, h - v * h); }
  c.lineTo(w, h); c.closePath();
  const g = c.createLinearGradient && c.createLinearGradient(0, 0, 0, h);
  if (g && g.addColorStop) { g.addColorStop(0, `rgba(${fill},0.5)`); g.addColorStop(1, `rgba(${fill},0.04)`); c.fillStyle = g; } else c.fillStyle = `rgba(${fill},0.3)`;
  c.fill();
  c.beginPath();
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, (x / w * n) | 0)]); const y = h - v * h; x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = `rgba(${ink},0.8)`; c.lineWidth = Math.max(1, h / 90); c.stroke();
}
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => { const cv = ref.current; if (!cv) return; const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1); const ww = (cv.clientWidth | 0) * dpr, hh = (cv.clientHeight | 0) * dpr; if (ww && (cv.width !== ww || cv.height !== hh)) { cv.width = ww; cv.height = hh; } draw(cv); }, deps);
  return ref;
}

// deterministic demo band profile + carriers (gate/?mock) so the populated screen renders
function seedBand(n, phase = 0) {
  const out = new Float32Array(n); const peaks = [0.12, 0.3, 0.52, 0.68, 0.85];
  for (let b = 0; b < n; b++) {
    const d = b / n; let v = -112 + 3 * Math.sin(b * 0.5) + 2 * Math.sin(b * 0.17 + phase);
    for (const p of peaks) v = Math.max(v, -112 + 60 * Math.exp(-((d - p) ** 2) / 0.00008));
    out[b] = v;
  }
  return out;
}

export function gsmscanView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), theme = useStore(S.theme);
  const connected = useStore($connected), usbOk = useStore($usbOk), band = useStore($band);
  const spectrum = useStore($spectrum), arfcns = useStore($arfcns), sweep = useStore($sweep);
  const demo = gate;

  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $spectrum.set(seedBand(360, 3));
    $arfcns.set([
      { arfcn: 18, freq: arfcnToFreq("gsm900", 18), db: -58, bcch: true }, { arfcn: 44, freq: arfcnToFreq("gsm900", 44), db: -64, bcch: true },
      { arfcn: 62, freq: arfcnToFreq("gsm900", 62), db: -71, bcch: false }, { arfcn: 81, freq: arfcnToFreq("gsm900", 81), db: -76, bcch: true },
      { arfcn: 103, freq: arfcnToFreq("gsm900", 103), db: -83, bcch: false },
    ]);
    $sweep.set({ active: true, frac: 1 });
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary border border-primary/25">${Icon("lucide:antenna", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning border border-warning/25 rounded-2xl text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  return html`<${Fragment}>
    <div class="flex flex-col gap-3 max-w-[440px] mx-auto w-full pb-24">
      <!-- band selector -->
      <div class="flex items-center gap-2 pt-0.5">
        <div class="flex gap-1.5 flex-1">
          ${BAND_KEYS.map((k) => html`<button key=${k} data-band=${k} aria-pressed=${band === k} onClick=${() => setBand(k)}
            class=${`flex-1 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${band === k ? "border-primary/50 bg-primary/12 text-primary" : "border-base-content/15 text-base-content/60"}`}>${BANDS[k].label}</button>`)}
        </div>
      </div>

      <!-- band spectrum -->
      <div class="w-full rounded-3xl border border-base-content/10 bg-base-100/50 overflow-hidden backdrop-blur">
        <canvas ref=${useCanvas((cv) => drawSpectrum(cv, $spectrum.get()), [spectrum, theme])} class="block w-full h-24" role="img" aria-label=${T(t, "spectrum")} data-spectrum></canvas>
        <div class="flex justify-between px-3 py-1 font-mono text-[0.6rem] text-base-content/45 tabular-nums border-t border-base-content/10">
          <span>${fMhz(BANDS[band].dlLo)}</span><span class="uppercase tracking-wider">${BANDS[band].label}</span><span>${fMhz(BANDS[band].dlHi)} MHz</span>
        </div>
      </div>

      <!-- active carriers -->
      <div class="flex items-center justify-between px-1">
        <span class="text-xs uppercase tracking-wide text-base-content/60">${T(t, "carriers")}</span>
        <span class="font-mono text-xs tabular-nums text-base-content/50" data-count>${arfcns.length}</span>
      </div>
      <div class="flex flex-col gap-1.5" data-live data-carriers>
        ${arfcns.length ? arfcns.map((a) => html`<div key=${a.arfcn} data-arfcn=${a.arfcn} class="flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/40 px-4 py-2.5">
          <span class="font-mono tabular-nums text-lg w-14 shrink-0">${a.arfcn}</span>
          <div class="flex-1 min-w-0 flex flex-col">
            <span class="font-mono tabular-nums text-sm truncate">${fMhz(a.freq)}<span class="text-base-content/45 text-xs"> MHz</span></span>
            ${a.bcch ? html`<span class="text-[0.6rem] uppercase tracking-wider text-secondary" data-bcch>BCCH · C0</span>` : null}
          </div>
          <${Bars} level=${norm(a.db)} label=${T(t, "sigLabel")} />
          <span class="font-mono tabular-nums text-xs text-base-content/60 w-14 text-right shrink-0">${a.db} dBm</span>
        </div>`)
      : html`<div class="flex flex-col items-center text-base-content/55 py-10 gap-2 text-center px-6">${Icon("lucide:radio-tower", "text-3xl")}<span class="text-sm">${T(t, sweep.active ? "scanning" : "noCarriers")}</span></div>`}
      </div>
    </div>

    <!-- floating control island: sweep status + settings + power -->
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.4rem)">
      <div data-player class="pointer-events-auto w-full max-w-[440px] flex items-center gap-2.5 rounded-full border border-base-content/10 bg-base-100/85 backdrop-blur-xl shadow-[0_10px_30px_-8px_rgba(0,0,0,.6),inset_0_1px_0_0_rgba(255,255,255,.09)] px-4 py-2.5">
        ${Icon("lucide:radar", `text-lg text-primary ${sweep.active ? "animate-spin" : ""}`)}
        <span class="flex-1 min-w-0 text-sm font-medium truncate">${T(t, "scanning")} <span class="text-base-content/50 font-mono text-xs">${BANDS[band].label}</span></span>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/55 shrink-0" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      </div>
    </div>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

function Bars({ level, label }) {
  const bars = 4, lit = Math.round(level * bars);
  return html`<div class="flex items-end gap-[3px] h-6 shrink-0" role="img" aria-label=${label} data-signal>
    ${[...Array(bars)].map((_, i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${40 + i * 20}%`}></span>`)}
  </div>`;
}

function SettingsSheet({ open, onClose, t, demo }) {
  const lna = useStore($lna), vga = useStore($vga);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const Row = (label, node) => html`<div class="flex flex-col gap-1"><div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${label}</span></div>${node}</div>`;
  return html`<dialog id="rfsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-4 max-w-xl mx-auto">${grip}
    ${Row(html`${T(t, "gainLna")} <span class="font-mono tabular-nums text-base-content/50">${lna} dB</span>`, html`<input type="range" min="0" max="40" step="8" value=${lna} class="range range-xs range-primary" aria-label=${T(t, "gainLna")} onInput=${(e) => { $lna.set(Number(e.target.value)); pushGain(); }} />`)}
    ${Row(html`${T(t, "gainVga")} <span class="font-mono tabular-nums text-base-content/50">${vga} dB</span>`, html`<input type="range" min="0" max="62" step="2" value=${vga} class="range range-xs range-primary" aria-label=${T(t, "gainVga")} onInput=${(e) => { $vga.set(Number(e.target.value)); pushGain(); }} />`)}
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-base-content/60 self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}
