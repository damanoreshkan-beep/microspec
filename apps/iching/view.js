// Book of Changes (易經) — a magical film, not an instrument panel (owner's brief, 2026-08-11: the old
// island UI was rejected wholesale; RESEARCH.md logs the acts).
//
// THE FILM: the WebGPU current is the only set. Act I — the field, the cast hexagram luminous at centre,
// one golden caret blinking in the question slot. Act II — the veil: a full-screen question written on a
// golden line. Act III — the six lines shuffle LARGE while the field dances with them (the shader's seed
// IS the six lines, so the slits of light in the current shuffle in step with the DOM figure), then glue
// bottom-first. Act IV — the name appears, and the answer writes itself out like film subtitles.
//
// The honest math stays (/_rt/iching.js: yarrow 1:5:7:3 vs coins 1:3:3:1 — the odds ARE the tradition),
// but it is spoken as an incantation under the shuffle, not laid out as a control row. The journal is the
// oracle's MEMORY: a repeated question (normalized `qk`) replays its entry verbatim — same lines, same
// stored text (`tx[locale]`, persisted the moment the answer lands, so replays work offline) — and may be
// recast once per local day. The Book does not answer one question twice.
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
import { Sheet, Segmented } from "/_rt/ui.js";
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
const $lines = atom(null);          // 6/7/8/9, bottom first — the current cast, or null
const $last = atom(null);           // the journal row behind $lines (the "read again" target)
const $view = atom(null);           // what the ceremony opens as: {mode:"ask"} | {mode:"read", row}
const $sel = atom(null);            // the journal row the log sheet shows
const $logv = atom(0);              // bumped when the journal changes, so the list reloads
const $seedLines = atom(null);      // the shuffle's live lines — the FIELD follows them (seed = the cast)

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
// One element instead of twelve divs, exact geometry at any size, and the CANONICAL notation for movement:
//
//   7  young yang   ▬▬▬▬▬        a whole bar
//   8  young yin    ▬▬  ▬▬       a bar with a gap
//   9  old yang     ▬▬○▬▬        whole, marked with a circle — it is about to open
//   6  old yin      ▬▬✕▬▬        broken, marked with a cross — it is about to close
//
// The moving marks carry the ONE colour in the film (--app-accent, old gold): movement is the only thing
// colour means here. Bars are currentColor — the surface decides the ink, this decides the shape.
const W = 100, BAR = 6, PITCH = 11, GAP = 16, VB_H = PITCH * 6 - (PITCH - BAR);

/**
 * @param lines  6/7/8/9 bottom-first — the cast, with movement
 * @param bits   0/1 bottom-first — a plain hexagram (the transformed one has no line values)
 */
