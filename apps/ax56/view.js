// AX56 — a no-root Wi-Fi monitor for the RTL8852AU (ASUS USB-AX56). It drives the adapter through the native
// shell USB bridge in the APK (usb.switch/open/control/bulk) — WebUSB in desktop Chrome — mode-switching the
// adapter out of storage and, once the firmware is up, sniffing 802.11 to list access points and the clients
// talking to each. The Log tab shows every driver step so a run can be shared. The 802.11 capture pipeline
// (firmware download + monitor + RX parse) is being ported from the userspace driver; connect proves the
// bridge (switch + register read) and logs it meanwhile.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { shell } from "/_rt/shell.js";
import { VID, PID, REG, cutName, isUnmapped } from "/_rt/ax56.js";
import { buildFwdlOps, buildConfigOps, parseRx, parse80211, fromHex, CHANNELS, DEFAULT_CHANNEL, bringupAsset, channelMHz, channelBand } from "/_rt/ax56cap.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;
const nativeUsb = () => { try { return shell.has("usb.control") && shell.has("usb.switch"); } catch { return false; } };
const leU32 = (h) => { if (!h || h.length < 8) return 0xdeadbeef; const b = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16); return (b(0) | (b(1) << 8) | (b(2) << 16) | (b(3) << 24)) >>> 0; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VID_STORAGE = 0x0bda, PID_STORAGE = 0x1a2b;
const SIG_LO = -92, SIG_HI = -40;
const sigNorm = (d) => Math.max(0, Math.min(1, (d - SIG_LO) / (SIG_HI - SIG_LO)));

const $connected = atom(false), $usbOk = atom(true), $status = atom("idle"); // idle|switching|opening|scanning|error
const $aps = atom([]);       // [{ bssid, ssid, ch, signal, clients: [mac], seen }]
const $log = atom([]);       // [{ ms, line }]
const $open = atom("");      // bssid whose clients are expanded
const $ch = atom(DEFAULT_CHANNEL);   // the channel the radio is tuned to
const $chDrag = atom(0);             // channel under the finger mid-drag, 0 when not dragging

// Bring-ups ship gzipped — ~180 KB of repeated register writes squeezes to ~33 KB, and only the channel
// actually tuned to is ever fetched.
const fetchBlob = async (url) => {
  const r = await fetch(new URL(url, import.meta.url));
  if (!r.ok) throw new Error(url + " " + r.status);
  const raw = new Uint8Array(await r.arrayBuffer());
  // Whether a .gz arrives still compressed depends on how the host serves it — a Content-Encoding we do not
  // control would leave it already decoded. Decide from the gzip magic in the bytes, which is not a guess.
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return raw;
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
};

let dev = null, xport = null, t0 = 0, capturing = false;

function log(line) {
  if (!t0) t0 = Date.now();
  const l = $log.get();
  $log.set([...l.slice(-400), { ms: Date.now() - t0, line }]);
}

async function readReg32(a) {
  if (xport === "shell") {
    try { const r = await shell.call("usb.control", { reqType: 0xc0, request: 0x05, value: a & 0xffff, index: (a >> 16) & 0xff, length: 4 }); return leU32(r && r.data); }
    catch (e) { log("control 0x" + a.toString(16) + " error: " + (e && e.message)); return 0xdeadbeef; }
  }
  try {
    const r = await dev.controlTransferIn({ requestType: "vendor", recipient: "device", request: 0x05, value: a & 0xffff, index: (a >> 16) & 0xff }, 4);
    if (r.status === "ok" && r.data && r.data.byteLength >= 4) return r.data.getUint32(0, true) >>> 0;
  } catch { /* */ }
  return 0xdeadbeef;
}

