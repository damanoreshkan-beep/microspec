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

// Bump when a MEANING changes — or when the VOICE does. It rides in every reading's cache signature, so an
// edit expires the readings built on the old wording instead of serving them forever.
//
// 3: the astrology prompts were rewritten (microspec-edge ai-prompts.js). The old rules mandated hedges
// («традиційно читається як», «схиляє до») and bought gender-neutrality with verbal nouns («є схильність»),
// which together produced the flat, could-be-anyone register the owner called out. Nothing about the corpus
// or the facts changed, so the signature inputs would not have moved on their own — and every reading
// already cached in a browser would have kept its old voice forever.
//
// 4: the SKY reading gained a corpus (`groundSky` below). It had never had one — it was the only mode sent
// bare coordinates — and it was also the only mode whose signature was hand-built at the call site without
// this constant in it, so nothing about the fix would have expired a single cached reading. The two facts
// are the same oversight seen from two ends, and the same edit closes both.
export const CORPUS = 4;

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
    work: ["leading, representing, being the face of something; traditionally goldsmiths, minters and those who work in gold and in the presence of power",
      "керувати, представляти, бути обличчям справи; у давніх списках — золотарі, карбівники, ті, хто при владі"],
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
    work: ["care, nursing, food, and anything that serves the public or moves with a tide or a season; traditionally sailors, fishermen, midwives, nurses, brewers",
      "догляд, медсестринство, їжа і все, що служить загалу або йде припливами й сезонами; у давніх списках — моряки, рибалки, повитухи, доглядальниці, пивовари"],
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
    work: ["writing, teaching, trade, records, code — anything that moves information; traditionally scribes, merchants, schoolmasters, accountants, messengers",
      "писати, вчити, торгувати, вести облік, програмувати — усе, що рухає інформацію; у давніх списках — писарі, купці, вчителі, рахівники, гінці"],
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
    work: ["design, music, clothing, beauty, hospitality — anything made pleasant to be around; traditionally musicians, painters, jewellers, embroiderers, drapers",
      "дизайн, музика, одяг, краса, гостинність — усе, що робить приємним; у давніх списках — музиканти, малярі, ювеліри, вишивальники, крамарі тканин"],
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
    work: ["tools, surgery, engineering, emergency work, sport — anything with iron, heat or risk in it; traditionally soldiers, surgeons, butchers, smiths, cutlers",
      "інструменти, хірургія, інженерія, робота на надзвичайних, спорт — усе, де залізо, жар і ризик; у давніх списках — воїни, хірурги, різники, ковалі, ножарі"],
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
    work: ["law, teaching at height, publishing, religion, advising — anything that grants, interprets or vouches; traditionally judges, lawyers, clergy, scholars",
      "право, викладання, видавництво, віра, дорадництво — усе, що надає, тлумачить або ручається; у давніх списках — судді, правники, духівництво, вчені"],
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
    work: ["building, land, structure, maintenance, administration — anything that endures and is measured in time; traditionally husbandmen, miners, masons, tanners, day-labourers",
      "будівництво, земля, структура, обслуговування, адміністрування — усе, що триває і міряється часом; у давніх списках — хлібороби, гірники, мулярі, чинбарі, поденники"],
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
    work: ["technology, research, reform, anything that breaks the existing pattern — a modern body, with no classical trade list behind it",
      "технології, дослідження, реформа, усе, що ламає усталене — сучасна планета, класичного переліку ремесел за нею немає"],
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
    work: ["image, film, music, care of the vulnerable, anything with soft edges — a modern body, with no classical trade list behind it",
      "образ, кіно, музика, догляд за вразливими, усе з розмитими краями — сучасна планета, класичного переліку ремесел за нею немає"],
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
    work: ["investigation, crisis work, depth finance, anything hidden that has to be turned over — a modern body, with no classical trade list behind it",
      "розслідування, робота з кризами, фінанси на глибині, усе приховане, що треба підняти — сучасна планета, класичного переліку ремесел за нею немає"],
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

