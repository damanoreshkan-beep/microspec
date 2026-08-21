// Prompt history — one per section (make / edit / read), the last 30 lines you actually ran, newest first,
// no duplicates. Kept in localStorage; a tap in the sheet puts the line back into the field, nothing more.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { Sheet } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";

const KEY = (ns) => `ms:mirage:hist:${ns}`;
const MAX = 30;
const read = (ns) => { if (gate) return []; try { const v = JSON.parse(localStorage.getItem(KEY(ns)) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };

// [items, remember] — remember(text) moves the line to the top (or adds it) and persists.
export function usePromptHistory(ns) {
  const [items, setItems] = useState(() => read(ns));
  useEffect(() => { setItems(read(ns)); }, [ns]);   // the mode switches under one composer; the list follows it
  const remember = (text) => {
    const line = String(text || "").trim(); if (!line) return;
    const next = [line, ...items.filter((x) => x !== line)].slice(0, MAX);
    setItems(next);
    if (!gate) { try { localStorage.setItem(KEY(ns), JSON.stringify(next)); } catch { /* quota / private mode */ } }
  };
  return [items, remember];
}

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// The sheet: history-backed by the caller (S.screen), per the routing invariant. Empty = the one line that IS
// the screen; otherwise a list of the lines, newest first, each a button that hands the line back.
export function HistorySheet({ id = "hist-sheet", open, onClose, items, onPick, t, locale }) {
  return html`<${Sheet} id=${id} open=${open} onClose=${onClose} title=${T(t, "history")} icon="lucide:history" locale=${locale}>
    ${items.length
      ? html`<div data-hist-list class="flex flex-col gap-1.5">
          ${items.map((line, i) => html`<button key=${line} data-hist-item=${i} type="button" class="text-left rounded-2xl sf-inset px-4 py-3 text-[0.95rem] leading-snug active:scale-[.99] transition-transform" onClick=${() => { onPick(line); onClose(); }}>${line}</button>`)}
        </div>`
      : html`<div data-hist-empty class="flex flex-col items-center gap-2 py-8 text-center text-muted">${Icon("lucide:history", "text-3xl")}<div class="text-sm">${T(t, "historyEmpty")}</div></div>`}
  </${Sheet}>`;
}
