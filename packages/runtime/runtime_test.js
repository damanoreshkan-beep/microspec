// microspec runtime — pure-logic unit tests (no browser, no import map).
//   deno test -A packages/runtime/runtime_test.js
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { validateSpec } from "./validate.js";
import { T, dictFor, ago, whenLabel } from "./i18n.js";
import { bjorklund, rotate, syncopation, syncopationNorm, harmonicity, grooveU, mulberry32, generateGroove, buildCandidate, scoreGroove, METRIC_WEIGHTS } from "./groove.js";
import { generateMelody, scoreMelody } from "./melody.js";
import { fingeredSemitone, handCovered } from "./wind.js";
import { field, declination, decimalYear, inRange, EPOCH, trueFrom } from "./geomag.js";
import { meanFix, stationaryTail, segErr, totalErr, usableFix, BIAS_FRAC } from "./geofix.js";
import { hapticFor } from "./sensors.js";
import { eaqiBand, pollutantBand, pollenBand, AQI_BANDS, POLLEN_BANDS } from "./air.js";
import { feedback, solved, makeSecret } from "./codebreak.js";
import { rgbToHex, rgbToHsl, avgColor, luminance, ink, palette, hexRgb, iconTint } from "./colour.js";
import { hueToNote, paletteToChord, brightnessToCutoff, satToDetune, SCALES } from "./chroma.js";
import { motionCells, motionEnergy, centroidOf } from "./motion.js";
import { analyzeQR } from "./urlsafe.js";
import { qrMatrix } from "./qrcode.js";
import { fitResolution, sizeFor, estimateSeconds, QUALITY, DEFAULT, MAX_SIDE, AR } from "./imgsize.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "./vfilter.js";
import { resolveSearch, buildSearchUrl } from "./urlquery.js";
import { PLANETS, squareFor, isMagic, magicConstant, distill, normalize, sigilPath, hash32, smooth } from "./sigil.js";
import { sha1hex, splitHash, parseRange, lookup, checkPassword } from "./pwned.js";
import { sunSign } from "./horoscope.js";
import { SPREADS, spreadById, hashSeed, draw } from "./tarot.js";
import { silentWav } from "./mediasession.js";
import { phase as penPhase, swing as penSwing, state as penState } from "./pendulum.js";
import { signOf, signPair, compat, band, ELEMENT, MODALITY } from "./synastry.js";
import { centsToRatio, semiToRatio, beatHz, chord, dbToGain, faderGain, equalPower, detune, STATIONS, LAYERS, station, reactorVoices } from "./scifi.js";
import { sat, makeSat, parseTleText, subpoint, sunEciUnit, isSunlit, FALLBACK_TLE } from "./orbit.js";
import { aspects, ASPECTS } from "./aspects.js";
import { resumeAt, RESUME_MIN } from "./playback.js";
import { logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, advanceTerrain, Parallax, seedFrame, sampleBand, idle, fib, galaxyDisc } from "./spectrum.js";
import { RippleField, ring, RIPPLE_DEFAULTS } from "./ripple.js";
import { iqFromBytes, firLowpass, deemphasisAlpha, fft, powerSpectrum, seedSpectrum, FmReceiver, IN_RATE, IF_RATE, OUT_RATE, MAX_DEV, OFFSET_HZ, goertzelPower, pilotRatioDb, rssiFromBytes, PILOT_COEFF } from "./fmradio.js";
import { sampleRatePayload, setFreqPayload, clampLnaGain, clampVgaGain, roundBasebandFilter, basebandFilterParams, REQUEST, MODE, VENDOR_ID, PRODUCT_ID, TRANSFER_SIZE } from "./hackrf.js";
import { syndrome, OFFSET, ptyName, rdsChar, RdsBlockSync, RdsParser, Rds } from "./rds.js";
import { BANDS, arfcnToFreq, freqToArfcn, arfcnPowers, activeArfcns, steadyScore, CHAN_HZ } from "./gsmband.js";
import { clampTxVgaGain, TX_ENDPOINT } from "./hackrf.js";
import { capture, isolateFrame, framesEqual, renderOOK, OOK_FREQS } from "./ook.js";
import { refDownchirp, makeUpSymbol, dechirpArgmax, detectPreamble, LORA_PRESETS, WHITENING, loraEncode, loraDecode, decodeLoraSignal } from "./lora.js";
import { parsePrice, parseWishMeta, toNumber, sortWishes, wishTotals, fmtMoney } from "./wish.js";
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

Deno.test("imgsize sizeFor: every quality stop is exact 3:4, 32-aligned and within the Space ceiling", () => {
  for (const stop of QUALITY) {
    const s = sizeFor(stop);
    assertEquals(s.width % 32, 0, `width 32-aligned (${s.width})`);
    assertEquals(s.height % 32, 0, `height 32-aligned (${s.height})`);
    assert(s.width <= MAX_SIDE && s.height <= MAX_SIDE, `≤ ${MAX_SIDE} per side (${s.width}×${s.height})`);
    assert(Math.abs(s.width / s.height - AR) < 1e-9, `exact 3:4 (${s.width}×${s.height})`);
  }
  // the DEFAULT stop is the app's balanced render — must stay the pre-slider 768×1024 (no regression)
  const def = sizeFor(QUALITY[DEFAULT]);
  assertEquals([def.width, def.height], [768, 1024]);
  // the top stop is the high-res max the big FLUX Spaces honour
  const hi = sizeFor(QUALITY.at(-1));
  assertEquals([hi.width, hi.height], [1536, 2048]);
});

Deno.test("imgsize sizeFor: higher stop is strictly larger; over-cap input clamps to the ceiling", () => {
  for (let i = 1; i < QUALITY.length; i++) {
    const lo = sizeFor(QUALITY[i - 1]), hi = sizeFor(QUALITY[i]);
    assert(hi.width * hi.height > lo.width * lo.height, `stop ${i} larger than ${i - 1}`);
  }
  const over = sizeFor(4096);
  assert(over.width <= MAX_SIDE && over.height <= MAX_SIDE, "beyond-ceiling long edge clamps to MAX_SIDE");
});

