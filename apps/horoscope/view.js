import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Sheet } from "/_rt/ui.js";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { sunSign } from "/_rt/horoscope.js";
import { useLocalized } from "/_rt/localize.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Scramble, Pixels } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const QS = new URLSearchParams(location.search);
const SIGN_OVERRIDE = QS.get("sign"); 

const API = `${VPS_PROXY}/horoscope`;
const DAY_IDS = ["yesterday", "today", "tomorrow"], DAY_KEYS = ["dYesterday", "dToday", "dTomorrow"];

const RATINGS = [["love", "sex", "#FB7185"], ["work", "hustle", "#60A5FA"], ["vibe", "vibe", "#A78BFA"], ["success", "success", "#34D399"]];

const $sign = persistentAtom("horoscope.sign", "");
const clampSign = (n) => Math.max(0, Math.min(11, Number(n) || 0));
const ck = (s, d) => `horoscope:v3:${s}:${d}`;
const readCache = (s, d) => { try { return JSON.parse(localStorage.getItem(ck(s, d)) || "null"); } catch { return null; } };
const writeCache = (s, d, v) => { try { localStorage.setItem(ck(s, d), JSON.stringify(v)); } catch {  } };

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
  const stored = useStore($sign);
  const now = gate ? new Date(2027, 6, 23) : new Date();          
  const signIdx = (SIGN_OVERRIDE != null && SIGN_OVERRIDE !== "") ? clampSign(SIGN_OVERRIDE)
    : stored === "" ? sunSign(now.getMonth() + 1, now.getDate()) : clampSign(stored);
  const [day, setDay] = useState(1);                              
  const [data, setData] = useState(gate ? GATE[DAY_IDS[1]] : null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const dayId = DAY_IDS[day];
    if (gate) { setData(GATE[dayId]); setErr(false); return; }
    const cached = readCache(signIdx, dayId);
    setData(cached || null);
    setErr(false);
    let live = true;
    fetchReading(signIdx, dayId)
      .then((d) => { if (!live) return; setData(d); setErr(false); writeCache(signIdx, dayId, d); })
      .catch(() => { if (live) setErr(!cached); });               
    return () => { live = false; };
  }, [signIdx, day]);

  const { text: readingText, pending: localizing } = useLocalized(data?.text, loc);
  const dateLabel = data?.date ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + (day - 1))
    .toLocaleDateString(loc === "en" ? "en-GB" : loc || "uk", { day: "numeric", month: "long" }) : "";

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <button data-sign class="w-full flex items-center gap-4 rounded-2xl sf-raised sf-e2 sf-press p-4 transition" onClick=${() => openScreen("signs")}>
        <span class="shrink-0 text-secondary"><${Sign} i=${signIdx} cls="w-11 h-11" /></span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-bold text-lg leading-tight">${(t.signs || "").split("|")[signIdx] || ""}</span>
          <span class="block text-xs text-base-content/55 font-mono mt-0.5">${(t.signDates || "").split("|")[signIdx] || ""}</span>
        </span>
        ${Icon("lucide:chevrons-up-down", "text-base-content/35 text-xl shrink-0")}
      </button>

      
      <div role="tablist" class="grid grid-cols-3 gap-1 p-1 rounded-2xl sf-inset">
        ${[0, 1, 2].map((i) => html`<button role="tab" data-day=${DAY_IDS[i]} aria-selected=${day === i} class=${`min-w-0 truncate py-2 rounded-xl text-sm font-medium transition sf-press ${day === i ? "bg-primary text-primary-content sf-e3" : "text-muted"}`} onClick=${() => setDay(i)} key=${i}>${T(t, DAY_KEYS[i])}</button>`)}
      </div>
      ${err && !data
      ? html`<div class="flex flex-col items-center text-muted py-16 gap-3 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "noConnection")}</span></div>`
      : !data
        ? html`<!-- structure-shaped skeleton (date · prose lines · ratings) — never a bare spinner -->
          <div class="flex flex-col gap-4">
            <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/40"><${Scramble} len=${11} /></div>
            <div class="flex flex-col gap-2 text-base-content/55">${[26, 30, 28, 18].map((n, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>
            <div class="rounded-2xl sf-inset overflow-hidden h-32"><${Pixels} /></div>
          </div>`
        : html`<!-- reading -->
          <div class="flex flex-col gap-4">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${dateLabel}</span>
              ${err ? html`<span class="text-[0.62rem] text-warning/80 truncate">${T(t, "offline")}</span>` : null}
            </div>
            ${localizing
      ? html`<!-- translating + rewriting: hold the animated skeleton until the final natural text is ready -->
          <div class="flex flex-col gap-2 text-base-content/55">${[26, 30, 28, 18].map((n, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`
      : html`<p data-reading data-live class="text-[0.97rem] leading-relaxed text-base-content/90">${readingText}</p>`}

            <!-- the day's four real star ratings -->
            <div data-ratings class="flex flex-col gap-2.5 rounded-2xl sf-raised sf-e2 p-4">
              <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45 mb-0.5">${T(t, "ratings")}</div>
              ${RATINGS.map(([label, key, c]) => html`<div class="flex items-center gap-3" key=${key}>
                <span class="w-16 shrink-0 text-xs text-base-content/70">${T(t, label)}</span>
                
                <span class="flex-1 flex gap-1">${[0, 1, 2, 3, 4].map((n) => html`<span class="flex-1 h-1.5 rounded-full" style=${`background:${n < (data.ratings[key] || 0) ? c : "var(--sf-track-face)"}`} key=${n}></span>`)}</span>
              </div>`)}
            </div>
          </div>`}
    </div>
    <${SignSheet} open=${screen === "signs"} onClose=${closeScreen} t=${t} signIdx=${signIdx} />
  </${Fragment}>`;
}

function SignSheet({ open, onClose, t, signIdx }) {
  const choose = (i) => { $sign.set(String(i)); onClose(); };
  return html`<${Sheet} id="signsheet" open=${open} onClose=${onClose} title=${T(t, "pickSign")} icon="lucide:sparkles">
      
      <div class="grid grid-cols-3 gap-2 sf-inset rounded-2xl p-2">
        ${Array.from({ length: 12 }, (_, i) => html`<button data-signpick=${i} aria-pressed=${i === signIdx} class=${`flex flex-col items-center gap-1.5 py-3 rounded-2xl transition ${i === signIdx ? "bg-secondary/10 text-secondary" : "text-base-content/80"}`} onClick=${() => choose(i)} key=${i}>
          <${Sign} i=${i} cls="w-6 h-6" />
          <span class="text-xs truncate max-w-full">${(t.signs || "").split("|")[i] || ""}</span>
        </button>`)}
      </div>
  </${Sheet}>`;
}