// microspec runtime — pure-logic unit tests (no browser, no import map).
//   deno test -A packages/runtime/runtime_test.js
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { validateSpec } from "./validate.js";
import { T, dictFor, ago, whenLabel } from "./i18n.js";
import { bjorklund, rotate, syncopation, syncopationNorm, harmonicity, grooveU, mulberry32, generateGroove, buildCandidate, scoreGroove, METRIC_WEIGHTS } from "./groove.js";
import { fingeredSemitone, handCovered } from "./wind.js";
import { field, declination, decimalYear, inRange, EPOCH, trueFrom } from "./geomag.js";
import { meanFix, stationaryTail, segErr, totalErr, usableFix, BIAS_FRAC } from "./geofix.js";
import { hapticFor } from "./sensors.js";
import { eaqiBand, pollutantBand, pollenBand, AQI_BANDS, POLLEN_BANDS } from "./air.js";
import { feedback, solved, makeSecret } from "./codebreak.js";
import { rgbToHex, rgbToHsl, avgColor, luminance, ink, palette } from "./colour.js";
import { hueToNote, paletteToChord, brightnessToCutoff, satToDetune, SCALES } from "./chroma.js";
import { motionCells, motionEnergy, centroidOf } from "./motion.js";
import { analyzeQR } from "./urlsafe.js";
import { qrMatrix } from "./qrcode.js";
import { fitResolution } from "./imgsize.js";
import { sunSign, reading } from "./horoscope.js";
import { resumeAt, RESUME_MIN } from "./playback.js";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";

const i18n = { en: { hi: "hi" }, uk: { hi: "привіт" } };
const baseList = () => ({
  // translate is not incidental here: a feed card.body is API prose, and the contract requires it be
  // translated (or the app declare spec.localized). A fixture without it would not be a legal app.
  id: "app", i18n, translate: ["desc"],
  tabs: [{ id: "feed", type: "list", icon: "lucide:list", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }],
});

Deno.test("validateSpec accepts one valid tab per family", () => {
  // list
  validateSpec(baseList());
  // list/row
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "code", trailing: "rate" } }] });
  // converter
  validateSpec({ ...baseList(), tabs: [{ id: "c", type: "converter", icon: "i", label: "hi", codeField: "code", rateField: "rate", base: "USD" }] });
  // profile
  validateSpec({ ...baseList(), tabs: [{ id: "me", type: "profile", icon: "i", label: "hi" }] });
  // dashboard
  validateSpec({ ...baseList(), tabs: [{ id: "d", type: "dashboard", icon: "i", label: "hi", hero: { value: "temp" } }] });
  // tool
  validateSpec({ ...baseList(), tabs: [{ id: "t", type: "tool", icon: "i", label: "hi", view: "ruler" }] });
});

Deno.test("validateSpec accepts detail + filters + searchFetch", () => {
  const spec = baseList();
  spec.tabs[0].search = true;
  spec.tabs[0].searchFetch = true;
  spec.detail = { title: "name", rows: [{ field: "bio", label: "hi" }], actions: [{ href: "url", label: "hi" }] };
  spec.filters = { controls: [{ type: "segment", key: "lang", label: "hi", options: [["en", "hi"]] }] };
  validateSpec(spec);
});

Deno.test("validateSpec throws path-named errors", () => {
  const cases = [
    [{}, "spec.id"],
    [{ id: "a", i18n, tabs: [] }, "spec.tabs"],
    [{ id: "a", tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "feed", title: "x" } }] }, "spec.i18n"],
    [{ ...baseList(), fav: {} }, "spec.fav.key"],
    [{ ...baseList(), tabs: [{ id: "t", type: "lst", icon: "i", label: "l" }] }, "spec.tabs[0].type"],
    [{ ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "feed" } }] }, "spec.tabs[0].card.title"],
    [{ ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "row", title: "x" } }] }, "spec.tabs[0].card.lead"],
    [{ ...baseList(), tabs: [{ id: "t", type: "converter", icon: "i", label: "l" }] }, "spec.tabs[0].codeField"],
    [{ ...baseList(), tabs: [{ id: "t", type: "tool", icon: "i", label: "l" }] }, "spec.tabs[0].view"],
    [{ ...baseList(), tabs: [{ id: "t", type: "dashboard", icon: "i", label: "l" }] }, "spec.tabs[0].hero"],
    [{ ...baseList(), detail: { rows: [] } }, "spec.detail.title"],
    [{ ...baseList(), filters: { controls: [{ type: "select", key: "k", label: "l" }] } }, "spec.filters.controls[0].optionsFrom"],
  ];
  for (const [spec, path] of cases) {
    const err = assertThrows(() => validateSpec(spec), Error);
    assert(err.message.includes(path), `expected error to name "${path}", got: ${err.message}`);
  }
});

