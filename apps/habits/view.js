// Habits — a local-first streak tracker. No API, no backend: every habit and every daily check-in lives in
// the device's IndexedDB (/_rt/db.js), so it works fully offline and the data is the user's. This is a
// stateful productivity app — CRUD + streak math + a GitHub-style contribution heatmap — not a read-only
// feed. Sub-screens (habit detail, add sheet) route through the runtime's S.screen / S.sheet so the system
// Back button closes them (never exits the PWA). Haptics on every check-in.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { haptic } from "/_rt/sensors.js";
import { collection, idbSupported } from "/_rt/db.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const habitsColl = collection("habits");
const marksColl = collection("marks");

// ---- shared local state -----------------------------------------------------
const $habits = atom([]);   // [{ id, name, icon, color, createdAt }]
const $marks = atom({});    // { "habitId|YYYY-MM-DD": 1 }
const $ready = atom(false);
const $draft = atom({ name: "", icon: "lucide:check", color: "#10b981" });

const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const ICONS = ["lucide:check", "lucide:dumbbell", "lucide:book-open", "lucide:droplets", "lucide:moon", "lucide:footprints", "lucide:apple", "lucide:brain", "lucide:pencil", "lucide:heart-pulse", "lucide:leaf", "lucide:music"];

// ---- date helpers (all LOCAL — a habit day is the user's calendar day) ------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const weekdayMon = (d) => (d.getDay() + 6) % 7;                 // Mon=0 … Sun=6
const between = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);

// ---- streak math ------------------------------------------------------------
function streak(id, marks) {
  let n = 0; const start = marks[id + "|" + today()] ? 0 : 1;   // today undone → streak may still run through yesterday
  for (let i = start; ; i++) { if (marks[id + "|" + ymd(addDays(new Date(), -i))]) n++; else break; }
  return n;
}
function longest(id, marks) {
  const days = Object.keys(marks).filter((k) => k.startsWith(id + "|")).map((k) => k.slice(id.length + 1)).sort();
  let max = 0, run = 0, prev = null;
  for (const d of days) { run = (prev && between(prev, d) === 1) ? run + 1 : 1; if (run > max) max = run; prev = d; }
  return max;
}
function monthRate(id, marks) {
  const now = new Date(), done = [];
  for (let i = 0; i < now.getDate(); i++) if (marks[id + "|" + ymd(addDays(now, -i))]) done.push(1);
  return Math.round((done.length / now.getDate()) * 100);
}

