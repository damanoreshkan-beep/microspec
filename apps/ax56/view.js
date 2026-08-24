// AX56 Bring-up — reads an RTL8852AU (ASUS USB-AX56) that is already in Wi-Fi mode over WebUSB and replays the
// chip's cold-to-firmware bring-up on a glowing register lattice. The browser cannot switch the adapter out of
// storage mode or download firmware (that needs the userspace driver, github.com/damanoreshkan-beep/
// rtl8852au-userspace); this app is a viewer plus a demo that replays the solved bring-up with no hardware.
// Register semantics + stages are unit-tested in packages/runtime/ax56.js; only the control transfer is here.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import {
  USB_FILTERS, REG, STAGES, stageState, demoFrames, DEMO_LOW_PAGE, decodeCut, cutName, isUnmapped, booted,
} from "/_rt/ax56.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const hex = (v) => "0x" + (v >>> 0).toString(16).padStart(8, "0").toUpperCase();
const addr = (a) => "0x" + a.toString(16).padStart(4, "0").toUpperCase();
const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;
const popcount = (v) => { v = v >>> 0; v -= (v >> 1) & 0x55555555; v = (v & 0x33333333) + ((v >> 2) & 0x33333333); return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

// The six bring-up registers read on a live connect (beyond the 64-cell low page).
const STAGE_ADDRS = [REG.SYS_CFG1, REG.PLATFORM_ENABLE, REG.DMAC_FUNC_EN, REG.WDE_INI, REG.PLE_INI, REG.HCI_FUNC_EN, REG.WCPU_FW_CTRL];

const $connected = atom(false), $usbOk = atom(true), $mode = atom("live"); // "live" | "demo"
const $reads = atom({});          // { addr: value } snapshot driving the stage stepper
const $page = atom(null);         // Uint32Array(64) low page, or null
const $reveal = atom(0);          // how many lattice cells have rippled in (0..64)
const $sel = atom(-1);            // selected lattice cell index, or -1

let dev = null, timer = null;

async function readReg32(d, a) {
  try {
    const r = await d.controlTransferIn({ requestType: "vendor", recipient: "device", request: 0x05, value: a & 0xffff, index: (a >> 16) & 0xff }, 4);
    if (r.status === "ok" && r.data && r.data.byteLength >= 4) return r.data.getUint32(0, true) >>> 0;
  } catch { /* transfer failed */ }
  return 0xdeadbeef;
}

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let d;
  try { d = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; } // cancelled picker = not a fault
  try {
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    await d.claimInterface(0);
  } catch { $usbOk.set(false); return; }
  dev = d; $mode.set("live"); $connected.set(true); $sel.set(-1);
  const snap = {};
  for (const a of STAGE_ADDRS) snap[a] = await readReg32(d, a);
  $reads.set(snap);
  const page = new Uint32Array(64);
  for (let i = 0; i < 64; i++) { page[i] = await readReg32(d, i * 4); $reveal.set(i + 1); $page.set(page.slice()); }
}

function disconnect() {
  buzz(); stopTimer();
  try { dev?.close(); } catch { /* already gone */ }
  dev = null; $connected.set(false); $reads.set({}); $page.set(null); $reveal.set(0); $sel.set(-1);
}

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

// Replay the solved bring-up: step the reads snapshot 1->6 while the lattice ripples in. `instant` seeds the
// booted end state at once (the gate/headless wants the populated victory screen, not a mid-animation frame).
function startDemo({ instant = false } = {}) {
  stopTimer(); // no buzz here: the gate/auto path has no user gesture (vibrate would log a blocked-call warning)
  const frames = demoFrames(); const page = Uint32Array.from(DEMO_LOW_PAGE);
  $mode.set("demo"); $connected.set(true); $sel.set(-1); $page.set(page);
  if (instant) { $reads.set(frames[frames.length - 1]); $reveal.set(64); return; }
  let step = 0; $reads.set(frames[0]); $reveal.set(0);
  timer = setInterval(() => {
    $reveal.set(Math.min(64, $reveal.get() + 7));
    if ($reveal.get() >= 16 && step < frames.length - 1) { step++; $reads.set(frames[step]); }
    if ($reveal.get() >= 64 && step >= frames.length - 1) stopTimer();
  }, 260);
}

