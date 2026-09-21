/* @ts-self-types="./calendar.d.ts" */
/**
 * # runtime/calendar.js — one month grid for any tool view, data-agnostic
 *
 * A month calendar: the month's own days in a 7-column grid, a dot on every day the caller marked, one
 * selected day, and arrows that page the month within optional bounds. It is SYSTEMIC in the same sense
 * `globe.js` is — it knows nothing about what a day CONTAINS. The caller hands it `marks` (which days have
 * something) and gets back the day that was tapped; what appears under the grid is the app's business.
 * Weekday and month names come from `Intl`, so the calendar speaks whatever locale the document is in
 * without a single i18n key from the app, and its own two buttons take their names from the SYS dictionary
 * (the `close`-button rule: the component that paints a control owns its label).
 *
 * The grid renders ONLY the month's own days — the leading and trailing cells are blanks, not the
 * neighbouring months' numbers. A number you can read but must not trust is worse than a gap.
 *
 * ![The calendar map: a month key into a week matrix, the caller's marks as dots, and the three outputs — the picked day, the paged month, the bounds that grey the arrows](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-calendar.svg)
 *
 * ## Import
 * ```js
 * import { Calendar, monthGrid, dayKey, monthKey, addMonths } from "/_rt/calendar.js";                    // an app's page: the import map resolves /_rt/
 * import { Calendar, monthGrid, dayKey, monthKey, addMonths } from "@microspec/core/runtime/calendar.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Calendar} — the Preact component: `month` ("YYYY-MM", uncontrolled when `onMonth` is absent),
 *   `value` (selected "YYYY-MM-DD"), `marks` (day keys as an array or a `{ key: count }` map), `onPick(key)`,
 *   `onMonth(ym)`, `min` / `max` ("YYYY-MM" bounds for the arrows), `pick` ("all" | "marked"), `locale`.
 * - {@link monthGrid} — `monthGrid("2026-09")` → `{ year, month, weeks }`, the weeks being rows of 7 cells,
 *   each cell a `{ key, day }` or null. Pure, so the layout is unit-tested without a DOM.
 * - {@link dayKey} / {@link monthKey} — a Date or timestamp → its LOCAL "YYYY-MM-DD" / "YYYY-MM" ("" when invalid).
 * - {@link addMonths} — `addMonths("2026-12", 1)` → "2027-01", the month arithmetic the arrows ride on.
 * - {@link markMap} — normalise `marks` (array | object | Map) into a `Map<dayKey, count>`.
 *
 * ## In practice
 * ```js
 * // launches — a month of rocket launches; only days that actually carry one are pickable
 * import { Calendar, dayKey, monthKey } from "/_rt/calendar.js";
 * const marks = {};                                    // "2026-09-23": 2
 * for (const l of dated) marks[l.day] = (marks[l.day] || 0) + 1;
 * html`<${Calendar} month=${ym} onMonth=${setYm} marks=${marks} value=${day} pick="marked"
 *        onPick=${(k) => setDay(k === day ? null : k)} min=${monthKey(Date.now())} />`;
 * ```
 *
 * ## How it fits
 * Imports `htm/preact`, `preact/hooks` and `i18n.js` (`sys` — the two arrow labels and "Today" from the SYS
 * dictionary). Nothing else: no date library, no CSS of its own. It reads the density tokens
 * (`--ms-gap`, `--ms-r`, `--ms-r-in`, `--ms-label`) and paints a marked day with `--app-accent` as a DOT,
 * never as a text-bearing fill — the kit's colour rule, which is why the selected day uses `bg-primary`
 * instead.
 *
 * ## Invariants and pitfalls
 * - Days are LOCAL, never UTC. A launch at 23:30Z is tomorrow in Kyiv, and a calendar that keys on the ISO
 *   string's first ten characters puts it on the wrong square for half the planet. `dayKey` goes through
 *   `getFullYear`/`getMonth`/`getDate` for exactly that reason.
 * - The week starts on Monday (`weekStart`, default 1). `Intl` has no stable first-day-of-week across
 *   engines, so it is a prop with a European default rather than a guess that differs per browser.
 * - A month has 4–6 week rows and the grid renders the rows it needs, so February starting on a Monday
 *   does not leave a blank strip at the bottom.
 * - `pick="marked"` renders an unmarked day as plain text, not a disabled button: a control that can be
 *   focused and does nothing is a dead affordance the a11y gate cannot see.
 * - The component is controlled when `onMonth` is passed and self-driving when it is not; `month` is still
 *   honoured as the initial month in the second case, so both callers write the same prop.
 * @module
 */