async function connect() {
  buzz(12);
  $usbOk.set(true); $log.set([]); t0 = 0;
  const native = nativeUsb();
  log("connect via " + (native ? "native USB bridge" : "WebUSB"));
  try {
    if (native) {
      const list = async () => ((await shell.call("usb.list")) || {}).devices || [];
      const has = (ds, v, p) => ds.some((d) => d.vid === v && d.pid === p);
      let ds = await list();
      log("devices: " + ds.map((d) => d.vid.toString(16) + ":" + d.pid.toString(16)).join(", "));
      if (has(ds, VID_STORAGE, PID_STORAGE) && !has(ds, VID, PID)) {
        $status.set("switching"); log("storage 0bda:1a2b found — SCSI eject");
        await shell.call("usb.open", { vid: VID_STORAGE, pid: PID_STORAGE });
        await shell.call("usb.switch", { vid: VID_STORAGE, pid: PID_STORAGE });
        for (let i = 0; i < 12; i++) { await wait(400); ds = await list(); if (has(ds, VID, PID)) break; }
        log(has(ds, VID, PID) ? "re-enumerated as 0b05:1997" : "did not re-enumerate — replug and retry");
      }
      $status.set("opening"); log("open 0b05:1997");
      await shell.call("usb.open", { vid: VID, pid: PID });
      xport = "shell";
    } else {
      if (!usbSupported()) { $usbOk.set(false); log("no WebUSB in this browser"); return; }
      let d;
      try { d = await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: PID }] }); } catch { log("picker cancelled"); return; }
      await d.open(); if (d.configuration === null) await d.selectConfiguration(1); await d.claimInterface(0);
      dev = d; xport = "web"; log("opened over WebUSB");
    }
    $connected.set(true);
    const sys = await readReg32(REG.SYS_CFG1);
    log("SYS_CFG1 0x00F0 = 0x" + (sys >>> 0).toString(16).padStart(8, "0") + (isUnmapped(sys) ? " (no read)" : "  cut " + cutName(sys)));
    if (xport === "shell") runCapture();
    else { $status.set("scanning"); log("live 802.11 capture runs over the native bridge (app); WebUSB reads registers only"); }
  } catch (e) {
    $status.set("error"); $usbOk.set(false); log("connect failed: " + (e && e.message));
  }
}

// Full bring-up (firmware + monitor config) over the native bridge, then read 802.11 off EP 0x84 and aggregate
// beacons into access points and data frames into their clients. Native only — usb.batch is the shell bridge.
async function runCapture() {
  try {
    const ch = $ch.get();
    $status.set("opening"); log("bring-up: channel " + ch + " (" + channelMHz(ch) + " MHz, " + channelBand(ch) + "G)");
    const fw = new Uint8Array(await (await fetch(new URL("./assets/fw.bin", import.meta.url))).arrayBuffer());
    const br = await fetchBlob(bringupAsset(ch));
    // The chip's entry state decides two of the init writes, so read them rather than assume a cold adapter:
    // firmware already running has to be stopped before it will accept a new download, which is what lets a
    // channel change happen in-session instead of demanding a replug.
    const plat = await readReg32(0x88), wfc = await readReg32(REG.WCPU_FW_CTRL);
    const fwdl = buildFwdlOps(fw, { plat, wfc }), cfg = buildConfigOps(br);
    log("firmware download: " + fwdl.length + " ops");
    let r = await shell.call("usb.batch", { ops: fwdl });
    log("firmware download: fail=" + ((r && r.fail) || 0));
    const sts = await readReg32(REG.WCPU_FW_CTRL);
    const booted = ((sts >> 5) & 7) === 7;
    log("WCPU 0x1E0 = 0x" + (sts >>> 0).toString(16) + (booted ? "  STS=7 BOOTED" : "  not booted (replug cold and retry)"));
    // A warm chip cannot re-download firmware: the init writes assume a cold entry. Say so instead of
    // replaying a 21k-op config onto dead firmware and reporting an empty capture as if the air were quiet.
    if (!booted) { $status.set("error"); log("aborting — unplug and replug the adapter, then capture again"); return; }
    // monitor config in byte-bounded chunks
    log("monitor config: " + cfg.length + " ops");
    let chunk = [], bytes = 0, cfail = 0;
    const flush = async () => { if (!chunk.length) return; const rr = await shell.call("usb.batch", { ops: chunk }); cfail += (rr && rr.fail) || 0; chunk = []; bytes = 0; };
    for (const o of cfg) { chunk.push(o); bytes += (o.data ? o.data.length : 0) + 48; if (bytes > 180000) await flush(); }
    await flush();
    log("monitor config: fail=" + cfail + " — RX_FLTR 0x" + ((await readReg32(0xce20)) >>> 0).toString(16));
    $status.set("scanning"); log("reading 802.11 off EP 0x84");
    capturing = true;
    const aps = new Map(); const state = { sig: -100 };
    for (let round = 0; round < 120 && capturing; round++) {
      let rr = null; try { rr = await shell.call("usb.bulk", { ep: 0x84, length: 16384, timeout: 250 }); } catch { /* */ }
      if (rr && rr.data) {
        const rb = fromHex(rr.data);
        for (const { frame, sig } of parseRx(rb, rb.length, state)) {
          const m = parse80211(frame); if (!m) continue;
          const a = aps.get(m.bssid) || { bssid: m.bssid, ssid: "", ch: 0, signal: -100, clients: new Set() };
          if (m.kind === "ap") { if (m.ssid) a.ssid = m.ssid; if (m.ch) a.ch = m.ch; if (sig) a.signal = Math.max(a.signal, sig); }
          else a.clients.add(m.client);
          aps.set(m.bssid, a);
        }
        $aps.set([...aps.values()].filter((a) => a.ssid || a.clients.size)
          .map((a) => ({ bssid: a.bssid, ssid: a.ssid, ch: a.ch, signal: a.signal, clients: [...a.clients] }))
          .sort((x, y) => y.signal - x.signal));
      }
      await wait(40);
    }
    log("capture stopped — " + aps.size + " access points");
  } catch (e) { $status.set("error"); log("capture error: " + (e && e.message)); }
}

