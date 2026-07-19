// Horoscope — the reading for your sign, yesterday · today · tomorrow. Fully on-device and offline: the
// text is SEEDED by (sign, date) in /_rt/horoscope.js, so it is stable through the day, fresh each morning,
// private, and needs no API. The sign glyph is the hand-drawn SVG from /_rt/zodiac.js — never an emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { sunSign, reading } from "/_rt/horoscope.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
const gate = isGate || MOCK != null;

// Remembered sign ("" → default to today's sun sign on first launch, then whatever you pick).
const $sign = persistentAtom("horoscope.sign", "");
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clampSign = (n) => Math.max(0, Math.min(11, Number(n) || 0));

// The three life areas — colour = meaning (love / work / health), the only non-ink hues in the reading.
const VIBES = [["love", "#FB7185"], ["work", "#60A5FA"], ["health", "#34D399"]];
const COLOUR_HEX = ["#F59E0B", "#FB7185", "#2DD4BF", "#A78BFA", "#FBBF24", "#818CF8"]; // matches i18n colours order
const parts = (s) => (s || "").split("|");                       // i18n banks are pipe-joined (schema wants strings)
const pick = (s, sel) => { const a = parts(s); return a.length ? a[Math.min(a.length - 1, Math.floor(sel * a.length))] : ""; };

export function horoscope({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const stored = useStore($sign);
  const now = gate ? new Date(2027, 6, 23) : new Date();          // Jul 23 (Leo) — a reproducible gate shot
  const signIdx = stored === "" ? sunSign(now.getMonth() + 1, now.getDate()) : clampSign(stored);
  const [day, setDay] = useState(1);                              // 0 yesterday · 1 today · 2 tomorrow
  const r = reading(signIdx, dk(addDays(now, day - 1)));

  const text = `${pick(t.openings, r.open)} ${pick(t.focuses, r.focus)} ${pick(t.advice, r.advice)}`.trim();
  const colourIdx = Math.min(COLOUR_HEX.length - 1, Math.floor(r.color * COLOUR_HEX.length));
  const DAY_KEYS = ["dYesterday", "dToday", "dTomorrow"], DAY_IDS = ["yesterday", "today", "tomorrow"];

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <!-- sign card → picker -->
      <button data-sign class="w-full flex items-center gap-4 rounded-2xl bg-base-100 border border-base-300 p-4 active:scale-[.99] transition" onClick=${() => openScreen("signs")}>
        <span class="shrink-0 text-secondary"><${Sign} i=${signIdx} cls="w-11 h-11" /></span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-bold text-lg leading-tight">${parts(t.signs)[signIdx] || ""}</span>
          <span class="block text-xs text-base-content/55 font-mono mt-0.5">${parts(t.signDates)[signIdx] || ""}</span>
        </span>
        ${Icon("lucide:chevrons-up-down", "text-base-content/35 text-xl shrink-0")}
      </button>

      <!-- day segmented -->
      <div role="tablist" class="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-base-100 border border-base-300">
        ${[0, 1, 2].map((i) => html`<button role="tab" data-day=${DAY_IDS[i]} aria-selected=${day === i} class=${`min-w-0 truncate py-2 rounded-xl text-sm font-medium transition-colors ${day === i ? "bg-primary text-primary-content" : "text-base-content/60"}`} onClick=${() => setDay(i)} key=${i}>${T(t, DAY_KEYS[i])}</button>`)}
      </div>

      <!-- reading -->
      <div data-reading class="flex flex-col gap-4">
        <div class="flex items-baseline gap-2">
          <span class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${T(t, "mood")}</span>
          <span class="font-semibold text-secondary">${pick(t.moods, r.mood)}</span>
        </div>
        <p class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>

        <!-- vibes: love / work / health -->
        <div class="flex flex-col gap-2.5 rounded-2xl bg-base-100 border border-base-300 p-4">
          ${VIBES.map(([key, c]) => html`<div class="flex items-center gap-3" key=${key}>
            <span class="w-14 shrink-0 text-xs text-base-content/70">${T(t, key)}</span>
            <span class="flex-1 flex gap-1">${[0, 1, 2, 3, 4].map((n) => html`<span class="flex-1 h-1.5 rounded-full" style=${`background:${n < r[key] ? c : "var(--color-base-300)"}`} key=${n}></span>`)}</span>
          </div>`)}
        </div>

        <!-- lucky number + colour of the day (stacks on a watch, side-by-side from ~300px) -->
        <div class="grid grid-cols-1 @min-[300px]:grid-cols-2 gap-3">
          <div class="rounded-2xl bg-base-100 border border-base-300 p-4">
            <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${T(t, "lucky")}</div>
            <div class="text-3xl font-bold tabular-nums text-secondary mt-0.5">${r.lucky}</div>
          </div>
          <div class="rounded-2xl bg-base-100 border border-base-300 p-4 flex items-center gap-3">
            <span class="w-9 h-9 rounded-full shrink-0 border border-base-content/10" style=${`background:${COLOUR_HEX[colourIdx]}`}></span>
            <span class="min-w-0">
              <span class="block text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${T(t, "luckyColour")}</span>
              <span class="block font-semibold truncate">${parts(t.colours)[colourIdx] || ""}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <${SignSheet} open=${screen === "signs"} onClose=${closeScreen} t=${t} signIdx=${signIdx} />
  </${Fragment}>`;
}

function SignSheet({ open, onClose, t, signIdx }) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  const choose = (i) => { $sign.set(String(i)); onClose(); };
  return html`<dialog id="signsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      <h3 class="font-bold text-lg mb-3">${T(t, "pickSign")}</h3>
      <div class="grid grid-cols-3 gap-2">
        ${Array.from({ length: 12 }, (_, i) => html`<button data-signpick=${i} aria-pressed=${i === signIdx} class=${`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition active:scale-95 ${i === signIdx ? "border-secondary bg-secondary/10 text-secondary" : "border-base-300 text-base-content/80"}`} onClick=${() => choose(i)} key=${i}>
          <${Sign} i=${i} cls="w-6 h-6" />
          <span class="text-xs truncate max-w-full">${(t.signs || "").split("|")[i] || ""}</span>
        </button>`)}
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>`;
}
