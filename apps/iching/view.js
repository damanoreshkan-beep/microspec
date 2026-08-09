// Book of Changes (易經) — cast a hexagram the way it was actually cast, and say honestly what is computed
// and what is generated.
//
// The whole point of the app is in /_rt/iching.js: the two traditional methods carry DIFFERENT odds. Yarrow
// stalks make yang→yin three times likelier than yin→yang (3/16 vs 1/16); three coins are symmetric (1/8
// each). Almost every digital I Ching draws a uniform random 6-9 and erases that. This one draws from the
// real weights and shows them, because the odds ARE the tradition.
//
// What is computed exactly: the hexagram, its trigrams, which lines move, the hexagram it changes into, and
// the King Wen number (from a table validated structurally in the unit tests). What is generated: the
// reading, marked as such. No canonical translation ships here — see apps/iching/book.js for why.
//
// DATA IS BOTTOM-FIRST, DISPLAY IS TOP-FIRST. lines[0] is the bottom line (初爻). Only the template
// reverses; nothing else may, or the app silently reads the wrong line.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
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
import { nameOf } from "./book.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const CASTS = collection("ichingCasts");

const $method = persistentAtom("iching:method", "yarrow");
const $question = atom("");
const $lines = atom(null);          // 6/7/8/9, bottom first — or null before the first cast
const $logv = atom(0);              // bumped when the journal changes, so the list reloads

// Under the gate the screen must be POPULATED — an empty caster photographs as a blank page and every
// downstream check would then measure nothing. A fixed cast, chosen to exercise the interesting states:
// two moving lines, so there is a second hexagram and a change to show.
const GATE_LINES = [9, 8, 7, 6, 7, 8];

const method = () => METHODS[$method.get()] ? $method.get() : "yarrow";

function doCast() {
  buzz(12);
  $lines.set(gate ? GATE_LINES : cast(method()));
  const r = reading($lines.get());
  if (!gate) {
    CASTS.put(String(Date.now()), {
      at: Date.now(), q: $question.get().trim(), m: method(),
      lines: r.lines, n: r.number, to: r.toNumber,
    }).catch(() => {});
    $logv.set($logv.get() + 1);
  }
}

// ── one line of a hexagram ───────────────────────────────────────────────────────────────────────
// Yang is one bar; yin is two with a gap. A moving line carries a mark rather than a colour alone, so it
// survives both themes and anyone who cannot separate the two hues.
const Line = ({ v, n }) => {
  const yang = bitOf(v) === 1, moving = isMoving(v);
  const bar = `h-2.5 rounded-full ${moving ? "bg-primary" : "bg-base-content/80"}`;
  return html`<div class="flex items-center gap-3" data-line=${n} data-moving=${moving ? "1" : "0"}>
    <div class="flex-1 flex items-center gap-2">
      ${yang
        ? html`<div class=${`${bar} flex-1`}></div>`
        : html`<div class=${`${bar} flex-1`}></div><div class=${`${bar} flex-1`}></div>`}
    </div>
    <span class="w-9 shrink-0 text-right font-mono text-[length:var(--ms-label)] tabular-nums ${moving ? "text-primary" : "text-muted"}">${v}</span>
  </div>`;
};

/** Six lines, drawn TOP DOWN from bottom-first data. The reverse lives here and nowhere else. */
const Hexagram = ({ lines, compact }) => html`<div class=${`flex flex-col ${compact ? "gap-1.5" : "gap-2.5"} w-full`}>
  ${[...lines].reverse().map((v, i) => html`<${Line} key=${5 - i} v=${v} n=${6 - i} />`)}
</div>`;

/** A static hexagram from bits (the transformed one — it has no 6/7/8/9, only yin and yang). */
const HexBits = ({ bits }) => html`<div class="flex flex-col gap-1.5 w-full">
  ${[...bits].reverse().map((b, i) => html`<div key=${i} class="flex items-center gap-2">
    ${b ? html`<div class="h-2 flex-1 rounded-full bg-base-content/55"></div>`
        : html`<div class="h-2 flex-1 rounded-full bg-base-content/55"></div><div class="h-2 flex-1 rounded-full bg-base-content/55"></div>`}
  </div>`)}
</div>`;

const Trigram = ({ t, tri, side }) => html`<div class="flex items-baseline gap-2 min-w-0">
  <span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wide text-muted shrink-0">${T(t, side)}</span>
  <span class="text-lg leading-none">${tri.glyph}</span>
  <span class="font-medium truncate">${tri.cn}</span>
  <span class="text-muted text-sm truncate">${tri.pinyin}</span>
</div>`;

