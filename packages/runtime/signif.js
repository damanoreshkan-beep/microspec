// microspec runtime — SIGNIFICATIONS: what the tradition says the pieces of a chart mean.
//
// The chart itself is arithmetic (natal.js + astro.js) and verifiable to the arcsecond. This file is a
// different kind of claim and the difference is worth stating plainly: **astrology is not an empirically
// validated causal system, and nothing here asserts that a planet does anything to anyone.** What can be
// true or false is FIDELITY TO THE TRADITION — whether "Mars rules Aries", "the sixth house signifies
// sickness and service" and "a square is read as friction" are what the tradition actually says.
//
// That is the sense in which this module is meant to be correct, and it is why the meanings ship as DATA
// rather than living inside a prompt:
//
//   • the UI renders them directly, so a model outage costs the prose and never the substance;
//   • the same entries are handed to the model as grounding, with instructions to synthesise them and add
//     nothing — the corpus is the authority, the model is only the language;
//   • they are unit-tested, reviewable and citable, which a sentence buried in a system prompt is not.
//
// Sourcing, per table, is written up in apps/transit/RESEARCH.md §8. Two rules held throughout:
//
//   DERIVED, NEVER DUPLICATED. Detriment is the sign opposite the domicile and fall the sign opposite the
//   exaltation, so 14 facts are stored instead of 4 tables that can drift apart. There is exactly ONE
//   rulership table in the farm and it is RULERS below — it used to live in zodiac.js, which draws glyphs
//   and therefore imports htm/preact, which would have made this whole module unreachable from a bare
//   `deno test`. Data that has to be unit-tested cannot live behind a component import.
//
//   CONTESTED IS LABELLED, NEVER ASSERTED. The outer planets have modern sign rulerships but no agreed
//   exaltation, so they have no dignity here rather than a guessed one. Placidus and whole-sign disagree
//   about which house a planet is in, so every grounding block names the system in force. Retrograde is
//   review in modern practice and a debility in traditional practice, and says so.
//
// Every entry is a [en, uk] pair so the translation sits against its source and cannot silently go missing
// (runtime_test.js walks the whole tree and fails on any leaf that is not two non-empty strings). Grounding
// blocks are always built in English — the model renders the reader's locale from them.
import { signOf, ELEMENT, MODALITY } from "./synastry.js";

// Bump when a MEANING changes. It rides in every reading's cache signature, so a corpus edit expires the
// readings built on the old wording instead of serving them forever.
export const CORPUS = 1;

// Planetary rulership, index 0=Aries..11=Pisces: the traditional ruler FIRST, then the modern outer
// co-ruler where one is assigned — Scorpio = Mars & Pluto, Aquarius = Saturn & Uranus, Pisces = Jupiter &
// Neptune. A planet can rule two signs (Mercury → Gemini + Virgo, Venus → Taurus + Libra). The ordering is
// load-bearing: `RULERS[s][0]` is the traditional ruler everywhere, so dignity never has to ask which
// school it is in, and the modern co-ruler is opt-in at the call site rather than baked in.
export const RULERS = [
  ["mars"], ["venus"], ["mercury"], ["moon"], ["sun"], ["mercury"],
  ["venus"], ["mars", "pluto"], ["jupiter"], ["saturn"], ["saturn", "uranus"], ["jupiter", "neptune"],
];

const en = 0, uk = 1;
export const say = (pair, loc) => (pair ? (loc === "uk" ? pair[uk] : pair[en]) : "");