// ---- register lattice canvas (guarded for the linkedom 0x0 stub, sized from its BOX like gsmscan) ----
function useLattice(page, reveal, sel, theme) {
  const ref = useRef(null);
  const draw = (cv) => {
    let c; try { c = cv && cv.getContext ? cv.getContext("2d") : null; } catch { c = null; }
    const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h) return;
    const light = typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light");
    let accent = "#22d3ee";
    try { accent = getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || accent; } catch { /* */ }
    const track = light ? "20,20,26" : "236,236,238";
    c.clearRect(0, 0, w, h);
    const N = 8, padX = Math.round(w * 0.02), padY = Math.round(h * 0.02), gap = Math.max(2, Math.round(Math.min(w, h) * 0.012));
    const stepX = (w - padX * 2 + gap) / N, stepY = (h - padY * 2 + gap) / N;
    const cwv = stepX - gap, chv = stepY - gap, r = Math.max(2, Math.min(cwv, chv) * 0.2);
    const rr = (x, y, ww, hh) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + ww, y, x + ww, y + hh, r); c.arcTo(x + ww, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + ww, y, r); c.closePath(); };
    for (let i = 0; i < 64; i++) {
      const col = i % N, row = (i / N) | 0;
      const x = padX + col * stepX, y = padY + row * stepY;
      c.globalAlpha = 1; c.fillStyle = `rgba(${track},${light ? 0.05 : 0.06})`; rr(x, y, cwv, chv); c.fill();       // track
      if (i < reveal && page) {
        const v = page[i] >>> 0;
        if (!isUnmapped(v) && v !== 0) { c.globalAlpha = 0.14 + 0.86 * (popcount(v) / 32); c.fillStyle = accent; rr(x, y, cwv, chv); c.fill(); }
      }
      if (i === sel) { const lw = Math.max(1.5, Math.min(cwv, chv) * 0.06); c.globalAlpha = 1; c.strokeStyle = accent; c.lineWidth = lw; rr(x + lw / 2, y + lw / 2, cwv - lw, chv - lw); c.stroke(); }
    }
    c.globalAlpha = 1;
  };
  const fit = (cv) => {
    const box = cv.parentElement; if (!box) return false;
    const b = box.getBoundingClientRect(), w = Math.round(b.width), h = Math.round(b.height); if (!w || !h) return false;
    cv.style.display = "block"; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    const ww = w * dpr, hh = h * dpr; if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    return true;
  };
  useEffect(() => {
    const cv = ref.current, box = cv && cv.parentElement; if (!cv || !box) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (fit(cv)) draw(cv); }) : null;
    ro && ro.observe(box);
    return () => ro && ro.disconnect();
  }, []);
  useEffect(() => { const cv = ref.current; if (cv && fit(cv)) draw(cv); }, [page, reveal, sel, theme]);
  return ref;
}

function tapCell(e, cv) {
  const b = cv.getBoundingClientRect(); const N = 8;
  const padX = b.width * 0.02, padY = b.height * 0.02, gap = Math.max(2, Math.min(b.width, b.height) * 0.012);
  const stepX = (b.width - padX * 2 + gap) / N, stepY = (b.height - padY * 2 + gap) / N;
  const col = Math.floor((e.clientX - b.left - padX) / stepX), row = Math.floor((e.clientY - b.top - padY) / stepY);
  if (col < 0 || col > 7 || row < 0 || row > 7) return;
  const i = row * 8 + col; buzz(6); $sel.set($sel.get() === i ? -1 : i);
}