Deno.test("validateSpec: feed card needs a preview slot (no raw title-only cards)", () => {
  const raw = { ...baseList(), tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name" } }] };
  const err = assertThrows(() => validateSpec(raw), Error);
  assert(err.message.includes("spec.tabs[0].card") && /preview slot/.test(err.message), err.message);
  // any one preview slot satisfies it (a `body` slot also has to declare its translation — see the
  // body-prose contract test below; that is a separate rule, not this one)
  for (const slot of ["subtitle", "body", "image"]) {
    validateSpec({ ...baseList(), translate: ["x"], tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", [slot]: "x" } }] });
  }
  // row layout is exempt (compact title+value line)
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
});

Deno.test("validateSpec: grid layout (launcher) needs a tile, exempt from feed density", () => {
  const gridTab = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", title: "title", ...card } }] });
  // icon or image satisfies the tile requirement
  validateSpec(gridTab({ icon: "glyph" }));
  validateSpec(gridTab({ image: "iconUrl" }));
  // a grid with neither is rejected (needs a tile), NOT the feed "preview slot" message
  const err = assertThrows(() => validateSpec(gridTab({})), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs a tile/.test(err.message), err.message);
});

Deno.test("validateSpec: searchFetch requires search:true", () => {
  const spec = baseList();
  spec.tabs[0].searchFetch = true; // no search:true
  const err = assertThrows(() => validateSpec(spec), Error);
  assert(err.message.includes("searchFetch requires search"));
});

Deno.test("validateSpec: spec.v mismatch rejected", () => {
  assertThrows(() => validateSpec({ ...baseList(), v: 99 }), Error, "spec.v");
});

Deno.test("T interpolates and falls back to the raw key", () => {
  assertEquals(T({ greet: "hi {name}" }, "greet", { name: "Dan" }), "hi Dan");
  assertEquals(T({}, "missing"), "missing");
  assertEquals(T({ n: "{a}+{b}={c}" }, "n", { a: 1, b: 2, c: 3 }), "1+2=3");
});

Deno.test("dictFor picks locale then falls back to en", () => {
  assertEquals(dictFor(i18n, "uk").hi, "привіт");
  assertEquals(dictFor(i18n, "de").hi, "hi"); // no de → en fallback
  assertEquals(dictFor(null, "en"), {});
});

Deno.test("ago is relative and locale-aware", () => {
  const d = { agoToday: "today", agoYesterday: "yesterday", agoDays: "{n}d", agoWeeks: "{n}w" };
  const day = 86400000;
  assertEquals(ago(d, Date.now() - day * 0.1, "en"), "today");
  assertEquals(ago(d, Date.now() - day, "en"), "yesterday");
  assertEquals(ago(d, Date.now() - day * 3, "en"), "3d");
  assertEquals(ago(d, Date.now() - day * 14, "en"), "2w");
  assert(/\d{4}/.test(ago(d, Date.now() - day * 400, "en"))); // old → full date with year
});

Deno.test("whenLabel: locale-aware absolute + future countdown", () => {
  const d = { whenPast: "now", whenMin: "in {n}m", whenHours: "in {n}h", whenDays: "in {n}d" };
  const uk = { whenPast: "щойно", whenMin: "за {n} хв", whenHours: "за {n} год", whenDays: "за {n} дн" };
  const min = 60000;
  assert(/in 30m$/.test(whenLabel(d, Date.now() + 30 * min, "en")), "en minutes");
  assert(/in 3h$/.test(whenLabel(d, Date.now() + 180 * min, "en")), "en hours");
  assert(/за 3 дн$/.test(whenLabel(uk, Date.now() + 3 * 1440 * min, "uk")), "uk days");
  assertEquals(whenLabel(d, Date.now() - min, "en").split(" · ").pop(), "now"); // past → now
  assert(!/·/.test(whenLabel(d, Date.now() + 30 * min, "en", false)), "full=false omits relative");
  assertEquals(whenLabel(d, undefined, "en"), ""); // bad ts → empty, never throws
});

// ---- groove theory (packages/runtime/groove.js) ----
// These tests are the proof behind the "generated, not random" claim. They run in the browser-free unit
// gate, so the claim is enforced on every push rather than asserted in prose.

const str = (p) => p.map((v) => (v ? "x" : ".")).join("");

Deno.test("bjorklund reproduces Toussaint's traditional rhythms", () => {
  // Toussaint (2005): the Euclidean algorithm's outputs ARE world rhythms. If these break, the whole
  // premise ("the vocabulary is a formula") is gone.
  assertEquals(str(bjorklund(3, 8)), "x..x..x.", "tresillo (Cuba)");
  assertEquals(str(bjorklund(5, 8)), "x.xx.xx.", "cinquillo (Cuba)");
  assertEquals(str(bjorklund(2, 5)), "x.x..", "E(2,5)");
  assertEquals(str(bjorklund(4, 16)), "x...x...x...x...", "four-on-the-floor");
  assertEquals(str(bjorklund(5, 16)), "x..x..x..x..x...", "bossa-nova clave");
});

Deno.test("bjorklund edges: k<=0, k>=n, n=0 never throw", () => {
  assertEquals(str(bjorklund(0, 8)), "........");
  assertEquals(str(bjorklund(8, 8)), "xxxxxxxx");
  assertEquals(str(bjorklund(99, 4)), "xxxx");     // k>n clamps, no crash
  assertEquals(bjorklund(3, 0), []);
  assertEquals(str(bjorklund(-2, 4)), "....");
});

Deno.test("rotate preserves onset count and wraps both ways", () => {
  const p = bjorklund(3, 8);
  assertEquals(rotate(p, 8).join(), p.join(), "full turn = identity");
  assertEquals(str(rotate(p, 1)), "..x..x.x");
  assertEquals(rotate(p, -3).filter(Boolean).length, 3, "negative rotation keeps onsets");
});

Deno.test("syncopation (Longuet-Higgins & Lee): four-on-the-floor is zero, a held offbeat is not", () => {
  assertEquals(syncopation(bjorklund(4, 16)), 0, "the metre's own pulse cannot syncopate against itself");
  assertEquals(syncopation(Array(16).fill(false)), 0, "silence is not syncopated");
  // A note on step 3 (weight -4) sounding across the strong step 8 (weight -1) outlasts its unit → 3.
  const held = Array(16).fill(false); held[0] = true; held[3] = true;
  assertEquals(syncopation(held), 3);
  assert(syncopationNorm(bjorklund(4, 16)) === 0);
  assert(syncopationNorm(held) > 0 && syncopationNorm(held) <= 1, "normalised into 0..1");
});

Deno.test("harmonicity (Bowling & Purves): consonance follows small-integer ratios", () => {
  assert(harmonicity(0) > harmonicity(7), "unison beats the fifth");
  assert(harmonicity(7) > harmonicity(5), "fifth (3:2) beats the fourth (4:3)");
  assert(harmonicity(5) > harmonicity(6), "fourth beats the tritone (45:32)");
  assert(harmonicity(6) < harmonicity(3), "the tritone is the least harmonic interval");
  assertEquals(harmonicity(12), harmonicity(0), "the octave is the unison's equivalence class");
  for (const s of [-5, 0, 7, 19, 400]) assert(harmonicity(s) > 0 && harmonicity(s) <= 1, `bounded at ${s}`);
});

Deno.test("grooveU is the Witek inverted-U: peaks at mu, falls off both sides", () => {
  const mu = 0.42, sigma = 0.18;
  assertEquals(grooveU(mu, mu, sigma), 1, "peak at the sweet spot");
  assert(grooveU(0, mu, sigma) < grooveU(mu, mu, sigma), "no syncopation scores worse than medium");
  assert(grooveU(1, mu, sigma) < grooveU(mu, mu, sigma), "chaos scores worse than medium");
  assert(Math.abs(grooveU(mu - 0.1, mu, sigma) - grooveU(mu + 0.1, mu, sigma)) < 1e-9, "symmetric");
});

Deno.test("mulberry32 is deterministic and in range", () => {
  assertEquals(mulberry32(42)(), mulberry32(42)(), "same seed → same stream");
  assert(mulberry32(1)() !== mulberry32(2)(), "different seeds diverge");
  const r = mulberry32(7);
  for (let i = 0; i < 200; i++) { const v = r(); assert(v >= 0 && v < 1); }
});

// A miniature of rave's voice vocabulary — enough bands to exercise the scorer.
const ROLES = [
  { id: "kick", band: "low", ks: [4, 5, 6], rots: [0], p: 1 },
  { id: "sub", band: "low", ks: [4, 6, 7], rots: [0, 2], p: 0.8, bass: true },
  { id: "clap", band: "mid", ks: [2, 4], rots: [4, 12], p: 0.7, backbeat: true },
  { id: "acid", band: "mid", ks: [5, 7, 9, 11], rots: [0, 1, 2, 3], p: 0.8, bass: true },
  { id: "stab", band: "mid", ks: [2, 3, 4, 5], rots: [0, 2, 4], p: 0.5 },
  { id: "hat", band: "high", ks: [8, 11, 13, 16], rots: [0, 1, 2], p: 0.9 },
  { id: "ride", band: "high", ks: [4, 8], rots: [0, 2], p: 0.3 },
];

Deno.test("generateGroove is deterministic, seed-addressable, and always lands a downbeat kick", () => {
  const a = generateGroove(ROLES, { seed: 12345 }), b = generateGroove(ROLES, { seed: 12345 });
  assertEquals(JSON.stringify(a.tracks), JSON.stringify(b.tracks), "same seed → same beat (shareable)");
  assertEquals(JSON.stringify(a.riff), JSON.stringify(b.riff), "same seed → same bass line");
  assert(JSON.stringify(generateGroove(ROLES, { seed: 1 }).tracks) !== JSON.stringify(a.tracks), "seeds differ");
  for (let seed = 0; seed < 24; seed++) {
    const g = generateGroove(ROLES, { seed });
    assert(g.tracks.kick[0], `seed ${seed}: no kick on the downbeat — nothing to dance to`);
    assertEquals(g.riff.length, 16, `seed ${seed}: riff must cover the bar`);
    // Voices outside the drawn line-up are simply absent — the app spreads the result over its empty grid.
    for (const id of g.voices) assertEquals(g.tracks[id].length, 16, `seed ${seed}: ${id} wrong length`);
    assertEquals(Object.keys(g.tracks).sort().join(), [...g.voices].sort().join(), `seed ${seed}: tracks must match the line-up`);
  }
});

Deno.test("THE CLAIM: the scored search beats random — it is not a dice roll", () => {
  // A naive coin-flip pattern (what "random" means in most drum machines) vs generateGroove, scored by the
  // same research-backed function. If the search ever stops winning, this app's premise is false.
  const coinFlip = (rng) => ({
    tracks: Object.fromEntries(ROLES.map((r) => [r.id, Array.from({ length: 16 }, () => rng() < 0.4)])),
    riff: Array.from({ length: 16 }, () => Math.floor(rng() * 13)),
  });
  let searchWins = 0, sumSearch = 0, sumRandom = 0;
  const SEEDS = 40;
  for (let seed = 0; seed < SEEDS; seed++) {
    const g = generateGroove(ROLES, { seed });
    const rnd = coinFlip(mulberry32(seed ^ 0x9e3779b9));
    const rs = scoreGroove(rnd, ROLES);
    sumSearch += g.score; sumRandom += rs;
    if (g.score > rs) searchWins++;
    assert(g.score >= g.meanScore, `seed ${seed}: winner below its own pool mean`);
  }
  assertEquals(searchWins, SEEDS, "the search must beat coin-flip random on EVERY seed");
  assert(sumSearch / SEEDS > sumRandom / SEEDS + 1, "the margin must be decisive, not noise");
});

Deno.test("generated beats land in the researched sweet spots (random ones do not)", () => {
  const merge = (tracks, band) => {
    const ids = ROLES.filter((r) => r.band === band).map((r) => r.id);
    return Array.from({ length: 16 }, (_, i) => ids.some((id) => tracks[id]?.[i]));
  };
  let lowOk = 0, midOk = 0;
  const SEEDS = 30;
  for (let seed = 0; seed < SEEDS; seed++) {
    const g = generateGroove(ROLES, { seed });
    // The low end anchors the metre (Witek's "pulse"): near-zero syncopation.
    if (syncopationNorm(merge(g.tracks, "low")) <= 0.3) lowOk++;
    // The mid band drives the groove: medium syncopation — the peak of the inverted U, never 0 and never 1.
    const mid = syncopationNorm(merge(g.tracks, "mid"));
    if (mid > 0.05 && mid < 0.8) midOk++;
  }
  assertEquals(lowOk, SEEDS, "the low end must hold the pulse on every seed");
  assert(midOk >= SEEDS * 0.9, `mid-band syncopation off the Witek peak too often (${midOk}/${SEEDS})`);
});

Deno.test("scoreGroove punishes a floorless beat and rewards the backbeat", () => {
  const base = buildCandidate(mulberry32(3), ROLES);
  // The penalty is on the BAND, not one track: any low voice on the downbeat anchors the metre, so silence
  // the whole low end to test it (killing just the kick still leaves the sub holding the floor).
  const lowIds = ROLES.filter((r) => r.band === "low").map((r) => r.id);
  const floorless = { ...base, tracks: { ...base.tracks, ...Object.fromEntries(lowIds.map((id) => [id, Array(16).fill(false)])) } };
  assert(scoreGroove(floorless, ROLES) < scoreGroove(base, ROLES), "no low end on the downbeat must cost");
  const withBack = { ...base, tracks: { ...base.tracks, clap: Array.from({ length: 16 }, (_, i) => i === 4 || i === 12) } };
  const noBack = { ...base, tracks: { ...base.tracks, clap: Array(16).fill(false) } };
  assert(scoreGroove(withBack, ROLES) > scoreGroove(noBack, ROLES), "a 2-and-4 backbeat must pay");
});

Deno.test("METRIC_WEIGHTS is the LHL 4/4 tree", () => {
  assertEquals(METRIC_WEIGHTS.length, 16);
  assertEquals(METRIC_WEIGHTS[0], 0, "the downbeat is strongest");
  assert(METRIC_WEIGHTS[8] > METRIC_WEIGHTS[4], "beat 3 outranks beat 2");
  assert(METRIC_WEIGHTS[4] > METRIC_WEIGHTS[2], "quarters outrank eighths");
  assert(METRIC_WEIGHTS[2] > METRIC_WEIGHTS[1], "eighths outrank sixteenths");
  for (const i of [1, 3, 5, 7, 9, 11, 13, 15]) assertEquals(METRIC_WEIGHTS[i], -4, `offbeat ${i}`);
});

Deno.test("the line-up is drawn once per generation → pressing Generate keeps surprising", () => {
  // Regression guard for a real defect: when the search chose the instrumentation per candidate, argmax
  // converged on the same 4 "safest" voices and near-identical patterns on every seed — a generator you
  // press twice. Variety must come from the line-up draw, not from luck.
  const lineups = new Set(), patterns = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const g = generateGroove(ROLES, { seed });
    lineups.add(g.voices.join("+"));
    patterns.add(JSON.stringify(g.tracks));
    assert(g.voices.some((id) => ROLES.find((r) => r.id === id)?.band === "low"), `seed ${seed}: floorless beat`);
  }
  assert(lineups.size >= 12, `only ${lineups.size} distinct line-ups over 60 presses — the generator is stuck`);
  assert(patterns.size >= 40, `only ${patterns.size} distinct patterns over 60 presses — too repetitive`);
});

Deno.test("scoreGroove punishes two voices playing the identical figure (doubling, not arrangement)", () => {
  const fig = Array.from({ length: 16 }, (_, i) => i % 4 === 1);
  const base = buildCandidate(mulberry32(11), ROLES);
  const distinct = { ...base, tracks: { ...base.tracks, acid: fig, stab: fig.map((_, i) => i % 8 === 2) } };
  const doubled = { ...base, tracks: { ...base.tracks, acid: fig, stab: [...fig] } };
  assert(scoreGroove(doubled, ROLES) < scoreGroove(distinct, ROLES), "duplicate figures must cost");
});

Deno.test("validateSpec: a card that leaves the app needs a detail (the drill-down contract)", () => {
  // The farm's rule: a tap opens the IN-APP detail; the outbound link lives in detail.actions. Without
  // spec.detail the runtime renders the card as <a target="_blank">, so the tap throws the user out to the
  // source before they can read, save, or even see what the item is. books, dou and hn all shipped that
  // way — the pattern existed, nothing enforced it.
  const withHref = () => ({ ...baseList(), tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", href: "url", title: "name", body: "desc" } }] });
  const err = assertThrows(() => validateSpec(withHref()), Error);
  assert(err.message.includes("spec.tabs[0].card.href") && /detail/.test(err.message), err.message);

  // …and passes once a detail exists.
  validateSpec({ ...withHref(), detail: { title: "name", body: "desc", actions: [{ href: "url", label: "open" }] } });
  // A card with no href never needed one.
  validateSpec(baseList());

  // `grid` is exempt — the launcher tile, where leaving IS the point (it opens another app).
  validateSpec({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", href: "url", title: "title", icon: "glyph" } }] });
});

Deno.test("validateSpec: detail.body is an accepted long-form slot", () => {
  // The card can only ever show a 2-line clamp; without a body slot the drill-down was thinner than the
  // thing it drilled into.
  validateSpec({ ...baseList(), detail: { title: "name", body: "desc" } });
  validateSpec({ ...baseList(), detail: { title: "name" } });   // still optional
});

Deno.test("validateSpec: feed body prose must be translated (or declared already-localized)", () => {
  // dou shipped English job descriptions into a Ukrainian UI for months. The translate engine existed and
  // five apps used it; dou just never declared it, and nothing asked.
  const feedBody = () => { const s = { ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }] }; delete s.translate; return s; };
  const err = assertThrows(() => validateSpec(feedBody()), Error);
  assert(err.message.includes("spec.tabs[0].card.body") && /translate/.test(err.message), err.message);

  validateSpec({ ...feedBody(), translate: ["desc"] });          // translated at render time
  validateSpec({ ...feedBody(), localized: true });              // adapter already returns the active locale

  // Scoped to `body` on purpose: identifiers must NOT be machine-translated. A row card of names/values
  // (crypto, rates) and a subtitle holding an address stay legal untouched — translating "Bitcoin" or
  // "Khreshchatyk 1" would corrupt them, not localize them.
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
  validateSpec({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", subtitle: "addr" } }] });
});

// ---- wind: fipple-flute fingering (packages/runtime/wind.js) ----
// The rule is physics, so it is checkable against the real charts players use — that is the whole reason
// it is a rule and not a transcribed table.

const SOPILKA = [11, 9, 7, 5, 4, 2, 0];                       // C-major prima: index = holes covered from the top
const fing = (s) => new Set([...s].map((c, i) => (c === "●" ? i : -1)).filter((i) => i >= 0));

Deno.test("fingeredSemitone: the diatonic staircase (all six covered → tonic, lift from the bottom)", () => {
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);   // До
  assertEquals(fingeredSemitone(fing("●●●●●○"), SOPILKA), 2);   // Ре
  assertEquals(fingeredSemitone(fing("●●●●○○"), SOPILKA), 4);   // Мі
  assertEquals(fingeredSemitone(fing("●●●○○○"), SOPILKA), 5);   // Фа
  assertEquals(fingeredSemitone(fing("●●○○○○"), SOPILKA), 7);   // Соль
  assertEquals(fingeredSemitone(fing("●○○○○○"), SOPILKA), 9);   // Ля
  assertEquals(fingeredSemitone(fing("○○○○○○"), SOPILKA), 11);  // Сі
});

Deno.test("fingeredSemitone: a fork flattens — the canonical cross-fingering", () => {
  // The reference case every whistle chart carries: C natural on a D whistle is ○●●○○○ — top hole open, so
  // the base is the seventh (C♯), and two holes covered BELOW the opening flatten it a semitone. Transposed
  // to a C sopilka the same fingering must give B♭ (A♯ = 10), a semitone under the open-holes B.
  assertEquals(fingeredSemitone(fing("○●●○○○"), SOPILKA), 10);
  // …and the rest of the chromatics fall out of the same line, unasked:
  assertEquals(fingeredSemitone(fing("●●●●○●"), SOPILKA), 3);   // Ре♯ (base Мі, forked)
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);   // Фа♯ (base Соль, forked)
  assertEquals(fingeredSemitone(fing("●○●●●●"), SOPILKA), 8);   // Соль♯ (base Ля, forked)
});

Deno.test("fingeredSemitone: only holes BELOW the first opening fork it", () => {
  // A hole covered below an opening flattens; the opening itself still decides the base. Covering MORE
  // below does not flatten further — a fork is a semitone, not a slider.
  assertEquals(fingeredSemitone(fing("●●○●○○"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);
  // All covered has no opening, so it can never be forked.
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);
  // Generic over the family: the scale and hole count are the caller's, not the runtime's.
  assertEquals(fingeredSemitone(new Set([0]), [7, 5, 0]), 5);   // a 2-hole pipe, its own tuning
});

Deno.test("handCovered: one finger must play the scale — the bug that made the pipe sound one note", () => {
  // Shipped without this and every hole on the instrument sounded Ля or Ля♯. Not a tuning error: a single
  // touch is a single hole, and a lone hole never forms the consecutive run from the top that sets the air
  // column, so the pitch collapsed to "nothing stopped, one fork" no matter where you pressed.
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([5]), 0);    // До   — one finger on the lowest hole stops all six
  assertEquals(semi([4]), 2);    // Ре
  assertEquals(semi([3]), 4);    // Мі
  assertEquals(semi([2]), 5);    // Фа
  assertEquals(semi([1]), 7);    // Соль
  assertEquals(semi([0]), 9);    // Ля
  assertEquals(semi([]), 11);    // Сі — a finger on the body of the pipe: breath, nothing stopped

  // Without the hand, the failure is total and identical everywhere — the regression this guards:
  assertEquals(fingeredSemitone(new Set([5]), SOPILKA), 10);
  assertEquals(fingeredSemitone(new Set([3]), SOPILKA), 10);
});

Deno.test("handCovered: a second finger below the first is a fork, not a re-stack", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([0, 2]), 8);   // Соль♯ — Ля forked
  assertEquals(semi([1, 3]), 6);   // Фа♯   — Соль forked
  assertEquals(semi([3, 5]), 3);   // Ре♯   — Мі forked
  // Order of touches must not matter: it is a set of fingers, not a sequence of taps.
  assertEquals(semi([3, 1]), semi([1, 3]));
});

// ---- geomag: the World Magnetic Model (packages/runtime/geomag.js) ----
// NOAA ships 100 official test points WITH the coefficients, precisely so an implementation can be proven
// rather than believed. This is that proof, and it is not ceremony: writing this model produced three bugs
// that every plausibility check passed —
//   · the Schmidt sectoral recursion is only valid from n=2 (P(1,1) = sinθ exactly); starting it at n=1
//     scaled it by √½ and cascaded;
//   · dP/dθ already carries a sign (θ is colatitude), so negating it again gave a field of the right
//     STRENGTH pointing the wrong way — H, F and inclination all exact, only the declination reversed;
//   · the geodetic rotation's `sa` term is ~3e-3, so its sign is worth ~80 nT — invisible in a demo.
// A compass whose declination is backwards looks perfect until someone walks north.

Deno.test("geomag: all 100 official NOAA test points", async () => {
  const txt = await Deno.readTextFile(new URL("./wmm2025_testvalues.txt", import.meta.url));
  const pts = txt.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/).map(Number));
  assertEquals(pts.length, 100, "the official test set is 100 points — a short read is a silent pass");
  for (const [year, alt, lat, lon, D, I, H, X, Y, Z, F] of pts) {
    const r = field(lat, lon, alt, year);
    const where = `(${lat}, ${lon}) alt=${alt}km ${year}`;
    let dD = Math.abs(r.declination - D); if (dD > 180) dD = 360 - dD;   // ±180 wrap at the poles
    assert(dD < 0.01, `${where}: declination ${r.declination.toFixed(3)} vs ${D}`);
    assert(Math.abs(r.inclination - I) < 0.01, `${where}: inclination ${r.inclination.toFixed(3)} vs ${I}`);
    for (const [name, got, want] of [["X", r.X, X], ["Y", r.Y, Y], ["Z", r.Z, Z], ["H", r.H, H], ["F", r.F, F]]) {
      assert(Math.abs(got - want) < 5, `${where}: ${name} ${got.toFixed(1)} vs ${want}`);
    }
  }
});