// rulerOf(lon, { modern }) → the planet that rules the sign a longitude falls in. Which convention is in
// force is the caller's choice and must be SHOWN, never assumed: traditional gives Aquarius to Saturn,
// modern to Uranus. `modern: true` falls back to the traditional ruler for the nine signs that never
// acquired an outer co-ruler, and reports `modern: false` when it does — a claim about a convention has to
// be true of the specific answer, not of the request.
export function rulerOf(lon, { modern = false } = {}) {
  const s = signOf(lon), r = RULERS[s];
  return { sign: s, body: modern && r[1] ? r[1] : r[0], modern: !!(modern && r[1]) };
}
// The ruler of the rising sign is just the ruler of a particular longitude; the name is kept because that
// is what an astrologer calls it, and because "chart ruler" appears in the portrait as a heading.
export const chartRuler = rulerOf;

// balance(lons) → { elements: [4], modalities: [3], topElement, topModality } — a plain count over the
// bodies the user has switched on. Deliberately unweighted: schemes that weight the luminaries double are
// one school among several, and an unweighted count is the one nobody has to argue about.
export function balance(lons) {
  const elements = [0, 0, 0, 0], modalities = [0, 0, 0];
  for (const lon of lons) { const s = signOf(lon); elements[ELEMENT(s)]++; modalities[MODALITY(s)]++; }
  const top = (a) => a.indexOf(Math.max(...a));
  return { elements, modalities, topElement: top(elements), topModality: top(modalities) };
}

