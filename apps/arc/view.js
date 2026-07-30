// arc — the reader: a book's plot in three acts, and a question box under them.
//
// This file is the ONLY bespoke surface in the app, and that is deliberate. The search, the cards, the
// favourite star, the shelf, the empty and prompt states, the skeleton and the drill-down routing are all
// systemic — declared in spec.json, rendered by the runtime. What could not be declared is this: controls
// that change what is shown, and an async synthesis behind them. So it arrives through `detail.view`, which
// hands an app the detail BODY and keeps the overlay, the app-bar, the back-routing and the star.
//
// The prose is AI-written but GROUNDED: the model is handed the real encyclopaedic plot text and told to
// re-segment and compress it, never to retell from memory. The acts are cut by dramatic FUNCTION — act I
// ends at the point of no return, act II at the low point — not by slicing the source into thirds.
//
// EVERY block carries its own length dial, so the ending can be read in full while the setup stays brief.
// One request per LEVEL returns all three acts together (which is what keeps them balanced against each
// other), and each block simply reads its own act out of the level it is set to — so three dials cost at
// most three requests, all cached.
//
// See apps/arc/RESEARCH.md for the measurements; the pure logic is /_rt/acts.js with unit tests.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Slider, Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { acts as cachedActs, warmActs, isActed, answer, warmAsk, aiTick } from "/_rt/ai-books.js";
import { parseActs, actSignature, plotUpToClimax } from "/_rt/acts.js";
import { asked, answered, foldThread, askSignature, groundBook } from "/_rt/chat.js";
import { loadPlot } from "./data.js";
import { FIXTURE_ACTS, FIXTURE_ANSWER, FIXTURE_CHAT } from "./fixture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LEVELS = [null, "lvlBrief", "lvlNormal", "lvlFull"];

// Module-level: a length dial is a reading preference, not a property of a book, so it survives closing one
// and opening the next. Persisted for the same reason.
const $levels = atom(load("arc:levels", { 1: 2, 2: 2, 3: 2, ask: 2 }));
const $revealed = atom(load("arc:revealed", {}));   // pageid → true; a finale you read stays open
const $plot = atom({});                             // pageid → { plot, heading }
// A conversation belongs to the book it is about, and it OUTLIVES the session: closing a book and coming back
// to it a week later should find what was said still there. Each turn keeps the length and the lock state it
// was asked under, so an answer read at one setting is never quietly rewritten by a later move of the dial.
const $chat = atom(load("arc:chat", {}));           // pageid → [{ q, a, lv, lk }]

