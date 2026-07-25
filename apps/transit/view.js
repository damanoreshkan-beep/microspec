// Transits — what today's sky is doing TO YOUR CHART. Without a birth moment a "transit" is just a planet
// somewhere, so this app is built around the natal chart: a birth date, a birth TIME (to the second) and a
// birth PLACE resolve to one exact UTC instant, and everything else is derived from it.
//
// The precision lives in the SYSTEMIC runtime, not here (see apps/transit/RESEARCH.md for the derivations
// and the measurements that verify them):
//   /_rt/birth   — the record, and the wall-clock → UTC resolution with three ways to name the offset.
//   /_rt/natal   — Ascendant, Midheaven, Vertex, four house systems, transit orbs, exact-hit root finding.
//   /_rt/astro   — the ephemeris, and the two wrappers that feed the frame (RAMC + true obliquity) in.
//   /_rt/places  — the geocoder that supplies lat/lng AND the IANA zone, Cyrillic input included.
//
// Three tabs: the bi-wheel (natal inside, transits outside, contacts as chords), the hits (each contact
// with the instant it perfects, quoted only as finely as the body's speed honestly allows), and the chart
// (every natal placement with its house, plus the angles and cusps).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { BODIES, BODY_KEYS, Planet, eclipticPositions, natalHouses, hitTimes } from "/_rt/astro.js";
import { SkyDial, dialAt } from "/_rt/skydial.js";
import { Sign } from "/_rt/zodiac.js";
import { transits, houseOf, norm360, wrap180, HIT_PRECISION, TRANSIT_ORB } from "/_rt/natal.js";
import { resolve, isComplete, EMPTY, BIRTH_CODEC } from "/_rt/birth.js";
import { searchPlaces, placeLabel, formatCoords } from "/_rt/places.js";
import { interpret, warmInterpret, isInterpreted, aiTick } from "/_rt/ai.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { useSheetDrag } from "/_rt/gesture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const DAY = 86400000;
// standard chart orientation: 0° Aries at the left (9 o'clock), signs run COUNTER-clockwise. The dial angle
// is 0=up / clockwise, so screen angle = 270 − ecliptic longitude.
const wheelAngle = (lon) => norm360(270 - lon);
const signOf = (lon) => Math.floor(norm360(lon) / 30);
const degIn = (lon) => norm360(lon) % 30;
const bodyLabel = (t, k) => T(t, k === "asc" || k === "mc" ? (k === "asc" ? "angAsc" : "angMc") : "b" + k[0].toUpperCase() + k.slice(1));
// point on a unit dial (0=up, clockwise) as [x%, y%] — for the ring / cusp / chord SVG overlay
const pt = (deg, r) => { const a = deg * Math.PI / 180; return [(50 + r * Math.sin(a)).toFixed(2), (50 - r * Math.cos(a)).toFixed(2)]; };
// 11°Can39' — how an astrologer reads a longitude
const dm = (lon) => { const d = degIn(lon), g = Math.floor(d); return `${g}°${String(Math.floor((d - g) * 60)).padStart(2, "0")}'`; };

const ASPECT_HUE = { soft: "var(--color-success)", hard: "var(--color-error)", neutral: "var(--color-base-content)" };
const ASPECT_DASH = { soft: "", hard: "2 2.4", neutral: "0.6 2" };
const ASPECT_KEY = { conjunction: "aspConjunction", sextile: "aspSextile", square: "aspSquare", trine: "aspTrine", opposition: "aspOpposition" };
const SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const CHIPS = [[-30, "mMonth"], [-7, "mWeek"], [0, "today"], [7, "pWeek"], [30, "pMonth"]];

// Under the gate everything is pinned — a fixed birth record AND a fixed "now" — so the CI shot, the axe
// pass and the e2e assertions see the same sky on every run. A live clock would make the shot a lottery.
const GATE_BIRTH = { date: "1990-07-15", time: "14:32:00", zoneMode: "place", offset: "",
  place: { id: 703448, name: "Kyiv", country: "Ukraine", countryCode: "UA", region: "Kyiv", lat: 50.45466, lng: 30.5238, zone: "Europe/Kyiv" } };
const NOW = () => (gate ? new Date("2026-07-25T12:00:00Z") : new Date());