export function ax56View({ S }) {
  const t = useStore(S.t), theme = useStore(S.theme);
  const connected = useStore($connected), usbOk = useStore($usbOk), mode = useStore($mode);
  const reads = useStore($reads), page = useStore($page), reveal = useStore($reveal), sel = useStore($sel);

  useEffect(() => { if (gate) startDemo({ instant: true }); return () => stopTimer(); }, []);

  const latticeRef = useLattice(page, reveal, sel, theme);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="h-full flex flex-col items-center justify-center text-center gap-5 px-4 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:cpu", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed text-sm">${T(t, "connectBody")}</p>
      <div class="flex flex-col items-stretch gap-2.5 w-full max-w-[15rem]">
        ${supported
          ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
          : html`<div class="alert bg-warning/12 text-warning rounded-2xl sf-e2 text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
        <button data-demo class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70" onClick=${() => { buzz(12); startDemo(); }}>${Icon("lucide:play")}${T(t, "demoBtn")}</button>
      </div>
      <a href="https://github.com/damanoreshkan-beep/rtl8852au-userspace" target="_blank" rel="noopener" class="text-xs font-mono text-base-content/70 hover:text-base-content inline-flex items-center gap-1.5">${Icon("lucide:external-link", "text-xs")}${T(t, "driverLink")}</a>
    </div>`;
  }

  const sys = reads[REG.SYS_CFG1];
  const cut = sys != null && !isUnmapped(sys) ? cutName(sys) : null;
  const stages = stageState(reads);
  const done = stages.filter((s) => s.done).length;
  const isBooted = booted(reads[REG.WCPU_FW_CTRL]);
  const active = stages[Math.min(STAGES.length - 1, done)] || stages[0]; // the stage in progress (or last)
  const readout = sel >= 0 && page
    ? html`<span class="text-base-content/70">${addr(sel * 4)}</span> ${hex(page[sel])}`
    : html`<span class="text-base-content/70 uppercase tracking-wide">${T(t, active.key)}</span> <span class="text-base-content/70">${addr(active.reg)}</span> ${reads[active.reg] != null ? hex(reads[active.reg]) : "· · · ·"}`;

  return html`<${Fragment}>
    <div class="h-full flex flex-col gap-2.5 max-w-[440px] mx-auto w-full">
      <!-- header: chip identity + mode + control -->
      <div class="flex items-center gap-2 px-0.5 shrink-0">
        <span class="inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-full sf-raised sf-e1" data-cut>
          <span class="uppercase tracking-wide text-base-content/70">${T(t, "cut")}</span>
          <span class="tabular-nums ${cut ? "text-primary" : "text-base-content/70"}">${cut || "—"}</span>
        </span>
        <span class="flex-1"></span>
        <span class="inline-flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wider px-2 py-1 rounded-full ${mode === "demo" ? "text-primary bg-primary/10" : "text-success bg-success/10"}" data-mode=${mode}>
          <span class="w-1.5 h-1.5 rounded-full ${mode === "demo" ? "bg-primary" : "bg-success"}"></span>${T(t, mode === "demo" ? "demoTag" : "live")}
        </span>
        ${mode === "demo"
          ? html`<button data-replay aria-label=${T(t, "replay")} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(12); startDemo(); }}>${Icon("lucide:rotate-ccw", "text-lg")}</button>`
          : html`<button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/70 shrink-0" onClick=${disconnect}>${Icon("lucide:power", "text-lg")}</button>`}
      </div>

      <!-- register lattice (the low page, glow = value activity) -->
      <div class="flex-1 min-h-0 flex items-center justify-center">
        <div class="rounded-3xl sf-inset overflow-hidden p-1.5" style="width:100%;aspect-ratio:1;max-height:100%">
          <canvas ref=${latticeRef} onClick=${(e) => tapCell(e, e.currentTarget)} class="block w-full h-full cursor-pointer" role="img" aria-label=${T(t, "lattice")} data-lattice></canvas>
        </div>
      </div>

      <!-- bring-up stepper: six stages, light as reached -->
      <div class="flex flex-col gap-1.5 shrink-0">
        <div class="flex items-center gap-1" data-stages data-done=${done} role="list" aria-label=${T(t, "stageReg")}>
          ${stages.map((s, i) => html`<${Fragment} key=${s.id}>
            ${i ? html`<span class="h-px flex-1 ${s.done ? "bg-primary/60" : "bg-base-content/12"}"></span>` : null}
            <span role="listitem" data-stage=${s.id} data-done=${s.done ? "1" : "0"} title=${T(t, s.key)}
              class=${`w-3 h-3 rounded-full shrink-0 transition-colors ${s.done ? "bg-primary" : ""} ${s.id === active.id && !isBooted ? "ring-2 ring-primary/40" : ""}`}
              style=${s.done ? "" : "background:var(--sf-track-face)"}></span>
          <//>`)}
        </div>
        <div class="flex items-center justify-between gap-2 px-0.5">
          <span class="font-mono text-xs tabular-nums truncate" data-readout>${readout}</span>
          ${isBooted ? html`<span class="inline-flex items-center gap-1 text-xs text-primary shrink-0" data-booted>${Icon("lucide:check-circle-2", "text-sm")}${T(t, "bootedMsg")}</span>` : null}
        </div>
      </div>
    </div>
  </${Fragment}>`;
}