const HexSvg = ({ lines, bits, label, cls }) => {
  const rows = lines ?? bits.map((b) => (b ? 7 : 8));      // bits render as static lines
  // `data-line` / `data-moving` mark the CAST only — the transformed hexagram is where the cast is going,
  // not a second throw; tagging it too once broke the e2e count for a real semantic reason.
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
          ? html`<circle cx=${W / 2} cy=${mid} r=${BAR * 0.62} fill="none" stroke="var(--app-accent)" stroke-width="1.8" />`
          : null}
        ${moving && !yang
          ? html`<${Fragment}>
              <line x1=${W / 2 - 3.4} y1=${mid - 3.4} x2=${W / 2 + 3.4} y2=${mid + 3.4} stroke="var(--app-accent)" stroke-width="1.8" stroke-linecap="round" />
              <line x1=${W / 2 - 3.4} y1=${mid + 3.4} x2=${W / 2 + 3.4} y2=${mid - 3.4} stroke="var(--app-accent)" stroke-width="1.8" stroke-linecap="round" />
            <//>`
          : null}
      <//>`;
    })}
  </svg>`;
};

// The golden caret — the film's through-line: it blinks in the question slot, waits on the writing line,
// and types the answer. One mark, one colour, one meaning: here is where the Book speaks next.
const Caret = (cls) => html`<span aria-hidden="true" class=${`inline-block w-[2px] h-[1em] align-[-0.12em] animate-pulse ${cls || ""}`} style="background:var(--app-accent)"></span>`;

// ── Act I — the field ────────────────────────────────────────────────────────────────────────────
export function iching({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const lines = useStore($lines);
  const shuffling = useStore($seedLines);

  // Seed the gate's cast once, so the populated screen renders with no interaction and no randomness.
  useEffect(() => {
    if (gate && !$lines.get()) { $lines.set(GATE_LINES); $last.set(GATE_ROWS[0]); }
  }, []);

  const r = lines ? reading(lines) : null;
  const name = r ? nameOf(r.number) : null;
  const toName = r?.toNumber ? nameOf(r.toNumber) : null;

  const openAsk = () => { $view.set({ mode: "ask" }); openScreen("ask"); };
  const openRead = () => { const row = $last.get(); if (!row) return openAsk(); $view.set({ mode: "read", row }); openScreen("ask"); };

  return html`<${Fragment}>
    ${/* The current — and during the shuffle the FIELD follows the flickering lines, because the shader's
          seed literally is the six line values. The page flow stays empty; the film is composed of fixed
          layers between the measured chrome tokens (--hdr-h/--dock-h — published, never hand-written). */""}
    <${HeroStage} shader=${new URL("hero.wgsl", import.meta.url)} seed=${packSeed(shuffling ?? (r ? r.lines : null) ?? [7, 7, 7, 7, 7, 7])} />

    ${/* Everything visible sits in ONE .ms-stage — the class consumes the measured chrome contract
          (--hdr-h/--dock-h/--dock-w), so the app never writes a chrome number. Centre: the cast, luminous
          on a soft night pane — a real DOM ground (axe cannot see the canvas), so white ink is safe in
          both themes; tapping the figure replays its reading. Foot: the question slot, the single control
          on the set, the golden caret already blinking in it. */""}
    <div class="ms-stage z-10 flex flex-col items-center pointer-events-none">
      <div class="flex-1 min-h-0 w-full flex flex-col items-center justify-center px-6">
        ${r ? html`<button data-read data-live data-reading aria-label=${T(t, "readingOpen")} onClick=${openRead}
            class="pointer-events-auto max-w-full min-h-0 flex flex-col items-center gap-2.5 rounded-[2rem] bg-[#0b0f14]/85 backdrop-blur-[2px] px-8 py-6 text-white active:bg-[#0b0f14]/95 transition-colors">
            <div class="w-[clamp(5.5rem,20vh,9rem)] min-h-0"><${HexSvg} lines=${r.lines} label=${`${name.cn} ${name.py}`} cls="text-white/90" /></div>
            <div class="text-[clamp(2.2rem,6.5vh,3.4rem)] font-light leading-none">${name.cn}</div>
            <div class="font-mono uppercase tracking-[0.3em] text-[length:var(--ms-label)] text-white/70">${name.py}</div>
            <div class="flex items-center gap-2 font-mono text-[length:var(--ms-label)] tabular-nums text-white/70">
              <span data-number>${r.number}</span>
              <span>${r.upper.cn}${r.lower.cn}</span>
              <span data-change>${r.changing
                ? html`<span aria-hidden="true" style="color:var(--app-accent)">→</span> ${toName.cn} · ${r.toNumber}`
                : T(t, "noMoving")}</span>
            </div>
          </button>`
        : html`<div data-live class="pointer-events-auto flex flex-col items-center gap-2 rounded-[2rem] bg-[#0b0f14]/85 px-8 py-6 text-center text-white">
            <span class="text-white/90">${T(t, "emptyCast")}</span>
            <span class="text-sm text-white/70">${T(t, "emptyCastHint")}</span>
          </div>`}
      </div>
      <button data-ask onClick=${openAsk}
        class="pointer-events-auto shrink-0 mb-4 w-[min(86vw,24rem)] rounded-full border border-white/25 bg-[#0b0f14]/90 px-6 py-3.5 text-left text-white/75 hover:border-white/50 transition-colors">
        ${Caret("mr-2.5")}${T(t, "question")}
      </button>
    </div>

    <${Ceremony} open=${screen === "ask"} onClose=${closeScreen} t=${t} loc=${loc} />
  </${Fragment}>`;
}

// ── the ceremony — Acts II–V, one transparent full-screen dialog over the living field ───────────
// A `class="modal"` top-layer dialog (tarot's Ritual precedent), history-backed via S.screen so Back
// closes it at any act. The box is TRANSPARENT: the film never cuts away from the current — a veil dims
// it (lighter during the shuffle so the slits visibly dance), and every act plays over it.
function Ceremony({ open, onClose, t, loc }) {
  const dref = useRef(), qRef = useRef(), actRef = useRef();
  const [phase, setPhase] = useState("ask");
  const [row, setRow] = useState(null);
  const [replay, setReplay] = useState(false);
  const [qText, setQText] = useState("");
  const { boxRef, grip } = useSheetDrag(onClose);
  const { text, failed, retry } = useReadingText(row, loc, phase === "answer");
  const m = useStore($method);
  const w = METHODS[m] ?? METHODS.yarrow;

  useEffect(() => { const d = dref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  useEffect(() => {
    if (!open) { $seedLines.set(null); return; }
    const v = $view.get() || { mode: "ask" };
    if (v.mode === "read" && v.row) { setRow(v.row); setReplay(true); setPhase("answer"); }
    else { setRow(null); setReplay(false); setQText(""); setPhase("ask"); }
    if (!instant()) setTimeout(() => qRef.current?.focus?.(), 420);
  }, [open]);
  // Each act enters like a cut in the film: rise and fade, one orchestrated move, nothing scattered.
  useEffect(() => {
    if (instant() || !open) return;
    const el = actRef.current;
    if (el) animate(el, { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] }, { duration: 0.45, ease: "easeOut" });
  }, [phase, open]);

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
  const pill = "rounded-full border px-6 py-2.5 font-mono uppercase tracking-[0.18em] text-sm transition-colors";

  return html`<dialog id="ask" ref=${dref} class="modal" aria-label=${T(t, "askTitle")} onClose=${onClose}>
    ${/* data-theme="signal" re-scopes the DaisyUI tokens DARK inside the box, whatever the page theme —
          the kit strip (Segmented) reads base-content, and dark ink on the dark veil would vanish in the
          light theme. The film is night in both themes, so the tokens say so. */""}
    <div ref=${boxRef} data-theme="signal" class="modal-box max-w-none w-screen h-[100dvh] max-h-none rounded-none p-0 overflow-hidden relative bg-transparent text-white [&_*]:!shadow-none">
      ${/* The veil: near-black over the current, thinner while the lines shuffle so the field visibly
            dances with them. A solid-alpha ground in BOTH themes — axe composites it over the page. */""}
      <div aria-hidden="true" class=${`absolute inset-0 transition-colors duration-700 ${phase === "cast" ? "bg-[#0b0f14]/70" : "bg-[#0b0f14]/90"}`}></div>
      <div class="relative z-10 flex flex-col h-full px-6" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem);padding-bottom:calc(env(safe-area-inset-bottom) + 1.25rem)">
        ${grip}
        <div class="flex items-center justify-end shrink-0">
          <button data-ask-close aria-label=${T(t, "close")} class="btn btn-sm btn-circle btn-ghost text-white" onClick=${onClose}>${Icon("lucide:x", "text-lg")}</button>
        </div>

        ${phase === "ask" ? html`<div data-phase="ask" ref=${actRef} class="flex-1 min-h-0 flex flex-col max-w-[440px] w-full mx-auto">
          <div class="flex-1 min-h-0 flex flex-col justify-center gap-6">
            <div class="text-center font-mono uppercase tracking-[0.35em] text-[length:var(--ms-label)] text-white/70">${T(t, "askTitle")}</div>
            <div class="flex flex-col gap-3">
              <textarea id="question" ref=${qRef} rows="3" value=${qText} onInput=${(e) => setQText(e.target.value)}
                placeholder=${T(t, "question")} aria-label=${T(t, "question")}
                class="w-full resize-none bg-transparent text-center text-2xl font-light leading-snug text-white placeholder:text-white/40 outline-none border-0 px-1"
                style="caret-color:var(--app-accent)"></textarea>
              ${/* The writing line — the golden hairline the answer will later type itself onto. */""}
              <div aria-hidden="true" class="h-px w-full" style="background:linear-gradient(90deg,transparent,var(--app-accent),transparent);opacity:.6"></div>
            </div>
            <button data-cast onClick=${submit} class=${`${pill} self-center border-white/30 text-white hover:bg-white/10 active:bg-white/15`}>
              ${T(t, "cast")}</button>
          </div>
          ${/* The method, spoken quietly at the foot of the act — a choice, not a dashboard: the strip and
                the exact ratios it implies, the one fact separating the two traditions. */""}
          <div class="shrink-0 flex flex-col items-center gap-2 pb-2">
            <${Segmented} attr="data-method" size="sm" variant="outline" label=${T(t, "methodLabel")}
              items=${[{ id: "yarrow", label: T(t, "methodYarrow") }, { id: "coins", label: T(t, "methodCoins") }]}
              value=${m} onChange=${(id) => $method.set(id)} />
            <div data-odds class="font-mono text-[length:var(--ms-label)] tabular-nums text-white/70">
              ${T(t, "oddsYinYang")} ${w.weights[6]}/${w.total} · ${T(t, "oddsYangYin")} ${w.weights[9]}/${w.total}</div>
          </div>
        </div>` : null}

        ${phase === "cast" && row ? (() => {
          const wm = METHODS[row.m] ?? METHODS.yarrow;
          return html`<div data-phase="cast" ref=${actRef} class="flex-1 min-h-0 flex flex-col items-center justify-center gap-7">
            <${CastPlay} lines=${row.lines} onDone=${() => setPhase("answer")} />
            ${/* The odds as an incantation under the falling lines — the tradition's one honest number,
                  spoken during the ritual instead of laid out as a dashboard row. */""}
            <div class="rounded-full bg-[#0b0f14]/90 px-4 py-1.5 font-mono text-[length:var(--ms-label)] tabular-nums text-white/75">
              ${T(t, row.m === "coins" ? "methodCoins" : "methodYarrow")} · ${T(t, "oddsYinYang")} ${wm.weights[6]}/${wm.total} · ${T(t, "oddsYangYin")} ${wm.weights[9]}/${wm.total}</div>
          </div>`;
        })() : null}

        ${phase === "answer" && r ? html`<div data-phase="answer" ref=${actRef} class="flex-1 min-h-0 overflow-y-auto flex flex-col max-w-[480px] w-full mx-auto">
          <div class="shrink-0 flex flex-col items-center gap-2.5 pt-2 text-center">
            <div class="w-[clamp(4.5rem,15vh,6.5rem)]"><${HexSvg} lines=${r.lines} label=${`${name.cn} ${name.py}`} cls="text-white/90" /></div>
            <div class="text-[clamp(2.4rem,7vh,3.6rem)] font-light leading-none">${name.cn}</div>
            <div class="font-mono uppercase tracking-[0.3em] text-[length:var(--ms-label)] text-white/70">${name.py}</div>
            <div class="flex items-center gap-2 font-mono text-[length:var(--ms-label)] tabular-nums text-white/70">
              <span data-a-number>${r.number}</span>
              <span>${r.upper.cn}${r.lower.cn}</span>
              ${r.changing
                ? html`<span><span aria-hidden="true" style="color:var(--app-accent)">→</span> ${toName.cn} · ${r.toNumber}</span>`
                : html`<span>${T(t, "noMoving")}</span>`}
            </div>
            ${row.q ? html`<div class="text-sm text-white/80 max-w-[38ch] line-clamp-2">${row.q}</div>` : null}
            ${replay ? html`<div data-asked class="font-mono uppercase tracking-[0.2em] text-[length:var(--ms-label)] text-white/70">
              ${new Date(row.at).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-GB")} · ${T(t, row.m === "coins" ? "methodCoins" : "methodYarrow")}</div>` : null}
          </div>

          <div class="flex-1 flex flex-col justify-center py-6">
            ${text ? html`<${Typewriter} key=${row.id + loc} text=${text} />`
              : failed ? html`<div class="flex flex-col items-center gap-3 py-6 text-center">
                  <span class="text-white/80">${T(t, "readingFail")}</span>
                  <button onClick=${retry} class=${`${pill} border-white/30 text-white hover:bg-white/10`}>${T(t, "retry")}</button>
                </div>`
              : html`<div class="flex flex-col items-center gap-2 text-white/70">${[26, 32, 28, 20].map((n, i) => html`<div key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
          </div>

          <div class="shrink-0 flex flex-col items-center gap-3 pb-1">
            ${/* Provenance, not decoration: the hexagram is computed exactly; the words are a model's, and
                  the reader is told so. */""}
            <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-white/70 text-center">
              ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "readingGenerated")}</span>
            </div>
            <div class="flex gap-2.5">
              ${canRecast ? html`<button data-recast onClick=${recast} class=${`${pill} border-white/30 text-white hover:bg-white/10`}>
                <span aria-hidden="true" class="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style="background:var(--app-accent)"></span>${T(t, "recast")}</button>` : null}
              <button data-ask-done onClick=${onClose} class=${`${pill} border-transparent bg-white text-[#0b0f14] hover:bg-white/90`}>
                ${T(t, "close")}</button>
            </div>
          </div>
        </div>` : null}
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// ── Act III — the shuffle and the glue ───────────────────────────────────────────────────────────
// Six lines flicker through random values (90ms — a hard snap, the point is chaos) while the FIELD behind
// dances with them ($seedLines drives the shader's seed). Then they lock to the real cast bottom-first
// (初爻 first, as the stalks fall): a yin pair that became yang GLUES — the two halves slide together
// (animated SVG x/width; Chromium animates geometry attributes, and a browser that does not simply snaps
// to the exact final frame) and a full bar crossfades over the seam. One navigator.vibrate(6) per lock —
// a state event, not a tap, so it does not collide with the systemic tap haptic. Mounted only when !instant().
const HW = (W - GAP) / 2;
function CastPlay({ lines, onDone }) {
  const [cur, setCur] = useState(() => lines.map(() => 7));
  const [locked, setLocked] = useState(0);
  const lockRef = useRef(0), curRef = useRef(lines.map(() => 7));
  useEffect(() => {
    const rand = () => [6, 7, 8, 9][(Math.random() * 4) | 0];
    const step = () => {
      const next = curRef.current.map((v, i) => (i < lockRef.current ? lines[i] : rand()));
      curRef.current = next; setCur(next); $seedLines.set(next);
    };
    const flick = setInterval(step, 90);
    const timers = lines.map((_, i) => setTimeout(() => {
      lockRef.current = i + 1;
      setLocked(i + 1);
      step();
      try { navigator.vibrate?.(6); } catch { /* */ }
    }, 1000 + i * 280));
    const done = setTimeout(onDone, 1000 + 5 * 280 + 700);
    return () => { clearInterval(flick); timers.forEach(clearTimeout); clearTimeout(done); $seedLines.set(null); };
  }, []);

  return html`<svg viewBox=${`0 0 ${W} ${VB_H}`} class="w-[min(62vw,17rem)] max-h-[52vh] text-white/90" aria-hidden="true" fill="currentColor">
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
        <circle cx=${W / 2} cy=${mid} r=${BAR * 0.62} fill="none" stroke="var(--app-accent)" stroke-width="1.8"
          class=${`transition-opacity duration-200 delay-200 ${moving && yang ? "opacity-100" : "opacity-0"}`} />
        <g class=${`transition-opacity duration-200 delay-200 ${moving && !yang ? "opacity-100" : "opacity-0"}`}>
          <line x1=${W / 2 - 3.4} y1=${mid - 3.4} x2=${W / 2 + 3.4} y2=${mid + 3.4} stroke="var(--app-accent)" stroke-width="1.8" stroke-linecap="round" />
          <line x1=${W / 2 - 3.4} y1=${mid + 3.4} x2=${W / 2 + 3.4} y2=${mid - 3.4} stroke="var(--app-accent)" stroke-width="1.8" stroke-linecap="round" />
        </g>
      <//>`;
    })}
  </svg>`;
};

// ── Act V — the answer writes itself, like film subtitles ────────────────────────────────────────
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
  return html`<div data-answer-text class="text-center text-[1.05rem] font-light leading-loose whitespace-pre-line text-white/95">
    <span class="sr-only">${text}</span>
    <span aria-hidden="true">${text.slice(0, n)}${done ? "" : Caret("ml-0.5")}</span>
  </div>`;
}

// ── journal — the oracle's memory ────────────────────────────────────────────────────────────────
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
      // The QUESTION leads the row — the journal is remembered by what was asked, not by what fell.
      return html`<div key=${row.id} data-entry class="rounded-2xl sf-raised sf-e2 px-4 py-3 flex items-center gap-4">
        <button data-open class="flex-1 min-w-0 flex items-center gap-4 text-left" onClick=${() => { $sel.set(row); openScreen("entry"); }}>
          <div class="w-10 shrink-0"><${HexSvg} lines=${row.lines} label=${nm.cn} cls="text-base-content/85" /></div>
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <span class="font-medium truncate">${row.q || T(t, "noQuestion")}</span>
            <span class="font-mono text-[length:var(--ms-label)] tabular-nums text-muted truncate">
              ${nm.cn} ${nm.py}${to ? ` → ${to.cn}` : ""} · ${new Date(row.at).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-GB")}</span>
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
