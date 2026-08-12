// earshot — a chat that reaches exactly as far as the radio does.
//
// Two refusals shape this screen, and neither is up for re-litigation (docs/research/ble-ether.md):
//   · No stock-Android API gives a BEARING, so there is no dial, no ring and no angle here.
//   · A message is ONE advertisement or it is nothing. 27 payload bytes minus a 5-byte header is 22 bytes,
//     about 11 Cyrillic characters. The channel has no ack and no retry, so a sentence assembled from four
//     packets would be four chances to show half of it.
//
// The protocol and every pure decision live in packages/runtime/earshot.js with unit tests. This file is
// wiring and layout.
import { html } from "htm/preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import {
  VOICE_TTL_MS, fitText, encodeVoice, readFrame, hexOf, newSender, hueOf, callsign, mergeVoices,
} from "/_rt/earshot.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// How long one message stays in the air. The platform refuses anything past 180 s outright
// (AdvertiseSettings.setTimeout throws), and a minute is long enough to be caught by a phone whose screen
// was off when you spoke.
const HOLD_MS = 60_000;

// Listening outlives a tab switch: a subscription restarted per render would hit the framework's
// ~5-starts-per-30-seconds limit and go quiet with no error anyone could see.
const $voices = atom([]);
const $listening = atom(false);
const $err = atom(null);
const $blocked = atom(null);       // a KNOWN cause, as an i18n key — answerable by the user
const $mine = atom([]);            // messages THIS phone has sent, newest last
const $now = atom(Date.now());
const $packets = atom(0);          // advertisements pulled out of the air, ours or not
// The Android permission an error named. A permission refused twice is refused forever: requestPermissions
// returns instantly and no dialog can ever appear again, so app settings has to be reachable from here.
const $needPerm = atom(null);

const PERM_RE = /denied:([A-Z_]+)/;

function noteError(e) {
  const code = e?.code || ERR.failed;
  const detail = e?.detail || "";
  const m = PERM_RE.exec(detail) || PERM_RE.exec(code);
  if (m) $needPerm.set(m[1]);
  $err.set(`${code}${detail ? ` · ${detail}` : ""}`);
}

/** Ask; if Android has stopped asking, walk the user to the switch instead of repeating a no-op. */
async function grant() {
  const p = $needPerm.get();
  if (!p) return;
  try {
    const r = await shell.call("system.grant", { permission: p });
    if (r?.state === "granted") { $needPerm.set(null); $err.set(null); hush(); listen(); return; }
  } catch { /* the grant call itself failed; settings is still worth offering */ }
  try { await shell.call("system.settings", { page: "app" }); } catch { /* nothing else to offer */ }
}

const SENDER_KEY = "earshot.sender";
function loadSender() {
  try {
    const kept = Number(localStorage.getItem(SENDER_KEY));
    if (Number.isFinite(kept) && kept > 0) return kept;
  } catch { /* private mode has no storage; a fresh identity per session is still a working one */ }
  const made = newSender();
  try { localStorage.setItem(SENDER_KEY, String(made)); } catch { /* nothing to keep it in */ }
  return made;
}
let sender = null;
const senderId = () => (sender ??= gate ? 0x5ea401 : loadSender());

// The gate has no radio. Seed the WIDEST field it will ever measure: the longest legal message, the
// shortest, both scripts — the string nobody measures is the one that overflows.
const GATE_FIELD = [
  { sender: 0x2f7a10, seq: 1, text: "привіт усім", rssi: -48 },
  { sender: 0x8c1d44, seq: 7, text: "хто тут?", rssi: -59 },
  { sender: 0x14b9e2, seq: 3, text: "aaaaaaaaaaaaaaaaaaaaaa", rssi: -66 },
  { sender: 0xd3e0a5, seq: 2, text: "?", rssi: -74 },
  { sender: 0x6b2c9f, seq: 9, text: "third floor", rssi: -83 },
];

let stopScan = null;
let ageTimer = null;

function heard(frame) {
  if (frame && frame.raw) $packets.set($packets.get() + 1);
  const v = readFrame(frame);
  if (!v || v.sender === senderId()) return;   // your own message comes back through the air; not news
  $voices.set(mergeVoices($voices.get(), [v], Date.now()));
}

