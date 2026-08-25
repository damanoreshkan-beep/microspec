// ax56chat — off-grid chat over the meshchat carrier. In a browser this runs a LOCAL demo: a real
// mesh session (encrypt -> fragment -> loopback -> reassemble -> decrypt) plus a demo peer, so the protocol
// and crypto are exercised for real; the RF carrier (beacon+txdesc over the shell usb.batch bridge, driven by
// the ax56 adapter) plugs in where the loopback bus is. Under the gate a deterministic conversation is seeded.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { createMeshSession, loopbackBus } from "/_rt/mesh.js";
import { newNodeId } from "/_rt/meshchat.js";
import { createRadio, carrierFromRadio } from "/_rt/radio.js";
import { createNeighbourhood } from "/_rt/meshscan.js";
import { shell } from "/_rt/shell.js";
import * as meshcrypto from "/_rt/meshcrypto.js";

// Real over-air chat when the native shell + adapter are present; a loopback demo otherwise (browser).
const hasRf = () => { try { return !!(shell && shell.has && shell.has("usb.bulk")); } catch { return false; } };

const Icon = (i, c) => html`<iconify-icon icon=${i} class=${c || ""}></iconify-icon>`;
const short = (src) => (src >>> 0).toString(16).padStart(8, "0").slice(-4);

const $joined = atom(false), $status = atom("off");   // off | joining | on
const $room = atom(""), $pass = atom(""), $fp = atom("");
const $msgs = atom([]), $peers = atom([]), $draft = atom(""), $rf = atom(false), $log = atom([]);

let session = null, bot = null, me = 0;

// One shared radio for the whole app — the chat carrier and the Nearby/Engineer surfaces all drive the single
// adapter through it (it attaches once and auto-detaches when the last surface lets go). $channel is the target
// monitor channel; only ch6 ships a bring-up blob today (5 GHz is a captured-blob away), so the Engineer picker
// offers the rest as coming-soon.
let radio = null;
const $channel = atom(6);
function getRadio() { if (!radio) radio = createRadio({ shell, channel: $channel.get(), onLog: log }); return radio; }

const LS_KEY = "ax56chat:prefs";
function log(line) { $log.set([...$log.get().slice(-200), { ms: Date.now(), line }]); }
function loadPrefs() { try { const p = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) || "{}"); if (p.room) $room.set(p.room); if (p.pass) $pass.set(p.pass); } catch { /* private mode / blocked */ } }
function savePrefs() { try { localStorage.setItem(LS_KEY, JSON.stringify({ room: $room.get(), pass: $pass.get() })); } catch { /* */ } }

function mirror(list) {
  $msgs.set(list.map((m) => ({ ...m, tag: m.mine ? null : short(m.src) })));
}

async function join() {
  const room = $room.get().trim(), pass = $pass.get();
  if (!room || !pass) return;
  savePrefs();
  $status.set("joining"); log(`joining room "${room}"`);
  me = newNodeId();
  try { $fp.set(await meshcrypto.fingerprint(pass, room)); } catch { $fp.set(""); }
  const rf = hasRf(); $rf.set(rf);
  log(rf ? "adapter detected — going over the air" : "no adapter here — loopback demo (real chat needs the app + a connected AX56)");
  const bus = rf ? null : loopbackBus();
  const carrier = rf ? carrierFromRadio(getRadio(), { src: me }) : bus.carrier();
  session = createMeshSession({ atom, carrier, crypto: meshcrypto, room, passphrase: pass, self: me });
  session.$messages.subscribe(mirror);
  session.$peers.subscribe((v) => $peers.set(v));
  await session.connect();
  if (bus) {  // demo peer only on the loopback bus (browser); over RF the peers are real devices
    bot = createMeshSession({ atom, carrier: bus.carrier(), crypto: meshcrypto, room, passphrase: pass, self: 0x5ca1ab1e });
    await bot.connect();
    setTimeout(() => { try { bot && bot.send("on the mesh — no towers, just us. demo peer here."); } catch { /* */ } }, 500);
  }
  $joined.set(true); $status.set("on"); log(`on air — key ${$fp.get() || "?"}`);
}