Deno.test("imgsize estimateSeconds: monotonic in area, in a plausible band across the ladder", () => {
  const draft = sizeFor(QUALITY[0]), full = sizeFor(QUALITY.at(-1));
  const eDraft = estimateSeconds(draft.width, draft.height), eFull = estimateSeconds(full.width, full.height);
  assert(eDraft < eFull, "a bigger image estimates a longer wait");
  assert(eDraft >= 5 && eFull <= 40, `estimates stay in a plausible band (${eDraft}s … ${eFull}s)`);
  // strictly increasing at every step of the quality ladder
  for (let i = 1; i < QUALITY.length; i++) {
    const a = sizeFor(QUALITY[i - 1]), b = sizeFor(QUALITY[i]);
    assert(estimateSeconds(b.width, b.height) > estimateSeconds(a.width, a.height), `estimate rises at stop ${i}`);
  }
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

Deno.test("tarot SPREADS: sizes match the layouts, positions unique", () => {
  assertEquals(SPREADS.map((s) => s.pos.length), [1, 3, 3, 3, 6, 5, 4, 6, 5, 6, 10], "spread sizes");
  for (const s of SPREADS) assertEquals(new Set(s.pos).size, s.pos.length, `${s.id} positions must be unique`);
  assertEquals(spreadById("celtic").pos.length, 10);
  assertEquals(spreadById("nope").id, "daily", "unknown id falls back to the first spread");
});

Deno.test("tarot SPREADS: rows place every position exactly once", () => {
  for (const s of SPREADS) {
    if (!s.rows) continue;
    const flat = s.rows.flat();
    assertEquals(flat.length, s.pos.length, `${s.id} rows must cover all positions`);
    assertEquals([...flat].sort((a, b) => a - b), s.pos.map((_, i) => i), `${s.id} rows are a permutation of positions`);
  }
});

Deno.test("tarot draw: majorOnly stays within the 22 Major Arcana", () => {
  const d = draw(98765, 6, 22);
  assertEquals(d.length, 6, "draws 6 cards");
  assertEquals(new Set(d.map((x) => x.card)).size, 6, "cards are distinct");
  for (const x of d) assert(x.card >= 0 && x.card < 22, `card ${x.card} is a Major Arcanum (0..21)`);
});

Deno.test("tarot hashSeed: deterministic uint32", () => {
  assertEquals(hashSeed("2027-07-23"), hashSeed("2027-07-23"), "same string → same seed");
  assert(hashSeed("a") !== hashSeed("b"), "different strings → different seeds");
  const h = hashSeed("2027-07-23");
  assert(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, "seed is uint32");
});

Deno.test("tarot draw: deterministic per seed; distinct in-range cards; orientation is bool", () => {
  const a = draw(12345, 10), b = draw(12345, 10);
  assertEquals(JSON.stringify(a), JSON.stringify(b), "same seed+size → same draw");
  assertEquals(a.length, 10, "draws `size` cards");
  assertEquals(new Set(a.map((d) => d.card)).size, 10, "cards are DISTINCT (no card twice in a spread)");
  for (const d of a) { assert(d.card >= 0 && d.card < 78, `card ${d.card} in range`); assertEquals(typeof d.reversed, "boolean"); }
});

Deno.test("tarot draw: a different seed gives a different spread", () => {
  assert(JSON.stringify(draw(1, 3)) !== JSON.stringify(draw(2, 3)), "different seed → different draw");
});

Deno.test("pendulum phase: wraps into [0,1) and guards a zero period", () => {
  assertEquals(penPhase(0, 1000), 0);
  assertEquals(penPhase(500, 1000), 0.5);
  assertEquals(penPhase(1000, 1000), 0, "a full period is back to 0");
  assertEquals(penPhase(1500, 1000), 0.5);
  assertEquals(penPhase(123, 0), 0, "zero period → 0, no divide-by-zero");
});

Deno.test("pendulum swing: cosine, +1 at the poles' turn, 0 at centre", () => {
  assert(Math.abs(penSwing(0) - 1) < 1e-9, "phase 0 → +1 (pole A)");
  assert(Math.abs(penSwing(0.5) + 1) < 1e-9, "phase .5 → -1 (pole B)");
  assert(Math.abs(penSwing(0.25)) < 1e-9, "phase .25 → 0 (crossing centre)");
  assert(Math.abs(penSwing(1) - 1) < 1e-9, "phase 1 → +1 again");
});

Deno.test("pendulum state: angle, crossfade weights and breath count", () => {
  const P = 8000, AMP = 30;
  const a = penState(0, P, AMP);
  assert(Math.abs(a.angle - AMP) < 1e-6, "at rest-top the arm is at +amp");
  assert(Math.abs(a.weightA - 1) < 1e-6 && Math.abs(a.weightB) < 1e-6, "pole A fully lit at phase 0");
  assertEquals(a.active, 0);
  const b = penState(P / 2, P, AMP);
  assert(Math.abs(b.angle + AMP) < 1e-6, "half a breath later the arm is at -amp");
  assert(Math.abs(b.weightA) < 1e-6 && Math.abs(b.weightB - 1) < 1e-6, "pole B fully lit at phase .5");
  assertEquals(b.active, 1);
  for (const el of [0, 700, 1900, 4321, 7999, 15000]) {
    const s = penState(el, P, AMP);
    assert(s.weightA >= 0 && s.weightA <= 1 && s.weightB >= 0 && s.weightB <= 1, "weights in range");
    assert(Math.abs(s.weightA + s.weightB - 1) < 1e-9, "weights sum to 1");
  }
  assertEquals(penState(2.5 * P, P, AMP).breath, 2, "2.5 breaths elapsed → 2 completed");
});
Deno.test("synastry signOf: longitude → sign, wraps negatives", () => {
  assertEquals(signOf(0), 0); assertEquals(signOf(29.9), 0); assertEquals(signOf(35), 1);
  assertEquals(signOf(359), 11); assertEquals(signOf(-10), 11); assertEquals(signOf(360), 0);
});

Deno.test("synastry element/modality: the 12 signs cycle correctly", () => {
  assertEquals([0, 1, 2, 3, 4].map(ELEMENT), [0, 1, 2, 3, 0], "fire·earth·air·water repeats");
  assertEquals([0, 1, 2, 3].map(MODALITY), [0, 1, 2, 0], "cardinal·fixed·mutable; Cancer is cardinal");
  assertEquals(ELEMENT(-1), ELEMENT(11), "wraps");
});

Deno.test("synastry signPair: aspect model, symmetric, in range", () => {
  assertEquals(signPair(0, 0), 78, "conjunction");
  assertEquals(signPair(0, 4), 90, "trine (same element) is the sweet spot");
  assertEquals(signPair(0, 3), 43, "square grates");
  assertEquals(signPair(0, 6), 66, "opposition attracts+strains");
  assertEquals(signPair(0, 2), 72, "sextile flows");
  assertEquals(signPair(0, 8), signPair(0, 4), "8 apart == 4 apart (both trine)");
  assertEquals(signPair(2, 7), signPair(7, 2), "symmetric");
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) { const v = signPair(a, b); assert(v >= 40 && v <= 100, `${a},${b} in range`); }
});

Deno.test("synastry compat: axes + weighted overall in 0..100; identical charts score high", () => {
  const same = { sun: 4, moon: 4, mercury: 4, venus: 4, mars: 4 };
  const c = compat(same, same);
  for (const k of ["overall", "core", "love", "emotion", "mind", "passion"]) assert(c[k] >= 0 && c[k] <= 100, `${k} in range`);
  assertEquals(c.core, 78, "same sun+moon → conjunction core");
  const trine = { sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0 };
  const trineB = { sun: 4, moon: 4, mercury: 4, venus: 4, mars: 4 };
  assert(compat(trine, trineB).overall > compat({ sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0 }, { sun: 3, moon: 3, mercury: 3, venus: 3, mars: 3 }).overall, "all-trine beats all-square");
});

Deno.test("synastry band: thresholds", () => {
  assertEquals([90, 78, 77, 62, 48, 47, 20].map(band), [3, 3, 2, 2, 1, 0, 0]);
});

Deno.test("chroma SCALES: every mood scale is well-formed (starts at 0, non-decreasing, 10 degrees, in range)", () => {
  for (const [name, s] of Object.entries(SCALES)) {
    assertEquals(s.length, 10, `${name} spans two octaves (10 degrees)`);
    assertEquals(s[0], 0, `${name} starts on the root`);
    for (let i = 1; i < s.length; i++) assert(s[i] >= s[i - 1], `${name} is monotone non-decreasing`);
    for (const d of s) assert(Number.isInteger(d) && d >= 0 && d <= 24, `${name} degree ${d} within two octaves`);
    // every degree lands on a note that hueToNote can reach across the wheel
    assertEquals(hueToNote(0, s), 48 + s[0]); assertEquals(hueToNote(359, s), 48 + s[s.length - 1]);
  }
});

Deno.test("scifi ratios: equal-temperament cents/semitones", () => {
  assertEquals(centsToRatio(0), 1);
  assert(Math.abs(centsToRatio(1200) - 2) < 1e-12, "octave up");
  assert(Math.abs(centsToRatio(-1200) - 0.5) < 1e-12, "octave down");
  assert(Math.abs(semiToRatio(12) - 2) < 1e-12, "12 semitones = octave");
  assert(Math.abs(semiToRatio(7) - 1.4983) < 1e-3, "perfect fifth ≈ 1.4983");
  assertEquals(beatHz(110, 110.5), 0.5);
  const c = chord(100, [0, 7, 12]);
  assert(Math.abs(c[0] - 100) < 1e-9 && Math.abs(c[2] - 200) < 1e-9, "root + octave");
});

Deno.test("scifi levels: dB + perceptual fader", () => {
  assert(Math.abs(dbToGain(0) - 1) < 1e-12, "0 dB = unity");
  assert(Math.abs(dbToGain(-6) - 0.5012) < 1e-3, "−6 dB ≈ 0.5");
  assertEquals(faderGain(0), 0, "bottom = hard mute");
  assert(Math.abs(faderGain(1) - 1) < 1e-12, "top = unity");
  for (let v = 0.05; v <= 1; v += 0.05) { assert(faderGain(v) > 0 && faderGain(v) <= 1, "in (0,1]"); if (v > 0.1) assert(faderGain(v) > faderGain(v - 0.05), "monotone increasing"); }
});

Deno.test("scifi equalPower: constant power crossfade", () => {
  for (let x = 0; x <= 1.0001; x += 0.1) { const { from, to } = equalPower(x); assert(Math.abs(from * from + to * to - 1) < 1e-9, `power held at x=${x.toFixed(1)}`); }
  const a = equalPower(0), b = equalPower(1);
  assert(Math.abs(a.from - 1) < 1e-9 && Math.abs(a.to) < 1e-9, "x=0 → full from");
  assert(Math.abs(b.to - 1) < 1e-9 && Math.abs(b.from) < 1e-9, "x=1 → full to");
});

Deno.test("scifi detune: symmetric cluster centred on the note", () => {
  assertEquals(detune(100, 1, 10), [100], "single voice");
  const v = detune(100, 2, 12);
  assertEquals(v.length, 2);
  assert(v[0] < 100 && v[1] > 100, "straddle the base");
  assert(Math.abs(Math.sqrt(v[0] * v[1]) - 100) < 1e-9, "geometric mean = base (2 voices)");
  const w = detune(200, 5, 20);
  assert(Math.abs(w[2] - 200) < 1e-9, "odd count keeps a voice on the note");
  const geo = w.reduce((p, x) => p * x, 1) ** (1 / w.length);
  assert(Math.abs(geo - 200) < 1e-6, "geometric mean = base (5 voices)");
  for (let i = 1; i < w.length; i++) assert(w[i] > w[i - 1], "ascending");
});

Deno.test("scifi stations: every recipe is well-formed", () => {
  const ids = new Set();
  for (const s of STATIONS) {
    assert(!ids.has(s.id), `unique id ${s.id}`); ids.add(s.id);
    assert(noteFreqOk(s.root), `${s.id}: valid root note ${s.root}`);
    assertEquals(s.iv.length, 3, `${s.id}: exactly 3 chord intervals`);
    for (const L of LAYERS) assert(s.levels[L] >= 0 && s.levels[L] <= 1, `${s.id}: level ${L} in [0,1]`);
    assert(s.air > 100 && s.air < 8000, `${s.id}: air band sane`);
    assert(s.teleGap >= 1000, `${s.id}: telemetry gap sane`);
    const rv = reactorVoices(s);
    assertEquals(rv.length, 6, `${s.id}: 3 chord tones × 2 beating voices = 6`);
    for (let i = 1; i < rv.length; i++) assert(rv[i] >= rv[i - 1] * 0.999, `${s.id}: voices roughly ascending`);
  }
  assertEquals(station("nope").id, STATIONS[0].id, "unknown id falls back to first");
});
function noteFreqOk(n) { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return !!m; }

Deno.test("orbit SGP4: matches the standard reference vector (TLE 00005, t=0)", () => {
  // Vallado "Revisiting Spacetrack Report #3" verification case — the published TEME position at epoch.
  const rec = makeSat(
    "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
    "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667");
  const r = sat.sgp4(rec, 0.0).position;
  assert(Math.abs(r.x - 7022.46529266) < 1e-2, `x=${r.x}`);
  assert(Math.abs(r.y + 1400.08296755) < 1e-2, `y=${r.y}`);
  assert(Math.abs(r.z - 0.03995155) < 1e-2, `z=${r.z}`);
});

Deno.test("orbit subpoint: a real ISS TLE propagates to a sane sub-satellite point", () => {
  const rec = makeSat(FALLBACK_TLE.line1, FALLBACK_TLE.line2);
  const p = subpoint(rec, new Date("2026-07-20T02:10:00Z"));
  assert(p && Number.isFinite(p.lat) && Number.isFinite(p.lon), "got a fix");
  assert(Math.abs(p.lat) <= 52.5, `ISS latitude within inclination ±margin (${p.lat.toFixed(2)})`);
  assert(p.lon >= -180 && p.lon <= 180, "longitude in range");
  assert(p.altKm > 380 && p.altKm < 440, `LEO altitude (${p.altKm.toFixed(1)} km)`);
  assert(p.velocityKmh > 27000 && p.velocityKmh < 28200, `orbital speed (${p.velocityKmh.toFixed(0)} km/h)`);
  assert(typeof p.sunlit === "boolean", "has a sunlit flag");
});

Deno.test("orbit parseTleText: extracts line1/line2 from a 3-line block", () => {
  const got = parseTleText(`ISS (ZARYA)\n${FALLBACK_TLE.line1}\n${FALLBACK_TLE.line2}\n`);
  assertEquals(got.line1, FALLBACK_TLE.line1);
  assertEquals(got.line2, FALLBACK_TLE.line2);
  assertEquals(parseTleText("garbage\nno tle here"), null);
});

Deno.test("orbit sun + shadow: sunlit geometry is correct", () => {
  const d = new Date("2026-07-20T02:10:00Z"), s = sunEciUnit(d);
  assert(Math.abs(Math.hypot(s.x, s.y, s.z) - 1) < 1e-9, "sun direction is a unit vector");
  const far = 8000;
  assert(isSunlit({ x: s.x * far, y: s.y * far, z: s.z * far }, d), "toward the sun → lit");
  assert(!isSunlit({ x: -s.x * 6800, y: -s.y * 6800, z: -s.z * 6800, }, d), "on the shadow axis behind Earth → eclipsed");
  // behind Earth but well off the shadow axis → still lit (add a perpendicular offset)
  const ax = { x: -s.x * 6800, y: -s.y * 6800, z: -s.z * 6800 };
  const perp = Math.abs(s.z) < 0.9 ? { x: 0, y: 0, z: 9000 } : { x: 9000, y: 0, z: 0 };
  assert(isSunlit({ x: ax.x + perp.x, y: ax.y + perp.y, z: ax.z + perp.z }, d), "off-axis behind Earth → lit");
});

Deno.test("mediasession silentWav: a valid all-zero PCM WAV data URI", () => {
  const uri = silentWav(250, 8000);
  assert(uri.startsWith("data:audio/wav;base64,"), "not a wav data URI");
  const bytes = Uint8Array.from(atob(uri.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
  const tag = (o) => String.fromCharCode(...bytes.slice(o, o + 4));
  assertEquals(tag(0), "RIFF"); assertEquals(tag(8), "WAVE"); assertEquals(tag(12), "fmt "); assertEquals(tag(36), "data");
  const dv = new DataView(bytes.buffer);
  const frames = Math.round(8000 * 250 / 1000), dataLen = frames * 2;   // 16-bit mono
  assertEquals(dv.getUint16(34, true), 16, "not 16-bit");
  assertEquals(dv.getUint16(22, true), 1, "not mono");
  assertEquals(dv.getUint32(40, true), dataLen, "data chunk size wrong");
  assertEquals(dv.getUint32(4, true), 36 + dataLen, "RIFF size wrong");
  assertEquals(bytes.length, 44 + dataLen, "byte length wrong");
  assert(bytes.slice(44).every((b) => b === 0), "samples are not silent");
});

// ---- melody.js (the pitched-instrument generator: kalimba, handpan) ----
const D_KURD = [0, 7, 8, 10, 12, 14, 15, 17, 19];        // D Kurd fields as semitones from the ding
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];      // a C-major span

Deno.test("generateMelody is deterministic, seed-addressable, and in-scale", () => {
  const a = generateMelody(D_KURD, { seed: 2024 }), b = generateMelody(D_KURD, { seed: 2024 });
  assertEquals(JSON.stringify(a.notes), JSON.stringify(b.notes), "same seed must reproduce the phrase");
  assert(JSON.stringify(generateMelody(D_KURD, { seed: 7 }).notes) !== JSON.stringify(a.notes), "seeds differ");
  for (const n of a.notes) if (!n.rest) assert(n.i >= 0 && n.i < D_KURD.length, "index out of scale bounds");
});

Deno.test("every generated phrase RESOLVES — the last sounding note is the tonic", () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = generateMelody(C_MAJOR, { seed });
    const last = [...g.notes].reverse().find((n) => !n.rest);
    assert(last, `seed ${seed}: phrase is all rests`);
    assertEquals(((C_MAJOR[last.i] % 12) + 12) % 12, 0, `seed ${seed}: did not cadence on the tonic`);
    assert(g.score >= g.meanScore, `seed ${seed}: winner below its own pool mean`);
  }
});

