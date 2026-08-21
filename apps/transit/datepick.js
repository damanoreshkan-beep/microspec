import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { Sheet } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const intl = (locale) => (locale === "en" ? "en-GB" : locale || "uk");
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  if (mo < 0 || mo > 11 || d < 1 || d > daysIn(y, mo)) return null;
  return { y, m: mo, d };
}

const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstCol = (y, m) => (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;

const monthName = (locale, m, style = "long") =>
  new Date(Date.UTC(2021, m, 1)).toLocaleDateString(intl(locale), { month: style });
const weekdayName = (locale, i) =>
  new Date(Date.UTC(2021, 2, 1 + i)).toLocaleDateString(intl(locale), { weekday: "short" });

export function DateField({ value, label, locale, placeholder, onOpen, attr }) {
  const p = parseYmd(value);
  const text = p
    ? new Date(Date.UTC(p.y, p.m, p.d)).toLocaleDateString(intl(locale), { day: "numeric", month: "short", year: "numeric" })
    : placeholder;
  return html`<button ...${attr ? { [attr]: "1" } : {}} type="button" onClick=${onOpen}
    class="flex flex-col gap-1 min-w-0 text-left rounded-2xl sf-raised sf-e2 px-3 py-2.5 active:scale-[.99] transition">
    <span class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/65 truncate">${label}</span>
    <span class=${`text-sm tabular-nums truncate ${p ? "font-semibold" : "text-base-content/50"}`}>${text}</span>
  </button>`;
}

const CELL = "h-11 rounded-xl text-sm tabular-nums grid place-items-center transition active:scale-[.97]";
const SEL = "bg-primary text-primary-content font-semibold";

export function CalendarSheet({ open, onClose, value, onPick, locale, title, minYear = 1900, maxYear = new Date().getUTCFullYear() }) {
  const sel = parseYmd(value);
  const today = new Date();
  const [mode, setMode] = useState("day");
  const [cur, setCur] = useState(() => sel || { y: today.getUTCFullYear() - 30, m: today.getUTCMonth(), d: 1 });

  useEffect(() => {
    if (!open) return;
    setMode("day");
    if (sel) setCur(sel);
  }, [open, value]);

  const step = (dm) => {
    const t = cur.m + dm;
    setCur({ ...cur, y: cur.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 });
  };
  const pick = (d) => { onPick(ymd(cur.y, cur.m, d)); onClose(); };

  const header = html`<div class="flex items-center gap-1">
    <button type="button" data-cal-prev aria-label=${monthName(locale, (cur.m + 11) % 12)}
      class="btn btn-ghost btn-sm btn-circle" onClick=${() => (mode === "day" ? step(-1) : setCur({ ...cur, y: Math.max(minYear, cur.y - 24) }))}>
      ${Icon("lucide:chevron-left", "text-xl")}</button>
    <button type="button" data-cal-title class="btn btn-ghost btn-sm flex-1 rounded-xl font-semibold text-sm"
      onClick=${() => setMode(mode === "day" ? "year" : "day")}>
      ${mode === "day" ? `${monthName(locale, cur.m)} ${cur.y}` : `${cur.y}`}
    </button>
    <button type="button" data-cal-next aria-label=${monthName(locale, (cur.m + 1) % 12)}
      class="btn btn-ghost btn-sm btn-circle" onClick=${() => (mode === "day" ? step(1) : setCur({ ...cur, y: Math.min(maxYear, cur.y + 24) }))}>
      ${Icon("lucide:chevron-right", "text-xl")}</button>
  </div>`;

  let body;
  if (mode === "year") {
    const base = Math.max(minYear, cur.y - 12);
    const years = Array.from({ length: 24 }, (_, i) => base + i).filter((y) => y >= minYear && y <= maxYear);
    body = html`<div class="grid grid-cols-4 gap-1.5">
      ${years.map((y) => html`<button type="button" key=${y} data-cal-year=${y}
        class=${`${CELL} ${y === cur.y ? SEL : "sf-inset"}`}
        onClick=${() => { setCur({ ...cur, y }); setMode("month"); }}>${y}</button>`)}
    </div>`;
  } else if (mode === "month") {
    body = html`<div class="grid grid-cols-3 gap-1.5">
      ${Array.from({ length: 12 }, (_, m) => html`<button type="button" key=${m} data-cal-month=${m}
        class=${`${CELL} ${m === cur.m ? SEL : "sf-inset"}`}
        onClick=${() => { setCur({ ...cur, m }); setMode("day"); }}>${monthName(locale, m, "short")}</button>`)}
    </div>`;
  } else {
    const lead = firstCol(cur.y, cur.m), n = daysIn(cur.y, cur.m);
    body = html`<div class="flex flex-col gap-1.5">
      <div class="grid grid-cols-7 gap-1.5">
        ${Array.from({ length: 7 }, (_, i) => html`<div key=${i}
          class="h-6 grid place-items-center text-[0.6rem] font-mono uppercase tracking-wide text-base-content/55">${weekdayName(locale, i)}</div>`)}
      </div>
      <div class="grid grid-cols-7 gap-1.5">
        ${Array.from({ length: lead }, (_, i) => html`<div key=${"x" + i}></div>`)}
        ${Array.from({ length: n }, (_, i) => {
          const d = i + 1, on = sel && sel.y === cur.y && sel.m === cur.m && sel.d === d;
          return html`<button type="button" key=${d} data-cal-day=${d}
            class=${`${CELL} ${on ? SEL : "sf-inset"}`} onClick=${() => pick(d)}>${d}</button>`;
        })}
      </div>
    </div>`;
  }

  return html`<${Sheet} id="calsheet" open=${open} onClose=${onClose} title=${title} icon="lucide:calendar" locale=${locale}>
    <div class="flex flex-col gap-[var(--ms-gap)]">${header}${body}</div>
  </${Sheet}>`;
}
