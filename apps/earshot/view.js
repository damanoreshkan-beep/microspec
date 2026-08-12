// earshot — a voice that only reaches as far as the radio does.
//
// Two refusals shape this screen, and neither is up for re-litigation (docs/research/ble-ether.md):
//   · No stock-Android API gives a BEARING, so there is no dial, no ring and no angle here. A voice's
//     size is its SIGNAL STRENGTH as a percentage of its own radio's range — the word "metres" appears
//     nowhere, and neither does a direction.
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
import { Island, Stage } from "/_rt/ui.js";
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

// A fit screen cannot scroll, so the field shows the loudest few and counts the rest. Twelve is what fits
// at 320×568 with the input island in place.
const MAX_SHOWN = 12;

// Listening outlives a tab switch: a subscription restarted per render would hit the framework's
// ~5-starts-per-30-seconds limit and go quiet with no error anyone could see.
const $voices = atom([]);
const $listening = atom(false);
const $err = atom(null);
const $mine = atom(null);          // { seq, text, until } — what THIS phone is holding in the air
// Ageing needs a clock of its own: reading Date.now() inside a useMemo keyed on the voice list freezes
// "now" at the last sighting, so a screen mounted later would age the field out while an older one kept it.
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
// shortest, both scripts, and a voice at each end of the strength ladder — the string nobody measures is
// the one that overflows.
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

function heard(frame) {
  const v = readFrame(frame);
  if (!v || v.sender === senderId()) return;   // your own throw comes back through the air; it is not news
  $voices.set(mergeVoices($voices.get(), [v], Date.now()));
}

function listen() {
  if ($listening.get()) return;
  $listening.set(true);
  $err.set(null);
  if (gate) {
    $voices.set(mergeVoices([], GATE_FIELD, Date.now()));
    return;
  }
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopScan = shell.subscribe("ble.scan", {}, heard, (e) => {
    $err.set(e?.detail || e?.code || ERR.failed);
    $listening.set(false);
  });
}

function hush() {
  $listening.set(false);
  try { stopScan?.(); } catch { /* already gone */ }
  stopScan = null;
  clearInterval(ageTimer); ageTimer = null;
  // The field goes with the radio. Keeping the last voices on screen would show people who are no longer
  // being heard — and since the ageing clock stops here too, they would never expire either: ghosts with
  // no way out. A voice exists only while something is listening for it.
  $voices.set([]);
}

async function throwVoice(text) {
  const fit = fitText(text);
  if (!fit.bytes) return;
  const seq = ((($mine.get()?.seq ?? 0) + 1) & 0xff);
  const bytes = encodeVoice({ sender: senderId(), seq, text: fit.text });
  if (gate) { $mine.set({ seq, text: fit.text, until: Date.now() + HOLD_MS }); return; }
  try {
    await shell.call("ble.advertise", { data: hexOf(bytes), ms: HOLD_MS });
    $mine.set({ seq, text: fit.text, until: Date.now() + HOLD_MS });
    $err.set(null);
  } catch (e) {
    $err.set(e?.detail || e?.code || ERR.failed);
  }
}

async function takeBack() {
  $mine.set(null);
  if (gate) return;
  try { await shell.call("ble.silence", {}); } catch { /* the air stops on its own within the minute */ }
}

/** The loudest first, then the newest — the one order that does not reshuffle while people speak. */
function useField() {
  const voices = useStore($voices);
  const now = useStore($now);
  return useMemo(() => {
    const live = voices
      .filter((v) => gate || now - v.last <= VOICE_TTL_MS)
      .map((v) => ({ ...v, percent: signalPercent(v.rssi, "ble"), age: Math.max(0, now - v.last) }))
      .sort((a, b) => b.percent - a.percent || b.last - a.last);
    return { shown: live.slice(0, MAX_SHOWN), hidden: Math.max(0, live.length - MAX_SHOWN) };
  }, [voices, now]);
}

/**
 * One voice. Size and opacity both ride the signal percentage, so a faint speaker reads as far away
 * without anything claiming to know how far. Colour is the sender's own hue — an identity you can
 * recognise across two throws without ever being a name.
 */