async function send() {
  const t = $draft.get().trim();
  if (!t) return;
  $draft.set("");
  if (session) { try { await session.send(t); } catch { /* */ } }
  else mirror([...$msgs.get(), { id: `m${Date.now()}`, src: me, text: t, mine: true }]); // gate fallback
}

function leave() {
  try { session && session.disconnect(); bot && bot.disconnect(); } catch { /* */ }
  session = bot = null;
  $joined.set(false); $status.set("off"); $msgs.set([]); $peers.set([]); $draft.set("");
  log("left the room");
}

// ---- gate / headless: a deterministic populated room for axe / overflow / shots ----
function seedDemo() {
  me = 0x00c0ffee;
  $room.set("field"); $fp.set("a1b2c3"); $joined.set(true); $status.set("on");
  $peers.set([0x5ca1ab1e, 0x77aa31d0]);
  $log.set([{ ms: 0, line: 'joining room "field"' }, { ms: 0, line: "no adapter here — loopback demo" }, { ms: 0, line: "on air — key a1b2c3" }]);
  mirror([
    { id: "1", src: 0x5ca1ab1e, text: "anyone copy? no signal out here at all", mine: false },
    { id: "2", src: me, text: "loud and clear — two ridges over", mine: true },
    { id: "3", src: 0x77aa31d0, text: "trail forks at the saddle, taking the north line", mine: false },
    { id: "4", src: me, text: "copy that, catch you at the col", mine: true },
  ]);
}

function Composer({ t }) {
  const draft = useStore($draft);
  return html`<form class="shrink-0 flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); send(); }}>
    <input value=${draft} onInput=${(e) => $draft.set(e.target.value)} data-draft
      aria-label=${T(t, "composerPh")} placeholder=${T(t, "composerPh")}
      class="input input-bordered flex-1 min-w-0 rounded-2xl" />
    <button type="submit" data-send aria-label=${T(t, "send")}
      class="btn btn-primary btn-circle shrink-0" disabled=${!draft.trim()}>${Icon("lucide:send-horizontal")}</button>
  </form>`;
}

export function roomView({ S }) {
  const t = useStore(S.t);
  const joined = useStore($joined), status = useStore($status);
  const room = useStore($room), pass = useStore($pass), fp = useStore($fp);
  const msgs = useStore($msgs), peers = useStore($peers), rf = useStore($rf);
  const listRef = useRef(null);

  useEffect(() => { if (gate) seedDemo(); else loadPrefs(); }, []);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  if (!joined) {
    return html`<div class="h-full flex flex-col items-center justify-center text-center gap-4 px-4 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:messages-square", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "joinTitle")}</h2>
      <p class="text-muted leading-relaxed text-sm">${T(t, "joinBody")}</p>
      <form class="w-full flex flex-col gap-2.5" onSubmit=${(e) => { e.preventDefault(); join(); }}>
        <input value=${room} onInput=${(e) => $room.set(e.target.value)} data-room
          aria-label=${T(t, "roomLabel")} placeholder=${T(t, "roomPh")} class="input input-bordered w-full rounded-2xl" />
        <input type="password" value=${pass} onInput=${(e) => $pass.set(e.target.value)} data-pass
          aria-label=${T(t, "passLabel")} placeholder=${T(t, "passPh")} class="input input-bordered w-full rounded-2xl" />
        <button type="submit" data-join class="btn btn-primary btn-lg rounded-2xl gap-2" disabled=${status === "joining" || !room.trim() || !pass}>
          ${Icon("lucide:radio")}${T(t, status === "joining" ? "stJoining" : "joinBtn")}
        </button>
      </form>
    </div>`;
  }

  return html`<div class="h-full flex flex-col gap-2.5 max-w-[560px] mx-auto w-full pb-2">
    <div class="shrink-0 flex items-center gap-2 px-1">
      <span class="inline-flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wider px-2 py-1 rounded-full text-primary bg-primary/10" data-status=${status}>
        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>${T(t, "stOnAir")}
      </span>
      <span class="font-medium text-sm truncate">${room}</span>
      ${fp ? html`<span class="font-mono text-[0.6rem] text-muted">${T(t, "fpLabel")} ${fp}</span>` : null}
      <span class="flex-1"></span>
      <span class="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted" data-peers>${Icon("lucide:users", "text-sm")}${peers.length}</span>
      <button data-leave aria-label=${T(t, "leave")} class="btn btn-circle btn-ghost btn-sm text-muted shrink-0" onClick=${leave}>${Icon("lucide:log-out", "text-lg")}</button>
    </div>

    <div ref=${listRef} class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-1" data-list>
      ${msgs.length ? msgs.map((m) => html`<div key=${m.id} data-msg class=${`flex ${m.mine ? "justify-end" : "justify-start"}`}>
        <div class=${`max-w-[78%] rounded-2xl px-3 py-2 ${m.mine ? "bg-base-300" : "bg-base-200"}`}>
          ${m.mine ? null : html`<div class="font-mono text-[0.6rem] text-muted mb-0.5">${m.tag}</div>`}
          <div class="text-sm leading-snug break-words">${m.text}</div>
        </div>
      </div>`) : html`<div class="flex-1 flex flex-col items-center justify-center text-center text-muted gap-2 px-6">
        ${Icon("lucide:radio", "text-3xl animate-pulse")}<span class="text-sm">${T(t, "emptyMsgs")}</span>
      </div>`}
    </div>

    ${rf ? null : html`<div class="shrink-0 text-[0.6rem] text-muted text-center px-2">${T(t, "demoNote")}</div>`}
    <${Composer} t=${t} />
  </div>`;
}