export function iching({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const lines = useStore($lines), m = useStore($method), q = useStore($question);
  useStore($logv);

  // Seed the gate's cast once, so the populated screen renders with no interaction and no randomness.
  useEffect(() => { if (gate && !$lines.get()) $lines.set(GATE_LINES); }, []);

  const r = lines ? reading(lines) : null;
  const name = r ? nameOf(r.number) : null;
  const toName = r?.toNumber ? nameOf(r.toNumber) : null;
  const w = METHODS[m] ?? METHODS.yarrow;

  // The facts handed to the model. Structure only — the app has no canonical text to give it, and saying
  // so in the prompt is what keeps the reading anchored to the cast rather than to a half-remembered book.
  const sig = r ? `${m}|${r.lines.join("")}|${q.trim()}` : "";
  const input = r ? [
    `Hexagram ${r.number} ${name.cn} (${name.py}).`,
    `Lower trigram ${r.lower.cn} ${r.lower.pinyin} (${r.lower.en}), upper trigram ${r.upper.cn} ${r.upper.pinyin} (${r.upper.en}).`,
    r.moving.length ? `Moving lines, counted from the bottom: ${r.moving.join(", ")}.` : "No moving lines.",
    r.toNumber ? `It changes into hexagram ${r.toNumber} ${toName.cn} (${toName.py}).` : "",
    q.trim() ? `The question asked: ${q.trim()}` : "No question was asked.",
  ].filter(Boolean).join("\n") : "";

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 max-w-[440px] mx-auto w-full">
      <input id="question" value=${q} onInput=${(e) => $question.set(e.target.value)}
        placeholder=${T(t, "question")} aria-label=${T(t, "question")}
        class="input input-bordered w-full rounded-2xl" />

      <${Segmented} attr="data-method" size="sm" label=${T(t, "methodLabel")}
        items=${[{ id: "yarrow", label: T(t, "methodYarrow") }, { id: "coins", label: T(t, "methodCoins") }]}
        value=${m} onChange=${(id) => { buzz(); $method.set(id); }} />

      ${/* The odds of the CHOSEN method, as the exact ratios they are. This is not hint text decorating a
            control — it is the one fact that distinguishes the two methods, and it changes when you switch. */""}
      <div class="flex items-center justify-between gap-3 font-mono text-[length:var(--ms-label)] tabular-nums text-muted px-1" data-odds>
        <span class="uppercase tracking-wide text-muted">${T(t, "oddsTitle")}</span>
        <span>${T(t, "oddsYinYang")} ${w.weights[6]}/${w.total}</span>
        <span>${T(t, "oddsYangYin")} ${w.weights[9]}/${w.total}</span>
      </div>

      ${r ? html`<div class="flex flex-col gap-4" data-live data-reading>
        <div class="rounded-3xl sf-e2 px-5 py-5 flex flex-col gap-4">
          <div class="flex items-baseline justify-between gap-3">
            <div class="flex items-baseline gap-2.5 min-w-0">
              <span class="text-3xl leading-none font-medium">${name.cn}</span>
              <span class="text-muted truncate">${name.py}</span>
            </div>
            <span class="font-mono tabular-nums text-base-content/50 shrink-0" data-number>${r.number}</span>
          </div>
          <${Hexagram} lines=${r.lines} />
          <div class="flex flex-col gap-1.5 pt-0.5">
            <${Trigram} t=${t} tri=${r.upper} side="above" />
            <${Trigram} t=${t} tri=${r.lower} side="below" />
          </div>
        </div>

        <div class="rounded-3xl sf-inset px-5 py-4 flex flex-col gap-3" data-change>
          ${r.changing ? html`
            <div class="flex items-center justify-between gap-3">
              <span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wide text-muted">${T(t, "moving")}</span>
              <span class="font-mono tabular-nums text-primary">${r.moving.join(" · ")}</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="flex-1"><${HexBits} bits=${r.toBits} /></div>
              <div class="flex flex-col items-end gap-0.5 min-w-0">
                <span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wide text-muted">${T(t, "changesTo")}</span>
                <span class="text-xl leading-none font-medium truncate">${toName.cn}</span>
                <span class="text-sm text-muted truncate">${toName.py}</span>
                <span class="font-mono tabular-nums text-muted text-sm">${r.toNumber}</span>
              </div>
            </div>`
            : html`<span class="text-muted">${T(t, "noMoving")}</span>`}
        </div>

        <div class="flex gap-2">
          <button data-cast class="btn btn-primary flex-1 rounded-2xl gap-2" onClick=${doCast}>${Icon("lucide:dices", "text-lg")}${T(t, "recast")}</button>
          <button data-read class="btn btn-outline rounded-2xl gap-2" onClick=${() => { buzz(); openScreen("reading"); }}>${Icon("lucide:sparkles")}${T(t, "readingOpen")}</button>
        </div>
      </div>`
      : html`<button data-cast class="btn btn-primary btn-lg rounded-2xl gap-2 mt-2" onClick=${doCast}>${Icon("lucide:dices", "text-lg")}${T(t, "cast")}</button>`}
    </div>

    <${ReadSheet} open=${screen === "reading"} onClose=${closeScreen} sig=${sig} input=${input} t=${t} loc=${loc}
      title=${name ? `${name.cn} ${name.py}` : T(t, "readingTitle")} />
  </${Fragment}>`;
}

// The generated reading. Fail-open: if nothing lands in ~12s (offline, or the free tier rate-limited) stop
// the skeleton and offer a retry rather than holding an empty sheet open forever.
function ReadSheet({ open, onClose, sig, input, t, loc, title }) {
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const run = () => {
    setFailed(false);
    warmSummary(sig, input, loc);
    return setTimeout(() => setFailed(!isSummarized(sig, loc)), 12000);
  };
  useEffect(() => { if (!open || !sig) return; const id = run(); return () => clearTimeout(id); }, [open, sig, loc]);
  const text = open && sig ? summary(sig, loc) : null;

  return html`<${Sheet} id="readsheet" open=${open} onClose=${onClose} title=${title}>
    <div class="flex flex-col gap-4 pb-1">
      ${text ? html`<p class="leading-relaxed whitespace-pre-line" data-reading-text>${text}</p>`
        : failed ? html`<div class="flex flex-col items-center gap-3 py-6 text-center">
            <span class="text-muted">${T(t, "readingFail")}</span>
            <button class="btn btn-sm btn-outline rounded-xl" onClick=${run}>${T(t, "retry")}</button>
          </div>`
        : html`<${Scramble} lines=${5} />`}
      ${/* Provenance, not decoration: the app computes the hexagram exactly and does NOT own a canonical
            translation, so the reader is told which half a model wrote. */""}
      <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-muted border-t border-base-content/10 pt-3">
        ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "readingGenerated")}</span>
      </div>
    </div>
  <//>`;
}