Deno.test("THE CLAIM: generated melodies are SMOOTHER than random — not a dice roll", () => {
  // "Sweet" is, in part, Huron's small-interval preference. A coin-flip line over the same scale should move
  // by wildly bigger leaps on average than the scored search; if it ever stops, the generator is pointless.
  const meanLeap = (idxs, scale) => { let s = 0; for (let k = 1; k < idxs.length; k++) s += Math.abs(scale[idxs[k]] - scale[idxs[k - 1]]); return s / Math.max(1, idxs.length - 1); };
  let searchWins = 0, sumSearch = 0, sumRandom = 0;
  const SEEDS = 40;
  for (let seed = 0; seed < SEEDS; seed++) {
    const g = generateMelody(D_KURD, { seed });
    const gIdx = g.notes.filter((n) => !n.rest).map((n) => n.i);
    const rng = mulberry32(seed ^ 0x1234abcd);
    const rIdx = Array.from({ length: gIdx.length }, () => Math.floor(rng() * D_KURD.length));
    const gs = meanLeap(gIdx, D_KURD), rs = meanLeap(rIdx, D_KURD);
    sumSearch += gs; sumRandom += rs;
    if (gs < rs) searchWins++;
  }
  assert(searchWins >= SEEDS - 3, `the search must be smoother than random on ~every seed (won ${searchWins}/${SEEDS})`);
  assert(sumSearch / SEEDS < sumRandom / SEEDS - 0.6, "the smoothness margin must be decisive, not noise");
});

Deno.test("scoreMelody rewards a resolving, stepwise phrase over a leapy unresolved one", () => {
  const stepwise = [0, 1, 2, 1, 2, 3, 2, 1, 0].map((i) => ({ i }));      // walks and lands on the tonic
  const leapy = [0, 8, 1, 7, 2, 6, 3, 5, 4].map((i) => ({ i }));         // zig-zags, ends off the tonic
  assert(scoreMelody(stepwise, C_MAJOR) > scoreMelody(leapy, C_MAJOR), "sweet phrase must outscore the leapy one");
});

// ---- vfilter: reel feed cleanup (dedupe + black-poster classifier) ----------------------------------------
Deno.test("vfilter dedupeVideos: exact + signed-variant dupes collapse, order + first kept", () => {
  const items = [
    { video: "https://cdn.x/clip.mp4", title: "A", poster: "p1" },
    { video: "https://cdn.x/other.mp4", title: "B" },
    { video: "https://cdn.x/clip.mp4", title: "A-dup" },                         // exact dup → dropped
    { orig: "https://cdn.x/clip.mp4?token=ZZZ", video: "framed:...", title: "A-signed" }, // same path, diff query → dropped
    { video: "https://cdn.x/third.mp4", title: "C" },
  ];
  const out = dedupeVideos(items);
  assertEquals(out.map((i) => i.title), ["A", "B", "C"]);                        // first occurrence kept, order preserved
});

Deno.test("vfilter dedupeVideos: same poster collapses broken repeats even when video urls differ", () => {
  const items = [
    { video: "https://cdn.x/broken-1.mp4", poster: "https://cdn.x/unavailable.jpg", title: "A" },
    { video: "https://cdn.x/broken-2.mp4", poster: "https://cdn.x/unavailable.jpg?v=2", title: "A-repeat" }, // same poster path → dropped
    { video: "https://cdn.x/good.mp4", poster: "https://cdn.x/good.jpg", title: "B" },
    { video: "https://cdn.x/none-1.mp4" }, { video: "https://cdn.x/none-2.mp4" },                            // null posters never collide
  ];
  assertEquals(dedupeVideos(items).map((i) => i.title || "no-poster"), ["A", "B", "no-poster", "no-poster"]);
});

Deno.test("vfilter dedupeVideos: keeps distinct paths and items without a url; tolerates junk", () => {
  const items = [
    { video: "https://cdn.x/a.mp4" }, { video: "https://cdn.x/b.mp4" },          // distinct → both kept
    { title: "no url 1" }, { title: "no url 2" },                                // unkeyable → both kept
    { orig: "https://cdn.x/a.mp4", video: "framed" },                            // dup of the first (by orig)
  ];
  const out = dedupeVideos(items);
  assertEquals(out.length, 4);
  assertEquals(dedupeVideos(null), []);
  assertEquals(dedupeVideos([]).length, 0);
});

// helper: build an RGBA sample from a flat list of [r,g,b] pixels (alpha forced opaque)
const vpx = (px) => { const a = new Uint8ClampedArray(px.length * 4); px.forEach(([r, g, b], i) => { a[i*4]=r; a[i*4+1]=g; a[i*4+2]=b; a[i*4+3]=255; }); return a; };

Deno.test("vfilter isBlackSample: uniform black / near-black is flagged", () => {
  assert(isBlackSample(vpx(Array(64).fill([0, 0, 0]))), "pure black → broken");
  assert(isBlackSample(vpx(Array(64).fill([6, 6, 6]))), "near-black JPEG floor → broken");
});

Deno.test("vfilter isBlackSample: any real content keeps the clip", () => {
  assert(!isBlackSample(vpx(Array(64).fill([128, 128, 128]))), "mid-grey → not black");
  // a mostly-black frame with ONE bright highlight (a light in a night scene) → real content, keep it
  const nightScene = Array(64).fill([3, 3, 3]); nightScene[40] = [230, 220, 200];
  assert(!isBlackSample(vpx(nightScene)), "dark frame with a highlight → kept (peak test)");
  assert(!isBlackSample(vpx(Array(64).fill([10, 120, 40]))), "coloured → not black");
  assert(!isBlackSample(new Uint8ClampedArray(0)), "empty sample → not black (fail toward keep)");
});

Deno.test("vfilter isFlatSample: any uniform fill (grey/white/coloured/black) is a placeholder", () => {
  assert(isFlatSample(vpx(Array(64).fill([128, 128, 128]))), "flat mid-grey → placeholder (black test misses this)");
  assert(isFlatSample(vpx(Array(64).fill([255, 255, 255]))), "flat white → placeholder");
  assert(isFlatSample(vpx(Array(64).fill([40, 40, 40]))), "flat dark grey → placeholder");
  assert(isFlatSample(vpx(Array(64).fill([0, 0, 0]))), "flat black → placeholder (subsumes the black case)");
  assert(isFlatSample(vpx(Array(64).fill([30, 110, 180]))), "flat coloured card → placeholder");
});

Deno.test("vfilter isFlatSample: real textured content keeps the clip (fail toward keep)", () => {
  // a gradient (dawn sky) — luma marches across the sample, std well above the floor → NOT flat
  const gradient = Array.from({ length: 64 }, (_, i) => { const v = i * 4; return [v, v, v]; });
  assert(!isFlatSample(vpx(gradient)), "gradient → textured, kept");
  // near-flat but with JPEG-noise jitter (±10) → still textured enough to keep
  const noisy = Array.from({ length: 64 }, (_, i) => { const v = 90 + (i % 5) * 7; return [v, v, v]; });
  assert(!isFlatSample(vpx(noisy)), "noisy near-flat → kept");
  // one bright highlight over black (night scene) → variance from the highlight → kept
  const night = Array(64).fill([3, 3, 3]); night[40] = [230, 220, 200];
  assert(!isFlatSample(vpx(night)), "night scene with a highlight → kept");
  assert(!isFlatSample(new Uint8ClampedArray(0)), "empty sample → not flat (fail toward keep)");
});

Deno.test("vfilter hasPoster: only a non-empty string counts", () => {
  assert(hasPoster({ poster: "https://cdn.x/p.jpg" }), "real url → has poster");
  assert(hasPoster({ poster: "data:image/png;base64,AAAA" }), "data uri → has poster");
  assert(!hasPoster({ poster: null }), "null → posterless");
  assert(!hasPoster({ poster: "" }), "empty string → posterless");
  assert(!hasPoster({ poster: "   " }), "whitespace → posterless");
  assert(!hasPoster({ video: "x.mp4" }), "missing key → posterless");
  assert(!hasPoster(null), "no item → posterless");
});

// ---- urlquery: search-param resolver (recognise the search key across popular sites) ---------------------
Deno.test("urlquery resolveSearch: recognises the search key across popular engines/sites", () => {
  const cases = [
    ["https://www.google.com/search?q=cats", "q", "cats"],
    ["https://duckduckgo.com/?q=cats&ia=web", "q", "cats"],
    ["https://www.youtube.com/results?search_query=lofi", "search_query", "lofi"],
    ["https://www.amazon.com/s?k=usb+c&ref=nb", "k", "usb c"],
    ["https://www.ebay.com/sch/i.html?_nkw=vintage+lens", "_nkw", "vintage lens"],
    ["https://www.baidu.com/s?wd=天气", "wd", "天气"],
    ["https://yandex.com/search/?text=погода", "text", "погода"],
    ["https://search.yahoo.com/search?p=news", "p", "news"],
    ["https://www.aliexpress.com/wholesale?SearchText=drone", "SearchText", "drone"],   // original casing preserved
    ["https://example.com/?s=hello", "s", "hello"],                                      // WordPress
    ["https://site.dev/find?keyword=shoes&sort=price", "keyword", "shoes"],
  ];
  for (const [url, key, term] of cases) {
    const r = resolveSearch(url);
    assert(r.searchable, `${url} → should be searchable`);
    assertEquals(r.key, key, `${url} → key`);
    assertEquals(r.term, term, `${url} → term`);
  }
});

Deno.test("urlquery resolveSearch: case-insensitive match, priority order, and non-search params", () => {
  assertEquals(resolveSearch("https://x.com/?Q=Cats").key, "Q", "uppercase key matches, original casing kept");
  assertEquals(resolveSearch("https://x.com/?SEARCH=hi").key, "SEARCH", "SEARCH matches case-insensitively");
  assertEquals(resolveSearch("https://x.com/?s=5&q=cats").key, "q", "q outranks s when both present");
  assert(!resolveSearch("https://x.com/page").searchable, "no query params → not searchable");
  assert(!resolveSearch("https://x.com/?page=2&sort=new").searchable, "query params but no known key → not searchable (never guess)");
  assert(!resolveSearch("not a url").searchable, "unparseable → not searchable");
  assertEquals(resolveSearch("https://x.com/?q=").term, "", "empty value → term '' but still searchable");
  assert(resolveSearch("https://x.com/?q=").searchable, "empty q is still searchable");
});