// ── the fixed question catalogue ─────────────────────────────────────────────────────────────────────────
//
// The eleven things people actually bring to an astrologer, as a CLOSED list. Closed is the whole design:
//
//   • it is the only honest way to be grounded. Each question declares exactly which houses, bodies and
//     angles it may be answered from — the significators a competent astrologer would read for it — so the
//     app computes those and nothing else reaches the model. A free-text box has no such set, which is why
//     it would be a wishing well with a language model at the bottom.
//   • it removes the injection surface entirely. There is no user text, so there is nothing to smuggle
//     instructions in. Compare `ask` in ai-books.js, which takes free text and needs a whole prompt section
//     to defend itself.
//   • it caches. Eleven questions × one chart = eleven answers, forever.
//
// WHAT IS NOT HERE, AND WHY. The most-asked list also contains "will I have children", "am I pregnant",
// "what is wrong with my health", "when will I die", "will I win the case", "should I invest". Every one is
// a claim about a real outcome that a birth chart does not establish, and no reframing rescues them — the
// person wants the outcome, and a symbolic answer to "when will I die" is a worse answer, not a safer one.
// They are dropped rather than softened. Better eight honest questions than ten with two that promise.
//
// `focus` is an instruction to the model, not UI, so it is English-only. It states the technique for that
// question — which factor leads and what an answer may NOT contain — because "answer using the facts below"
// leaves the model to guess whether the seventh house or Venus is the point.
//
// LABEL vs ASK, and why they are two fields. The catalogue used to show the full question — "Who am I drawn
// to, and what draws them to me?" — and eleven of those is a wall of sentences you have to READ before you
// can choose. What a person arrives with is a topic, not a phrasing: work, love, sex, money. So `label` is
// the topic, in the two locales, blunt enough to be scanned in a glance; `ask` is the precise English
// question the MODEL is handed, where the phrasing is the difference between an answer and an essay. The
// unit gate pins both shapes — a label that grows back into a sentence fails, and so does an `ask` that is
// not a question.
//
//   houses  — read as: cusp sign + its ruler + where that ruler lives + the planets tenanting it
//   bodies  — read as: sign, house, dignity, retrograde
//   transit — true → the question is about "now", so the current contacts to those points come too
export const QUESTIONS = [
  { id: "work", houses: [10, 6, 2], bodies: ["sun", "saturn"], angles: ["mc"], transit: false, fields: ["work"],
    label: ["Work", "Робота"],
    ask: "What kind of work suits me?",
    focus: "The tenth house and the Midheaven are the public role and the direction; the sixth is the daily labour and the conditions of it, which is a different question and often a different answer. The Sun is what the person is for; Saturn is what they will do the hard part of. Name actual KINDS of work, drawn from the Work lines supplied — that is what was asked, and a paragraph about identity and purpose is not an answer to it. Use only the kinds listed; do not invent an occupation. Never a job title as a prediction, and never an income." },
  { id: "workNow", houses: [10], bodies: ["sun", "saturn"], angles: ["mc"], transit: true, fields: ["work"],
    label: ["Work now", "Робота зараз"],
    ask: "What is moving in my work right now?",
    focus: "This one is about TIMING, so lead with the transits supplied and their exact dates, and use the natal factors only to say what is being touched. Quote the dates exactly as given and derive no new ones. A transit describes a season and a pressure, never an event that will occur." },
  { id: "love", houses: [7, 5], bodies: ["venus"], angles: ["asc"], transit: false,
    label: ["Love", "Кохання"],
    ask: "Who am I drawn to, and what draws them to me?",
    focus: "The seventh house — the sign on its cusp, and above all where its ruler lives — describes partnership and the kind of person sought. The fifth is courtship and play, not commitment; keep them distinct. Venus describes what is found beautiful and worth having. Answer with the KIND of person and the CONTEXT the tradition associates with these placements. Never a place, a date, a name, or a promise that it happens." },
  { id: "bond", houses: [7], bodies: ["moon", "saturn", "venus"], angles: [], transit: false,
    label: ["Relationships", "Стосунки"],
    ask: "What do I actually need for a relationship to last?",
    focus: "What this person needs in order to stay, not who they attract. The Moon is what must feel safe; Saturn is what they will and will not commit to; Venus is what they value. The seventh house ruler's condition says where the strain in partnership tends to come from. Describe needs and frictions, not a verdict on any relationship." },
  { id: "sex", houses: [8, 5], bodies: ["mars", "venus"], angles: [], transit: false,
    label: ["Sex", "Секс"],
    ask: "What is my nature in desire and intimacy?",
    focus: "Mars is desire — how it approaches, at what pace, and what it actually wants; Venus is what is found attractive and how closeness is offered. The fifth house is pleasure, play and attraction; the eighth is intimacy proper — merging, exposure, what is shared with one person only — and the sign on its cusp with its ruler's placement says how readily that door opens and on what terms. Describe TEMPERAMENT: pace, appetite, what has to be true before someone can let go. Keep it adult and plain but never explicit: name no act, no body part, no partner and no event, and never give advice or a prediction." },
  { id: "money", houses: [2, 8], bodies: ["venus", "jupiter"], angles: [], transit: false,
    label: ["Money", "Гроші"],
    ask: "What is my pattern with money and security?",
    focus: "The second house is what is one's own — earning, holding, and the sense of being worth something. The eighth is what is shared, owed, inherited or held on trust, which is a different matter entirely. Describe the PATTERN and the relationship to security. Never a forecast of wealth or poverty, never advice about an investment or a decision involving money." },
  { id: "people", houses: [11], bodies: ["mercury", "venus"], angles: [], transit: false,
    label: ["Friends", "Друзі"],
    ask: "Where do friendship and community fit in my life?",
    focus: "The eleventh is friends, allies, the group and what one hopes for; its ruler says where those people are found. Distinguish it from the seventh, which is one-to-one. Describe how this person belongs to a group and what they want from it." },
  { id: "home", houses: [4], bodies: ["moon"], angles: [], transit: false,
    label: ["Home", "Дім"],
    ask: "What gives me a sense of home?",
    focus: "The fourth house is the private base, the family one comes from and the ground one stands on; its ruler's placement says where that ground is actually found. The Moon is what soothes. Describe what home means for this person and what unsettles it — not a place to live and not a prediction about family." },
  { id: "learn", houses: [9, 3], bodies: ["mercury", "jupiter"], angles: [], transit: false,
    label: ["Learning", "Навчання"],
    ask: "How do I learn and get beyond the familiar?",
    focus: "The third is how the near world is taken in — talking, reading, the short trip; the ninth is the long reach — belief, study, distance. Mercury is the method, Jupiter the appetite. Say how this person learns and what widens them. Never predict a journey or a qualification." },
  { id: "strength", houses: [], bodies: ["sun", "moon"], angles: ["asc"], transit: false,
    label: ["Strengths", "Сильні сторони"],
    ask: "Where is my strength, and what keeps repeating as difficulty?",
    focus: "Lead with essential dignity: a planet in its own sign or exaltation works easily, one in detriment or fall has to work in terms that are not its own — that is the honest version of strength and difficulty. Then the tightest natal aspects, soft and hard. Name a real cost, not a flattering one, and never call any of it a flaw in the person." },
  { id: "phase", houses: [], bodies: ["sun", "moon", "saturn"], angles: ["asc", "mc"], transit: true,
    label: ["Life phase", "Період життя"],
    ask: "What phase of life am I in now?",
    focus: "Answer from the transits supplied: which slow bodies are contacting the luminaries and the angles, how long each lasts (use the tempo given), and what that season asks for. The natal points say what is being pressed on. This is the one question where the answer is legitimately about time — so be precise about duration and quote only the dates given." },
];
export const questionById = (id) => QUESTIONS.find((q) => q.id === id) || null;

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

