import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Slider, Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { acts as cachedActs, warmActs, isActed, answer, warmAsk, isAnswered, aiTick } from "/_rt/ai.js";
import { parseActs, actSignature, plotUpToClimax } from "/_rt/acts.js";
import { loadPlot } from "./data.js";
import { FIXTURE_ACTS, FIXTURE_ANSWER } from "./fixture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LEVELS = [null, "lvlBrief", "lvlNormal", "lvlFull"];

const $levels = atom(load("arc:levels", { 1: 2, 2: 2, 3: 2, ask: 2 }));
const $revealed = atom(load("arc:revealed", {}));   
const $plot = atom({});                             
const $asked = atom({});                            

function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch { return fallback; }
}
function save(key, atomRef, next) {
  atomRef.set(next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch {  }
}
const setLevel = (slot, n) => save("arc:levels", $levels, { ...$levels.get(), [slot]: n });
const reveal = (pageid) => save("arc:revealed", $revealed, { ...$revealed.get(), [pageid]: true });

export function reader({ item, t, loc }) {
  const levels = useStore($levels);
  const plots = useStore($plot);
  const revealed = useStore($revealed);
  useStore(aiTick);                                  
  const [failed, setFailed] = useState(false);

  const entry = plots[item.pageid];
  const isOpen = !!revealed[item.pageid];
  const grounding = entry?.plot ? `${item.title} (${item.byline})\n\n${entry.plot}` : "";

  useEffect(() => {
    if (gate || entry) return;
    let live = true;
    loadPlot(item.title)
      .then((r) => { if (live) $plot.set({ ...$plot.get(), [item.pageid]: r }); })
      .catch(() => { if (live) $plot.set({ ...$plot.get(), [item.pageid]: { plot: "", heading: null } }); });
    return () => { live = false; };
  }, [item.pageid]);

  const wanted = [...new Set([levels[1], levels[2], levels[3]])];
  useEffect(() => {
    if (gate || !grounding) return;
    setFailed(false);
    for (const lv of wanted) warmActs(actSignature(item.pageid, lv, loc), grounding, loc, lv);
    const timer = setTimeout(() => setFailed(!wanted.every((lv) => isActed(actSignature(item.pageid, lv, loc), loc))), 30000);
    return () => clearTimeout(timer);
  }, [grounding, loc, wanted.join(",")]);

  const actText = (n) => {
    const raw = gate ? (FIXTURE_ACTS[loc] || FIXTURE_ACTS.en) : cachedActs(actSignature(item.pageid, levels[n], loc), loc);
    const parsed = raw ? parseActs(raw) : null;
    return parsed?.ok ? parsed.acts[n - 1] : null;
  };
  const retry = () => {
    setFailed(false);
    for (const lv of wanted) warmActs(actSignature(item.pageid, lv, loc), grounding, loc, lv);
  };

  if (!gate && entry && !entry.plot) {
    return html`<${Panel}><p data-noplot class="text-[0.95rem] text-muted py-6 text-center">${T(t, "noPlot")}</p></${Panel}>`;
  }
  if (failed && !actText(1)) {
    return html`<div class="flex justify-center py-8">
      <button data-retry type="button" onClick=${retry} class="btn btn-sm gap-2 rounded-xl">
        ${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "retry")}</span>
      </button></div>`;
  }

  return html`<div data-reader class="flex flex-col gap-[var(--ms-gap)]">
    <${Act} n=${1} labelKey="actBegin" text=${actText(1)} level=${levels[1]} t=${t} />
    <${Act} n=${2} labelKey="actMiddle" text=${actText(2)} level=${levels[2]} t=${t} />
    ${isOpen
      ? html`<${Act} n=${3} labelKey="actEnd" text=${actText(3)} level=${levels[3]} t=${t} />`
      : html`<${LockedAct} t=${t} onReveal=${() => reveal(item.pageid)} />`}
    <${AskBlock} item=${item} t=${t} loc=${loc} level=${levels.ask} plot=${entry?.plot || ""} locked=${!isOpen} />
  </div>`;
}


function BlockHead({ n, labelKey, t, slot, level }) {
  return html`<div class="flex flex-col gap-1.5">
    <div class="flex items-baseline gap-2">
      <span class="font-mono text-[var(--ms-label)] uppercase tracking-[0.08em] text-muted">${T(t, labelKey)}</span>
      ${n ? html`<span class="font-mono text-[var(--ms-label)] text-muted ml-auto">${n}/3</span>` : null}
    </div>
    <${Slider} id=${`arc-lvl-${slot}`} label=${T(t, LEVELS[level])} value=${level} min=${1} max=${3} step=${1}
      attr=${`data-level-${slot}`} onInput=${(v) => setLevel(slot, Math.round(Number(v)))} />
  </div>`;
}

function Act({ n, labelKey, text, level, t }) {
  return html`<${Panel} className="flex flex-col gap-2.5">
    <${BlockHead} n=${n} labelKey=${labelKey} t=${t} slot=${n} level=${level} />
    ${text
      ? html`<p data-act=${n} class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>`
      : html`<div class="flex flex-col gap-1.5 text-muted">
          ${SKEL[level].map((w, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${w} /></div>`)}
        </div>`}
  </${Panel}>`;
}

function LockedAct({ t, onReveal }) {
  return html`<div class="sf-inset rounded-[var(--ms-r)] bg-base-100 p-[var(--ms-pad)] flex flex-col gap-3">
    <div class="flex items-baseline gap-2">
      <span class="font-mono text-[var(--ms-label)] uppercase tracking-[0.08em] text-muted">${T(t, "actEnd")}</span>
      <span class="font-mono text-[var(--ms-label)] text-muted ml-auto">3/3</span>
    </div>
    <button data-reveal type="button" onClick=${onReveal}
      class="flex items-center justify-center gap-2 h-[var(--ms-ctl)] rounded-[var(--ms-r)] text-base-content/85 active:scale-[0.99] transition-transform">
      ${Icon("lucide:lock-open", "text-[var(--ms-icon)] text-[var(--app-accent)]")}
      <span class="text-[0.95rem] font-medium">${T(t, "reveal")}</span>
    </button>
  </div>`;
}

function AskBlock({ item, t, loc, level, plot, locked }) {
  const asked = useStore($asked);
  const [draft, setDraft] = useState("");
  const q = (asked[item.pageid] || "").trim();
  const key = `${item.pageid}|${level}|${locked ? "L" : "O"}|${q.slice(0, 200)}`;
  const ready = gate ? !!q : isAnswered(key, loc);
  const text = gate ? (FIXTURE_ANSWER[loc] || FIXTURE_ANSWER.en) : answer(key, loc);

  useEffect(() => {
    if (gate || !q || !plot || isAnswered(key, loc)) return;
    const body = locked ? plotUpToClimax(plot) : plot;
    warmAsk(key, `КНИГА: ${item.title} (${item.byline})\n\nСЮЖЕТ:\n${body}\n\nЗАПИТАННЯ КОРИСТУВАЧА:\n${q}`,
      loc, { level, locked });
  }, [key, plot, loc]);

  const submit = (e) => {
    e.preventDefault();
    const v = draft.trim();
    if (v) $asked.set({ ...$asked.get(), [item.pageid]: v });
  };

  return html`<${Panel} className="flex flex-col gap-2.5">
    <${BlockHead} labelKey="askTitle" t=${t} slot="ask" level=${level} />
    <form onSubmit=${submit} class="flex items-center gap-2">
      <input data-ask type="text" value=${draft} onInput=${(e) => setDraft(e.target.value)}
        placeholder=${T(t, "askPlaceholder")} aria-label=${T(t, "askTitle")}
        class="sf-inset flex-1 min-w-0 rounded-[var(--ms-r)] bg-base-100 border-0 px-3.5 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
      <button data-ask-send type="submit" aria-label=${T(t, "askSend")} disabled=${!draft.trim()}
        class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-[var(--app-accent)] disabled:text-muted">
        ${Icon("lucide:corner-down-left", "text-[var(--ms-icon)]")}
      </button>
    </form>
    ${q
      ? html`<${Fragment}>
          <p data-ask-q class="text-[0.9rem] text-muted">${q}</p>
          ${ready
            ? html`<p data-ask-a class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>`
            : html`<div class="flex flex-col gap-1.5 text-muted">
                ${[30, 26, 20].map((w, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${w} /></div>`)}
              </div>`}
        </${Fragment}>`
      : null}
  </${Panel}>`;
}

const SKEL = { 1: [30, 34, 28, 22], 2: [30, 34, 28, 32, 26, 20], 3: [30, 34, 28, 32, 26, 33, 29, 24, 18] };