// Log tab — driver / session steps (connect, adapter attach, on-air), copyable for a bug report.
export function logView({ S }) {
  const t = useStore(S.t);
  const lines = useStore($log);
  const copy = async () => { try { await navigator.clipboard.writeText(lines.map((e) => e.line).join("\n")); } catch { /* */ } };
  return html`<div class="flex flex-col gap-2.5 max-w-[560px] mx-auto w-full pb-4">
    <div class="flex items-center gap-2 px-0.5">
      <span class="text-xs uppercase tracking-wide text-muted">${T(t, "tabLog")}</span>
      <span class="font-mono text-xs tabular-nums text-muted" data-logcount>${lines.length}</span>
      <span class="flex-1"></span>
      <button data-copy class="btn btn-ghost btn-sm rounded-xl gap-1.5 text-muted" onClick=${copy}>${Icon("lucide:copy", "text-sm")}${T(t, "copy")}</button>
      <button data-clear class="btn btn-ghost btn-sm rounded-xl gap-1.5 text-muted" onClick=${() => $log.set([])}>${Icon("lucide:eraser", "text-sm")}${T(t, "clear")}</button>
    </div>
    <div class="rounded-2xl sf-inset p-3 font-mono text-[0.7rem] leading-relaxed flex flex-col gap-0.5" data-log>
      ${lines.length ? lines.map((e, i) => html`<div key=${i} class="break-all">${e.line}</div>`)
        : html`<div class="text-muted py-4 text-center">${T(t, "logEmpty")}</div>`}
    </div>
  </div>`;
}