Deno.test("geomag: Ukraine's declination is real, eastward, and drifts", () => {
  // Kyiv sits at roughly +7-8° East: a compass needle there points that far off true north. This is the
  // number the whole app exists to apply — if it ever comes back ~0, the model has silently stopped working
  // and the compass has quietly become every other compass.
  const d = declination(50.45, 30.52, 0.2, 2026.5);
  assert(d > 6 && d < 10, `Kyiv declination out of the plausible band: ${d.toFixed(2)}°`);
  // It is a function of TIME, not a constant — that is why the model carries secular variation.
  assert(Math.abs(declination(50.45, 30.52, 0, 2029.9) - declination(50.45, 30.52, 0, 2025.0)) > 0.1, "no secular drift");
  // …and of PLACE: London is near zero, Alaska is wildly off. A hardcoded constant would be a lie.
  assert(Math.abs(declination(51.5, -0.13, 0, 2026.5)) < 3, "London should be near zero");
  assert(Math.abs(declination(64.8, -147.7, 0, 2026.5)) > 10, "Fairbanks should be far off");
});

Deno.test("geomag: decimalYear + validity window", () => {
  assertEquals(decimalYear(new Date(Date.UTC(2026, 0, 1))), 2026);
  assert(Math.abs(decimalYear(new Date(Date.UTC(2026, 6, 2))) - 2026.5) < 0.01);
  assert(inRange(2025.0) && inRange(2029.9), "inside the model's window");
  assert(!inRange(2024.9) && !inRange(2030.0), "outside it, WMM2025 is extrapolation and must say so");
});

