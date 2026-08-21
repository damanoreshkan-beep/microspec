// Compatibility — real astrological synastry between two people, from two birth DATES and no birth times.
//
// Each person's Sun/Moon/Mercury/Venus/Mars come from the SYSTEMIC ephemeris (/_rt/astro eclipticPositions,
// astronomy-engine — the same engine the transit wheel runs on). The contacts between the two charts, their
// orbs and the index are the pure, unit-tested /_rt/synastry. Nothing is fetched or invented: the positions
// are real, the maths is deterministic and offline, and the AI paragraph is handed the sourced corpus and
// told to synthesise that and nothing else.
//
// THE UNKNOWN TIME IS THE DESIGN PROBLEM, and it is not a small one. Measured on this ephemeris: the Moon
// moves 13.2° in a mean day and 15.3° at its fastest, so a date without a time carries ±6.6° on it — and it
// changes SIGN inside the birth day 43.8% of the time. The old screen took noon, printed a Moon glyph and
// said nothing, which means roughly one card in five was confidently showing the wrong Moon. Hiding that
// behind a single number was the actual bug; the ±24 h slider is the fix. It moves the whole chart in 30
// minute steps, recomputing live (0.19 ms for both charts, so there is nothing to debounce), and the Moon
// visibly changes under it. ±24 h rather than ±12 h on purpose: it covers the unknown hour AND the unknown
// timezone, since a birth date recorded in local time can sit up to 14 hours from the UTC day.
//
// The AI reading is the one thing that does NOT follow the slider live — each distinct chart is a paid
// request, so it settles for a second after the last move and warms once. Sign glyphs are the hand-drawn
// SVGs from /_rt/zodiac (never emoji). The two dates and both offsets persist locally.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { Planet, eclipticPositions } from "/_rt/astro.js";
import { signOf, contacts, score, band, SYN_BODIES } from "/_rt/synastry.js";
import { groundSynastry } from "/_rt/signif.js";
import { matchRead, warmMatchRead, isMatchRead } from "/_rt/ai-astro.js";
import { gate } from "/_rt/gate.js";
import { DateField, CalendarSheet, parseYmd } from "./datepick.js";
import { Reading } from "./reading.js";

const AI_MATCH = { get: matchRead, has: isMatchRead, warm: warmMatchRead };

// `$a` is "you" and `$b` is "the partner" — the storage keys predate the layout and stay put, because
// renaming them would silently drop the dates every existing user has already entered. Which of the two is
// drawn FIRST is a presentation choice, made once in `people` below.
const $a = persistentAtom("compat.a", gate ? "1990-07-15" : "");
const $b = persistentAtom("compat.b", gate ? "1992-03-22" : "");
// Minutes from 12:00 UTC on the stated date, −1440..+1440.
const $ao = persistentAtom("compat.ao", "0");
const $bo = persistentAtom("compat.bo", "0");

const BAND_COLOR = ["var(--color-error)", "var(--color-warning)", "var(--color-secondary)", "var(--color-success)"];
const ASPECT_KEY = { conjunction: "aspConjunction", sextile: "aspSextile", square: "aspSquare", trine: "aspTrine", opposition: "aspOpposition" };
const STEP = 30, SPAN = 1440;   // 30-minute steps, ±24 h
const GATE_MATCH = { uk: "Найтісніший контакт тут — тригон Сонця партнера до твого Місяця, орб 2.1°: те, ким він є свідомо, лягає просто на те, як ти реагуєш, і саме тому ви домовляєтеся швидше, ніж встигаєте посперечатися. Тригон його Венери до твого Марса, орб 1.3°, тримає потяг у тому ж легкому руслі — тут ніхто нікого не здобуває. Секстиль його Місяця до твого Марса дає вихід, але тільки якщо ним скористатися: сам він нічого не зробить. Самі положення влаштовані по-різному — його Сонце в Овні починає прямо, твоє в Раку прихищає і памʼятає, — і ця різниця в темпі буде помітною раніше за все інше. Ціна тут одна й конкретна: легкість тригонів мало кому впадає в око, тож витримку цієї пари ви обидва схильні недооцінювати. Місяць рухається на понад тринадцять градусів за добу, тож точний час народження визначив би його знак.", en: "The closest contact here is your partner's Sun trine your Moon, orb 2.1°: who they consciously are lands straight on the way you react, which is why the two of you settle things before you get round to arguing about them. Their Venus trine your Mars, orb 1.3°, keeps the attraction in the same easy channel — nobody is winning anybody here. Their Moon sextile your Mars is an opening rather than an event: it helps only if it is taken. The placements themselves are built differently — their Aries Sun starts directly, your Cancer Sun shelters and remembers — and that difference in tempo shows up before anything else does. The cost is one and specific: a trine flows so readily that it goes unnoticed, so you both underrate how much this pair actually endures. The Moon moves over thirteen degrees a day, so a birth time would settle its sign." };