const $birth = persistentAtom("transit:birth", gate ? GATE_BIRTH : null, BIRTH_CODEC);
const $offset = atom(0);                               // days from today, shared by the wheel and the hits

// A fixed reading so the CI shot + e2e are deterministic and offline (live positions vary by run time).
const GATE_INTERP = { uk: "Сатурн у квадратурі до натального Сонця робить цей період вимогливим: те, що ти будуєш, перевіряють на міцність, і поспіх лише додасть тертя. Транзитний Меркурій ретроградним рухом повертає до старої розмови, яку варто переписати, а не форсувати. Тригон Юпітера до натального Місяця дає тиху опору — рухайся послідовно, і обов'язок обернеться на структуру, а не на пастку.", en: "Saturn square your natal Sun makes this stretch exacting: what you are building is being tested for load, and pushing only adds friction. A retrograde Mercury turns you back to an old conversation worth rewriting rather than forcing. Jupiter's trine to your natal Moon lends quiet support — move step by step and the duty becomes structure, not a snare." };

// ── the chart, computed once and shared by all three tabs ──────────────────────────────────────────────

// Everything derived from the stored record + the scrubbed date. Memoised on the inputs that actually move,
// because a Placidus solve plus twenty ephemeris evaluations per render would make the scrubber crawl.
function useChart(S) {
  const rec = useStore($birth), offset = useStore($offset), filters = useStore(S.filters);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []);
  const shownKey = String(filters.bodies || "");
  const system = filters.houseSystem || "placidus";
  return useMemo(() => {
    const shown = Array.isArray(filters.bodies) && filters.bodies.length ? filters.bodies : BODY_KEYS;
    const b = rec ? resolve(rec) : { ok: false, reason: "date" };
    const when = new Date(NOW().getTime() + offset * DAY);
    const sky = eclipticPositions(when, shown);
    const prevSky = eclipticPositions(new Date(when.getTime() - DAY), shown);
    const prevMap = Object.fromEntries(prevSky.map((p) => [p.key, p.lon]));
    const retro = (k, lon) => (k === "sun" || k === "moon" || prevMap[k] == null) ? false : wrap180(lon - prevMap[k]) < 0;
    if (!b.ok) return { rec, b, when, sky, prevMap, retro, shown, ready: false };

    const H = natalHouses(b.date, b.lat, b.lng, system);
    const natal = eclipticPositions(b.date, shown);
    const natalRetro = Object.fromEntries(eclipticPositions(new Date(b.ms - DAY), shown).map((p) => [p.key, p.lon]));
    // the angles join the natal points: a transit to the Ascendant or Midheaven is the loudest kind there is
    const targets = [...natal, { key: "asc", lon: H.asc }, { key: "mc", lon: H.mc }];
    const hits = transits(sky, targets, { prev: prevMap, orb: TRANSIT_ORB.range });
    return { rec, b, when, sky, prevMap, retro, shown, ready: true, H, natal, targets, hits, system: H.system,
      natalRetroFor: (k, lon) => (k === "sun" || k === "moon" || natalRetro[k] == null) ? false : wrap180(lon - natalRetro[k]) < 0 };
  }, [rec, offset, shownKey, system, Math.floor(Date.now() / 60000)]);
}

// ── the empty state — no chart without a birth moment ──────────────────────────────────────────────────

const NeedBirth = ({ t, onOpen }) => html`<div data-need-birth class="flex flex-col items-center gap-4 py-14 px-6 text-center">
  <div class="rounded-full border border-base-300 p-4 text-base-content/70">${Icon("lucide:calendar-clock", "text-3xl")}</div>
  <div class="text-base font-semibold max-w-[22rem]">${T(t, "needBirth")}</div>
  <button data-open-birth class="btn btn-primary rounded-full gap-2" onClick=${onOpen}>
    ${Icon("lucide:plus", "text-base")}<span>${T(t, "birthSet")}</span>
  </button>
</div>`;

// ── tab 1: the bi-wheel ────────────────────────────────────────────────────────────────────────────────