// Retuning is a whole new bring-up, not a register poke: each channel ships its own captured init, and the
// firmware download inside it needs a cold chip — so a mid-session switch can legitimately land on the
// replug message above rather than on frames.
async function setChannel(next) {
  if (next === $ch.get()) return;
  buzz(); $ch.set(next); $open.set(""); $aps.set([]);
  if (!$connected.get()) return;
  capturing = false; await wait(150);
  log("retuning to channel " + next);
  await runCapture();
}

function disconnect() {
  buzz(); capturing = false;
  try { dev?.close(); } catch { /* */ }
  dev = null; xport = null; $connected.set(false); $aps.set([]); $status.set("idle"); $open.set("");
  log("disconnected");
}

async function copyLog() {
  buzz();
  const text = $log.get().map((e) => (e.ms / 1000).toFixed(2).padStart(6) + "  " + e.line).join("\n");
  try { await navigator.clipboard.writeText(text); log("log copied"); }
  catch { log("copy failed — select and copy manually"); }
}

// The channel is printed, unlike the kit Slider which deliberately hides its value: that rule is about macros
// with no unit to carry, and a channel is the opposite — the number is the thing being chosen. Committing on
// `change` (release) rather than `input` keeps a drag from firing one full re-init per pixel.
function ChannelPicker({ t, value, drag }) {
  const shown = drag || value;
  const i = Math.max(0, CHANNELS.indexOf(shown));
  // One line, because the points tab is a fit screen: a stacked readout cost 6px more than the 360×340 floor
  // has to give, and the dock ate the bottom of the list.
  return html`<div class="w-full flex items-center gap-2.5" data-chpick>
    <span class="shrink-0 w-9 text-right font-mono text-lg font-semibold tabular-nums leading-none" data-ch-value>${shown}</span>
    <input type="range" min="0" max=${CHANNELS.length - 1} step="1" value=${i} data-ch
      aria-label=${T(t, "ch")} aria-valuetext=${shown + " · " + channelMHz(shown) + " MHz"}
      onInput=${(e) => $chDrag.set(CHANNELS[Number(e.target.value)])}
      onChange=${(e) => { $chDrag.set(0); setChannel(CHANNELS[Number(e.target.value)]); }}
      class="range range-sm range-primary min-w-0 flex-1" />
    <span class="shrink-0 w-[3.4rem] text-right font-mono text-[0.6rem] text-base-content/70 tabular-nums leading-none">${channelMHz(shown)}·${channelBand(shown)}G</span>
  </div>`;
}

// =================== POINTS ===================
// A per-AP identity colour, stable from the BSSID, shared by its channel-graph bell and its list dot.
const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb7185", "#2dd4bf"];
const apColor = (bssid) => PALETTE[(parseInt(bssid.slice(-2), 16) || 0) % PALETTE.length];
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const SEC = {
  open: { icon: "lucide:lock-open", cls: "text-warning" }, wep: { icon: "lucide:lock", cls: "text-warning" },
  wpa: { icon: "lucide:lock", cls: "text-base-content/70" }, wpa2: { icon: "lucide:lock", cls: "text-base-content/70" },
  wpa3: { icon: "lucide:shield-check", cls: "text-success" },
};
const $sort = atom("signal"); // signal | ch | clients
function sortAps(aps, by) {
  const a = [...aps];
  if (by === "ch") a.sort((x, y) => x.ch - y.ch || y.signal - x.signal);
  else if (by === "clients") a.sort((x, y) => y.clients.length - x.clients.length || y.signal - x.signal);
  else a.sort((x, y) => y.signal - x.signal);
  return a;
}