// ── the ten bodies ───────────────────────────────────────────────────────────────────────────────────────
// role   — what the body is, as a principle
// act    — what it does when it transits something (the verb, not the verdict)
// strain — the same principle at cost; every entry has one, so no reading can come out one-sided
// tempo  — astronomy, not doctrine: how long this actually lasts. The single most load-bearing field here,
//          because it is what stops a fourteen-year Neptune transit being written up as a passing mood.
export const BODY = {
  sun: {
    role: ["identity, vitality and conscious purpose", "суть, життєва сила і свідома мета"],
    act: ["lights up whatever it touches and makes it, briefly, the centre of things",
      "освітлює те, чого торкається, і ненадовго робить це центром подій"],
    strain: ["pride, over-identification, spending vitality faster than it returns",
      "гордість, ототожнення себе зі справою, витрата сил швидше, ніж вони повертаються"],
    tempo: ["a year round the chart, a month in a sign, a day on a degree",
      "рік по всій карті, місяць у знаку, доба на градусі"],
  },
  moon: {
    role: ["feeling, instinct, memory — what soothes and what unsettles",
      "почуття, інстинкт, памʼять — що заспокоює, а що бентежить"],
    act: ["colours the mood of a day and brings the reaction up before the thought",
      "забарвлює настрій дня і виносить реакцію наперед думки"],
    strain: ["moodiness, clinging to the familiar, reacting instead of choosing",
      "мінливість, чіпляння за звичне, реакція замість вибору"],
    tempo: ["27 days round the chart, two and a half in a sign — hours on a degree",
      "27 днів по всій карті, двоє з половиною діб у знаку — години на градусі"],
  },
  mercury: {
    role: ["thinking, speech, learning, exchange and the handling of detail",
      "мислення, мова, навчання, обмін і робота з деталями"],
    act: ["brings the conversation, the message, the paperwork and the second look",
      "приносить розмову, повідомлення, папери — і другий погляд на зроблене"],
    strain: ["nervous haste, cleverness in place of judgement, talking past the point",
      "нервова поспішність, спритність замість розсудливості, розмова повз суть"],
    tempo: ["about a year round the chart; retrograde three times a year for some three weeks",
      "приблизно рік по всій карті; ретроградний тричі на рік по три тижні"],
  },
  venus: {
    role: ["attraction, affection, taste, and what is wanted for its own sake",
      "притягання, приязнь, смак і те, чого хочеться заради нього самого"],
    act: ["smooths, sweetens and draws together; makes agreement easy",
      "згладжує, підсолоджує і зближує; робить згоду легкою"],
    strain: ["indulgence, appeasement, valuing being liked over being right",
      "потурання, догоджання, бажання подобатися замість бути правим"],
    tempo: ["about a year round the chart; retrograde every 18 months for six weeks",
      "приблизно рік по всій карті; ретроградна раз на 18 місяців на шість тижнів"],
  },
  mars: {
    role: ["drive, appetite, anger, courage and the will to act",
      "порив, апетит, гнів, відвага і воля до дії"],
    act: ["heats, hurries and forces the issue — the fight or the effort",
      "розігріває, підганяє і загострює — бійка або зусилля"],
    strain: ["haste, friction, force where patience would have done",
      "поспіх, тертя, сила там, де вистачило б терпіння"],
    tempo: ["two years round the chart, six weeks in a sign; retrograde every two years for two months",
      "два роки по всій карті, шість тижнів у знаку; ретроградний раз на два роки на два місяці"],
  },
  jupiter: {
    role: ["growth, meaning, confidence and the search for a larger frame",
      "зростання, сенс, упевненість і пошук ширшої рамки"],
    act: ["opens, enlarges and gives permission — including to what should have stayed small",
      "відкриває, збільшує і дає дозвіл — зокрема й тому, що мало лишитися малим"],
    strain: ["overreach, excess, promising more than the ground will hold",
      "переоцінка сил, надмір, обіцянки, яких ґрунт не витримає"],
    tempo: ["12 years round the chart, a year in a sign; retrograde four months a year",
      "12 років по всій карті, рік у знаку; ретроградний по чотири місяці щороку"],
  },
  saturn: {
    role: ["structure, limit, duty, time, and the cost of what is real",
      "структура, межа, обовʼязок, час і ціна того, що справжнє"],
    act: ["tests for load — what is built stands, what is not shows its cracks",
      "перевіряє на міцність — збудоване стоїть, решта показує тріщини"],
    strain: ["fear, hardness, mistaking delay for defeat",
      "страх, черствість, сприймання затримки за поразку"],
    tempo: ["29 and a half years round the chart, two and a half in a sign — the first return near 29",
      "29 з половиною років по всій карті, два з половиною у знаку — перше повернення близько 29"],
  },
  uranus: {
    role: ["disruption, independence and the sudden change of mind (a modern body)",
      "розрив, незалежність і раптова зміна думки (сучасна планета)"],
    act: ["breaks the pattern, and will not let it re-form in the same shape",
      "ламає усталене й не дає йому скластися так само"],
    strain: ["restlessness, rupture for its own sake, cutting what could have been changed",
      "неспокій, розрив заради розриву, обрубування того, що можна було змінити"],
    tempo: ["84 years round the chart, seven years in a sign",
      "84 роки по всій карті, сім років у знаку"],
  },
  neptune: {
    role: ["dissolution, imagination, longing and the blurring of edges (a modern body)",
      "розчинення, уява, туга і розмивання меж (сучасна планета)"],
    act: ["softens the outline of things — inspiration and illusion arrive by the same door",
      "розмʼякшує обриси — натхнення й омана заходять одними дверима"],
    strain: ["confusion, self-deception, escape",
      "сплутаність, самообман, втеча"],
    tempo: ["165 years round the chart, fourteen years in a sign",
      "165 років по всій карті, чотирнадцять років у знаку"],
  },
  pluto: {
    role: ["compulsion, depth, power, and what will not stay buried (a modern body)",
      "невідпорність, глибина, влада і те, що не лишається похованим (сучасна планета)"],
    act: ["works slowly and does not negotiate — what is finished is taken away",
      "діє повільно й не торгується — завершене забирається"],
    strain: ["obsession, control, holding on to the crisis",
      "одержимість, контроль, утримування кризи"],
    tempo: ["248 years round the chart, twelve to thirty years in a sign",
      "248 років по всій карті, від дванадцяти до тридцяти років у знаку"],
  },
};

