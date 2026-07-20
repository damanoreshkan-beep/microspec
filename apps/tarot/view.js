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
import { animate, stagger } from "motion";
import { useSheetDrag, usePanX } from "/_rt/gesture.js";

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
  const [nonce, setNonce] = useState(0);                         // bumped on quick shuffle → fresh draw
  const [override, setOverride] = useState(null);                // the seed from a completed ritual
  const [detail, setDetail] = useState(0);                       // index into the current draw, for the sheet
  const liveBase = useRef(randSeed()).current;                   // random per session, stable across renders

  const now = gate ? new Date(2027, 6, 23) : new Date();
  const spread = spreadById(spreadId);
  const seed = spreadId === "daily" ? hashSeed(dk(now))
    : override != null ? override                                // the ritual's charged draw
    : ((gate ? 0 : liveBase) ^ hashSeed(spreadId + ":" + nonce)) >>> 0;
  const drawn = draw(seed, spread.pos.length, spread.majorOnly ? 22 : 78);
  const isDaily = spread.pos.length === 1;

  useEffect(() => { setOverride(null); }, [spreadId]);           // a new spread starts fresh
  // translate the meanings actually shown (chosen orientation) into the active locale
  useEffect(() => { warm(drawn.map(meaningOf), loc); }, [seed, loc]);
  // deal the cards in whenever the draw changes (skipped under the gate so shots stay static)
  useEffect(() => {
    if (gate || isDaily) return;
    const cards = document.querySelectorAll("[data-reading] [data-card]");
    if (!cards.length) return;
    const a = animate([...cards], { opacity: [0, 1], y: [16, 0] }, { delay: stagger(0.045), duration: 0.4, ease: "easeOut" });
    return () => a.stop?.();
  }, [seed]);

  const openCard = (i) => { setDetail(i); openScreen("card"); };
  const pickSpread = (id) => { setSpreadId(id); };
  // swipe the reading left/right to move between spreads — the pane follows the finger, clamped to the list
  const sIdx = SPREADS.findIndex((s) => s.id === spreadId);
  const goSpread = (d) => { const s = SPREADS[sIdx + d]; if (s) setSpreadId(s.id); };
  const { paneRef, pan } = usePanX({ onNext: () => goSpread(1), onPrev: () => goSpread(-1), canNext: sIdx < SPREADS.length - 1, canPrev: sIdx > 0 });
  const shuffle = () => { setOverride(null); setNonce((n) => n + 1); };
  // The ritual: request motion/compass on the tap gesture (iOS needs it inline), then open the flow.
  const openRitual = () => { try { const req = typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission; if (typeof req === "function") req.call(DeviceOrientationEvent).catch(() => {}); } catch { /* */ } openScreen("ritual"); };
  const completeRitual = (s) => { setOverride(s >>> 0); closeScreen(); };

  const rows = spread.rows || defaultRows(spread.pos.length);

  return html`<${Fragment}>
    ${isDaily
      // the card of the day: the picker, then one large card with its meaning inline (scrolls naturally)
      ? html`<div class="flex flex-col gap-4">
          <${Picker} t=${t} spreadId=${spreadId} onPick=${pickSpread} />
          <${Header} t=${t} spreadId=${spreadId} isDaily=${true} />
          <div class="overflow-hidden"><div ref=${paneRef} ...${pan} class="touch-pan-y will-change-transform"><${Solo} d=${drawn[0]} pos=${spread.pos[0]} t=${t} loc=${loc} onOpen=${() => openCard(0)} /></div></div>
        </div>`
      // any multi-card spread: the WHOLE structure fits the screen — cards shrink to fit, no page scroll.
      : html`<div class="flex flex-col gap-2.5 h-[calc(100dvh-11.5rem)] min-h-0 overflow-hidden">
          <${Picker} t=${t} spreadId=${spreadId} onPick=${pickSpread} />
          <${Header} t=${t} spreadId=${spreadId} isDaily=${false} onShuffle=${shuffle} onRitual=${openRitual} />
          <${FitReading} rows=${rows} drawn=${drawn} pos=${spread.pos} t=${t} loc=${loc} onOpen=${openCard} paneRef=${paneRef} pan=${pan} />
        </div>`}

    <${Ritual} open=${screen === "ritual"} onClose=${closeScreen} onDraw=${completeRitual} deckLen=${spread.majorOnly ? 22 : 78} t=${t} loc=${loc} spreadName=${T(t, SPREAD_KEY[spreadId])} />
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
  const wrapRef = useRef();
  useEffect(() => { wrapRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" }); }, [spreadId]);
  return html`<div ref=${wrapRef} class="shrink-0 -mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <div class="flex gap-2 w-max pb-0.5">
      ${SPREADS.map((s) => html`<button data-spread=${s.id} aria-pressed=${spreadId === s.id} class=${`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition active:scale-95 ${spreadId === s.id ? "border-secondary bg-secondary/15 text-secondary" : "border-base-300 bg-base-100 text-base-content/75"}`} onClick=${() => onPick(s.id)} key=${s.id}>
        <span class="text-xs font-medium whitespace-nowrap">${T(t, SPREAD_KEY[s.id])}</span>
        <span class="text-[0.6rem] font-mono tabular-nums opacity-70">${s.pos.length}</span>
      </button>`)}
    </div>
  </div>`;
}

// title + one-line description + a quick shuffle and the Ritual (charged draw). Both hidden for the day's card.
function Header({ t, spreadId, isDaily, onShuffle, onRitual }) {
  return html`<div class="shrink-0 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="font-bold text-lg leading-tight">${T(t, SPREAD_KEY[spreadId])}</div>
      <p class="mt-0.5 text-[0.78rem] leading-snug text-base-content/55 break-words line-clamp-2">${T(t, DESC_KEY[spreadId])}</p>
    </div>
    ${!isDaily ? html`<div class="shrink-0 flex items-center gap-1.5">
      <button data-shuffle aria-label=${T(t, "redraw")} class="btn btn-sm btn-ghost btn-circle border border-base-300" onClick=${onShuffle}>${Icon("lucide:shuffle", "text-base")}</button>
      <button data-ritual class="btn btn-sm btn-secondary gap-1.5 rounded-full" onClick=${onRitual}>${Icon("lucide:sparkles", "text-base")}<span class="text-xs font-semibold">${T(t, "ritual")}</span></button>
    </div>` : null}
  </div>`;
}

// The reading, fit to the viewport: rows share the height (flex-1) and each card scales to the smaller of
// its row's height and 1/maxCols of the width, keeping the spread's shape — the whole thing visible at once.
function FitReading({ rows, drawn, pos, t, loc, onOpen, paneRef, pan }) {
  const maxCols = Math.max(...rows.map((r) => r.length));
  const wpct = (94 / maxCols).toFixed(2);
  return html`<div data-reading ref=${paneRef} ...${pan || {}} class="flex-1 min-h-0 overflow-hidden flex flex-col gap-2 touch-pan-y will-change-transform">
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

