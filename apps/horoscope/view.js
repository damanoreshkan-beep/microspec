// Horoscope — the REAL daily reading for your sign, yesterday · today · tomorrow, from horoscope.com
// (professional astrologers), plus the day's four star ratings (love/work/vibe/success). Fetched through
// our allowlisted VPS proxy (jobs-map.mooo.com/feed/horoscope → parsed compact JSON, CORS *), then cached
// per (sign, day) in localStorage so the last reading stays instant and readable offline. English prose is
// translated to the active locale via /_rt/translate.js (fail-open: the original shows until it lands).
// The sign glyph is the hand-drawn SVG from /_rt/zodiac.js — never an emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useSheetDrag } from "/_rt/gesture.js";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { sunSign } from "/_rt/horoscope.js";
import { tr, warm, trTick } from "/_rt/translate.js";
import { polish, warmPolish, aiTick } from "/_rt/ai.js";
import { Scramble, Pixels } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const QS = new URLSearchParams(location.search);
const SIGN_OVERRIDE = QS.get("sign"); // ?sign=0..11 previews any sign (for a phone/mock check)

const API = "https://jobs-map.mooo.com/feed/horoscope";
const DAY_IDS = ["yesterday", "today", "tomorrow"], DAY_KEYS = ["dYesterday", "dToday", "dTomorrow"];

// The four real ratings horoscope.com publishes per day → [i18n label, response key, colour(=meaning)].
const RATINGS = [["love", "sex", "#FB7185"], ["work", "hustle", "#60A5FA"], ["vibe", "vibe", "#A78BFA"], ["success", "success", "#34D399"]];

// Remembered sign ("" → default to today's sun sign on first launch, then whatever you pick).
const $sign = persistentAtom("horoscope.sign", "");
const clampSign = (n) => Math.max(0, Math.min(11, Number(n) || 0));
const ck = (s, d) => `horoscope:v3:${s}:${d}`;
const readCache = (s, d) => { try { return JSON.parse(localStorage.getItem(ck(s, d)) || "null"); } catch { return null; } };
const writeCache = (s, d, v) => { try { localStorage.setItem(ck(s, d), JSON.stringify(v)); } catch { /* quota / private mode */ } };

// Gate/mock fixture: fixed real readings (Leo, Jul 2027) so the shot + e2e are deterministic and offline —
// three distinct days so the day-switch test sees the reading change without hitting the network.
const GATE = {
  yesterday: { date: "Jul 22, 2027", ratings: { sex: 2, hustle: 2, vibe: 2, success: 2 }, text: "Tension in your romantic life is apt to well up today, Leo. More than likely, there are certain responsibilities that you feel you have to attend to that take you away from your intimate experience with another. Try to find a healthy balance between work and play." },
  today: { date: "Jul 23, 2027", ratings: { sex: 4, hustle: 2, vibe: 3, success: 4 }, text: "Be prepared to work diligently toward making your dreams a reality today, Leo. Success is definitely on the way, though it may not be approaching quite as quickly as you might like. Take time periodically throughout the day to sit quietly and recoup your energy." },
  tomorrow: { date: "Jul 24, 2027", ratings: { sex: 4, hustle: 4, vibe: 3, success: 3 }, text: "Your heart has been active, Leo, and you're probably feeling the need to take charge of a certain relationship. Instead of being too hasty in your pursuit of this romance, you should probably do more planning. Look at the situation from a long-term perspective." },
};

async function fetchReading(signIdx, dayId) {
  const r = await fetch(`${API}?sign=${signIdx + 1}&day=${dayId}`);
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  if (!j || !j.text) throw new Error("empty");
  return { date: j.date, ratings: j.ratings || {}, text: j.text };
}

