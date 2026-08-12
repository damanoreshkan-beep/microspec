// earshot — a voice that only reaches as far as the radio does.
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
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { signalPercent } from "/_rt/radar.js";
import {
  MAX_TEXT, VOICE_TTL_MS, fitText, encodeVoice, readFrame, hexOf, newSender, hueOf, mergeVoices,
} from "/_rt/earshot.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// How long one throw is held in the air. The platform refuses anything past 180 s outright
// (AdvertiseSettings.setTimeout throws), and a minute is long enough to be caught by a phone whose screen
// was off when you spoke.
const HOLD_MS = 60_000;

// Listening outlives a tab switch: a subscription restarted per render would hit the framework's
// ~5-starts-per-30-seconds limit and go quiet with no error anyone could see.
const $voices = atom([]);
const $listening = atom(false);
const $err = atom(null);
// A KNOWN cause, as an i18n key. Separate from $err because these are answerable by the user, while $err
// is a diagnostic string for me.
const $blocked = atom(null);
const $mine = atom(null);          // { seq, text, until, at } — what THIS phone is holding in the air
const $now = atom(Date.now());

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
  { sender: 0xa05e13, seq: 4, text: "тиша", rssi: -95 },
];

let stopScan = null;
let ageTimer = null;

// Two counters, because "my app hears nothing" has two completely different causes and they are
// indistinguishable from the screen: either no advertisement reaches us at all (scan never started, or the
// platform is refusing quietly), or thousands arrive and none of them are ours (the payload is not what we
// think it is). nRF Connect seeing traffic while this app shows an empty room is exactly that fork.
const $seen = atom({ frames: 0, ours: 0 });

function heard(frame) {
  const s = $seen.get();
  $seen.set({ frames: s.frames + (frame && frame.raw ? 1 : 0), ours: s.ours });
  const v = readFrame(frame);
  if (!v) return;
  $seen.set({ frames: $seen.get().frames, ours: $seen.get().ours + 1 });
  if (v.sender === senderId()) return;   // your own throw comes back through the air; it is not news
  $voices.set(mergeVoices($voices.get(), [v], Date.now()));
}

/**
 * Why the radio might be deaf while every permission reads as granted.
 *
 * Location services being OFF returns an EMPTY BLE scan with no error at all — the shell's own Java says
 * so, and it is the single most confusing failure here: the screen says "nobody within earshot" while the
 * radio cannot hear anything at all. Two phones a metre apart, one talking, the other silent, and nothing
 * on either screen explaining it.
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
  if (gate) {
    $voices.set(mergeVoices([], GATE_FIELD, Date.now()));
    return;
  }
  diagnose();
  $seen.set({ frames: 0, ours: 0 });
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopScan = shell.subscribe("ble.scan", {}, heard, (e) => {
    $err.set(`${e?.code || ERR.failed}${e?.detail ? ` · ${e.detail}` : ""}`);
    $listening.set(false);
  });
}

function hush() {
  $listening.set(false);
  try { stopScan?.(); } catch { /* already gone */ }
  stopScan = null;
  clearInterval(ageTimer); ageTimer = null;
  // The field goes with the radio. Keeping the last voices on screen would show people who are no longer
  // being heard — and since the ageing clock stops here too, they would never expire either.
  $voices.set([]);
}

async function throwVoice(text) {
  const fit = fitText(text);
  if (!fit.bytes) return;
  const seq = ((($mine.get()?.seq ?? 0) + 1) & 0xff);
  const bytes = encodeVoice({ sender: senderId(), seq, text: fit.text });
  const now = Date.now();
  if (gate) { $mine.set({ seq, text: fit.text, until: now + HOLD_MS, at: now }); return; }
  // ALWAYS attempt it. Greying the button out on shell.has() hid the reason behind a dead control, and a
  // dead control cannot be diagnosed from the outside.
  try {
    await shell.call("ble.advertise", { data: hexOf(bytes), ms: HOLD_MS });
    $mine.set({ seq, text: fit.text, until: now + HOLD_MS, at: now });
    $err.set(null);
  } catch (e) {
    const code = e?.code || ERR.failed;
    const detail = e?.detail ? ` · ${e.detail}` : "";
    $err.set(`${code}${detail} · bridge ${shell.version}/${shell.catalogueVersion} · ${bytes.length}B`);
  }
}

async function takeBack() {
  $mine.set(null);
  if (gate) return;
  try { await shell.call("ble.silence", {}); } catch { /* the air stops on its own within the minute */ }
}

/** Oldest first, newest last — a chat, not a leaderboard. */
function useChat() {
  const voices = useStore($voices);
  const now = useStore($now);
  const mine = useStore($mine);
  return useMemo(() => {
    const rows = voices
      .filter((v) => gate || now - v.last <= VOICE_TTL_MS)
      .map((v) => ({ ...v, mine: false, percent: signalPercent(v.rssi, "ble") }))
      .sort((a, b) => a.first - b.first);
    if (mine && (gate || mine.until > now)) {
      rows.push({ sender: senderId(), seq: mine.seq, text: mine.text, first: mine.at, mine: true, percent: 100 });
    }
    return rows;
  }, [voices, now, mine]);
}