// THE WHOLE SKY on a date, read against the chart — the wheel tab's one-paragraph reading.
//
// This builder exists because of a measured failure, and it is worth writing down what the failure WAS. The
// sky reading was the only one of the six sending the model bare coordinates and no corpus: a list of natal
// placements and a list of contacts, with the meanings left for the model to supply from whatever it had
// absorbed. Three live probes against the deployed route, same chart, 7 Aug 2026:
//
//   gemini-2.5-flash       — named ZERO of the three contacts. "Сьогодні ви відчуваєте внутрішню потребу
//                            переглянути свій публічний імідж…"  (house 10, paraphrased, unattributed)
//   gemini-2.5-flash-lite  — named all three, correctly.
//   gemini-2.5-flash       — named ZERO. "Цього дня ти відчуваєш напругу між особистими амбіціями…"
//
// So the primary provider was the one that drifted, and it drifted in the one direction that cannot be
// caught by a closed-world rule: it added no false fact, it simply declined to use the true ones. Every
// sentence was defensible and none of them was about this chart. The fix is the same as everywhere else in
// this file — hand the model the MEANING of each factor next to the factor, so that writing about the
// contact is easier than writing around it, and (in the prompt) require each sentence to name what it reads.
//
//   contacts  [{ c, transitLon, retro, natalHouse }] — `c` from natal.js `transits()`; `natalHouse` is the
//             house the NATAL point falls in, or null when that point IS an angle. Sorted here, tightest
//             first, and capped — the count is stated so the model knows it is not seeing the whole sky.
//   moon      { lon, house, retro } — the transiting Moon. Always supplied when it is on the wheel, contact
//             or no contact: it is the day's tempo, and on a day with nothing else in orb it is the only
//             honest thing the reading has to stand on.
// FOUR, and the number is measured rather than chosen. A real chart on an ordinary day had 17 contacts
// inside the 3° range; at six the block came to 5 988 characters against the mode's 6 000-character cap —
// twelve characters from silently losing its own composition rules off the end, which is the failure this
// registry's header warns about and the one that looks exactly like a model ignoring instructions. Four
// contacts is also all a 3–4 sentence reading can name, so the cap that matters is the reading's, not the
// transport's. (The mode's cap was raised to 8 000 in the same edit, so the margin is now real either way.)
const SKY_MAX = 4;
export function groundSky({ dateEN, houseSystem, contacts = [], moon = null, max = SKY_MAX }) {
  const sorted = [...contacts].sort((a, b) => a.c.orb - b.c.orb);
  const shown = sorted.slice(0, max);
  const lines = shown.map(({ c, transitLon, retro, natalHouse }) => {
    const tb = BODY[c.t], nb = BODY[c.n], na = ANGLE[c.n];
    const phase = c.applying == null ? "" : c.applying ? ", applying (building toward exact)" : ", separating (the exact contact has passed)";
    const H = natalHouse ? HOUSE[natalHouse - 1] : null;
    return `- transiting ${nameEN(c.t)}${retro ? " (retrograde)" : ""} in ${deg(transitLon)} ${c.type} natal ${nameEN(c.n)} in ${deg(c.natalLon)}${natalHouse ? `, house ${natalHouse}` : ""} — orb ${c.orb.toFixed(2)}°${phase}.
    ${nameEN(c.t)} is what arrives: as a transit it ${tb.act[en]}. How long this one lasts: ${tb.tempo[en]}. Under strain: ${tb.strain[en]}.
    The ${c.type}: ${ASPECT[c.type][en]}.
    ${na ? `${nameEN(c.n)} is the point touched: ${na.topic[en]} (${na.axis[en]}).` : `Natal ${nameEN(c.n)} is the function touched: ${nb.role[en]}.`}${H ? ` House ${natalHouse} is the field of life it happens in (${houseSystem} houses): ${H.topic[en]}; traditionally "${H.trad[en]}".` : ""}${retro ? ` ${nameEN(c.t)} is retrograde: ${RETRO_NOTE[en]}.` : ""}`;
  });
  const moonLine = moon
    // `tempo` is a noun phrase in the corpus ("27 days round the chart, …"), so it reads as a LABEL and not
    // as a predicate. Every other builder uses it after a colon for that reason; splicing it into a clause
    // ("and it 27 days round the chart") produced the one sentence in the block that was not English.
    ? `THE DAY'S FASTEST HAND: the transiting Moon is at ${deg(moon.lon)}${moon.house ? `, crossing natal house ${moon.house} (${HOUSE[moon.house - 1].topic[en]})` : ""}. The Moon ${BODY.moon.act[en]}. Its tempo: ${BODY.moon.tempo[en]}. This colours the day itself, not the period.`
    : "";
  const head = shown.length
    ? `CONTACTS — the transiting bodies touching this chart on ${dateEN}, tightest orb first${sorted.length > shown.length ? ` (the ${shown.length} tightest of ${sorted.length} in range)` : ""}:\n${lines.join("\n")}`
    : `CONTACTS: no transiting body is within orb of a natal point on ${dateEN}. Say that plainly — a quiet sky is a real reading, not a missing one — and read the day from the Moon below. Do not substitute a contact that is not listed here.`;
  const text = `${HEAD}
THE SKY ON ${dateEN}, read against this natal chart (${houseSystem} houses).
${head}${moonLine ? `\n${moonLine}` : ""}
MEANINGS above come from the app's sourced corpus. Lead with the tightest applying contact, because that is
the one arriving rather than leaving. Every sentence must be ABOUT one of the contacts named above — if a
sentence would read the same for a different chart, it does not belong in this reading.`;
  const sig = `s${CORPUS}|${dateEN}|${houseSystem}|${shown.map(({ c, retro }) => `${c.t}${retro ? "r" : ""}-${c.type}-${c.n}-${c.orb.toFixed(1)}-${c.applying == null ? "x" : c.applying ? "a" : "s"}`).join(",")}|${moon ? `m${signOf(moon.lon)}h${moon.house || 0}` : "-"}`;
  return { text, sig };
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

// One HOUSE, read from its cusp. This is the reading with the most actual technique in it, and the least
// obvious to someone looking at a table of twelve degrees: a house is not only its own topic, it is
// coloured by the sign on its cusp, and — the part that carries most of the meaning — it is DELEGATED to
// the ruler of that sign, which lives somewhere else in the chart entirely. "Your second house is in
// Sagittarius, and Jupiter, which rules it, sits in the eighth" is a real statement about money and other
// people's resources, and it is the one thing a degree column can never tell you.
//
//   ruler   { key, lon, house, retro } — the traditional ruler of the sign on the cusp, and where it lives.
//           null only if the caller could not resolve it (never expected: all twelve signs have one).
//   coRuler the modern outer co-ruler's key, or null. Passed separately and LABELLED, never merged in.
//   tenants [{ key, lon, retro }] — natal bodies that fall inside the house. Often empty, and an empty
//           house is not a silent house: the tradition reads it through the ruler, which is why the prompt
//           is told so explicitly rather than left to infer it from an absent list.
export function groundCusp({ house, cuspLon, houseSystem, ruler, coRuler = null, tenants = [] }) {
  const s = signOf(cuspLon), H = HOUSE[house - 1];
  const rSign = ruler ? signOf(ruler.lon) : null;
  const rDig = ruler ? dignityOf(ruler.key, rSign) : null;
  const lines = [
    `- house ${house}, the field of life: ${H.topic[en]}; traditionally "${H.trad[en]}".`,
    `- ${SIGN_EN[s]} on the cusp — the manner this area is approached in: it ${SIGN[s].mode[en]}. At its best: ${SIGN[s].gift[en]}. At its worst: ${SIGN[s].excess[en]}.`,
    ruler
      ? `- ${nameEN(ruler.key)} rules ${SIGN_EN[s]} and therefore RULES this house — which is not the same as standing in it. ${nameEN(ruler.key)} itself stands in ${SIGN_EN[rSign]}, in house ${ruler.house}${ruler.retro ? ", retrograde" : ""}${rDig && rDig !== "none" ? `, in ${rDig}` : ""}. ${nameEN(ruler.key)}: ${BODY[ruler.key].role[en]}. Where the ruler sits is where the affairs of house ${house} are carried out.`
      : null,
    coRuler ? `- ${nameEN(coRuler)} is the MODERN co-ruler of ${SIGN_EN[s]}; traditional astrology does not assign it. Say so if you use it.` : null,
    tenants.length
      ? `- STANDING IN house ${house}: ${tenants.map((p) => `${nameEN(p.key)} in ${SIGN_EN[signOf(p.lon)]}${p.retro ? " retrograde" : ""} (${BODY[p.key].role[en]})`).join("; ")}.`
      : `- no planet stands in house ${house}. In the tradition that is NOT an empty or inactive area — the house is read through its ruler, above. Do not describe it as lacking anything.`,
  ].filter(Boolean);
  const text = `${HEAD}
HOUSE ${house} (${houseSystem} houses), cusp at ${deg(cuspLon)}.
MEANINGS (the app's sourced corpus):
${lines.join("\n")}
Write about this ONE area of life: what it is, the manner the sign brings to it, and — the part that carries the most weight — where its ruler sits, because that is what connects this area to the rest of the chart.`;
  const sig = `h${CORPUS}|${house}|${s}|${houseSystem}|${ruler ? `${ruler.key}${rSign}${ruler.house}${ruler.retro ? "r" : ""}` : "-"}|${tenants.map((p) => p.key).join("")}`;
  return { text, sig };
}

// One catalogue question, answered from ONLY the factors it declares.
//
// The block is assembled from the question's own `houses`/`bodies`/`angles` lists rather than from the whole
// chart, and that is the point: a model handed an entire chart and asked about money will find something to
// say about the Moon, because there is always something to say. Handed the second house, its ruler, the
// eighth, Venus and Jupiter, it has to answer from those or say less.
//
//   chart  { cusps, houseSystem, points: [{key, lon, house, retro}], asc, mc }
//   timing null, or { dateEN, contacts: [{ c, transitLon, retro, hits: [label] }] } for a transit question.
//          The caller filters the contacts to the ones touching this question's points — the builder does
//          not, because only the caller knows what "touching" cost to compute.
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
export function groundQuestion({ q, chart, timing = null }) {
  const { cusps, houseSystem, points, asc, mc } = chart;
  const at = (key) => points.find((p) => p.key === key);
  const lines = [];

  for (const h of q.houses || []) {
    const cuspLon = cusps[h - 1], s = signOf(cuspLon);
    const r = rulerOf(cuspLon), rp = at(r.body);
    const tenants = points.filter((p) => p.house === h);
    lines.push(`- HOUSE ${h} (${houseSystem}) — ${HOUSE[h - 1].topic[en]}. ${SIGN_EN[s]} on the cusp: it ${SIGN[s].mode[en]}.` +
      (rp ? ` RULED BY ${nameEN(r.body)} (${BODY[r.body].role[en]}). ${nameEN(r.body)} does not stand in house ${h}; it stands in ${SIGN_EN[signOf(rp.lon)]}, house ${rp.house}${rp.retro ? ", retrograde" : ""}${dignityOf(r.body, signOf(rp.lon)) && dignityOf(r.body, signOf(rp.lon)) !== "none" ? `, in ${dignityOf(r.body, signOf(rp.lon))}` : ""} — and that is where the affairs of house ${h} are carried out.` : "") +
      (tenants.length ? ` STANDING IN house ${h}: ${tenants.map((p) => `${nameEN(p.key)} in ${SIGN_EN[signOf(p.lon)]}`).join(", ")}.` : ` No planet stands in it, which the tradition reads through the ruler above — not as an absence.`));
  }
  for (const k of q.bodies || []) {
    const p = at(k);
    if (!p) continue;
    const s = signOf(p.lon), d = dignityOf(k, s);
    lines.push(`- ${nameEN(k)} — ${BODY[k].role[en]}. In ${SIGN_EN[s]} (it ${SIGN[s].mode[en]}), house ${p.house}${p.retro ? ", retrograde" : ""}${d && d !== "none" ? `, in ${d} — ${DIGNITY[d][en]}` : ""}. Under strain: ${BODY[k].strain[en]}.` +
      (q.fields || []).map((f) => BODY[k][f] ? ` ${cap(f)}: ${BODY[k][f][en]}.` : "").join(""));
  }
  for (const a of q.angles || []) {
    const lon = a === "mc" ? mc : asc;
    lines.push(`- ${nameEN(a)} at ${deg(lon)} — ${ANGLE[a].topic[en]}. ${SIGN_EN[signOf(lon)]}: it ${SIGN[signOf(lon)].mode[en]}.`);
  }
  const tLines = (timing?.contacts || []).map(({ c, transitLon, retro, hits = [] }) =>
    `- transiting ${nameEN(c.t)}${retro ? " (retrograde)" : ""} in ${SIGN_EN[signOf(transitLon)]} ${c.type} natal ${nameEN(c.n)}, orb ${c.orb.toFixed(2)}°${c.applying == null ? "" : c.applying ? ", applying" : ", separating"}. ${nameEN(c.t)} as a transit ${BODY[c.t].act[en]}; it lasts ${BODY[c.t].tempo[en]}.${hits.length ? ` Exact: ${hits.join("; ")}.` : ""}`);

  // The model gets the full question (`ask`), never the topic word the catalogue shows: "Sex" as a prompt is
  // an invitation to write about whatever it likes, and the phrasing is what holds the answer to the chart.
  const text = `${HEAD}
QUESTION: ${q.ask || q.label[en]}
HOW TO READ IT: ${q.focus}
${timing ? `TRANSITS on ${timing.dateEN}:\n${tLines.length ? tLines.join("\n") : "- none within orb to the points below right now. Say so plainly; do not substitute another transit."}\n` : ""}NATAL FACTORS (the app's sourced corpus):
${lines.join("\n")}
Answer the question directly, in 4–6 sentences. Do not restate the placements as a list — say what they mean for this question.`;
  const sig = `q${CORPUS}|${q.id}|${houseSystem}|${(q.houses || []).map((h) => signOf(cusps[h - 1])).join(",")}|${(q.bodies || []).map((k) => { const p = at(k); return p ? `${k}${signOf(p.lon)}${p.house}${p.retro ? "r" : ""}` : k; }).join(",")}|${(q.angles || []).map((a) => signOf(a === "mc" ? mc : asc)).join(",")}${timing ? `|${timing.dateEN}|${(timing.contacts || []).map(({ c }) => `${c.t}${c.type}${c.n}${Math.round(c.orb)}`).join(",")}` : ""}`;
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

// TWO PEOPLE, read against each other — the compatibility tab's reading.
//
// This block differs from its five siblings in one structural way, and the prompt leans on it: the chart is
// only PARTLY known. A birth date without a time and place has no Ascendant, no Midheaven, no houses and
// therefore no house overlays, which is a whole standard layer of synastry that simply is not available —
// so the block says so in its own words rather than leaving the model to fill the silence. The reference
// instant is stated for the same reason: "noon" is a named convention for an unknown time, not a recovered
// one, and a reading that calls a noon position "your birth position" is making a claim the data cannot
// carry.
//
// The Moon gets its own line whenever the app reports it as time-sensitive. Measured on this ephemeris: the
// Moon moves 13.2° in a mean day (15.3° at its fastest), so a date-only Moon carries ±6.6° and it changes
// SIGN inside the birth day 43.8% of the time. That is not a footnote — it is the difference between a
// reading built on a Moon that is there and one built on a Moon that is a coin toss, and the model is told
// which of the two it has.
//
//   people   [{ label, points: [{ key, lon }] }] — exactly two, `label` being A/B as the app names them.
//   list     contacts() output, strongest first. Capped here; the total is stated so the model knows it is
//            not seeing all of them.
//   scores   score() output — supplied so the prose and the ring cannot disagree about which axis is high.
//   moonOpen true when either Moon changes sign inside the ±window the user can still move.
const MATCH_MAX = 5;
export function groundSynastry({ people, list = [], scores = null, refEN, moonOpen = false, max = MATCH_MAX }) {
  const [A, B] = people;
  const placements = (p) => p.points.map((pt) => {
    const s = signOf(pt.lon);
    return `- ${p.label}: ${nameEN(pt.key)} in ${SIGN_EN[s]} (that sign ${SIGN[s].mode[en]}). ${nameEN(pt.key)}: ${BODY[pt.key].role[en]}.`;
  }).join("\n");
  const shown = list.slice(0, max).map((c) =>
    `- ${A.label}'s ${nameEN(c.a)} ${c.type} ${B.label}'s ${nameEN(c.b)} — orb ${c.orb.toFixed(1)}° of a possible ${c.limit}°. The ${c.type}: ${ASPECT[c.type][en]}. ${nameEN(c.a)}: ${BODY[c.a].role[en]}. ${nameEN(c.b)}: ${BODY[c.b].role[en]}.`);
  const axes = scores ? `INDEX (this app's own formula, not a traditional score): together ${scores.overall}, core ${scores.core}, love ${scores.love}, emotion ${scores.emotion}, mind ${scores.mind}, passion ${scores.passion}. Out of 100.` : "";
  const text = `${HEAD}
TWO CHARTS COMPARED, ${A.label} and ${B.label}. Birth TIMES are unknown: both charts are cast for ${refEN}, which is a convention for an unknown time and not a recovered one. There are therefore NO houses, NO Ascendant, NO Midheaven and NO house overlays here — do not mention any of them, and do not say which area of life something falls in.
PLACEMENTS:
${placements(A)}
${placements(B)}
${shown.length ? `CONTACTS BETWEEN THE TWO CHARTS (${list.length} in orb, the ${shown.length} closest shown; orbs are the two planets' traditional moieties summed, so the Sun and Moon reach further than Mercury or Venus):\n${shown.join("\n")}` : "NO CONTACT between the two charts falls inside orb. Say that plainly and read the two sets of placements against each other instead — do not invent a contact."}
${moonOpen ? "CAUTION: at least one Moon changes sign inside the day, so its sign here is the one that holds at the stated instant and not a fact about the person. Read the Moon as provisional, and say once that a birth time would settle it.\n" : ""}${axes}
Write about these two as a pair, not as two separate portraits. Lead with the closest contact and what it does between them; then the second; then what the placements themselves set up regardless of contact. Name each contact by both planets and the aspect. Do not restate the index numbers as a list.`;
  const sig = `c${CORPUS}|${refEN}|${moonOpen ? "m" : "f"}|${people.map((p) => p.points.map((pt) => `${pt.key}${Math.round(pt.lon)}`).join("")).join("/")}`;
  return { text, sig };
}
