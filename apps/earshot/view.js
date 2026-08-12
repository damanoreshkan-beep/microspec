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

const HOLD_MS = 60_000;

const MAX_SHOWN = 12;

const $voices = atom([]);
const $listening = atom(false);
const $err = atom(null);
const $mine = atom(null);          
const $now = atom(Date.now());

const SENDER_KEY = "earshot.sender";
function loadSender() {
  try {
    const kept = Number(localStorage.getItem(SENDER_KEY));
    if (Number.isFinite(kept) && kept > 0) return kept;
  } catch {  }
  const made = newSender();
  try { localStorage.setItem(SENDER_KEY, String(made)); } catch {  }
  return made;
}
let sender = null;
const senderId = () => (sender ??= gate ? 0x5ea401 : loadSender());

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
  if (!v || v.sender === senderId()) return;   
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
  try { stopScan?.(); } catch {  }
  stopScan = null;
  clearInterval(ageTimer); ageTimer = null;
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
  try { await shell.call("ble.silence", {}); } catch {  }
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
  const size = 1.0 + (v.percent / 100) * 0.35;
  const dim = 0.62 + (v.percent / 100) * 0.38;
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

  useEffect(() => {
    if (gate) listen();
    return () => { if (!gate) hush(); };
  }, []);

  const fit = fitText(draft);
  const canThrow = fit.bytes > 0 && (gate || shell.has("ble.advertise"));
  const why = gate ? null : shell.why("ble.advertise");
  const holding = mine && (gate || mine.until > now);

  return html`<div class="h-full min-h-0 flex flex-col">
    <${Stage}>
      <div class="h-full min-h-0 flex flex-col px-[var(--ms-pad)]">
        ${shown.length
          ? html`<div data-field
              class="flex-1 min-h-0 flex flex-wrap items-end justify-center content-end gap-3
                     pt-[var(--ms-gap)] pb-[calc(var(--ms-gap)*2)]">
              ${shown.map((v) => html`<${Voice} key=${`${v.sender}:${v.seq}`} v=${v} mine=${false} />`)}
              ${hidden ? html`<span data-more class="font-mono text-[0.8rem] text-base-content/70">+${hidden}</span>` : null}
            </div>`
          : html`<div data-empty class="flex-1 min-h-0 grid place-items-center text-center">
              <div class="text-base-content/70 max-w-[22rem]">${T(t, listening ? "quiet" : "off")}</div>
            </div>`}
      </div>
    </${Stage}>

    <${Island}>
      ${err ? html`<div data-err class="text-[0.8rem] text-base-content/70">${String(err)}</div>` : null}
      ${why
        ? html`<div data-needs class="flex items-center gap-[var(--ms-gap)] min-w-0">
            ${Icon("lucide:radio-tower", "text-[1.1em] shrink-0 text-base-content/70")}
            <span class="min-w-0 text-base-content/70">${T(t, why === ERR.staleBridge ? "needsUpdate" : "needsApp")}</span>
          </div>`
        : null}
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
      </div>
    </${Island}>
  </div>`;
}
