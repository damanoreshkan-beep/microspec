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
import { createRfCarrier } from "/_rt/rf.js";
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
  const carrier = rf ? createRfCarrier({ shell, channel: 6, src: me, onLog: log }) : bus.carrier();
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

  return html`<div class="h-full flex flex-col gap-2.5 max-w-[560px] mx-auto w-full">
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
