// Code — a colour code-breaker (Mastermind). A hidden 4-peg code of 6 colours; each guess is scored
// exact (right colour + slot) / near (right colour, wrong slot) until you crack it or run out of tries.
// The deduction maths lives in /_rt/codebreak.js (unit-tested); the secret is seeded (/_rt/groove.js
// mulberry32) so a game is shareable by its number and deterministic for the gate. Every colour also
// carries a distinct symbol — the code is playable without colour vision, and read out by name to a screen
// reader. The win/lose overlay is a history-backed screen (system Back closes it, never exits).
import { html } from "htm/preact";
import { useState, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { mulberry32 } from "/_rt/groove.js";
import { feedback, solved, makeSecret } from "/_rt/codebreak.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const SLOTS = 4, NCOLORS = 6, MAX = 10;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

// Each peg: a saturated hue visible on both themes + a near-black ink for its symbol + a distinct shape,
// so colour is never the only channel (colour-blind play + SR names). Symbols: ● ▲ ■ ◆ ★ ⬢.
const PEGS = [
  { c: "#EC5A4A", ink: "#2A0906", sym: "●", key: "cRed" },
  { c: "#E4B93C", ink: "#241A00", sym: "▲", key: "cAmber" },
  { c: "#46C46E", ink: "#052110", sym: "■", key: "cGreen" },
  { c: "#3FC7C0", ink: "#04211F", sym: "◆", key: "cCyan" },
  { c: "#6AA6FF", ink: "#061336", sym: "★", key: "cBlue" },
  { c: "#B98BEA", ink: "#1E0A38", sym: "⬢", key: "cViolet" },
];

// gate/mock: a fixed seed with a few plays already on the board, so the shot exercises the populated state
// (guess rows + feedback pips + a half-filled current guess), never an empty grid.
const START_SEED = 7;
function seededStart(secret) {
  const guesses = [[0, 1, 2, 3], [4, 5, 0, 1], [2, 3, 4, 0]];
  return { rows: guesses.map((g) => ({ guess: g, fb: feedback(secret, g) })), cur: [1, 4] };
}
const rand = () => Math.floor(Math.random() * 1e9) >>> 0;

export function code({ S }) {
  const t = useStore(S.t), scr = useStore(S.screen);
  const params = new URLSearchParams(location.search);
  const first = (isGate || MOCK) ? START_SEED : params.get("g") != null ? (parseInt(params.get("g"), 10) >>> 0) : rand();
  const [seed, setSeed] = useState(first);
  const secret = useMemo(() => makeSecret(mulberry32(seed), NCOLORS, SLOTS), [seed]);
  const init = (isGate || MOCK) && seed === START_SEED ? seededStart(secret) : { rows: [], cur: [] };
  const [rows, setRows] = useState(init.rows);
  const [cur, setCur] = useState(init.cur);

  const last = rows[rows.length - 1];
  const won = !!last && solved(last.fb, SLOTS);
  const lost = !won && rows.length >= MAX;
  const over = won || lost;

  const addPeg = (ci) => { if (!over && cur.length < SLOTS) setCur([...cur, ci]); };
  const removePeg = (i) => setCur(cur.filter((_, idx) => idx !== i));
  const submit = () => {
    if (cur.length < SLOTS || over) return;
    const fb = feedback(secret, cur);
    const next = [...rows, { guess: cur, fb }];
    setRows(next); setCur([]);
    if (solved(fb, SLOTS) || next.length >= MAX) S.screen.set("over"); // history-backed win/lose screen
  };
  const newGame = () => { const s = rand(); setSeed(s); setRows([]); setCur([]); S.screen.set(null); };
  const share = async () => {
    const url = `${location.origin}${location.pathname}?g=${seed}`;
    try { await navigator.clipboard.writeText(url); S.toast?.(T(t, "linkCopied")); } catch { /* clipboard blocked */ }
  };

  // a peg disc — as art (aria label = its colour name) or, when onRemove, a button to pull it back out
  const disc = (ci, big, onRemove) => {
    const p = PEGS[ci], size = big ? "w-11 h-11 text-lg" : "w-7 h-7 text-sm";
    const style = `background:${p.c};color:${p.ink}`;
    return onRemove
      ? html`<button aria-label=${`${T(t, "remove")} — ${T(t, p.key)}`} onClick=${onRemove} class=${`${size} rounded-full inline-flex items-center justify-center font-bold shrink-0 active:scale-90 transition`} style=${style}>${p.sym}</button>`
      : html`<span role="img" aria-label=${T(t, p.key)} class=${`${size} rounded-full inline-flex items-center justify-center font-bold shrink-0`} style=${style}>${p.sym}</span>`;
  };

  // feedback pips — exact (filled) then near (ring); slot-unaligned so they never leak which position is right
  const pips = (fb) => {
    const kinds = [...Array(fb.exact).fill("e"), ...Array(fb.partial).fill("n")];
    while (kinds.length < SLOTS) kinds.push("o");
    return html`<div class="grid grid-cols-2 gap-[3px]" role="img" aria-label=${T(t, "fbAria", { exact: fb.exact, near: fb.partial })}>
      ${kinds.map((k, i) => html`<span class=${`w-2 h-2 rounded-full ${k === "e" ? "bg-base-content" : k === "n" ? "border-2 border-base-content" : "bg-base-content/15"}`} key=${i}></span>`)}
    </div>`;
  };

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <!-- board: past guesses, newest at the bottom -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 max-w-md w-full mx-auto">
      <div class="flex items-center justify-between sticky top-0 bg-base-200 pb-1 z-[1]">
        <span class="text-[0.62rem] font-mono uppercase tracking-wide text-base-content/60">${T(t, "attemptsLeft", { n: MAX - rows.length })}</span>
        <button aria-label=${T(t, "newGame")} data-haptic="bump" onClick=${newGame} class="btn btn-ghost btn-xs btn-circle text-base-content/70">${Icon("lucide:rotate-ccw", "text-base")}</button>
      </div>
      <div class="flex-1 min-h-2"></div>
      ${Array.from({ length: MAX }, (_, i) => {
        const r = rows[i];
        return html`<div class="flex items-center justify-center gap-3" data-row=${r ? "1" : null} key=${i}>
          <div class="flex gap-2">${Array.from({ length: SLOTS }, (_, s) => r
            ? disc(r.guess[s], false)
            : html`<span class="w-7 h-7 rounded-full border border-base-300 shrink-0" key=${s}></span>`)}</div>
          <div class="w-9 shrink-0 flex justify-center">${r ? pips(r.fb) : null}</div>
        </div>`;
      })}
    </div>

    <!-- input: current guess + palette + check -->
    <div class="shrink-0 border-t border-base-300 bg-base-100 px-4 pt-3 pb-3 flex flex-col gap-3 max-w-md w-full mx-auto">
      <div class="flex items-center justify-center gap-2 min-h-11">
        ${Array.from({ length: SLOTS }, (_, i) => cur[i] == null
          ? html`<span class="w-11 h-11 rounded-full border-2 border-dashed border-base-300 shrink-0" key=${i}></span>`
          : disc(cur[i], true, () => removePeg(i)))}
      </div>
      <div class="flex items-center justify-center gap-2">
        ${PEGS.map((p, ci) => html`<button data-peg=${ci} aria-label=${T(t, p.key)} disabled=${over || cur.length >= SLOTS} onClick=${() => addPeg(ci)}
          class="w-11 h-11 rounded-full inline-flex items-center justify-center font-bold text-lg shrink-0 active:scale-90 transition disabled:opacity-30" style=${`background:${p.c};color:${p.ink}`} key=${ci}>${p.sym}</button>`)}
      </div>
      <button data-check disabled=${cur.length < SLOTS || over} onClick=${submit} class="btn btn-primary rounded-2xl w-full disabled:opacity-40">${T(t, "check")}</button>
    </div>

    <!-- win / lose — a history-backed screen (Back closes it) -->
    ${scr === "over" ? html`<div class="absolute inset-0 z-30 bg-base-100/95 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div class="text-2xl font-bold">${won ? T(t, "titleWon", { n: rows.length }) : T(t, "titleLost")}</div>
      <div class="flex flex-col items-center gap-2">
        <span class="text-[0.62rem] font-mono uppercase tracking-wide text-base-content/60">${T(t, "theCode")}</span>
        <div class="flex gap-2">${secret.map((ci) => disc(ci, true))}</div>
      </div>
      <div class="text-xs font-mono text-base-content/50">#${seed}</div>
      <div class="flex flex-col items-center gap-2 w-full max-w-[16rem]">
        <button data-newgame class="btn btn-primary rounded-2xl w-full gap-2" onClick=${newGame}>${Icon("lucide:rotate-ccw")}${T(t, "newGame")}</button>
        <button class="btn btn-ghost btn-sm gap-2 text-base-content/70" onClick=${share}>${Icon("lucide:share-2")}${T(t, "share")}</button>
      </div>
    </div>` : null}
  </div>`;
}
