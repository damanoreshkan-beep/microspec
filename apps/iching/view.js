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
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {  } };
const CASTS = collection("ichingCasts");

const $method = persistentAtom("iching:method", "yarrow");
const $question = atom("");
const $lines = atom(null);          
const $logv = atom(0);              

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

const W = 100, BAR = 6, PITCH = 11, GAP = 16, VB_H = PITCH * 6 - (PITCH - BAR);

/**
 * @param lines  6/7/8/9 bottom-first — the cast, with movement
 * @param bits   0/1 bottom-first — a plain hexagram (the transformed one has no line values)
 */
const HexSvg = ({ lines, bits, label, cls }) => {
  const rows = lines ?? bits.map((b) => (b ? 7 : 8));      
  const lineAttr = (i) => (lines ? i + 1 : null);          
  const movAttr = (moving) => (lines ? (moving ? "1" : "0") : null);
  return html`<svg viewBox=${`0 0 ${W} ${VB_H}`} class=${`w-full ${cls || ""}`} role="img"
    aria-label=${label || ""} fill="currentColor" data-hex=${lines ? "cast" : "to"}>
    ${rows.map((v, i) => {
      const yang = bitOf(v) === 1, moving = isMoving(v);
      const y = (5 - i) * PITCH;                            
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

  useEffect(() => { if (gate && !$lines.get()) $lines.set(GATE_LINES); }, []);

  const r = lines ? reading(lines) : null;
  const name = r ? nameOf(r.number) : null;
  const toName = r?.toNumber ? nameOf(r.toNumber) : null;
  const w = METHODS[m] ?? METHODS.yarrow;

  const sig = r ? `${m}|${r.lines.join("")}|${q.trim()}` : "";
  const input = r ? [
    `Hexagram ${r.number} ${name.cn} (${name.py}).`,
    `Lower trigram ${r.lower.cn} ${r.lower.pinyin} (${r.lower.en}), upper trigram ${r.upper.cn} ${r.upper.pinyin} (${r.upper.en}).`,
    r.moving.length ? `Moving lines, counted from the bottom: ${r.moving.join(", ")}.` : "No moving lines.",
    r.toNumber ? `It changes into hexagram ${r.toNumber} ${toName.cn} (${toName.py}).` : "",
    q.trim() ? `The question asked: ${q.trim()}` : "No question was asked.",
  ].filter(Boolean).join("\n") : "";

  return html`<${Fragment}>
    <${HeroStage} seed=${r ? packSeed(r.lines) : 0} />
    <${Island} pinned tone="dark" style="background:rgba(11,15,20,.93)"
      className="w-full max-w-[440px] flex flex-col gap-2.5 px-4 py-3">
      <input id="question" value=${q} onInput=${(e) => $question.set(e.target.value)}
        placeholder=${T(t, "question")} aria-label=${T(t, "question")}
        
        class="w-full rounded-xl border border-white/25 bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder:text-white/70 outline-none focus:border-white/55" />
      <div class="flex items-center gap-2">
        <${Segmented} attr="data-method" size="sm" label=${T(t, "methodLabel")}
          items=${[{ id: "yarrow", label: T(t, "methodYarrow") }, { id: "coins", label: T(t, "methodCoins") }]}
          value=${m} onChange=${(id) => { buzz(); $method.set(id); }} />
        
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
      
      <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-muted border-t border-base-content/10 pt-3">
        ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "readingGenerated")}</span>
      </div>
    </div>
  <//>`;
}


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
