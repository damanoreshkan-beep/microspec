// Wishlist — a local-first "want" ledger. No API, no backend: every list and every wish lives in the
// device IndexedDB (/_rt/db.js), so it works fully offline and the data is the user's (export/import JSON).
// Multiple named lists; each wish carries a price, a want-level (1–3, the accent meter + default sort) and
// an optional product link that can PREFILL title/image/price via /_rt/wish.js (Jina Reader, fail-open,
// never in the gate). Sub-screens (wish detail, add sheet, list sheet) route through the runtime's
// S.screen / S.sheet so system Back closes them (never exits). Delete safety: a single wish removal is a
// reversible undo-snackbar; deleting a whole list is a history-backed danger-confirm.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { collection, idbSupported } from "/_rt/db.js";
import { isGate } from "/_rt/gate.js";
import { sortWishes, wishTotals, fmtMoney, fetchWishMeta, CURRENCIES } from "/_rt/wish.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const listsColl = collection("wishlists");
const wishesColl = collection("wishes");

// ---- shared local state -----------------------------------------------------
const $lists = atom([]);     // [{ id, name, icon, color, createdAt }]
const $wishes = atom([]);    // [{ id, listId, name, price, currency, url, image, want, note, granted, createdAt }]
const $active = atom(null);  // active list id
const $ready = atom(false);
const $draft = atom(null);   // add/edit wish draft (null = closed)
const $ldraft = atom(null);  // add/edit list draft (null = closed)
const $busy = atom(false);   // link-prefill in flight

const COLORS = ["#fb7185", "#f59e0b", "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#f97316", "#2dd4bf"];
const LIST_ICONS = ["lucide:gift", "lucide:home", "lucide:book-open", "lucide:plane", "lucide:shirt", "lucide:gamepad-2", "lucide:cake", "lucide:heart", "lucide:baby", "lucide:bike", "lucide:sparkles", "lucide:palette"];
const WANT_KEYS = ["wantLow", "wantMid", "wantHigh"];
const uid = (p) => p + Date.now().toString(36) + Math.floor(performance.now()).toString(36);

// ---- persistence ------------------------------------------------------------
function wantSeed() { return typeof location !== "undefined" && location.search.includes("seed"); }