// ---- Nearby: the passive 802.11 neighbourhood as a signal scope. Monitor RX hears every beacon + frame; we
// place each device by SIGNAL (rings are dBm, never metres — RF honesty), routers vs clients by colour. ----
const $nearby = atom([]), $scanning = atom(false), $sel = atom(null);
// One shared neighbourhood fed by ONE onUnits subscription, ref-counted so Nearby and Engineer can both read it
// without double-counting frames. holdScan() attaches the radio + starts folding units in on the first holder,
// and releases (auto-detaching the radio) when the last holder unmounts.
let hood = null, hoodOff = null, hoodRefs = 0;
function holdScan() {
  if (!hood) hood = createNeighbourhood();
  hoodRefs++;
  if (hoodRefs === 1 && hasRf()) {
    const r = getRadio();
    $scanning.set(true);
    r.attach().then((ok) => $scanning.set(!!ok));
    hoodOff = r.onUnits((u) => hood.add(u, Date.now()));
  }
  return () => { if (--hoodRefs <= 0) { hoodRefs = 0; if (hoodOff) { hoodOff(); hoodOff = null; } $scanning.set(false); } };
}
function seedNearbyDemo() {
  $scanning.set(true);
  $nearby.set([
    { mac: "a4:2b:8c:10:44:01", kind: "ap", ssid: "Home-5G", channel: 6, rssi: -37, count: 214 },
    { mac: "e8:9f:80:2a:17:c2", kind: "ap", ssid: "TP-LINK_2C", channel: 6, rssi: -58, count: 96 },
    { mac: "f0:9f:c2:00:31:7a", kind: "ap", ssid: "", channel: 11, rssi: -72, count: 14 },
    { mac: "b8:27:eb:44:9a:10", kind: "client", ssid: null, channel: null, rssi: -46, count: 41 },
    { mac: "3c:5a:b4:71:02:88", kind: "client", ssid: null, channel: null, rssi: -64, count: 12 },
    { mac: "d4:6a:6a:12:0f:33", kind: "client", ssid: null, channel: null, rssi: -83, count: 5 },
  ]);
}

// signal (dBm) -> radius: strong near the centre, weak at the rim. Angle is a STABLE hash of the MAC — a fixed
// seat on the scope, never a bearing (we have no direction). bars: a 0-4 strength read for the detail card.
const rssiRadius = (dBm) => { const d = dBm == null ? -92 : dBm; const t = Math.max(0, Math.min(1, (-32 - d) / 60)); return 13 + t * 82; };
const macAngle = (mac) => { let h = 2166136261; for (let i = 0; i < mac.length; i++) { h ^= mac.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h % 3600) / 3600 * Math.PI * 2; };
const sigBars = (dBm) => dBm == null ? 0 : dBm >= -52 ? 4 : dBm >= -64 ? 3 : dBm >= -76 ? 2 : 1;