Deno.test("urlquery buildSearchUrl: swaps the term, preserves path + other params, leaves non-search URLs alone", () => {
  assertEquals(buildSearchUrl("https://g.com/search?q=old&hl=en", "new"), "https://g.com/search?q=new&hl=en");
  assertEquals(buildSearchUrl("https://a.com/s?k=phone&ref=nb", "usb c"), "https://a.com/s?k=usb+c&ref=nb", "space → +");
  assertEquals(buildSearchUrl("https://x.com/?SearchText=a", "b"), "https://x.com/?SearchText=b", "original key casing preserved");
  assertEquals(buildSearchUrl("https://x.com/page", "cats"), "https://x.com/page", "no search key → unchanged");
  assertEquals(buildSearchUrl("nope", "x"), "nope", "unparseable → unchanged");
});

// ---- spectrum.js — audio-reactive visual DSP + geometry math ----
Deno.test("spectrum logBandEdges: monotonic, in-range, correct length", () => {
  const e = logBandEdges(28, 32, 16000, 44100, 2048);
  assertEquals(e.length, 29);
  const bins = 2048 / 2;
  for (let i = 0; i < e.length; i++) { assert(e[i] >= 1 && e[i] <= bins - 1, `edge ${i} in range`); if (i) assert(e[i] >= e[i - 1], "non-decreasing"); }
  assert(e[e.length - 1] > e[0], "spans a real range");
});

Deno.test("spectrum bandLevels: full-scale → ~1, silence → 0, always ≥1 bin", () => {
  const edges = logBandEdges(28, 32, 16000, 44100, 2048);
  const hot = new Uint8Array(1024).fill(255), cold = new Uint8Array(1024);
  const lh = bandLevels(hot, edges); assert(lh.every((v) => Math.abs(v - 1) < 1e-6), "all bands ≈1");
  const lc = bandLevels(cold, edges); assert(lc.every((v) => v === 0), "all bands 0");
  assertEquals(lh.length, 28);
});

Deno.test("spectrum splitBands: energy localises to the right band", () => {
  const sr = 44100, fftSize = 2048, hzPerBin = sr / fftSize;
  const only = (f0, f1) => { const u = new Uint8Array(1024); for (let i = Math.round(f0 / hzPerBin); i <= Math.round(f1 / hzPerBin); i++) u[i] = 255; return u; };
  const b = splitBands(only(20, 150), sr, fftSize); assert(b.bass > 0.9 && b.mid < 0.05 && b.treble < 0.05, "bass isolated");
  const tr = splitBands(only(2000, 16000), sr, fftSize); assert(tr.treble > 0.9 && tr.bass < 0.05, "treble isolated");
});

Deno.test("spectrum spectralCentroid: bass → warm hue, treble → cool hue", () => {
  const sr = 44100, fftSize = 2048, hzPerBin = sr / fftSize;
  const only = (f) => { const u = new Uint8Array(1024); u[Math.round(f / hzPerBin)] = 255; return u; };
  const lo = spectralCentroid(only(80), sr, fftSize), hi = spectralCentroid(only(6000), sr, fftSize);
  assert(lo.hue > hi.hue, "lower centroid → higher (warmer) hue");
  assert(lo.hue <= 280 && hi.hue >= 190, "hue stays inside the signal-palette band");
});

Deno.test("spectrum Envelope: attack faster than release", () => {
  const up = Envelope(0.6, 0.12, 1), tgt = [1];
  up.update(tgt); const afterAttack = up.v[0];
  const down = Envelope(0.6, 0.12, 1); down.v[0] = 1; down.update([0]); const afterRelease = 1 - down.v[0];
  assert(afterAttack > afterRelease, "rises faster than it falls");
  assert(afterAttack > 0 && afterAttack < 1, "eases, not a jump");
});

Deno.test("spectrum advanceTerrain: front row injected, rows recede", () => {
  const rows = 4, cols = 3, grid = new Float32Array(rows * cols);
  advanceTerrain(grid, rows, cols, [1, 1, 1]);
  assert(grid[0] > 0.9, "front row got the level");
  assert(grid[cols] === 0, "second row still empty after one step");
  advanceTerrain(grid, rows, cols, [0, 0, 0]);
  assert(grid[cols] > 0 && grid[cols] < 1, "previous front receded with decay");
});

Deno.test("spectrum Parallax: clamps, low-passes, and reduced-motion zeroes", () => {
  const p = Parallax({ alpha: 1, maxDeg: 20, gain: 1 });
  p.update(40, 40); assert(Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 1) < 1e-6, "beyond maxDeg clamps to 1");
  const s = Parallax({ alpha: 0.1 }); s.update(20, 20); assert(s.x > 0 && s.x < 0.5, "EMA eases in, no jump");
  const r = Parallax({ alpha: 1, reduced: true }); r.update(20, 20); assert(r.x === 0 && r.y === 0, "reduced-motion → centred");
  const n = Parallax({ alpha: 1 }); n.update(null, null); assert(n.x === 0, "null readings → centred");
});

Deno.test("spectrum seedFrame: deterministic, in-range, bass-heavy", () => {
  const a = seedFrame(1024, 0), b = seedFrame(1024, 0);
  assertEquals([...a], [...b], "deterministic for a fixed phase");
  assert(a.every((v) => v >= 0 && v <= 255), "bytes in range");
  const front = a.slice(0, 40).reduce((s, v) => s + v, 0), back = a.slice(-40).reduce((s, v) => s + v, 0);
  assert(front > back, "low frequencies carry more energy");
});

Deno.test("spectrum sampleBand: maps 0..1 across bands, clamps out-of-range", () => {
  const lv = [0.1, 0.2, 0.3, 0.4];
  assertEquals(sampleBand(lv, 0), 0.1, "frac 0 → first band");
  assertEquals(sampleBand(lv, 1), 0.4, "frac 1 → last band");
  assertEquals(sampleBand(lv, -5), 0.1, "clamps below");
  assertEquals(sampleBand(lv, 5), 0.4, "clamps above");
  assertEquals(sampleBand([], 0.5), 0, "empty → 0");
});

Deno.test("spectrum idle: bounded breath around the floor, non-flat", () => {
  for (let p = 0; p < 20; p += 0.3) { const v = idle(p, 0.85, 0.15); assert(v >= 0.7 - 1e-9 && v <= 1 + 1e-9, "in [floor-amp, floor+amp]"); }
  assert(Math.abs(idle(Math.PI / 4, 0.85, 0.15) - 1) < 1e-9, "peaks at floor+amp");
  assert(idle(0) !== idle(1), "actually animates (not constant)");
});

Deno.test("spectrum fib: unit-length, evenly spanning the sphere, no pole clumping", () => {
  const n = 64;
  for (let i = 0; i < n; i++) { const [x, y, z] = fib(i, n); assert(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9, "on the unit sphere"); }
  assert(fib(0, n)[1] > 0.9 && fib(n - 1, n)[1] < -0.9, "spans top to bottom");
  const mid = fib(Math.floor(n / 2), n)[1]; assert(Math.abs(mid) < 0.1, "middle index sits near the equator (even spacing)");
});

Deno.test("spectrum galaxyDisc: right length, inside the radius, thin disc, deterministic per rng", () => {
  const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.5, 0.15, 0.85]; let k = 0;
  const rng = () => seq[k++ % seq.length];
  const g = galaxyDisc(4, { radius: 5, branches: 4, spin: 1, randomness: 0.4, power: 3, thin: 0.5 }, rng);
  assertEquals(g.length, 12, "n*3 floats");
  for (let i = 0; i < 4; i++) { const r = Math.hypot(g[i * 3], g[i * 3 + 2]); assert(r <= 5 * (1 + 0.4) + 1e-6, "within radius + jitter"); assert(Math.abs(g[i * 3 + 1]) <= 5 * 0.4 * 0.5 + 1e-6, "y squashed to a thin disc"); }
  k = 0; const g2 = galaxyDisc(4, { radius: 5, branches: 4 }, () => seq[k++ % seq.length]);
  assertEquals([...g], [...g2], "deterministic for a fixed rng");
});

// ---- ripple.js — percussive wave-field ----
Deno.test("ring: crest at the front (u=0) is 1, decays away from it", () => {
  assertEquals(ring(0, 0.95, 3.7), 1, "peak at the wavefront");
  assert(Math.abs(ring(3, 0.95, 3.7)) < 0.01, "Gaussian-windowed → ~0 far from the front");
});

Deno.test("RippleField: the crest rides an outgoing front r=speed·age", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, hue: 260, t: 0 });
  const age = 1, front = RIPPLE_DEFAULTS.speed * age;   // 4.6
  const atFront = Math.abs(f.sample(front, 0, age).h);
  const atOrigin = Math.abs(f.sample(0, 0, age).h);
  assert(atFront > atOrigin, "displacement peaks at the wavefront, not the origin");
  assert(atFront > 0.05, "the crest carries real amplitude");
});

Deno.test("RippleField: energy decays monotonically after a strike", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, t: 0 });
  const e0 = f.energy(0.2), e1 = f.energy(0.8), e2 = f.energy(2.0);
  assert(e0 > e1 && e1 > e2, "ring-out: energy only falls");
  assert(e0 <= 1.0001, "starts at ≤ amp");
});

Deno.test("RippleField: amplitude-weighted hue leans to the dominant strike", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, hue: 210, t: 0 });   // near, strong
  f.strike(9, 0, { amp: 1, hue: 290, t: 0 });   // far
  const front = RIPPLE_DEFAULTS.speed * 1;       // sample on the near strike's crest at t=1
  const hue = f.sample(front, 0, 1).hue;
  assert(hue >= 200 && hue <= 300, "hue stays in the non-wrapping band");
  assert(Math.abs(hue - 210) < Math.abs(hue - 290), "biased toward the crest we sampled on");
});

Deno.test("RippleField: prune drops rung-out strikes; max caps the source list", () => {
  const f = RippleField({ life: 0.2, max: 3 });
  f.strike(0, 0, { t: 0 });
  assertEquals(f.active(), 1);
  f.prune(5);                                    // long after → below eps
  assertEquals(f.active(), 0, "pruned the dead strike");
  for (let i = 0; i < 6; i++) f.strike(i, 0, { t: 0 });
  assertEquals(f.active(), 3, "capped at max, oldest evicted");
});

Deno.test("RippleField: deterministic (no Math.random) — identical sequences match", () => {
  const build = () => { const f = RippleField(); f.strike(1, 2, { amp: 0.8, hue: 240, t: 0 }); f.strike(-3, 1, { amp: 0.5, hue: 280, t: 0.3 }); return f; };
  const a = build().sample(2, 2, 0.7), b = build().sample(2, 2, 0.7);
  assertEquals(a.h, b.h, "same height");
  assertEquals(a.hue, b.hue, "same hue");
});

// ---- colour.js — adaptive app-icon tint ----
Deno.test("hexRgb: parses #rrggbb, #rgb shorthand, tolerates junk", () => {
  assertEquals(hexRgb("#ECECEE"), [236, 236, 238]);
  assertEquals(hexRgb("#fff"), [255, 255, 255]);
  assertEquals(hexRgb("E9458B"), [233, 69, 139]);
  assertEquals(hexRgb("#zzz"), [0, 0, 0]);
});

Deno.test("iconTint: dark theme keeps the brand tile + vibrant glyph", () => {
  const it = iconTint("#0C1014", "#E9458B", true);
  assert(it.tile.includes("#0C1014"), "dark tile built on the brand bg");
  assertEquals(it.glyph, "#E9458B", "dark glyph is the raw accent");
});

Deno.test("iconTint: light theme → pastel accent tile, no black square", () => {
  const it = iconTint("#0C1014", "#E9458B", false);
  assert(it.tile.includes("#fff") && it.tile.includes("#E9458B"), "light tile is the accent mixed into white");
  assert(!it.tile.includes("#0C1014"), "the raw near-black bg is NOT the light tile");
  assert(it.glyph.includes("#E9458B"), "light glyph carries the accent");
});