// ── geofix — the statistics that stand in for hardware we cannot reach ────────────────────────────
// The claim being defended: averaging static fixes genuinely improves a position, and genuinely cannot
// improve it past the correlated bias. Both halves need a test, because a √N that is allowed to run to
// zero produces beautiful, confident, fictional numbers.
Deno.test("meanFix — averaging shrinks the random error toward the truth", () => {
  const rnd = mulberry32(7);
  const truth = { lat: 50.4501, lng: 30.5234 };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const ss = Array.from({ length: 60 }, () => ({          // ~5 m per-axis scatter about the truth
    lat: truth.lat + (gauss() * 5) / 110540,
    lng: truth.lng + (gauss() * 5) / (111320 * Math.cos(truth.lat * Math.PI / 180)),
    accuracy: 10, t: 0,
  }));
  const m = meanFix(ss);
  const off = (p) => Math.hypot((p.lat - truth.lat) * 110540, (p.lng - truth.lng) * 111320 * Math.cos(truth.lat * Math.PI / 180));
  const single = ss.reduce((s, p) => s + off(p), 0) / ss.length;
  assert(off(m) < single / 2, `the mean of 60 fixes (${off(m).toFixed(2)} m off) must beat a typical single fix (${single.toFixed(2)} m off)`);
  assertEquals(m.n, 60);
});