export function nearbyView({ S }) {
  const t = useStore(S.t);
  const list = useStore($nearby), scanning = useStore($scanning), sel = useStore($sel), ch = useStore($channel);
  useEffect(() => {
    if (gate || !hasRf()) { seedNearbyDemo(); return; }
    const release = holdScan();
    const tick = setInterval(() => $nearby.set(hood.list(Date.now())), 500);
    return () => { clearInterval(tick); release(); };
  }, []);
  const aps = list.filter((d) => d.kind === "ap").length, clients = list.length - aps;

  return html`<div class="h-full flex flex-col gap-2 max-w-[560px] mx-auto w-full pb-2">
    <div class="shrink-0 flex items-center gap-2 px-1">
      <span class="inline-flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wider px-2 py-1 rounded-full text-primary bg-primary/10">
        <span class="w-1.5 h-1.5 rounded-full bg-primary ${scanning ? "animate-pulse" : ""}"></span>${T(t, "nearbyScan")} ${T(t, "chShort")}${ch}
      </span>
      <span class="flex-1"></span>
      <span class="font-mono text-xs tabular-nums text-muted">${aps} ${T(t, "apsCount")} · ${clients} ${T(t, "clientsCount")}</span>
    </div>

    <div class="shrink-0 w-full h-[42vh] max-h-[380px] grid place-items-center" data-scope>
      <svg viewBox="0 0 200 200" class="w-full h-full" onClick=${() => $sel.set(null)}>
        ${[[-45], [-62], [-80]].map(([dBm]) => { const r = rssiRadius(dBm); return html`<g class="text-muted" opacity="0.28">
          <circle cx="100" cy="100" r=${r} fill="none" stroke="currentColor" stroke-width="0.6" />
          <text x="100" y=${100 - r + 3.4} text-anchor="middle" fill="currentColor" font-size="4.6" font-family="monospace">${dBm}</text>
        </g>`; })}
        ${scanning ? html`<circle cx="100" cy="100" fill="none" class="text-primary" stroke="currentColor" stroke-width="0.8">
          <animate attributeName="r" values="6;92" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0" dur="3.4s" repeatCount="indefinite" />
        </circle>` : null}
        <circle cx="100" cy="100" r="3" class="text-primary" fill="currentColor" />
        ${list.map((d) => { const r = rssiRadius(d.rssi), a = macAngle(d.mac), x = 100 + r * Math.cos(a), y = 100 + r * Math.sin(a);
          const ap = d.kind === "ap", on = sel === d.mac;
          return html`<g key=${d.mac} class=${`cursor-pointer ${ap ? "text-primary" : "text-muted"}`}
            onClick=${(e) => { e.stopPropagation(); $sel.set(on ? null : d.mac); }}>
            ${on ? html`<circle cx=${x} cy=${y} r=${ap ? 9 : 7} fill="none" stroke="currentColor" stroke-width="1" opacity="0.6" />` : null}
            <circle cx=${x} cy=${y} r=${ap ? 5 : 3.2} fill="currentColor" />
          </g>`; })}
      </svg>
    </div>

    ${list.length ? html`<div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-0.5" data-list>
      ${list.map((d) => html`<button key=${d.mac} data-dev=${d.mac} onClick=${() => $sel.set(sel === d.mac ? null : d.mac)}
        class=${`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${sel === d.mac ? "bg-base-300" : "bg-base-200"}`}>
        ${Icon(d.kind === "ap" ? "lucide:router" : "lucide:smartphone", `text-lg shrink-0 ${d.kind === "ap" ? "text-primary" : "text-muted"}`)}
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${d.kind === "ap" ? (d.ssid || T(t, "hiddenNet")) : d.mac}</div>
          <div class="font-mono text-[0.6rem] text-muted truncate">${d.kind === "ap" ? d.mac : T(t, "kindClient")}${d.channel ? ` · ${T(t, "chShort")}${d.channel}` : ""}</div>
        </div>
        <div class="flex items-end gap-2 shrink-0">
          <div class="flex gap-0.5 items-end">${[1, 2, 3, 4].map((b) => html`<span class=${`w-1 rounded-sm ${b <= sigBars(d.rssi) ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${3 + b * 2}px`}></span>`)}</div>
          <span class="font-mono text-[0.65rem] tabular-nums text-muted w-9 text-right leading-none">${d.rssi == null ? "—" : d.rssi}</span>
        </div>
      </button>`)}
    </div>` : html`<div class="flex-1 min-h-0 grid place-items-center text-muted px-6 text-center"><span class="text-sm">${T(t, "nearbyEmpty")}</span></div>`}
    ${!hasRf() && list.length ? html`<div class="shrink-0 text-center text-[0.58rem] text-muted">${T(t, "nearbyDemo")}</div>` : null}
  </div>`;
}

// ---- Engineer: the adapter's characteristics + live chip state + settings. Reads 0x1e0 (firmware state) and
// 0xF0 (chip health) straight off the vendor control pipe, and the traffic tallies from the shared radio. ----
const $eng = atom({ e0: null, f0: null, state: "off" });
const $traffic = atom({ frames: 0, tx: 0, nets: 0, strongest: null, occ: [] });
const CH24 = [1, 6, 11], CH5 = [36, 44, 149], CH_OK = 6;   // only ch6 ships a bring-up blob today
const HEALTHY = 0xc492537;
const chBand = (c) => (c <= 14 ? "2.4 GHz" : "5 GHz");
const booted = (e0) => e0 != null && ((e0 >> 5) & 7) === 7;

