
import { assert, assertEquals } from "jsr:@std/assert@1";
import { BODY as sgBODY, SIGN as sgSIGN, HOUSE as sgHOUSE, ASPECT as sgASPECT, ANGLE as sgANGLE, DIGNITY as sgDIGNITY, dignityOf as sgDignity, chartRuler as sgChartRuler, balance as sgBalance, CORPUS as sgCORPUS, groundSky as sgGroundSky, groundTransit as sgGroundTransit, groundPlacement as sgGroundPlacement, groundPortrait as sgGroundPortrait, groundCusp as sgGroundCusp, rulerOf as sgRulerOf, spanLabel as sgSpan, QUESTIONS as sgQUESTIONS, questionById as sgQuestionById, groundQuestion as sgGroundQuestion } from "../signif.js";
import { TRANSIT_ASPECTS } from "../natal.js";


Deno.test("signif/corpus: every leaf is an [en, uk] pair, and neither half is missing", () => {
  const seen = { n: 0 };
  const walk = (node, path) => {
    if (Array.isArray(node) && typeof node[0] === "string") {
      seen.n++;
      assertEquals(node.length, 2, `${path}: a leaf must be exactly [en, uk]`);
      assert(node[0].trim() && node[1].trim(), `${path}: an empty half`);
      assert(node[0] !== node[1], `${path}: the Ukrainian half is a copy of the English`);
      return;
    }
    if (node && typeof node === "object") for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`);
  };
  for (const [name, table] of Object.entries({ BODY: sgBODY, SIGN: sgSIGN, HOUSE: sgHOUSE, ASPECT: sgASPECT, ANGLE: sgANGLE, DIGNITY: sgDIGNITY })) walk(table, name);
  assert(seen.n > 100, `only ${seen.n} corpus entries walked — the tables are not being reached`);
  assertEquals(Object.keys(sgBODY).length, 10);
  assertEquals(sgSIGN.length, 12);
  assertEquals(sgHOUSE.length, 12);
  assertEquals(Object.keys(sgASPECT).length, 5);
  for (const k of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) assert(sgBODY[k], `no corpus entry for ${k}`);
  for (const a of TRANSIT_ASPECTS) assert(sgASPECT[a.type], `no corpus entry for ${a.type}`);
});

Deno.test("signif/dignityOf: the classical table, with detriment and fall DERIVED", () => {
  const S = { ari: 0, tau: 1, gem: 2, can: 3, leo: 4, vir: 5, lib: 6, sco: 7, sag: 8, cap: 9, aqu: 10, pis: 11 };
  assertEquals(sgDignity("mars", S.ari), "domicile");
  assertEquals(sgDignity("mars", S.sco), "domicile", "Scorpio is Mars's by tradition; Pluto is only a modern co-ruler");
  assertEquals(sgDignity("saturn", S.aqu), "domicile", "Aquarius is Saturn's by tradition, not Uranus's");
  assertEquals(sgDignity("jupiter", S.pis), "domicile");
  assertEquals(sgDignity("mars", S.lib), "detriment");
  assertEquals(sgDignity("sun", S.aqu), "detriment");
  assertEquals(sgDignity("moon", S.cap), "detriment");
  assertEquals(sgDignity("sun", S.ari), "exaltation");
  assertEquals(sgDignity("moon", S.tau), "exaltation");
  assertEquals(sgDignity("jupiter", S.can), "exaltation");
  assertEquals(sgDignity("saturn", S.lib), "exaltation");
  assertEquals(sgDignity("mars", S.cap), "exaltation");
  assertEquals(sgDignity("venus", S.pis), "exaltation");
  assertEquals(sgDignity("sun", S.lib), "fall");
  assertEquals(sgDignity("moon", S.sco), "fall");
  assertEquals(sgDignity("jupiter", S.cap), "fall");
  assertEquals(sgDignity("saturn", S.ari), "fall");
  assertEquals(sgDignity("mars", S.can), "fall");
  assertEquals(sgDignity("venus", S.vir), "fall");
  assertEquals(sgDignity("mercury", S.vir), "domicile");
  assertEquals(sgDignity("mercury", S.pis), "detriment");
  assertEquals(sgDignity("mercury", S.gem), "domicile");
  assertEquals(sgDignity("sun", S.gem), "none");
  for (const b of ["uranus", "neptune", "pluto"]) {
    for (let s = 0; s < 12; s++) assertEquals(sgDignity(b, s), null, `${b} must carry no essential dignity`);
  }
  for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) {
    const tally = {};
    for (let s = 0; s < 12; s++) { const d = sgDignity(b, s); tally[d] = (tally[d] || 0) + 1; }
    assert((tally.domicile || 0) >= 1 && (tally.domicile || 0) <= 2, `${b}: ${tally.domicile} domiciles`);
    assertEquals(tally.domicile, tally.detriment, `${b}: detriment must mirror domicile exactly`);
    const masked = b === "mercury";
    assertEquals(tally.exaltation || 0, masked ? 0 : 1, `${b}: exaltation count`);
    assertEquals(tally.fall || 0, masked ? 0 : 1, `${b}: fall count`);
  }
  assertEquals(sgDignity("mars", 12), "domicile");
  assertEquals(sgDignity("mars", -12), "domicile");
});

Deno.test("signif/chartRuler: the convention is a CHOICE, and the answer says which one it used", () => {
  const aqu = 10 * 30 + 5;
  assertEquals(sgChartRuler(aqu), { sign: 10, body: "saturn", modern: false });
  assertEquals(sgChartRuler(aqu, { modern: true }), { sign: 10, body: "uranus", modern: true });
  assertEquals(sgChartRuler(5, { modern: true }), { sign: 0, body: "mars", modern: false });
});

Deno.test("signif/balance: a plain unweighted count over the bodies actually shown", () => {
  const b = sgBalance([1, 121, 241, 95]);
  assertEquals(b.elements, [3, 0, 0, 1]);
  assertEquals(b.modalities, [2, 1, 1]);
  assertEquals(b.topElement, 0);
  assertEquals(b.topModality, 0);
  assertEquals(sgBalance([]).elements, [0, 0, 0, 0]);
});

Deno.test("signif/groundSky: the day's contacts, tightest first, each with its corpus entry", () => {
  const saturn = { t: "saturn", n: "sun", type: "square", nature: "hard", angle: 90, natalLon: 102.4, orb: 1.3, applying: true };
  const mercury = { t: "mercury", n: "moon", type: "trine", nature: "soft", angle: 120, natalLon: 333.1, orb: 0.6, applying: false };
  const jupiter = { t: "jupiter", n: "venus", type: "sextile", nature: "soft", angle: 60, natalLon: 125.2, orb: 2.4, applying: true };
  const contacts = [
    { c: jupiter, transitLon: 248.3, retro: false, natalHouse: 11 },
    { c: saturn, transitLon: 22.7, retro: false, natalHouse: 10 },
    { c: mercury, transitLon: 133.9, retro: true, natalHouse: 6 },
  ];
  const moon = { lon: 155.2, house: 12, retro: false };
  const g = sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", contacts, moon });

  assert(g.text.includes("Use ONLY the facts and meanings below"), "the closed-world instruction is missing");
  for (const s of ["transiting Saturn", "transiting Mercury", "transiting Jupiter"]) {
    assert(g.text.includes(s), `${s} is missing from the block`);
  }
  const at = (s) => g.text.indexOf(s);
  assert(at("transiting Mercury") < at("transiting Saturn"), "contacts must be sorted by orb, tightest first");
  assert(at("transiting Saturn") < at("transiting Jupiter"), "contacts must be sorted by orb, tightest first");

  assert(/29 and a half years/.test(g.text), "the tempo must reach the model, or a Saturn transit reads like a mood");
  assert(g.text.includes("applying (building toward exact)"), "the phase carries which contact is arriving");
  assert(g.text.includes("separating"), "and which one is leaving");
  assert(g.text.includes("house 10"), "the natal house is the field of life the contact happens in");
  assert(g.text.includes("(placidus houses)"), "the house system must be named — Placidus and whole-sign disagree");
  assert(g.text.includes("retrograde"), "a retrograde transit must say so");
  assert(g.text.includes("crossing natal house 12"), "the Moon's own house is the day's field");

  assert(g.sig.startsWith(`s${sgCORPUS}|`), `the corpus version must ride in the key, got: ${g.sig}`);
  assertEquals(sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", contacts, moon }).sig, g.sig, "the key must be stable");
  assert(sgGroundSky({ dateEN: "8 Aug 2026", houseSystem: "placidus", contacts, moon }).sig !== g.sig, "the date must vary the key");
  assert(sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "whole", contacts, moon }).sig !== g.sig, "the house system must vary the key");
  assert(sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", contacts, moon: { ...moon, house: 1 } }).sig !== g.sig, "the Moon's house must vary the key");

  const ang = sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", moon,
    contacts: [{ c: { ...saturn, n: "asc", natalLon: 187.2 }, transitLon: 22.7, retro: false, natalHouse: null }] });
  assert(ang.text.includes("natal Ascendant"), "the angle is missing");
  assert(!/house null|house 0\b/.test(ang.text), "an angle must not print a null house");

  const many = sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", moon,
    contacts: Array.from({ length: 9 }, (_, i) => ({ c: { ...saturn, orb: i * 0.3 }, transitLon: 22.7, retro: false, natalHouse: 10 })) });
  assert(many.text.includes("the 4 tightest of 9 in range"), `the cap must be stated, got: ${many.text.slice(0, 200)}`);
  assert(many.text.length < 6000, `the block must stay well inside the mode cap, got ${many.text.length}`);

  const quiet = sgGroundSky({ dateEN: "7 Aug 2026", houseSystem: "placidus", contacts: [], moon });
  assert(quiet.text.includes("no transiting body is within orb"), "a quiet sky must be stated plainly");
  assert(quiet.text.includes("Do not substitute a contact that is not listed"), "and the substitution must be forbidden");
  assert(quiet.text.includes("THE DAY'S FASTEST HAND"), "the Moon is what a quiet day is read from");
  assert(quiet.sig !== g.sig, "a quiet sky is a different reading and a different key");
});

Deno.test("signif/groundTransit: the block is closed-world, and the signature moves with the facts", () => {
  const c = { t: "saturn", n: "sun", type: "square", nature: "hard", angle: 90, natalLon: 112.4, orb: 0.42, exact: true, applying: true };
  const g = sgGroundTransit({ c, transitLon: 22.7, natalHouse: 10, houseSystem: "placidus", retro: false, dateEN: "3 Aug 2026", hits: ["3 Aug 2026"] });
  assert(g.text.includes("Use ONLY the facts and meanings below"), "the closed-world instruction is missing");
  assert(g.text.includes("transiting Saturn square natal Sun"), "the configuration line is missing");
  assert(g.text.includes("applying"), "the phase must reach the model");
  assert(g.text.includes("house 10 (placidus)"), "the house system must be named — Placidus and whole-sign disagree");
  assert(/29 and a half years/.test(g.text), "the tempo must reach the model, or a Saturn transit reads like a mood");
  assert(g.text.includes("Under strain"), "the corpus's cost side must be present so the reading cannot be one-sided");

  const ms = (d) => Date.parse(d);
  const many = sgGroundTransit({ c, transitLon: 22.7, natalHouse: 10, houseSystem: "placidus", retro: true, dateEN: "3 Aug 2026",
    hits: [{ ms: ms("2026-08-03"), label: "3 Aug 2026" }, { ms: ms("2026-11-19"), label: "19 Nov 2026" }, { ms: ms("2027-05-02"), label: "2 May 2027" }] });
  assert(many.text.includes("perfects 3 times"), "the multi-pass fact is missing");
  assert(many.text.includes("about 9 months"), `the span must be stated, not left to be derived: ${many.text}`);
  assert(many.text.includes("retrograde"), "retrograde must be stated");
  assert(many.sig !== g.sig, "retrograde and the passes must change the cache key");

  const whole = sgGroundTransit({ c, transitLon: 22.7, natalHouse: 9, houseSystem: "whole", retro: false, dateEN: "3 Aug 2026", hits: ["3 Aug 2026"] });
  assert(whole.sig !== g.sig, "the house system must vary the key");
  assertEquals(sgGroundTransit({ c, transitLon: 22.7, natalHouse: 10, houseSystem: "placidus", retro: false, dateEN: "3 Aug 2026", hits: ["3 Aug 2026"] }).sig, g.sig, "and the key must be stable");

  const ang = sgGroundTransit({ c: { ...c, n: "asc" }, transitLon: 22.7, natalHouse: null, houseSystem: "placidus", retro: false, dateEN: "3 Aug 2026", hits: [] });
  assert(ang.text.includes("natal Ascendant"), "the angle is missing");
  assert(!ang.text.includes("house null"), "an angle must not print a null house");
});

Deno.test("signif/groundPlacement: what · how · where, plus dignity when the doctrine applies", () => {
  const g = sgGroundPlacement({ key: "mars", lon: 9 * 30 + 12, house: 4, houseSystem: "placidus", retro: false });
  assert(g.text.includes("Mars is the WHAT"));
  assert(g.text.includes("Capricorn is the HOW"));
  assert(g.text.includes("house 4 is the WHERE"));
  assert(g.text.includes("in exaltation"), "Mars is exalted in Capricorn and the reading should know it");
  assert(g.text.includes("ONE behaviour in ONE arena"), "the anti-two-paragraphs instruction is missing");
  const nep = sgGroundPlacement({ key: "neptune", lon: 300, house: 11, houseSystem: "whole", retro: true });
  assert(!/essential dignity/.test(nep.text), "Neptune must not be given a dignity it has no consensus for");
  assert(/retrograde at birth/.test(nep.text));
  assert(nep.sig !== sgGroundPlacement({ key: "neptune", lon: 300, house: 11, houseSystem: "whole", retro: false }).sig);
});

Deno.test("signif/groundPortrait: angles, chart ruler and balance, with the synthesis order stated", () => {
  const points = [
    { key: "sun", lon: 112, house: 10, retro: false },
    { key: "moon", lon: 300, house: 5, retro: false },
    { key: "mercury", lon: 120, house: 11, retro: true },
  ];
  const g = sgGroundPortrait({ points, asc: 95, mc: 355, houseSystem: "placidus", aspects: [{ a: "sun", b: "moon", type: "trine", orb: 1.2 }] });
  assert(g.text.includes("CHART RULER: Moon"), "Cancer rising is ruled by the Moon");
  assert(g.text.includes("BALANCE across 3 bodies"));
  assert(g.text.includes("Synthesise in this order"), "the method must be stated or the model just lists placements");
  assert(g.text.includes("natal Sun trine Moon"), "the tightest aspects are missing");
  assert(!/undefined|NaN/.test(g.text), "a hole in the block reads to the model as a fact");
  const m = sgGroundPortrait({ points, asc: 10 * 30 + 5, mc: 355, houseSystem: "placidus", modernRulers: true });
  assert(m.text.includes("modern ruler; traditionally Saturn"), "a contested convention must name itself");
  assert(m.sig !== g.sig);
});

Deno.test("signif/spanLabel: days, months or years — the unit the reader would actually use", () => {
  const d = (n) => n * 86400000;
  assertEquals(sgSpan(0, d(12)), "12 days");
  assertEquals(sgSpan(0, d(44)), "44 days");
  assertEquals(sgSpan(0, d(45)), "about 1 month");      
  assertEquals(sgSpan(0, d(273)), "about 9 months");    
  assertEquals(sgSpan(0, d(547)), "about 1.5 years");
  assertEquals(sgSpan(0, d(365)), "about 12 months");
  assertEquals(sgSpan(0, d(2557)), "about 7 years");
});

Deno.test("signif/groundCusp: a house is delegated to its ruler, and an empty house is not a silent one", () => {
  const g = sgGroundCusp({ house: 2, cuspLon: 8 * 30 + 14, houseSystem: "placidus",
    ruler: { key: "jupiter", lon: 3 * 30 + 2, house: 8, retro: false }, coRuler: null,
    tenants: [{ key: "venus", lon: 8 * 30 + 20, retro: false }] });
  assert(g.text.includes("HOUSE 2 (placidus houses)"), "the house and its system must be named");
  assert(g.text.includes("Jupiter rules Sagittarius and therefore RULES this house"));
  assert(g.text.includes("in house 8"), "where the ruler LIVES is the point of this reading");
  assert(g.text.includes("which is not the same as standing in it"), "the rules/stands-in distinction must be explicit");
  assert(g.text.includes("in exaltation"), "Jupiter is exalted in Cancer and the ruler's dignity should carry");
  assert(g.text.includes("STANDING IN house 2: Venus"));
  assert(!/undefined|NaN/.test(g.text));

  const empty = sgGroundCusp({ house: 7, cuspLon: 30, houseSystem: "whole",
    ruler: { key: "venus", lon: 200, house: 1, retro: true } });
  assert(empty.text.includes("no planet stands in house 7"));
  assert(empty.text.includes("Do not describe it as lacking anything"), "the empty-house trap must be closed explicitly");
  assert(empty.text.includes("retrograde"));
  assert(empty.sig !== g.sig);

  const co = sgGroundCusp({ house: 5, cuspLon: 7 * 30 + 1, houseSystem: "placidus",
    ruler: { key: "mars", lon: 10, house: 9, retro: false }, coRuler: "pluto" });
  assert(co.text.includes("Pluto is the MODERN co-ruler"), "a contested convention must name itself");
  assert(co.text.includes("Mars rules Scorpio"), "the traditional ruler still leads");

  const moved = sgGroundCusp({ house: 2, cuspLon: 8 * 30 + 14, houseSystem: "placidus",
    ruler: { key: "jupiter", lon: 3 * 30 + 2, house: 9, retro: false }, tenants: [{ key: "venus", lon: 8 * 30 + 20, retro: false }] });
  assert(moved.sig !== g.sig, "the ruler's own house must vary the key");
});

Deno.test("signif/rulerOf: the modern flag is a claim about the ANSWER, not about the request", () => {
  assertEquals(sgRulerOf(10 * 30 + 5, { modern: true }), { sign: 10, body: "uranus", modern: true });
  assertEquals(sgRulerOf(5, { modern: true }), { sign: 0, body: "mars", modern: false });
  assertEquals(sgRulerOf(5), { sign: 0, body: "mars", modern: false });
});

const QCHART = {
  houseSystem: "placidus",
  asc: 7 * 30 + 3, mc: 4 * 30 + 14,
  cusps: [213, 240, 275, 314, 348, 18, 33, 60, 95, 134, 168, 190],
  points: [
    { key: "sun", lon: 3 * 30 + 22, house: 9, retro: false },
    { key: "moon", lon: 22, house: 6, retro: false },
    { key: "mercury", lon: 4 * 30 + 6, house: 9, retro: false },
    { key: "venus", lon: 2 * 30 + 24, house: 8, retro: false },
    { key: "mars", lon: 30 + 1, house: 6, retro: false },
    { key: "jupiter", lon: 3 * 30 + 22, house: 9, retro: false },
    { key: "saturn", lon: 9 * 30 + 21, house: 3, retro: true },
  ],
};

Deno.test("signif/QUESTIONS: a closed catalogue, and what it deliberately does NOT ask", () => {
  assertEquals(sgQUESTIONS.length, 11);
  const ids = sgQUESTIONS.map((q) => q.id);
  assertEquals(new Set(ids).size, 11, "duplicate question id");
  for (const q of sgQUESTIONS) {
    assertEquals(q.label.length, 2, `${q.id}: label must be [en, uk]`);
    assert(q.label[0].trim() && q.label[1].trim() && q.label[0] !== q.label[1], `${q.id}: label halves`);
    for (const l of q.label) {
      assert(l.length <= 16 && l.split(/\s+/).length <= 2 && !/[?.]/.test(l),
        `${q.id}: label "${l}" is a sentence again — the catalogue takes a topic, the model takes q.ask`);
    }
    assert(q.ask && q.ask.length > 20 && q.ask.endsWith("?"), `${q.id}: ask must be the full English question`);
    assert(q.focus && q.focus.length > 80, `${q.id}: focus must state the technique, not a hint`);
    for (const h of q.houses || []) assert(h >= 1 && h <= 12, `${q.id}: house ${h}`);
    for (const k of q.bodies || []) assert(sgBODY[k], `${q.id}: unknown body ${k}`);
    for (const a of q.angles || []) assert(sgANGLE[a], `${q.id}: unknown angle ${a}`);
    assert((q.houses?.length || 0) + (q.bodies?.length || 0) + (q.angles?.length || 0) > 0, `${q.id}: no significators`);
  }
  const banned = /child|pregnan|health|illness|\bdie\b|death|lawsuit|invest|wealth|дитин|дітей|вагітн|здоров|смерт|помр|позов|інвест|багатств/i;
  for (const q of sgQUESTIONS) {
    assert(!banned.test(q.label[0]) && !banned.test(q.label[1]) && !banned.test(q.ask),
      `${q.id}: asks for an outcome the chart cannot establish`);
  }
  assertEquals(sgQUESTIONS.filter((q) => q.transit).length, 2);
  assertEquals(sgQUESTIONS.filter((q) => q.transit).map((q) => q.id), ["workNow", "phase"]);
  assertEquals(sgQuestionById("love").id, "love");
  assertEquals(sgQuestionById("nope"), null);
});

Deno.test("signif/groundQuestion: the block contains the declared factors and NOTHING else", () => {
  const money = sgQuestionById("money");
  const g = sgGroundQuestion({ q: money, chart: QCHART });
  assert(g.text.includes("QUESTION: What is my pattern with money"));
  assert(g.text.includes("HOW TO READ IT:"), "the technique must travel with the question");
  const sexBlock = sgGroundQuestion({ q: sgQuestionById("sex"), chart: QCHART });
  assert(sexBlock.text.includes("QUESTION: What is my nature in desire and intimacy?"), "ask must reach the model");
  assert(!/QUESTION: Sex/.test(sexBlock.text), "the topic label reached the prompt instead of the question");
  assert(g.text.includes("HOUSE 2 (placidus)"), "the declared house is missing");
  assert(g.text.includes("HOUSE 8 (placidus)"));
  assert(g.text.includes("Venus") && g.text.includes("Jupiter"), "the declared bodies are missing");
  assert(!/- Moon —/.test(g.text), "the Moon is not a money significator and must not be supplied");
  assert(!/HOUSE 7|HOUSE 10/.test(g.text), "an undeclared house leaked into the block");
  assert(!/undefined|NaN/.test(g.text));

  assert(/RULED BY \w+ \(/.test(g.text), "the house ruler must be named");
  assert(/does not stand in house \d; it stands in \w+, house \d/.test(g.text),
    "ruling a house and standing in it must be stated as different things — a model conflated them on the live route");
  assert(/No planet stands in it, which the tradition reads through the ruler/.test(g.text) || /STANDING IN house \d:/.test(g.text));

  assertEquals(sgGroundQuestion({ q: money, chart: QCHART }).sig, g.sig);
  assert(sgGroundQuestion({ q: sgQuestionById("love"), chart: QCHART }).sig !== g.sig, "question must vary the key");
  const moved = { ...QCHART, cusps: QCHART.cusps.map((c, i) => (i === 1 ? c + 40 : c)) };
  assert(sgGroundQuestion({ q: money, chart: moved }).sig !== g.sig, "a cusp moving sign must vary the key");
});

Deno.test("signif/groundQuestion: a timing question leads with transits, and says so when there are none", () => {
  const phase = sgQuestionById("phase");
  const c = { t: "saturn", n: "sun", type: "square", nature: "hard", angle: 90, natalLon: 112, orb: 0.4, exact: true, applying: true };
  const g = sgGroundQuestion({ q: phase, chart: QCHART,
    timing: { dateEN: "25 Jul 2026", contacts: [{ c, transitLon: 22, retro: false, hits: ["3 Aug 2026"] }] } });
  assert(g.text.includes("TRANSITS on 25 Jul 2026"));
  assert(g.text.includes("transiting Saturn in Aries square natal Sun"));
  assert(g.text.includes("29 and a half years"), "the tempo must travel, or a slow transit reads as a mood");
  assert(g.text.includes("Exact: 3 Aug 2026"));

  const none = sgGroundQuestion({ q: phase, chart: QCHART, timing: { dateEN: "25 Jul 2026", contacts: [] } });
  assert(none.text.includes("none within orb"));
  assert(none.text.includes("do not substitute another transit"));
  assert(none.sig !== g.sig, "the contact set must vary the key");

  assert(!sgGroundQuestion({ q: sgQuestionById("home"), chart: QCHART }).text.includes("TRANSITS"));
});