// microspec runtime — the month grid (SYSTEMIC: shared by any tool view that has dated things).
//
// The caller owns the data and the panel below; this owns the geometry, the locale names and the three
// events (a day picked, a month paged, the bounds that stop the paging). Same contract as globe.js.
import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { sys } from "./i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * A Date / timestamp / date string → its LOCAL day key "YYYY-MM-DD".
 * @param d a Date, a millisecond timestamp or anything `new Date()` parses
 * @returns the local day key, or "" when the date is invalid
 */
export function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? "" : `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
/**
 * A Date / timestamp / date string → its LOCAL month key "YYYY-MM".
 * @param d a Date, a millisecond timestamp or anything `new Date()` parses
 * @returns the local month key, or "" when the date is invalid
 */
export const monthKey = (d) => dayKey(d).slice(0, 7);

/**
 * Month arithmetic on a "YYYY-MM" key — the step the arrows take, December → January included.
 * @param ym a month key "YYYY-MM"
 * @param n months to add (may be negative)
 * @returns the shifted month key, or "" when `ym` is not a month key
 */
export function addMonths(ym, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return "";
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + (Number(n) || 0);
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

/**
 * The month's layout: week rows of seven cells, each a `{ key, day }` or null for a blank.
 * Pure — the grid is unit-tested without a DOM.
 * @param ym a month key "YYYY-MM"
 * @param weekStart the weekday the row begins on (0 = Sunday, default 1 = Monday)
 * @returns `{ year, month, weeks }` — `month` is 1-based; `weeks` has as many rows as the month needs
 */
export function monthGrid(ym, weekStart = 1) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return { year: 0, month: 0, weeks: [] };
  const year = Number(m[1]), month = Number(m[2]);
  const first = new Date(year, month - 1, 1);
  const len = new Date(year, month, 0).getDate();
  // how many blanks before the 1st: the distance from the row's first weekday to the 1st's weekday
  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= len; d++) cells.push({ key: `${year}-${pad2(month)}-${pad2(d)}`, day: d });
  while (cells.length % 7) cells.push(null);          // pad the LAST row only — never a whole empty one
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year, month, weeks };
}

/**
 * Normalise the `marks` prop into counts per day.
 * @param marks an array of day keys, an object `{ key: count }`, or a Map
 * @returns a `Map<dayKey, count>` (an array of repeated keys counts its repeats)
 */
export function markMap(marks) {
  const out = new Map();
  if (!marks) return out;
  if (marks instanceof Map) { for (const [k, v] of marks) out.set(k, Number(v) || 0); return out; }
  if (Array.isArray(marks)) { for (const k of marks) out.set(k, (out.get(k) || 0) + 1); return out; }
  for (const [k, v] of Object.entries(marks)) out.set(k, Number(v) || 0);
  return out;
}

// The names come from Intl, not from the app's dictionary: a shared component that demanded twelve month
// names and seven weekday names from every app that mounts it would ship the raw key the first time one
// of them was forgotten — the same rule that put the Sheet's "Close" in SYS.
const intlLoc = (loc) => (loc === "uk" ? "uk-UA" : loc || "en-US");
const WEEK_REF = Date.UTC(2024, 0, 1);   // a Monday, in UTC — a fixed anchor for naming the weekdays

/**
 * The month calendar (Preact): a 7-column grid of the month's own days, a dot on every marked day, one
 * selected day and arrows that page the month.
 * @param month    displayed month "YYYY-MM"; without `onMonth` it is only the INITIAL month
 * @param value    the selected day key "YYYY-MM-DD", or null
 * @param marks    day keys carrying something — an array, a `{ key: count }` object or a Map
 * @param onPick   fired with the tapped day key
 * @param onMonth  fired with the new month key; passing it makes the month controlled
 * @param min      earliest month the arrows reach ("YYYY-MM")
 * @param max      latest month the arrows reach ("YYYY-MM")
 * @param pick     "all" (default) or "marked" — whether an empty day is a button at all
 * @param weekStart the weekday a row starts on (0 = Sunday, default 1 = Monday)
 * @param locale   locale code for the month and weekday names (defaults to `<html lang>`)
 * @returns the calendar's VNode
 */
export function Calendar({ month, value, marks, onPick, onMonth, min, max, pick = "all", weekStart = 1, locale }) {
  const today = dayKey(new Date());
  const [own, setOwn] = useState(month || today.slice(0, 7));
  const ym = onMonth ? (month || today.slice(0, 7)) : own;
  const go = (ymNext) => { if (onMonth) onMonth(ymNext); else setOwn(ymNext); };

  const lang = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const loc = intlLoc(lang);
  const marked = markMap(marks);
  const { year, month: mon, weeks } = monthGrid(ym, weekStart);
  const prev = addMonths(ym, -1), next = addMonths(ym, 1);
  const canPrev = !!prev && (!min || prev >= min);
  const canNext = !!next && (!max || next <= max);

  const title = year ? new Date(year, mon - 1, 1).toLocaleDateString(loc, { month: "long", year: "numeric" }) : "";
  const names = Array.from({ length: 7 }, (_, i) =>
    new Date(WEEK_REF + ((weekStart + i - 1 + 7) % 7) * 86400000).toLocaleDateString(loc, { weekday: "short", timeZone: "UTC" }));

  const arrow = (icon, to, can, label) => html`<button type="button" data-cal-step=${icon.endsWith("left") ? "prev" : "next"}
    class="btn btn-ghost btn-sm btn-circle" disabled=${!can} aria-label=${label} onClick=${() => can && go(to)}>${Icon(icon, "text-lg")}</button>`;

  return html`<div class="@container flex flex-col gap-2" data-calendar=${ym}>
    <div class="flex items-center justify-between gap-1">
      ${arrow("lucide:chevron-left", prev, canPrev, sys("calPrev", lang))}
      ${/* the month name is the calendar's heading; aria-live so paging is announced without a focus move */""}
      <span data-cal-title aria-live="polite" class="font-semibold text-center grow min-w-0 truncate first-letter:uppercase">${title}</span>
      ${arrow("lucide:chevron-right", next, canNext, sys("calNext", lang))}
    </div>
    <div class="grid grid-cols-7 gap-0.5" aria-hidden="true">
      ${names.map((n, i) => html`<span key=${i} class="text-center font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-base-content/70 truncate">${n}</span>`)}
    </div>
    <div class="grid grid-cols-7 gap-0.5">
      ${weeks.map((w, wi) => w.map((c, ci) => {
        if (!c) return html`<span key=${`${wi}-${ci}`} class="aspect-square"></span>`;
        const n = marked.get(c.key) || 0;
        const on = c.key === value, isToday = c.key === today;
        // The accent is a MARK (the dot), never the fill behind a number — an arbitrary hue as type fails
        // contrast in one of the two themes. The SELECTED day therefore takes the theme's own primary pair,
        // exactly as Segmented's solid variant does.
        const face = `relative aspect-square w-full rounded-[var(--ms-r-in)] flex items-center justify-center tabular-nums text-[0.82rem] @max-[260px]:text-[0.7rem] ${
          on ? "bg-primary text-primary-content font-semibold" : isToday ? "sf-inset font-semibold" : ""}`;
        const dot = n ? html`<span class=${`absolute bottom-[12%] w-1 h-1 rounded-full ${on ? "bg-primary-content" : ""}`}
          style=${on ? "" : "background:var(--app-accent)"} aria-hidden="true"></span>` : null;
        const label = `${new Date(year, mon - 1, c.day).toLocaleDateString(loc, { day: "numeric", month: "long" })}${n ? ` — ${n}` : ""}`;
        // pick="marked": an empty day is plain text. A disabled button is still a tab stop that answers
        // nothing, and no a11y gate reports "this control does nothing" — so it simply is not a control.
        if (pick === "marked" && !n) return html`<span key=${c.key} class=${`${face} text-base-content/35`}>${c.day}</span>`;
        return html`<button key=${c.key} type="button" data-cal-day=${c.key} aria-pressed=${on} aria-current=${isToday ? "date" : null}
          aria-label=${label} class=${`${face} transition-colors ${on ? "" : "hover:bg-base-content/10"}`}
          onClick=${() => onPick && onPick(c.key)}>${c.day}${dot}</button>`;
      }))}
    </div>
  </div>`;
}