function engSnapshot() {
  const s = (radio && radio.stats) || { frames: 0, tx: 0 };
  const devs = hood ? hood.list(Date.now()) : $nearby.get();
  const aps = devs.filter((d) => d.kind === "ap");
  const occ = Object.entries(aps.reduce((m, a) => (a.channel ? (m[a.channel] = (m[a.channel] || 0) + 1, m) : m), {}))
    .map(([c, n]) => [Number(c), n]).sort((a, b) => a[0] - b[0]);
  const strongest = devs.reduce((m, d) => (d.rssi != null && (m == null || d.rssi > m) ? d.rssi : m), null);
  $traffic.set({ frames: s.frames, tx: s.tx, nets: aps.length, strongest, occ });
  $eng.set({ ...$eng.get(), state: radio ? radio.state : "off" });
}
function seedEngDemo() {
  $eng.set({ e0: 0xe2, f0: HEALTHY, state: "on" });
  $traffic.set({ frames: 1423, tx: 88, nets: 3, strongest: -37, occ: [[6, 2], [11, 1]] });
}

async function copyDiag(t) {
  const e = $eng.get(), tr = $traffic.get();
  const lines = [
    "AX56 diagnostics",
    "adapter  ASUS USB-AX56 (RTL8852AU) 0b05:1997",
    "state    " + e.state + "  ch" + $channel.get() + " (" + chBand($channel.get()) + ")",
    "chip     0xF0=" + (e.f0 == null ? "?" : "0x" + e.f0.toString(16)) + (e.f0 === HEALTHY ? " healthy" : ""),
    "fw       0x1e0=" + (e.e0 == null ? "?" : "0x" + e.e0.toString(16)) + (booted(e.e0) ? " booted" : ""),
    "traffic  frames=" + tr.frames + " tx=" + tr.tx + " networks=" + tr.nets + " strongest=" + (tr.strongest ?? "—") + "dBm",
  ];
  try { await navigator.clipboard.writeText(lines.join("\n")); log("diagnostics copied"); } catch { /* */ }
}

function EngRow({ label, value, tone }) {
  return html`<div class="flex items-center justify-between px-4 py-2.5">
    <span class="text-sm text-muted">${label}</span>
    <span class=${`text-sm font-mono ${tone === "ok" ? "text-primary" : tone === "bad" ? "text-error" : ""}`}>${value}</span>
  </div>`;
}

