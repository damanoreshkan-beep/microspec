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
import { Sheet, Segmented, Island } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { summary, warmSummary, isSummarized, aiTick } from "/_rt/ai-text.js";
import { METHODS, cast, reading, isMoving, bitOf } from "/_rt/iching.js";
import { nameOf } from "./book.js";
import { HeroStage, packSeed } from "./hero.js";

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

// ── the hexagram, drawn as SVG ───────────────────────────────────────────────────────────────────
// One element instead of twelve divs, exact geometry at any size, and — the reason that matters most —
// it can carry the CANONICAL notation for a moving line, which a stack of coloured bars cannot:
//
//   7  young yang   ▬▬▬▬▬        a whole bar
//   8  young yin    ▬▬  ▬▬       a bar with a gap
//   9  old yang     ▬▬○▬▬        whole, marked with a circle — it is about to open
//   6  old yin      ▬▬✕▬▬        broken, marked with a cross — it is about to close
//
// The first version signalled movement with the accent colour alone. That is this app's invention, it
// asks the reader to learn a key, and it fails for anyone who cannot separate two hues. The mark is the
// tradition's own and it survives both themes, greyscale and a screenshot.
//
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
    ${/* The stage IS the screen. The cast is drawn full-bleed in WebGPU — six slits of light in a moving
          field — and the page flow stays deliberately EMPTY behind it, so nothing scrolls over the figure.
          Everything you can touch lives in one pinned island at the bottom.

          The hexagram used to be drawn twice: once here in the current, and again as a stack of fat white
          bars in a card. Two pictures of the same thing arguing with each other is exactly what "немає
          гармонії" looks like. Now the sizes carry a hierarchy instead — the big figure is the atmosphere,
          and the thumbnail in the island is the DATA (and the thing axe and the e2e gate can actually see,
          since a canvas is invisible to both). */""}
    <${HeroStage} seed=${r ? packSeed(r.lines) : 0} />

    ${/* An inline, near-opaque ground under the glass. tone="dark" alone is black/60, and every white text
          inside it is then measured by axe against whatever the PAGE is — bright, in the light theme, since
          the canvas behind is invisible to it. One element failed that way; the rest were one tweak from
          following. Fixing the whole list at once beats fixing the first item and waiting for CI to name
          the next. It reads better over a lit field too, which is the actual reason to keep it. */""}
    <${Island} pinned tone="dark" style="background:rgba(11,15,20,.93)"
      className="w-full max-w-[440px] flex flex-col gap-2.5 px-4 py-3">
      <input id="question" value=${q} onInput=${(e) => $question.set(e.target.value)}
        placeholder=${T(t, "question")} aria-label=${T(t, "question")}
        ${/* A SOLID colour, not an alpha. Inside a translucent island the browser composites white/10 over
              black/60 over the PAGE, and in the light theme axe measures that stack against a bright body —
              it cannot see the WebGPU field behind it — which lands white text on grey and fails contrast.
              An opaque swatch makes the computation unambiguous in both themes. */""}
        ${/* NO DaisyUI `.input` here. It carries its own background at the same specificity as a Tailwind
              utility, and it wins on source order — so bg-[…] silently did nothing and the light theme kept
              painting the field white under white text. Two CI rounds said "color-contrast: #question"
              without changing, which is the signal to stop patching and drop the component instead. */""}
        class="w-full rounded-xl border border-white/25 bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder:text-white/70 outline-none focus:border-white/55" />

      <div class="flex items-center gap-2">
        <${Segmented} attr="data-method" size="sm" label=${T(t, "methodLabel")}
          items=${[{ id: "yarrow", label: T(t, "methodYarrow") }, { id: "coins", label: T(t, "methodCoins") }]}
          value=${m} onChange=${(id) => { buzz(); $method.set(id); }} />
        ${/* The odds of the CHOSEN method, as the exact ratios they are — the one fact that separates the
              two methods, and it changes when you switch. */""}
        <div class="flex items-center gap-2 font-mono text-[length:var(--ms-label)] tabular-nums text-white/80 ms-auto" data-odds>
          <span>${T(t, "oddsYinYang")} ${w.weights[6]}/${w.total}</span>
          <span>${T(t, "oddsYangYin")} ${w.weights[9]}/${w.total}</span>
        </div>
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

        <div class="flex gap-2">
          <button data-cast class="btn btn-sm btn-primary flex-1 rounded-xl gap-2" onClick=${doCast}>${Icon("lucide:dices")}${T(t, "recast")}</button>
          <button data-read class="btn btn-sm rounded-xl gap-2 bg-white/10 border-white/25 text-white hover:bg-white/20" onClick=${() => { buzz(); openScreen("reading"); }}>${Icon("lucide:sparkles")}${T(t, "readingOpen")}</button>
        </div>
      </div>`
      : html`<button data-cast class="btn btn-primary rounded-xl gap-2" onClick=${doCast}>${Icon("lucide:dices", "text-lg")}${T(t, "cast")}</button>`}
    </${Island}>

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
        <div class="w-11 shrink-0"><${HexSvg} lines=${row.lines} label=${nm.cn} cls="text-base-content/85" /></div>
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