// The birth instant under test: noon UTC on the date, shifted by the slider.
const instant = (dateStr, offMin) => {
  const p = parseYmd(dateStr);
  return p ? new Date(Date.UTC(p.y, p.m, p.d, 12) + offMin * 60000) : null;
};

// A person's five bodies at that instant, or null when the date is unset or the ephemeris is unavailable —
// never a partial chart, because a missing Venus scores as an absent contact and reads as aversion.
const chartAt = (dateStr, offMin) => {
  const d = instant(dateStr, offMin);
  if (!d) return null;
  const pos = eclipticPositions(d, SYN_BODIES);
  return pos.length === SYN_BODIES.length ? pos : null;
};

const bodyOf = (pos, key) => pos.find((p) => p.key === key);

// Does this person's Moon change sign inside the DAY around the chosen instant? That is the honest span for
// "the hour is unknown", and it is the 43.8% case: when it is true the Moon glyph on the card is the one
// that holds at this position of the slider and not a fact about the person.
const moonUnsettled = (dateStr, offMin) => {
  const lo = chartAt(dateStr, offMin - 720), hi = chartAt(dateStr, offMin + 720);
  if (!lo || !hi) return false;
  return signOf(bodyOf(lo, "moon").lon) !== signOf(bodyOf(hi, "moon").lon);
};