Deno.test("iconTint: inky/neutral accent falls back to the brand bg (stays legible on light)", () => {
  const it = iconTint("#0A0A0F", "#ECECEE", false);   // ink-white accent would wash out on white
  assert(it.tile.includes("#0A0A0F"), "light tile colours from the brand bg, not the near-white accent");
  assert(!it.glyph.includes("#ECECEE"), "glyph is not the invisible near-white accent");
  // a vibrant-but-light accent (yellow) is NOT treated as inky — it keeps its own colour
  assert(iconTint("#231708", "#FFD21E", false).tile.includes("#FFD21E"), "saturated yellow stays the hue source");
});

// ---- wish (wishlist logic) --------------------------------------------------
Deno.test("toNumber: normalises grouped/decimal forms", () => {
  assertEquals(toNumber("1 299,00"), 1299);
  assertEquals(toNumber("1,299.00"), 1299);
  assertEquals(toNumber("14 200"), 14200);
  assertEquals(toNumber("199,90"), 199.9);
  assertEquals(toNumber("14 200"), 14200);   // NBSP thousands (how many sites print UAH)
  assertEquals(toNumber("nope"), null);
});

Deno.test("parsePrice: anchors a number to a currency, ignores bare numbers", () => {
  assertEquals(parsePrice("Ціна 14 200 ₴ зі знижкою"), { price: 14200, currency: "UAH" });
  assertEquals(parsePrice("$1,299.00 today"), { price: 1299, currency: "USD" });
  assertEquals(parsePrice("199 zł"), { price: 199, currency: "PLN" });
  assertEquals(parsePrice("тільки 990 грн"), { price: 990, currency: "UAH" });
  assertEquals(parsePrice("iPhone 15 Pro"), null, "a model number is not a price");
  assertEquals(parsePrice(""), null);
});

Deno.test("parseWishMeta: pulls title + price + first image, all fail-open", () => {
  const data = {
    title: "  Sony WH-1000XM5  ",
    description: "Найкращі навушники — 13 999 ₴",
    content: "spec spec ![alt](https://img.example/x.jpg) more",
  };
  const m = parseWishMeta(data, "https://shop/x");
  assertEquals(m.title, "Sony WH-1000XM5");
  assertEquals(m.price, 13999);
  assertEquals(m.currency, "UAH");
  assertEquals(m.image, "https://img.example/x.jpg");
  // empty data → empty fields, never throws
  const e = parseWishMeta({}, "u");
  assertEquals(e.title, ""); assertEquals(e.price, null); assertEquals(e.image, "");
});

Deno.test("sortWishes: most-wanted first, then newest; non-mutating", () => {
  const src = [
    { id: "a", want: 1, createdAt: 100 },
    { id: "b", want: 3, createdAt: 50 },
    { id: "c", want: 3, createdAt: 90 },
  ];
  assertEquals(sortWishes(src).map((w) => w.id), ["c", "b", "a"]);
  assertEquals(src[0].id, "a", "input array not mutated");
});

Deno.test("wishTotals: groups non-granted by currency, skips granted/priceless", () => {
  const t = wishTotals([
    { price: 100, currency: "USD" },
    { price: 50, currency: "USD", granted: true },   // granted → excluded
    { price: 14200, currency: "UAH" },
    { price: null, currency: "UAH" },                 // no price → excluded
    { price: 200, currency: "USD" },
  ]);
  assertEquals(t, [{ currency: "UAH", sum: 14200, count: 1 }, { currency: "USD", sum: 300, count: 2 }]);
});

Deno.test("fmtMoney: grouped thousands, symbol side per currency", () => {
  const NB = " ";
  assertEquals(fmtMoney(14200, "UAH"), `14${NB}200${NB}₴`);
  assertEquals(fmtMoney(1299, "USD"), `$1${NB}299`);
  assertEquals(fmtMoney(199, "PLN"), `199${NB}zł`);
  assertEquals(fmtMoney(199.9, "EUR"), "€199,90");
  assertEquals(fmtMoney(null, "UAH"), "");
});

Deno.test("RippleField.glow: a soft halo, bright at the strike, fading with distance + time", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, t: 0 });
  const c0 = f.glow(0, 0, 0.05), near = f.glow(0.5, 0, 0.05), far = f.glow(4, 0, 0.05);
  assert(c0 > near && near > far, "brightest at the strike point, falls off with distance");
  assert(f.glow(0, 0, 0.05) > f.glow(0, 0, 1.2), "fades over time");
  assert(far < 0.05, "localised — negligible far away");
});

// ================= HackRF FM DSP (fmradio.js) =================

Deno.test("iqFromBytes: signed int8 → ±1 float, interleaved I,Q", () => {
  const { i, q } = iqFromBytes(new Uint8Array([0, 64, 128, 192]));
  assertEquals(i[0], 0);            // byte 0 → 0
  assertEquals(q[0], 0.5);          // byte 64 → +0.5
  assertEquals(i[1], -1);           // byte 128 = int8 -128 → -1.0
  assertEquals(q[1], -0.5);         // byte 192 = int8 -64 → -0.5
});

Deno.test("firLowpass: symmetric, unity DC gain, correct length", () => {
  const h = firLowpass(33, 10_000, 250_000);
  assertEquals(h.length, 33);
  let sum = 0; for (const t of h) sum += t;
  assert(Math.abs(sum - 1) < 1e-6, "taps sum to 1 (0 dB at DC)");
  for (let k = 0; k < 16; k++) assert(Math.abs(h[k] - h[32 - k]) < 1e-9, "linear-phase symmetric");
});

Deno.test("deemphasisAlpha: matches 1/(1+fs·tc/1e6), in (0,1), larger tc → smaller alpha", () => {
  assertEquals(deemphasisAlpha(250_000, 50), 1 / (1 + (250_000 * 50) / 1e6));
  const a = deemphasisAlpha(250_000, 50);
  assert(a > 0 && a < 1);
  assert(deemphasisAlpha(250_000, 75) < a, "75µs rolls off more → smaller alpha");
});

Deno.test("fft: matches a naive DFT within eps; single-bin sine lands in its bin", () => {
  const n = 16, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 0; k < n; k++) re[k] = Math.cos(2 * Math.PI * 3 * k / n);   // pure bin-3 real tone
  const dftMag = (b) => { let r = 0, i = 0; for (let k = 0; k < n; k++) { const a = -2 * Math.PI * b * k / n; r += re[k] * Math.cos(a); i += re[k] * Math.sin(a); } return Math.hypot(r, i); };
  const expect = [...Array(n)].map((_, b) => dftMag(b));
  fft(re, im);
  for (let b = 0; b < n; b++) assert(Math.abs(Math.hypot(re[b], im[b]) - expect[b]) < 1e-3, `bin ${b} matches DFT`);
  // energy at bins 3 and n-3 (real tone → symmetric), negligible elsewhere
  assert(Math.hypot(re[3], im[3]) > 5 && Math.hypot(re[13], im[13]) > 5);
  assert(Math.hypot(re[7], im[7]) < 1e-2);
});

Deno.test("powerSpectrum: fftshift puts a baseband (DC) tone in the centre bin", () => {
  const n = 256, i = new Float32Array(n), q = new Float32Array(n);
  for (let k = 0; k < n; k++) { i[k] = 1; q[k] = 0; }               // DC → all energy at 0 Hz
  const mag = powerSpectrum(i, q, n, n);
  let peak = 0; for (let b = 1; b < n; b++) if (mag[b] > mag[peak]) peak = b;
  assertEquals(peak, n / 2, "DC lands in the centre after fftshift");
});