/** An ordinary chat line: theirs on the left, yours on the right, a time under the words. */
function Line({ v, loc }) {
  const hue = hueOf(v.sender);
  const at = new Date(v.first).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  return html`<div data-voice=${v.sender.toString(16)} data-strength=${v.percent}
      data-mine=${v.mine ? "1" : "0"}
      class=${`flex items-end gap-2 max-w-[85%] ${v.mine ? "ml-auto flex-row-reverse" : ""}`}>
    ${v.mine ? null : html`<span class="w-2 h-2 rounded-full shrink-0 mb-3" style=${`background:hsl(${hue} 70% 55%)`}></span>`}
    <div class=${`min-w-0 rounded-2xl px-3 py-2 ${v.mine ? "bg-[var(--app-accent)]/15 border border-[var(--app-accent)]" : "bg-base-200"}`}>
      <div class="break-words text-base-content">${v.text}</div>
      <div class=${`font-mono text-[0.7rem] text-base-content/70 ${v.mine ? "text-right" : ""}`}>${at}</div>
    </div>
  </div>`;
}

export function airView({ S, t }) {
  const listening = useStore($listening);
  const err = useStore($err);
  const blocked = useStore($blocked);
  const mine = useStore($mine);
  const now = useStore($now);
  const seen = useStore($seen);
  const loc = useStore(S.locale);
  const rows = useChat();
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  // The gate opens the app and photographs whatever is on screen. Left alone that is the "not listening"
  // panel, so axe, the overflow matrix and both shots would measure an empty box.
  useEffect(() => {
    if (gate) listen();
    return () => { if (!gate) hush(); };
  }, []);

  useEffect(() => { if (!gate) endRef.current?.scrollIntoView({ block: "end" }); }, [rows.length]);

  const fit = fitText(draft);
  const canThrow = fit.bytes > 0;
  const why = gate ? null : shell.why("ble.advertise");
  const holding = mine && (gate || mine.until > now);

  return html`<div class="flex flex-col gap-2 px-[var(--ms-pad)] pb-[calc(var(--dock-h)+9rem)]">
    ${rows.length
      ? html`<div data-field class="flex flex-col gap-2">
          ${rows.map((v) => html`<${Line} key=${`${v.sender}:${v.seq}`} v=${v} loc=${loc} />`)}
          <div ref=${endRef}></div>
        </div>`
      : html`<div data-empty class="py-16 text-center text-base-content/70">
          ${T(t, listening ? "quiet" : "off")}
        </div>`}

    <${Island}>
      ${blocked
        ? html`<div data-blocked class="flex items-start gap-[var(--ms-gap)] min-w-0">
            ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
            <span class="min-w-0 text-base-content">${T(t, blocked)}</span>
          </div>`
        : null}
      ${err
        ? html`<div data-err class="flex items-start gap-[var(--ms-gap)] min-w-0">
            ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
            <span class="min-w-0 break-words font-mono text-[0.85rem] text-base-content">${String(err)}</span>
          </div>`
        : null}
      ${why && !err && !blocked
        ? html`<div data-needs class="flex items-center gap-[var(--ms-gap)] min-w-0">
            ${Icon("lucide:radio-tower", "text-[1.1em] shrink-0 text-base-content/70")}
            <span class="min-w-0 text-base-content/70">${T(t, why === ERR.staleBridge ? "needsUpdate" : "needsApp")}</span>
          </div>`
        : null}

      <form class="flex items-center gap-[var(--ms-gap)] min-w-0"
            onSubmit=${(e) => { e.preventDefault(); throwVoice(draft); setDraft(""); }}>
        <input data-say type="text" inputmode="text" autocomplete="off"
          class="input input-ghost flex-1 min-w-0 px-0 focus:outline-none"
          aria-label=${T(t, "say")} placeholder=${T(t, "say")}
          value=${draft} onInput=${(e) => setDraft(e.currentTarget.value)} />
        <span data-left class="font-mono text-[0.8rem] shrink-0 ${fit.left ? "text-base-content/70" : "text-[var(--app-accent)]"}">${fit.left}</span>
        <button data-throw type="submit" disabled=${!canThrow}
                class="btn btn-sm btn-primary shrink-0">${T(t, "throw")}</button>
      </form>

      <div class="flex items-center gap-[var(--ms-gap)]">
        <button data-listen=${listening ? "on" : "off"} class="btn btn-ghost btn-sm"
                onClick=${() => (listening ? hush() : listen())}>
          ${Icon(listening ? "lucide:ear" : "lucide:ear-off", "text-[1.1em]")}
          <span>${T(t, listening ? "hush" : "listen")}</span>
        </button>
        ${listening && !gate
          // frames/ours splits "the radio is deaf" from "the radio hears, but none of it is ours" — the
          // only two possibilities when another scanner on the same phone sees traffic and this does not.
          ? html`<span data-seen class="font-mono text-[0.7rem] text-base-content/70">${seen.frames}/${seen.ours}</span>`
          : null}
        ${holding
          ? html`<button data-take class="btn btn-ghost btn-sm ml-auto" data-haptic="bump"
                         onClick=${takeBack}>${T(t, "takeBack")}</button>`
          : null}
      </div>
    </${Island}>
  </div>`;
}