function Voice({ v, mine }) {
  // Text scale is bounded well above legibility: a 60% voice must still be readable, so the ladder runs
  // 0.92→1.35rem rather than fading to nothing.
  const size = 0.92 + (v.percent / 100) * 0.43;
  const dim = 0.55 + (v.percent / 100) * 0.45;
  const hue = hueOf(v.sender);
  return html`<span
    data-voice=${v.sender.toString(16)}
    data-strength=${v.percent}
    class=${`inline-flex max-w-full items-baseline gap-2 rounded-full px-3 py-1.5 leading-tight
             border ${mine ? "border-[var(--app-accent)]" : "border-base-content/15"} bg-base-100/60`}
    style=${`font-size:${size}rem;opacity:${dim};` +
            `box-shadow:0 0 0 1px hsl(${hue} 70% 55% / .18), 0 2px 12px hsl(${hue} 70% 45% / .10)`}>
    <span class="w-1.5 h-1.5 rounded-full shrink-0 self-center"
          style=${`background:hsl(${hue} 70% 55%)`}></span>
    <span class="min-w-0 break-words text-base-content">${v.text}</span>
  </span>`;
}

export function airView({ t }) {
  const listening = useStore($listening);
  const err = useStore($err);
  const mine = useStore($mine);
  const now = useStore($now);
  const { shown, hidden } = useField();
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  // The gate opens the app and photographs whatever is on screen. Left alone that is the "not listening"
  // panel, so axe, the overflow matrix and both shots would measure an empty box and the POPULATED field —
  // the one that can actually overflow — would be checked by nobody.
  useEffect(() => {
    if (gate) listen();
    return () => { if (!gate) hush(); };
  }, []);

  const fit = fitText(draft);
  const canThrow = fit.bytes > 0 && (gate || shell.has("ble.advertise"));
  const noBridge = !gate && !shell.has("ble.advertise");
  const holding = mine && (gate || mine.until > now);

  return html`<div class="h-full min-h-0 flex flex-col">
    <${Stage}>
      <div class="h-full min-h-0 flex flex-col items-center justify-center gap-[var(--ms-gap)] px-[var(--ms-pad)]">
        ${shown.length
          ? html`<div data-field class="flex flex-wrap items-center justify-center gap-2 max-w-full">
              ${shown.map((v) => html`<${Voice} key=${`${v.sender}:${v.seq}`} v=${v} mine=${false} />`)}
              ${hidden ? html`<span data-more class="font-mono text-[0.8rem] text-base-content/70">+${hidden}</span>` : null}
            </div>`
          : html`<div data-empty class="text-center max-w-[22rem]">
              <div class="text-base-content/70">${T(t, listening ? "quiet" : "off")}</div>
            </div>`}
      </div>
    </${Stage}>

    <${Island}>
      ${err ? html`<div data-err class="text-[0.8rem] text-base-content/70">${String(err)}</div>` : null}
      ${holding
        ? html`<div data-holding class="flex items-center gap-[var(--ms-gap)] min-w-0">
            <span class="w-1.5 h-1.5 rounded-full shrink-0"
                  style=${`background:hsl(${hueOf(senderId())} 70% 55%)`}></span>
            <span class="min-w-0 truncate">${mine.text}</span>
            <button class="btn btn-ghost btn-sm ml-auto shrink-0" data-take data-haptic="bump"
                    onClick=${takeBack}>${T(t, "takeBack")}</button>
          </div>`
        : html`<form class="flex items-center gap-[var(--ms-gap)] min-w-0"
                onSubmit=${(e) => { e.preventDefault(); throwVoice(draft); setDraft(""); }}>
            <input ref=${inputRef} data-say type="text" inputmode="text" autocomplete="off"
              class="input input-ghost flex-1 min-w-0 px-0 focus:outline-none"
              aria-label=${T(t, "say")} placeholder=${T(t, "say")}
              value=${draft} onInput=${(e) => setDraft(e.currentTarget.value)} />
            <span data-left class="font-mono text-[0.8rem] shrink-0 ${fit.left ? "text-base-content/70" : "text-[var(--app-accent)]"}">${fit.left}</span>
            <button data-throw type="submit" disabled=${!canThrow}
                    class="btn btn-sm btn-primary shrink-0">${T(t, "throw")}</button>
          </form>`}
      <div class="flex items-center gap-[var(--ms-gap)]">
        <button data-listen=${listening ? "on" : "off"} class="btn btn-ghost btn-sm"
                onClick=${() => (listening ? hush() : listen())}>
          ${Icon(listening ? "lucide:ear" : "lucide:ear-off", "text-[1.1em]")}
          <span>${T(t, listening ? "hush" : "listen")}</span>
        </button>
        ${noBridge
          ? html`<span data-needs class="text-[0.8rem] text-base-content/70 ml-auto">${T(t, "needsApp")}</span>`
          : null}
      </div>
    </${Island}>
  </div>`;
}