// ---- persistence ------------------------------------------------------------
async function loadAll() {
  try {
    const hs = await habitsColl.all();
    if (!hs.length && typeof location !== "undefined" && location.search.includes("seed")) { await seed(); return loadAll(); }
    const ms = await marksColl.all();
    const map = {}; for (const m of ms) map[m.id] = 1;
    $habits.set(hs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    $marks.set(map);
  } catch { /* no IndexedDB (headless preflight) → stay empty, app still renders */ }
  $ready.set(true);
}
async function addHabit(name, icon, color) {
  const id = "h" + Date.now().toString(36) + Math.floor(performance.now()).toString(36);
  const h = { name: name.trim(), icon, color, createdAt: Date.now() };
  $habits.set([...$habits.get(), { id, ...h }]);
  try { await habitsColl.put(id, h); } catch { /* */ }
  return id;
}
async function removeHabit(id) {
  $habits.set($habits.get().filter((h) => h.id !== id));
  const m = { ...$marks.get() }; for (const k in m) if (k.startsWith(id + "|")) delete m[k]; $marks.set(m);
  try { await habitsColl.remove(id); const all = await marksColl.all(); await Promise.all(all.filter((r) => r.id.startsWith(id + "|")).map((r) => marksColl.remove(r.id))); } catch { /* */ }
}
async function toggle(id, day) {
  const key = id + "|" + day, m = { ...$marks.get() };
  if (m[key]) { delete m[key]; $marks.set(m); haptic.tick(); try { await marksColl.remove(key); } catch { /* */ } }
  else { m[key] = 1; $marks.set(m); haptic.bump(); try { await marksColl.put(key, { d: 1 }); } catch { /* */ } }
}
async function seed() {
  const defs = [["Читати", "lucide:book-open", "#3b82f6"], ["Спорт", "lucide:dumbbell", "#10b981"], ["Вода", "lucide:droplets", "#14b8a6"]];
  for (let i = 0; i < defs.length; i++) {
    const id = "seed" + i; await habitsColl.put(id, { name: defs[i][0], icon: defs[i][1], color: defs[i][2], createdAt: Date.now() + i });
    for (let d = 0; d < 70; d++) if ((d * 3 + i * 5) % 4 !== 0) await marksColl.put(id + "|" + ymd(addDays(new Date(), -d)), { d: 1 });
  }
}
function exportData() {
  const blob = new Blob([JSON.stringify({ habits: $habits.get(), marks: Object.keys($marks.get()) }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "habits.json"; a.click(); URL.revokeObjectURL(a.href);
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    for (const h of d.habits || []) await habitsColl.put(h.id, { name: h.name, icon: h.icon, color: h.color, createdAt: h.createdAt || Date.now() });
    for (const k of d.marks || []) await marksColl.put(k, { d: 1 });
    await loadAll();
  } catch { /* bad file — ignore */ }
}

// ---- small pieces -----------------------------------------------------------
const Dots = ({ h, marks, onToggle, t }) => {
  const days = []; for (let i = 6; i >= 0; i--) days.push(ymd(addDays(new Date(), -i)));
  return html`<div class="overflow-x-auto -mx-0.5 px-0.5"><div class="flex gap-1.5 w-max" role="group" aria-label=${T(t, "week")}>${days.map((d) => {
    const on = !!marks[h.id + "|" + d], isToday = d === today();
    return html`<button key=${d} onClick=${() => onToggle(h.id, d)} aria-pressed=${on}
      aria-label=${`${d} ${on ? T(t, "done") : T(t, "notDone")}`}
      class=${`w-7 h-7 rounded-lg shrink-0 border transition active:scale-90 ${isToday ? "ring-2 ring-offset-1 ring-offset-base-100" : ""}`}
      style=${`border-color:${on ? h.color : "var(--fallback-b3,#d1d5db)"};background:${on ? h.color : "transparent"};${isToday ? "--tw-ring-color:" + h.color : ""}`}></button>`;
  })}</div></div>`;
};

function Heatmap({ h, marks, onToggle, t }) {
  const now = new Date(), WEEKS = 13;
  const start = addDays(now, -weekdayMon(now) - 7 * (WEEKS - 1));   // Monday, WEEKS-1 weeks back
  const cols = [];
  for (let w = 0; w < WEEKS; w++) {
    const cells = [];
    for (let r = 0; r < 7; r++) {
      const d = ymd(addDays(start, w * 7 + r)), future = between(today(), d) > 0, on = !!marks[h.id + "|" + d];
      cells.push(html`<button key=${d} disabled=${future} onClick=${() => onToggle(h.id, d)}
        aria-label=${`${d} ${on ? T(t, "done") : T(t, "notDone")}`}
        class=${`w-3.5 h-3.5 rounded-[3px] ${future ? "opacity-0" : "active:scale-90"} ${d === today() ? "ring-1" : ""}`}
        style=${`background:${on ? h.color : "var(--fallback-b2,#e5e7eb)"};${d === today() ? "--tw-ring-color:" + h.color : ""}`}></button>`);
    }
    cols.push(html`<div class="flex flex-col gap-[3px]" key=${w}>${cells}</div>`);
  }
  return html`<div class="overflow-x-auto -mx-1 px-1"><div class="flex gap-[3px] w-max">${cols}</div></div>`;
}

// Colour is carried by the icon tile + dots + heatmap (non-text), never by text — a light habit colour as
// text fails contrast on the light theme. Stats stay in the accessible base-content ink.
const Stat = ({ n, label }) => html`<div class="flex-1 text-center">
  <div class="text-2xl font-bold tabular-nums">${n}</div>
  <div class="text-xs text-base-content/60 mt-0.5">${label}</div></div>`;

// ---- add / edit sheet -------------------------------------------------------
function AddSheet({ S, t }) {
  const draft = useStore($draft);
  const close = () => S.sheet.set(false);
  const save = async () => { if (!draft.name.trim()) return; await addHabit(draft.name, draft.icon, draft.color); $draft.set({ name: "", icon: "lucide:check", color: "#10b981" }); close(); };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 flex items-end" style="padding-bottom:env(safe-area-inset-bottom)">
    <button class="absolute inset-0 bg-black/40" aria-label=${T(t, "close")} onClick=${close}></button>
    <div class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl border-t border-base-300 p-5 pb-8 flex flex-col gap-4">
      <div class="flex items-center justify-between"><h2 class="font-bold text-lg">${T(t, "newHabit")}</h2>
        <button class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${close}>${Icon("lucide:x", "text-xl")}</button></div>
      <input id="h-name" class="input input-bordered rounded-2xl w-full" placeholder=${T(t, "namePh")} value=${draft.name}
        maxlength="40" onInput=${(e) => $draft.set({ ...draft, name: e.target.value })} />
      <div><div class="text-xs text-base-content/60 mb-1.5">${T(t, "icon")}</div>
        <div class="flex flex-wrap gap-2" id="h-icons">${ICONS.map((ic) => html`<button key=${ic} aria-label=${ic} aria-pressed=${draft.icon === ic}
          onClick=${() => $draft.set({ ...draft, icon: ic })}
          class=${`w-10 h-10 rounded-xl border flex items-center justify-center ${draft.icon === ic ? "border-2" : "border-base-300"}`}
          style=${draft.icon === ic ? `border-color:${draft.color};color:${draft.color}` : ""}>${Icon(ic, "text-lg")}</button>`)}</div></div>
      <div><div class="text-xs text-base-content/60 mb-1.5">${T(t, "color")}</div>
        <div class="flex flex-wrap gap-2">${COLORS.map((c) => html`<button key=${c} aria-label=${c} aria-pressed=${draft.color === c}
          onClick=${() => $draft.set({ ...draft, color: c })}
          class=${`w-8 h-8 rounded-full ${draft.color === c ? "ring-2 ring-offset-2 ring-offset-base-100" : ""}`}
          style=${`background:${c};${draft.color === c ? "--tw-ring-color:" + c : ""}`}></button>`)}</div></div>
      <button id="h-save" class="btn btn-primary rounded-2xl mt-1" disabled=${!draft.name.trim()} onClick=${save}>${T(t, "add")}</button>
    </div></div>`;
}

// ---- habit detail screen ----------------------------------------------------
function Detail({ id, S, t, closeScreen }) {
  const habits = useStore($habits), marks = useStore($marks);
  const h = habits.find((x) => x.id === id);
  if (!h) return null;
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1" style="padding-top:env(safe-area-inset-top)">
      <button id="d-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold truncate px-1 flex items-center gap-2"><span style=${`color:${h.color}`}>${Icon(h.icon, "text-xl")}</span> <span class="truncate">${h.name}</span></div>
    </header>
    <div class="px-4 pt-4 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 flex-row">
        <${Stat} n=${streak(h.id, marks)} label=${T(t, "streak")} />
        <${Stat} n=${longest(h.id, marks)} label=${T(t, "best")} />
        <${Stat} n=${monthRate(h.id, marks) + "%"} label=${T(t, "month")} />
      </div></div>
      <div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 gap-2">
        <div class="text-sm font-semibold">${T(t, "last13")}</div>
        <${Heatmap} h=${h} marks=${marks} onToggle=${toggle} t=${t} />
      </div></div>
      <button id="d-del" class="btn btn-ghost text-error rounded-2xl border border-base-300 gap-2" onClick=${async () => { await removeHabit(h.id); closeScreen(); }}>${Icon("lucide:trash-2")} ${T(t, "delete")}</button>
    </div></div>`;
}

// ---- main tool view ---------------------------------------------------------
export function habits({ S, closeScreen }) {
  const t = useStore(S.t), hs = useStore($habits), marks = useStore($marks), ready = useStore($ready), screen = useStore(S.screen), sheet = useStore(S.sheet);
  useEffect(() => { loadAll(); }, []);

  const detailId = typeof screen === "string" && screen.startsWith("habit:") ? screen.slice(6) : null;

  return html`<${Fragment}>
    ${!ready ? null : hs.length === 0 ? html`
      <div class="flex flex-col items-center justify-center text-center gap-3 py-16 px-6 text-base-content/70">
        ${Icon("lucide:sprout", "text-5xl text-primary/70")}
        <div class="font-semibold text-base-content">${T(t, "emptyTitle")}</div>
        <button id="empty-add" class="btn btn-primary rounded-2xl gap-2 mt-1" onClick=${() => S.sheet.set(true)}>${Icon("lucide:plus")} ${T(t, "addFirst")}</button>
        ${idbSupported ? null : html`<div class="text-xs text-warning mt-2">${T(t, "noStore")}</div>`}
      </div>` : html`
      <div class="flex flex-col gap-2.5">
        ${hs.map((h) => { const s = streak(h.id, marks); return html`<div key=${h.id} data-habit=${h.id} class="card bg-base-100 border border-base-300 rounded-2xl">
          <div class="card-body p-3.5 gap-3">
            <div class="flex items-center gap-3">
              <button data-open class="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70" aria-label=${`${h.name} — ${T(t, "open")}`} onClick=${() => S.screen.set("habit:" + h.id)}>
                <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style=${`background:${h.color}1a;color:${h.color}`}>${Icon(h.icon, "text-lg")}</span>
                <span class="min-w-0"><span class="font-semibold block truncate">${h.name}</span>
                  <span class="text-xs text-base-content/60 flex items-center gap-1">${s > 0 ? html`${Icon("lucide:flame", "text-[0.9em]")} ${T(t, "dayStreak", { n: s })}` : T(t, "noStreak")}</span></span>
              </button>
              <button data-today class=${`w-9 h-9 rounded-full shrink-0 border-2 flex items-center justify-center active:scale-90 transition`}
                aria-pressed=${!!marks[h.id + "|" + today()]} aria-label=${`${h.name} ${T(t, "todayToggle")}`}
                style=${`border-color:${h.color};${marks[h.id + "|" + today()] ? "background:" + h.color + ";color:#fff" : "color:" + h.color}`}
                onClick=${() => toggle(h.id, today())}>${Icon("lucide:check", "text-lg")}</button>
            </div>
            <${Dots} h=${h} marks=${marks} onToggle=${toggle} t=${t} />
          </div></div>`; })}

        <div class="flex items-center gap-2 mt-1">
          <button id="add-habit" class="btn btn-primary rounded-2xl flex-1 gap-2" onClick=${() => S.sheet.set(true)}>${Icon("lucide:plus")} ${T(t, "newHabit")}</button>
          <button class="btn btn-ghost btn-square rounded-2xl border border-base-300" aria-label=${T(t, "export")} onClick=${exportData}>${Icon("lucide:download")}</button>
          <label class="btn btn-ghost btn-square rounded-2xl border border-base-300" aria-label=${T(t, "import")}>${Icon("lucide:upload")}
            <input type="file" accept="application/json" class="hidden" onChange=${(e) => e.target.files[0] && importData(e.target.files[0])} /></label>
        </div>
      </div>`}

    ${sheet ? html`<${AddSheet} S=${S} t=${t} />` : null}
    ${detailId ? html`<${Detail} id=${detailId} S=${S} t=${t} closeScreen=${closeScreen} />` : null}
  </${Fragment}>`;
}