export function wheel({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  useStore(aiTick);
  const C = useChart(S);
  const offset = useStore($offset);

  const fmtDate = (d) => d.toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { day: "numeric", month: "short", year: "numeric" });

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }

  const { H, natal, sky, hits, b } = C;
  const lonOf = Object.fromEntries([...C.targets].map((p) => [p.key, p.lon]));

  // the zodiac ring, the house cusps, and the transit→natal contacts as chords across the middle
  const cuspLines = H.cusps.map((c, i) => {
    const [x1, y1] = pt(wheelAngle(c), 17), [x2, y2] = pt(wheelAngle(c), 40);
    const angular = i === 0 || i === 9;                      // the Ascendant and Midheaven axes read heavier
    return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor"
      stroke-width=${angular ? 0.7 : 0.3} stroke-opacity=${angular ? 0.85 : 0.4} key=${"c" + i}></line>`;
  });
  const cuspNums = H.cusps.map((c, i) => {
    const span = norm360(H.cusps[(i + 1) % 12] - c);
    const [x, y] = pt(wheelAngle(norm360(c + span / 2)), 20);
    return html`<text x=${x} y=${y} fill="currentColor" fill-opacity="0.55" font-size="2.6" text-anchor="middle"
      dominant-baseline="middle" key=${"n" + i}>${i + 1}</text>`;
  });
  const chords = hits.map((a, i) => {
    const [x1, y1] = pt(wheelAngle(lonOf[a.n]), 16), [x2, y2] = pt(wheelAngle(sky.find((p) => p.key === a.t).lon), 16);
    return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke=${ASPECT_HUE[a.nature]} stroke-width=${a.exact ? 0.6 : 0.4}
      stroke-opacity=${a.exact ? 0.85 : 0.45} stroke-dasharray=${ASPECT_DASH[a.nature]} stroke-linecap="round" key=${i}></line>`;
  });
  const overlay = html`<svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full pointer-events-none" fill="none" aria-hidden="true">
    <g class="text-base-content/25">
      <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="0.4"></circle>
      <circle cx="50" cy="50" r="29" stroke="currentColor" stroke-width="0.3"></circle>
      <circle cx="50" cy="50" r="17" stroke="currentColor" stroke-width="0.3"></circle>
      ${Array.from({ length: 12 }, (_, i) => { const [x1, y1] = pt(norm360(270 - i * 30), 40), [x2, y2] = pt(norm360(270 - i * 30), 46.5); return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor" stroke-width="0.4" key=${"s" + i}></line>`; })}
    </g>
    <g class="text-base-content">${cuspLines}${cuspNums}</g>
    ${chords}
  </svg>`;

  // transiting bodies ride the outer ring (SkyDial, which de-clusters conjunctions into a radial spoke);
  // the natal chart sits on its own inner ring, drawn dimmer so "now" reads on top of "always".
  const marks = sky.map((p) => ({ key: p.key, body: p.key, angle: wheelAngle(p.lon), value: norm360(p.lon), label: bodyLabel(t, p.key) }));
  const rim = Array.from({ length: 12 }, (_, i) => ({ label: html`<${Sign} i=${i} cls="w-[18px] h-[18px]" />`, angle: wheelAngle(i * 30 + 15), cls: "text-base-content/70", rimR: 43 }));
  const natalRing = html`<div class="absolute inset-0 pointer-events-none">
    ${natal.map((p) => html`<div data-natal=${p.key} class="absolute flex flex-col items-center" style=${dialAt(wheelAngle(p.lon), 24)} key=${p.key}>
      <div class="opacity-70 scale-[0.72] origin-center"><${Planet} body=${p.key} /></div>
    </div>`)}
    ${[["asc", H.asc], ["mc", H.mc]].map(([k, lon]) => html`<span data-angle=${k} class="absolute text-[0.52rem] font-mono font-bold tracking-tight text-primary" style=${dialAt(wheelAngle(lon), 36)} key=${k}>${T(t, k === "asc" ? "angAsc" : "angMc")}</span>`)}
  </div>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 items-center">
      <div class="relative w-full mx-auto" style="max-width:360px">
        <${SkyDial} size=${360} marks=${marks} rim=${rim} overlay=${overlay}
          radial=${() => 33} opacityFor=${() => 1} fan=${{ within: 8, step: 5, rim: 33, min: 30 }} />
        ${natalRing}
      </div>

      <!-- the birth moment this whole chart hangs on, and the date being transited -->
      <button data-birth-row class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition" onClick=${() => openScreen("birth")}>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">${placeLabel(b.place)}</div>
          <div class="text-[0.68rem] font-mono text-base-content/70 truncate">${C.rec.date} ${C.rec.time} ${b.offsetLabel} · ${formatCoords(b.lat, b.lng)}</div>
        </div>
        ${Icon("lucide:pencil", "text-base text-base-content/70")}
      </button>

      <div class="w-full max-w-[420px] flex flex-col gap-2">
        <div class="text-center">
          <span data-date class="text-2xl font-bold tabular-nums">${fmtDate(C.when)}</span>
          ${offset === 0 ? html`<span class="text-xs text-primary ml-2 align-middle">● ${T(t, "today")}</span>` : null}
        </div>
        <input id="scrub" type="range" min="-365" max="365" step="1" value=${offset} class="range range-xs range-primary" aria-label=${T(t, "dateAria")} onInput=${(e) => $offset.set(Number(e.target.value))} />
        <div class="grid grid-cols-5 gap-1.5 text-center">
          ${CHIPS.map(([o, lbl]) => html`<button data-chip=${lbl} class=${`rounded-xl border py-1.5 text-xs font-medium transition ${offset === o ? "border-primary bg-primary/10" : "border-base-300"}`} onClick=${() => $offset.set(o)} key=${lbl}>${T(t, lbl)}</button>`)}
        </div>
      </div>

      <!-- the contacts themselves, tightest first; the header opens the grounded AI reading -->
      <div class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
        <div class="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "contactsTitle")}</div>
          <button data-interp class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen("interp")}>
            ${Icon("lucide:sparkles", "text-base")}<span class="text-xs font-semibold">${T(t, "interpBtn")}</span>
          </button>
        </div>
        <div class="px-4 pb-2">
          ${hits.length ? hits.map((a, i) => html`<${ContactRow} a=${a} t=${t} retro=${C.retro(a.t, sky.find((p) => p.key === a.t).lon)} key=${i} />`)
            : html`<div class="py-2 text-sm text-base-content/70">${T(t, "noContacts")}</div>`}
        </div>
      </div>
    </div>

    <${InterpSheet} open=${screen === "interp"} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${fmtDate(C.when)} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