// The Ritual — a participatory "charge the draw" flow. Instead of an opaque shuffle, the querent gives the
// draw its entropy: a colour, and the phone's tilt + compass heading (or a finger dragged through the
// field) + the moment in time — all swirling in a living particle field, distilled into a number 0..N-1 and
// hashed into the seed. Makes the randomness feel personal and legible. Canvas2D (not WebGL) so it renders
// identically everywhere — on the device and in the CI gate that screenshots it. Deterministic under gate.
const RIT_COLORS = [[159, 140, 246], [240, 101, 94], [64, 193, 115], [217, 151, 58], [90, 169, 230], [232, 160, 214]];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function Ritual({ open, onClose, onDraw, deckLen, t, loc, spreadName }) {
  const dref = useRef(), cref = useRef();
  const [color, setColor] = useState(0);
  const [num, setNum] = useState(() => hashSeed("0|") % deckLen);
  const [charge, setCharge] = useState(gate ? 0.6 : 0);
  const [live, setLive] = useState(gate ? { tilt: 18, head: 127, time: "07:23:00" } : { tilt: 0, head: 0, time: "" });
  const S = useRef({ samples: [], heading: 0, tx: 0, ty: 0, px: 0.5, py: 0.5, touch: 0, moved: 0, color: 0, num: 0 }).current;

  // The drawn cards are a PURE function of (colour, number): the same colour + number always give the same
  // spread. The number is distilled live from your motion/tilt/compass/touch + the moment; a different
  // colour reshapes it too. So the ring is the honest key — reproducible, legible.
  const recount = () => { const n = hashSeed(`${S.color}|${S.samples.join(",")}`) % deckLen; S.num = n; setNum(n); };
  useEffect(() => { const el = dref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  useEffect(() => { S.color = color; recount(); }, [color]);

  // the living particle field (+ device tilt/compass + touch drag → entropy)
  useEffect(() => {
    if (!open) return;
    const cv = cref.current; if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d"); if (!ctx || typeof ctx.arc !== "function") return;   // real 2D context only (linkedom → bail)
    S.samples = []; S.touch = 0; S.moved = 0;
    const dpr = Math.min((globalThis.devicePixelRatio || 1), 2);
    const size = () => { const r = cv.getBoundingClientRect(); cv.width = Math.max(1, (r.width || globalThis.innerWidth || 360) * dpr); cv.height = Math.max(1, (r.height || globalThis.innerHeight || 640) * dpr); };
    size();
    // deterministic golden-angle distribution → same field everywhere, animates live
    const P = Array.from({ length: 96 }, (_, i) => ({ a: i * 2.39996, r: 0.14 + ((i * 0.61803) % 1) * 0.86, sz: 1 + ((i * 0.37) % 1) * 2.4, spd: 0.0025 + ((i * 0.113) % 1) * 0.006 }));
    const paint = (now) => {
      const w = cv.width, h = cv.height, cx = w / 2, cy = h * 0.44, R = Math.min(w, h) * 0.4, c = RIT_COLORS[S.color];
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(10,10,12,0.22)"; ctx.fillRect(0, 0, w, h);       // dark wash → motion trails
      ctx.globalCompositeOperation = "lighter";
      const tx = S.tx * 0.5 + (S.touch ? (S.px - 0.5) * 0.7 : 0), ty = S.ty * 0.5 + (S.touch ? (S.py - 0.5) * 0.7 : 0);
      for (const p of P) {
        p.a += p.spd + S.heading * 0.000012;
        const rad = p.r * R * (0.88 + 0.14 * Math.sin(now * 0.001 + p.a * 3));
        const x = cx + Math.cos(p.a) * rad + tx * R, y = cy + Math.sin(p.a) * rad * 0.8 + ty * R;
        ctx.fillStyle = rgba(c, 0.5); ctx.beginPath(); ctx.arc(x, y, p.sz * dpr, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgba(c, 0.06); ctx.beginPath(); ctx.arc(x, y, p.sz * 5 * dpr, 0, 6.2832); ctx.fill();
      }
    };
    if (gate) { ctx.fillStyle = "#0a0a0c"; ctx.fillRect(0, 0, cv.width, cv.height); paint(1400); return; }   // one still frame for the gate/CI shot
    let raf, last = 0;
    const push = (now) => {
      if (now - last < 90) return; last = now;
      S.samples.push((Math.round(S.heading * 7 + S.tx * 131 + S.ty * 197 + S.px * 311 + S.py * 233 + now * 0.03) & 2047));
      if (S.samples.length > 80) S.samples.shift();
      recount();
      setCharge(Math.min(1, S.samples.length / 44));
      const d = new Date();
      setLive({ tilt: Math.round(Math.hypot(S.tx, S.ty) * 60), head: Math.round((S.heading % 360 + 360) % 360), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}` });
    };
    const loop = (now) => { paint(now); if (S.touch || S.moved) push(now); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const onOri = (e) => { if (e.alpha != null) S.heading = e.alpha; S.tx = Math.max(-1, Math.min(1, (e.gamma || 0) / 60)); S.ty = Math.max(-1, Math.min(1, (e.beta || 0) / 60)); S.moved = 1; };
    const onPtr = (e) => { const r = cv.getBoundingClientRect(); S.px = (e.clientX - r.left) / r.width; S.py = (e.clientY - r.top) / r.height; S.touch = 1; };
    const onUp = () => { S.touch = 0; };
    window.addEventListener("deviceorientation", onOri);
    cv.addEventListener("pointerdown", onPtr); cv.addEventListener("pointermove", onPtr);
    window.addEventListener("pointerup", onUp); window.addEventListener("resize", size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("deviceorientation", onOri); cv.removeEventListener("pointerdown", onPtr); cv.removeEventListener("pointermove", onPtr); window.removeEventListener("pointerup", onUp); window.removeEventListener("resize", size); };
  }, [open]);

  const drawNow = () => { onDraw(hashSeed(`${S.color}|${S.num}`) >>> 0); };   // pure fn of (colour, number)
  const col = RIT_COLORS[color];
  const { boxRef, grip } = useSheetDrag(onClose);   // swipe down to dismiss

  return html`<dialog id="ritual" ref=${dref} class="modal" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box max-w-none w-screen h-[100dvh] max-h-none rounded-none p-0 bg-base-100 overflow-hidden relative">
      <canvas ref=${cref} data-live aria-hidden="true" class="absolute inset-0 w-full h-full"></canvas>
      <div class="relative z-10 flex flex-col h-full px-5" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem);padding-bottom:calc(env(safe-area-inset-bottom) + 1.25rem)">
        ${grip}
        <div class="flex items-center justify-between">
          <div>
            <div class="text-[0.62rem] font-mono uppercase tracking-[0.16em] text-base-content/60">${T(t, "ritual")}</div>
            <div class="font-bold text-lg leading-tight">${spreadName}</div>
          </div>
          <button data-ritual-close aria-label=${T(t, "close")} class="btn btn-sm btn-circle btn-ghost" onClick=${onClose}>${Icon("lucide:x", "text-lg")}</button>
        </div>

        <p class="mt-3 text-[0.9rem] leading-snug text-base-content/70 max-w-[16rem]">${T(t, "ritualWhat")}</p>

        <div class="flex-1 min-h-0 flex flex-col items-center justify-center gap-5">
          <!-- the live formula: colour · tilt · compass · time, distilling into the number -->
          <div class="flex items-center gap-2 font-mono text-[0.72rem] text-base-content/75 tabular-nums" aria-hidden="true">
            <span class="h-3.5 w-3.5 rounded-full shrink-0" style=${`background:${rgba(col, 1)}`}></span>
            <span class="text-base-content/30">·</span>
            <span class="inline-flex items-center gap-1">${Icon("lucide:move-3d", "text-sm text-base-content/55")}${live.tilt}°</span>
            <span class="text-base-content/30">·</span>
            <span class="inline-flex items-center gap-1">${Icon("lucide:compass", "text-sm text-base-content/55")}${live.head}°</span>
            <span class="text-base-content/30">·</span>
            <span class="inline-flex items-center gap-1">${Icon("lucide:clock", "text-sm text-base-content/55")}${live.time || "—"}</span>
          </div>
          <div class="relative flex items-center justify-center" style="width:9.5rem;height:9.5rem">
            <svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-base-content)" stroke-opacity="0.12" stroke-width="2.5" />
              <circle cx="50" cy="50" r="45" fill="none" stroke=${rgba(col, 0.95)} stroke-width="2.5" stroke-linecap="round" stroke-dasharray=${`${(charge * 282.7).toFixed(1)} 282.7`} style="transition:stroke-dasharray .2s linear" />
            </svg>
            <div class="text-center">
              <div class="text-[2.6rem] font-bold tabular-nums leading-none" style=${`color:${rgba(col, 1)}`}>${num}</div>
              <div class="text-[0.55rem] font-mono uppercase tracking-widest text-base-content/60 mt-1">0–${deckLen - 1}</div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <p class="text-center text-[0.72rem] leading-relaxed text-base-content/60 max-w-sm mx-auto">${T(t, "ritualHow")}</p>
          <div class="flex justify-center gap-3">
            ${RIT_COLORS.map((c, i) => html`<button data-color=${i} aria-label=${`${T(t, "colorPick")} ${i + 1}`} aria-pressed=${color === i} class=${`h-8 w-8 rounded-full transition ${color === i ? "ring-2 ring-offset-2 ring-offset-base-100 scale-110" : "opacity-60"}`} style=${`background:${rgba(c, 1)};--tw-ring-color:${rgba(c, 1)}`} onClick=${() => setColor(i)} key=${i}></button>`)}
          </div>
          <button data-draw class="btn btn-lg w-full rounded-2xl border-0 font-bold text-[#0a0a0b]" style=${`background:${rgba(col, 1)}`} onClick=${drawNow}>${T(t, "drawCards")}</button>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
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
  const { boxRef, grip } = useSheetDrag(onClose);
  const c = d ? DECK[d.card] : null;
  const kind = c ? (c.arcana === "major" ? T(t, "arcanaMajor") : `${T(t, "arcanaMinor")} · ${T(t, SUIT_KEY[c.suit])}`) : "";
  return html`<dialog id="cardsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">${grip}
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