// ── the twelve signs ─────────────────────────────────────────────────────────────────────────────────────
// Element, modality and ruler are not repeated here — ELEMENT/MODALITY (synastry.js) and RULERS (zodiac.js)
// already own them, and a second copy is a second thing to get wrong.
export const SIGN = [
  { mode: ["starts, directly and without waiting for permission", "починає — прямо й не чекаючи дозволу"],
    gift: ["courage, initiative, honesty of impulse", "відвага, ініціатива, чесність пориву"],
    excess: ["impatience, needless conflict", "нетерплячість, зайвий конфлікт"] },
  { mode: ["holds, steadies and makes tangible", "утримує, заспокоює і робить відчутним"],
    gift: ["constancy, patience, an eye for the real", "сталість, терпіння, чуття на справжнє"],
    excess: ["stubbornness, inertia, holding on to possessions", "упертість, інерція, чіпляння за своє"] },
  { mode: ["asks, connects and keeps the options open", "питає, зʼєднує і лишає варіанти відкритими"],
    gift: ["curiosity, quickness, ease with words", "цікавість, швидкість, легкість зі словом"],
    excess: ["scattering, restlessness, cleverness without depth", "розпорошення, метушня, спритність без глибини"] },
  { mode: ["shelters, remembers and looks after", "прихищає, памʼятає і піклується"],
    gift: ["care, loyalty, emotional intelligence", "турбота, вірність, чуття на людей"],
    excess: ["defensiveness, clinging, taking things personally", "оборонність, чіпляння, надто особисте сприйняття"] },
  { mode: ["shows, gives and takes the centre", "показує, дарує і посідає центр"],
    gift: ["warmth, generosity, creative confidence", "тепло, щедрість, творча впевненість"],
    excess: ["pride, display, needing the room to watch", "гординя, показовість, потреба в глядачах"] },
  { mode: ["refines, sorts and puts to use", "вдосконалює, впорядковує і вживає до діла"],
    gift: ["precision, service, competence", "точність, служіння, вправність"],
    excess: ["criticism, worry, perfection that never ships", "критиканство, тривога, довершеність, яку так і не випущено"] },
  { mode: ["weighs, relates, and looks for the fair line", "зважує, співвідносить і шукає справедливу межу"],
    gift: ["grace, fairness, a talent for other people", "тактовність, справедливість, хист до людей"],
    excess: ["indecision, appeasement, avoiding a necessary disagreement", "нерішучість, догоджання, уникання потрібної суперечки"] },
  { mode: ["goes deep, commits, and does not look away", "заглиблюється, віддається і не відводить очей"],
    gift: ["intensity, loyalty, the nerve for hard truths", "напруга, вірність, витримка на важку правду"],
    excess: ["control, suspicion, keeping the wound open", "контроль, підозріливість, ятріння рани"] },
  { mode: ["ranges, believes and looks for the larger meaning", "мандрує, вірить і шукає більший сенс"],
    gift: ["optimism, breadth, plain honesty", "оптимізм, широта, пряма чесність"],
    excess: ["excess, tactlessness, the answer before the work", "надмір, нетактовність, відповідь раніше за роботу"] },
  { mode: ["builds, endures and takes responsibility", "будує, витримує і бере відповідальність"],
    gift: ["discipline, realism, the long view", "дисципліна, реалізм, довгий погляд"],
    excess: ["coldness, over-caution, worth measured only in achievement", "холодність, надобережність, вартість лише через досягнення"] },
  { mode: ["stands apart, questions, and thinks in systems", "тримається осторонь, ставить під сумнів і мислить системами"],
    gift: ["originality, principle, fairness at scale", "оригінальність, принциповість, справедливість у масштабі"],
    excess: ["detachment, contrarianism, theory over the person in front of you", "відстороненість, суперечливість, теорія понад живу людину"] },
  { mode: ["dissolves the boundary, feels with, and imagines", "розчиняє межу, співпереживає й уявляє"],
    gift: ["compassion, imagination, receptivity", "співчуття, уява, сприйнятливість"],
    excess: ["evasion, drift, absorbing what is not yours", "ухиляння, дрейф, вбирання чужого"] },
];