/**
 * Why the radio might be deaf while every permission reads as granted.
 *
 * Location services being OFF returns an EMPTY BLE scan with no error at all — the shell's own Java says
 * so, and it is the single most confusing failure here: the screen looks like an empty room while the
 * radio cannot hear anything at all.
 */
async function diagnose() {
  if (gate) return;
  try {
    const info = await shell.call("system.info", {});
    if (info && info.locationOn === false) { $blocked.set("locationOff"); return; }
  } catch { /* an older shell has no such field; fall through to the radio check */ }
  try {
    const st = await shell.call("ble.state", {});
    if (st && st.supported === false) { $blocked.set("noBle"); return; }
    if (st && st.on === false) { $blocked.set("bleOff"); return; }
  } catch { /* if the state call itself fails, the subscribe error path will say so */ }
  $blocked.set(null);
}

function listen() {
  if ($listening.get()) return;
  $listening.set(true);
  $err.set(null);
  if (gate) { $voices.set(mergeVoices([], GATE_FIELD, Date.now())); $packets.set(1284); return; }
  diagnose();
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopScan = shell.subscribe("ble.scan", {}, heard, (e) => { noteError(e); $listening.set(false); });
}

function hush() {
  $listening.set(false);
  try { stopScan?.(); } catch { /* already gone */ }
  stopScan = null;
  clearInterval(ageTimer); ageTimer = null;
}

async function send(text) {
  const fit = fitText(text);
  if (!fit.bytes) return;
  const prev = $mine.get();
  const seq = (((prev[prev.length - 1]?.seq ?? 0) + 1) & 0xff);
  const bytes = encodeVoice({ sender: senderId(), seq, text: fit.text });
  const at = Date.now();
  const keep = () => $mine.set([...$mine.get(), { seq, text: fit.text, at, until: at + HOLD_MS }]);
  if (gate) { keep(); return; }
  // ALWAYS attempt it. Greying the button out on shell.has() hid the reason behind a dead control, and a
  // dead control cannot be diagnosed from the outside.
  try {
    await shell.call("ble.advertise", { data: hexOf(bytes), ms: HOLD_MS });
    keep();
    $err.set(null);
  } catch (e) {
    noteError(e);
    $err.set(`${$err.get()} · bridge ${shell.version}/${shell.catalogueVersion} · ${bytes.length}B`);
  }
}