// ---- gate / headless: a populated screen the taste + e2e gates can read ----
const MOCK = [
  { bssid: "c4:6e:1f:af:de:9c", ssid: "Pioneers", ch: 6, signal: -49, security: "wpa2", band: "2.4", clients: ["a4:83:e7:2b:11:07", "3c:22:fb:9a:44:e1", "f0:99:bf:12:8d:31"] },
  { bssid: "14:cc:20:33:23:88", ssid: "Monako", ch: 6, signal: -63, security: "wpa3", band: "2.4", clients: ["b8:27:eb:6d:22:aa"] },
  { bssid: "9a:25:4a:2d:85:57", ssid: "visit", ch: 1, signal: -71, security: "wpa2", band: "2.4", clients: [] },
  { bssid: "5a:54:45:d5:7d:3c", ssid: "ZTE_D57D3C", ch: 11, signal: -76, security: "wpa2", band: "2.4", clients: ["e4:5f:01:88:9c:12"] },
  { bssid: "e8:9f:80:14:2a:06", ssid: "", ch: 3, signal: -80, security: "wpa2", band: "2.4", clients: [] },
  { bssid: "d4:6a:6a:77:1c:9b", ssid: "GuestWiFi", ch: 9, signal: -84, security: "open", band: "2.4", clients: [] },
];
function seedDemo() {
  $connected.set(true); $status.set("scanning"); $aps.set(MOCK);
  t0 = 0; $log.set([]);
  ["connect via native USB bridge", "devices: 5e3:764, b05:1997", "open 0b05:1997",
    "firmware download: 246 ops  fail=0", "WCPU 0x1E0 = 0xe2  STS=7 BOOTED",
    "monitor config: fail=0  RX_FLTR 0x3174438", "reading 802.11 off EP 0x84", "6 access points, 5 clients"]
    .forEach((l, i) => $log.set([...$log.get(), { ms: 80 + i * 150, line: l }]));
}

function Bars({ level, label }) {
  const lit = Math.round(level * 4);
  return html`<div class="flex items-end gap-[3px] h-5 shrink-0" role="img" aria-label=${label || ""}>
    ${[0, 1, 2, 3].map((i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : ""}`} style=${`height:${40 + i * 20}%${i < lit ? "" : ";background:var(--sf-track-face)"}`}></span>`)}
  </div>`;
}
const Dot = ({ color }) => html`<span class="w-2 h-2 rounded-full shrink-0" style=${`background:${color}`}></span>`;