// ── the twelve houses ────────────────────────────────────────────────────────────────────────────────────
// `topic` is the modern field-of-life formulation; `trad` is Lilly's own 1647 wording, kept because it is
// the concrete, checkable version of the same house and it shows where the modern one came from.
export const HOUSE = [
  { topic: ["the body, the self one presents, how life is approached and begun",
    "тіло, себе-на-показ, спосіб підходити до життя і починати"],
    trad: ["life, stature, complexion and form", "життя, стать, барва і подоба"] },
  { topic: ["money, possessions, resources and what is valued",
    "гроші, майно, ресурси і те, що цінується"],
    trad: ["estate or fortune, movable goods", "статок або маєток, рухоме добро"] },
  { topic: ["speech, learning, siblings, neighbours and short journeys",
    "мова, навчання, брати й сестри, сусіди і короткі поїздки"],
    trad: ["brethren, kindred, neighbours, short journeys, letters and rumours",
      "брати, рідня, сусіди, короткі мандрівки, листи й чутки"] },
  { topic: ["home, family, roots, the private base, and how things end",
    "дім, родина, коріння, приватна опора і те, чим усе завершується"],
    trad: ["fathers, lands, houses, inheritances, hidden treasure",
      "батьки, землі, будинки, спадок, приховані скарби"] },
  { topic: ["children, play, romance, making things, and what is done for pleasure",
    "діти, гра, закоханість, творення і те, що робиться заради втіхи"],
    trad: ["children, pleasure, banquets, plays", "діти, втіха, бенкети, вистави"] },
  { topic: ["work, routine, health and service", "робота, розпорядок, здоровʼя і служіння"],
    trad: ["servants, sickness, its quality and cause", "слуги, хвороба, її природа і причина"] },
  { topic: ["partnership, marriage, the open opponent and the contract",
    "партнерство, шлюб, відкритий супротивник і угода"],
    trad: ["marriage, the person asked after, open enemies, law-suits",
      "шлюб, той, про кого питають, явні вороги, позови"] },
  { topic: ["what is shared, inherited or given up — crisis, depth and other people's resources",
    "спільне, успадковане чи віддане — криза, глибина і чужі ресурси"],
    trad: ["the estate of the deceased, wills, legacies, the dowry",
      "маєток померлих, заповіти, спадки, посаг"] },
  { topic: ["belief, study, travel, and the search for meaning far from home",
    "віра, навчання, подорож і пошук сенсу далеко від дому"],
    trad: ["long journeys, religion, dreams, books, learning",
      "далекі мандри, віра, сни, книги, наука"] },
  { topic: ["vocation, public role, reputation, and where one is visible",
    "покликання, публічна роль, репутація і те, де тебе видно"],
    trad: ["judges, honour, preferment, dignity, office, the mother",
      "судді, шана, підвищення, гідність, посада, мати"] },
  { topic: ["friends, allies, groups, and what is hoped for",
    "друзі, спільники, гурти і те, на що сподіваєшся"],
    trad: ["friends and friendship, hope, trust, confidence",
      "друзі й дружба, надія, довіра, певність"] },
  { topic: ["what is hidden, withdrawn or undone — solitude and the unacknowledged",
    "приховане, відсторонене чи нескінчене — самота і невизнане"],
    trad: ["private enemies, sorrow, tribulation, imprisonment",
      "таємні вороги, смуток, поневіряння, увʼязнення"] },
];

