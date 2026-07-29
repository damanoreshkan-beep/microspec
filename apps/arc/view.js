import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Slider, Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { acts as cachedActs, warmActs, isActed, aiTick } from "/_rt/ai.js";
import { parseActs, actSignature } from "/_rt/acts.js";
import { loadPlot } from "./data.js";
import { FIXTURE, FIXTURE_ACTS } from "./fixture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const $query = atom("");
const $results = atom([]);
const $status = atom("idle");          
const $books = atom({});               
const $level = atom(2);                
const $plot = atom({});                
const $revealed = atom(loadRevealed()); 

function loadRevealed() {
  try { return JSON.parse(localStorage.getItem("arc:revealed") || "{}"); } catch { return {}; }
}
function reveal(pageid) {
  const next = { ...$revealed.get(), [pageid]: true };
  $revealed.set(next);
  try { localStorage.setItem("arc:revealed", JSON.stringify(next)); } catch {  }
}

const LEVELS = [null, "lvlBrief", "lvlNormal", "lvlFull"];

const bookIn = (tabId) => $books.get()[tabId] || null;
const setBook = (tabId, b) => $books.set({ ...$books.get(), [tabId]: b });

function syncStack(S, tabId) {
  const mine = bookIn(tabId);
  const want = mine ? [mine.title] : [];
  if (S.stack.get().length !== want.length) S.stack.set(want);
}

