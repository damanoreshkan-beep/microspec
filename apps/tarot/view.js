// Tarot — draw the Rider-Waite-Smith deck for a reading. Eleven spreads, each with a plain one-line
// description of what it answers: card of the day, past/present/future, situation/action/outcome,
// mind/body/spirit, the crossroads, two-poles, shadow & light, the star, a love reading, the Major-Arcana
// Soul Pyramid, and the ten-card Celtic Cross. Every multi-card spread renders through `FitReading`, which
// scales the cards so the WHOLE spread and its structure fit the screen at once (no page scroll); tapping a
// card opens the full meaning. The deck (78 cards + canonical Waite meanings + the
// public-domain 1909 scans) is app-owned in ./deck.js with images vendored same-origin under ./assets/ —
// fully offline. The draw math is the SYSTEMIC /_rt/tarot.js (seeded, unit-tested): the card of the day is
// seeded by the date so it's stable through the day; other spreads reshuffle. English meanings are
// translated to the active locale by /_rt/translate.js (fail-open to the original). No emoji: the only
// imagery is the classic card art; suits/arcana are words.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { tr, warm, trTick } from "/_rt/translate.js";
import { SPREADS, spreadById, hashSeed, draw } from "/_rt/tarot.js";
import { DECK } from "./deck.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const QS = new URLSearchParams(location.search);
const SPREAD_OVERRIDE = QS.get("spread"); // ?spread=celtic previews any spread (phone/mock check)
const imgURL = (file) => new URL(`./assets/${file}`, import.meta.url).href;   // robust regardless of page path
const randSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0;
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SPREAD_KEY = { daily: "spreadDaily", ppf: "spreadPPF", sao: "spreadSAO", mindbody: "spreadMind", choice: "spreadChoice", poles: "spreadPoles", shadowlight: "spreadShadowLight", star: "spreadStar", love: "spreadLove", pyramid: "spreadPyramid", celtic: "spreadCeltic" };
const DESC_KEY = { daily: "descDaily", ppf: "descPPF", sao: "descSAO", mindbody: "descMind", choice: "descChoice", poles: "descPoles", shadowlight: "descShadowLight", star: "descStar", love: "descLove", pyramid: "descPyramid", celtic: "descCeltic" };
const SUIT_KEY = { wands: "suitWands", cups: "suitCups", swords: "suitSwords", pentacles: "suitPentacles" };
const cardName = (c, loc) => (loc === "uk" ? c.uk : c.name);
const meaningOf = (d) => DECK[d.card][d.reversed ? "rev" : "up"];

