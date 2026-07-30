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
import { interpret, warmInterpret, isInterpreted, transitRead, warmTransitRead, isTransitRead,
  placementRead, warmPlacementRead, isPlacementRead, portraitRead, warmPortraitRead, isPortraitRead,
  houseRead, warmHouseRead, isHouseRead, aiTick } from "/_rt/ai-astro.js";
import { BODY, SIGN, HOUSE, ASPECT as ASPECT_MEAN, ANGLE, DIGNITY, RULERS, ELEMENT_NAME, ELEMENT_MEANS,
  MODALITY_NAME, MODALITY_MEANS, RETRO_NOTE, dignityOf, chartRuler, rulerOf, balance, say,
  groundTransit, groundPlacement, groundPortrait, groundCusp } from "/_rt/signif.js";
import { ELEMENT, MODALITY } from "/_rt/synastry.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { Sheet, Segmented } from "/_rt/ui.js";

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

// Fixed readings so the CI shot, the axe pass and the e2e assertions are deterministic and offline (live
// positions vary by run time, and the gate never reaches the network). Each is the LONGEST the prompt's
// sentence budget allows, because the string nobody measures is the one that overflows a sheet.
const GATE_INTERP = { uk: "Сатурн у квадратурі до натального Сонця робить цей період вимогливим: те, що ти будуєш, перевіряють на міцність, і поспіх лише додасть тертя. Транзитний Меркурій ретроградним рухом повертає до старої розмови, яку варто переписати, а не форсувати. Тригон Юпітера до натального Місяця дає тиху опору — рухайся послідовно, і обов'язок обернеться на структуру, а не на пастку.", en: "Saturn square your natal Sun makes this stretch exacting: what you are building is being tested for load, and pushing only adds friction. A retrograde Mercury turns you back to an old conversation worth rewriting rather than forcing. Jupiter's trine to your natal Moon lends quiet support — move step by step and the duty becomes structure, not a snare." };
const GATE_TRANSIT = { uk: "Сатурн приходить повільно і не поспішає: він перевіряє на міцність те, що ти вважаєш своїм, і квадратура означає, що поступитися доведеться в чомусь одному. Він торкається натального Сонця — самої твоєї суті й того, як ти тримаєш напрям, — і робить це в десятому домі, у справі й у публічній ролі. Орб уже менший за градус і аспект сходиться, тож це не передчуття, а те, що відбувається зараз. Сатурн проходить знак за два з половиною роки, тому мірою тут є місяці, а не дні. Через ретроградність аспект стане точним ще двічі — тема повернеться, і другого разу ти вже знатимеш її ім'я.", en: "Saturn arrives slowly and is in no hurry: it tests for load whatever you have called yours, and a square means something will have to give. It touches your natal Sun — your identity and the way you hold a direction — and it does so in the tenth house, in the work and the public role. The orb is already inside a degree and the aspect is applying, so this is not a premonition but the thing itself. Saturn spends two and a half years in a sign, so the unit here is months, not days. Because it turns retrograde the aspect perfects twice more — the theme returns, and the second time you will know its name." };
const GATE_PLACEMENT = { uk: "Місяць — це те, чим ти реагуєш раніше за думку, і в Рибах він реагує співчуттям: межа між твоїм і чужим станом тут тонка, і ти вбираєш настрій кімнати, ще не встигнувши його назвати. У пʼятому домі це виходить назовні як творення і прив'язаність — тебе живить те, що зроблено з любові й для когось конкретного. Сила цього положення в уяві та відгуку, ціна — у дрейфі й у чужому смутку, взятому за власний. Навчитися розрізняти, чиє це почуття, тут важливіше, ніж навчитися його стримувати.", en: "The Moon is what reacts in you before thought does, and in Pisces it reacts with sympathy: the line between your state and someone else's is thin here, and you absorb the mood of a room before you can name it. In the fifth house that comes out as making things and as attachment — you are fed by what is made out of love and for someone in particular. The gift of this placement is imagination and responsiveness; the cost is drift, and other people's sadness carried as your own. Learning whose feeling it is matters more here than learning to hold it in." };
const GATE_HOUSE = { uk: "Другий дім — це те, що ти вважаєш своїм: гроші, речі, здатність заробити і власне відчуття вартості. Стрілець на куспіді додає сюди широти й віри в те, що вистачить, — ти радше ризикнеш і доробиш, ніж будеш рахувати наперед. Управитель цього дому Юпітер стоїть у восьмому, а це означає, що твої ресурси майже завжди переплетені з чужими: спільні бюджети, борги, спадок, домовленості на довіру. Планет у самому домі немає, і в традиції це не порожнеча — просто справи цього дому робляться там, де стоїть його управитель. Тож питання не в тому, скільки в тебе є, а з ким це «є» пов’язане.", en: "The second house is what you count as yours: money, possessions, the ability to earn, and your own sense of worth. Sagittarius on the cusp brings width and a working faith that there will be enough — you would rather take the risk and make it up afterwards than count in advance. Jupiter rules this house and stands in the eighth, which means your resources are almost always tangled with someone else’s: shared budgets, debts, inheritance, arrangements held together by trust. No planet stands in the house itself, and in the tradition that is not emptiness — the affairs of the house are simply carried out where its ruler sits. So the question is less how much you have than whose it is bound up with." };
const GATE_PORTRAIT = { uk: "Сонце в Раку при Асценденті в Терезах дає поєднання обережного серця і привітної поверхні: ти зустрічаєш світ рівно й тактовно, а вирішуєш усе всередині, за зачиненими дверима. Місяць у Рибах поглиблює це — реакція йде раніше за слова, і вона майже завжди про когось іншого. \n\nУправителька карти Венера стоїть у восьмому домі, тож те, що для тебе справді важить, ніколи не лежить на видноті: близькість тут вимірюється мірою довіри, а не кількістю часу. У карті переважає вода при браку вогню, і це означає, що почати щось тобі важче, ніж витримати. Кардинальна якість дає поштовх, але поштовх цей іде від обставин, а не від нетерпіння. \n\nНайщільніший аспект — тригон Сонця до Місяця: воля і почуття тут не воюють, і саме тому ти рідко помічаєш, наскільки на них спираєшся. Сатурн у десятому домі додає до цього обовʼязок, який ти сам собі виписав. Разом це карта людини, яку легко недооцінити ззовні й важко зрушити зсередини.", en: "A Cancer Sun under a Libra Ascendant sets a careful heart behind an agreeable surface: you meet the world evenly and tactfully, and decide everything inside, behind a closed door. The Moon in Pisces deepens that — the reaction comes before the words, and it is almost always about someone else. \n\nVenus, ruler of the chart, stands in the eighth house, so what actually matters to you is never left in plain view: closeness here is measured in trust rather than in hours. Water dominates the chart and fire is thin, which means starting a thing costs you more than enduring it. The cardinal emphasis does supply a push, but the push comes from circumstance rather than impatience. \n\nThe tightest aspect is the Sun trine the Moon: will and feeling are not at war here, which is exactly why you rarely notice how much you lean on them. Saturn in the tenth adds a duty you wrote for yourself. Together this is the chart of someone easy to underestimate from outside and hard to move from within." };

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
  <div class="rounded-full sf-raised sf-e3 p-4 text-base-content/70">${Icon("lucide:calendar-clock", "text-3xl")}</div>
  <div class="text-base font-semibold max-w-[22rem]">${T(t, "needBirth")}</div>
  <button data-open-birth class="btn btn-primary rounded-full gap-2" onClick=${onOpen}>
    ${Icon("lucide:plus", "text-base")}<span>${T(t, "birthSet")}</span>
  </button>
