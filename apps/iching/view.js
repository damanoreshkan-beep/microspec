// Book of Changes (易經) — cast a hexagram the way it was actually cast, and say honestly what is computed
// and what is generated.
//
// The whole point of the app is in /_rt/iching.js: the two traditional methods carry DIFFERENT odds. Yarrow
// stalks make yang→yin three times likelier than yin→yang (3/16 vs 1/16); three coins are symmetric (1/8
// each). Almost every digital I Ching draws a uniform random 6-9 and erases that. This one draws from the
// real weights and shows them, because the odds ARE the tradition.
//
// THE CEREMONY (apps/iching/RESEARCH.md): all casting goes through one full-screen flow — ask → the lines
// shuffle and lock bottom-first → the reading types out. The journal is the oracle's MEMORY, not a log:
// a repeated question (normalized → `qk`) replays its entry verbatim — same lines, same stored text
// (`tx[locale]`, persisted the moment the AI answer lands, so a replay works offline) — and may be recast
// once per day (`day`, local). The Book does not answer one question twice.
//
// DATA IS BOTTOM-FIRST, DISPLAY IS TOP-FIRST. lines[0] is the bottom line (初爻). Only the template
// reverses; nothing else may, or the app silently reads the wrong line.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { summary, warmSummary, isSummarized, aiTick } from "/_rt/ai-text.js";
import { METHODS, cast, reading, isMoving, bitOf } from "/_rt/iching.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { animate } from "motion";
import { nameOf } from "./book.js";
import { HeroStage } from "/_rt/hero.js";

/** Pack six line values (6..9, bottom first) into the 0..1 seed hero.wgsl unpacks as six base-4 digits. */
const packSeed = (ls) => { let n = 0; for (let i = 5; i >= 0; i--) n = n * 4 + ((ls[i] ?? 7) - 6); return n / 4096; };

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const CASTS = collection("ichingCasts");

// Same idiom as /_rt/skeleton.js: the gate and reduced-motion get the FINAL state instantly — no shuffle,
// no typewriter, no entry animation — so shots and e2e stay deterministic.
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const instant = () => gate || reduced();

const $method = persistentAtom("iching:method", "yarrow");
const $lines = atom(null);          // 6/7/8/9, bottom first — the island's current cast, or null
const $last = atom(null);           // the journal row behind $lines (the ceremony's "read again" target)
const $view = atom(null);           // what the ceremony opens as: {mode:"ask"} | {mode:"read", row}
const $sel = atom(null);            // the journal row the log sheet shows
const $logv = atom(0);              // bumped when the journal changes, so the list reloads

