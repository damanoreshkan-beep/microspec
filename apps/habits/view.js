import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { haptic } from "/_rt/sensors.js";
import { collection, idbSupported } from "/_rt/db.js";
import { downloadBlob } from "/_rt/apk.js";
import { Panel, Sheet } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70";

const habitsColl = collection("habits");
const marksColl = collection("marks");

const $habits = atom([]);   
const $marks = atom({});    
const $ready = atom(false);
const $draft = atom({ name: "", icon: "lucide:check", color: "#10b981" });

const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const ICONS = ["lucide:check", "lucide:dumbbell", "lucide:book-open", "lucide:droplets", "lucide:moon", "lucide:footprints", "lucide:apple", "lucide:brain", "lucide:pencil", "lucide:heart-pulse", "lucide:leaf", "lucide:music"];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const weekdayMon = (d) => (d.getDay() + 6) % 7;                 
const between = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);

function streak(id, marks) {
  let n = 0; const start = marks[id + "|" + today()] ? 0 : 1;   
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

async function loadAll() {
  try {
    const hs = await habitsColl.all();
    if (!hs.length && typeof location !== "undefined" && location.search.includes("seed")) { await seed(); return loadAll(); }
    const ms = await marksColl.all();
    const map = {}; for (const m of ms) map[m.id] = 1;
    $habits.set(hs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    $marks.set(map);
  } catch {  }
  $ready.set(true);
}
async function addHabit(name, icon, color) {
  const id = "h" + Date.now().toString(36) + Math.floor(performance.now()).toString(36);
  const h = { name: name.trim(), icon, color, createdAt: Date.now() };
  $habits.set([...$habits.get(), { id, ...h }]);
  try { await habitsColl.put(id, h); } catch {  }
  return id;
}
async function removeHabit(id) {
  $habits.set($habits.get().filter((h) => h.id !== id));
  const m = { ...$marks.get() }; for (const k in m) if (k.startsWith(id + "|")) delete m[k]; $marks.set(m);
  try { await habitsColl.remove(id); const all = await marksColl.all(); await Promise.all(all.filter((r) => r.id.startsWith(id + "|")).map((r) => marksColl.remove(r.id))); } catch {  }
}
async function toggle(id, day) {
  const key = id + "|" + day, m = { ...$marks.get() };
  if (m[key]) { delete m[key]; $marks.set(m); haptic.tick(); try { await marksColl.remove(key); } catch {  } }
  else { m[key] = 1; $marks.set(m); haptic.bump(); try { await marksColl.put(key, { d: 1 }); } catch {  } }
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
  downloadBlob(blob, "habits.json");   
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    for (const h of d.habits || []) await habitsColl.put(h.id, { name: h.name, icon: h.icon, color: h.color, createdAt: h.createdAt || Date.now() });
    for (const k of d.marks || []) await marksColl.put(k, { d: 1 });
    await loadAll();
  } catch {  }
}

const Dots = ({ h, marks, onToggle, t }) => {
  const days = []; for (let i = 7; i >= 1; i--) days.push(ymd(addDays(new Date(), -i)));
  return html`<div class="overflow-x-auto -mx-0.5 px-0.5"><div class="flex gap-1.5 w-max pt-0.5" role="group" aria-label=${T(t, "week")}>${days.map((d) => {
    const on = !!marks[h.id + "|" + d];
    return html`<button key=${d} type="button" onClick=${() => onToggle(h.id, d)} aria-pressed=${on}
      aria-label=${`${d} ${on ? T(t, "done") : T(t, "notDone")}`}
      class=${`w-6 h-6 rounded-md shrink-0 transition active:scale-90 ${on ? "sf-e2" : "sf-inset"}`}
      style=${on ? `background:${h.color}` : ""}></button>`;
  })}</div></div>`;
};

function Heatmap({ h, marks, onToggle, t }) {
  const now = new Date(), WEEKS = 13;
  const start = addDays(now, -weekdayMon(now) - 7 * (WEEKS - 1));   
  const cols = [];
  for (let w = 0; w < WEEKS; w++) {
    const cells = [];
    for (let r = 0; r < 7; r++) {
      const d = ymd(addDays(start, w * 7 + r)), future = between(today(), d) > 0, on = !!marks[h.id + "|" + d];
      cells.push(html`<button key=${d} type="button" disabled=${future} onClick=${() => onToggle(h.id, d)}
        aria-label=${`${d} ${on ? T(t, "done") : T(t, "notDone")}`}
        class=${`w-3.5 h-3.5 rounded-[3px] ${future ? "opacity-0" : "active:scale-90"} ${on ? "" : "sf-inset"}`}
        style=${`${on ? "background:" + h.color + ";" : ""}${d === today() ? "outline:1px solid " + h.color + ";outline-offset:1px" : ""}`}></button>`);
    }
    cols.push(html`<div class="flex flex-col gap-[3px]" key=${w}>${cells}</div>`);
  }
  return html`<div class="overflow-x-auto -mx-1 px-1"><div class="flex gap-[3px] w-max">${cols}</div></div>`;
}

const Stat = ({ n, label }) => html`<div class="flex-1 text-center">
  <div class="text-2xl font-bold tabular-nums">${n}</div>
  <div class="text-xs text-muted mt-0.5">${label}</div></div>`;

function AddSheet({ open, onClose, t }) {
  const draft = useStore($draft);
  const save = async () => { if (!draft.name.trim()) return; await addHabit(draft.name, draft.icon, draft.color); $draft.set({ name: "", icon: "lucide:check", color: "#10b981" }); onClose(); };
  return html`<${Sheet} id="h-add" open=${open} onClose=${onClose} title=${T(t, "newHabit")} icon="lucide:plus">
    <input id="h-name" class="input rounded-2xl w-full" placeholder=${T(t, "namePh")} value=${draft.name}
      maxlength="40" onInput=${(e) => $draft.set({ ...draft, name: e.target.value })} />
    <div class="flex flex-col gap-1.5">
      <div class=${LABEL}>${T(t, "icon")}</div>
      <div class="sf-inset rounded-2xl p-2 flex flex-wrap gap-2" id="h-icons">${ICONS.map((ic) => html`<button key=${ic} type="button" aria-label=${ic} aria-pressed=${draft.icon === ic}
        onClick=${() => $draft.set({ ...draft, icon: ic })}
        class="w-10 h-10 rounded-xl flex items-center justify-center transition"
        style=${draft.icon === ic ? `color:${draft.color}` : ""}>${Icon(ic, "text-lg")}</button>`)}</div>
    </div>
    <div class="flex flex-col gap-1.5">
      <div class=${LABEL}>${T(t, "color")}</div>
      <div class="sf-inset rounded-2xl p-2 flex flex-wrap gap-2">${COLORS.map((c) => html`<button key=${c} type="button" aria-label=${c} aria-pressed=${draft.color === c}
        onClick=${() => $draft.set({ ...draft, color: c })}
        class="w-8 h-8 rounded-full transition"
        style=${`background:${c};${draft.color === c ? `outline:2px solid ${c};outline-offset:2px` : ""}`}></button>`)}</div>
    </div>
    <button id="h-save" class="btn btn-primary rounded-2xl mt-1" disabled=${!draft.name.trim()} onClick=${save}>${T(t, "add")}</button>
  </${Sheet}>`;
}



function DetailSheet({ open, id, t, onClose, confirm }) {
  const habits = useStore($habits), marks = useStore($marks);
  const h = habits.find((x) => x.id === id);
  
  const askDelete = () => h && confirm({
    title: T(t, "delHabitTitle", { name: h.name }),
    body: T(t, "delHabitBody", { n: Object.keys(marks).filter((k) => k.startsWith(h.id + "|")).length }),
    verb: T(t, "delete"),
    onConfirm: async () => { await removeHabit(h.id); onClose(); },
  });
  return html`<${Sheet} id="h-detail" open=${open && !!h} onClose=${onClose} title=${h ? h.name : null} icon=${h ? h.icon : null}>
    ${h ? html`<${Fragment}>
      <${Panel}><div class="flex">
        <${Stat} n=${streak(h.id, marks)} label=${T(t, "streak")} />
        <${Stat} n=${longest(h.id, marks)} label=${T(t, "best")} />
        <${Stat} n=${monthRate(h.id, marks) + "%"} label=${T(t, "month")} />
      </div></${Panel}>
      <${Panel} title=${T(t, "last13")}>
        <${Heatmap} h=${h} marks=${marks} onToggle=${toggle} t=${t} />
      </${Panel}>
      <button id="d-del" data-haptic="bump" class="btn text-error rounded-2xl gap-2" onClick=${askDelete}>${Icon("lucide:trash-2")} ${T(t, "delete")}</button>
    </${Fragment}>` : null}
  </${Sheet}>`;
}


export function habits({ S, closeScreen, confirm }) {
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
        ${hs.map((h) => { const done = !!marks[h.id + "|" + today()]; const s = streak(h.id, marks); return html`<${Panel} key=${h.id} data-habit=${h.id}>
            <div class="flex items-center gap-3">
              <button data-open type="button" class="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70" aria-label=${`${h.name} — ${T(t, "open")}`} onClick=${() => S.screen.set("habit:" + h.id)}>
                <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style=${`background:${h.color}1a;color:${h.color}`}>${Icon(h.icon, "text-lg")}</span>
                <span class="min-w-0"><span class="font-semibold block truncate">${h.name}</span>
                  <span class="text-xs text-muted flex items-center gap-1">${s > 0 ? html`${Icon("lucide:flame", "text-[0.9em]")} ${T(t, "dayStreak", { n: s })}` : T(t, "noStreak")}</span></span>
              </button>
              
              
              <button data-today type="button" class=${`w-9 h-9 rounded-full shrink-0 flex items-center justify-center active:scale-90 transition ${done ? "sf-e3" : "sf-raised"}`}
                aria-pressed=${done} aria-label=${`${h.name} ${T(t, "todayToggle")}`}
                style=${done ? `background:${h.color};color:#fff` : `color:${h.color}`}
                data-haptic="off" onClick=${() => toggle(h.id, today())}>${Icon("lucide:check", "text-lg")}</button>
            </div>
            <${Dots} h=${h} marks=${marks} onToggle=${toggle} t=${t} />
          </${Panel}>`; })}

        <div class="flex items-center gap-2 mt-1">
          <button id="add-habit" class="btn btn-primary rounded-2xl flex-1 gap-2" onClick=${() => S.sheet.set(true)}>${Icon("lucide:plus")} ${T(t, "newHabit")}</button>
          <button class="btn btn-square rounded-2xl" aria-label=${T(t, "export")} onClick=${exportData}>${Icon("lucide:download")}</button>
          <label class="btn btn-square rounded-2xl" aria-label=${T(t, "import")}>${Icon("lucide:upload")}
            <input type="file" accept="application/json" class="hidden" onChange=${(e) => e.target.files[0] && importData(e.target.files[0])} /></label>
        </div>
      </div>`}

    
    <${AddSheet} open=${!!sheet} onClose=${() => S.sheet.set(false)} t=${t} />
    <${DetailSheet} open=${!!detailId} id=${detailId} t=${t} onClose=${closeScreen} confirm=${confirm} />
  </${Fragment}>`;
}