async function loadAll() {
  try {
    const ls = await listsColl.all();
    if (!ls.length && wantSeed()) { await seed(); return loadAll(); }
    const ws = await wishesColl.all();
    $lists.set(ls.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    $wishes.set(ws);
    const saved = localStorage.getItem("wish:active");
    const ids = ls.map((l) => l.id);
    $active.set(ids.includes(saved) ? saved : (ids[0] || null));
  } catch { /* no IndexedDB (headless preflight) → stay empty, app still renders */ }
  $ready.set(true);
}

function setActive(id) { $active.set(id); try { id ? localStorage.setItem("wish:active", id) : localStorage.removeItem("wish:active"); } catch { /* */ } }

async function saveList(d) {
  const id = d.id || uid("l");
  const rec = { name: d.name.trim(), icon: d.icon, color: d.color, createdAt: d.createdAt || Date.now() };
  const rest = $lists.get().filter((l) => l.id !== id);
  $lists.set([...rest, { id, ...rec }].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  if (!d.id) setActive(id);
  try { await listsColl.put(id, rec); } catch { /* */ }
  return id;
}
async function removeList(id) {
  const dropped = $wishes.get().filter((w) => w.listId === id);
  $lists.set($lists.get().filter((l) => l.id !== id));
  $wishes.set($wishes.get().filter((w) => w.listId !== id));
  setActive($lists.get()[0]?.id || null);
  try { await listsColl.remove(id); for (const w of dropped) await wishesColl.remove(w.id); } catch { /* */ }
}

// strip runtime/db-only fields before persisting a wish value
const wishRec = (w) => ({ listId: w.listId, name: (w.name || "").trim(), price: w.price == null ? null : Number(w.price), currency: w.currency || "UAH", url: (w.url || "").trim(), image: w.image || "", want: w.want || 2, note: (w.note || "").trim(), granted: !!w.granted, createdAt: w.createdAt || Date.now() });

async function saveWish(d) {
  const id = d.id || uid("w");
  const rec = wishRec(d);
  $wishes.set([{ id, ...rec }, ...$wishes.get().filter((w) => w.id !== id)]);
  try { await wishesColl.put(id, rec); } catch { /* */ }
  return id;
}
async function removeWish(id) {
  const w = $wishes.get().find((x) => x.id === id);
  $wishes.set($wishes.get().filter((x) => x.id !== id));
  try { await wishesColl.remove(id); } catch { /* */ }
  return w;                                                  // returned so the undo-snackbar can restore it
}
async function toggleGrant(w) { await saveWish({ ...w, granted: !w.granted }); }

// Link prefill — Jina Reader via /_rt/wish.js. Fills ONLY empty draft fields; fail-open; never in the gate
// (headless has no network and must render deterministically).
async function prefill() {
  const d = $draft.get();
  if (!d || !d.url || !d.url.trim() || isGate) return;
  $busy.set(true);
  try {
    const m = await fetchWishMeta(d.url.trim());
    const cur = { ...$draft.get() };
    if (m.title && !cur.name.trim()) cur.name = m.title;
    if (m.price != null && cur.price == null) { cur.price = m.price; cur.currency = m.currency || cur.currency; }
    if (m.image && !cur.image) cur.image = m.image;
    $draft.set(cur);
  } catch { /* fail-open — keep whatever the user typed */ } finally { $busy.set(false); }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ lists: $lists.get(), wishes: $wishes.get() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "wishlist.json"; a.click(); URL.revokeObjectURL(a.href);
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    for (const l of d.lists || []) await listsColl.put(l.id, { name: l.name, icon: l.icon, color: l.color, createdAt: l.createdAt || Date.now() });
    for (const w of d.wishes || []) await wishesColl.put(w.id, wishRec(w));
    await loadAll();
  } catch { /* bad file — ignore */ }
}

async function seed() {
  const now = Date.now();
  const L = [["bday", "День народження", "lucide:cake", "#fb7185"], ["home", "Для дому", "lucide:home", "#60a5fa"]];
  for (let i = 0; i < L.length; i++) await listsColl.put(L[i][0], { name: L[i][1], icon: L[i][2], color: L[i][3], createdAt: now + i });
  const gift = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a1420"/><g fill="none" stroke="#fb7185" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="26" width="40" height="9" rx="2"/><path d="M32 26v26"/><path d="M46 35v15a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V35"/><path d="M22 26a5 5 0 0 1 0-10 9 16 0 0 1 10 10 9 16 0 0 1 10-10 5 5 0 0 1 0 10"/></g></svg>');
  const W = [
    // list, name, price, cur, want, note, granted, image
    ["bday", "Sony WH-1000XM5 бездротові навушники", 13999, "UAH", 3, "Активне шумозаглушення", false, gift],
    ["bday", "Худі Patagonia", 4200, "UAH", 2, "Розмір M, оливковий", false, ""],
    ["bday", "Книга «Дюна» у твердій обкладинці", 350, "UAH", 1, "", true, ""],
    ["home", "Робот-пилосос Roborock S8 з базою самоочищення", 21500, "UAH", 3, "", false, ""],
    ["home", "Еспресо-кавоварка", 8900, "UAH", 2, "", false, ""],
    ["home", "Набір бавовняної білизни", 1990, "UAH", 1, "", false, ""],
  ];
  for (let i = 0; i < W.length; i++) {
    const [listId, name, price, currency, want, note, granted, image] = W[i];
    await wishesColl.put("seed" + i, { listId, name, price, currency, url: "", image, want, note, granted, createdAt: now + i });
  }
}

// ---- small pieces -----------------------------------------------------------
// Want-level meter: 3 pips, filled in the brand ink (a DaisyUI class → flips with theme, never a JS hex).
const WantPips = ({ level, t }) => html`<span class="inline-flex items-center gap-1" role="img" aria-label=${`${T(t, "want")}: ${level}/3`}>
  ${[1, 2, 3].map((i) => html`<span key=${i} class=${`w-1.5 h-1.5 rounded-full ${i <= level ? "bg-primary" : "bg-base-content/25"}`}></span>`)}
</span>`;

const WantSelect = ({ value, onChange, t }) => html`<div role="group" aria-label=${T(t, "want")} class="grid grid-cols-3 gap-1.5">
  ${[1, 2, 3].map((l) => html`<button key=${l} type="button" aria-pressed=${value === l} onClick=${() => onChange(l)}
    class=${`btn btn-sm rounded-xl ${value === l ? "btn-primary" : "btn-ghost border border-base-content/15"}`}>${T(t, WANT_KEYS[l - 1])}</button>`)}
</div>`;

const Thumb = ({ w, list, size }) => {
  const s = size || "w-11 h-11";
  return w.image
    ? html`<img src=${w.image} alt="" class=${`${s} rounded-xl object-cover shrink-0 bg-base-200`} loading="lazy" />`
    : html`<span class=${`${s} rounded-xl shrink-0 flex items-center justify-center`} style=${`background:${list?.color || "#888"}1f;color:${list?.color || "#888"}`}>${Icon("lucide:gift", "text-lg")}</span>`;
};

function WishCard({ w, list, t, onOpen }) {
  return html`<div data-wish=${w.id} class="card bg-base-100 border border-base-content/10 rounded-2xl">
    <div class="card-body p-3">
      <div class="flex items-center gap-3">
        <${Thumb} w=${w} list=${list} />
        <button data-open class="flex-1 min-w-0 text-left active:opacity-70" aria-label=${`${w.name} — ${T(t, "open")}`} onClick=${() => onOpen(w.id)}>
          <span class=${`font-semibold block truncate ${w.granted ? "line-through opacity-60" : ""}`}>${w.name}</span>
          <span class="flex items-center gap-2 mt-1">
            ${w.price != null ? html`<span class="font-mono text-sm tabular-nums text-base-content/80">${fmtMoney(w.price, w.currency)}</span>` : null}
            ${w.url ? Icon("lucide:link", "text-base-content/45 text-sm") : null}
            <${WantPips} level=${w.want} t=${t} />
          </span>
          ${w.note ? html`<span class="block text-xs text-base-content/70 mt-1 line-clamp-1">${w.note}</span>` : null}
        </button>
        <button data-grant aria-pressed=${w.granted} aria-label=${w.granted ? T(t, "ungrant") : T(t, "grant")}
          onClick=${() => toggleGrant(w)}
          class=${`w-9 h-9 rounded-full shrink-0 border-2 flex items-center justify-center active:scale-90 transition ${w.granted ? "bg-success border-success text-success-content" : "border-base-content/25 text-base-content/50"}`}>
          ${Icon("lucide:check", "text-lg")}</button>
      </div>
    </div></div>`;
}

// ---- add / edit wish sheet --------------------------------------------------
function WishSheet({ S, t }) {
  const d = useStore($draft), busy = useStore($busy);
  if (!d) return null;
  const set = (patch) => $draft.set({ ...$draft.get(), ...patch });
  const close = () => { S.sheet.set(false); };
  const save = async () => { if (!d.name.trim()) return; await saveWish(d); close(); };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 flex items-end" style="padding-bottom:env(safe-area-inset-bottom)">
    <button class="absolute inset-0 bg-black/40" aria-label=${T(t, "close")} onClick=${close}></button>
    <div class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl border-t border-base-content/10 p-5 pb-8 flex flex-col gap-4 max-h-[90dvh] overflow-y-auto">
      <div class="flex items-center justify-between"><h2 class="font-bold text-lg">${T(t, d.id ? "editWish" : "newWish")}</h2>
        <button class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${close}>${Icon("lucide:x", "text-xl")}</button></div>
      <input id="w-name" class="input input-bordered rounded-2xl w-full" placeholder=${T(t, "namePh")} value=${d.name}
        maxlength="80" onInput=${(e) => set({ name: e.target.value })} />
      <div class="flex gap-2">
        <input id="w-url" class="input input-bordered rounded-2xl flex-1 min-w-0" inputmode="url" placeholder=${T(t, "linkPh")} value=${d.url}
          onInput=${(e) => set({ url: e.target.value })} />
        <button id="w-prefill" class="btn btn-ghost btn-square rounded-2xl border border-base-content/15" aria-label=${T(t, "prefill")}
          disabled=${!d.url.trim() || busy} onClick=${prefill}>${Icon("lucide:sparkles", "text-lg")}</button>
      </div>
      <div class="flex gap-2">
        <input id="w-price" class="input input-bordered rounded-2xl flex-1 min-w-0 font-mono" type="number" min="0" step="any" inputmode="decimal"
          placeholder=${T(t, "pricePh")} value=${d.price ?? ""} onInput=${(e) => set({ price: e.target.value === "" ? null : Number(e.target.value) })} />
        <select id="w-cur" class="select select-bordered rounded-2xl" aria-label=${T(t, "currency")} value=${d.currency} onChange=${(e) => set({ currency: e.target.value })}>
          ${CURRENCIES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
        </select>
      </div>
      <div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "want")}</div>
        <${WantSelect} value=${d.want} onChange=${(l) => set({ want: l })} t=${t} /></div>
      <textarea id="w-note" class="textarea textarea-bordered rounded-2xl w-full" rows="2" maxlength="140" placeholder=${T(t, "notePh")}
        value=${d.note} onInput=${(e) => set({ note: e.target.value })}></textarea>
      <button id="w-save" class="btn btn-primary rounded-2xl mt-1" disabled=${!d.name.trim()} onClick=${save}>${T(t, d.id ? "save" : "add")}</button>
    </div></div>`;
}

// ---- add / edit list sheet --------------------------------------------------
function ListSheet({ S, t, closeScreen, confirm }) {
  const d = useStore($ldraft), wishes = useStore($wishes);
  if (!d) return null;
  const set = (patch) => $ldraft.set({ ...$ldraft.get(), ...patch });
  const save = async () => { if (!d.name.trim()) return; await saveList(d); closeScreen(); };
  const askDelete = () => confirm({
    title: T(t, "delListTitle", { name: d.name }),
    body: T(t, "delListBody", { n: wishes.filter((w) => w.listId === d.id).length }),
    verb: T(t, "delListVerb"),
    onConfirm: async () => { await removeList(d.id); closeScreen(); },
  });
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 flex items-end" style="padding-bottom:env(safe-area-inset-bottom)">
    <button class="absolute inset-0 bg-black/40" aria-label=${T(t, "close")} onClick=${closeScreen}></button>
    <div class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl border-t border-base-content/10 p-5 pb-8 flex flex-col gap-4">
      <div class="flex items-center justify-between"><h2 class="font-bold text-lg">${T(t, d.id ? "editListTitle" : "newList")}</h2>
        <button class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:x", "text-xl")}</button></div>
      <input id="l-name" class="input input-bordered rounded-2xl w-full" placeholder=${T(t, "listNamePh")} value=${d.name}
        maxlength="40" onInput=${(e) => set({ name: e.target.value })} />
      <div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "icon")}</div>
        <div class="flex flex-wrap gap-2" id="l-icons">${LIST_ICONS.map((ic) => html`<button key=${ic} aria-label=${ic} aria-pressed=${d.icon === ic}
          onClick=${() => set({ icon: ic })}
          class=${`w-10 h-10 rounded-xl border flex items-center justify-center ${d.icon === ic ? "border-2" : "border-base-content/15"}`}
          style=${d.icon === ic ? `border-color:${d.color};color:${d.color}` : ""}>${Icon(ic, "text-lg")}</button>`)}</div></div>
      <div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "color")}</div>
        <div class="flex flex-wrap gap-2">${COLORS.map((c) => html`<button key=${c} aria-label=${c} aria-pressed=${d.color === c}
          onClick=${() => set({ color: c })}
          class=${`w-8 h-8 rounded-full ${d.color === c ? "ring-2 ring-offset-2 ring-offset-base-100" : ""}`}
          style=${`background:${c};${d.color === c ? "--tw-ring-color:" + c : ""}`}></button>`)}</div></div>
      <button id="l-save" class="btn btn-primary rounded-2xl mt-1" disabled=${!d.name.trim()} onClick=${save}>${T(t, d.id ? "save" : "add")}</button>
      ${d.id ? html`<button id="l-del" data-haptic="bump" class="btn btn-ghost text-error rounded-2xl border border-base-content/10 gap-2" onClick=${askDelete}>${Icon("lucide:trash-2")} ${T(t, "delListVerb")}</button>` : null}
    </div></div>`;
}