/** The dedupe key: one question is one entry, however it is spaced or capitalized. */
const qkey = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
/** Local calendar day — the recast budget is "once per day" in the owner's day, not UTC's. */
const dayKey = (ts) => { const d = ts ? new Date(ts) : new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Under the gate the screen must be POPULATED — an empty caster photographs as a blank page and every
// downstream check would then measure nothing. A fixed cast, chosen to exercise the interesting states:
// two moving lines, so there is a second hexagram and a change to show.
const GATE_LINES = [9, 8, 7, 6, 7, 8];

// The ONE gate fixture: the journal list, the question lookup and the seeded $last all read it. g1 carries
// an OLD day on purpose — replaying its question is the only way the e2e can see [data-recast] appear
// (under the gate every answer text is identical, so the dedupe branch is proven by state, not by text).
// n/to are DERIVED from the lines, never written beside them: the first version hand-wrote n:40 next to
// lines that are hexagram 63, and the journal displayed the lie verbatim for as long as the app existed.
const GATE_ROWS = [
  { id: "g1", at: 1765000000000, q: "Чи варто починати зараз", m: "yarrow", lines: [9, 8, 7, 6, 7, 8] },
  { id: "g2", at: 1764900000000, q: "", m: "coins", lines: [7, 7, 7, 8, 8, 8] },
].map((r) => { const rd = reading(r.lines); return { ...r, n: rd.number, to: rd.toNumber, tx: {}, day: dayKey(r.at), qk: qkey(r.q) }; });

// Mirrors tarot's GATE_SUMMARY: the gate has no network, so the answer phase renders a fixed reading.
const GATE_READING = {
  uk: "Вузол уже розвʼязується: те, що тримало тебе на місці, втрачає силу, і перший крок можна робити без поспіху. Не намагайся владнати все одразу — прибери одну перешкоду, і решта зрушить сама. Після грому дощ ущухає: дій спокійно, і дорога відкриється.",
  en: "The knot is already loosening: what held you in place is losing its grip, and the first step can be taken without haste. Do not try to settle everything at once — remove one obstacle and the rest will shift on its own. After thunder the rain eases: act calmly, and the road will open.",
};

const method = () => METHODS[$method.get()] ? $method.get() : "yarrow";

/** The AI cache signature — every value that can change the answer, nothing else. */
const sigOf = (row) => `${row.m}|${row.lines.join("")}|${row.q.trim()}`;

// The facts handed to the model. Structure only — the app has no canonical text to give it, and saying
// so in the prompt is what keeps the reading anchored to the cast rather than to a half-remembered book.
function buildInput(row) {
  const r = reading(row.lines), name = nameOf(r.number), toName = r.toNumber ? nameOf(r.toNumber) : null;
  return [
    `Hexagram ${r.number} ${name.cn} (${name.py}).`,
    `Lower trigram ${r.lower.cn} ${r.lower.pinyin} (${r.lower.en}), upper trigram ${r.upper.cn} ${r.upper.pinyin} (${r.upper.en}).`,
    r.moving.length ? `Moving lines, counted from the bottom: ${r.moving.join(", ")}.` : "No moving lines.",
    r.toNumber ? `It changes into hexagram ${r.toNumber} ${toName.cn} (${toName.py}).` : "",
    row.q.trim() ? `The question asked: ${row.q.trim()}` : "No question was asked.",
  ].filter(Boolean).join("\n");
}

// The reading text for a journal row, from the durable copy outward: tx[locale] first (works offline),
// then the runtime AI cache, then the wire. The moment a fetched answer lands it is WRITTEN INTO the row —
// that persistence is what makes "the same question, the same answer" survive a cleared cache.
function useReadingText(row, loc, active) {
  const tick = useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const [landed, setLanded] = useState("");
  const [nonce, setNonce] = useState(0);
  const sig = row ? sigOf(row) : "";
  // Keyed by SIGNATURE, not row id: a recast keeps the id but changes the lines, and a `landed` text left
  // keyed to the id would replay yesterday's answer over the new cast.
  useEffect(() => { setLanded(""); setFailed(false); }, [sig, loc]);
  const stored = row?.tx?.[loc] || "";
  const text = !active || !row ? "" : gate ? (GATE_READING[loc] || GATE_READING.en) : (stored || landed || summary(sig, loc));
  useEffect(() => {
    if (!active || !row || gate || stored || landed) return;
    const got = summary(sig, loc);
    if (got) {
      row.tx = { ...(row.tx || {}), [loc]: got };
      setLanded(got);
      CASTS.put(row.id, { ...row }).catch(() => {});
      if ($last.get()?.id === row.id) $last.set({ ...row });
      $logv.set($logv.get() + 1);
      return;
    }
    setFailed(false);
    warmSummary(sig, buildInput(row), loc);
    const id = setTimeout(() => setFailed(!isSummarized(sig, loc)), 12000);
    return () => clearTimeout(id);
  }, [active, sig, loc, nonce, tick]);
  return { text, failed, retry: () => setNonce((x) => x + 1) };
}

// ── the hexagram, drawn as SVG ───────────────────────────────────────────────────────────────────
// One element instead of twelve divs, exact geometry at any size, and — the reason that matters most —
// it can carry the CANONICAL notation for a moving line, which a stack of coloured bars cannot:
//
//   7  young yang   ▬▬▬▬▬        a whole bar
//   8  young yin    ▬▬  ▬▬       a bar with a gap
//   9  old yang     ▬▬○▬▬        whole, marked with a circle — it is about to open
//   6  old yin      ▬▬✕▬▬        broken, marked with a cross — it is about to close
//
// The mark is the tradition's own and it survives both themes, greyscale and a screenshot.
// Geometry: a 6-unit bar on an 11-unit pitch, so the gaps read as gaps at 40px and at 400px. `currentColor`
// throughout — the theme decides the ink, this decides the shape.
const W = 100, BAR = 6, PITCH = 11, GAP = 16, VB_H = PITCH * 6 - (PITCH - BAR);

/**
 * @param lines  6/7/8/9 bottom-first — the cast, with movement
 * @param bits   0/1 bottom-first — a plain hexagram (the transformed one has no line values)
 */
const HexSvg = ({ lines, bits, label, cls }) => {
  const rows = lines ?? bits.map((b) => (b ? 7 : 8));      // bits render as static lines
  // `data-line` / `data-moving` mark the CAST only. The transformed hexagram has no line values and no
  // movement — it is where the cast is going, not a second throw. Tagging it too put twelve marked lines
  // on one screen and broke the e2e count, which was the gate noticing a real semantic slip rather than a
  // selector detail.
  const lineAttr = (i) => (lines ? i + 1 : null);          // null attributes are not rendered at all
  const movAttr = (moving) => (lines ? (moving ? "1" : "0") : null);
  return html`<svg viewBox=${`0 0 ${W} ${VB_H}`} class=${`w-full ${cls || ""}`} role="img"
    aria-label=${label || ""} fill="currentColor" data-hex=${lines ? "cast" : "to"}>
    ${rows.map((v, i) => {
      const yang = bitOf(v) === 1, moving = isMoving(v);
      const y = (5 - i) * PITCH;                            // index 0 is the BOTTOM line → drawn last
      const mid = y + BAR / 2;
      return html`<${Fragment} key=${i}>
        ${yang
          ? html`<rect x="0" y=${y} width=${W} height=${BAR} rx=${BAR / 2} data-line=${lineAttr(i)} data-moving=${movAttr(moving)} />`
          : html`<${Fragment}>
              <rect x="0" y=${y} width=${(W - GAP) / 2} height=${BAR} rx=${BAR / 2} data-line=${lineAttr(i)} data-moving=${movAttr(moving)} />
              <rect x=${(W + GAP) / 2} y=${y} width=${(W - GAP) / 2} height=${BAR} rx=${BAR / 2} />
            <//>`}
        ${moving && yang
          ? html`<circle cx=${W / 2} cy=${mid} r=${BAR * 0.62} fill="none" stroke="currentColor" stroke-width="1.6" />`
          : null}
        ${moving && !yang
          ? html`<${Fragment}>
              <line x1=${W / 2 - 3.4} y1=${mid - 3.4} x2=${W / 2 + 3.4} y2=${mid + 3.4} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              <line x1=${W / 2 - 3.4} y1=${mid + 3.4} x2=${W / 2 + 3.4} y2=${mid - 3.4} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <//>`
          : null}
      <//>`;
    })}
  </svg>`;
};

export function iching({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const lines = useStore($lines), m = useStore($method);

  // Seed the gate's cast once, so the populated screen renders with no interaction and no randomness.
  useEffect(() => {
    if (gate && !$lines.get()) { $lines.set(GATE_LINES); $last.set(GATE_ROWS[0]); }
  }, []);

  const r = lines ? reading(lines) : null;
  const name = r ? nameOf(r.number) : null;
  const toName = r?.toNumber ? nameOf(r.toNumber) : null;
  const w = METHODS[m] ?? METHODS.yarrow;

  const openAsk = () => { $view.set({ mode: "ask" }); openScreen("ask"); };
  const openRead = () => { const row = $last.get(); if (!row) return openAsk(); $view.set({ mode: "read", row }); openScreen("ask"); };

  return html`<${Fragment}>
    ${/* The stage IS the screen. The cast is drawn full-bleed in WebGPU — six slits of light in a moving
          field — and the page flow stays deliberately EMPTY behind it, so nothing scrolls over the figure.
          Everything you can touch lives in one pinned island at the bottom. */""}
    <${HeroStage} shader=${new URL("hero.wgsl", import.meta.url)} seed=${r ? packSeed(r.lines) : 0} />

    ${/* An inline, near-opaque ground under the glass: axe measures white text against the PAGE (a canvas
          is invisible to it), so the island supplies its own solid dark ground in both themes.
          `[&_*]:!shadow-none` — the island supplies its own depth; the kit's light-theme elevation glow
          wrapped every control in a dirty white halo here. The `!` is load-bearing: theme.css loads after
          Tailwind, so at equal specificity the plain utility loses. */""}
    <${Island} pinned tone="dark" style="background:rgba(11,15,20,.93)"
      className="w-full max-w-[440px] flex flex-col gap-2.5 px-4 py-3 [&_*]:!shadow-none">
      ${/* Not an input — the single entry point into the ceremony, shaped like the slot it opens (the
            search-bar-that-opens-a-search-screen pattern). A SOLID background: inside a translucent island
            an alpha would composite against the light page and fail contrast. */""}
      <button data-ask onClick=${openAsk}
        class="w-full rounded-xl border border-white/25 bg-[#10151c] px-3 py-2.5 text-sm text-left text-white/70 hover:border-white/50 transition-colors">
        ${T(t, "question")}</button>

      <${Segmented} attr="data-method" size="sm" label=${T(t, "methodLabel")}
        items=${[{ id: "yarrow", label: T(t, "methodYarrow") }, { id: "coins", label: T(t, "methodCoins") }]}
        value=${m} onChange=${(id) => $method.set(id)} />

      ${/* The odds of the CHOSEN method, as the exact ratios they are — the one fact that separates the
            two methods, and it changes when you switch. */""}
      <div class="flex items-center justify-between gap-3 font-mono text-[length:var(--ms-label)] tabular-nums text-white/80 px-0.5" data-odds>
        <span>${T(t, "oddsYinYang")} ${w.weights[6]}/${w.total}</span>
        <span>${T(t, "oddsYangYin")} ${w.weights[9]}/${w.total}</span>
      </div>

      ${r ? html`<div class="flex flex-col gap-2.5" data-live data-reading>
        <div class="flex items-center gap-3">
          <div class="w-[74px] shrink-0"><${HexSvg} lines=${r.lines} label=${`${name.cn} ${name.py}`} cls="text-white/90" /></div>
          <div class="flex flex-col min-w-0 gap-0.5">
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-2xl leading-none font-medium text-white">${name.cn}</span>
              <span class="text-white/80 truncate">${name.py}</span>
            </div>
            <div class="flex items-baseline gap-2 font-mono text-[length:var(--ms-label)] tabular-nums text-white/75">
              <span data-number>${r.number}</span>
              <span>${r.upper.cn}${r.lower.cn}</span>
            </div>
          </div>

          <div class="ms-auto text-right min-w-0" data-change>
            ${r.changing ? html`
              <div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wide text-white/75">${T(t, "changesTo")}</div>
              <div class="text-xl leading-none font-medium text-white truncate">${toName.cn}</div>
              <div class="font-mono tabular-nums text-[length:var(--ms-label)] text-primary">${r.moving.join(" · ")} → ${r.toNumber}</div>`
              : html`<span class="font-mono text-[length:var(--ms-label)] text-white/75">${T(t, "noMoving")}</span>`}
          </div>
        </div>

        ${/* No `.btn`: the component owns its background and beats a utility on source order. The island
              is dark in BOTH themes because the field behind it always is, so this carries fixed colours —
              that is what makes it agree with the stage. */""}
        <button data-read onClick=${openRead}
          class="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium bg-white text-[#0b0f14] hover:bg-white/90 active:bg-white/80 transition-colors">
          ${Icon("lucide:sparkles")}${T(t, "readingOpen")}</button>
      </div>` : null}
    </${Island}>

    <${Ceremony} open=${screen === "ask"} onClose=${closeScreen} t=${t} loc=${loc} />
  </${Fragment}>`;
}

// ── the ceremony — ask, cast, answer, one full-screen flow ───────────────────────────────────────
// A full-screen `class="modal"` dialog (tarot's Ritual precedent — NOT a bottom sheet), history-backed via
// S.screen so Back closes it at any phase. Opaque and dark in both themes, like the island, because it is
// the night-space the always-dark WebGPU field lives in.
function Ceremony({ open, onClose, t, loc }) {
  const dref = useRef(), qRef = useRef();
  const [phase, setPhase] = useState("ask");
  const [row, setRow] = useState(null);
  const [replay, setReplay] = useState(false);
  const [qText, setQText] = useState("");
  const { boxRef, grip } = useSheetDrag(onClose);
  const { text, failed, retry } = useReadingText(row, loc, phase === "answer");

  useEffect(() => { const d = dref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const v = $view.get() || { mode: "ask" };
    if (v.mode === "read" && v.row) { setRow(v.row); setReplay(true); setPhase("answer"); }
    else { setRow(null); setReplay(false); setQText(""); setPhase("ask"); }
    if (!instant()) {
      const el = boxRef.current;
      if (el) animate(el, { opacity: [0, 1], transform: ["translateY(28px)", "translateY(0px)"] }, { duration: 0.35, ease: "easeOut" });
      setTimeout(() => qRef.current?.focus?.(), 380);
    }
  }, [open]);

  const begin = (entry, rep) => {
    setRow(entry); setReplay(rep);
    $lines.set(entry.lines); $last.set(entry);
    if (!gate && !entry.tx?.[loc]) warmSummary(sigOf(entry), buildInput(entry), loc);   // the shuffle covers the wire's latency
    setPhase(instant() ? "answer" : "cast");
  };

  const submit = async () => {
    const q = qText.trim(), qk = qkey(q);
    if (qk) {
      // The Book does not answer one question twice: a known question replays its entry verbatim.
      const rows = gate ? GATE_ROWS : await CASTS.all().catch(() => []);
      const hit = rows.filter((x) => (x.qk ?? qkey(x.q)) === qk).sort((a, b) => b.at - a.at)[0];
      if (hit) return begin(hit, true);
    }
    const r = reading(gate ? GATE_LINES : cast(method()));
    const entry = { id: gate ? "g0" : String(Date.now()), at: Date.now(), day: dayKey(), q, qk, m: method(), lines: r.lines, n: r.number, to: r.toNumber, tx: {} };
    if (!gate) { CASTS.put(entry.id, entry).catch(() => {}); $logv.set($logv.get() + 1); }
    begin(entry, false);
  };

  // Once per day: the entry is recast IN PLACE — new lines, new day, the stored text cleared. One question
  // stays one entry; yesterday's answer is gone because the owner chose to throw again.
  const recast = () => {
    const r = reading(gate ? GATE_LINES : cast(method()));
    const upd = { ...row, at: Date.now(), day: dayKey(), m: method(), lines: r.lines, n: r.number, to: r.toNumber, tx: {} };
    if (!gate) { CASTS.put(upd.id, upd).catch(() => {}); $logv.set($logv.get() + 1); }
    begin(upd, false);
  };

  const r = row ? reading(row.lines) : null;
  const name = r ? nameOf(r.number) : null;
  const toName = r?.toNumber ? nameOf(r.toNumber) : null;
  const canRecast = phase === "answer" && row && row.day !== dayKey();

  return html`<dialog id="ask" ref=${dref} class="modal" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box max-w-none w-screen h-[100dvh] max-h-none rounded-none p-0 overflow-hidden relative bg-[#0b0f14] text-white [&_*]:!shadow-none">
      <div class="relative z-10 flex flex-col h-full px-5" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem);padding-bottom:calc(env(safe-area-inset-bottom) + 1.25rem)">
        ${grip}
        <div class="flex items-center justify-between shrink-0">
          <h3 class="font-bold text-lg leading-tight min-w-0 truncate">
            ${phase === "answer" && name ? `${name.cn} ${name.py}` : T(t, "askTitle")}</h3>
          <button data-ask-close aria-label=${T(t, "close")} class="btn btn-sm btn-circle btn-ghost text-white shrink-0" onClick=${onClose}>${Icon("lucide:x", "text-lg")}</button>
        </div>

        ${phase === "ask" ? html`<div data-phase="ask" class="flex-1 min-h-0 flex flex-col justify-center gap-6 max-w-[440px] w-full mx-auto">
          <textarea id="question" ref=${qRef} rows="3" value=${qText} onInput=${(e) => setQText(e.target.value)}
            placeholder=${T(t, "question")} aria-label=${T(t, "question")}
            class="w-full resize-none rounded-2xl border border-white/25 bg-[#10151c] px-4 py-3 text-lg leading-snug text-white placeholder:text-white/70 outline-none focus:border-white/55"></textarea>
          <button data-cast onClick=${submit}
            class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-medium bg-white text-[#0b0f14] hover:bg-white/90 active:bg-white/80 transition-colors">
            ${Icon("lucide:dices", "text-lg")}${T(t, "cast")}</button>
        </div>` : null}

        ${phase === "cast" && row ? html`<div data-phase="cast" class="flex-1 min-h-0 flex items-center justify-center">
          <${CastPlay} lines=${row.lines} onDone=${() => setPhase("answer")} />
        </div>` : null}

        ${phase === "answer" && r ? html`<div data-phase="answer" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 max-w-[440px] w-full mx-auto pt-3">
          <div class="flex items-center gap-4 shrink-0">
            <div class="w-[84px] shrink-0"><${HexSvg} lines=${r.lines} label=${`${name.cn} ${name.py}`} cls="text-white/90" /></div>
            <div class="flex flex-col min-w-0 gap-1">
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="text-3xl leading-none font-medium">${name.cn}</span>
                <span class="text-white/80 truncate">${name.py}</span>
              </div>
              <div class="flex items-baseline gap-2 font-mono text-[length:var(--ms-label)] tabular-nums text-white/75 min-w-0">
                <span data-a-number>${r.number}</span><span>${r.upper.cn}${r.lower.cn}</span>
                ${r.changing ? html`<span class="text-primary truncate">→ ${toName.cn} · ${r.toNumber}</span>` : html`<span class="truncate">${T(t, "noMoving")}</span>`}
              </div>
              ${row.q ? html`<div class="text-sm text-white/80 line-clamp-2">${row.q}</div>` : null}
              ${replay ? html`<div data-asked class="font-mono text-[length:var(--ms-label)] tabular-nums text-white/70">${new Date(row.at).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-GB")} · ${T(t, row.m === "coins" ? "methodCoins" : "methodYarrow")}</div>` : null}
            </div>
          </div>

          ${text ? html`<${Typewriter} key=${row.id + loc} text=${text} />`
            : failed ? html`<div class="flex flex-col items-center gap-3 py-6 text-center">
                <span class="text-white/75">${T(t, "readingFail")}</span>
                <button onClick=${retry} class="rounded-xl border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors">${T(t, "retry")}</button>
              </div>`
            : html`<div class="flex flex-col gap-2 text-white/70">${[30, 34, 28, 22].map((n, i) => html`<div key=${i}><${Scramble} len=${n} /></div>`)}</div>`}

          <div class="mt-auto shrink-0 flex flex-col gap-2.5 pt-4">
            ${/* Provenance, not decoration: the app computes the hexagram exactly and does NOT own a
                  canonical translation, so the reader is told which half a model wrote. */""}
            <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-white/70">
              ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "readingGenerated")}</span>
            </div>
            <div class="flex gap-2">
              ${canRecast ? html`<button data-recast onClick=${recast}
                class="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-white/30 text-white hover:bg-white/10 transition-colors">
                ${Icon("lucide:dices")}${T(t, "recast")}</button>` : null}
              <button data-ask-done onClick=${onClose}
                class="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium bg-white text-[#0b0f14] hover:bg-white/90 transition-colors">
                ${T(t, "close")}</button>
            </div>
          </div>
        </div>` : null}
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// ── the casting animation — shuffle, then glue, bottom-first ─────────────────────────────────────
// Six lines flicker through random values (90ms — a hard snap, the point is chaos), then lock to the real
// cast bottom-first (初爻 first, as the stalks fall). A locked yin pair that became yang GLUES: the two
// halves slide together (animated SVG x/width — Chromium animates geometry attributes; if a browser does
// not, the values snap and the final frame is still exact) and a full bar crossfades over the seam, so no
// rounded-corner notch survives at the centre. One navigator.vibrate(6) per lock — a state event, not a
// tap, so it does not collide with the runtime's systemic tap haptic. Mounted only when !instant().
const HW = (W - GAP) / 2;
function CastPlay({ lines, onDone }) {
  const [cur, setCur] = useState(() => lines.map(() => 7));
  const [locked, setLocked] = useState(0);
  const lockRef = useRef(0);
  useEffect(() => {
    const rand = () => [6, 7, 8, 9][(Math.random() * 4) | 0];
    const flick = setInterval(() => {
      setCur((c) => c.map((v, i) => (i < lockRef.current ? lines[i] : rand())));
    }, 90);
    const timers = lines.map((_, i) => setTimeout(() => {
      lockRef.current = i + 1;
      setLocked(i + 1);
      setCur((c) => c.map((v, j) => (j <= i ? lines[j] : v)));
      try { navigator.vibrate?.(6); } catch { /* */ }
    }, 1000 + i * 280));
    const done = setTimeout(onDone, 1000 + 5 * 280 + 700);
    return () => { clearInterval(flick); timers.forEach(clearTimeout); clearTimeout(done); };
  }, []);

  return html`<svg viewBox=${`0 0 ${W} ${VB_H}`} class="w-[220px] max-w-[70vw] text-white/90" aria-hidden="true" fill="currentColor">
    ${cur.map((v, i) => {
      const isLocked = i < locked;
      const yang = bitOf(v) === 1, moving = isLocked && isMoving(v);
      const y = (5 - i) * PITCH, mid = y + BAR / 2;
      const glide = isLocked ? "transition-[x,width] duration-200 ease-out" : "";
      return html`<${Fragment} key=${i}>
        <rect x="0" y=${y} width=${yang ? W / 2 + 1 : HW} height=${BAR} rx=${BAR / 2} class=${glide} />
        <rect x=${yang ? W / 2 - 1 : (W + GAP) / 2} y=${y} width=${yang ? W / 2 + 1 : HW} height=${BAR} rx=${BAR / 2} class=${glide} />
        <rect x="0" y=${y} width=${W} height=${BAR} rx=${BAR / 2}
          class=${`transition-opacity duration-150 delay-150 ${isLocked && yang ? "opacity-100" : "opacity-0"}`} />
        <circle cx=${W / 2} cy=${mid} r=${BAR * 0.62} fill="none" stroke="currentColor" stroke-width="1.6"
          class=${`transition-opacity duration-200 delay-200 ${moving && yang ? "opacity-100" : "opacity-0"}`} />
        <g class=${`transition-opacity duration-200 delay-200 ${moving && !yang ? "opacity-100" : "opacity-0"}`}>
          <line x1=${W / 2 - 3.4} y1=${mid - 3.4} x2=${W / 2 + 3.4} y2=${mid + 3.4} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1=${W / 2 - 3.4} y1=${mid + 3.4} x2=${W / 2 + 3.4} y2=${mid - 3.4} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </g>
      <//>`;
    })}
  </svg>`;
}

// ── the typewriter — the answer writes itself ────────────────────────────────────────────────────
// App-local on purpose (RESEARCH.md): first consumer; promote to /_rt/skeleton.js when a second app wants
// it. Speed adapts so any answer finishes in ~6-9s. Screen readers get the full text once (sr-only); the
// typed copy is aria-hidden so nothing announces per-character.
function Typewriter({ text }) {
  const [n, setN] = useState(() => (instant() ? text.length : 0));
  useEffect(() => {
    if (instant()) { setN(text.length); return; }
    setN(0);
    const step = Math.max(12, Math.min(28, 9000 / Math.max(1, text.length)));
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, step);
    return () => clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return html`<div data-answer-text class="text-[1.02rem] leading-relaxed whitespace-pre-line">
    <span class="sr-only">${text}</span>
    <span aria-hidden="true">${text.slice(0, n)}${done ? "" : html`<span class="inline-block w-[2px] h-[1.05em] align-[-0.15em] bg-white/80 animate-pulse"></span>`}</span>
  </div>`;
}

// ── journal ──────────────────────────────────────────────────────────────────────────────────────
export function ichingLog({ S, screen, openScreen, closeScreen, confirm, undo }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const v = useStore($logv);
  const sel = useStore($sel);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (gate) { setRows(GATE_ROWS); return; }
    CASTS.all().then((r) => setRows(r.sort((a, b) => b.at - a.at))).catch(() => setRows([]));
  }, [v]);

  const del = async (row) => {
    if (!gate) await CASTS.del(row.id).catch(() => {});
    setRows((rs) => rs.filter((x) => x.id !== row.id));
    undo?.(async () => { if (!gate) await CASTS.put(row.id, row).catch(() => {}); $logv.set($logv.get() + 1); },
      T(t, "logDeleted"));
  };

  const clearAll = () => confirm?.({
    title: T(t, "logClearTitle"),
    body: T(t, "logClearBody", { n: rows?.length ?? 0 }),
    action: T(t, "logClear"),
    onConfirm: async () => {
      if (!gate) await Promise.all((rows ?? []).map((r) => CASTS.del(r.id).catch(() => {})));
      setRows([]);
      $logv.set($logv.get() + 1);
    },
  });

  if (rows === null) return html`<${Scramble} lines=${4} />`;
  if (!rows.length) {
    return html`<div class="flex flex-col items-center text-center gap-2 py-16 px-6">
      ${Icon("lucide:scroll-text", "text-4xl text-base-content/40")}
      <span class="text-base-content/80">${T(t, "logEmpty")}</span>
      <span class="text-sm text-muted">${T(t, "logEmptyHint")}</span>
    </div>`;
  }

  return html`<div class="flex flex-col gap-2 max-w-[440px] mx-auto w-full" data-live data-log>
    ${rows.map((row) => {
      const nm = nameOf(row.n), to = row.to ? nameOf(row.to) : null;
      return html`<div key=${row.id} data-entry class="rounded-2xl sf-raised sf-e2 px-4 py-3 flex items-center gap-4">
        <button data-open class="flex-1 min-w-0 flex items-center gap-4 text-left" onClick=${() => { $sel.set(row); openScreen("entry"); }}>
          <div class="w-11 shrink-0"><${HexSvg} lines=${row.lines} label=${nm.cn} cls="text-base-content/85" /></div>
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="font-medium">${nm.cn}</span>
              <span class="text-sm text-muted truncate">${nm.py}</span>
              ${to ? html`<span class="text-sm text-muted truncate">→ ${to.cn}</span>` : null}
            </div>
            <span class="text-sm text-muted truncate">${row.q || T(t, "noQuestion")}</span>
          </div>
        </button>
        <button data-del aria-label=${T(t, "logDeleted")} class="btn btn-ghost btn-sm btn-circle shrink-0" onClick=${() => del(row)}>
          ${Icon("lucide:trash-2", "text-base")}
        </button>
      </div>`;
    })}
    <button data-clear class="btn btn-ghost btn-sm rounded-xl self-center mt-2 text-muted" onClick=${clearAll}>${T(t, "logClear")}</button>

    <${LogSheet} open=${screen === "entry"} onClose=${closeScreen} row=${sel} t=${t} loc=${loc} />
  </div>`;
}

// The journal entry's reading — the stored text (or a one-time fetch into it), plain, no ceremony: the
// journal is the reference copy, the ceremony is the performance.
function LogSheet({ open, onClose, row, t, loc }) {
  const nm = row ? nameOf(row.n) : null;
  const { text, failed, retry } = useReadingText(row, loc, open && !!row);
  return html`<${Sheet} id="logsheet" open=${open} onClose=${onClose} locale=${loc}
    title=${nm ? `${nm.cn} ${nm.py}` : T(t, "readingTitle")} subtitle=${row ? (row.q || T(t, "noQuestion")) : ""}>
    ${row ? html`<div class="flex flex-col gap-4 pb-1">
      ${text ? html`<p data-log-text class="leading-relaxed whitespace-pre-line">${text}</p>`
        : failed ? html`<div class="flex flex-col items-center gap-3 py-6 text-center">
            <span class="text-muted">${T(t, "readingFail")}</span>
            <button class="btn btn-sm btn-outline rounded-xl" onClick=${retry}>${T(t, "retry")}</button>
          </div>`
        : html`<div class="flex flex-col gap-2 text-base-content/70">${[28, 32, 26].map((n, i) => html`<div key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
      <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-muted border-t border-base-content/10 pt-3">
        ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "readingGenerated")}</span>
      </div>
    </div>` : null}
  <//>`;
}