const clock = (offMin) => {
  const total = ((720 + offMin) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
// Which calendar day the offset lands on, relative to the date the user typed.
const dayShift = (offMin) => Math.floor((720 + offMin) / 1440);

export function match({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const a = useStore($a), b = useStore($b);
  const ao = +useStore($ao), bo = +useStore($bo);

  const A = useMemo(() => chartAt(a, ao), [a, ao]);
  const B = useMemo(() => chartAt(b, bo), [b, bo]);
  const list = useMemo(() => (A && B ? contacts(A, B) : []), [A, B]);
  const r = A && B ? score(list) : null;

  // The reading settles a second behind the sliders. Every distinct chart is one paid request, so warming on
  // each of the 97 steps would spend a hundred of them on charts the user swept past — and cache each one
  // forever under its own key.
  const [settled, setSettled] = useState({ ao, bo });
  useEffect(() => {
    const id = setTimeout(() => setSettled({ ao, bo }), 1000);
    return () => clearTimeout(id);
  }, [ao, bo]);

  const people = [
    { key: "b", label: T(t, "partnerLabel"), date: b, off: bo, setOff: (v) => $bo.set(String(v)), pos: B, attr: "data-person-b" },
    { key: "a", label: T(t, "youLabel"), date: a, off: ao, setOff: (v) => $ao.set(String(v)), pos: A, attr: "data-person-a" },
  ];
  const setDate = (k, v) => (k === "a" ? $a : $b).set(v);
  const openKey = typeof screen === "string" && screen.startsWith("cal:") ? screen.slice(4) : null;

  return html`<${Fragment}>
    <div class="flex flex-col gap-[var(--ms-gap)]">
      <div class="grid grid-cols-2 gap-3">
        ${people.map((p) => html`<${DateField} key=${p.key} value=${p.date} label=${p.label} locale=${locale}
          placeholder=${T(t, "pickDate")} attr=${`data-date-${p.key}`} onOpen=${() => openScreen("cal:" + p.key)} />`)}
      </div>

      ${people.map((p) => p.date ? html`<${TimeDial} key=${p.key} p=${p} t=${t} /> ` : null)}

      ${r ? html`
        <${Ring} score=${r.overall} t=${t} />
        <div class="grid grid-cols-2 gap-3">
          ${people.map((p) => html`<${Person} key=${p.key} label=${p.label} pos=${p.pos} t=${t}
            unsettled=${moonUnsettled(p.date, p.off)} attr=${p.attr} />`)}
        </div>
        <${Bars} r=${r} t=${t} />
        <${Contacts} list=${list} t=${t} />
        <${Verdict} people=${people} list=${list} r=${r} settled=${settled} locale=${locale} t=${t} />
      ` : null}
    </div>

    <${CalendarSheet} open=${!!openKey} onClose=${closeScreen} locale=${locale}
      title=${openKey === "a" ? T(t, "youLabel") : T(t, "partnerLabel")}
      value=${openKey === "a" ? a : b} onPick=${(v) => setDate(openKey, v)} />
  </${Fragment}>`;
}

// The unknown hour, made movable. The readout is the whole point of the control — the number it shows is
// stated in UTC because without a birth PLACE there is no local time to convert to, and quietly printing a
// local-looking clock would be the app inventing a timezone.
function TimeDial({ p, t }) {
  const shift = dayShift(p.off);
  return html`<label ...${{ [`data-dial-${p.key}`]: p.key }} class="flex flex-col gap-1">
    <span class="flex items-baseline gap-2">
      <span class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/65 truncate">${p.label}</span>
      <span class="flex-1"></span>
      <span class="text-xs font-mono tabular-nums text-base-content/80">${clock(p.off)}
        ${shift ? html`<span class="text-base-content/55">${shift > 0 ? "+1" : "−1"}</span>` : null} UTC</span>
    </span>
    <input type="range" min=${-SPAN} max=${SPAN} step=${STEP} value=${p.off} aria-label=${p.label}
      onInput=${(e) => p.setOff(Number(e.target.value))} class="range range-xs range-primary w-full" />
  </label>`;
}

function Ring({ score, t }) {
  const bi = band(score), col = BAND_COLOR[bi];
  return html`<div data-result class="flex flex-col items-center gap-1.5 py-1">
    <div class="relative" style="width:9rem;height:9rem">
      <svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-base-content)" stroke-opacity="0.1" stroke-width="4" />
        <circle cx="50" cy="50" r="46" fill="none" stroke=${col} stroke-width="4" stroke-linecap="round" stroke-dasharray=${`${(score / 100 * 289).toFixed(1)} 289`} />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <div data-overall class="text-[2.6rem] font-bold tabular-nums leading-none" style=${`color:${col}`}>${score}</div>
        <div class="text-[0.55rem] font-mono uppercase tracking-widest text-base-content/65 mt-0.5">${T(t, "overall")}</div>
      </div>
    </div>
    <div class="text-sm font-semibold" style=${`color:${col}`}>${T(t, "band" + bi)}</div>
  </div>`;
}

function Person({ label, pos, t, unsettled, attr }) {
  // A person card is an object ON the page, so it declares the material instead of drawing a hairline round
  // itself — the shadow pair IS the edge now. `sf-e2` (the shallow rung) because there are two of these side
  // by side in a grid and the full extrusion on a half-width card overpowers the ring it sits under.
  //
  // The three small bodies are a 3-column GRID, not a flex row. As a row each cell sized to its own label
  // and the widest one («МІСЯЦЬ») pushed its neighbours until the three captions ran together into
  // "МІСЯЦЬВЕНЕРАМАРС" on a 384 px screen. A grid gives each an equal, bounded third of the card, and
  // `min-w-0` is what lets `truncate` actually apply inside it.
  const sun = signOf(bodyOf(pos, "sun").lon);
  return html`<div ...${{ [attr]: "1" }} class="rounded-2xl sf-raised sf-e2 p-3 flex flex-col items-center gap-2">
    <div class="text-[0.6rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${label}</div>
    <${Sign} i=${sun} cls="w-9 h-9 text-secondary" />
    <div class="text-sm font-semibold leading-tight text-center">${T(t, "sign" + sun)}</div>
    <div class="grid grid-cols-3 gap-1 w-full mt-1">
      ${["moon", "venus", "mars"].map((pl) => {
        const soft = pl === "moon" && unsettled;
        return html`<div class="flex flex-col items-center gap-1 min-w-0" key=${pl}>
          <${Sign} i=${signOf(bodyOf(pos, pl).lon)} cls=${`w-4 h-4 ${soft ? "text-warning" : "text-base-content/65"}`} />
          <span class=${`text-[0.5rem] font-mono uppercase tracking-wide truncate w-full text-center ${soft ? "text-warning" : "text-base-content/65"}`}>${T(t, "pl_" + pl)}</span>
        </div>`;
      })}
    </div>
    ${unsettled ? html`<div data-moon-open class="text-[0.55rem] leading-tight text-center text-warning/90">${T(t, "moonOpen")}</div>` : null}
  </div>`;
}

function Bars({ r, t }) {
  const axes = [["axCore", r.core], ["axLove", r.love], ["axEmotion", r.emotion], ["axMind", r.mind], ["axPassion", r.passion]];
  // An axis track is a TROUGH the score fills — `sf-inset`, the farm's word for a rail. It used to be
  // `bg-base-300`, i.e. a tone step standing in for the recess; base-300 no longer reads as a step down from
  // the page, so the empty part of every bar had quietly gone invisible and a low score looked like no bar.
  return html`<div class="flex flex-col gap-2.5">
    ${axes.map(([key, v]) => html`<div class="flex items-center gap-3" key=${key}>
      <div class="w-20 shrink-0 text-xs font-medium truncate">${T(t, key)}</div>
      <div class="flex-1 h-2 rounded-full sf-inset overflow-hidden"><div class="h-full rounded-full" style=${`width:${v}%;background:${BAND_COLOR[band(v)]}`}></div></div>
      <div class="w-8 shrink-0 text-right text-xs font-mono tabular-nums text-base-content/70">${v}</div>
    </div>`)}
  </div>`;
}

// The contacts themselves — the evidence the index is built from, so a number on the ring can be traced to
// the aspects that produced it. The orb is shown against the pair's OWN limit because those limits differ:
// 3° is most of a Mercury–Venus contact and a quarter of a Sun–Moon one.
function Contacts({ list, t }) {
  if (!list.length) return html`<div data-contacts class="text-[0.8rem] text-base-content/65 py-1">${T(t, "matchNoContacts")}</div>`;
  return html`<div data-contacts class="flex flex-col gap-1.5">
    <div class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${T(t, "matchContacts")}</div>
    ${list.slice(0, 5).map((c) => html`<div data-contact class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0" key=${`${c.a}-${c.b}-${c.type}`}>
      <span class="shrink-0"><${Planet} body=${c.a} /></span>
      <span class="text-[0.72rem] font-medium truncate">${T(t, ASPECT_KEY[c.type])}</span>
      <span class="shrink-0"><${Planet} body=${c.b} /></span>
      <span class="flex-1"></span>
      <span class="shrink-0 text-[0.68rem] font-mono tabular-nums text-base-content/65">${c.orb.toFixed(1)}° / ${c.limit}°</span>
    </div>`)}
  </div>`;
}

// The reading. `settled` is the offsets as they were a second after the last slider move, so the grounding
// block and its cache signature are built from a chart the user has stopped on.
function Verdict({ people, list, r, settled, locale, t }) {
  const { ao, bo } = settled;   // named, not positional: `people` draws the partner first and the pair
                                // read the other way round once already.
  const pos = [chartAt(people[0].date, bo), chartAt(people[1].date, ao)];
  const stable = pos[0] && pos[1];
  const built = useMemo(() => {
    if (!stable) return null;
    const settledList = contacts(pos[0], pos[1]);
    return groundSynastry({
      people: [{ label: "Partner", points: pos[0] }, { label: "You", points: pos[1] }],
      list: settledList,
      scores: score(settledList),
      refEN: `${clock(bo)} UTC and ${clock(ao)} UTC on the stated birth dates`,
      moonOpen: moonUnsettled(people[0].date, bo) || moonUnsettled(people[1].date, ao),
    });
  }, [people[0].date, people[1].date, bo, ao]);
  if (!built) return null;
  return html`<div class="flex flex-col gap-1.5 pt-1">
    <div class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${T(t, "verdictTitle")}</div>
    <${Reading} sig=${built.sig} input=${built.text} loc=${locale} api=${AI_MATCH} t=${t}
      gateText=${GATE_MATCH[locale] || GATE_MATCH.en} lines=${[27, 31, 24, 29, 18]} />
  </div>`;
}