Deno.test("meanFix — √N is not allowed to run to zero: the bias is the floor", () => {
  // Identical fixes = zero observable scatter. A naive SEM would report ±0.00 m and the app would draw a
  // millimetre-perfect vertex out of a ±12 m receiver. The floor is what stops that being shippable.
  const ss = Array.from({ length: 400 }, () => ({ lat: 50.45, lng: 30.52, accuracy: 12, t: 0 }));
  const m = meanFix(ss);
  assertEquals(Math.round(m.accuracy * 1000) / 1000, BIAS_FRAC * 12);
  assert(m.accuracy > 0, "400 agreeing fixes still do not make a perfect position");
  assert(meanFix(ss.slice(0, 4)).accuracy >= BIAS_FRAC * 12, "and neither do 4");
});

Deno.test("meanFix — one fix is never better than itself", () => {
  const m = meanFix([{ lat: 50.45, lng: 30.52, accuracy: 9, t: 0 }]);
  assertEquals(m.accuracy, 9);
  assertEquals(m.n, 1);
  assertEquals(meanFix([]), null);
});

Deno.test("stationaryTail — averages one spot, never a walk", () => {
  const base = { lat: 50.45, lng: 30.52, accuracy: 6 };
  const still = Array.from({ length: 5 }, (_, i) => ({ ...base, lat: base.lat + i * 1e-6, t: 1000 + i * 1000 }));
  // …then 40 m away: a different place. Folding it into the mean would invent a vertex between the two.
  const walked = [{ ...base, lat: base.lat - 40 / 110540, t: 500 }, ...still];
  assertEquals(stationaryTail(walked, { now: 6000 }).length, 5, "the pre-walk fix must be cut, not averaged");
  // Stale fixes are cut too — the bias itself has moved on by then.
  const old = [{ ...base, t: -60000 }, ...still];
  assertEquals(stationaryTail(old, { now: 6000, maxAgeMs: 25000 }).length, 5);
  assertEquals(stationaryTail([], { now: 0 }).length, 0);
});

Deno.test("stationaryTail — 'same spot' scales with the fix quality", () => {
  // 6 m apart is one spot for a ±10 m receiver and two spots for a ±1 m one. A fixed threshold is wrong
  // at one end or the other, always.
  const at = (dLat, accuracy) => ({ lat: 50.45 + dLat / 110540, lng: 30.52, accuracy, t: 1000 });
  const coarse = [at(-6, 10), { ...at(0, 10), t: 2000 }];
  const fine = [at(-6, 1), { ...at(0, 1), t: 2000 }];
  assertEquals(stationaryTail(coarse, { now: 2000 }).length, 2);
  assertEquals(stationaryTail(fine, { now: 2000 }).length, 1);
});

Deno.test("segErr / totalErr — a measurement carries its endpoints' doubt", () => {
  assertEquals(segErr({ accuracy: 3 }, { accuracy: 4 }), 5);          // quadrature, not sum
  assert(segErr({ accuracy: 3 }, { accuracy: 4 }) < 3 + 4, "independent errors must not simply add");
  assertEquals(totalErr([3, 4]), 5);
  assertEquals(totalErr([]), 0);
});

Deno.test("usableFix — a vague fix is a wrong vertex, not a coarse one", () => {
  assert(usableFix({ accuracy: 8 }));
  assert(!usableFix({ accuracy: 60 }), "±60 m must not be droppable into a polyline");
  assert(!usableFix({ accuracy: 0 }) && !usableFix(null) && !usableFix({}));
  assert(usableFix({ accuracy: 60 }, 80), "the limit is the caller's to set");
});

Deno.test("trueFrom — east declination adds, and wraps the circle", () => {
  assertEquals(Math.round(trueFrom(0, 7.5) * 10) / 10, 7.5);      // Kyiv: magnetic 0 is 7.5° east of true
  assertEquals(Math.round(trueFrom(355, 10) * 10) / 10, 5);        // across the 360/0 seam
  assertEquals(Math.round(trueFrom(5, -10) * 10) / 10, 355);       // west declination subtracts
  assertEquals(trueFrom(123, null), 123, "no position → no model → the heading stays magnetic, uncorrected");
  const kyiv = declination(50.4501, 30.5234, 0, 2026.0);
  assert(kyiv > 5 && kyiv < 12, `Kyiv declination should be ~5-12° east, got ${kyiv}`);
  assert(trueFrom(0, kyiv) !== 0, "a compass in Kyiv that reports 0 is not pointing at true north");
});

// ── hapticFor — touch feedback is systemic, so it is decided in one place and tested here ─────────
// Parsed with the real linkedom DOM, not a stub with a fake closest(): the whole function IS a selector
// plus a few exceptions, and a hand-rolled closest() would only ever prove that my stub agrees with me.
const el = (h, sel) => new DOMParser().parseFromString(`<body>${h}</body>`, "text/html").querySelector(sel);

Deno.test("hapticFor — every tappable answers, by default and without the app asking", () => {
  for (const [h, sel] of [
    ["<button id=x>go</button>", "#x"],
    ['<a id=x href="/y">go</a>', "#x"],
    ['<div id=x role="button">go</div>', "#x"],
    ['<button data-tab="me" id=x>me</button>', "#x"],
    ['<div id=x class="btn">go</div>', "#x"],
    ['<input id=x type="checkbox">', "#x"],
    ["<select id=x><option>a</option></select>", "#x"],
    ["<summary id=x>more</summary>", "#x"],
  ]) assertEquals(hapticFor(el(h, sel)), "tick", `${h} should tick`);
  // the tap lands on the icon INSIDE the button — closest() is why this works
  assertEquals(hapticFor(el('<button><span id=i>go</span></button>', "#i")), "tick");
});

Deno.test("hapticFor — silence where a buzz would be a fault, not feedback", () => {
  assertEquals(hapticFor(el("<div id=x>text</div>", "#x")), null, "plain text is not tappable");
  assertEquals(hapticFor(el('<input id=x type="text">', "#x")), null, "a buzz per keystroke is a broken phone");
  assertEquals(hapticFor(el("<textarea id=x></textarea>", "#x")), null);
  assertEquals(hapticFor(el('<input id=x type="search">', "#x")), null);
  // Feedback for an action that will not happen is a lie you can feel.
  assertEquals(hapticFor(el("<button id=x disabled>go</button>", "#x")), null);
  assertEquals(hapticFor(el('<button id=x aria-disabled="true">go</button>', "#x")), null);
  assertEquals(hapticFor(null), null);
});

Deno.test("hapticFor — destructive hits harder; apps can opt out or up", () => {
  assertEquals(hapticFor(el('<button id=x class="btn btn-error">delete</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="bump">clear</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="off">silent</button>', "#x")), null, "an element that fires its own must be able to stay silent");
  assertEquals(hapticFor(el('<button id=x data-haptic="ok">saved</button>', "#x")), "ok");
});

// ── resumeAt — resuming is only kind when it lands you where you left ─────────────────────────────
Deno.test("resumeAt — the band, not the saved number", () => {
  const D = 5400;                                        // a 90-minute film
  assertEquals(resumeAt(1800, D), 1800, "mid-film → resume exactly there");
  assertEquals(resumeAt(12, D), 0, "12s in you have not started — resuming there is just noise");
  assertEquals(resumeAt(RESUME_MIN, D), RESUME_MIN, "the threshold itself resumes");
  assertEquals(resumeAt(D * 0.99, D), 0, "on the credits of a film you finished → start over, not stranded");
  assertEquals(resumeAt(D, D), 0);
  // A live stream has no position to return to; Infinity must not become a seek.
  assertEquals(resumeAt(600, Infinity), 0, "live has no resume");
  assertEquals(resumeAt(600, 0), 0, "duration unknown → do not guess");
  assertEquals(resumeAt(NaN, D), 0);
  assertEquals(resumeAt(undefined, D), 0, "nothing saved → start at the start");
  assertEquals(resumeAt(-5, D), 0, "never seek backwards out of the file");
});