// ── journal ──────────────────────────────────────────────────────────────────────────────────────
export function ichingLog({ t: _t, S, confirm, undo }) {
  const t = useStore(S.t);
  const v = useStore($logv);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (gate) {
      setRows([
        { id: "g1", at: 1765000000000, q: "Чи варто починати зараз", m: "yarrow", lines: [9, 8, 7, 6, 7, 8], n: 40, to: 47 },
        { id: "g2", at: 1764900000000, q: "", m: "coins", lines: [7, 7, 7, 8, 8, 8], n: 11, to: null },
      ]);
      return;
    }
    CASTS.all().then((r) => setRows(r.sort((a, b) => b.at - a.at))).catch(() => setRows([]));
  }, [v]);

  const del = async (row) => {
    buzz();
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
        <div class="w-12 shrink-0"><${Hexagram} lines=${row.lines} compact /></div>
        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
          <div class="flex items-baseline gap-2 min-w-0">
            <span class="font-medium">${nm.cn}</span>
            <span class="text-sm text-muted truncate">${nm.py}</span>
            ${to ? html`<span class="text-sm text-muted truncate">→ ${to.cn}</span>` : null}
          </div>
          <span class="text-sm text-muted truncate">${row.q || T(t, "noQuestion")}</span>
        </div>
        <button data-del aria-label=${T(t, "logDeleted")} class="btn btn-ghost btn-sm btn-circle shrink-0" onClick=${() => del(row)}>
          ${Icon("lucide:trash-2", "text-base")}
        </button>
      </div>`;
    })}
    <button data-clear class="btn btn-ghost btn-sm rounded-xl self-center mt-2 text-muted" onClick=${clearAll}>${T(t, "logClear")}</button>
  </div>`;
}
