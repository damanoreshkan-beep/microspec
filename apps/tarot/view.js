// Tarot — draw the Rider-Waite-Smith deck for a reading. Nine spreads, each with a plain one-line
// description of what it answers: card of the day, past/present/future, situation/action/outcome,
// mind/body/spirit, the crossroads (do-it vs don't), the star, a love reading, the Major-Arcana Soul
// Pyramid, and the ten-card Celtic Cross. Shaped spreads (pyramid, star, fork) render via `Rows` from
// their `rows` layout; the rest fall out of a flat grid. The deck (78 cards + canonical Waite meanings + the
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
  const [spreadId, setSpreadId] = useState(SPREADS.some((s) => s.id === SPREAD_OVERRIDE) ? SPREAD_OVERRIDE : "daily");
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

  return html`<${Fragment}>
    <div class="flex flex-col gap-5">
      <!-- spread picker -->
      <div>
        <div class="text-[0.62rem] font-mono uppercase tracking-[0.14em] text-base-content/45 mb-2">${T(t, "pickSpread")}</div>
        <div class="grid grid-cols-2 gap-2">
          ${SPREADS.map((s) => html`<button data-spread=${s.id} aria-pressed=${spreadId === s.id} class=${`flex items-center justify-between gap-2 min-w-0 rounded-2xl border p-3 text-left transition active:scale-[.98] ${spreadId === s.id ? "border-secondary bg-secondary/10 text-secondary" : "border-base-300 bg-base-100 text-base-content/80"}`} onClick=${() => pickSpread(s.id)} key=${s.id}>
            <span class="min-w-0 break-words text-sm font-medium leading-tight">${T(t, SPREAD_KEY[s.id])}</span>
            <span class=${`text-[0.7rem] font-mono tabular-nums shrink-0 ${spreadId === s.id ? "text-secondary/80" : "text-base-content/70"}`}>${s.pos.length}</span>
          </button>`)}
        </div>
      </div>

      <!-- reading header + shuffle (shuffle hidden for the day's fixed card). The description says, plainly,
           what question the spread answers — that's content, like a card's meaning, not a UI hint. -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-bold text-lg leading-tight">${T(t, SPREAD_KEY[spreadId])}</div>
          <p class="mt-1 text-[0.8rem] leading-snug text-base-content/55 break-words">${T(t, DESC_KEY[spreadId])}</p>
        </div>
        ${spreadId !== "daily" ? html`<button data-shuffle class="btn btn-sm btn-ghost gap-1.5 rounded-full border border-base-300 shrink-0" onClick=${shuffle}>${Icon("lucide:shuffle", "text-base")}<span class="text-xs">${T(t, "redraw")}</span></button>` : null}
      </div>

      <!-- reading -->
      ${spread.pos.length === 1
      ? html`<${Solo} d=${drawn[0]} pos=${spread.pos[0]} t=${t} loc=${loc} onOpen=${() => openCard(0)} />`
      : spread.rows
      ? html`<${Rows} rows=${spread.rows} drawn=${drawn} pos=${spread.pos} seed=${seed} t=${t} loc=${loc} onOpen=${openCard} />`
      : html`<div data-reading class=${`grid ${spread.pos.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-x-3 gap-y-4`}>
          ${drawn.map((d, i) => html`<${Tile} d=${d} pos=${spread.pos[i]} t=${t} loc=${loc} onOpen=${() => openCard(i)} key=${`${seed}-${i}`} />`)}
        </div>`}
    </div>

    <${CardSheet} open=${screen === "card"} onClose=${closeScreen} d=${drawn[detail]} pos=${spread.pos[detail]} t=${t} loc=${loc} />
  </${Fragment}>`;
}

// a compact card in a multi-card spread → tap opens the detail sheet
function Tile({ d, pos, t, loc, onOpen }) {
  const c = DECK[d.card];
  return html`<button data-card class="flex flex-col gap-1.5 text-center active:scale-[.98] transition" onClick=${onOpen}>
    <div class="text-[0.58rem] font-mono uppercase tracking-wide text-base-content/45 truncate">${T(t, pos)}</div>
    <img src=${imgURL(c.img)} alt=${cardName(c, loc)} loading="lazy" class=${`w-full aspect-[350/600] object-cover rounded-lg border border-base-300 shadow ${d.reversed ? "rotate-180" : ""}`} />
    <div class="text-xs font-medium leading-tight line-clamp-2 min-h-[2rem] break-words">${cardName(c, loc)}</div>
    <div class=${`text-[0.6rem] ${d.reversed ? "text-warning" : "text-base-content/45"}`}>${T(t, d.reversed ? "reversed" : "upright")}</div>
  </button>`;
}

// a shaped spread (pyramid, star, fork…): each row is centered and every tile is sized to the widest row,
// so a 3-2-1 pyramid actually reads as a pyramid and a fork reads as a fork. Falls out of the flat grid.
function Rows({ rows, drawn, pos, seed, t, loc, onOpen }) {
  const maxCols = Math.max(...rows.map((r) => r.length));
  const w = `calc(${(100 / maxCols).toFixed(4)}% - 0.75rem)`;
  return html`<div data-reading class="flex flex-col gap-4">
    ${rows.map((row, ri) => html`<div class="flex justify-center gap-3" key=${ri}>
      ${row.map((pi) => html`<div style=${`width:${w}`} key=${`${seed}-${pi}`}>
        <${Tile} d=${drawn[pi]} pos=${pos[pi]} t=${t} loc=${loc} onOpen=${() => onOpen(pi)} />
      </div>`)}
    </div>`)}
  </div>`;
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