// ---- wish detail screen -----------------------------------------------------
function WishDetail({ id, S, t, closeScreen, undo }) {
  const wishes = useStore($wishes), lists = useStore($lists);
  const w = wishes.find((x) => x.id === id);
  if (!w) return null;
  const list = lists.find((l) => l.id === w.listId);
  const set = (patch) => saveWish({ ...w, ...patch });
  const openEdit = () => { $draft.set({ ...w }); S.sheet.set(true); };
  const del = async () => { const rec = await removeWish(w.id); closeScreen(); undo(async () => { await saveWish(rec); }, w.name); };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100/80 backdrop-blur-xl sticky top-0 z-10 border-b border-base-content/10 px-2 min-h-14 gap-1" style="padding-top:env(safe-area-inset-top)">
      <button id="d-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold truncate px-1">${w.name}</div>
      <button id="d-edit" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "edit")} onClick=${openEdit}>${Icon("lucide:pencil", "text-lg")}</button>
    </header>
    <div class="px-4 pt-4 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <div class="card bg-base-100 border border-base-content/10 rounded-2xl"><div class="card-body p-4 gap-3">
        <div class="flex items-center gap-3">
          <${Thumb} w=${w} list=${list} size="w-16 h-16" />
          <div class="min-w-0 flex-1">
            <div class=${`font-semibold text-lg ${w.granted ? "line-through opacity-60" : ""}`}>${w.name}</div>
            ${w.price != null ? html`<div class="font-mono text-xl tabular-nums mt-0.5">${fmtMoney(w.price, w.currency)}</div>` : null}
          </div>
        </div>
        ${w.url ? html`<a id="d-link" href=${w.url} target="_blank" rel="noopener" class="btn btn-ghost rounded-2xl border border-base-content/15 gap-2 justify-start">${Icon("lucide:external-link")} ${T(t, "openLink")}</a>` : null}
      </div></div>

      <div class="card bg-base-100 border border-base-content/10 rounded-2xl"><div class="card-body p-4 gap-3">
        <div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "want")}</div>
          <${WantSelect} value=${w.want} onChange=${(l) => set({ want: l })} t=${t} /></div>
        <div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "note")}</div>
          <textarea id="d-note" class="textarea textarea-bordered rounded-2xl w-full" rows="2" maxlength="140" placeholder=${T(t, "notePh")}
            value=${w.note} onInput=${(e) => set({ note: e.target.value })}></textarea></div>
        ${lists.length > 1 ? html`<div><div class="text-xs text-base-content/70 mb-1.5">${T(t, "moveTo")}</div>
          <select id="d-move" class="select select-bordered rounded-2xl w-full" aria-label=${T(t, "moveTo")} value=${w.listId} onChange=${(e) => set({ listId: e.target.value })}>
            ${lists.map((l) => html`<option key=${l.id} value=${l.id}>${l.name}</option>`)}
          </select></div>` : null}
      </div></div>

      <button id="d-del" data-haptic="bump" class="btn btn-ghost text-error rounded-2xl border border-base-content/10 gap-2" onClick=${del}>${Icon("lucide:trash-2")} ${T(t, "delete")}</button>
    </div></div>`;
}

// ---- list switcher ----------------------------------------------------------
const ListSwitcher = ({ lists, wishes, active, t, onAdd }) => html`<div class="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label=${T(t, "tabLists")}>
  ${lists.map((l) => {
    const n = wishes.filter((w) => w.listId === l.id && !w.granted).length;
    const on = l.id === active;
    return html`<button key=${l.id} data-list=${l.id} role="tab" aria-selected=${on} onClick=${() => setActive(l.id)}
      class=${`shrink-0 h-9 px-3 rounded-full border flex items-center gap-2 transition ${on ? "bg-primary/15 border-primary/40 text-base-content" : "border-base-content/15 text-base-content/70"}`}>
      <span style=${`color:${l.color}`}>${Icon(l.icon, "text-base")}</span>
      <span class="font-medium text-sm whitespace-nowrap">${l.name}</span>
      <span class="text-xs tabular-nums text-base-content/60">${n}</span>
    </button>`;
  })}
  <button id="add-list" class="shrink-0 w-9 h-9 rounded-full border border-base-content/15 flex items-center justify-center text-base-content/70 active:scale-90" aria-label=${T(t, "addList")}
    onClick=${onAdd}>${Icon("lucide:plus", "text-lg")}</button>