// ── the five Ptolemaic aspects ───────────────────────────────────────────────────────────────────────────
// The angles and their soft/hard/neutral natures are TRANSIT_ASPECTS in natal.js; only the reading is here.
export const ASPECT = {
  conjunction: ["fuses the two — they act as one, and neither is easy to see on its own",
    "зливає двох — вони діють як одне, і жодного вже не видно окремо"],
  sextile: ["an opening rather than an event: it helps, but only if it is taken",
    "радше відчинені двері, ніж подія: допомагає лише тому, хто скористається"],
  square: ["friction between two things that both have a claim; it forces a decision",
    "тертя між двома, і кожне має право; змушує вирішувати"],
  trine: ["an easy channel — it flows so readily that it is often unnoticed, or unused",
    "легкий канал — тече настільки просто, що часто лишається непоміченим або невикористаним"],
  opposition: ["a pull in two directions, and it is usually met through someone else",
    "тяжіння у два боки, і зустрічається воно зазвичай через іншу людину"],
};

// ── the angles ───────────────────────────────────────────────────────────────────────────────────────────
export const ANGLE = {
  asc: { topic: ["the body, the first impression, and the way life is met",
    "тіло, перше враження і те, як зустрічається життя"],
    axis: ["opposite it stands the Descendant: the other person", "навпроти — Десцендент: інша людина"] },
  mc: { topic: ["the public role, the direction taken, what one is seen to be for",
    "публічна роль, обраний напрям, те, чим тебе бачать"],
    axis: ["opposite it stands the IC: the private base", "навпроти — IC: приватна опора"] },
  vertex: { topic: ["encounters that feel arranged rather than chosen",
    "зустрічі, що відчуваються радше влаштованими, ніж обраними"],
    axis: ["a modern convention, not a classical angle", "сучасна умовність, а не класичний кут"] },
};

// ── essential dignity ────────────────────────────────────────────────────────────────────────────────────
// Domicile comes from RULERS (traditional ruler = first entry). Exaltation is the classical table. Detriment
// and fall are DERIVED as the opposite sign, so they cannot disagree with the two facts they come from.
// The three modern bodies have rulerships but no agreed exaltation, so they have no dignity here at all —
// "Uranus exalted in Scorpio" is a 20th-century proposal with no consensus behind it.
export const EXALTATION = { sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6 };
const CLASSICAL = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
const opposite = (s) => (s + 6) % 12;

export const DIGNITY = {
  domicile: ["in its own sign — it works in its own manner, with nothing to translate",
    "у власному знаку — діє по-своєму, нічого не перекладаючи"],
  exaltation: ["an honoured guest — given more room than usual, though not necessarily moderation",
    "почесний гість — має більше простору, ніж звично, хоч і не обовʼязково міру"],
  detriment: ["in the sign opposite its own — it has to work in terms that are not its own",
    "у знаку, протилежному власному — мусить діяти на чужих умовах"],
  fall: ["in the sign opposite its exaltation — little supports what it does naturally",
    "у знаку, протилежному піднесенню — мало що підтримує його природну дію"],
  none: ["neither dignified nor debilitated in this sign", "у цьому знаку ні піднесений, ні ослаблений"],
};

// dignityOf(body, sign) → "domicile" | "exaltation" | "detriment" | "fall" | "none" | null
// null means the question does not apply: essential dignity is a doctrine about the seven classical bodies.
export function dignityOf(body, sign) {
  if (!CLASSICAL.includes(body)) return null;
  const s = ((sign % 12) + 12) % 12;
  if (RULERS[s][0] === body) return "domicile";
  if (RULERS[opposite(s)][0] === body) return "detriment";
  if (EXALTATION[body] === s) return "exaltation";
  if (EXALTATION[body] === opposite(s)) return "fall";
  return "none";
}