// ── detail.actions: href XOR play — and the two validators must agree ─────────────────────────────
Deno.test("validateSpec: an action either leaves the app or plays in it", () => {
  const withDetail = (actions) => ({ ...baseList(), detail: { title: "name", actions } });
  validateSpec(withDetail([{ label: "open", href: "url" }]));
  validateSpec(withDetail([{ label: "watch", play: "video" }]));
  validateSpec(withDetail([{ label: "watch", play: "video", icon: "lucide:play" }]));
  // neither → the button would do nothing at all
  assertThrows(() => validateSpec(withDetail([{ label: "x" }])), Error, "spec.detail.actions[0].href");
  // both → two meanings, and the runtime would have to guess which the author meant
  const err = assertThrows(() => validateSpec(withDetail([{ label: "x", href: "url", play: "video" }])), Error);
  assert(err.message.includes("spec.detail.actions[0].play"), err.message);
  assertThrows(() => validateSpec(withDetail([{ play: "video" }])), Error, "spec.detail.actions[0].label");
});

// ── gallery — the catalogue showcase, and why it is not `grid` ────────────────────────────────────
Deno.test("validateSpec: gallery needs art, because the art IS the recognition", () => {
  const gal = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "gallery", title: "name", ...card } }] });
  validateSpec(gal({ image: "iconUrl" }));
  validateSpec(gal({ icon: "glyph" }));
  validateSpec(gal({ image: "iconUrl", subtitle: "publisher", badges: [{ field: "version" }] }));
  // Strip the art and it is just a worse feed — scanning a catalogue is looking, not reading.
  const err = assertThrows(() => validateSpec(gal({ subtitle: "publisher" })), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs art/.test(err.message), err.message);
  // …and it is NOT held to the feed preview-slot rule: a gallery tile with no body is the whole point.
  validateSpec(gal({ image: "iconUrl" }));
  assertThrows(() => validateSpec(gal({ image: "iconUrl", title: "" })), Error, "spec.tabs[0].card.title");
});

Deno.test("validateSpec: gallery is a real layout, and a typo is still caught", () => {
  const bad = { ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "galery", title: "name", image: "x" } }] };
  assertThrows(() => validateSpec(bad), Error, "spec.tabs[0].card.layout");
});