export function horoscope({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore(trTick);                                               // re-render when a translation lands
  useStore(aiTick);                                               // …and again when its natural rewrite lands
  const stored = useStore($sign);
  const now = gate ? new Date(2027, 6, 23) : new Date();          // Jul 23 (Leo) — a reproducible default
  const signIdx = (SIGN_OVERRIDE != null && SIGN_OVERRIDE !== "") ? clampSign(SIGN_OVERRIDE)
    : stored === "" ? sunSign(now.getMonth() + 1, now.getDate()) : clampSign(stored);
  const [day, setDay] = useState(1);                              // 0 yesterday · 1 today · 2 tomorrow
  const [data, setData] = useState(gate ? GATE[DAY_IDS[1]] : null);
  const [err, setErr] = useState(false);

  // Fetch (or seed) whenever sign or day changes: show cache instantly, then refresh from the live source.
  useEffect(() => {
    const dayId = DAY_IDS[day];
    if (gate) { setData(GATE[dayId]); setErr(false); return; }
    const cached = readCache(signIdx, dayId);
    setData(cached || null);
    setErr(false);
    let live = true;
    fetchReading(signIdx, dayId)
      .then((d) => { if (!live) return; setData(d); setErr(false); writeCache(signIdx, dayId, d); })
      .catch(() => { if (live) setErr(!cached); });               // keep cache on failure; error only if nothing to show
    return () => { live = false; };
  }, [signIdx, day]);

  // Translate the (English) reading into the active locale — cached permanently, fail-open to the original.
  useEffect(() => { if (data?.text) warm([data.text], loc); }, [data && data.text, loc]);
  const translated = data ? tr(data.text, loc) : "";
  // …then lightly rewrite the (wooden, literal) machine translation into natural prose via the systemic AI
  // module — only once the translation itself has landed (translated ≠ the English source), and never under
  // the gate (deterministic shot/e2e; no LLM calls). Fail-open: the translated text shows until the polish lands.
  useEffect(() => { if (!gate && translated && translated !== data?.text) warmPolish([translated], loc); }, [translated, loc]);
  const readingText = polish(translated, loc);
  const dateLabel = data?.date ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + (day - 1))
    .toLocaleDateString(loc === "en" ? "en-GB" : loc || "uk", { day: "numeric", month: "long" }) : "";

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <!-- sign card → picker -->
      <button data-sign class="w-full flex items-center gap-4 rounded-2xl bg-base-100 border border-base-300 p-4 active:scale-[.99] transition" onClick=${() => openScreen("signs")}>
        <span class="shrink-0 text-secondary"><${Sign} i=${signIdx} cls="w-11 h-11" /></span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-bold text-lg leading-tight">${(t.signs || "").split("|")[signIdx] || ""}</span>
          <span class="block text-xs text-base-content/55 font-mono mt-0.5">${(t.signDates || "").split("|")[signIdx] || ""}</span>
        </span>
        ${Icon("lucide:chevrons-up-down", "text-base-content/35 text-xl shrink-0")}
      </button>

      <!-- day segmented -->
      <div role="tablist" class="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-base-100 border border-base-300">
        ${[0, 1, 2].map((i) => html`<button role="tab" data-day=${DAY_IDS[i]} aria-selected=${day === i} class=${`min-w-0 truncate py-2 rounded-xl text-sm font-medium transition-colors ${day === i ? "bg-primary text-primary-content" : "text-base-content/60"}`} onClick=${() => setDay(i)} key=${i}>${T(t, DAY_KEYS[i])}</button>`)}
      </div>

      ${err && !data
      ? html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-3 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "noConnection")}</span></div>`
      : !data
        ? html`<!-- structure-shaped skeleton (date · prose lines · ratings) — never a bare spinner -->
          <div class="flex flex-col gap-4">
            <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/40"><${Scramble} len=${11} /></div>
            <div class="flex flex-col gap-2 text-base-content/55">${[26, 30, 28, 18].map((n, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>
            <div class="rounded-2xl border border-base-300 overflow-hidden h-32"><${Pixels} /></div>
          </div>`
        : html`<!-- reading -->
          <div class="flex flex-col gap-4">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${dateLabel}</span>
              ${err ? html`<span class="text-[0.62rem] text-warning/80 truncate">${T(t, "offline")}</span>` : null}
            </div>
            <p data-reading data-live class="text-[0.97rem] leading-relaxed text-base-content/90">${readingText}</p>

            <!-- the day's four real star ratings -->
            <div data-ratings class="flex flex-col gap-2.5 rounded-2xl bg-base-100 border border-base-300 p-4">
              <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45 mb-0.5">${T(t, "ratings")}</div>
              ${RATINGS.map(([label, key, c]) => html`<div class="flex items-center gap-3" key=${key}>
                <span class="w-16 shrink-0 text-xs text-base-content/70">${T(t, label)}</span>
                <span class="flex-1 flex gap-1">${[0, 1, 2, 3, 4].map((n) => html`<span class="flex-1 h-1.5 rounded-full" style=${`background:${n < (data.ratings[key] || 0) ? c : "var(--color-base-300)"}`} key=${n}></span>`)}</span>
              </div>`)}
            </div>
          </div>`}
    </div>

    <${SignSheet} open=${screen === "signs"} onClose=${closeScreen} t=${t} signIdx=${signIdx} />
  </${Fragment}>`;
}

function SignSheet({ open, onClose, t, signIdx }) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const choose = (i) => { $sign.set(String(i)); onClose(); };
  return html`<dialog id="signsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">${grip}
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