/** One conversation, oldest first — theirs and yours in the order they happened. */
function useChat() {
  const voices = useStore($voices);
  const mine = useStore($mine);
  const now = useStore($now);
  return useMemo(() => {
    const rows = voices
      .filter((v) => gate || now - v.last <= VOICE_TTL_MS)
      .map((v) => ({ key: `${v.sender}:${v.seq}`, sender: v.sender, text: v.text, at: v.first, mine: false }));
    for (const m of mine) {
      rows.push({ key: `me:${m.seq}`, sender: senderId(), text: m.text, at: m.at, mine: true });
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [voices, mine, now]);
}

/**
 * A message arrives as radio and resolves into words: Scramble runs once per key, so an existing line never
 * re-scrambles on a re-render — only a newly caught one does. Under the gate it renders instantly.
 */
function Line({ row, loc }) {
  const hue = hueOf(row.sender);
  const at = new Date(row.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const name = callsign(row.sender);
  return html`<div data-voice=${row.sender.toString(16)} data-mine=${row.mine ? "1" : "0"}
      class=${`flex flex-col gap-1 max-w-[85%] ${row.mine ? "ml-auto items-end" : "items-start"}`}>
    <div class="flex items-center gap-1.5 px-1">
      <span class="w-2 h-2 rounded-full shrink-0" style=${`background:hsl(${hue} 70% 55%)`}></span>
      <span class="font-mono text-[0.7rem] text-base-content/70">${name}</span>
    </div>
    <div class=${`min-w-0 rounded-2xl px-3 py-2 ${row.mine ? "bg-[var(--app-accent)]/15 border border-[var(--app-accent)]" : "bg-base-200"}`}>
      <div class="break-words text-base-content">
        ${row.mine ? row.text : html`<${Scramble} text=${row.text} minMs=${420} />`}
      </div>
      <div class=${`font-mono text-[0.7rem] text-base-content/70 ${row.mine ? "text-right" : ""}`}>${at}</div>
    </div>
  </div>`;
}

export function airView({ S, t }) {
  const listening = useStore($listening);
  const err = useStore($err);
  const blocked = useStore($blocked);
  const packets = useStore($packets);
  const needPerm = useStore($needPerm);
  const loc = useStore(S.locale);
  const rows = useChat();
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  // The air is on as soon as the screen is. There is no "start listening" step in a chat, and the gate
  // needs the populated screen anyway — left alone it would photograph an empty box.
  useEffect(() => {
    listen();
    return () => { if (!gate) hush(); };
  }, []);

  useEffect(() => { if (!gate) endRef.current?.scrollIntoView({ block: "end" }); }, [rows.length]);

  const fit = fitText(draft);

  return html`<div class="flex flex-col gap-3 px-[var(--ms-pad)] pb-[calc(var(--dock-h)+11rem)]">
    <div data-scanner class="flex items-center gap-2 pt-1 text-base-content/70">
      <span class=${`w-1.5 h-1.5 rounded-full ${listening ? "bg-[var(--app-accent)]" : "bg-base-content/30"} ${listening && !gate ? "animate-pulse" : ""}`}></span>
      <span class="font-mono text-[0.7rem]">${packets}</span>
      <span class="font-mono text-[0.7rem]">${T(t, "packets")}</span>
    </div>

    ${rows.length
      ? html`<div data-field class="flex flex-col gap-3">
          ${rows.map((row) => html`<${Line} key=${row.key} row=${row} loc=${loc} />`)}
          <div ref=${endRef}></div>
        </div>`
      : html`<div data-empty class="py-16 text-center text-base-content/70">${T(t, "quiet")}</div>`}

    <${Island} pinned=${true} className="w-full max-w-[36rem] flex flex-col gap-[var(--ms-gap)]">
      ${blocked
        ? html`<div data-blocked class="flex items-start gap-2 min-w-0">
            ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
            <span class="min-w-0 text-base-content">${T(t, blocked)}</span>
          </div>`
        : null}
      ${err
        ? html`<div data-err class="flex items-start gap-2 min-w-0">
            ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
            <span class="min-w-0 break-words font-mono text-[0.8rem] text-base-content">${String(err)}</span>
            ${needPerm
              ? html`<button data-grant class="btn btn-sm btn-primary shrink-0 ml-auto" onClick=${grant}>${T(t, "allow")}</button>`
              : null}
          </div>`
        : null}
      ${!gate && shell.why("ble.advertise") && !err && !blocked
        ? html`<div data-needs class="flex items-center gap-2 min-w-0">
            ${Icon("lucide:radio-tower", "text-[1.1em] shrink-0 text-base-content/70")}
            <span class="min-w-0 text-base-content/70">${T(t, shell.why("ble.advertise") === ERR.staleBridge ? "needsUpdate" : "needsApp")}</span>
          </div>`
        : null}
      <form class="flex items-center gap-2 min-w-0"
            onSubmit=${(e) => { e.preventDefault(); send(draft); setDraft(""); }}>
        <input data-say type="text" inputmode="text" autocomplete="off"
          class="input input-ghost flex-1 min-w-0 px-3 focus:outline-none"
          aria-label=${T(t, "say")} placeholder=${T(t, "say")}
          value=${draft} onInput=${(e) => setDraft(e.currentTarget.value)} />
        <span data-left class="font-mono text-[0.8rem] shrink-0 ${fit.left ? "text-base-content/70" : "text-[var(--app-accent)]"}">${fit.left}</span>
        <button data-throw type="submit" disabled=${fit.bytes === 0}
                class="btn btn-sm btn-primary shrink-0" aria-label=${T(t, "send")}>
          ${Icon("lucide:send-horizontal", "text-[1.1em]")}
        </button>
      </form>
    </${Island}>
  </div>`;
}