export function tarot({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore(trTick);                                              // re-render as translations land
  const [spreadId, setSpreadId] = useState(SPREADS.some((s) => s.id === SPREAD_OVERRIDE) ? SPREAD_OVERRIDE : "star");
  const [nonce, setNonce] = useState(0);                         // bumped on shuffle → fresh draw
  const [detail, setDetail] = useState(0);                       // index into the current draw, for the sheet
  const liveBase = useRef(randSeed()).current;                   // random per session, stable across renders

  const now = gate ? new Date(2027, 6, 23) : new Date();
  const spread = spreadById(spreadId);
  const seed = spreadId === "daily" ? hashSeed(dk(now))
    : ((gate ? 0 : liveBase) ^ hashSeed(spreadId + ":" + nonce)) >>> 0;
  const drawn = draw(seed, spread.pos.length, spread.majorOnly ? 22 : 78);

  // translate the meanings actually shown (chosen orientation) into the active locale
  useEffect(() => { warm(drawn.map(meaningOf), loc); }, [seed, loc]);

  const openCard = (i) => { setDetail(i); openScreen("card"); };
  const pickSpread = (id) => { setSpreadId(id); };
  const shuffle = () => setNonce((n) => n + 1);

  const isDaily = spread.pos.length === 1;
  const rows = spread.rows || defaultRows(spread.pos.length);

  return html`<${Fragment}>
    ${isDaily
      // the card of the day: the picker, then one large card with its meaning inline (scrolls naturally)
      ? html`<div class="flex flex-col gap-4">
          <${Picker} t=${t} spreadId=${spreadId} onPick=${pickSpread} />
          <${Header} t=${t} spreadId=${spreadId} isDaily=${true} />
          <${Solo} d=${drawn[0]} pos=${spread.pos[0]} t=${t} loc=${loc} onOpen=${() => openCard(0)} />
        </div>`
      // any multi-card spread: the WHOLE structure fits the screen — cards shrink to fit, no page scroll.
      : html`<div class="flex flex-col gap-2.5 h-[calc(100dvh-11.5rem)] min-h-0">
          <${Picker} t=${t} spreadId=${spreadId} onPick=${pickSpread} />
          <${Header} t=${t} spreadId=${spreadId} isDaily=${false} onShuffle=${shuffle} />
          <${FitReading} rows=${rows} drawn=${drawn} pos=${spread.pos} t=${t} loc=${loc} onOpen=${openCard} />
        </div>`}

    <${CardSheet} open=${screen === "card"} onClose=${closeScreen} d=${drawn[detail]} pos=${spread.pos[detail]} t=${t} loc=${loc} />
  </${Fragment}>`;
}

// Spreads without a hand-authored `rows` shape (the 3-card ones, the ten-card Celtic Cross) fall into
// balanced rows of ≤4 so they still lay out as a neat, fully-visible grid.
const seq = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
function defaultRows(n) {
  if (n <= 4) return [seq(0, n)];
  const per = Math.ceil(n / Math.ceil(n / 4));
  const rows = [];
  for (let i = 0; i < n; i += per) rows.push(seq(i, Math.min(i + per, n)));
  return rows;
}

// the compact, horizontally-scrolling spread picker (chips) — frees the vertical room for the reading
function Picker({ t, spreadId, onPick }) {
  return html`<div class="shrink-0 -mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <div class="flex gap-2 w-max pb-0.5">
      ${SPREADS.map((s) => html`<button data-spread=${s.id} aria-pressed=${spreadId === s.id} class=${`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition active:scale-95 ${spreadId === s.id ? "border-secondary bg-secondary/15 text-secondary" : "border-base-300 bg-base-100 text-base-content/75"}`} onClick=${() => onPick(s.id)} key=${s.id}>
        <span class="text-xs font-medium whitespace-nowrap">${T(t, SPREAD_KEY[s.id])}</span>
        <span class="text-[0.6rem] font-mono tabular-nums opacity-70">${s.pos.length}</span>
      </button>`)}
    </div>
  </div>`;
}

// title + one-line description + shuffle (shuffle hidden for the day's fixed card)
function Header({ t, spreadId, isDaily, onShuffle }) {
  return html`<div class="shrink-0 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="font-bold text-lg leading-tight">${T(t, SPREAD_KEY[spreadId])}</div>
      <p class="mt-0.5 text-[0.78rem] leading-snug text-base-content/55 break-words line-clamp-2">${T(t, DESC_KEY[spreadId])}</p>
    </div>
    ${!isDaily ? html`<button data-shuffle class="btn btn-sm btn-ghost gap-1.5 rounded-full border border-base-300 shrink-0" onClick=${onShuffle}>${Icon("lucide:shuffle", "text-base")}<span class="text-xs">${T(t, "redraw")}</span></button>` : null}
  </div>`;
}

// The reading, fit to the viewport: rows share the height (flex-1) and each card scales to the smaller of
// its row's height and 1/maxCols of the width, keeping the spread's shape — the whole thing visible at once.
function FitReading({ rows, drawn, pos, t, loc, onOpen }) {
  const maxCols = Math.max(...rows.map((r) => r.length));
  const wpct = (94 / maxCols).toFixed(2);
  return html`<div data-reading class="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
    ${rows.map((row, ri) => html`<div class="flex-1 min-h-0 flex justify-center items-stretch gap-2" key=${ri}>
      ${row.map((pi) => html`<${FitTile} d=${drawn[pi]} pos=${pos[pi]} t=${t} loc=${loc} wpct=${wpct} onOpen=${() => onOpen(pi)} key=${pi} />`)}
    </div>`)}
  </div>`;
}

// one card in the fit layout: the art scaled to fit, a tiny position label beneath. Tap opens the sheet.
function FitTile({ d, pos, t, loc, wpct, onOpen }) {
  const c = DECK[d.card];
  return html`<button data-card class="h-full min-h-0 flex flex-col items-center gap-1 active:scale-95 transition" style=${`max-width:${wpct}%`} aria-label=${`${cardName(c, loc)} — ${T(t, pos)}`} onClick=${onOpen}>
    <div class="min-h-0 flex-1 flex items-center justify-center w-full">
      <img src=${imgURL(c.img)} alt="" loading="lazy" class=${`max-h-full max-w-full w-auto h-auto object-contain rounded-md border border-base-300 shadow-sm ${d.reversed ? "rotate-180" : ""}`} />
    </div>
    <div class="shrink-0 text-[0.5rem] font-mono uppercase tracking-wide text-base-content/50 truncate max-w-full leading-tight">${T(t, pos)}</div>
  </button>`;
}

// the single card-of-the-day: larger, with the meaning shown inline (tap the image for the full sheet too)
function Solo({ d, pos, t, loc, onOpen }) {
  useStore(trTick);
  const c = DECK[d.card];
  return html`<div data-reading class="flex flex-col items-center gap-4">
    <div class="text-[0.6rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${T(t, pos)}</div>
    <button data-card class="w-[62%] max-w-[11rem] active:scale-[.99] transition" onClick=${onOpen}>
      <img src=${imgURL(c.img)} alt=${cardName(c, loc)} class=${`w-full aspect-[350/600] object-cover rounded-xl border border-base-300 shadow-lg ${d.reversed ? "rotate-180" : ""}`} />
    </button>
    <div class="text-center">
      <div class="font-bold text-xl leading-tight">${cardName(c, loc)}</div>
      <div class=${`mt-1 text-xs font-medium ${d.reversed ? "text-warning" : "text-secondary"}`}>${T(t, d.reversed ? "reversed" : "upright")}</div>
    </div>
    <p class="text-[0.95rem] leading-relaxed text-base-content/90 text-center max-w-prose">${tr(meaningOf(d), loc)}</p>
  </div>`;
}

// full-screen-ish detail sheet — big art + arcana/suit + orientation + full meaning. History-backed.
function CardSheet({ open, onClose, d, pos, t, loc }) {
  const ref = useRef();
  useStore(trTick);
  useEffect(() => { const el = ref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  const c = d ? DECK[d.card] : null;
  const kind = c ? (c.arcana === "major" ? T(t, "arcanaMajor") : `${T(t, "arcanaMinor")} · ${T(t, SUIT_KEY[c.suit])}`) : "";
  return html`<dialog id="cardsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      ${c ? html`<div class="flex flex-col items-center gap-4">
        <div class="text-[0.6rem] font-mono uppercase tracking-[0.14em] text-base-content/45">${T(t, pos)}</div>
        <img src=${imgURL(c.img)} alt=${cardName(c, loc)} class=${`w-40 aspect-[350/600] object-cover rounded-xl border border-base-300 shadow-lg ${d.reversed ? "rotate-180" : ""}`} />
        <div class="text-center">
          <div class="font-bold text-xl leading-tight">${cardName(c, loc)}</div>
          <div class="text-[0.68rem] font-mono uppercase tracking-wide text-base-content/50 mt-1">${kind}</div>
          <div class=${`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${d.reversed ? "bg-warning/15 text-warning" : "bg-secondary/15 text-secondary"}`}>${T(t, d.reversed ? "reversed" : "upright")}</div>
        </div>
        <p class="text-[0.95rem] leading-relaxed text-base-content/90">${tr(meaningOf(d), loc)}</p>
      </div>` : null}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}