// ── elements, modalities, and the retrograde caveat ──────────────────────────────────────────────────────
export const ELEMENT_NAME = [["fire", "вогонь"], ["earth", "земля"], ["air", "повітря"], ["water", "вода"]];
export const ELEMENT_MEANS = [
  ["assertion, drive, willpower", "наполегливість, порив, воля"],
  ["practicality, caution, the material world", "практичність, обачність, матеріальний світ"],
  ["communication, socialising, ideas", "спілкування, товариськість, ідеї"],
  ["emotion, empathy, sensitivity", "емоція, співпереживання, чутливість"],
];
export const MODALITY_NAME = [["cardinal", "кардинальна"], ["fixed", "фіксована"], ["mutable", "мутабельна"]];
export const MODALITY_MEANS = [
  ["initiates — action, dynamism, force", "починає — дія, рух, натиск"],
  ["sustains — resistance to change, willpower", "утримує — опір змінам, воля"],
  ["adapts — flexibility, resourcefulness", "пристосовується — гнучкість, винахідливість"],
];
export const RETRO_NOTE = [
  "apparently moving backwards from here; modern practice reads it as review and return, traditional astrology as a debility",
  "видимий зворотний рух; сучасна практика читає це як перегляд і повернення, традиційна — як ослаблення",
];

// ── derived chart indicators ─────────────────────────────────────────────────────────────────────────────

// chartRuler(ascLon, { modern }) → the ruler of the rising sign. Which convention is in force is the
// caller's choice and must be shown, never assumed: traditional gives Aquarius to Saturn, modern to Uranus.
export function chartRuler(ascLon, { modern = false } = {}) {
  const s = signOf(ascLon), r = RULERS[s];
  return { sign: s, body: modern && r[1] ? r[1] : r[0], modern: !!(modern && r[1]) };
}

// balance(lons) → { elements: [4], modalities: [3], topElement, topModality } — a plain count over the
// bodies the user has switched on. Deliberately unweighted: schemes that weight the luminaries double are
// one school among several, and an unweighted count is the one nobody has to argue about.
export function balance(lons) {
  const elements = [0, 0, 0, 0], modalities = [0, 0, 0];
  for (const lon of lons) { const s = signOf(lon); elements[ELEMENT(s)]++; modalities[MODALITY(s)]++; }
  const top = (a) => a.indexOf(Math.max(...a));
  return { elements, modalities, topElement: top(elements), topModality: top(modalities) };
}

// ── grounding blocks ─────────────────────────────────────────────────────────────────────────────────────
//
// Each builder returns { text, sig }: the closed-world block the model may use, and the cache signature for
// it. They are returned TOGETHER on purpose — a signature that misses a fact the block contains serves a
// stale reading forever, and pairing them here is the only way a caller cannot get that wrong.
//
// The blocks are always English. The model writes in the reader's locale from them, which keeps one cache
// signature valid across both and keeps the corpus's English wording as the single source of meaning.

const SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
// Bare names, no articles: these are slotted into "transiting Saturn square natal Sun", where "natal the
// Sun" would be the kind of small wrongness a model happily copies into its answer.
const NAME_EN = { sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto", asc: "Ascendant", mc: "Midheaven", vertex: "Vertex" };
export const nameEN = (k) => NAME_EN[k] || k;
const deg = (lon) => `${SIGN_EN[signOf(lon)]} ${Math.floor((((lon % 360) + 360) % 360) % 30)}°`;
const HEAD = "Use ONLY the facts and meanings below. Add no body, sign, house, aspect or event that is not here.";

// How long a multi-pass contact runs, in words, from the first exact instant to the last.
//
// This exists because of a measured failure, not a hunch. Given three dates and no span, the live model
// added a fourth number of its own — it called 3 Aug 2026 → 2 May 2027 "about a year and a half" — and a
// derived number is the one kind of invention a closed-world prompt does not catch, because every input it
// used really was in the block. So the span is COMPUTED here and stated, and the prompt forbids deriving
// figures at all: the reading may only quote numbers it was given.
export function spanLabel(fromMs, toMs) {
  const days = Math.round((toMs - fromMs) / 86400000);
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `about ${months} month${months === 1 ? "" : "s"}`;
  const years = (days / 365.25).toFixed(1).replace(/\.0$/, "");
  return `about ${years} years`;
}

// One transit contact. `c` is a contact from natal.js `transits()`. `hits` are the resolved exact instants
// as `{ label, ms }` — the caller formats the label, because only it knows how finely the body's speed lets
// the instant be quoted (§5), and the ms is what the span is measured from. `natalHouse` may be null when
// the natal point IS an angle.
export function groundTransit({ c, transitLon, natalHouse, houseSystem, retro, dateEN, hits = [] }) {
  const labels = hits.map((h) => (typeof h === "string" ? h : h.label));
  const span = (hits.length > 1 && typeof hits[0] === "object")
    ? ` The whole sequence runs ${labels[0]} to ${labels[labels.length - 1]}, ${spanLabel(hits[0].ms, hits[hits.length - 1].ms)}.` : "";
  const tb = BODY[c.t], nb = BODY[c.n], na = ANGLE[c.n];
  const tSign = signOf(transitLon);
  const nSign = signOf(c.natalLon);
  const phase = c.applying == null ? "" : c.applying ? ", applying (building toward exact)" : ", separating (the exact contact has passed)";
  const passes = labels.length > 1 ? ` It perfects ${labels.length} times as the body turns retrograde and returns: ${labels.join("; ")}.${span}` : labels.length === 1 ? ` It perfects on ${labels[0]}.` : "";
  const lines = [
    `- ${nameEN(c.t)}, the moving body: ${tb.role[en]}. As a transit it ${tb.act[en]}. Under strain: ${tb.strain[en]}. How long this lasts: ${tb.tempo[en]}.`,
    `- the ${c.type}: ${ASPECT[c.type][en]}`,
    na
      ? `- ${nameEN(c.n)}, the point being touched: ${na.topic[en]} (${na.axis[en]}).`
      : `- ${nameEN(c.n)}, the natal point being touched: ${nb.role[en]}. Under strain: ${nb.strain[en]}.`,
    natalHouse ? `- house ${natalHouse}, the field of life this falls in (${houseSystem} houses): ${HOUSE[natalHouse - 1].topic[en]}; traditionally "${HOUSE[natalHouse - 1].trad[en]}".` : null,
    `- ${SIGN_EN[nSign]}, the sign the natal point stands in: it ${SIGN[nSign].mode[en]}.`,
    `- ${SIGN_EN[tSign]}, the sign the transit falls in: it ${SIGN[tSign].mode[en]}.`,
    retro ? `- ${nameEN(c.t)} is retrograde: ${RETRO_NOTE[en]}.` : null,
  ].filter(Boolean);
  const text = `${HEAD}
CONFIGURATION: transiting ${nameEN(c.t)} ${c.type} natal ${nameEN(c.n)}, on ${dateEN}.
FACTS: orb ${c.orb.toFixed(2)}°${c.exact ? " (exact, within 1°)" : " (in range, within 3°)"}${phase}.${passes} Transiting ${nameEN(c.t)} is at ${deg(transitLon)}${retro ? ", retrograde" : ""}. Natal ${nameEN(c.n)} is at ${deg(c.natalLon)}${natalHouse ? `, in house ${natalHouse} (${houseSystem})` : ""}.
MEANINGS (the app's sourced corpus):
${lines.join("\n")}`;
  const sig = `t${CORPUS}|${c.t}-${c.type}-${c.n}|${Math.round(c.orb)}|${c.applying == null ? "-" : c.applying ? "a" : "s"}|${retro ? "r" : ""}|${natalHouse || 0}|${houseSystem}|${labels[0] || dateEN}|${labels.length}`;
  return { text, sig };
}

// One natal placement — a body in a sign and a house, or one of the angles.
export function groundPlacement({ key, lon, house, houseSystem, retro }) {
  const b = BODY[key], a = ANGLE[key], s = signOf(lon);
  const dig = b ? dignityOf(key, s) : null;
  const lines = [
    a ? `- ${nameEN(key)}: ${a.topic[en]} (${a.axis[en]}).`
      : `- ${nameEN(key)} is the WHAT: ${b.role[en]}. Under strain: ${b.strain[en]}.`,
    `- ${SIGN_EN[s]} is the HOW: it ${SIGN[s].mode[en]}. At its best: ${SIGN[s].gift[en]}. At its worst: ${SIGN[s].excess[en]}.`,
    `- ${SIGN_EN[s]} is ${ELEMENT_NAME[ELEMENT(s)][en]} (${ELEMENT_MEANS[ELEMENT(s)][en]}) and ${MODALITY_NAME[MODALITY(s)][en]} (${MODALITY_MEANS[MODALITY(s)][en]}).`,
    house ? `- house ${house} is the WHERE (${houseSystem} houses): ${HOUSE[house - 1].topic[en]}; traditionally "${HOUSE[house - 1].trad[en]}".` : null,
    dig && dig !== "none" ? `- essential dignity: ${nameEN(key)} is in ${dig} here — ${DIGNITY[dig][en]}.` : null,
    retro ? `- retrograde at birth: ${RETRO_NOTE[en]}.` : null,
  ].filter(Boolean);
  const text = `${HEAD}
PLACEMENT: ${nameEN(key)} at ${deg(lon)}${house ? `, house ${house} (${houseSystem})` : ""}${retro ? ", retrograde" : ""}.
MEANINGS (the app's sourced corpus):
${lines.join("\n")}
Read this as ONE behaviour in ONE arena, not as two separate paragraphs about the sign and the house.`;
  const sig = `p${CORPUS}|${key}|${s}|${house || 0}|${houseSystem}|${retro ? "r" : ""}|${dig || "-"}`;
  return { text, sig };
}

// The whole chart. `points` are the natal bodies [{key, lon, house, retro}]; the angles come separately
// because they are places, not bodies, and only the bodies count toward the balances.
export function groundPortrait({ points, asc, mc, houseSystem, modernRulers = false, aspects = [] }) {
  const bal = balance(points.map((p) => p.lon));
  const ruler = chartRuler(asc, { modern: modernRulers });
  const rulerPt = points.find((p) => p.key === ruler.body);
  const line = (p) => {
    const s = signOf(p.lon), dig = dignityOf(p.key, s);
    return `- ${nameEN(p.key)} in ${SIGN_EN[s]} (it ${SIGN[s].mode[en]}), house ${p.house} (${HOUSE[p.house - 1].topic[en]})${dig && dig !== "none" ? `, in ${dig}` : ""}${p.retro ? ", retrograde" : ""}. ${nameEN(p.key)}: ${BODY[p.key].role[en]}.`;
  };
  const tight = aspects.slice(0, 6).map((a) => `- natal ${nameEN(a.a)} ${a.type} ${nameEN(a.b)}, orb ${a.orb.toFixed(1)}°: ${ASPECT[a.type][en]}`);
  const text = `${HEAD}
NATAL CHART (${houseSystem} houses, ${modernRulers ? "modern" : "traditional"} rulerships).
ANGLES: Ascendant at ${deg(asc)} — ${ANGLE.asc.topic[en]}. Midheaven at ${deg(mc)} — ${ANGLE.mc.topic[en]}.
CHART RULER: ${nameEN(ruler.body)}, ruler of the rising sign ${SIGN_EN[ruler.sign]}${ruler.modern ? " (modern ruler; traditionally " + nameEN(RULERS[ruler.sign][0]) + ")" : ""}${rulerPt ? `, itself in ${SIGN_EN[signOf(rulerPt.lon)]} house ${rulerPt.house}` : ""}.
BALANCE across ${points.length} bodies: ${ELEMENT_NAME.map((n, i) => `${n[en]} ${bal.elements[i]}`).join(", ")}; ${MODALITY_NAME.map((n, i) => `${n[en]} ${bal.modalities[i]}`).join(", ")}.
PLACEMENTS:
${points.map(line).join("\n")}${tight.length ? `\nTIGHTEST NATAL ASPECTS:\n${tight.join("\n")}` : ""}
Synthesise in this order: the luminaries and the Ascendant first, then the chart ruler, then the balance, then whatever repeats across placements, then the tightest aspects. Do not walk the list again placement by placement.`;
  const sig = `c${CORPUS}|${houseSystem}|${modernRulers ? "m" : "t"}|${Math.round(asc)}|${Math.round(mc)}|${points.map((p) => `${p.key}${signOf(p.lon)}${p.house}${p.retro ? "r" : ""}`).join("")}`;
  return { text, sig };
}