// one transit→natal contact: transiting body · aspect · natal point · applying/separating · orb
// Exact vs merely in-range is carried by the ORB's colour, never by dimming the row. `opacity-70` over
// `text-base-content/70` is 49% effective and axe failed 39 elements on it in the light theme — the exact
// trap the design rules warn about. State reads through colour = meaning; contrast stays full strength.
function ContactRow({ a, t, retro }) {
  return html`<div data-contact class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0">
    ${dot(a.t)}
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.t)}${retro ? html`<span class="text-warning font-mono ml-0.5" title=${T(t, "retro")}>℞</span>` : null}</span>
    <span class="text-xs font-medium shrink-0" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
    <span class="text-base-content/70 shrink-0 text-xs">${T(t, "natalMark")}</span>
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.n)}</span>
    <div class="ml-auto flex items-center gap-1.5 shrink-0">
      ${a.applying != null ? html`<span class=${`text-[0.6rem] font-medium ${a.applying ? "text-primary" : "text-base-content/70"}`}>${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}
      <span class=${`tabular-nums text-xs w-9 text-right ${a.exact ? "text-primary font-semibold" : "text-base-content/70"}`}>${a.orb.toFixed(1)}°</span>
    </div>
  </div>`;
}

// ── tab 2: the exact hits ──────────────────────────────────────────────────────────────────────────────

// Each contact resolved to the INSTANT it perfects, by bisecting the ephemeris. Quoted only as finely as
// the body's speed allows: the Moon to the second, Saturn to the minute, Pluto to the day. Printing
// "14:22:07" for a Pluto transit would be a lie told with decimal places (RESEARCH.md §5).
// Bisecting the ephemeris is not free: a Pluto contact scans a twelve-year window, and a full chart can
// carry twenty contacts. Doing them all inside a render would freeze the tab switch for seconds on a phone,
// so each contact is solved in its own task with a yield between them, and its card carries a skeleton
// until its answer lands. Never a spinner — the card is already there, only its times are pending.
const hitKey = (a) => `${a.t}|${a.n}|${a.type}`;
function useHitTimes(contacts, whenMs) {
  const [solved, setSolved] = useState({});
  const sig = contacts.map(hitKey).join(",") + "|" + Math.floor(whenMs / 36e5);
  useEffect(() => {
    setSolved({});
    let cancelled = false, i = 0;
    const step = () => {
      if (cancelled || i >= contacts.length) return;
      const a = contacts[i++];
      const times = hitTimes(a.t, a.natalLon, a.signedAngle, whenMs);
      setSolved((m) => ({ ...m, [hitKey(a)]: times }));
      setTimeout(step, 0);                                  // yield: let the browser paint between bodies
    };
    const id = setTimeout(step, 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [sig]);
  return solved;
}

export function hits({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const C = useChart(S);
  const loc = locale === "en" ? "en-GB" : locale || "uk";
  // BEFORE the empty-state return: a hook that runs conditionally desynchronises the hook order the moment
  // birth data is saved, and the tab would blow up on exactly the transition that matters most.
  const solved = useHitTimes(C.hits || [], C.when.getTime());

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }

  const fmtHit = (ms, prec) => {
    const d = new Date(ms);
    const date = d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
    if (prec === "day") return date;
    const time = d.toLocaleTimeString(loc, prec === "second"
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
  };

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      ${C.hits.length ? C.hits.map((a, i) => {
        const times = solved[hitKey(a)];
        const prec = HIT_PRECISION[a.t] || "minute";
        const nearest = times && times.length ? times.reduce((best, x) => Math.abs(x - C.when) < Math.abs(best - C.when) ? x : best) : null;
        return html`<div data-hit class="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 flex flex-col gap-2" key=${i}>
        <div class="flex items-center gap-2">
          ${dot(a.t)}
          <span class="font-semibold truncate">${bodyLabel(t, a.t)}</span>
          <span class="text-xs font-semibold shrink-0" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
          <span class="text-base-content/70 shrink-0 text-xs">${T(t, "natalMark")}</span>
          <span class="font-semibold truncate">${bodyLabel(t, a.n)}</span>
          <span class="ml-auto tabular-nums text-xs text-base-content/70 shrink-0">${a.orb.toFixed(2)}°</span>
        </div>
        ${times === undefined
          ? html`<div class="text-[0.8rem] text-base-content/70 font-mono"><${Scramble} len=${22} /></div>`
          : times.length ? html`<div class="flex flex-col gap-1">
            ${times.map((ms, j) => html`<div class=${`flex items-center gap-2 text-[0.8rem] ${ms === nearest ? "" : "text-base-content/70"}`} key=${j}>
              ${Icon(ms === nearest ? "lucide:crosshair" : "lucide:dot", `text-sm shrink-0 ${ms === nearest ? "text-primary" : ""}`)}
              <span data-hit-time class="font-mono tabular-nums">${fmtHit(ms, prec)}</span>
              ${times.length > 1 && j === 0 ? html`<span class="ml-auto text-[0.6rem] font-mono uppercase text-base-content/70 shrink-0">${T(t, "passes")} ${times.length}</span>` : null}
            </div>`)}
          </div>` : html`<div class="text-[0.8rem] text-base-content/70">${T(t, "noExactHit")}</div>`}
      </div>`;
      }) : html`<div class="rounded-2xl border border-base-300 bg-base-100 px-4 py-6 text-sm text-base-content/70 text-center">${T(t, "noContacts")}</div>`}
    </div>
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

// ── tab 3: the natal chart itself ──────────────────────────────────────────────────────────────────────

export function chart({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const C = useChart(S);

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }
  const { H, natal, b } = C;
  const rows = natal.slice().sort((x, y) => norm360(x.lon) - norm360(y.lon));

  const angleRow = (key, lon) => html`<div data-angle-row=${key} class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0" key=${key}>
    <div class="w-20 font-medium truncate text-primary">${T(t, key)}</div>
    <div class="w-6 flex justify-center text-base-content/70"><${Sign} i=${signOf(lon)} cls="w-5 h-5" /></div>
    <div class="flex-1 min-w-0 truncate">${T(t, "s" + signOf(lon))}</div>
    <div class="tabular-nums text-base-content/70 w-12 text-right font-mono text-xs">${dm(lon)}</div>
  </div>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      <button data-birth-row class="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition" onClick=${() => openScreen("birth")}>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">${placeLabel(b.place)}</div>
          <div class="text-[0.68rem] font-mono text-base-content/70 truncate">${b.date.toISOString().replace(".000Z", "Z")} · ${T(t, "utcMark")} ${b.offsetLabel}</div>
        </div>
        ${Icon("lucide:pencil", "text-base text-base-content/70")}
      </button>

      <div class="rounded-2xl border border-base-300 bg-base-100 overflow-x-auto">
        <div class="min-w-[300px] px-4 py-1.5">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70 py-1.5">${T(t, "natalTitle")}</div>
          ${angleRow("angAsc", H.asc)}${angleRow("angMc", H.mc)}${angleRow("angVertex", H.vertex)}
          ${rows.map((p) => {
            const s = signOf(p.lon), hs = houseOf(p.lon, H.cusps), r = C.natalRetroFor(p.key, p.lon);
            return html`<div data-row=${p.key} class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0" key=${p.key}>
              <div class="w-20 font-medium truncate">${bodyLabel(t, p.key)}</div>
              <div class="w-6 flex justify-center text-base-content/70"><${Sign} i=${s} cls="w-5 h-5" /></div>
              <div class="flex-1 min-w-0 truncate">${T(t, "s" + s)}</div>
              <div class="tabular-nums text-base-content/70 w-12 text-right font-mono text-xs">${dm(p.lon)}</div>
              <div class="w-8 text-right tabular-nums text-xs text-base-content/70">${T(t, "houseShort")}${hs}</div>
              <div class="w-4 text-center">${r ? html`<span class="text-warning font-mono" title=${T(t, "retro")}>℞</span>` : null}</div>
            </div>`;
          })}
        </div>
      </div>

      <div class="rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
        <div class="px-4 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "cuspsTitle")}</div>
          <span data-house-system class="text-[0.6rem] font-mono uppercase text-base-content/70">${T(t, "hs" + C.system[0].toUpperCase() + C.system.slice(1))}</span>
        </div>
        ${H.fallback ? html`<div data-house-fallback class="mx-4 mb-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[0.72rem] text-base-content">${T(t, "hsFallback")}</div>` : null}
        <div class="px-4 pb-3 grid grid-cols-2 gap-x-4">
          ${H.cusps.map((c, i) => html`<div data-cusp=${i + 1} class="flex items-center gap-2 py-1 border-b border-base-300/40 last:border-0" key=${i}>
            <span class="w-5 text-xs font-mono text-base-content/70 tabular-nums">${i + 1}</span>
            <${Sign} i=${signOf(c)} cls="w-4 h-4 text-base-content/70 shrink-0" />
            <span class="ml-auto font-mono text-xs tabular-nums">${dm(c)}</span>
          </div>`)}
        </div>
      </div>
    </div>
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

// ── the birth-data sheet ───────────────────────────────────────────────────────────────────────────────

// Everything a chart needs, and nothing it does not. The resolved instant is echoed back live, because the
// one thing the user can actually verify is "does that UTC moment match my birth certificate?". The two
// time-zone traps (an hour that ran twice, an hour that never ran) are shown rather than silently resolved.
function BirthSheet({ open, onClose, t, locale }) {
  const ref = useRef();
  const stored = useStore($birth);
  const [draft, setDraft] = useState(stored || EMPTY);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  useEffect(() => { if (open) { setDraft(stored || EMPTY); setQ(""); setResults(null); } }, [open]);

  // debounced place search; an in-flight request is abandoned when the query moves on
  useEffect(() => {
    if (!open || q.trim().length < 2) { setResults(null); setSearching(false); return; }
    const ctl = new AbortController();
    setSearching(true);
    const id = setTimeout(async () => {
      const r = await searchPlaces(q, { signal: ctl.signal });
      setResults(r); setSearching(false);
    }, 350);
    return () => { clearTimeout(id); ctl.abort(); setSearching(false); };
  }, [q, open]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const r = resolve(draft);
  const complete = isComplete(draft) && r.ok;
  const { boxRef, grip } = useSheetDrag(onClose);
  const save = () => { if (complete) { $birth.set(draft); onClose(); } };

  const field = (label, node) => html`<label class="flex flex-col gap-1 min-w-0">
    <span class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${label}</span>
    ${node}
  </label>`;
  const MODES = [["place", "zmPlace"], ["lmt", "zmLmt"], ["manual", "zmManual"]];

  return html`<dialog id="birthsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">${grip}
      <div class="flex items-center gap-2 mb-4">
        ${Icon("lucide:calendar-clock", "text-primary")}
        <div class="font-bold text-lg leading-tight">${T(t, "birthTitle")}</div>
      </div>

      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          ${field(T(t, "birthDate"), html`<input data-birth-date type="date" value=${draft.date} min="1500-01-01" max="2100-12-31"
            onInput=${(e) => set({ date: e.target.value })} class="input input-bordered rounded-2xl h-11 w-full text-sm" />`)}
          ${field(T(t, "birthTime"), html`<input data-birth-time type="time" step="1" value=${draft.time}
            onInput=${(e) => set({ time: e.target.value })} class="input input-bordered rounded-2xl h-11 w-full text-sm font-mono" />`)}
        </div>

        ${field(T(t, "birthPlace"), html`<input data-birth-place type="search" value=${q} placeholder=${draft.place ? placeLabel(draft.place) : T(t, "placeSearch")}
          onInput=${(e) => setQ(e.target.value)} class="input input-bordered rounded-2xl h-11 w-full text-sm" />`)}

        ${searching ? html`<div class="flex flex-col gap-2 px-1">${[26, 22, 24].map((n, i) => html`<div class="text-sm text-base-content/70" key=${i}><${Scramble} len=${n} /></div>`)}</div>` : null}
        ${results && !searching ? (results.length ? html`<div class="flex flex-col rounded-2xl border border-base-300 overflow-hidden">
          ${results.map((p) => html`<button data-place-hit class="px-3 py-2.5 text-left border-b border-base-300/50 last:border-0 active:bg-primary/10 transition" onClick=${() => { set({ place: p }); setQ(""); setResults(null); }} key=${p.id}>
            <div class="text-sm font-medium truncate">${placeLabel(p)}</div>
            <div class="text-[0.66rem] font-mono text-base-content/70 truncate">${formatCoords(p.lat, p.lng)} · ${p.zone}</div>
          </button>`)}
        </div>` : html`<div class="text-sm text-base-content/70 px-1">${T(t, "placeNone")}</div>`) : null}

        ${draft.place ? html`<div data-birth-chosen class="rounded-2xl border border-base-300 bg-base-200/40 px-3 py-2">
          <div class="text-sm font-medium truncate">${placeLabel(draft.place)}</div>
          <div class="text-[0.66rem] font-mono text-base-content/70 truncate">${formatCoords(draft.place.lat, draft.place.lng)} · ${draft.place.zone}</div>
        </div>` : null}

        ${field(T(t, "zoneMode"), html`<div class="grid grid-cols-3 gap-1.5">
          ${MODES.map(([v, k]) => html`<button data-zone-mode=${v} aria-pressed=${(draft.zoneMode || "place") === v}
            class=${`rounded-xl border py-2 text-xs font-medium transition ${(draft.zoneMode || "place") === v ? "border-primary bg-primary/10" : "border-base-300"}`}
            onClick=${() => set({ zoneMode: v })} key=${v}>${T(t, k)}</button>`)}
        </div>`)}

        ${(draft.zoneMode === "manual") ? field(T(t, "zmManual"), html`<input data-birth-offset type="text" inputmode="text" value=${draft.offset}
          placeholder="+02:00" onInput=${(e) => set({ offset: e.target.value })} class="input input-bordered rounded-2xl h-11 w-full text-sm font-mono" />`) : null}

        <!-- the one thing the user can actually check against a birth certificate -->
        <div data-birth-resolved class=${`rounded-2xl border px-3 py-2.5 ${r.ok ? "border-base-300 bg-base-200/40" : "border-base-300 bg-base-200/20"}`}>
          <div class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${T(t, "resolved")}</div>
          ${r.ok ? html`<div class="font-mono text-sm tabular-nums mt-0.5">${r.date.toISOString().replace(".000Z", "Z")}</div>
            <div class="text-[0.68rem] font-mono text-base-content/70">${T(t, "utcMark")} ${r.offsetLabel}${r.zone ? " · " + r.zone : ""}</div>`
            : html`<div class="text-sm text-base-content/70 mt-0.5">${T(t, "need_" + r.reason)}</div>`}
        </div>

        ${r.ok && r.ambiguous ? html`<div data-birth-warn class="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[0.74rem]">${T(t, "warnAmbiguous")}</div>` : null}
        ${r.ok && r.nonexistent ? html`<div data-birth-warn class="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[0.74rem]">${T(t, "warnNonexistent")}</div>` : null}

        <button data-birth-save disabled=${!complete} class="btn btn-primary rounded-2xl h-12 mt-1" onClick=${save}>${T(t, "birthSave")}</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// ── the AI reading of the transits against the chart ───────────────────────────────────────────────────

// The model interprets ONLY the structured facts below — natal placements, the angles, and the transit
// contacts with their orbs — in canonical English, so the cache signature is locale-independent.
function InterpSheet({ open, onClose, C, t, loc, dateLabel }) {
  const ref = useRef();
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);

  const name = (k) => k === "asc" ? "the Ascendant" : k === "mc" ? "the Midheaven" : (BODIES[k]?.name || k);
  const natalLine = (p) => `${name(p.key)} in ${SIGN_EN[signOf(p.lon)]} ${Math.floor(degIn(p.lon))}° (house ${houseOf(p.lon, C.H.cusps)})`;
  const hitLine = (a) => `transiting ${name(a.t)} ${a.type} natal ${name(a.n)} (orb ${a.orb.toFixed(1)}°${a.applying == null ? "" : a.applying ? ", applying" : ", separating"})`;
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const input = `Transits for ${dateEN}.\nNatal chart: ${C.natal.map(natalLine).join("; ")}; Ascendant in ${SIGN_EN[signOf(C.H.asc)]} ${Math.floor(degIn(C.H.asc))}°; Midheaven in ${SIGN_EN[signOf(C.H.mc)]} ${Math.floor(degIn(C.H.mc))}°.\nTransits: ${C.hits.length ? C.hits.map(hitLine).join("; ") + "." : "none within orb."}`;
  const sig = `${dateEN}|${Math.round(C.H.asc)}|${C.hits.map((a) => `${a.t}-${a.n}-${a.type}-${Math.round(a.orb)}`).join(",")}`;

  const run = () => { setFailed(false); warmInterpret(sig, input, loc); return setTimeout(() => setFailed(!isInterpreted(sig, loc)), 12000); };
  useEffect(() => {
    if (!open || gate || isInterpreted(sig, loc)) return;
    const timer = run();
    return () => clearTimeout(timer);
  }, [open, sig, loc]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const done = gate || isInterpreted(sig, loc);
  const text = gate ? (GATE_INTERP[loc] || GATE_INTERP.en) : interpret(sig, loc);

  return html`<dialog id="interpsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">${grip}
      <div class="flex items-center gap-2 mb-3">
        ${Icon("lucide:sparkles", "text-primary")}
        <div class="min-w-0">
          <div class="font-bold text-lg leading-tight truncate">${T(t, "interpTitle")}</div>
          <div class="text-[0.68rem] font-mono uppercase tracking-wide text-base-content/70 truncate">${dateLabel}</div>
        </div>
      </div>
      ${done
        ? html`<p data-interp-text class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>`
        : failed
          ? html`<button data-interp-retry class="btn btn-sm btn-ghost gap-2 border border-base-300 rounded-xl" onClick=${run}>${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "interpRetry")}</span></button>`
          : html`<div class="flex flex-col gap-2 text-base-content/70">${[30, 34, 28, 20].map((n, i) => html`<div class="text-[0.95rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// a uniform little planet dot (shaded + hairline) for the contact rows — the real spheres, size-scaled,
// live on the wheel. The two angles are not bodies, so they get a hollow primary ring instead.
const dot = (p) => BODIES[p]
  ? html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style=${`background:${BODIES[p].color};box-shadow:inset -0.5px -0.5px 1px rgba(0,0,0,.35),0 0 0 0.5px rgba(130,130,130,.4)`}></span>`
  : html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0 border-2 border-primary"></span>`;