export function arc({ S, tab, toast }) {
  const t = useStore(S.t);
  const books = useStore($books);
  const book = books[tab.id] || null;
  const stack = useStore(S.stack);
  const results = useStore($results);
  const status = useStore($status);
  const q = useStore($query);
  const gen = useRef(0);

  useEffect(() => { if (!stack.length && bookIn(tab.id)) setBook(tab.id, null); }, [stack.length]);

  useEffect(() => {
    if (gate) {
      if (!$results.get().length) { $query.set("Dune"); $results.set(FIXTURE); $status.set("done"); $level.set(3); }
      if (!Object.keys(S.fav.get()).length) S.fav.set(Object.fromEntries(FIXTURE.map((b) => [b.id, b])));
      if (!bookIn(tab.id)) setBook(tab.id, FIXTURE[0]);
    }
    syncStack(S, tab.id);
  }, []);

  const run = async (value) => {
    $query.set(value);
    const mine = ++gen.current;
    if (!value.trim()) { $results.set([]); $status.set("idle"); return; }
    $status.set("loading");
    try {
      const { load } = await import("./data.js");
      const { items } = await load({ q: value });
      if (mine !== gen.current) return;               
      $results.set(items); $status.set(items.length ? "done" : "empty");
    } catch { if (mine === gen.current) $status.set("error"); }
  };

  const open = (b) => { setBook(tab.id, b); S.stack.set([...S.stack.get(), b.title]); };

  if (book) return html`<${Reader} S=${S} t=${t} book=${book} toast=${toast} />`;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${SearchField} t=${t} value=${q} onSearch=${run} />
    ${status === "loading"
      ? html`<div class="flex flex-col gap-[var(--ms-gap)]">${[0, 1, 2].map((i) => html`<${RowSkeleton} key=${i} />`)}</div>`
      : status === "idle" ? html`<${Blank} t=${t} icon="lucide:book-open-text" text="searchPrompt" />`
      : status === "empty" ? html`<${Blank} t=${t} icon="lucide:search-x" text="noResults" />`
      : status === "error" ? html`<${Blank} t=${t} icon="lucide:cloud-off" text="noResults" />`
      : html`<ul class="flex flex-col gap-[var(--ms-gap)] list-none p-0 m-0">
          ${results.map((b) => html`<${BookRow} key=${b.id} book=${b} t=${t} S=${S} toast=${toast} onOpen=${() => open(b)} />`)}
        </ul>`}
  </div>`;
}

export function saved({ S, tab, toast }) {
  const t = useStore(S.t);
  const fav = useStore(S.fav);
  const books = useStore($books);
  const book = books[tab.id] || null;
  const stack = useStore(S.stack);
  useEffect(() => { if (!stack.length && bookIn(tab.id)) setBook(tab.id, null); }, [stack.length]);
  useEffect(() => { syncStack(S, tab.id); }, []);

  const items = Object.values(fav).filter((b) => b && b.title);
  const open = (b) => { setBook(tab.id, b); S.stack.set([...S.stack.get(), b.title]); };

  if (book) return html`<${Reader} S=${S} t=${t} book=${book} toast=${toast} />`;
  if (!items.length) return html`<${Blank} t=${t} icon="lucide:bookmark" text="emptySaved" />`;
  return html`<ul class="flex flex-col gap-[var(--ms-gap)] list-none p-0 m-0">
    ${items.map((b) => html`<${BookRow} key=${b.id} book=${b} t=${t} S=${S} toast=${toast} onOpen=${() => open(b)} />`)}
  </ul>`;
}


function SearchField({ t, value, onSearch }) {
  const [v, setV] = useState(value);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (e) => {
    const next = e.target.value;
    setV(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next), 350);   
  };
  return html`<label class="relative block">
    <span class="sr-only">${T(t, "search")}</span>
    ${Icon("lucide:search", "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[1.05rem] pointer-events-none")}
    <input data-search type="search" inputmode="search" value=${v} onInput=${change}
      placeholder=${T(t, "search")} aria-label=${T(t, "search")}
      class="sf-inset w-full rounded-[var(--ms-r)] bg-base-100 border-0 pl-10 pr-3 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
  </label>`;
}

function Cover({ book, cls }) {
  return html`<img src=${book.cover} alt="" loading="lazy" decoding="async"
    class=${`shrink-0 object-cover bg-base-200 ${cls}`} />`;
}

function BookRow({ book, t, S, toast, onOpen }) {
  const fav = useStore(S.fav);
  const on = !!fav[book.id];
  const toggle = (e) => {
    e.preventDefault(); e.stopPropagation();
    const next = { ...S.fav.get() };
    if (on) delete next[book.id]; else next[book.id] = book;
    S.fav.set(next);
    toast(on ? "removed" : "saved");
  };
  return html`<li>
    <div class="sf-raised flex items-center gap-3 rounded-[var(--ms-r)] bg-base-100 p-2.5">
      <button type="button" data-book=${book.id} onClick=${onOpen}
        class="flex items-center gap-3 flex-1 min-w-0 text-left">
        <${Cover} book=${book} cls="w-11 h-16 rounded-lg" />
        <span class="flex flex-col min-w-0 gap-0.5">
          <span class="font-semibold text-[0.98rem] leading-tight text-base-content line-clamp-2">${book.title}</span>
          <span class="text-[0.8rem] text-base-content/70 truncate">
            ${book.author}${book.author && book.year ? " · " : ""}${book.year}
          </span>
        </span>
      </button>
      <button type="button" data-fav=${book.id} onClick=${toggle}
        aria-label=${T(t, on ? "unfavAria" : "favAria")} aria-pressed=${on}
        class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-base-content/70">
        ${Icon(on ? "lucide:bookmark-check" : "lucide:bookmark", `text-[var(--ms-icon)] ${on ? "text-[var(--app-accent)]" : ""}`)}
      </button>
    </div>
  </li>`;
}

function RowSkeleton() {
  return html`<div class="sf-raised flex items-center gap-3 rounded-[var(--ms-r)] bg-base-100 p-2.5">
    <div class="w-11 h-16 rounded-lg bg-base-200"></div>
    <div class="flex flex-col gap-1.5 min-w-0 flex-1 text-muted">
      <div class="text-[0.98rem]"><${Scramble} len=${18} /></div>
      <div class="text-[0.8rem]"><${Scramble} len=${12} /></div>
    </div>
  </div>`;
}

function Blank({ t, icon, text }) {
  return html`<div class="flex flex-col items-center justify-center gap-3 py-16 text-muted">
    ${Icon(icon, "text-4xl opacity-70")}
    <p class="text-[0.95rem]">${T(t, text)}</p>
  </div>`;
}


function Reader({ S, t, book, toast }) {
  const loc = useStore(S.locale);
  const level = useStore($level);
  const plots = useStore($plot);
  const revealed = useStore($revealed);
  useStore(aiTick);                                  
  const [failed, setFailed] = useState(false);
  const fav = useStore(S.fav);
  const on = !!fav[book.id];

  const sig = actSignature(book.pageid, level, loc);
  const entry = plots[book.pageid];
  const ready = gate || isActed(sig, loc);
  const groundingText = entry?.plot
    ? `${book.title} (${book.author}${book.year ? ", " + book.year : ""})\n\n${entry.plot}` : "";

  useEffect(() => {
    if (gate || entry) return;
    let live = true;
    loadPlot(book.title)
      .then((r) => { if (live) $plot.set({ ...$plot.get(), [book.pageid]: r }); })
      .catch(() => { if (live) $plot.set({ ...$plot.get(), [book.pageid]: { plot: "", heading: null } }); });
    return () => { live = false; };
  }, [book.pageid]);

  useEffect(() => {
    if (gate || !entry?.plot || isActed(sig, loc)) return;
    setFailed(false);
    warmActs(sig, groundingText, loc, level);
    const timer = setTimeout(() => setFailed(!isActed(sig, loc)), 30000);
    return () => clearTimeout(timer);
  }, [sig, entry?.plot, loc, level]);

  const raw = gate ? (FIXTURE_ACTS[loc] || FIXTURE_ACTS.en) : cachedActs(sig, loc);
  const parsed = raw ? parseActs(raw) : null;
  const noPlot = !gate && entry && !entry.plot;
  const isOpen = !!revealed[book.pageid];

  const toggleFav = () => {
    const next = { ...S.fav.get() };
    if (on) delete next[book.id]; else next[book.id] = book;
    S.fav.set(next);
    toast(on ? "removed" : "saved");
  };
  const retry = () => { setFailed(false); if (groundingText) warmActs(sig, groundingText, loc, level); };

  return html`<div data-reader class="flex flex-col gap-[var(--ms-gap)]">
    <${Header} book=${book} t=${t} on=${on} onFav=${toggleFav} />
    <${LengthControl} t=${t} level=${level} onLevel=${(n) => $level.set(n)} />
    ${noPlot
      ? html`<${Blank} t=${t} icon="lucide:file-question" text="noPlot" />`
      : failed && !ready
        ? html`<div class="flex justify-center py-8">
            <button data-retry type="button" onClick=${retry} class="btn btn-sm gap-2 rounded-xl">
              ${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "retry")}</span>
            </button></div>`
        : !parsed?.ok
          ? html`<${ActsSkeleton} t=${t} level=${level} />`
          : html`<${Fragment}>
              <${Act} n=${1} labelKey="actBegin" text=${parsed.acts[0]} t=${t} />
              <${Act} n=${2} labelKey="actMiddle" text=${parsed.acts[1]} t=${t} />
              ${isOpen
                ? html`<${Act} n=${3} labelKey="actEnd" text=${parsed.acts[2]} t=${t} />`
                : html`<${LockedAct} t=${t} onReveal=${() => reveal(book.pageid)} />`}
            </${Fragment}>`}
  </div>`;
}

function Header({ book, t, on, onFav }) {
  return html`<div class="flex items-start gap-3.5">
    <${Cover} book=${book} cls="w-20 h-[7.5rem] rounded-[var(--ms-r)] sf-raised" />
    <div class="flex flex-col gap-1 min-w-0 flex-1 pt-0.5">
      <h2 class="font-semibold text-[var(--ms-title)] leading-tight text-base-content">${book.title}</h2>
      <p class="text-[0.85rem] text-base-content/70">
        ${book.author}${book.author && book.year ? " · " : ""}${book.year}
      </p>
      <div class="flex items-center gap-1.5 mt-auto pt-1.5">
        <button type="button" data-fav=${book.id} onClick=${onFav} aria-pressed=${on}
          aria-label=${T(t, on ? "unfavAria" : "favAria")}
          class="grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-base-content/70">
          ${Icon(on ? "lucide:bookmark-check" : "lucide:bookmark", `text-[var(--ms-icon)] ${on ? "text-[var(--app-accent)]" : ""}`)}
        </button>
        <a href=${book.url} target="_blank" rel="noopener" data-source
          aria-label=${T(t, "readOn")}
          class="grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-base-content/70">
          ${Icon("lucide:external-link", "text-[var(--ms-icon)]")}
        </a>
      </div>
    </div>
  </div>`;
}

function LengthControl({ t, level, onLevel }) {
  return html`<${Panel} className="py-2.5">
    <${Slider} id="arc-level" label=${T(t, LEVELS[level])} value=${level} min=${1} max=${3} step=${1}
      attr="data-level" onInput=${(v) => onLevel(Math.round(Number(v)))} />
  </${Panel}>`;
}

function ActLabel({ n, labelKey, t }) {
  return html`<div class="flex items-baseline gap-2">
    <span class="font-mono text-[var(--ms-label)] uppercase tracking-[0.08em] text-base-content/70">${T(t, labelKey)}</span>
    <span class="font-mono text-[var(--ms-label)] text-muted ml-auto">${n}/3</span>
  </div>`;
}

function Act({ n, labelKey, text, t }) {
  return html`<${Panel} className="flex flex-col gap-2">
    <${ActLabel} n=${n} labelKey=${labelKey} t=${t} />
    <p data-act=${n} class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>
  </${Panel}>`;
}

function LockedAct({ t, onReveal }) {
  return html`<div class="sf-inset rounded-[var(--ms-r)] bg-base-100 p-[var(--ms-pad)] flex flex-col gap-3">
    <${ActLabel} n=${3} labelKey="actEnd" t=${t} />
    <button data-reveal type="button" onClick=${onReveal}
      class="flex items-center justify-center gap-2 h-[var(--ms-ctl)] rounded-[var(--ms-r)] text-base-content/85 active:scale-[0.99] transition-transform">
      ${Icon("lucide:lock-open", "text-[var(--ms-icon)] text-[var(--app-accent)]")}
      <span class="text-[0.95rem] font-medium">${T(t, "reveal")}</span>
    </button>
  </div>`;
}

const SKEL = { 1: [30, 34, 28, 22], 2: [30, 34, 28, 32, 26, 20], 3: [30, 34, 28, 32, 26, 33, 29, 24, 18] };
function ActsSkeleton({ t, level }) {
  const lines = SKEL[level] || SKEL[2];
  return html`<${Fragment}>${[["actBegin", 1], ["actMiddle", 2], ["actEnd", 3]].map(([k, n]) => html`
    <${Panel} key=${k} className="flex flex-col gap-2">
      <${ActLabel} n=${n} labelKey=${k} t=${t} />
      <div class="flex flex-col gap-1.5 text-muted">
        ${lines.map((w, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${w} /></div>`)}
      </div>
    </${Panel}>`)}
  </${Fragment}>`;
}