function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch { return fallback; }
}
function save(key, atomRef, next) {
  atomRef.set(next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
}
const setLevel = (slot, n) => save("arc:levels", $levels, { ...$levels.get(), [slot]: n });
const reveal = (pageid) => save("arc:revealed", $revealed, { ...$revealed.get(), [pageid]: true });

// The detail body. Props are the runtime's: { item, t, loc, S, toast }.
export function reader({ item, t, loc, undo }) {
  const levels = useStore($levels);
  const plots = useStore($plot);
  const revealed = useStore($revealed);
  useStore(aiTick);                                  // re-render the moment a retelling or answer lands
  const [failed, setFailed] = useState(false);

  const entry = plots[item.pageid];
  const isOpen = !!revealed[item.pageid];
  // Built once and shared by the first attempt and the retry. The book header is part of the grounding —
  // it is how the model knows whose story this is — so a retry that dropped it would produce a different,
  // worse answer and cache it under the same key.
  const grounding = entry?.plot ? `${item.title} (${item.byline})\n\n${entry.plot}` : "";

  // fetch the plot once per book
  useEffect(() => {
    if (gate || entry) return;
    let live = true;
    loadPlot(item.title)
      .then((r) => { if (live) $plot.set({ ...$plot.get(), [item.pageid]: r }); })
      .catch(() => { if (live) $plot.set({ ...$plot.get(), [item.pageid]: { plot: "", heading: null } }); });
    return () => { live = false; };
  }, [item.pageid]);

  // Warm every DISTINCT level the three dials are currently pointing at — usually one request, never more
  // than three, and each is cached permanently.
  const wanted = [...new Set([levels[1], levels[2], levels[3]])];
  useEffect(() => {
    if (gate || !grounding) return;
    setFailed(false);
    for (const lv of wanted) warmActs(actSignature(item.pageid, lv, loc), grounding, loc, lv);
    // Fail-open rather than wait forever: the longest level measured 8.8 s cold, so the ceiling is
    // generous — but a dead endpoint must end in a retry button, never a spinner.
    const timer = setTimeout(() => setFailed(!wanted.every((lv) => isActed(actSignature(item.pageid, lv, loc), loc))), 30000);
    return () => clearTimeout(timer);
  }, [grounding, loc, wanted.join(",")]);

  // act n → the text at THAT act's own level
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
    <${Chat} item=${item} t=${t} loc=${loc} level=${levels.ask} plot=${entry?.plot || ""} locked=${!isOpen} undo=${undo} />
  </div>`;
}

// ── one block ────────────────────────────────────────────────────────────────────────────────────────────
// Every block is the same shape: a mono label row that doubles as the length dial, then its content. That
// repetition IS the structure — the reader learns one control and it works everywhere down the column.

function BlockHead({ n, labelKey, t, slot, level, aside }) {
  return html`<div class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2 min-h-[1.25rem]">
      <span class="font-mono text-[var(--ms-label)] uppercase tracking-[0.08em] text-muted">${T(t, labelKey)}</span>
      ${n ? html`<span class="font-mono text-[var(--ms-label)] text-muted ml-auto">${n}/3</span>` : null}
      ${aside ? html`<span class="ml-auto flex items-center">${aside}</span>` : null}
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

// A recess, not a blur: frosted glass over a base surface is banned here (it erases the shadow pair it
// blurs), and faking unreadable text would be a lie about what is behind it. An empty inset with one
// control says "there is more, and it is yours to take" without pretending.
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

// ── the conversation — the same block, one step further down the column ──────────────────────────────────
// A question box became a THREAD because the questions this is for presuppose one: "і що б персонаж сказав
// мені, якби я йому розповів?" only means something as turn two. So every reply carries the whole exchange
// with it, and the reply the model gives is stored in the thread rather than looked up again — what was said
// was said, and moving the length dial afterwards must not silently rewrite an answer already read.
//
// The boundary is the BOOK, not the kind of question: its plot and characters, a character answering in their
// own voice, the reader placed inside the world, and the branches the story did not take. Everything outside
// gets one fixed sentence, server-side. While the ending is locked the model is sent the plot only UP TO the
// climax — telling it to keep the secret was measured and leaked (two of three indirect questions gave the
// ending away), so the secret is kept by not sending it. See RESEARCH.md §6 for the measurements.
const toTurns = (thread) => thread.flatMap((x) => (x.a ? [asked(x.q), answered(x.a)] : [asked(x.q)]));

function Chat({ item, t, loc, level, plot, locked, undo }) {
  const threads = useStore($chat);
  const tick = useStore(aiTick);                       // a reply landing in the cache is what ends a turn's wait
  const [draft, setDraft] = useState("");
  // `stuck` is what the reader sees; `retryAt` is what actually re-fires the request. Clearing the flag alone
  // only hid the button: the effect's dependencies had not changed, so nothing was asked a second time.
  const [stuck, setStuck] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const thread = threads[item.pageid] || [];
  const pending = thread.findIndex((x) => !x.a);
  const turnsFor = (i) => foldThread(toTurns(thread.slice(0, i + 1)));
  const keyFor = (i) => askSignature(item.pageid, thread[i].lv, thread[i].lk, loc, turnsFor(i));
  const ground = (lk) => groundBook({ title: item.title, byline: item.byline, plot: lk ? plotUpToClimax(plot) : plot });

  // The gate has no network, and a conversation nobody can photograph is a screen that ships unseen — the
  // empty state was the only one the eye had ever been shown. So under the gate the thread opens SEEDED with
  // a real captured reply, and clearing it still leaves it cleared (the key exists, so this never re-seeds).
  useEffect(() => {
    if (!gate || item.pageid in threads) return;
    save("arc:chat", $chat, { ...$chat.get(), [item.pageid]: FIXTURE_CHAT[loc] || FIXTURE_CHAT.en });
  }, [item.pageid]);

  // One effect for the one turn still waiting. It either commits an answer that has landed in the cache or
  // asks for it — and a reply that never arrives ends in a retry, never in a skeleton that spins forever.
  useEffect(() => {
    if (gate || pending < 0 || !plot) return;
    const key = keyFor(pending), got = answer(key, loc);
    if (got) {
      const next = thread.map((x, i) => (i === pending ? { ...x, a: got } : x));
      setStuck(false);
      save("arc:chat", $chat, { ...$chat.get(), [item.pageid]: next });
      return;
    }
    warmAsk(key, ground(thread[pending].lk), turnsFor(pending), loc, { level: thread[pending].lv, locked: thread[pending].lk });
    // The measured ceiling is the fallback path, not the happy one: when every Gemini bucket is spent the
    // request walks the free HF Spaces cascade, and one such reply took 56 s. So the patience is generous.
    const timer = setTimeout(() => setStuck(true), 70000);
    return () => clearTimeout(timer);
  }, [threads, plot, loc, tick, retryAt]);

  const send = (v) => {
    const q = String(v || "").trim();
    if (!q) return;
    setStuck(false); setDraft("");
    // The gate has no network, so the fixture answers on the spot — the shot must show a conversation, not a
    // question hanging under a skeleton.
    const a = gate ? (FIXTURE_ANSWER[loc] || FIXTURE_ANSWER.en) : "";
    save("arc:chat", $chat, { ...$chat.get(), [item.pageid]: [...thread, { q, a, lv: level, lk: locked }] });
  };
  const clear = () => {
    const gone = thread;
    save("arc:chat", $chat, { ...$chat.get(), [item.pageid]: [] });
    undo?.(() => save("arc:chat", $chat, { ...$chat.get(), [item.pageid]: gone }), T(t, "askTitle"));
  };

  return html`<${Panel} className="flex flex-col gap-2.5">
    <${BlockHead} labelKey="askTitle" t=${t} slot="ask" level=${level}
      aside=${thread.length
        ? html`<button data-ask-clear type="button" onClick=${clear} data-haptic="bump" aria-label=${T(t, "askClear")}
            class="shrink-0 grid place-items-center w-7 h-7 -my-1 rounded-full text-muted active:scale-95 transition-transform">
            ${Icon("lucide:eraser", "text-[0.95rem]")}</button>`
        : null} />

    ${/* The gap BETWEEN turns has to beat the gap inside one, or an answer and the next question read as one
          paragraph. The reader's line is marked by a rule in the app's accent — colour on a MARK, never on
          type — which is also what makes a long thread scannable at a glance. */
      thread.length ? html`<div class="flex flex-col gap-5">
    ${thread.map((turn, i) => html`<div data-turn=${i} key=${i} class="flex flex-col gap-1.5">
      <p data-ask-q class="text-[0.9rem] text-base-content/75 border-l-2 pl-3" style="border-color:var(--app-accent)">${turn.q}</p>
      ${turn.a
        ? html`<p data-ask-a class="text-[0.97rem] leading-relaxed text-base-content/90">${turn.a}</p>`
        : stuck
          ? html`<button data-ask-retry type="button" onClick=${() => { setStuck(false); setRetryAt(retryAt + 1); }} class="btn btn-sm gap-2 rounded-xl self-start">
              ${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "retry")}</span></button>`
          : html`<div class="flex flex-col gap-1.5 text-muted">
              ${[30, 26, 20].map((w, k) => html`<div class="text-[0.97rem]" key=${k}><${Scramble} len=${w} /></div>`)}
            </div>`}
    </div>`)}
      </div>` : null}

    ${/* The openers are the empty state of the thread, not a caption: three taps that each open a DIFFERENT
          kind of conversation, and they are gone the moment there is one. Static, not generated — an opener
          naming this book's characters costs an AI call per book, and the client-side alternative was measured
          and rejected (the most frequent capitalised token in Dune's acts is "Арракіс", a planet).
          THE WORDING IS MEASURED, not written: a bare "герой" was answered on one book and REFUSED on another,
          and a bare "якби все пішло інакше" got a request to be more specific. Each chip has to anchor itself
          to the book and name something concrete to change — do not shorten them back. RESEARCH.md §6.6. */
      thread.length ? null : html`<div class="flex flex-wrap gap-1.5">
        ${["askChipVoice", "askChipSelf", "askChipWhat"].map((k) => html`<button data-ask-chip=${k} key=${k} type="button"
          onClick=${() => send(T(t, k))}
          class="sf-raised rounded-full px-3.5 py-2 text-left text-[0.85rem] leading-snug text-base-content/85 active:sf-pressed transition-transform">
          ${T(t, k)}</button>`)}
      </div>`}

    <form onSubmit=${(e) => { e.preventDefault(); send(draft); }} class="flex items-center gap-2">
      <input data-ask type="text" value=${draft} onInput=${(e) => setDraft(e.target.value)}
        placeholder=${T(t, "askPlaceholder")} aria-label=${T(t, "askTitle")}
        class="sf-inset flex-1 min-w-0 rounded-[var(--ms-r)] bg-base-100 border-0 px-3.5 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
      <button data-ask-send type="submit" aria-label=${T(t, "askSend")} disabled=${!draft.trim()}
        class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-[var(--app-accent)] disabled:text-muted">
        ${Icon("lucide:corner-down-left", "text-[var(--ms-icon)]")}
      </button>
    </form>
  </${Panel}>`;
}

// Text skeletons take the FULL original length, so the page does not jump when the prose lands. The line
// counts track the level: what is coming is roughly this much.
const SKEL = { 1: [30, 34, 28, 22], 2: [30, 34, 28, 32, 26, 20], 3: [30, 34, 28, 32, 26, 33, 29, 24, 18] };