</div>`;

// ── the reading sheets: facts first, tradition second, AI third ────────────────────────────────────────
//
// Three surfaces (one contact · one placement · the whole chart) that share one shape, and the order of
// that shape is the whole argument. A reading is only worth anything if it is TRUE, and a language model is
// the least reliable thing in this app — so the two layers below the prose come from local data and are
// always there:
//
//   the READING   — the model's synthesis. It can fail, and when it does the sheet is still complete.
//   the FACTS     — what the ephemeris and the trigonometry computed, quoted at the precision they earn.
//   the MEANINGS  — the sourced significations corpus (/_rt/signif.js), the same entries the model was
//                   handed. Anyone can compare the paragraph against them, which is the point.
//
// The model gets exactly the third layer plus the second, and is told to add nothing (see the astro prompts
// in the edge's ai-prompts.js). Its job here is connective prose in the reader's language, not knowledge.

// `S.screen` is one string and it is history-backed by the runtime, so a sub-screen that has to remember
// WHICH item it is showing carries the item in its own key. These prefixes are also what `?screen=` accepts,
// which is how the reading sheets can be shot and reviewed at all (render.js).
const READ_TRANSIT = "tr:", READ_PLACEMENT = "pl:", READ_CUSP = "cu:", READ_PORTRAIT = "portrait";
const readScreen = (screen, pfx) => (typeof screen === "string" && screen.startsWith(pfx)) ? screen.slice(pfx.length) : null;

const AI_SKY = { get: interpret, has: isInterpreted, warm: warmInterpret };
const AI_TRANSIT = { get: transitRead, has: isTransitRead, warm: warmTransitRead };
const AI_PLACEMENT = { get: placementRead, has: isPlacementRead, warm: warmPlacementRead };
const AI_PORTRAIT = { get: portraitRead, has: isPortraitRead, warm: warmPortraitRead };
const AI_HOUSE = { get: houseRead, has: isHouseRead, warm: warmHouseRead };

// The AI paragraph. Never a spinner — the sheet is already there and only this block is pending, so it
// carries text-shaped skeletons at the length the answer will actually be. 12 s then a retry, fail-open.
// `wait` holds the request back while a fact it depends on is still being computed. It matters more than it
// looks: the exact-hit dates are part of BOTH the grounding block and its cache signature, so warming before
// they land would spend one request on a reading of an incomplete chart and a second on the real one — and
// cache both under different keys forever.
function Reading({ sig, input, loc, api, gateText, lines, t, wait = false }) {
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const run = () => { setFailed(false); api.warm(sig, input, loc); return setTimeout(() => setFailed(!api.has(sig, loc)), 12000); };
  useEffect(() => {
    if (wait || gate || api.has(sig, loc)) return;
    const timer = run();
    return () => clearTimeout(timer);
  }, [sig, loc, wait]);
  const done = !wait && (gate || api.has(sig, loc));
  const text = gate ? gateText : api.get(sig, loc);
  if (done) return html`<p data-reading class="text-[0.95rem] leading-relaxed text-base-content/90 whitespace-pre-line">${text}</p>`;
  if (failed && !wait) {
    return html`<button data-reading-retry class="btn btn-sm gap-2 rounded-xl" onClick=${run}>
      ${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "interpRetry")}</span></button>`;
  }
  return html`<div class="flex flex-col gap-2 text-base-content/70">${lines.map((n, i) => html`<div class="text-[0.95rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`;
}

const Section = (label, body) => html`<div class="flex flex-col gap-1.5">
  <div class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${label}</div>
  ${body}
</div>`;

// A computed fact: a mono label and the number or word it names. Nothing here came from a model.
const Fact = (label, value, key) => html`<div data-fact=${key || null} class="flex items-baseline gap-3 py-1.5 border-b border-base-300/40 last:border-0">
  <span class="text-[0.62rem] font-mono uppercase tracking-[0.08em] text-base-content/70 w-[5.5rem] shrink-0">${label}</span>
  <span class="text-[0.84rem] min-w-0 flex-1">${value}</span>
</div>`;

// One corpus entry, attributed to the piece of the chart it belongs to — so the paragraph above can be
// checked against it rather than taken on trust.
const Mean = (src, text) => html`<div data-mean class="py-1.5 border-b border-base-300/40 last:border-0">
  <div class="text-[0.58rem] font-mono uppercase tracking-[0.1em] text-primary/80">${src}</div>
  <div class="text-[0.84rem] leading-snug text-base-content/90">${text}</div>
</div>`;

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signName = (t, i) => T(t, "s" + i);
const digKey = (d) => "dig" + cap1(d);

// An exact hit, quoted only as finely as the body's speed honestly allows: the Moon to the second, Saturn to
// the minute, Pluto to the day (RESEARCH.md §5). Module-level because the Timing tab and the transit sheet
// must never disagree about how precise a date is allowed to look.
function fmtHitAt(ms, prec, locale) {
  const loc = locale === "en" ? "en-GB" : locale || "uk";
  const d = new Date(ms);
  const date = d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  if (prec === "day") return date;
  const time = d.toLocaleTimeString(loc, prec === "second"
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// ── the per-transit sheet ──────────────────────────────────────────────────────────────────────────────

function TransitSheet({ open, onClose, C, t, loc, dateLabel }) {
  const a = (open && C.ready) ? C.hits.find((x) => hitKey(x) === open) : null;
  // The sheet solves its OWN contact rather than being handed the Timing tab's table: one contact is ~57 ms
  // at worst (RESEARCH.md §6), so it is affordable anywhere, and it means the wheel tab's contact rows open
  // the same sheet without the wheel paying for twenty root-finds it never shows.
  const [times, setTimes] = useState(null);
  const akey = a ? hitKey(a) : "", whenMs = C.when.getTime();
  useEffect(() => {
    if (!a) { setTimes(null); return; }
    let dead = false;
    const id = setTimeout(() => { if (!dead) setTimes(hitTimes(a.t, a.natalLon, a.signedAngle, whenMs)); }, 0);
    return () => { dead = true; clearTimeout(id); };
  }, [akey, whenMs]);
  if (!a) return null;
  const tp = C.sky.find((p) => p.key === a.t);
  const retro = C.retro(a.t, tp.lon);
  const house = ANGLE[a.n] ? null : houseOf(a.natalLon, C.H.cusps);
  const prec = HIT_PRECISION[a.t] || "minute";
  const fmt = (ms) => fmtHitAt(ms, prec, loc);
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const hitList = times || [];
  const { text: input, sig } = groundTransit({ c: a, transitLon: tp.lon, natalHouse: house,
    houseSystem: C.system, retro, dateEN, hits: hitList.map((ms) => ({ ms, label: new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) })) });

  const title = `${bodyLabel(t, a.t)} ${T(t, ASPECT_KEY[a.type])} ${T(t, "natalMark")} ${bodyLabel(t, a.n)}`;
  const nb = BODY[a.n], na = ANGLE[a.n];
  return html`<${Sheet} id="transitsheet" open=${true} onClose=${onClose} title=${title} subtitle=${dateLabel} icon="lucide:sparkles">
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_TRANSIT} t=${t} wait=${times === null}
        gateText=${GATE_TRANSIT[loc] || GATE_TRANSIT.en} lines=${[32, 34, 30, 33, 22]} />

      ${Section(T(t, "factsTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Fact(T(t, "fOrb"), html`<span class=${`tabular-nums font-mono ${a.exact ? "text-primary font-semibold" : ""}`}>${a.orb.toFixed(2)}°</span>
          <span class="text-base-content/70"> · ${T(t, a.exact ? "fExact" : "fInRange")}</span>
          ${a.applying != null ? html`<span class="text-base-content/70"> · ${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}`, "orb")}
        ${Fact(T(t, "fTransiting"), html`${signName(t, signOf(tp.lon))} ${dm(tp.lon)}${retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}`)}
        ${Fact(T(t, "fNatal"), html`${signName(t, signOf(a.natalLon))} ${dm(a.natalLon)}${house ? html`<span class="text-base-content/70"> · ${T(t, "houseShort")}${house} (${T(t, "hs" + cap1(C.system))})</span>` : null}`)}
        ${hitList.length ? Fact(T(t, "fPerfects"), html`<span class="font-mono tabular-nums text-[0.78rem]">${hitList.map(fmt).join(" · ")}</span>
          ${hitList.length > 1 ? html`<span class="text-base-content/70"> · ${T(t, "passes")} ${hitList.length}</span>` : null}`, "perfects")
          : times === null ? Fact(T(t, "fPerfects"), html`<span class="font-mono text-[0.78rem] text-base-content/70"><${Scramble} len=${18} /></span>`, "perfects")
          : Fact(T(t, "fPerfects"), html`<span class="text-base-content/70">${T(t, "noExactHit")}</span>`, "perfects")}
        ${Fact(T(t, "fTempo"), say(BODY[a.t].tempo, loc), "tempo")}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Mean(`${bodyLabel(t, a.t)} · ${T(t, "mMoving")}`, `${cap1(say(BODY[a.t].role, loc))}. ${cap1(say(BODY[a.t].act, loc))}.`)}
        ${Mean(T(t, ASPECT_KEY[a.type]), cap1(say(ASPECT_MEAN[a.type], loc)))}
        ${Mean(`${bodyLabel(t, a.n)} · ${T(t, "mTouched")}`, na ? cap1(say(na.topic, loc)) : cap1(say(nb.role, loc)))}
        ${house ? Mean(`${T(t, "houseShort")}${house} · ${T(t, "mField")}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`) : null}
        ${Mean(T(t, "mStrain"), cap1(say(BODY[a.t].strain, loc)))}
        ${retro ? Mean("℞", cap1(say(RETRO_NOTE, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

// ── the per-placement sheet ────────────────────────────────────────────────────────────────────────────

function PlacementSheet({ open, onClose, C, t, loc }) {
  if (!open || !C.ready) return null;
  const key = open;
  const na = ANGLE[key];
  const lon = na ? (key === "asc" ? C.H.asc : key === "mc" ? C.H.mc : C.H.vertex) : (C.natal.find((p) => p.key === key) || {}).lon;
  if (lon == null) return null;
  const s = signOf(lon);
  const house = na ? null : houseOf(lon, C.H.cusps);
  const retro = na ? false : C.natalRetroFor(key, lon);
  const dig = na ? null : dignityOf(key, s);
  const { text: input, sig } = groundPlacement({ key, lon, house, houseSystem: C.system, retro });
  const rulers = RULERS[s];

  return html`<${Sheet} id="placementsheet" open=${true} onClose=${onClose} icon="lucide:sparkles"
      title=${`${bodyLabel(t, key)} ${T(t, "sl" + s)}`}
      subtitle=${house ? `${dm(lon)} · ${T(t, "houseShort")}${house}` : dm(lon)}>
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_PLACEMENT} t=${t}
        gateText=${GATE_PLACEMENT[loc] || GATE_PLACEMENT.en} lines=${[31, 33, 29, 24]} />

      ${Section(T(t, "factsTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Fact(T(t, "fSign"), html`${signName(t, s)} ${dm(lon)}${retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}`)}
        ${house ? Fact(T(t, "fHouse"), `${T(t, "houseShort")}${house} · ${T(t, "hs" + cap1(C.system))}`, "house") : null}
        ${Fact(T(t, "fElement"), `${cap1(say(ELEMENT_NAME[ELEMENT(s)], loc))} · ${cap1(say(MODALITY_NAME[MODALITY(s)], loc))}`)}
        ${Fact(T(t, "fRuler"), html`${bodyLabel(t, rulers[0])}${rulers[1] ? html`<span class="text-base-content/70"> · ${bodyLabel(t, rulers[1])} (${T(t, "mModern")})</span>` : null}`)}
        ${dig ? Fact(T(t, "fDignity"), html`<span class=${dig === "none" ? "text-base-content/70" : "text-primary font-medium"}>${T(t, digKey(dig))}</span>`, "dignity") : null}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Mean(`${bodyLabel(t, key)} · ${T(t, "mWhat")}`, na ? html`${cap1(say(na.topic, loc))}. <span class="text-base-content/70">${cap1(say(na.axis, loc))}.</span>` : cap1(say(BODY[key].role, loc)))}
        ${Mean(`${signName(t, s)} · ${T(t, "mHow")}`, `${cap1(say(SIGN[s].mode, loc))}. ${cap1(say(SIGN[s].gift, loc))} — ${say(SIGN[s].excess, loc)}.`)}
        ${house ? Mean(`${T(t, "houseShort")}${house} · ${T(t, "mWhere")}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`) : null}
        ${Mean(`${cap1(say(ELEMENT_NAME[ELEMENT(s)], loc))} · ${say(MODALITY_NAME[MODALITY(s)], loc)}`, `${cap1(say(ELEMENT_MEANS[ELEMENT(s)], loc))}. ${cap1(say(MODALITY_MEANS[MODALITY(s)], loc))}.`)}
        ${dig && dig !== "none" ? Mean(T(t, digKey(dig)), cap1(say(DIGNITY[dig], loc))) : null}
        ${retro ? Mean("℞", cap1(say(RETRO_NOTE, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

// ── the per-house sheet, opened from a cusp ────────────────────────────────────────────────────────────

// The reading with the most technique in it. A cusp row shows a number, a glyph and a degree; what it
// cannot show is that the house is DELEGATED to the ruler of the sign on it, and that the ruler lives
// somewhere else in the chart. That sentence is the whole reason this sheet exists.
function CuspSheet({ open, onClose, C, t, loc }) {
  if (open == null || !C.ready) return null;
  const house = Number(open);
  if (!(house >= 1 && house <= 12)) return null;
  const cuspLon = C.H.cusps[house - 1];
  const s = signOf(cuspLon);
  const r = rulerOf(cuspLon);
  const co = RULERS[s][1] || null;
  const rp = C.natal.find((p) => p.key === r.body);
  const ruler = rp ? { key: r.body, lon: rp.lon, house: houseOf(rp.lon, C.H.cusps), retro: C.natalRetroFor(r.body, rp.lon) } : null;
  const tenants = C.natal.filter((p) => houseOf(p.lon, C.H.cusps) === house)
    .map((p) => ({ key: p.key, lon: p.lon, retro: C.natalRetroFor(p.key, p.lon) }));
  const { text: input, sig } = groundCusp({ house, cuspLon, houseSystem: C.system, ruler, coRuler: co, tenants });
  const rDig = ruler ? dignityOf(ruler.key, signOf(ruler.lon)) : null;

  return html`<${Sheet} id="cuspsheet" open=${true} onClose=${onClose} icon="lucide:sparkles"
      title=${`${T(t, "houseWord")} ${house}`} subtitle=${`${signName(t, s)} ${dm(cuspLon)}`}>
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_HOUSE} t=${t}
        gateText=${GATE_HOUSE[loc] || GATE_HOUSE.en} lines=${[32, 30, 33, 29, 21]} />

      ${Section(T(t, "factsTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Fact(T(t, "fCusp"), `${signName(t, s)} ${dm(cuspLon)} · ${T(t, "hs" + cap1(C.system))}`, "cusp")}
        ${ruler ? Fact(T(t, "fHouseRuler"), html`<span data-cusp-ruler>${bodyLabel(t, ruler.key)}</span>
          <span class="text-base-content/70"> · ${signName(t, signOf(ruler.lon))} · ${T(t, "houseShort")}${ruler.house}</span>
          ${ruler.retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}
          ${rDig && rDig !== "none" ? html`<span class="text-primary"> · ${T(t, digKey(rDig))}</span>` : null}`, "houseRuler") : null}
        ${co ? Fact(T(t, "mModern"), bodyLabel(t, co)) : null}
        ${Fact(T(t, "fTenants"), tenants.length
          ? html`${tenants.map((p) => bodyLabel(t, p.key)).join(" · ")}`
          : html`<span class="text-base-content/70">${T(t, "fNoTenants")}</span>`, "tenants")}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Mean(`${T(t, "houseWord")} ${house}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`)}
        ${Mean(`${signName(t, s)} · ${T(t, "mHow")}`, `${cap1(say(SIGN[s].mode, loc))} ${cap1(say(SIGN[s].gift, loc))} — ${say(SIGN[s].excess, loc)}.`)}
        ${ruler ? Mean(`${bodyLabel(t, ruler.key)} · ${T(t, "mRules")}`, cap1(say(BODY[ruler.key].role, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

// ── the whole-chart portrait ───────────────────────────────────────────────────────────────────────────

function PortraitSheet({ open, onClose, C, t, loc }) {
  if (!open || !C.ready) return null;
  const points = C.natal.map((p) => ({ key: p.key, lon: p.lon, house: houseOf(p.lon, C.H.cusps), retro: C.natalRetroFor(p.key, p.lon) }));
  const { text: input, sig } = groundPortrait({ points, asc: C.H.asc, mc: C.H.mc, houseSystem: C.system });
  const bal = balance(points.map((p) => p.lon));
  const ruler = chartRuler(C.H.asc);
  const rulerPt = points.find((p) => p.key === ruler.body);
  const co = RULERS[ruler.sign][1];
  // Two tallies as bars rather than numbers in a row: the SHAPE of a chart's balance is the thing being
  // read, and four counts side by side make it legible at a glance where "fire 0, earth 2…" does not.
  const bars = (counts, names) => html`<div class="flex gap-1.5">
    ${counts.map((n, i) => html`<div class="flex-1 flex flex-col items-center gap-1" key=${i}>
      <div class="w-full h-1.5 rounded-full sf-inset overflow-hidden"><div class="h-full rounded-full bg-primary/70" style=${`width:${points.length ? Math.round(n / points.length * 100) : 0}%`}></div></div>
      <div class="text-[0.58rem] font-mono uppercase text-base-content/70 truncate w-full text-center">${say(names[i], loc)}</div>
      <div class="text-[0.7rem] font-mono tabular-nums">${n}</div>
    </div>`)}
  </div>`;

  return html`<${Sheet} id="portraitsheet" open=${true} onClose=${onClose} title=${T(t, "portraitTitle")}
      subtitle=${`${placeLabel(C.b.place)} · ${C.rec.date}`} icon="lucide:sparkles">
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_PORTRAIT} t=${t}
        gateText=${GATE_PORTRAIT[loc] || GATE_PORTRAIT.en} lines=${[33, 31, 34, 30, 32, 33, 28, 26]} />

      ${Section(T(t, "factsTitle"), html`<div class="rounded-2xl sf-inset px-3 py-1">
        ${Fact(T(t, "angAsc"), `${signName(t, signOf(C.H.asc))} ${dm(C.H.asc)}`)}
        ${Fact(T(t, "angMc"), `${signName(t, signOf(C.H.mc))} ${dm(C.H.mc)}`)}
        ${Fact(T(t, "fChartRuler"), html`<span data-chart-ruler>${bodyLabel(t, ruler.body)}</span>${rulerPt ? html`<span class="text-base-content/70"> · ${signName(t, signOf(rulerPt.lon))} · ${T(t, "houseShort")}${rulerPt.house}</span>` : null}
          ${co ? html`<span class="text-base-content/70"> · ${bodyLabel(t, co)} (${T(t, "mModern")})</span>` : null}`, "ruler")}
        ${Fact(T(t, "fHouses"), T(t, "hs" + cap1(C.system)))}
      </div>`)}

      ${Section(T(t, "fBalance"), html`<div class="rounded-2xl sf-inset px-3 py-3 flex flex-col gap-3">
        ${bars(bal.elements, ELEMENT_NAME)}
        ${bars(bal.modalities, MODALITY_NAME)}
      </div>`)}
    </div>
  </${Sheet}>`;
}

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
      <!-- the page extruded, pressed IN under a finger — the material's own press, so no scale nudge on top -->
      <button data-birth-row class="w-full max-w-[420px] rounded-2xl sf-raised sf-e2 sf-press px-4 py-3 flex items-center gap-3 text-left transition" onClick=${() => openScreen("birth")}>
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
        ${/* The five-column geometry is untouched; only what the chips are MADE of changed. An unchosen
             preset is an empty slot in the row (`sf-inset`) and the chosen one lifts out of it on the
             shallow rung, keeping the primary tint as its FILL. The pair of hairlines it replaces
             (border-primary vs border-base-300) was a colour step standing in for depth. */""}
        <div class="grid grid-cols-5 gap-1.5 text-center">
          ${CHIPS.map(([o, lbl]) => html`<button data-chip=${lbl} aria-pressed=${offset === o} class=${`rounded-xl py-1.5 text-xs font-medium transition ${offset === o ? "sf-e2 bg-primary/10 text-primary font-semibold" : "sf-inset"}`} onClick=${() => $offset.set(o)} key=${lbl}>${T(t, lbl)}</button>`)}
        </div>
      </div>

      <!-- the contacts themselves, tightest first; the header opens the grounded AI reading -->
      <div class="w-full max-w-[420px] rounded-2xl sf-raised overflow-hidden">
        <div class="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "contactsTitle")}</div>
          <button data-interp class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen("interp")}>
            ${Icon("lucide:sparkles", "text-base")}<span class="text-xs font-semibold">${T(t, "interpBtn")}</span>
          </button>
        </div>
        <div class="px-4 pb-2">
          ${hits.length ? hits.map((a, i) => html`<${ContactRow} a=${a} t=${t} retro=${C.retro(a.t, sky.find((p) => p.key === a.t).lon)}
            onOpen=${() => openScreen(READ_TRANSIT + hitKey(a))} key=${i} />`)
            : html`<div class="py-2 text-sm text-base-content/70">${T(t, "noContacts")}</div>`}
        </div>
      </div>
    </div>

    <${InterpSheet} open=${screen === "interp"} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${fmtDate(C.when)} />
    <${TransitSheet} open=${readScreen(screen, READ_TRANSIT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${fmtDate(C.when)} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

// one transit→natal contact: transiting body · aspect · natal point · applying/separating · orb
// Exact vs merely in-range is carried by the ORB's colour, never by dimming the row. `opacity-70` over
// `text-base-content/70` is 49% effective and axe failed 39 elements on it in the light theme — the exact
// trap the design rules warn about. State reads through colour = meaning; contrast stays full strength.
function ContactRow({ a, t, retro, onOpen }) {
  return html`<button data-contact onClick=${onOpen} class="w-full text-left flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0 active:opacity-80 transition">
    ${dot(a.t)}
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.t)}${retro ? html`<span class="text-warning font-mono ml-0.5" title=${T(t, "retro")}>℞</span>` : null}</span>
    <span class="text-xs font-medium shrink-0" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
    <span class="text-base-content/70 shrink-0 text-xs">${T(t, "natalMark")}</span>
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.n)}</span>
    <div class="ml-auto flex items-center gap-1.5 shrink-0">
      ${a.applying != null ? html`<span class=${`text-[0.6rem] font-medium ${a.applying ? "text-primary" : "text-base-content/70"}`}>${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}
      <span class=${`tabular-nums text-xs w-9 text-right ${a.exact ? "text-primary font-semibold" : "text-base-content/70"}`}>${a.orb.toFixed(1)}°</span>
      ${Icon("lucide:sparkles", "text-sm text-primary")}
    </div>
  </button>`;
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

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      ${C.hits.length ? C.hits.map((a, i) => {
        const times = solved[hitKey(a)];
        const prec = HIT_PRECISION[a.t] || "minute";
        const nearest = times && times.length ? times.reduce((best, x) => Math.abs(x - C.when) < Math.abs(best - C.when) ? x : best) : null;
        // A card in a long list gets the SHALLOW rung: twenty contacts each casting the full 5px pair is a
        // stack of plates rather than a list. The whole card is the tap target and the sparkle is its
        // trailing affordance — one target that says what it opens, rather than a chevron plus a second
        // little AI button competing for the same 20 rows.
        return html`<button data-hit data-hit-key=${hitKey(a)} onClick=${() => openScreen(READ_TRANSIT + hitKey(a))}
          class="w-full text-left rounded-2xl sf-raised sf-e2 sf-press px-4 py-3 flex flex-col gap-2 transition" key=${i}>
        <div class="flex items-center gap-2">
          ${dot(a.t)}
          <span class="font-semibold truncate">${bodyLabel(t, a.t)}</span>
          <span class="text-xs font-semibold truncate" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
          <span class="text-base-content/70 shrink-0 text-xs">${T(t, "natalMark")}</span>
          <span class="font-semibold truncate">${bodyLabel(t, a.n)}</span>
          <span class="ml-auto tabular-nums text-xs text-base-content/70 shrink-0">${a.orb.toFixed(2)}°</span>
          ${Icon("lucide:sparkles", "text-base text-primary shrink-0")}
        </div>
        ${times === undefined
          ? html`<div class="text-[0.8rem] text-base-content/70 font-mono"><${Scramble} len=${22} /></div>`
          : times.length ? html`<div class="flex flex-col gap-1 w-full">
            ${times.map((ms, j) => html`<div class=${`flex items-center gap-2 text-[0.8rem] ${ms === nearest ? "" : "text-base-content/70"}`} key=${j}>
              ${Icon(ms === nearest ? "lucide:crosshair" : "lucide:dot", `text-sm shrink-0 ${ms === nearest ? "text-primary" : ""}`)}
              <span data-hit-time class="font-mono tabular-nums">${fmtHitAt(ms, prec, locale)}</span>
              ${times.length > 1 && j === 0 ? html`<span class="ml-auto text-[0.6rem] font-mono uppercase text-base-content/70 shrink-0">${T(t, "passes")} ${times.length}</span>` : null}
            </div>`)}
          </div>` : html`<div class="text-[0.8rem] text-base-content/70">${T(t, "noExactHit")}</div>`}
      </button>`;
      }) : html`<div class="rounded-2xl sf-raised px-4 py-6 text-sm text-base-content/70 text-center">${T(t, "noContacts")}</div>`}
    </div>
    <${TransitSheet} open=${readScreen(screen, READ_TRANSIT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${C.when.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })} />
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

  // Every row in this tab opens its own reading, and the sparkle is the row's trailing affordance rather
  // than a separate little button per row: thirteen rows with two targets each is a control panel, not a
  // chart. `data-angle-row` keeps its i18n-key value because the gate already addresses it by that name.
  const open = (key) => openScreen(READ_PLACEMENT + key);
  // Owner's call: every row carries its own reading mark. Re-adding the icon to the row as it stood put
  // "Близнюки" and "Скорпіон" back into ellipsis, so the row was re-measured rather than just re-decorated.
  // Where the ~34px came from, and none of it is data:
  //   • ℞ loses its own 16px column + 8px gap and rides in the house cell, which is where it was always
  //     read from anyway (and it is what ContactRow already does with the transiting body);
  //   • the two TEXT columns both flex instead of the name being pinned at a fixed 80px — the name and the
  //     sign share the slack, so neither is starved by a long word in the other;
  //   • gaps 8 → 6px across six columns, and the degrees column loses the 4px it never used.
  // Fixed cost is now glyph 20 + degrees 46 + house/℞ 44 + mark 14 + gaps 30 = 154, leaving ~166 for the two
  // names at the reference width. Verified by shooting it, not by arithmetic alone.
  const mark = () => Icon("lucide:sparkles", "text-xs text-primary shrink-0 w-3.5");
  const ROW = "w-full text-left flex items-center gap-1.5 py-1.5 border-b border-base-300/40 last:border-0 active:opacity-80 transition";
  const angleRow = (key, lbl, lon) => html`<button data-angle-row=${lbl} data-place=${key} onClick=${() => open(key)} class=${ROW} key=${key}>
    <div class="flex-[1.1] min-w-0 font-medium truncate text-primary">${T(t, lbl)}</div>
    <div class="w-5 flex justify-center text-base-content/70 shrink-0"><${Sign} i=${signOf(lon)} cls="w-5 h-5" /></div>
    <div class="flex-1 min-w-0 truncate">${T(t, "s" + signOf(lon))}</div>
    <div class="tabular-nums text-base-content/70 w-[2.9rem] text-right font-mono text-xs shrink-0">${dm(lon)}</div>
    <div class="w-[2.75rem] shrink-0"></div>
    ${mark()}
  </button>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      <button data-birth-row class="rounded-2xl sf-raised sf-e2 sf-press px-4 py-3 flex items-center gap-3 text-left transition" onClick=${() => openScreen("birth")}>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">${placeLabel(b.place)}</div>
          <div class="text-[0.68rem] font-mono text-base-content/70 truncate">${b.date.toISOString().replace(".000Z", "Z")} · ${T(t, "utcMark")} ${b.offsetLabel}</div>
        </div>
        ${Icon("lucide:pencil", "text-base text-base-content/70")}
      </button>

      <div class="rounded-2xl sf-raised overflow-x-auto">
        <div class="min-w-[300px] px-4 py-1.5">
          <div class="flex items-center justify-between gap-2 py-1.5">
            <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "natalTitle")}</div>
            <button data-portrait class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen(READ_PORTRAIT)}>
              ${Icon("lucide:sparkles", "text-base")}<span class="text-xs font-semibold">${T(t, "portraitBtn")}</span>
            </button>
          </div>
          ${angleRow("asc", "angAsc", H.asc)}${angleRow("mc", "angMc", H.mc)}${angleRow("vertex", "angVertex", H.vertex)}
          ${rows.map((p) => {
            const s = signOf(p.lon), hs = houseOf(p.lon, H.cusps), r = C.natalRetroFor(p.key, p.lon);
            return html`<button data-row=${p.key} data-place=${p.key} onClick=${() => open(p.key)} class=${ROW} key=${p.key}>
              <div class="flex-[1.1] min-w-0 font-medium truncate">${bodyLabel(t, p.key)}</div>
              <div class="w-5 flex justify-center text-base-content/70 shrink-0"><${Sign} i=${s} cls="w-5 h-5" /></div>
              <div class="flex-1 min-w-0 truncate">${T(t, "s" + s)}</div>
              <div class="tabular-nums text-base-content/70 w-[2.9rem] text-right font-mono text-xs shrink-0">${dm(p.lon)}</div>
              <div class="w-[2.75rem] text-right tabular-nums text-xs text-base-content/70 shrink-0">${T(t, "houseShort")}${hs}${r ? html`<span class="text-warning font-mono ml-0.5" title=${T(t, "retro")}>℞</span>` : null}</div>
              ${mark()}
            </button>`;
          })}
        </div>
      </div>

      <div class="rounded-2xl sf-raised overflow-hidden">
        <div class="px-4 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "cuspsTitle")}</div>
          <span data-house-system class="text-[0.6rem] font-mono uppercase text-base-content/70">${T(t, "hs" + C.system[0].toUpperCase() + C.system.slice(1))}</span>
        </div>
        ${H.fallback ? html`<div data-house-fallback class="mx-4 mb-2 rounded-xl sf-e2 bg-warning/10 px-3 py-2 text-[0.72rem] text-base-content">${T(t, "hsFallback")}</div>` : null}
        <div class="px-4 pb-3 grid grid-cols-2 gap-x-4">
          ${H.cusps.map((c, i) => html`<button data-cusp=${i + 1} onClick=${() => openScreen(READ_CUSP + (i + 1))}
              class="w-full text-left flex items-center gap-1.5 py-1 border-b border-base-300/40 last:border-0 active:opacity-80 transition" key=${i}>
            <span class="w-4 text-xs font-mono text-base-content/70 tabular-nums">${i + 1}</span>
            <${Sign} i=${signOf(c)} cls="w-4 h-4 text-base-content/70 shrink-0" />
            <span class="ml-auto font-mono text-xs tabular-nums">${dm(c)}</span>
            ${mark()}
          </button>`)}
        </div>
      </div>
    </div>
    <${PlacementSheet} open=${readScreen(screen, READ_PLACEMENT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${CuspSheet} open=${readScreen(screen, READ_CUSP)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${PortraitSheet} open=${screen === READ_PORTRAIT} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

// ── the birth-data sheet ───────────────────────────────────────────────────────────────────────────────

// Everything a chart needs, and nothing it does not. The resolved instant is echoed back live, because the
// one thing the user can actually verify is "does that UTC moment match my birth certificate?". The two
// time-zone traps (an hour that ran twice, an hour that never ran) are shown rather than silently resolved.
function BirthSheet({ open, onClose, t, locale }) {
  const stored = useStore($birth);
  const [draft, setDraft] = useState(stored || EMPTY);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
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
  const save = () => { if (complete) { $birth.set(draft); onClose(); } };

  const field = (label, node) => html`<label class="flex flex-col gap-1 min-w-0">
    <span class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${label}</span>
    ${node}
  </label>`;
  const MODES = [["place", "zmPlace"], ["lmt", "zmLmt"], ["manual", "zmManual"]];

  return html`<${Sheet} id="birthsheet" open=${open} onClose=${onClose} title=${T(t, "birthTitle")} icon="lucide:calendar-clock">
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
        ${results && !searching ? (results.length ? html`<div class="flex flex-col rounded-2xl sf-raised sf-e2 overflow-hidden">
          ${results.map((p) => html`<button data-place-hit class="px-3 py-2.5 text-left border-b border-base-300/50 last:border-0 active:bg-primary/10 transition" onClick=${() => { set({ place: p }); setQ(""); setResults(null); }} key=${p.id}>
            <div class="text-sm font-medium truncate">${placeLabel(p)}</div>
            <div class="text-[0.66rem] font-mono text-base-content/70 truncate">${formatCoords(p.lat, p.lng)} · ${p.zone}</div>
          </button>`)}
        </div>` : html`<div class="text-sm text-base-content/70 px-1">${T(t, "placeNone")}</div>`) : null}

        ${/* Two readouts, and both used to be `border-base-300 bg-base-200/NN` — a tone step that the repaint
             turned into nothing at all, since base-200 and base-100 are now the same colour. A value the app
             hands BACK to you sits IN the sheet, so both are wells. */""}
        ${draft.place ? html`<div data-birth-chosen class="rounded-2xl sf-inset px-3 py-2">
          <div class="text-sm font-medium truncate">${placeLabel(draft.place)}</div>
          <div class="text-[0.66rem] font-mono text-base-content/70 truncate">${formatCoords(draft.place.lat, draft.place.lng)} · ${draft.place.zone}</div>
        </div>` : null}

        ${field(T(t, "zoneMode"), html`<${Segmented} attr="data-zone-mode" size="sm" label=${T(t, "zoneMode")}
          items=${MODES.map(([v, k]) => ({ id: v, label: T(t, k) }))}
          value=${draft.zoneMode || "place"} onChange=${(v) => set({ zoneMode: v })} />`)}

        ${(draft.zoneMode === "manual") ? field(T(t, "zmManual"), html`<input data-birth-offset type="text" inputmode="text" value=${draft.offset}
          placeholder="+02:00" onInput=${(e) => set({ offset: e.target.value })} class="input input-bordered rounded-2xl h-11 w-full text-sm font-mono" />`) : null}

        <!-- the one thing the user can actually check against a birth certificate -->
        <div data-birth-resolved class="rounded-2xl sf-inset px-3 py-2.5">
          <div class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/70">${T(t, "resolved")}</div>
          ${r.ok ? html`<div class="font-mono text-sm tabular-nums mt-0.5">${r.date.toISOString().replace(".000Z", "Z")}</div>
            <div class="text-[0.68rem] font-mono text-base-content/70">${T(t, "utcMark")} ${r.offsetLabel}${r.zone ? " · " + r.zone : ""}</div>`
            : html`<div class="text-sm text-base-content/70 mt-0.5">${T(t, "need_" + r.reason)}</div>`}
        </div>

        ${/* The tint carries the meaning; the shadow pair carries the edge. The warning hairline these two
             (and the house-system fallback) drew was the object's outline, which the material now owns. */""}
        ${r.ok && r.ambiguous ? html`<div data-birth-warn class="rounded-xl sf-e2 bg-warning/10 px-3 py-2 text-[0.74rem]">${T(t, "warnAmbiguous")}</div>` : null}
        ${r.ok && r.nonexistent ? html`<div data-birth-warn class="rounded-xl sf-e2 bg-warning/10 px-3 py-2 text-[0.74rem]">${T(t, "warnNonexistent")}</div>` : null}

        <button data-birth-save disabled=${!complete} class="btn btn-primary rounded-2xl h-12 mt-1" onClick=${save}>${T(t, "birthSave")}</button>
      </div>
  </${Sheet}>`;
}

// ── the AI reading of the transits against the chart ───────────────────────────────────────────────────

// The model interprets ONLY the structured facts below — natal placements, the angles, and the transit
// contacts with their orbs — in canonical English, so the cache signature is locale-independent.
function InterpSheet({ open, onClose, C, t, loc, dateLabel }) {
  if (!open) return null;
  const name = (k) => k === "asc" ? "the Ascendant" : k === "mc" ? "the Midheaven" : (BODIES[k]?.name || k);
  const natalLine = (p) => `${name(p.key)} in ${SIGN_EN[signOf(p.lon)]} ${Math.floor(degIn(p.lon))}° (house ${houseOf(p.lon, C.H.cusps)})`;
  const hitLine = (a) => `transiting ${name(a.t)} ${a.type} natal ${name(a.n)} (orb ${a.orb.toFixed(1)}°${a.applying == null ? "" : a.applying ? ", applying" : ", separating"})`;
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const input = `Transits for ${dateEN}.\nNatal chart: ${C.natal.map(natalLine).join("; ")}; Ascendant in ${SIGN_EN[signOf(C.H.asc)]} ${Math.floor(degIn(C.H.asc))}°; Midheaven in ${SIGN_EN[signOf(C.H.mc)]} ${Math.floor(degIn(C.H.mc))}°.\nTransits: ${C.hits.length ? C.hits.map(hitLine).join("; ") + "." : "none within orb."}`;
  const sig = `${dateEN}|${Math.round(C.H.asc)}|${C.hits.map((a) => `${a.t}-${a.n}-${a.type}-${Math.round(a.orb)}`).join(",")}`;

  return html`<${Sheet} id="interpsheet" open=${true} onClose=${onClose} title=${T(t, "interpTitle")} subtitle=${dateLabel} icon="lucide:sparkles">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_SKY} t=${t}
        gateText=${GATE_INTERP[loc] || GATE_INTERP.en} lines=${[30, 34, 28, 20]} />
  </${Sheet}>`;
}

// a uniform little planet dot for the contact rows — the real spheres, size-scaled, live on the wheel.
// This one DEPICTS a sphere rather than declaring a surface (a 10px mark cannot hold the shadow pair), but
// the two colours it shaded with were literals: rgba(0,0,0,.35) is a bruise on a light page and rgba(130,
// 130,130,.4) is a hairline that belongs to neither theme. Both are theme tokens now — --nm-cast stays a
// shade in both modes and --sf-rim is the material's own counter-light, so a dark planet still lifts off a
// dark page. The two angles are not bodies, so they get a hollow primary ring instead: hollow vs filled is
// MEANING, not an outline, and it stays.
const dot = (p) => BODIES[p]
  ? html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style=${`background:${BODIES[p].color};box-shadow:inset -0.5px -0.5px 1px var(--nm-cast),0 0 0 0.5px var(--sf-rim)`}></span>`
  : html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0 border-2 border-primary"></span>`;