// The channel graph (2.4 GHz): one overlapping bell per AP, x = channel, height = signal, colour = its identity.
function drawChannels(cv, aps, sel, tuned) {
  let c; try { c = cv.getContext ? cv.getContext("2d") : null; } catch { c = null; }
  const W = cv.width | 0, H = cv.height | 0; if (!c || !W || !H) return;
  const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
  const light = typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light");
  const ink = light ? "20,20,26" : "236,236,238";
  c.clearRect(0, 0, W, H);
  const padL = 6 * dpr, padR = 6 * dpr, padT = 12 * dpr, padB = 15 * dpr;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  // The axis follows the band the radio is tuned to. Without this a 5 GHz capture filled the list and left
  // the graph empty, the app contradicting itself on one screen. Channel number is linear in frequency in
  // both bands, so the same mapping works for each; only the span and the tick labels change.
  const band5 = tuned > 14;
  const lo = band5 ? 36 : 1, hi = band5 ? 165 : 13, span = hi - lo;
  const ticks = band5 ? [36, 64, 100, 132, 165] : [1, 3, 5, 7, 9, 11, 13];
  const xCh = (ch) => padL + (Math.max(lo, Math.min(hi, ch)) - lo) / span * plotW;
  c.strokeStyle = `rgba(${ink},0.1)`; c.lineWidth = dpr; c.beginPath(); c.moveTo(padL, base); c.lineTo(W - padR, base); c.stroke();
  c.fillStyle = `rgba(${ink},0.38)`; c.font = `${8.5 * dpr}px ui-monospace, monospace`; c.textAlign = "center"; c.textBaseline = "top";
  for (const ch of ticks) c.fillText(String(ch), xCh(ch), base + 3 * dpr);
  const width = (2.1 / span) * plotW;   // a 20 MHz channel is ~4 channel numbers wide in both bands
  for (const a of aps.filter((x) => (band5 ? x.ch >= 36 : x.ch >= 1 && x.ch <= 14))) {
    const cx = xCh(a.ch), norm = Math.max(0.1, Math.min(1, (a.signal + 92) / 52)), hgt = norm * plotH;
    const col = apColor(a.bssid), on = a.bssid === sel;
    c.beginPath(); c.moveTo(cx - width * 2.2, base);
    for (let dx = -width * 2.2; dx <= width * 2.2; dx += 2 * dpr) c.lineTo(cx + dx, base - hgt * Math.exp(-(dx * dx) / (2 * width * width)));
    c.lineTo(cx + width * 2.2, base); c.closePath();
    c.fillStyle = hexA(col, on ? 0.4 : 0.16); c.fill();
    c.strokeStyle = hexA(col, on ? 1 : 0.72); c.lineWidth = (on ? 2 : 1.3) * dpr; c.stroke();
    c.fillStyle = hexA(col, on ? 1 : 0.85); c.font = `${9 * dpr}px ui-monospace, monospace`; c.textBaseline = "alphabetic";
    c.textAlign = cx < W * 0.13 ? "left" : cx > W * 0.87 ? "right" : "center"; // keep edge labels inside the box
    c.fillText((a.ssid || "·").slice(0, 9), cx, base - hgt - 3 * dpr);
  }
}
function useGraph(aps, sel, theme, tuned) {
  const ref = useRef(null);
  const fit = (cv) => { const box = cv.parentElement; if (!box) return false; const b = box.getBoundingClientRect(), w = Math.round(b.width), h = Math.round(b.height); if (!w || !h) return false; cv.style.width = `${w}px`; cv.style.height = `${h}px`; const d = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1); cv.width = w * d; cv.height = h * d; return true; };
  useEffect(() => { const cv = ref.current; if (!cv || !cv.parentElement) return; const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (fit(cv)) drawChannels(cv, aps, sel, tuned); }) : null; ro && ro.observe(cv.parentElement); return () => ro && ro.disconnect(); }, []);
  useEffect(() => { const cv = ref.current; if (cv && fit(cv)) drawChannels(cv, aps, sel, tuned); }, [aps, sel, theme, tuned]);
  return ref;
}