export function engineerView({ S }) {
  const t = useStore(S.t);
  const eng = useStore($eng), tr = useStore($traffic), ch = useStore($channel);
  const rf = hasRf();
  useEffect(() => {
    if (gate || !rf) { seedEngDemo(); return; }
    const release = holdScan();
    const tick = setInterval(async () => {
      const r = getRadio();
      const [e0, f0] = await Promise.all([r.readReg(0x1e0), r.readReg(0xf0)]);
      $eng.set({ e0, f0, state: r.state });
      engSnapshot();
    }, 1500);
    engSnapshot();
    return () => { clearInterval(tick); release(); };
  }, []);

  const healthy = eng.f0 === HEALTHY, on = eng.state === "on";
  const occMax = Math.max(1, ...tr.occ.map(([, n]) => n));

  return html`<div class="flex flex-col gap-3 max-w-[560px] mx-auto w-full pb-4">
    <div class="rounded-2xl sf-e1 p-4 flex items-center gap-3">
      <div class="w-11 h-11 rounded-2xl grid place-items-center bg-primary/12 text-primary shrink-0">${Icon("lucide:router", "text-2xl")}</div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold leading-tight">ASUS USB-AX56</div>
        <div class="text-[0.62rem] text-muted font-mono truncate">${T(t, "engChipLine")} · 0b05:1997</div>
        <div class="text-[0.62rem] text-muted truncate">${T(t, "engDriver")}</div>
      </div>
      <span class=${`inline-flex items-center gap-1.5 text-[0.62rem] font-mono uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${on ? "text-primary bg-primary/10" : "text-muted bg-base-content/5"}`}>
        <span class=${`w-1.5 h-1.5 rounded-full ${on ? "bg-primary" : "bg-base-content/40"} ${eng.state === "attaching" ? "animate-pulse" : ""}`}></span>
        ${T(t, on ? "engStOn" : eng.state === "attaching" ? "engStAttaching" : "engStOff")}
      </span>
    </div>

    <div class="rounded-2xl sf-e1 divide-y divide-base-content/5 overflow-hidden">
      <${EngRow} label=${T(t, "engHealth")} tone=${eng.f0 == null ? "" : healthy ? "ok" : "bad"}
        value=${eng.f0 == null ? "—" : healthy ? T(t, "engHealthy") : T(t, "engWedged")} />
      <${EngRow} label=${T(t, "engFw")} tone=${eng.e0 == null ? "" : booted(eng.e0) ? "ok" : "bad"}
        value=${eng.e0 == null ? "—" : booted(eng.e0) ? T(t, "engBooted") : T(t, "engFwCold")} />
      <${EngRow} label=${T(t, "engMonitor")} tone=${on ? "ok" : ""} value=${on ? "on" : "—"} />
      <${EngRow} label=${T(t, "engBand")} value=${chBand(ch)} />
    </div>

    <div class="rounded-2xl sf-e1 p-4 flex flex-col gap-2.5">
      <div class="text-xs uppercase tracking-wide text-muted">${T(t, "engChannel")}</div>
      <div class="flex flex-wrap gap-1.5">
        ${[...CH24, ...CH5].map((c) => { const active = c === ch, ok = c === CH_OK;
          return html`<button key=${c} disabled=${!ok} data-ch=${c} onClick=${() => ok && $channel.set(c)}
            class=${`btn btn-sm rounded-xl gap-1 ${active ? "btn-primary" : "btn-ghost"} ${!ok ? "opacity-40" : ""}`}>
            <span class="font-mono">${c}</span>${!ok ? html`<span class="text-[0.5rem] uppercase">${T(t, "engSoon")}</span>` : null}
          </button>`; })}
      </div>
      <div class="text-[0.6rem] text-muted">${T(t, "engChNote")}</div>
    </div>

    <div class="rounded-2xl sf-e1 p-4 flex flex-col gap-3">
      <div class="text-xs uppercase tracking-wide text-muted">${T(t, "engTraffic")}</div>
      <div class="grid grid-cols-3 gap-2 text-center">
        ${[[tr.frames, "engFrames"], [tr.nets, "engNets"], [tr.tx, "engInjected"]].map(([v, k]) => html`<div key=${k}>
          <div class="text-lg font-mono tabular-nums leading-none">${v}</div>
          <div class="text-[0.58rem] text-muted uppercase tracking-wide mt-1">${T(t, k)}</div>
        </div>`)}
      </div>
      ${tr.strongest != null ? html`<div class="flex items-center justify-between text-sm pt-1">
        <span class="text-muted">${T(t, "engStrongest")}</span><span class="font-mono tabular-nums">${tr.strongest} dBm</span></div>` : null}
      ${tr.occ.length ? html`<div class="flex flex-col gap-1.5 pt-1">
        <div class="text-[0.58rem] text-muted uppercase tracking-wide">${T(t, "engOccupancy")}</div>
        ${tr.occ.map(([c, n]) => html`<div key=${c} class="flex items-center gap-2">
          <span class="font-mono text-[0.62rem] text-muted w-8 shrink-0">${T(t, "chShort")}${c}</span>
          <div class="flex-1 h-2 rounded-full bg-base-content/8 overflow-hidden"><div class="h-full bg-primary rounded-full" style=${`width:${Math.round(n / occMax * 100)}%`}></div></div>
          <span class="font-mono text-[0.62rem] tabular-nums w-4 text-right shrink-0">${n}</span>
        </div>`)}
      </div>` : null}
    </div>

    ${!on && rf ? html`<div class="text-[0.6rem] text-muted text-center px-4">${T(t, "engOffHint")}</div>` : null}
    <button data-copy class="btn btn-ghost btn-sm rounded-xl gap-1.5 text-muted self-center" onClick=${() => copyDiag(t)}>${Icon("lucide:clipboard-copy", "text-sm")}${T(t, "engCopy")}</button>
  </div>`;
}