Deno.test("validateSpec: browse rides on searchFetch (a shelf, not a search box)", () => {
  const tab = (extra) => ({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", search: true, searchFetch: true, ...extra, card: { layout: "feed", title: "name", body: "desc" } }] });
  validateSpec(tab({ browse: true }));
  validateSpec(tab({}));
  // browse is meaningless without the fetch it modifies — and searchFetch still needs a search box.
  const err = assertThrows(() => validateSpec({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", searchFetch: true, card: { layout: "feed", title: "name", body: "desc" } }] }), Error);
  assert(err.message.includes("searchFetch requires search"), err.message);
});

Deno.test("eaqiBand maps the EEA 6-band scale on its 20-point boundaries", () => {
  assertEquals(eaqiBand(0), 0);
  assertEquals(eaqiBand(20), 0, "20 is the top of Good (inclusive)");
  assertEquals(eaqiBand(20.1), 1, "just over 20 tips into Fair");
  assertEquals(eaqiBand(40), 1);
  assertEquals(eaqiBand(60), 2);
  assertEquals(eaqiBand(80), 3);
  assertEquals(eaqiBand(100), 4);
  assertEquals(eaqiBand(101), 5, "over 100 is Extremely poor");
  assertEquals(eaqiBand(null), -1, "no reading → no band");
  assertEquals(eaqiBand(NaN), -1);
  assert(AQI_BANDS.length === 6, "six band keys for six bands");
});

Deno.test("pollutantBand uses each pollutant's own EEA breakpoints", () => {
  // PM2.5 breakpoints 10/20/25/50/75
  assertEquals(pollutantBand("pm2_5", 10), 0, "10 tops Good");
  assertEquals(pollutantBand("pm2_5", 10.5), 1);
  assertEquals(pollutantBand("pm2_5", 75), 4);
  assertEquals(pollutantBand("pm2_5", 80), 5, "beyond the last breakpoint → extreme");
  // Same concentration, different pollutant → different band (the whole point of per-pollutant bands).
  assertEquals(pollutantBand("no2", 45), 1, "45 µg/m³ NO₂ is only Fair");
  assertEquals(pollutantBand("o3", 45), 0, "45 µg/m³ O₃ is still Good");
  assertEquals(pollutantBand("so2", 300), 2);
  assertEquals(pollutantBand("nonsense", 5), -1, "unknown pollutant → no band");
  assertEquals(pollutantBand("pm10", null), -1);
});

Deno.test("pollenBand is category-aware: zero is 'none', a weed grain bands higher than a grass grain", () => {
  assertEquals(pollenBand("grass", 0), 0, "zero grains → none, not low");
  assertEquals(pollenBand("grass", 30), 1, "30 tops grass Low");
  assertEquals(pollenBand("grass", 31), 2);
  assertEquals(pollenBand("grass", 150), 3);
  assertEquals(pollenBand("grass", 200), 4, "grass very high");
  // 20 grains: moderate for grass, but already High-band material for a potent weed.
  assertEquals(pollenBand("grass", 20), 1, "20 grass grains = Low");
  assertEquals(pollenBand("ragweed", 20), 2, "20 ragweed grains = Moderate (lower threshold)");
  assertEquals(pollenBand("birch", 60), 3, "trees peak fast: 60 birch = High");
  assertEquals(pollenBand("mugwort", null), -1);
  assert(POLLEN_BANDS.length === 5);
});

Deno.test("codebreak feedback: exact vs partial, and the repeated-colour trap", () => {
  // a cracked code
  assertEquals(feedback([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, partial: 0 });
  // every colour right, every slot wrong → all partial
  assertEquals(feedback([1, 2, 1, 2], [2, 1, 2, 1]), { exact: 0, partial: 4 });
  // nothing in common
  assertEquals(feedback([0, 0, 0, 0], [1, 1, 1, 1]), { exact: 0, partial: 0 });
  // the trap: guessing four 0s against a secret with a single 0 (at the matched slot) must NOT award
  // extra partials for the other three 0s — an exact match consumes its peg.
  assertEquals(feedback([0, 1, 2, 3], [0, 0, 0, 0]), { exact: 1, partial: 0 });
  // repeats on both sides: secret two 0s, guess offers a 0 exact + a 0 elsewhere → 1 exact, 1 partial
  assertEquals(feedback([0, 0, 1, 2], [0, 1, 0, 0]), { exact: 1, partial: 2 });
  // symmetry sanity: partials never exceed slots minus exacts
  const fb = feedback([3, 3, 3, 1], [3, 1, 1, 3]);
  assert(fb.exact + fb.partial <= 4, "exact+partial can't exceed the slot count");
  assertEquals(fb, { exact: 1, partial: 2 });
});

Deno.test("codebreak solved: only a full house of exacts wins", () => {
  assert(solved(feedback([2, 4, 1, 5], [2, 4, 1, 5]), 4));
  assert(!solved(feedback([2, 4, 1, 5], [2, 4, 1, 0]), 4));
  assert(!solved({ exact: 3, partial: 1 }, 4));
});

Deno.test("codebreak makeSecret is deterministic, in range, right length", () => {
  const a = makeSecret(mulberry32(42), 6, 4), b = makeSecret(mulberry32(42), 6, 4);
  assertEquals(a, b, "same seed → same code (shareable)");
  assert(makeSecret(mulberry32(1), 6, 4).join() !== a.join(), "different seeds diverge");
  for (let seed = 0; seed < 40; seed++) {
    const c = makeSecret(mulberry32(seed), 6, 4);
    assertEquals(c.length, 4, `seed ${seed}: wrong length`);
    for (const v of c) assert(Number.isInteger(v) && v >= 0 && v < 6, `seed ${seed}: colour ${v} out of range`);
  }
});

// build an RGBA buffer from [r,g,b] triples (alpha 255)
const rgba = (triples) => { const a = new Uint8ClampedArray(triples.length * 4); triples.forEach((t, i) => { a[i * 4] = t[0]; a[i * 4 + 1] = t[1]; a[i * 4 + 2] = t[2]; a[i * 4 + 3] = 255; }); return a; };

Deno.test("colour rgbToHex: padded, clamped, upper-case", () => {
  assertEquals(rgbToHex([0, 0, 0]), "#000000");
  assertEquals(rgbToHex([255, 255, 255]), "#FFFFFF");
  assertEquals(rgbToHex([122, 90, 200]), "#7A5AC8");
  assertEquals(rgbToHex([-5, 300, 15]), "#00FF0F"); // clamps out-of-range channels
});

Deno.test("colour rgbToHsl: primaries, greys, achromatic", () => {
  assertEquals(rgbToHsl([255, 0, 0]), [0, 100, 50]);
  assertEquals(rgbToHsl([0, 255, 0]), [120, 100, 50]);
  assertEquals(rgbToHsl([0, 0, 255]), [240, 100, 50]);
  assertEquals(rgbToHsl([0, 0, 0]), [0, 0, 0]);
  assertEquals(rgbToHsl([255, 255, 255]), [0, 0, 100]);
  assertEquals(rgbToHsl([128, 128, 128]), [0, 0, 50]); // grey → no hue, no sat
});

Deno.test("colour avgColor: mean over RGBA, alpha ignored", () => {
  assertEquals(avgColor(rgba([[255, 0, 0], [0, 0, 255]])), [128, 0, 128]);
  assertEquals(avgColor(rgba([[10, 20, 30]])), [10, 20, 30]);
  assertEquals(avgColor(new Uint8ClampedArray(0)), [0, 0, 0]); // empty → black, never NaN
});

Deno.test("colour ink: readable over a swatch (WCAG luminance)", () => {
  assertEquals(ink([255, 255, 255]), "#000000"); // black on white
  assertEquals(ink([0, 0, 0]), "#FFFFFF");       // white on black
  assertEquals(ink([250, 220, 60]), "#000000");  // black on bright yellow
  assert(luminance([255, 255, 255]) > luminance([0, 0, 0]));
});

Deno.test("colour palette: median cut is deterministic and separates dominant colours", () => {
  const buf = rgba([...Array(100).fill([255, 8, 8]), ...Array(100).fill([8, 8, 255])]);
  const p = palette(buf, 2);
  assertEquals(p.length, 2, "two boxes for two dominant colours");
  assertEquals(JSON.stringify(p), JSON.stringify(palette(buf, 2)), "same pixels → same palette");
  const reds = p.filter((c) => c[0] > 200 && c[2] < 60).length;
  const blues = p.filter((c) => c[2] > 200 && c[0] < 60).length;
  assertEquals(reds, 1, "one red-dominant swatch");
  assertEquals(blues, 1, "one blue-dominant swatch");
  // a single-colour image yields a single swatch, never k padded duplicates
  assertEquals(palette(rgba(Array(50).fill([30, 60, 90])), 5).length, 1);
});

Deno.test("chroma hueToNote: hue splits the scale, never leaves it, monotone non-decreasing", () => {
  assertEquals(hueToNote(0), 48);          // root
  assertEquals(hueToNote(359), 48 + 21);   // top of the two-octave pentatonic
  assertEquals(hueToNote(120), 55);        // green → scale degree 3
  assertEquals(hueToNote(240), 62);        // blue  → scale degree 6
  let prev = -1;
  for (let h = 0; h < 360; h += 5) { const n = hueToNote(h); assert(n >= prev, `hue ${h} dipped`); assert(SCALES.penta.includes(n - 48), "left the scale"); prev = n; }
});

Deno.test("chroma paletteToChord: hues → a sorted, de-duplicated, in-scale chord", () => {
  assertEquals(paletteToChord([[255, 0, 0], [0, 255, 0], [0, 0, 255]]), [48, 55, 62]);
  assertEquals(paletteToChord([[255, 0, 0], [255, 0, 0]]), [48], "same hue collapses to one note");
  assertEquals(paletteToChord([]), []);
  for (const n of paletteToChord([[10, 200, 130], [200, 40, 90], [40, 40, 220]], SCALES.minor)) assert(SCALES.minor.includes(n - 48), "minor mode stays in scale");
});

Deno.test("chroma brightness→cutoff and sat→detune: clamped, monotone, right endpoints", () => {
  assertEquals(brightnessToCutoff(0), 300);
  assertEquals(brightnessToCutoff(1), 4000);
  assertEquals(brightnessToCutoff(-5), 300);
  assertEquals(brightnessToCutoff(9), 4000);
  assert(brightnessToCutoff(0.5) > 300 && brightnessToCutoff(0.5) < 4000);
  assertEquals(satToDetune(0), 0);
  assertEquals(satToDetune(1), 14);
});

Deno.test("motion motionCells: locates changed cells, normalized, with the new colour", () => {
  const W = 4, H = 4, N = W * H;
  const flat = (c) => { const a = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = 255; } return a; };
  const prev = flat([10, 10, 10]);
  const cur = flat([10, 10, 10]);
  assertEquals(motionCells(prev, cur, W, H), [], "no change → no cells");
  // change pixel index 5 (x=1,y=1) to bright
  cur[5 * 4] = 240; cur[5 * 4 + 1] = 30; cur[5 * 4 + 2] = 30;
  const cells = motionCells(prev, cur, W, H, 24);
  assertEquals(cells.length, 1, "one moved cell");
  assertEquals([cells[0].x, cells[0].y], [0.25, 0.25], "cell 5 → (0.25,0.25)");
  assertEquals([cells[0].r, cells[0].g, cells[0].b], [240, 30, 30], "carries the new colour");
  assert(cells[0].m > 0 && cells[0].m <= 1, "magnitude in range");
  // threshold gates small changes
  const tiny = flat([10, 10, 10]); tiny[5 * 4] = 20; // dl≈3, below 24
  assertEquals(motionCells(prev, tiny, W, H, 24), [], "sub-threshold ignored");
  assertEquals(motionCells(null, cur, W, H), [], "no previous frame → no cells");
});

Deno.test("motion motionEnergy: 0 when still, rises with change, clamped", () => {
  const N = 16, flat = (v) => { const a = new Uint8ClampedArray(N * 4); a.fill(v); for (let i = 0; i < N; i++) a[i * 4 + 3] = 255; return a; };
  assertEquals(motionEnergy(flat(20), flat(20)), 0, "identical → 0");
  assertEquals(motionEnergy(null, flat(20)), 0);
  assert(motionEnergy(flat(0), flat(255)) === 1, "max change clamps to 1");
  const mid = motionEnergy(flat(20), flat(40));
  assert(mid > 0 && mid < 1, "partial change is between");
});

Deno.test("motion centroidOf: magnitude-weighted centre, empty → middle", () => {
  assertEquals(centroidOf([]), { x: 0.5, y: 0.5, m: 0 });
  assertEquals(centroidOf(null), { x: 0.5, y: 0.5, m: 0 });
  // two equal-weight cells → midpoint
  const c = centroidOf([{ x: 0.2, y: 0.4, m: 0.5 }, { x: 0.6, y: 0.8, m: 0.5 }]);
  assert(Math.abs(c.x - 0.4) < 1e-9 && Math.abs(c.y - 0.6) < 1e-9, "midpoint");
  // heavier cell pulls the centre toward it
  const w = centroidOf([{ x: 0, y: 0, m: 0.1 }, { x: 1, y: 1, m: 0.9 }]);
  assert(w.x > 0.8 && w.y > 0.8, "weighted toward the strong cell");
  assert(w.m > 0 && w.m <= 1, "energy in range");
});

Deno.test("urlsafe: a plain https link is safe; host is extracted", () => {
  const r = analyzeQR("https://example.com/path?q=1");
  assertEquals(r.kind, "url");
  assertEquals(r.host, "example.com");
  assertEquals(r.verdict, "safe");
  assertEquals(r.flags.length, 0);
});

Deno.test("urlsafe: http is a caution (insecure), not a verdict on the host", () => {
  const r = analyzeQR("http://example.com");
  assertEquals(r.verdict, "caution");
  assert(r.flags.some((f) => f.code === "insecure"));
});

Deno.test("urlsafe: shorteners flag as caution (destination hidden)", () => {
  assert(analyzeQR("https://bit.ly/abc").flags.some((f) => f.code === "shortener"));
  assertEquals(analyzeQR("https://bit.ly/abc").verdict, "caution");
});

Deno.test("urlsafe: Cyrillic homograph host is DANGER (mixed-script)", () => {
  // "аpple.com" — the first а is Cyrillic U+0430, the rest Latin: identical to the eye, points elsewhere.
  const r = analyzeQR("https://аpple.com/login");
  assertEquals(r.verdict, "danger");
  assert(r.flags.some((f) => f.code === "mixed-script"));
});

Deno.test("urlsafe: userinfo spoof (trusted@evil) is DANGER; the real host is evil.com", () => {
  const r = analyzeQR("https://apple.com@evil.example/login");
  assertEquals(r.host, "evil.example");
  assertEquals(r.verdict, "danger");
  assert(r.flags.some((f) => f.code === "userinfo"));
});

Deno.test("urlsafe: script/code schemes are DANGER and never 'open'", () => {
  const r = analyzeQR("javascript:alert(1)");
  assertEquals(r.kind, "code");
  assertEquals(r.verdict, "danger");
});

Deno.test("urlsafe: raw IP host is a caution", () => {
  assert(analyzeQR("http://192.168.1.1/admin").flags.some((f) => f.code === "ip-host"));
});

Deno.test("urlsafe: non-URL payloads are typed, never openable web links", () => {
  assertEquals(analyzeQR("WIFI:S:MyNet;T:WPA;P:secret;;").kind, "wifi");
  assertEquals(analyzeQR("WIFI:S:MyNet;T:WPA;P:secret;;").ssid, "MyNet");
  assertEquals(analyzeQR("tel:+380501234567").kind, "tel");
  assertEquals(analyzeQR("mailto:a@b.com").kind, "mailto");
  assertEquals(analyzeQR("just a note").kind, "text");
});

Deno.test("urlsafe: a bare host with no scheme parses as a link but flags the assumption", () => {
  const r = analyzeQR("example.com/x");
  assertEquals(r.kind, "url");
  assertEquals(r.host, "example.com");
  assert(r.flags.some((f) => f.code === "no-scheme"));
});

Deno.test("qrcode qrMatrix: square, odd module count, with the three finder patterns", () => {
  const m = qrMatrix("https://damanoreshkan-beep.github.io/microspec/qr/");
  const n = m.length;
  assert(n >= 21 && n % 2 === 1, `module count ${n} should be odd, ≥21`);
  assertEquals(m.every((row) => row.length === n), true);
  // a finder pattern is a dark 7×7 with a light ring and a 3×3 dark core — check the top-left corners + core.
  const finder = (r0, c0) => m[r0][c0] && m[r0 + 6][c0 + 6] && !m[r0 + 1][c0 + 1] && m[r0 + 3][c0 + 3];
  assert(finder(0, 0), "top-left finder");
  assert(finder(0, n - 7), "top-right finder");
  assert(finder(n - 7, 0), "bottom-left finder");
});

Deno.test("imgsize fitResolution: fills the MP budget at the exact screen ratio, 32-aligned, ≤ budget", () => {
  // S25 Ultra: 384×832 @ dpr 3.5 → 1344×2912 physical ≈ 3.9 MP, already under 4 MP.
  const r = fitResolution(384, 832, 3.5, 4);
  assertEquals(r.width % 32, 0);
  assertEquals(r.height % 32, 0);
  assert(r.width * r.height <= 4_000_000, `over budget: ${r.width}×${r.height}`);
  assert(r.height > r.width, "portrait screen must stay portrait");
  // aspect within one 32-step of the source ratio
  assert(Math.abs(r.width / r.height - 384 / 832) < 0.04, `ratio drift ${r.width}/${r.height}`);
});

Deno.test("imgsize fitResolution: a big screen scales DOWN to the budget", () => {
  const r = fitResolution(4000, 4000, 2, 4);   // 8000² = 64 MP → must land ≤ 4 MP
  assert(r.width * r.height <= 4_000_000, `${r.width}×${r.height} over 4MP`);
  assert(r.width * r.height > 3_000_000, "should still fill most of the budget");
  assert(Math.abs(r.width - r.height) <= 32, "square in → near-square out (one 32-step of shrink-to-fit)");
});

Deno.test("imgsize fitResolution: 16:9 desktop stays ≤ budget and 32-aligned", () => {
  const r = fitResolution(1920, 1080, 1, 4);
  assertEquals(r.width % 32, 0);
  assertEquals(r.height % 32, 0);
  assert(r.width * r.height <= 4_000_000);
  assert(r.width > r.height, "landscape stays landscape");
});

Deno.test("imgsize fitResolution: tiny/degenerate input clamps to the 64px floor", () => {
  const r = fitResolution(10, 10, 1, 4);
  assert(r.width >= 64 && r.height >= 64);
  assertEquals(r.width % 32, 0);
});

Deno.test("imgsize fitResolution: a smaller MP budget yields a smaller image", () => {
  const hi = fitResolution(1000, 1000, 2, 4), lo = fitResolution(1000, 1000, 2, 1);
  assert(lo.width * lo.height < hi.width * hi.height, "1MP budget must be smaller than 4MP");
  assert(lo.width * lo.height <= 1_000_000);
});

Deno.test("horoscope sunSign: cutoffs map month/day to the right sign, wrapping at year end", () => {
  assertEquals(sunSign(1, 1), 9);    // Jan 1 → Capricorn
  assertEquals(sunSign(1, 19), 9);   // last Capricorn day
  assertEquals(sunSign(1, 20), 10);  // Aquarius starts
  assertEquals(sunSign(3, 20), 11);  // last Pisces day
  assertEquals(sunSign(3, 21), 0);   // Aries starts
  assertEquals(sunSign(7, 23), 4);   // Leo
  assertEquals(sunSign(12, 21), 8);  // last Sagittarius day
  assertEquals(sunSign(12, 22), 9);  // Capricorn again
});

Deno.test("horoscope reading: deterministic per (sign, date); ratings + lucky in range; selectors in [0,1)", () => {
  const a = reading(4, "2027-07-23"), b = reading(4, "2027-07-23");
  assertEquals(JSON.stringify(a), JSON.stringify(b), "same sign+date must give the same reading");
  for (const k of ["open", "focus", "advice", "mood", "color"]) { assert(a[k] >= 0 && a[k] < 1, `${k} out of [0,1)`); }
  for (const k of ["love", "work", "health"]) { assert(a[k] >= 2 && a[k] <= 5, `${k}=${a[k]} not 2..5`); }
  assert(a.lucky >= 1 && a.lucky <= 40, `lucky=${a.lucky} not 1..40`);
});

Deno.test("horoscope reading: a different day (and a different sign) changes the reading", () => {
  const today = reading(4, "2027-07-23"), tomorrow = reading(4, "2027-07-24"), otherSign = reading(5, "2027-07-23");
  assert(JSON.stringify(today) !== JSON.stringify(tomorrow), "tomorrow should differ from today");
  assert(JSON.stringify(today) !== JSON.stringify(otherSign), "another sign should differ same day");
});