export function pointsView({ S }) {
  const t = useStore(S.t), theme = useStore(S.theme);
  const connected = useStore($connected), usbOk = useStore($usbOk), status = useStore($status);
  const rawAps = useStore($aps), open = useStore($open), sort = useStore($sort), ch = useStore($ch), chDrag = useStore($chDrag);
  const aps = sortAps(rawAps, sort);
  const graphRef = useGraph(rawAps, open, theme, chDrag || ch);

  useEffect(() => { if (gate) seedDemo(); }, []);

  if (!connected) {
    const supported = nativeUsb() || (usbSupported() && usbOk);
    return html`<div class="h-full flex flex-col items-center justify-center text-center gap-5 px-4 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:wifi", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed text-sm">${T(t, "connectBody")}</p>
      ${supported
        ? html`<${Fragment}>
            <${ChannelPicker} t=${t} value=${ch} drag=${chDrag} />
            <button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>
          </${Fragment}>`
        : html`<div class="alert bg-warning/12 text-warning rounded-2xl sf-e2 text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  return html`<${Fragment}>
    <div class="h-full flex flex-col gap-2.5 max-w-[440px] mx-auto w-full">
      <div class="flex items-center gap-2 px-0.5 shrink-0">
        <span class="inline-flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wider px-2 py-1 rounded-full text-primary bg-primary/10" data-status=${status}>
          <span class="w-1.5 h-1.5 rounded-full bg-primary ${status === "scanning" ? "animate-pulse" : ""}"></span>${T(t, "st_" + status)}
        </span>
        <span class="font-mono text-xs tabular-nums text-base-content/70" data-count>${aps.length}</span>
        <span class="flex-1"></span>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/70 shrink-0" onClick=${disconnect}>${Icon("lucide:power", "text-lg")}</button>
      </div>

      <!-- channel graph: overlapping bells, 2.4 GHz -->
      <div class="shrink-0 rounded-2xl sf-inset overflow-hidden p-1" style="height:clamp(88px,22vh,132px)">
        <canvas ref=${graphRef} class="block w-full h-full" role="img" aria-label=${T(t, "chart")} data-graph></canvas>
      </div>

      <div class="shrink-0"><${ChannelPicker} t=${t} value=${ch} drag=${chDrag} /></div>

      <div class="shrink-0"><${Segmented} attr="data-sort" size="sm" items=${[{ id: "signal", label: T(t, "srtSignal") }, { id: "ch", label: T(t, "srtCh") }, { id: "clients", label: T(t, "srtClients") }]} value=${sort} onChange=${(v) => { buzz(); $sort.set(v); }} /></div>

      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 -mx-0.5 px-0.5" data-aps>
        ${aps.length ? aps.map((a) => {
          const isOpen = open === a.bssid, sec = SEC[a.security] || SEC.wpa2;
          return html`<div key=${a.bssid} data-ap=${a.bssid} class="rounded-2xl sf-raised sf-e2">
            <button class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left" aria-expanded=${isOpen} onClick=${() => { buzz(6); $open.set(isOpen ? "" : a.bssid); }}>
              <${Dot} color=${apColor(a.bssid)} />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5"><span class=${`text-sm font-medium truncate ${a.ssid ? "" : "text-base-content/70 italic"}`}>${a.ssid || T(t, "hidden")}</span>${Icon(sec.icon, sec.cls + " text-xs shrink-0")}</div>
                <div class="font-mono text-[0.66rem] text-base-content/70 tabular-nums truncate">${a.bssid} · ${T(t, "ch")} ${a.ch} · ${a.band === "5" ? "5" : "2.4"}G</div>
              </div>
              <span class="font-mono text-[0.66rem] tabular-nums text-base-content/70 shrink-0">${a.signal}</span>
              <${Bars} level=${sigNorm(a.signal)} label=${a.signal + " dBm"} />
              <span class="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-base-content/70 shrink-0 w-8 justify-end" data-clients>${Icon("lucide:users", "text-sm")}${a.clients.length}</span>
            </button>
            ${isOpen ? html`<div class="px-3.5 pb-2.5 pt-0.5 flex flex-col gap-1 border-t border-base-content/10" data-client-list>
              ${a.clients.length ? a.clients.map((c) => html`<div key=${c} class="font-mono text-[0.68rem] tabular-nums text-base-content/70 flex items-center gap-2">${Icon("lucide:smartphone", "text-xs opacity-70")}${c}</div>`)
                : html`<div class="text-xs text-base-content/70 py-1">${T(t, "noClients")}</div>`}
            </div>` : null}
          </div>`;
        }) : html`<div class="flex-1 flex flex-col items-center justify-center text-center text-base-content/70 gap-2 px-6">
          ${Icon("lucide:radar", "text-3xl animate-pulse")}<span class="text-sm">${T(t, "scanningEmpty")}</span>
        </div>`}
      </div>
    </div>
  </${Fragment}>`;
}

// =================== LOG ===================
export function logView({ S }) {
  const t = useStore(S.t);
  const lines = useStore($log);

  useEffect(() => { if (gate && $log.get().length === 0) seedDemo(); }, []);

  return html`<div class="flex flex-col gap-2.5 max-w-[560px] mx-auto w-full pb-4">
    <div class="flex items-center gap-2 px-0.5">
      <span class="text-xs uppercase tracking-wide text-base-content/70">${T(t, "tabLog")}</span>
      <span class="font-mono text-xs tabular-nums text-base-content/70" data-logcount>${lines.length}</span>
      <span class="flex-1"></span>
      <button data-copy class="btn btn-ghost btn-sm rounded-xl gap-1.5 text-base-content/70" onClick=${copyLog}>${Icon("lucide:copy", "text-sm")}${T(t, "copy")}</button>
      <button data-clear class="btn btn-ghost btn-sm rounded-xl gap-1.5 text-base-content/70" onClick=${() => { buzz(); $log.set([]); }}>${Icon("lucide:eraser", "text-sm")}${T(t, "clear")}</button>
    </div>
    <div class="rounded-2xl sf-inset p-3 font-mono text-[0.7rem] leading-relaxed flex flex-col gap-0.5" data-log>
      ${lines.length ? lines.map((e, i) => html`<div key=${i} class="flex gap-2.5">
        <span class="text-base-content/70 tabular-nums shrink-0 w-12 text-right">${(e.ms / 1000).toFixed(2)}</span>
        <span class="text-base-content/85 break-all">${e.line}</span>
      </div>`) : html`<div class="text-base-content/70 py-4 text-center">${T(t, "logEmpty")}</div>`}
    </div>
  </div>`;
}