</div>`;

// ---- main tool view ---------------------------------------------------------
export function wish({ S, closeScreen, confirm, undo }) {
  const t = useStore(S.t), lists = useStore($lists), wishes = useStore($wishes), active = useStore($active),
    ready = useStore($ready), screen = useStore(S.screen), sheet = useStore(S.sheet);
  useEffect(() => { loadAll(); }, []);
  // list sheet is history-backed via S.screen==="list"; drop its draft once that screen closes
  useEffect(() => { if (screen !== "list" && $ldraft.get()) $ldraft.set(null); }, [screen]);

  const activeList = lists.find((l) => l.id === active) || lists[0] || null;
  const listId = activeList?.id;
  const mine = sortWishes(wishes.filter((w) => w.listId === listId));
  const pending = mine.filter((w) => !w.granted), granted = mine.filter((w) => w.granted);
  const totals = wishTotals(mine);
  const detailId = typeof screen === "string" && screen.startsWith("wish:") ? screen.slice(5) : null;

  const openWishAdd = () => { $draft.set({ listId, name: "", url: "", price: null, currency: "UAH", want: 2, note: "", image: "" }); S.sheet.set(true); };
  const openListAdd = () => { $ldraft.set({ name: "", icon: LIST_ICONS[0], color: COLORS[0] }); S.screen.set("list"); };
  const openListEdit = () => { $ldraft.set({ ...activeList }); S.screen.set("list"); };
  const openDetail = (id) => S.screen.set("wish:" + id);

  return html`<${Fragment}>
    ${!ready ? null : lists.length === 0 ? html`
      <div class="flex flex-col items-center justify-center text-center gap-3 py-16 px-6 text-base-content/70">
        ${Icon("lucide:gift", "text-5xl text-primary/70")}
        <div class="font-semibold text-base-content">${T(t, "emptyListTitle")}</div>
        <button id="empty-add-list" class="btn btn-primary rounded-2xl gap-2 mt-1" onClick=${openListAdd}>${Icon("lucide:plus")} ${T(t, "addFirstList")}</button>
        ${idbSupported ? null : html`<div class="text-xs text-warning mt-2">${T(t, "noStore")}</div>`}
      </div>` : html`
      <div class="flex flex-col gap-4">
        <${ListSwitcher} lists=${lists} wishes=${wishes} active=${listId} t=${t} onAdd=${openListAdd} />

        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span style=${`color:${activeList.color}`}>${Icon(activeList.icon, "text-xl")}</span>
              <h2 class="text-xl font-bold truncate">${activeList.name}</h2>
              <button id="edit-list" class="btn btn-ghost btn-xs btn-circle text-base-content/60" aria-label=${T(t, "editList")} onClick=${openListEdit}>${Icon("lucide:pencil", "text-sm")}</button>
            </div>
            <div class="text-sm text-base-content/70 mt-0.5 flex flex-wrap items-center gap-x-2">
              <span>${T(t, "nWishes", { n: pending.length })}</span>
              ${totals.map((x) => html`<span key=${x.currency} class="font-mono tabular-nums">· ${fmtMoney(x.sum, x.currency)}</span>`)}
            </div>
          </div>
        </div>

        ${pending.length === 0 && granted.length === 0 ? html`
          <div class="flex flex-col items-center justify-center text-center gap-3 py-12 px-6 text-base-content/70">
            ${Icon("lucide:sparkles", "text-4xl text-primary/70")}
            <div class="font-semibold text-base-content">${T(t, "emptyWishTitle")}</div>
            <button id="empty-add-wish" class="btn btn-primary rounded-2xl gap-2 mt-1" onClick=${openWishAdd}>${Icon("lucide:plus")} ${T(t, "addFirstWish")}</button>
          </div>` : html`
          <div class="flex flex-col gap-2.5">
            ${pending.map((w) => html`<${WishCard} key=${w.id} w=${w} list=${activeList} t=${t} onOpen=${openDetail} />`)}
            ${granted.length ? html`<div class="flex items-center gap-2 mt-2 mb-0.5 text-sm font-semibold text-base-content/60">
              ${Icon("lucide:check-circle", "text-base text-success")} ${T(t, "grantedSection")} · ${granted.length}</div>` : null}
            ${granted.map((w) => html`<${WishCard} key=${w.id} w=${w} list=${activeList} t=${t} onOpen=${openDetail} />`)}
          </div>`}

        <div class="flex items-center gap-2 mt-1">
          <button id="add-wish" class="btn btn-primary rounded-2xl flex-1 gap-2" onClick=${openWishAdd}>${Icon("lucide:plus")} ${T(t, "addWish")}</button>
          <button class="btn btn-ghost btn-square rounded-2xl border border-base-content/15" aria-label=${T(t, "export")} onClick=${exportData}>${Icon("lucide:download")}</button>
          <label class="btn btn-ghost btn-square rounded-2xl border border-base-content/15" aria-label=${T(t, "import")}>${Icon("lucide:upload")}
            <input type="file" accept="application/json" class="hidden" onChange=${(e) => e.target.files[0] && importData(e.target.files[0])} /></label>
        </div>
      </div>`}

    ${sheet ? html`<${WishSheet} S=${S} t=${t} />` : null}
    ${screen === "list" ? html`<${ListSheet} S=${S} t=${t} closeScreen=${closeScreen} confirm=${confirm} />` : null}
    ${detailId ? html`<${WishDetail} id=${detailId} S=${S} t=${t} closeScreen=${closeScreen} undo=${undo} />` : null}
  </${Fragment}>`;
}
