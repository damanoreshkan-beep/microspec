// AX56 — a no-root Wi-Fi monitor for the RTL8852AU (ASUS USB-AX56). It drives the adapter through the native
// shell USB bridge in the APK (usb.switch/open/control/bulk) — WebUSB in desktop Chrome — mode-switching the
// adapter out of storage and, once the firmware is up, sniffing 802.11 to list access points and the clients
// talking to each. The Log tab shows every driver step so a run can be shared. The 802.11 capture pipeline
// (firmware download + monitor + RX parse) is being ported from the userspace driver; connect proves the
// bridge (switch + register read) and logs it meanwhile.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { shell } from "/_rt/shell.js";
import { VID, PID, REG, cutName, isUnmapped } from "/_rt/ax56.js";

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

let dev = null, xport = null, t0 = 0;

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
    $status.set("scanning");
    // 802.11 capture (firmware download + monitor + RX) is the next build — see the Log tab.
    log("monitor capture: porting the firmware bring-up over usb.bulk — access points will populate here");
  } catch (e) {
    $status.set("error"); $usbOk.set(false); log("connect failed: " + (e && e.message));
  }
}

function disconnect() {
  buzz();
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

// ---- gate / headless: a populated screen the taste + e2e gates can read ----
const MOCK = [
  { bssid: "c4:6e:1f:af:de:9c", ssid: "Pioneers", ch: 6, signal: -59, clients: ["a4:83:e7:2b:11:07", "3c:22:fb:9a:44:e1"] },
  { bssid: "14:cc:20:33:23:88", ssid: "Monako", ch: 6, signal: -72, clients: ["b8:27:eb:6d:22:aa"] },
  { bssid: "9a:25:4a:2d:85:57", ssid: "visit", ch: 1, signal: -77, clients: [] },
  { bssid: "5a:54:45:d5:7d:3c", ssid: "ZTE_D57D3C", ch: 1, signal: -83, clients: ["e4:5f:01:88:9c:12"] },
];
function seedDemo() {
  $connected.set(true); $status.set("scanning"); $aps.set(MOCK);
  t0 = 0; $log.set([]);
  ["connect via native USB bridge", "storage 0bda:1a2b found — SCSI eject", "re-enumerated as 0b05:1997",
   "open 0b05:1997", "SYS_CFG1 0x00F0 = 0x0c492537  cut C", "monitor up — 4 access points, 3 clients"]
    .forEach((l, i) => $log.set([...$log.get(), { ms: 120 + i * 180, line: l }]));
}

// =================== POINTS ===================
function Bars({ level, label }) {
  const lit = Math.round(level * 4);
  return html`<div class="flex items-end gap-[3px] h-5 shrink-0" role="img" aria-label=${label || ""}>
    ${[0, 1, 2, 3].map((i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : ""}`} style=${`height:${40 + i * 20}%${i < lit ? "" : ";background:var(--sf-track-face)"}`}></span>`)}
  </div>`;
}

export function pointsView({ S }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk), status = useStore($status);
  const aps = useStore($aps), open = useStore($open);

  useEffect(() => { if (gate) seedDemo(); }, []);

  if (!connected) {
    const supported = nativeUsb() || (usbSupported() && usbOk);
    return html`<div class="h-full flex flex-col items-center justify-center text-center gap-5 px-4 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:wifi", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed text-sm">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
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

      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 -mx-0.5 px-0.5" data-aps>
        ${aps.length ? aps.map((a) => {
          const isOpen = open === a.bssid;
          return html`<div key=${a.bssid} data-ap=${a.bssid} class="rounded-2xl sf-raised sf-e2">
            <button class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left" aria-expanded=${isOpen} onClick=${() => { buzz(6); $open.set(isOpen ? "" : a.bssid); }}>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">${a.ssid || T(t, "hidden")}</div>
                <div class="font-mono text-[0.68rem] text-base-content/70 tabular-nums truncate">${a.bssid} · ${T(t, "ch")} ${a.ch}</div>
              </div>
              <span class="font-mono text-[0.68rem] tabular-nums text-base-content/70 shrink-0">${a.signal}</span>
              <${Bars} level=${sigNorm(a.signal)} label=${a.signal + " dBm"} />
              <span class="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-base-content/70 shrink-0 w-9 justify-end" data-clients>${Icon("lucide:users", "text-sm")}${a.clients.length}</span>
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