Deno.test("FmReceiver: an FM tone demodulates to that audio tone (end-to-end DSP)", () => {
  // Synthesize a HackRF-style int8 IQ block: carrier at the OFFSET (so the receiver's digital shift brings it
  // to baseband), FM-modulated by a 1 kHz tone. Then assert the demodulated audio's dominant bin ≈ 1 kHz.
  const fAudio = 1000, dev = 40_000, blocks = 4, per = 65536;
  const rx = new FmReceiver({ tcUs: 50 });
  let phase = 0, ph2 = 0, nAll = 0;
  const audioAll = [];
  for (let bidx = 0; bidx < blocks; bidx++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const msg = Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);
      phase += 2 * Math.PI * (OFFSET_HZ + dev * msg) / IN_RATE;      // instantaneous carrier phase
      const I = Math.cos(phase), Q = Math.sin(phase);
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(I * 120))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Q * 120))) + 256) & 0xff;
    }
    const { audio } = rx.process(bytes);
    for (const s of audio) audioAll.push(s);
  }
  // FFT the (settled) tail of the audio and find the dominant frequency
  const a = audioAll.slice(-8192);
  const size = 4096, re = new Float32Array(size), im = new Float32Array(size);
  for (let k = 0; k < size; k++) re[k] = a[a.length - size + k] || 0;
  fft(re, im);
  let peak = 1; for (let b = 2; b < size / 2; b++) if (Math.hypot(re[b], im[b]) > Math.hypot(re[peak], im[peak])) peak = b;
  const detected = peak * OUT_RATE / size;
  assert(Math.abs(detected - fAudio) < 80, `demodulated tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("seedSpectrum: deterministic, finite, station peak in the centre", () => {
  const a = seedSpectrum(256, 10), b = seedSpectrum(256, 10);
  assertEquals([...a], [...b], "no Math.random → stable for shoots/e2e");
  for (const v of a) assert(Number.isFinite(v));
  const mid = a[128];
  assert(mid > a[10] && mid > a[240], "tuned carrier sits mid-band");
});

// ================= HackRF protocol (hackrf.js) =================

Deno.test("hackrf request codes + ids match libhackrf", () => {
  assertEquals([REQUEST.SET_TRANSCEIVER_MODE, REQUEST.SAMPLE_RATE_SET, REQUEST.BASEBAND_FILTER_BANDWIDTH_SET, REQUEST.SET_FREQ, REQUEST.AMP_ENABLE, REQUEST.SET_LNA_GAIN, REQUEST.SET_VGA_GAIN], [1, 6, 7, 16, 17, 19, 20]);
  assertEquals([MODE.OFF, MODE.RECEIVE, MODE.TRANSMIT], [0, 1, 2]);
  assertEquals([VENDOR_ID, PRODUCT_ID], [0x1d50, 0x6089]);
  assertEquals(TRANSFER_SIZE, 262144);
});

Deno.test("sampleRatePayload: LE { freq_hz, divider }", () => {
  const v = new DataView(sampleRatePayload(2_000_000));
  assertEquals(v.getUint32(0, true), 2_000_000);
  assertEquals(v.getUint32(4, true), 1);
});

Deno.test("setFreqPayload: LE { freq_mhz, freq_hz } split", () => {
  const v = new DataView(setFreqPayload(99_750_000));
  assertEquals(v.getUint32(0, true), 99);           // MHz part
  assertEquals(v.getUint32(4, true), 750_000);      // Hz remainder
  const dc = new DataView(setFreqPayload(100_000_000));
  assertEquals(dc.getUint32(0, true), 100); assertEquals(dc.getUint32(4, true), 0);
});

Deno.test("gain clamps snap to hardware steps and range", () => {
  assertEquals(clampLnaGain(15), 16);   // 8-dB steps
  assertEquals(clampLnaGain(99), 40);   // max
  assertEquals(clampLnaGain(-5), 0);
  assertEquals(clampVgaGain(21), 22);   // 2-dB steps
  assertEquals(clampVgaGain(99), 62);   // max
});

Deno.test("baseband filter rounds down to a valid MAX2837 bandwidth, packed low16/high16", () => {
  assertEquals(roundBasebandFilter(2_000_000), 1_750_000);   // largest valid ≤ request
  assertEquals(roundBasebandFilter(1_000_000), 1_750_000);   // below range → minimum
  assertEquals(roundBasebandFilter(28_000_000), 28_000_000);
  const p = basebandFilterParams(1_750_000);
  assertEquals((p.index << 16) | p.value, 1_750_000);
});

// ================= RDS (rds.js) =================
// A standard RDS modulator (independent of the decoder's internals) so the whole chain — CRC/offset framing
// AND the 57 kHz DBPSK DSP — is validated by a synthetic-signal round-trip, the same tactic as the FM test.
function rdsCrc10(data16) { let reg = 0; for (let i = 25; i >= 0; i--) { const bit = i >= 10 ? (data16 >> (i - 10)) & 1 : 0; reg = (reg << 1) | bit; if (reg & 0x400) reg ^= 0x5B9; reg &= 0x7FF; } return reg & 0x3FF; }
function rdsBlock(data16, off) { return ((data16 & 0xFFFF) << 10) | ((rdsCrc10(data16) ^ off) & 0x3FF); }
function blockBits(b26) { const a = []; for (let i = 25; i >= 0; i--) a.push((b26 >> i) & 1); return a; }
function groupBits(a, b, c, d) { return [...blockBits(rdsBlock(a, OFFSET.A)), ...blockBits(rdsBlock(b, OFFSET.B)), ...blockBits(rdsBlock(c, OFFSET.C)), ...blockBits(rdsBlock(d, OFFSET.D))]; }
const PI = 0x1234, PTY = 10;
const PS = "TEST FM ", RT = "HELLO RADIO\r";
function ps0A(seg) { const b = (PTY << 5) | (1 << 3) | (seg & 3); const d = (PS.charCodeAt(seg * 2) << 8) | PS.charCodeAt(seg * 2 + 1); return groupBits(PI, b, 0, d); }
function rt2A(addr) { const b = 0x2000 | (PTY << 5) | (addr & 0xF); const cc = (i) => (i < RT.length ? RT.charCodeAt(i) : 0x20); const c = (cc(addr * 4) << 8) | cc(addr * 4 + 1), d = (cc(addr * 4 + 2) << 8) | cc(addr * 4 + 3); return groupBits(PI, b, c, d); }
function rdsStream(reps) { const bits = []; for (let r = 0; r < reps; r++) { for (let s = 0; s < 4; s++) bits.push(...ps0A(s)); for (let a = 0; a < 3; a++) bits.push(...rt2A(a)); } return bits; }

Deno.test("rds syndrome: a clean block's syndrome equals its own offset word (match table)", () => {
  for (const data of [0x0000, 0x1234, 0xABCD, 0xFFFF]) {
    assertEquals(syndrome(rdsBlock(data, OFFSET.A)), OFFSET.A);
    assertEquals(syndrome(rdsBlock(data, OFFSET.B)), OFFSET.B);
    assertEquals(syndrome(rdsBlock(data, OFFSET.C)), OFFSET.C);
    assertEquals(syndrome(rdsBlock(data, OFFSET.D)), OFFSET.D);
  }
  assert(syndrome(rdsBlock(0x1234, OFFSET.A) ^ 1) !== OFFSET.A, "a single bit error changes the syndrome");
});

Deno.test("ptyName / rdsChar tables", () => {
  assertEquals(ptyName(10), "Pop music"); assertEquals(ptyName(1), "News"); assertEquals(ptyName(0), "None");
  assertEquals(rdsChar(0x54), "T"); assertEquals(rdsChar(0x0D), "\r"); assertEquals(rdsChar(0x02), "·");
});

Deno.test("rds framing: bitstream → block sync → parser recovers PS, RadioText, PTY, PI", () => {
  const sync = new RdsBlockSync(), parser = new RdsParser();
  for (const bit of rdsStream(12)) { const g = sync.pushBit(bit); if (g) parser.group(g); }
  const s = parser.snapshot();
  assertEquals(s.pi, PI);
  assertEquals(s.ptyName, "Pop music");
  assertEquals(s.ps, "TEST FM");
  assertEquals(s.rt, "HELLO RADIO");
});

Deno.test("rds end-to-end DSP: 57 kHz DBPSK MPX → Rds recovers the station metadata", () => {
  const FS = 250_000, CHIP = 2375;   // 2 chips per bit
  const bits = rdsStream(30);
  // differential encode, then biphase (Manchester) chips: e=1 → [+1,−1], e=0 → [−1,+1]
  const chips = []; let e = 0;
  for (const b of bits) { e ^= b; chips.push(e ? 1 : -1, e ? -1 : 1); }
  // modulate chips onto a 57 kHz subcarrier at FS (rectangular chips; the decoder's LPF shapes them)
  const total = Math.floor(chips.length * FS / CHIP);
  const mpx = new Float32Array(total);
  for (let n = 0; n < total; n++) { const ci = Math.floor(n * CHIP / FS); mpx[n] = 0.7 * chips[ci] * Math.cos(2 * Math.PI * 57000 * n / FS); }
  const rds = new Rds(FS);
  let snap;
  for (let i = 0; i < total; i += 8192) snap = rds.process(mpx.subarray(i, Math.min(total, i + 8192)));
  assert(rds.groups > 20, `decoded too few groups (${rds.groups})`);
  assertEquals(snap.pi, PI);
  assertEquals(snap.ptyName, "Pop music");
  assertEquals(snap.ps, "TEST FM");
  assert(/HELLO RADIO/.test(snap.rt), `RadioText not recovered: "${snap.rt}"`);
});

Deno.test("rds DSP robustness: locks through a carrier phase+freq offset and additive noise", () => {
  const FS = 250_000, CHIP = 2375;
  const bits = rdsStream(45);
  const chips = []; let e = 0;
  for (const b of bits) { e ^= b; chips.push(e ? 1 : -1, e ? -1 : 1); }
  const total = Math.floor(chips.length * FS / CHIP);
  const mpx = new Float32Array(total);
  // deterministic pseudo-noise (no Math.random in this suite's spirit), a static phase offset, +6 Hz carrier drift
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let n = 0; n < total; n++) { const ci = Math.floor(n * CHIP / FS); mpx[n] = 0.7 * chips[ci] * Math.cos(2 * Math.PI * 57006 * n / FS + 1.1) + 0.05 * rnd(); }
  const rds = new Rds(FS);
  let snap; for (let i = 0; i < total; i += 8192) snap = rds.process(mpx.subarray(i, Math.min(total, i + 8192)));
  assertEquals(snap.ps, "TEST FM");
  assertEquals(snap.ptyName, "Pop music");
  assert(/HELLO RADIO/.test(snap.rt), `RadioText not recovered under impairment: "${snap.rt}"`);
});

// ================= FM auto-scan helpers (fmradio.js) =================
Deno.test("goertzelPower: peaks at the target bin, low off-target", () => {
  const N = 2500, fs = IF_RATE, tone = new Float32Array(N);
  for (let n = 0; n < N; n++) tone[n] = Math.sin(2 * Math.PI * 19000 * n / fs);
  const at19 = goertzelPower(tone, PILOT_COEFF);
  const off = goertzelPower(tone, 2 * Math.cos(2 * Math.PI * 30000 / fs));
  assert(at19 > 100 * off, "a 19 kHz tone concentrates at the 19 kHz bin");
});

Deno.test("pilotRatioDb: high with a pilot present, low on noise", () => {
  const N = 2500, fs = IF_RATE;
  let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const withPilot = new Float32Array(N), noise = new Float32Array(N);
  for (let n = 0; n < N; n++) { const nz = 0.3 * rnd(); withPilot[n] = Math.sin(2 * Math.PI * 19000 * n / fs) + nz; noise[n] = nz; }
  assert(pilotRatioDb(withPilot) > 6, `pilot should be detected: ${pilotRatioDb(withPilot).toFixed(1)} dB`);
  assert(pilotRatioDb(noise) < 6, `noise should not: ${pilotRatioDb(noise).toFixed(1)} dB`);
});

Deno.test("rssiFromBytes: stronger IQ → higher dBFS, monotone", () => {
  const mk = (amp) => { const b = new Uint8Array(2048); for (let i = 0; i < b.length; i++) b[i] = (Math.round(amp * Math.sin(i)) + 256) & 0xff; return b; };
  assert(rssiFromBytes(mk(100)) > rssiFromBytes(mk(20)), "louder signal reads higher");
  assert(rssiFromBytes(mk(100)) < 0, "dBFS is ≤ 0 (relative to full scale)");
});

// ---- RDS stable/accumulating display layer ----
const g0A = (ps, seg, ok = [1, 1, 1, 1]) => ({ a: 0x1234, b: (10 << 5) | (seg & 3), c: 0, d: (ps.charCodeAt(seg * 2) << 8) | ps.charCodeAt(seg * 2 + 1), ok });
const feedPS = (p, ps, reps) => { for (let r = 0; r < reps; r++) for (let s = 0; s < 4; s++) p.group(g0A(ps, s)); };
const g2A = (str, addr, ab = 0, ok = [1, 1, 1, 1]) => { const cc = (i) => (i < str.length ? str.charCodeAt(i) : 0x20); return { a: 0x1234, b: 0x2000 | (ab << 4) | (addr & 0xF), c: (cc(addr * 4) << 8) | cc(addr * 4 + 1), d: (cc(addr * 4 + 2) << 8) | cc(addr * 4 + 3), ok }; };

Deno.test("rds PS latch: a confirmed name survives noise + dropout (never cleared)", () => {
  const p = new RdsParser();
  feedPS(p, "TEST FM ", 3);
  assertEquals(p.snapshot().ps, "TEST FM");
  // a single differing group must not flip a 2-of-3-confirmed name
  for (let s = 0; s < 4; s++) p.group(g0A("HITS ONE", s));
  assertEquals(p.snapshot().ps, "TEST FM", "one group can't overwrite a confirmed name");
  // CRC-failed (bad block-D) groups write nothing → name holds
  for (let r = 0; r < 3; r++) for (let s = 0; s < 4; s++) p.group(g0A("XXXXXXXX", s, [1, 1, 1, 0]));
  assertEquals(p.snapshot().ps, "TEST FM", "bad blocks never reach the buffer");
});

Deno.test("rds dynamic PS: a churning name is detected and kept out of the name slot", () => {
  const p = new RdsParser();
  feedPS(p, "AAAA1111", 2); feedPS(p, "BBBB2222", 2); feedPS(p, "CCCC3333", 2);
  const s = p.snapshot();
  assert(s.dynamic, "three distinct confirmed names → dynamic");
  assert(s.ps !== "CCCC3333", "name slot is frozen, not following the scroll");
  assertEquals(s.scroll, "CCCC3333", "latest frame is exposed as scroll text");
});

Deno.test("rds RadioText: A/B flag debounced, last complete message latched", () => {
  const p = new RdsParser();
  for (let r = 0; r < 3; r++) { p.group(g2A("HELLO\r", 0, 0)); p.group(g2A("HELLO\r", 1, 0)); }
  assertEquals(p.snapshot().rt, "HELLO");
  p.group(g2A("XXXXXX", 0, 1));                 // a single flipped A/B must NOT wipe the text
  assertEquals(p.snapshot().rt, "HELLO", "one flipped A/B can't clear RadioText");
  for (let r = 0; r < 3; r++) { p.group(g2A("WORLD\r", 0, 1)); p.group(g2A("WORLD\r", 1, 1)); } // sustained new message
  assertEquals(p.snapshot().rt, "WORLD", "a debounced new message replaces atomically");
});

// ================= GSM band model (gsmband.js) =================
Deno.test("arfcn↔freq per TS 45.005, round-trips", () => {
  assertEquals(arfcnToFreq("gsm900", 1), 935.2e6);
  assertEquals(arfcnToFreq("gsm900", 124), 959.8e6);
  assertEquals(Math.round(arfcnToFreq("dcs1800", 512)), 1805.2e6);
  assertEquals(Math.round(arfcnToFreq("dcs1800", 885)), 1879.8e6);
  for (const [band, n] of [["gsm900", 62], ["gsm900", 100], ["dcs1800", 512], ["dcs1800", 700]]) {
    assertEquals(freqToArfcn(band, arfcnToFreq(band, n)), n, `${band} ${n} round-trips`);
  }
});

Deno.test("arfcnPowers: a spectral peak lands on its ARFCN; activeArfcns picks it out", () => {
  const b = BANDS.gsm900, df = 25_000, n0 = Math.round((b.dlLo - 2e6) / df);
  // build a flat -100 dB band profile with a +40 dB bump exactly at ARFCN 50's centre
  const f0 = b.dlLo - 1e6, N = Math.ceil((b.dlHi + 1e6 - f0) / df), db = new Float32Array(N).fill(-100);
  const fc = arfcnToFreq("gsm900", 50), bin = Math.round((fc - f0) / df);
  db[bin] = -60;
  const powers = arfcnPowers("gsm900", { f0, df, db });
  assertEquals(powers.length, b.arfcnHi - b.arfcnLo + 1, "one entry per ARFCN in band");
  const active = activeArfcns(powers, 8);
  assertEquals(active[0].arfcn, 50, "the lit channel is ARFCN 50");
  assert(active.length <= 3, "only the bump is active over the floor");
});

Deno.test("steadyScore: a constant-power (BCCH-like) carrier scores higher than a fluctuating one", () => {
  assert(steadyScore([-60, -60, -61, -60]) > steadyScore([-60, -80, -55, -90]), "steady > bursty");
  assertEquals(steadyScore([-60]), 0, "needs history");
});

// ================= Sub-GHz OOK clone (ook.js) + HackRF TX =================
Deno.test("hackrf TX: TX VGA gain clamps 0–47 (1 dB); TX endpoint = 2", () => {
  assertEquals(clampTxVgaGain(30), 30);
  assertEquals(clampTxVgaGain(99), 47);
  assertEquals(clampTxVgaGain(-5), 0);
  assertEquals(TX_ENDPOINT, 2);
});

Deno.test("renderOOK: correct length; ON regions carry a carrier, OFF is silence", () => {
  const iq = renderOOK([+1000, -1000], { fs: 2e6, repeats: 1, gapUs: 0, tailUs: 0, amp: 110 });
  assertEquals(iq.length, 2 * (2000 + 2000));            // 1000µs ON + 1000µs OFF @ 2 MSps = 2000+2000 samples
  let onMag = 0, offMag = 0;
  for (let s = 0; s < 2000; s++) onMag += iq[2 * s] ** 2 + iq[2 * s + 1] ** 2;
  for (let s = 2000; s < 4000; s++) offMag += iq[2 * s] ** 2 + iq[2 * s + 1] ** 2;
  assert(onMag > 2000 * 100 * 100 * 0.9, "ON carries a full-scale carrier");
  assertEquals(offMag, 0, "OFF is exactly zero");
});

Deno.test("OOK round-trip: renderOOK → capture recovers the timing frame (validates both sides)", () => {
  // EV1527-style; a real frame's last OFF merges into the inter-frame gap, so the recoverable frame ends on an
  // ON pulse (the lost last-OFF is just part of the gap the replay re-adds anyway).
  const frame = [+400, -1200, +1200, -400, +400, -1200, +1200];
  const iq = renderOOK(frame, { fs: 2e6, freqOffset: 250_000, amp: 110, repeats: 1, gapUs: 6000, tailUs: 6000 });
  const bytes = new Uint8Array(iq.buffer);
  const timings = capture(bytes, { fs: 2e6, decim: 8 });
  const { frame: got } = isolateFrame(timings, { gapUs: 3000 });
  assert(framesEqual(got, frame, 0.15), `recovered ${JSON.stringify(got)} ≈ ${JSON.stringify(frame)}`);
});

Deno.test("isolateFrame: splits repeated frames on long gaps, keeps the modal frame", () => {
  const f = [+400, -1200, +1200, -400];
  const stream = [...f, -5000, ...f, -5000, ...f, -5000];   // 3 repeats separated by 5 ms gaps
  const iso = isolateFrame(stream, { gapUs: 3000 });
  assertEquals(iso.frame, f);
  assertEquals(iso.repeats, 3);
});

Deno.test("framesEqual: identical→fixed(true), different→rolling(false)", () => {
  const a = [+400, -1200, +1200, -400];
  assert(framesEqual(a, [+410, -1180, +1220, -390], 0.15), "same code within tolerance");
  assert(!framesEqual(a, [+1200, -400, +400, -1200], 0.15), "different code (rolling)");
  assert(!framesEqual(a, [+400, -1200], 0.15), "different length");
  assertEquals(OOK_FREQS[0], 433_920_000);
});

// ================= LoRa CSS detect (lora.js) =================
Deno.test("LoRa dechirp round-trip: makeUpSymbol(s) → dechirpArgmax recovers s exactly", () => {
  for (const sf of [7, 9]) {
    const N = 1 << sf, d = refDownchirp(N);
    for (const s of [0, 1, 42, N - 1]) {
      const sym = makeUpSymbol(N, s);
      assertEquals(dechirpArgmax(sym.re, sym.im, d, N).bin, s, `SF${sf} s=${s}`);
    }
  }
});

Deno.test("LoRa preamble detection: 8 up-chirps → run found; noise → not found", () => {
  const sf = 7, N = 1 << sf, K = 8;
  // preamble = K identical base up-chirps (s=0), concatenated
  const re = new Float32Array(K * N), im = new Float32Array(K * N);
  for (let k = 0; k < K; k++) { const s = makeUpSymbol(N, 0); re.set(s.re, k * N); im.set(s.im, k * N); }
  const det = detectPreamble(re, im, sf);
  assert(det.found, `preamble not found (run ${det.run})`);
  assert(det.run >= 6, "run too short");
  assert(Math.abs(det.bin) <= 1, "preamble should peak near bin 0");
  assert(det.pr > 8, "clean tone PR should be high");
  // deterministic pseudo-noise → no preamble
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const nr = new Float32Array(K * N), ni = new Float32Array(K * N);
  for (let i = 0; i < nr.length; i++) { nr[i] = rnd(); ni[i] = rnd(); }
  assert(!detectPreamble(nr, ni, sf).found, "noise falsely detected as LoRa");
});

Deno.test("LoRa presets: Meshtastic EU LongFast = SF11/BW250 @ 869.525 MHz", () => {
  const lf = LORA_PRESETS.find((p) => p.key === "longfast");
  assertEquals([lf.sf, lf.bw, lf.freq], [11, 250_000, 869_525_000]);
});

Deno.test("LoRa whitening table: 255 bytes, seed 0xFF", () => {
  assertEquals(WHITENING.length, 255);
  assertEquals(WHITENING[0], 0xff);
});

Deno.test("LoRa PHY codec: encode → decode round-trip recovers exact payload (SF×CR×CRC×header)", () => {
  const payloads = [
    [0x48, 0x65, 0x6c, 0x6c, 0x6f],                     // "Hello"
    [0x00, 0xff, 0x01, 0xfe, 0x80, 0x7f, 0x2a],         // edge bytes
    [0x11, 0x22, 0x33],                                  // short (>2 so CRC uses full path)
    Array.from({ length: 16 }, (_, i) => (i * 37 + 5) & 0xff), // longer, multi-block
  ];
  for (const sf of [7, 9]) {
    for (const cr of [1, 2, 3, 4]) {
      for (const crc of [false, true]) {
        for (const hasHeader of [false, true]) {
          for (const payload of payloads) {
            const label = `SF${sf} CR4/${cr + 4} crc=${crc} hdr=${hasHeader} len=${payload.length}`;
            const symbols = loraEncode(payload, { sf, cr, crc, hasHeader });
            for (const s of symbols) assert(s >= 0 && s < (1 << sf), `symbol out of range: ${label}`);
            const out = loraDecode(symbols, { sf, cr, crc, hasHeader, len: payload.length });
            assertEquals(out.bytes, payload, `payload mismatch: ${label}`);
            if (crc) assert(out.crcOk === true, `crc failed: ${label}`);
            if (hasHeader) {
              assert(out.header.checksumOk, `header checksum bad: ${label}`);
              assertEquals(out.header.payloadLen, payload.length, `header len: ${label}`);
              assertEquals(out.header.cr, cr, `header cr: ${label}`);
              assertEquals(out.header.crc, crc ? 1 : 0, `header crc flag: ${label}`);
            }
          }
        }
      }
    }
  }
});

Deno.test("LoRa PHY codec: header carries cr/crc/len so decode needs no side channel", () => {
  const payload = [0xde, 0xad, 0xbe, 0xef, 0x42];
  const symbols = loraEncode(payload, { sf: 9, cr: 3, crc: true, hasHeader: true });
  // decode WITHOUT telling it cr/crc/len — must be read from the header block
  const out = loraDecode(symbols, { sf: 9, hasHeader: true });
  assertEquals(out.bytes, payload);
  assert(out.crcOk === true);
  assertEquals(out.header.cr, 3);
  assertEquals(out.header.crc, 1);
  assertEquals(out.header.payloadLen, 5);
});

// --- Full-packet synthesizer (TEST-ONLY, not shipped) -----------------------
// Build a complex-baseband LoRa frame at Fs = BW (N = 2^SF samples/symbol):
//   8 preamble up-chirps | 2 sync-word up-chirps | 2.25 down-chirp SFD | payload up-chirps.
// A global carrier-frequency offset of `cfoBins` bins is applied as exp(+j2π·cfoBins·n/N)
// across the WHOLE packet (so it shifts up-chirp and down-chirp bins in OPPOSITE senses — the
// physics the up/down argmax trick exploits). A sample-timing offset of `stoSamples` is a
// leading integer shift (pre-roll of the periodic preamble up-chirp). Deterministic complex
// Gaussian noise (Box-Muller over an LCG — no Math.random) is added when noise>0.
const SYNTH_SYNC = [8, 16];
function synthLoraSignal(payload, { sf, cr = 1, crc = false, hasHeader = true, cfoBins = 0, stoSamples = 0, noise = 0 } = {}) {
  const N = 1 << sf;
  const parts = [];
  for (let i = 0; i < 8; i++) parts.push(makeUpSymbol(N, 0));            // preamble
  parts.push(makeUpSymbol(N, SYNTH_SYNC[0] % N));                       // sync word 1
  parts.push(makeUpSymbol(N, SYNTH_SYNC[1] % N));                       // sync word 2
  parts.push(refDownchirp(N)); parts.push(refDownchirp(N));             // 2 full SFD down-chirps
  const dq = refDownchirp(N);
  parts.push({ re: dq.re.subarray(0, N >> 2), im: dq.im.subarray(0, N >> 2) }); // + quarter
  const symbols = loraEncode(payload, { sf, cr, crc, hasHeader });
  for (const s of symbols) parts.push(makeUpSymbol(N, s % N));          // payload up-chirps
  // concat
  let L = 0; for (const q of parts) L += q.re.length;
  const bre = new Float32Array(L), bim = new Float32Array(L);
  let off = 0; for (const q of parts) { bre.set(q.re, off); bim.set(q.im, off); off += q.re.length; }
  // integer STO: prepend `pre` samples of the cyclic preamble up-chirp (keeps preamble periodic)
  const pre = Math.max(0, stoSamples | 0), up = makeUpSymbol(N, 0);
  const re = new Float32Array(pre + L), im = new Float32Array(pre + L);
  for (let i = 0; i < pre; i++) { const idx = ((i - pre) % N + N) % N; re[i] = up.re[idx]; im[i] = up.im[idx]; }
  re.set(bre, pre); im.set(bim, pre);
  // global CFO: exp(+j2π·cfoBins·n/N), n = global sample index (so pre-roll stays phase-continuous)
  for (let i = 0; i < re.length; i++) {
    const gn = i - pre, ph = 2 * Math.PI * cfoBins * gn / N, c = Math.cos(ph), s = Math.sin(ph);
    const a = re[i], b = im[i]; re[i] = a * c - b * s; im[i] = a * s + b * c;
  }
  // deterministic complex Gaussian noise
  if (noise > 0) {
    let seed = 0x2545f491 ^ (sf << 8) ^ payload.length;
    const u = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed + 1) / 0x80000000; };
    for (let i = 0; i < re.length; i++) {
      const g = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
      const h = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
      re[i] += noise * g; im[i] += noise * h;
    }
  }
  return { re, im, symbols, N };
}

Deno.test("LoRa frame sync: synthetic full-packet round-trip recovers payload+CRC under CFO/STO", () => {
  const payloads = [
    [0x48, 0x65, 0x6c, 0x6c, 0x6f],                             // "Hello"
    Array.from({ length: 11 }, (_, i) => (i * 29 + 7) & 0xff),  // longer, multi-block
  ];
  for (const sf of [7, 9]) {
    for (const cr of [1, 4]) {
      for (const payload of payloads) {
        // (cfoBins, stoSamples) sweep: prove the pipeline clean (0,0) THEN with integer offsets.
        for (const [cfoBins, stoSamples] of [[0, 0], [3, 0], [0, 5], [3, 7], [-2, 3]]) {
          const label = `SF${sf} CR4/${cr + 4} len=${payload.length} cfo=${cfoBins} sto=${stoSamples}`;
          const sig = synthLoraSignal(payload, { sf, cr, crc: true, hasHeader: true, cfoBins, stoSamples });
          const out = decodeLoraSignal(sig.re, sig.im, { sf });
          assert(out.found, `preamble not found: ${label}`);
          assertEquals(out.cfo, cfoBins, `CFO mismatch: ${label}`);
          assertEquals(out.sto, stoSamples, `STO mismatch: ${label}`);
          assertEquals(out.bytes, payload, `payload mismatch: ${label}`);
          assert(out.crcOk === true, `CRC failed: ${label}`);
          assert(out.header.checksumOk, `header checksum bad: ${label}`);
          assertEquals(out.header.cr, cr, `header cr: ${label}`);
        }
      }
    }
  }
});

Deno.test("LoRa frame sync: recovers payload under CFO+STO+noise", () => {
  const payload = [0x4d, 0x65, 0x73, 0x68]; // "Mesh"
  const sig = synthLoraSignal(payload, { sf: 7, cr: 1, crc: true, hasHeader: true, cfoBins: 3, stoSamples: 4, noise: 0.05 });
  const out = decodeLoraSignal(sig.re, sig.im, { sf: 7 });
  assert(out.found, "preamble not found under noise");
  assertEquals(out.bytes, payload, "payload mismatch under noise");
  assert(out.crcOk === true, "CRC failed under noise");
});

Deno.test("LoRa frame sync: no preamble → found:false", () => {
  const sf = 7, N = 1 << sf;
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const re = new Float32Array(30 * N), im = new Float32Array(30 * N);
  for (let i = 0; i < re.length; i++) { re[i] = rnd(); im[i] = rnd(); }
  assert(!decodeLoraSignal(re, im, { sf }).found, "noise falsely synced");
});

// ---- sigil: deterministic kamea geometry from an intent ----
Deno.test("sigil: every planetary kamea is magic (rows=cols=diagonals)", () => {
  for (const p of PLANETS) {
    const sq = squareFor(p.order);
    assertEquals(sq.length, p.order, `order ${p.order} wrong size`);
    assert(isMagic(sq), `kamea order ${p.order} (${p.key}) is not magic`);
    // spot-check the constant
    const want = magicConstant(p.order);
    assertEquals(sq[0].reduce((a, b) => a + b, 0), want, `row sum ${p.order}`);
  }
});

Deno.test("sigil: Agrippa Sun kamea (order 6) constant is 111", () => {
  assertEquals(magicConstant(6), 111);
  assert(isMagic(squareFor(6)));
});

Deno.test("sigil: distill strikes vowels + repeated consonants (Spare)", () => {
  // "I AM CALM AND FOCUSED" → consonants first-seen: M C L N D F S
  assertEquals(distill("I AM CALM AND FOCUSED"), ["M", "C", "L", "N", "D", "F", "S"]);
  // all-vowel intent falls back to unique letters, never empty
  assert(distill("AEIOU").length >= 1);
  // punctuation/digits ignored; a single-consonant intent falls back to unique letters (never < 2 points)
  assertEquals(distill("go!! 42 go").join(""), "GO");
});

Deno.test("sigil: Ukrainian intent distills without throwing", () => {
  const out = distill("Я СПОКІЙНА І СИЛЬНА");
  assert(out.length >= 2, "uk intent produced too few letters");
  assert(out.every((c) => typeof c === "string" && c.length === 1));
});

Deno.test("sigil: sigilPath is deterministic and well-formed", () => {
  const a = sigilPath("I am calm and focused");
  const b = sigilPath("I am calm and focused");
  assertEquals(a.planet, b.planet);
  assertEquals(a.points.length, b.points.length);
  assertEquals(a.points[0], b.points[0]);
  assertEquals(a.points.at(-1), b.points.at(-1));
  // planet order matches the square used
  assertEquals(a.nodes.length, a.order * a.order);
  // every point sits inside the centred box
  for (const p of a.points) { assert(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, "point out of box"); }
  assert(a.points.length >= 2, "need at least two points");
});

Deno.test("sigil: empty / letter-less intent → null", () => {
  assertEquals(sigilPath(""), null);
  assertEquals(sigilPath("   42 !! "), null);
});

Deno.test("sigil: different intents diverge (planet or path)", () => {
  const a = sigilPath("courage");
  const b = sigilPath("serenity");
  const diff = a.planet !== b.planet ||
    a.points.length !== b.points.length ||
    JSON.stringify(a.points) !== JSON.stringify(b.points);
  assert(diff, "two unrelated intents produced an identical sigil");
});

Deno.test("sigil: hash32 stable, smooth expands a short path", () => {
  assertEquals(hash32("abc"), hash32("abc"));
  assert(hash32("abc") !== hash32("abd"));
  const pts = [{ x: -0.5, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0 }];
  assert(smooth(pts, 10).length > pts.length, "smooth should add samples");
});

// ---- pwned: k-anonymity breach check ----
Deno.test("pwned: SHA-1 matches known vectors", async () => {
  assertEquals(await sha1hex(""), "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709");
  assertEquals(await sha1hex("secret123"), "F2B14F68EB995FACB3A1C35287B778D5BD785511");
});

Deno.test("pwned: splitHash → 5-char prefix + 35-char suffix", () => {
  const { prefix, suffix } = splitHash("F2B14F68EB995FACB3A1C35287B778D5BD785511");
  assertEquals(prefix, "F2B14");
  assertEquals(suffix, "F68EB995FACB3A1C35287B778D5BD785511");
  assertEquals(prefix.length, 5);
  assertEquals(suffix.length, 35);
});

Deno.test("pwned: parseRange + lookup (case-insensitive, tolerant)", () => {
  const text = "AAAA:5\r\nF68EB995FACB3A1C35287B778D5BD785511:42\n\nBBBB:0";
  assertEquals(lookup("F68EB995FACB3A1C35287B778D5BD785511", text), 42);
  assertEquals(lookup("f68eb995facb3a1c35287b778d5bd785511", text), 42);   // case-insensitive
  assertEquals(lookup("DEADBEEF", text), 0);                               // absent → 0
  assertEquals(parseRange(text).size, 3);
});

Deno.test("pwned: checkPassword — breached and clean, only the prefix is queried", async () => {
  let asked = null;
  const range = "F68EB995FACB3A1C35287B778D5BD785511:2400000\nAAAA:1";
  const hit = await checkPassword("secret123", (p) => { asked = p; return Promise.resolve(range); });
  assertEquals(asked, "F2B14", "must query ONLY the 5-char prefix");
  assertEquals(hit.pwned, true);
  assertEquals(hit.count, 2400000);
  assertEquals(hit.hex, "F2B14F68EB995FACB3A1C35287B778D5BD785511");

  const clean = await checkPassword("secret123", () => Promise.resolve("AAAA:1\nBBBB:2"));
  assertEquals(clean.pwned, false);
  assertEquals(clean.count, 0);
});

Deno.test("aspects: exact trine, square and opposition are detected with zero orb", () => {
  const found = aspects([
    { key: "mars", lon: 10 },
    { key: "jupiter", lon: 130 },   // 120° from Mars → trine
    { key: "saturn", lon: 100 },    // 90° from Mars → square
    { key: "venus", lon: 190 },     // 180° from Mars → opposition
  ]);
  const of = (a, b) => found.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  assertEquals(of("mars", "jupiter").type, "trine");
  assertEquals(of("mars", "saturn").type, "square");
  assertEquals(of("mars", "venus").type, "opposition");
  assertEquals(of("mars", "jupiter").orb, 0);
});

Deno.test("aspects: separations beyond the orb do not aspect", () => {
  // 45° apart is between sextile(60,±4) and square(90,±6) → no aspect
  const found = aspects([{ key: "mars", lon: 0 }, { key: "venus", lon: 45 }]);
  assertEquals(found.length, 0);
});

Deno.test("aspects: luminaries get the +2° orb bonus", () => {
  // Sun–Saturn 7° from a square (97° apart): base square orb 6 would MISS, luminary orb 8 CATCHES it.
  const withSun = aspects([{ key: "sun", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(withSun.length, 1);
  assertEquals(withSun[0].type, "square");
  // same 97° between two non-luminaries → outside the 6° orb → no aspect
  const noSun = aspects([{ key: "mars", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(noSun.length, 0);
});

Deno.test("aspects: sorted tightest orb first", () => {
  const found = aspects([
    { key: "sun", lon: 0 },
    { key: "mars", lon: 122 },   // trine, orb 2
    { key: "venus", lon: 119 },  // trine, orb 1 (tighter)
  ]);
  assert(found.length >= 2);
  assert(found[0].orb <= found[1].orb);
});

Deno.test("aspects: applying vs separating from the previous-day chart", () => {
  // Moon at 118° closing on a 120° trine to a fixed Sun at 0° → orb 2 now, was 3 → applying.
  const prev = { sun: 0, moon: 117 };
  const now = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 118 }], prev);
  assertEquals(now[0].type, "trine");
  assertEquals(now[0].applying, true);
  // Moon past exact and pulling away (122° now, 121° before) → separating.
  const sep = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 122 }], { sun: 0, moon: 121 });
  assertEquals(sep[0].applying, false);
});

Deno.test("aspects: applying is null without a previous-day chart", () => {
  const found = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 120 }]);
  assertEquals(found[0].applying, null);
});

Deno.test("ASPECTS: five Ptolemaic aspects with disjoint orb bands", () => {
  assertEquals(ASPECTS.map((a) => a.type), ["conjunction", "sextile", "square", "trine", "opposition"]);
  // no two aspect windows overlap even with the widest (+2 luminary) orbs → a pair matches at most one
  const wins = ASPECTS.map((a) => [a.angle - (a.orb + 2), a.angle + (a.orb + 2)]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < wins.length; i++) assert(wins[i][0] > wins[i - 1][1], "aspect orb bands overlap");
});
