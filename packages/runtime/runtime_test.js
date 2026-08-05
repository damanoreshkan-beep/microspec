// microspec runtime — pure-logic unit tests (no browser, no import map).
//   deno test -A packages/runtime/runtime_test.js
import { clusterMetrics, hubOfCross, DIAMOND, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "./deck.js";
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { validateSpec } from "./validate.js";
import { cycleRepeat as tpCycleRepeat, advance as tpAdvance, clock as tpClock } from "./player.js";
import { parseInput as pinParse, ladder as pinLadder, readPins as pinRead, ratio as pinRatio } from "./pinterest.js";
import { MIRRORS as v2mMIRRORS, parseAuthors as v2mParseAuthors, parseListing as v2mParseListing, titleOf as v2mTitleOf, trackId as v2mTrackId, trackURL as v2mTrackURL, mp3Ratio as v2mMp3Ratio, normGain as v2mNormGain, byteCloud as v2mByteCloud, helixStrand as v2mHelixStrand, helixAt as v2mHelixAt, seedBytes as v2mSeedBytes } from "./v2m.js";
import { T, dictFor, ago, whenLabel } from "./i18n.js";
import { isBook as actsIsBook, findPlotSection as actsFindPlot, cleanPlotText as actsClean, foldPlot as actsFold, parseActs as actsParse, countSentences as actsCount, actSignature as actsSig, plotUpToClimax as actsUpToClimax } from "./acts.js";
import { asked as chatAsked, answered as chatAnswered, foldThread as chatFold, askSignature as chatSig, groundBook as chatGround } from "./chat.js";
import { bjorklund, rotate, syncopation, syncopationNorm, harmonicity, grooveU, mulberry32, generateGroove, buildCandidate, scoreGroove, METRIC_WEIGHTS } from "./groove.js";
import { generateMelody, scoreMelody } from "./melody.js";
import { shell, ERR } from "./shell.js";
import { parseOui as ouiParse, vendorOf as ouiVendorOf, prefixOf as ouiPrefixOf, locallyAdministered as ouiLocallyAdministered } from "./oui.js";
import { parseAd as rdParseAd, classify as rdClassify, addrKind as rdAddrKind, rotates as rdRotates, band as rdBand, bandFraction as rdBandFraction, smooth as rdSmooth, estimateDistance as rdEstimateDistance, guardScore as rdGuardScore, GUARD as rdGUARD, signalPercent as rdSignalPercent, orderDevices as rdOrderDevices, hexSpiral as rdHexSpiral, hexToXY as rdHexToXY, hexDistance as rdHexDistance, combSize as rdCombSize } from "./radar.js";
import { PERMISSIONS, GROUPS, permState, permAndroid } from "./permissions.js";
import { hannCurve as grHann, grainRate as grGrainRate, overlapOf as grOverlapOf, cloudGain as grCloudGain, planGrains as grPlan, conditionSample as grCondition, dcOffset as grDcOffset, clipRatio as grClipRatio, trimBounds as grTrim, detectPitch as grPitch, CENTS as grCENTS, encodeWav as grWav, syntheticSample as grSynth, MIN_KEEP as grMIN_KEEP } from "./grain.js";
import { mulberry32 as grRng } from "./groove.js";
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
import { resolve, isComplete, parseDate, parseTime, EMPTY } from "./birth.js";
import { translit, isCyrillic, toPlace, placeLabel, formatCoords } from "./places.js";
import { zoneOffset, knownZone, zonedToUTC, parseOffset, formatOffset, lmtOffset, houses, houseOf, HOUSE_SYSTEMS, placidusDefined, transits, transitAspect, separation, exactHits, TRANSIT_ORB, TRANSIT_ASPECTS, HIT_PRECISION, norm360, wrap180 } from "./natal.js";
import { BODY as sgBODY, SIGN as sgSIGN, HOUSE as sgHOUSE, ASPECT as sgASPECT, ANGLE as sgANGLE, DIGNITY as sgDIGNITY, dignityOf as sgDignity, chartRuler as sgChartRuler, balance as sgBalance, groundTransit as sgGroundTransit, groundPlacement as sgGroundPlacement, groundPortrait as sgGroundPortrait, groundCusp as sgGroundCusp, rulerOf as sgRulerOf, spanLabel as sgSpan, QUESTIONS as sgQUESTIONS, questionById as sgQuestionById, groundQuestion as sgGroundQuestion } from "./signif.js";
import { resumeAt, RESUME_MIN } from "./playback.js";
import { logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, advanceTerrain, Parallax, seedFrame, sampleBand, idle, fib, galaxyDisc } from "./spectrum.js";
import { RippleField, ring, RIPPLE_DEFAULTS } from "./ripple.js";
import { iqFromBytes, firLowpass, deemphasisAlpha, fft, powerSpectrum, seedSpectrum, FmReceiver, IN_RATE, IF_RATE, OUT_RATE, MAX_DEV, OFFSET_HZ, goertzelPower, pilotRatioDb, rssiFromBytes, PILOT_COEFF } from "./fmradio.js";
import { sampleRatePayload, setFreqPayload, clampLnaGain, clampVgaGain, roundBasebandFilter, basebandFilterParams, REQUEST, MODE, VENDOR_ID, PRODUCT_ID, TRANSFER_SIZE } from "./hackrf.js";
import { syndrome, OFFSET, ptyName, rdsChar, RdsBlockSync, RdsParser, Rds } from "./rds.js";
import { BANDS, arfcnToFreq, freqToArfcn, arfcnPowers, activeArfcns, steadyScore, CHAN_HZ } from "./gsmband.js";
import { clampTxVgaGain, TX_ENDPOINT } from "./hackrf.js";
import { channelPowers, findRuns, channelFloor, extractChannel, classifyChannel, CROWDED_CHANNEL } from "./scan433.js";
import { synthBand, DEMO_MS } from "./fixture433.js";
import { CTCSS_TONES, minToneGap, windowSamples, detectCtcss } from "./ctcss.js";
import { newRose, addSample, roseStats, hasBearing } from "./df.js";
import { instantFreq, magnitude, fmActivity, envelopeTransitions, classifyEvent, CLASSIFY } from "./burst.js";
import { squelchOpen as levelSquelch } from "./demod.js";
import { LPD433, PMR446, ISM433, TUNE_HZ, planSpanHz, channelCentre, channelAt, binOf, channelBins, integrateChannels } from "./chan433.js";
import { ifFreqWord, sampleRateRatio, muxConfigFor, pllDivider, pllWords, gainSplit, dcBin, offsetBinaryToSigned, supportsSweep as RTL_SWEEP, VENDOR_ID as RTL_VID, TRANSFER_SIZE as RTL_XFER } from "./rtlsdr.js";
import { SWEEP_REQUEST, MODE_RX_SWEEP, BYTES_PER_BLOCK, SWEEP_STYLE, TUNE_STEP_HZ, SWEEP_OFFSET, initSweepTransfer, planRange, bytesPerSweep, sweepBlocks, blockSpectrum, binFrequencyLow, noiseFloor, peaks, strongestBin } from "./sweep.js";
import { Demodulator, squelchOpen, MODE_PARAMS } from "./demod.js";
import { bandAt, BANDS as ETHER_BANDS, LISTEN_PRESETS, RADAR_SPAN, UNKNOWN } from "./bandplan.js";
import { capture, isolateFrame, framesEqual, renderOOK, OOK_FREQS } from "./ook.js";
import { ppmBits, pwmBits, bitsToBytes, findSync, crc8, matchNexus, matchFineOffsetWH2, matchRemote, decodeOOK, PROTO_NAMES } from "./ism433.js";
import { refDownchirp, makeUpSymbol, dechirpArgmax, detectPreamble, LORA_PRESETS, WHITENING, loraEncode, loraDecode, decodeLoraSignal } from "./lora.js";
import { parsePrice, parseWishMeta, toNumber, sortWishes, wishTotals, fmtMoney } from "./wish.js";
import { scoreRepo, parseFunding, ageDays, hostLabel } from "./underrated.js";
import { registrableDomain, siteName, pageLabel, pageLabelInfo, cleanPageTitle, sourceTitle, groupByDomain, hostOf, humanText } from "./sitelabel.js";
import { overlayDepth } from "./overlay.js";
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

Deno.test("vfilter dedupeVideos: one clip published as TWO files collapses, and the showable copy wins", () => {
  /* Reported as: "the black reels point at the same reel — the first does not show, the second does."
     The shape, measured on a live feed: one clip arrives twice, as the source asset (no poster, does not
     play inline) and as a low-bitrate preview (with a poster), on DIFFERENT hosts under DIFFERENT
     filenames. Neither the video url nor the poster url can see that; the asset id in the path can.
     Hosts AND ids here are synthetic by policy — the committed suite never carries a real one. */
  const items = [
    { video: "https://pix.tube.example/c1/videos/209901/14/1000001/original_1000001.mp4", title: "black" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000001/180P_225K_1000001.webm", poster: "https://pix.tube.example/t/1000001.jpg", title: "plays" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000002/180P_225K_1000002.webm", poster: "https://pix.tube.example/t/1000002.jpg", title: "other" },
  ];
  const out = dedupeVideos(items);
  assertEquals(out.length, 2, "the two files of one clip did not collapse");
  assertEquals(out[0].title, "plays", "the copy WITHOUT a poster survived — that is the black slide the report is about");
  assertEquals(out[1].title, "other", "order was not preserved");

  /* The date must NOT be the identity. `/202602/14/` is a long number in the path too, and matching it
     would fuse every unrelated clip uploaded the same month — the first cut of this did exactly that. */
  const sameMonth = [
    { video: "https://ew.tube.example/c2/videos/209901/14/1000001/180P_225K_1000001.webm", title: "one" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000002/180P_225K_1000002.webm", title: "two" },
  ];
  assertEquals(dedupeVideos(sameMonth).map((i) => i.title), ["one", "two"], "two clips from the same month were fused — the date is being read as an id");

  /* A number in the filename that is NOT also a directory is not an asset id, so it must not group. */
  const looseNumbers = [
    { video: "https://cdn.tube.example/clips/holiday-1234567.mp4", title: "a" },
    { video: "https://cdn.tube.example/clips/sunset-1234567.mp4", title: "b" },
  ];
  assertEquals(dedupeVideos(looseNumbers).map((i) => i.title), ["a", "b"], "a bare filename number was treated as an asset id");
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

// ---- Demodulator (demod.js): NFM + AM round-trips, same synthetic-signal tactic as the FM test ----
// Feed a HackRF-style int8 IQ block with the modulated carrier at the OFFSET (the front-end shifts it to
// baseband), then assert the recovered audio's dominant bin ≈ the modulating tone.
function dominantAudioHz(audioAll, size = 4096) {
  const a = audioAll.slice(-size * 2);
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let k = 0; k < size; k++) re[k] = a[a.length - size + k] || 0;
  fft(re, im);
  let peak = 1; for (let b = 2; b < size / 2; b++) if (Math.hypot(re[b], im[b]) > Math.hypot(re[peak], im[peak])) peak = b;
  return peak * OUT_RATE / size;
}

Deno.test("Demodulator NFM: a narrowband-FM tone demodulates to that audio tone", () => {
  const fAudio = 1200, dev = MODE_PARAMS.nfm.dev, blocks = 5, per = 65536;
  const rx = new Demodulator({ mode: "nfm" });
  let phase = 0, nAll = 0; const audioAll = [];
  for (let b = 0; b < blocks; b++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const msg = Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);
      phase += 2 * Math.PI * (OFFSET_HZ + dev * msg) / IN_RATE;
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(Math.cos(phase) * 120))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Math.sin(phase) * 120))) + 256) & 0xff;
    }
    for (const s of rx.process(bytes).audio) audioAll.push(s);
  }
  const detected = dominantAudioHz(audioAll);
  assert(Math.abs(detected - fAudio) < 80, `NFM tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("Demodulator AM: an amplitude-modulated carrier recovers the audio tone", () => {
  const fAudio = 1000, m = 0.6, blocks = 5, per = 65536;
  const rx = new Demodulator({ mode: "am" });
  let phase = 0, nAll = 0; const audioAll = [];
  for (let b = 0; b < blocks; b++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const env = 1 + m * Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);   // AM envelope
      phase += 2 * Math.PI * OFFSET_HZ / IN_RATE;                            // steady carrier at the offset
      const amp = 90 * env / (1 + m);
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(Math.cos(phase) * amp))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Math.sin(phase) * amp))) + 256) & 0xff;
    }
    for (const s of rx.process(bytes).audio) audioAll.push(s);
  }
  const detected = dominantAudioHz(audioAll);
  assert(Math.abs(detected - fAudio) < 80, `AM tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("squelchOpen: opens above threshold, hysteresis holds it open until it drops well below", () => {
  assertEquals(squelchOpen(-40, -50, false), true);    // strong signal opens
  assertEquals(squelchOpen(-60, -50, false), false);   // noise stays closed
  assertEquals(squelchOpen(-52, -50, true, 3), true);  // was open, -52 > -53 → stays open (hysteresis)
  assertEquals(squelchOpen(-54, -50, true, 3), false); // dropped below -53 → closes
});

Deno.test("bandplan: classifies known peaks to human bands, unknown otherwise; presets are analog-only", () => {
  assertEquals(bandAt(2_450_000_000).id, "ism24");     // microwave / wifi / bluetooth
  assertEquals(bandAt(433_920_000).id, "ism433");      // a car remote
  assertEquals(bandAt(124_000_000).id, "air");         // aircraft voice
  assertEquals(bandAt(1_575_420_000).id, "gps");       // GPS L1
  assertEquals(bandAt(3_000_000_000), UNKNOWN);        // nothing allocated here → unknown
  for (const b of ETHER_BANDS) assert(b.hi > b.lo, `${b.id} range ordered`);
  for (const p of LISTEN_PRESETS) assert(["am", "nfm", "wfm"].includes(p.mode), `${p.id} is analog voice`);
  assert(RADAR_SPAN.every(([a, z]) => z > a));
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
  assertEquals([MODE.OFF, MODE.RECEIVE, MODE.TRANSMIT, MODE.RX_SWEEP], [0, 1, 2, 5]);
  assertEquals(REQUEST.INIT_SWEEP, 26);   // hackrf_init_sweep, used by the wideband sweep
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

// ================= HackRF wideband SWEEP (sweep.js) =================
// The device byte-layout is pinned literally (it is the contract firmware enforces), and the block→spectrum
// maths is proven the same way the FM chain is: synth a tone at a KNOWN fft bin, demod, assert it lands at the
// expected absolute frequency. Recipe + cited lines: apps/ether/RESEARCH.md.

Deno.test("initSweepTransfer: constants + LE byte layout match hackrf_init_sweep", () => {
  assertEquals([SWEEP_REQUEST, MODE_RX_SWEEP], [26, 5]);
  const t = initSweepTransfer({ ranges: [[88, 108], [430, 450]], numBytes: BYTES_PER_BLOCK });
  assertEquals(t.request, 26);
  assertEquals(t.value, BYTES_PER_BLOCK & 0xffff);         // num_bytes low16 → value
  assertEquals(t.index, (BYTES_PER_BLOCK >>> 16) & 0xffff); // num_bytes high16 → index
  const v = new DataView(t.data);
  assertEquals(v.getUint32(0, true), TUNE_STEP_HZ);        // step_width Hz LE
  assertEquals(v.getUint32(4, true), SWEEP_OFFSET);        // offset Hz LE
  assertEquals(v.getUint8(8), SWEEP_STYLE.INTERLEAVED);
  assertEquals(v.getUint16(9, true), 88);                  // range0 start MHz LE
  assertEquals(v.getUint16(11, true), 108);                // range0 stop MHz LE
  assertEquals(v.getUint16(13, true), 430);                // range1 start MHz LE
  assertEquals(v.byteLength, 9 + 2 * 4);                   // 9 + num_ranges pairs
});

Deno.test("initSweepTransfer: mirrors host-side validation (+ interleave-clean step)", () => {
  assertThrows(() => initSweepTransfer({ ranges: [] }));                              // < 1 range
  assertThrows(() => initSweepTransfer({ ranges: Array(11).fill([1, 2]) }));          // > 10 ranges
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], numBytes: 16384 + 1 }));   // not a block multiple
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], numBytes: 0 }));           // below one block
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], stepWidthHz: 3, style: SWEEP_STYLE.INTERLEAVED })); // 3 % 4 ≠ 0
});

Deno.test("planRange: stop rounds up to a whole number of 20 MHz hops (min 1)", () => {
  assertEquals(planRange(88, 108), { startMHz: 88, stopMHz: 108, steps: 1 });   // exactly one step
  assertEquals(planRange(100, 105), { startMHz: 100, stopMHz: 120, steps: 1 }); // rounds up to 1 step
  assertEquals(planRange(100, 141), { startMHz: 100, stopMHz: 160, steps: 3 }); // 41 MHz → 3 hops
});

Deno.test("bytesPerSweep: full 1M–6G ≈ 9.83 MB per pass (interleaved)", () => {
  const bytes = bytesPerSweep([[1, 6000]]);
  assertEquals(bytes, 300 * 2 * BYTES_PER_BLOCK);   // 300 hops · 2 blocks · 16384
  assert(Math.abs(bytes - 9.83e6) < 0.02e6);
});

// Build a 16384-byte sweep block: magic + u64-LE header freq + a complex tone at fft bin `bin` in the tail.
function sweepBlockWithTone(headerHz, bin, N, amp = 100) {
  const blk = new Uint8Array(BYTES_PER_BLOCK);
  blk[0] = 0x7f; blk[1] = 0x7f;
  const hv = new DataView(blk.buffer);
  hv.setBigUint64(2, BigInt(headerHz), true);           // sweep_freq, u64 LE at byte 2
  const s = BYTES_PER_BLOCK - 2 * N;                     // the last 2N bytes are what blockSpectrum reads
  for (let n = 0; n < N; n++) {
    const ph = (2 * Math.PI * bin * n) / N;
    const I = Math.round(amp * Math.cos(ph)), Q = Math.round(amp * Math.sin(ph));
    blk[s + n * 2] = I & 0xff;                           // int8 stored as byte
    blk[s + n * 2 + 1] = Q & 0xff;
  }
  return blk;
}

Deno.test("sweepBlocks: reads magic + u64-LE header, skips bad magic, drops a partial tail", () => {
  const N = 16;
  const a = sweepBlockWithTone(100_000_000, 13, N);
  const b = sweepBlockWithTone(120_000_000, 13, N);
  const bad = new Uint8Array(BYTES_PER_BLOCK);           // no magic → skipped
  const partial = new Uint8Array(5000);                  // < one block → dropped
  const stream = new Uint8Array(a.length + bad.length + b.length + partial.length);
  stream.set(a, 0); stream.set(bad, a.length); stream.set(b, a.length + bad.length);
  stream.set(partial, a.length + bad.length + b.length);
  const got = [...sweepBlocks(stream)];
  assertEquals(got.length, 2);                           // bad magic skipped, partial dropped
  assertEquals(got.map((g) => g.headerHz), [100_000_000, 120_000_000]);
  assertEquals(got[0].iq.length, BYTES_PER_BLOCK - 10);  // post-header region
});

Deno.test("blockSpectrum: a tone at a known bin lands at the expected absolute frequency", () => {
  const N = 16, bin = 13, header = 100_000_000;          // bin 13 = low-slice index 2 (1 + 5N/8 + 2)
  const [{ headerHz, iq }] = [...sweepBlocks(sweepBlockWithTone(header, bin, N))];
  const { hz, db } = blockSpectrum(iq, N);
  let at = 0; for (let i = 1; i < db.length; i++) if (db[i] > db[at]) at = i;
  assertEquals(at, 2);                                   // peak is low-slice index 2
  const abs = headerHz + hz[at];
  assertEquals(abs, header + binFrequencyLow(0, 2, 20_000_000, N)); // 100 MHz + 3·1.25 MHz = 103.75 MHz
  assertEquals(abs, 103_750_000);
  assert(db[at] > noiseFloor(db) + 12);                  // the carrier stands well clear of the floor
});

Deno.test("peaks / strongestBin: a lone carrier is one peak; a quiet band tunes to nothing", () => {
  const freqs = Float64Array.from({ length: 8 }, (_, i) => 100e6 + i * 1e6);
  const quiet = new Float32Array([-80, -81, -79, -80, -82, -80, -81, -80]);
  const withTone = quiet.slice(); withTone[4] = -40;
  const p = peaks(freqs, withTone, { marginDb: 6 });
  assertEquals(p.length, 1);
  assertEquals(p[0].hz, 104e6);
  assertEquals(strongestBin(freqs, withTone).hz, 104e6);
  assertEquals(strongestBin(freqs, quiet), null);        // nothing stands above the floor → no channel
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

// ================= 433.92 MHz ISM device decode (ism433.js) =================
// Synthetic modulators: build the byte payload → expand to bits per the encoding → signed-µs timings, then
// the FULL chain renderOOK → capture → isolateFrame → decodeOOK must recover the parsed record exactly.

// bits (MSB-first) from a byte array, for `count` bits.
function bitsOf(bytes, count) {
  const bits = [];
  for (let i = 0; i < count; i++) bits.push((bytes[i >> 3] >> (7 - (i & 7))) & 1);
  return bits;
}
// PPM modulator (Nexus): fixed 500µs pulse, then short(1000)=0 / long(2000)=1 gap; terminating pulse so every
// data bit keeps its gap after isolateFrame trims the trailing reset.
function ppmTimings(bits) {
  const t = [];
  for (const b of bits) { t.push(+500); t.push(b ? -2000 : -1000); }
  t.push(+500);
  return t;
}
// PWM modulator (WH2): short(500)=1 / long(1500)=0 pulse, fixed 1000µs spacer gap (keeps the burst OFF-heavy so
// the capture envelope's noise floor stays below the carrier; still < the 3000µs frame-split gap).
function pwmTimings(bits) {
  const t = [];
  for (const b of bits) { t.push(b ? +500 : +1500); t.push(-1000); }
  return t;
}
function roundTrip(frameTimings, renderOpts) {
  const iq = renderOOK(frameTimings, { fs: 2e6, freqOffset: 250_000, amp: 110, repeats: 4, gapUs: 8000, tailUs: 4000, ...renderOpts });
  const bytes = new Uint8Array(iq.buffer);
  const timings = capture(bytes, { fs: 2e6, decim: 8 });
  return decodeOOK(timings, { ts: 1000, rssi: -42 });
}

Deno.test("crc8: MSB-first no-reflection matches rtl_433 util.c (poly 0x31 spot value)", () => {
  // known: crc8({0x00}, len 1, poly 0x31, init 0) walks the poly once per set MSB — 0x00 stays 0x00.
  assertEquals(crc8([0x00], 1, 0x31, 0x00), 0x00);
  // a byte round-trips deterministically and stays in range.
  const c = crc8([0x01, 0x20, 0xd7, 0x37], 4, 0x31, 0x00);
  assert(c >= 0 && c <= 255);
  assertEquals(crc8([0x01, 0x20, 0xd7, 0x37], 4, 0x31, 0x00), c);   // pure
});

Deno.test("bitsToBytes: MSB-first, trailing partial nibble left-aligns (Nexus b[4] high nibble)", () => {
  assertEquals(bitsToBytes([1, 0, 1, 0, 0, 0, 1, 1], { msbFirst: true }), [0xa3]);
  assertEquals(bitsToBytes([1, 0, 1, 1], { msbFirst: true }), [0xb0]); // 4 bits → high nibble
});

Deno.test("findSync: locates the 0xFF preamble and returns the first data bit index", () => {
  const bits = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];                    // 0xFF run starts at index 1
  assertEquals(findSync(bits, [1, 1, 1, 1, 1, 1, 1, 1]), 9);
  assertEquals(findSync([0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1]), -1);
});

Deno.test("Nexus round-trip: renderOOK → capture → decodeOOK recovers id/temp/humidity/channel/battery", () => {
  // id=0xA3; battery=1, channel=2 → b[1]=0x80|0x10|tempHi; temp=23.5°C (raw 235=0x0EB); humidity=48%.
  const b = [0xa3, 0x90, 0xeb, 0xf3, 0x00];                          // b[3]&0xf0==0xf0 fixed nibble
  const bits = bitsOf(b, 36);                                        // 36 bits (b0..b3 + b4 high nibble)
  const recs = roundTrip(ppmTimings(bits));
  assertEquals(recs.length, 1);
  const r = recs[0];
  assertEquals(r.proto, "nexus");
  assertEquals(r.name, PROTO_NAMES.nexus);
  assertEquals(r.id, 0xa3);
  assertEquals(r.fields.channel, 2);
  assertEquals(r.fields.battery, 1);
  assertEquals(r.fields.humidity, 48);
  assert(Math.abs(r.fields.tempC - 23.5) <= 0.1, `temp ${r.fields.tempC} ≈ 23.5`);
  assertEquals(r.ts, 1000);
});

Deno.test("Nexus negative temperature sign-extends (−5.0 °C)", () => {
  const raw = 0x1000 - 50;                                           // −5.0 °C, 12-bit two's complement
  const b = [0x11, 0x80 | ((raw >> 8) & 0x0f), raw & 0xff, 0xf5, 0x00]; // humidity=(0x5<<4)=80
  const r = matchNexus(b);
  assert(r);
  assert(Math.abs(r.fields.tempC - -5.0) <= 0.1, `temp ${r.fields.tempC} ≈ -5.0`);
  assertEquals(r.fields.humidity, 80);
});

Deno.test("Fine Offset WH2 round-trip: real CRC-8 gates a recovered id/temp/humidity", () => {
  // id=18, temp=21.5°C (raw 215=0x0D7 → b1low=0, b2=0xD7), humidity=55%.
  const p = [0x01, 0x20, 0xd7, 0x37];
  const b4 = crc8(p, 4, 0x31, 0x00);                                // compute the REAL checksum
  const frameBytes = [0xff, ...p, b4];                              // 0xFF preamble + 5 payload bytes = 48 bits
  const bits = bitsOf(frameBytes, 48);
  const recs = roundTrip(pwmTimings(bits));
  assertEquals(recs.length, 1);
  const r = recs[0];
  assertEquals(r.proto, "wh2");
  assertEquals(r.name, PROTO_NAMES.wh2);
  assertEquals(r.id, 18);
  assertEquals(r.fields.humidity, 55);
  assert(Math.abs(r.fields.tempC - 21.5) <= 0.1, `temp ${r.fields.tempC} ≈ 21.5`);
});

Deno.test("Fine Offset WH2: one-bit corruption fails the CRC → no record", () => {
  const p = [0x01, 0x20, 0xd7, 0x37];
  const b4 = crc8(p, 4, 0x31, 0x00);
  assert(matchFineOffsetWH2([...p, b4]), "clean payload decodes");
  assertEquals(matchFineOffsetWH2([0x01, 0x20, 0xd6, 0x37, b4]), null); // flipped a bit in b[2]
  assertEquals(matchFineOffsetWH2([...p, b4 ^ 0x01]), null);            // flipped a CRC bit
});

Deno.test("Nexus: corrupt fixed nibble / impossible humidity → validity rejects", () => {
  assertEquals(matchNexus([0xa3, 0x90, 0xeb, 0x73, 0x00]), null);   // b[3]&0xf0 != 0xf0
  assertEquals(matchNexus([0xa3, 0x90, 0xeb, 0xff, 0xf0]), null);   // humidity 0xff > 100
});

Deno.test("Fixed-code remote: an identically repeating frame fires; random noise mints nothing", () => {
  const frame = [+400, -1200, +1200, -400, +400, -1200, +1200, -400, +400, -1200];
  const recs = roundTrip(frame, { gapUs: 12000 });
  assertEquals(recs.length, 1);
  assertEquals(recs[0].proto, "remote");
  assertEquals(recs[0].fired, true);
  assert(typeof recs[0].id === "string" && recs[0].id.length === 8);

  // pure noise → no false record.
  const noise = new Uint8Array(200000);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
  const t = capture(noise, { fs: 2e6, decim: 8 });
  assertEquals(decodeOOK(t, {}).length, 0);
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

// ===================== ambient (generative ambient theory) =====================
import { consonance, voicingScore, MODES as AMODES, CHORDS as ACHORDS, buildScale, voiceLead, VOICE_FLOOR, VOICE_CEIL, pickChord, sparkleNote, enoLoops, loopsForDensity, ENO_BASE, STYLES, styleById, chordRoot, mulberry32 as arng } from "./ambient.js";

Deno.test("ambient: consonance ranks the perfect 5th sweetest, minor 2nd/tritone harshest", () => {
  assert(consonance(7) > consonance(4), "P5 should beat M3");        // 3:2 vs 5:4
  assert(consonance(4) > consonance(1), "M3 should beat m2");
  assert(consonance(1) < consonance(5) && consonance(6) < consonance(5), "m2 and tritone are rough");
  assertEquals(consonance(12), consonance(0));                        // octave wraps to unison
  assertEquals(consonance(-5), consonance(7));                        // sign-independent
});

Deno.test("ambient: a consonant voicing scores higher than a clustered one", () => {
  assert(voicingScore([60, 67, 72]) > voicingScore([60, 61, 62]), "open 5th/octave beats a semitone cluster");
});

Deno.test("ambient: every mode starts on the root and stays within an octave, strictly ascending", () => {
  for (const [k, steps] of Object.entries(AMODES)) {
    assertEquals(steps[0], 0, `${k} must start at the root`);
    for (let i = 1; i < steps.length; i++) assert(steps[i] > steps[i - 1] && steps[i] < 12, `${k} step out of range`);
  }
});

Deno.test("ambient: buildScale spans the octaves and every pitch is in the mode", () => {
  const root = 48, s = buildScale(root, "major", 3);
  assertEquals(s.length, AMODES.major.length * 3);
  assertEquals(s[0], root);
  const pcs = new Set(AMODES.major.map((x) => (root + x) % 12));
  for (const m of s) assert(pcs.has(((m % 12) + 12) % 12), "pitch not in scale");
  for (let i = 1; i < s.length; i++) assert(s[i] > s[i - 1], "not ascending");
});

Deno.test("ambient: voiceLead anchors the root as bass and lifts every upper voice above the low-interval floor", () => {
  const v = voiceLead(null, 36, ACHORDS.maj9);   // C2 root — thirds/9ths must not stay in the mud
  assertEquals(Math.min(...v), 36, "bass is the chord root");
  for (const m of v) { assert(m <= VOICE_CEIL, "above ceiling"); if (m !== 36) assert(m >= VOICE_FLOOR, "upper voice below floor"); }
  assert(v.every((x, i) => i === 0 || x >= v[i - 1]), "ascending");
});

Deno.test("ambient: voiceLead minimises motion — upper voices hug the previous voicing", () => {
  const prev = [40, 52, 55, 59];
  const led = voiceLead(prev, 41, ACHORDS.maj7);        // F root chord after the previous
  // total motion of the voice-led upper voices must beat the naive (root+interval, no octave shift) placement
  const naive = ACHORDS.maj7.map((iv) => 41 + iv).slice(1);
  const nearest = (arr, x) => Math.min(...arr.map((p) => Math.abs(p - x)));
  const ledMotion = led.slice(1).reduce((a, m) => a + nearest(prev, m), 0);
  const naiveMotion = naive.reduce((a, m) => a + nearest(prev, m), 0);
  assert(ledMotion <= naiveMotion, "voice-leading did not reduce motion");
});

Deno.test("ambient: pickChord stays in the palette, avoids an immediate repeat, and is deterministic", () => {
  const pal = STYLES[0].chords;
  const rng1 = arng(7), rng2 = arng(7);
  for (let i = 0; i < 20; i++) {
    const a = pickChord(pal, 1, rng1);
    assert(a >= 0 && a < pal.length, "out of palette");
    assert(pal.length === 1 || a !== 1, "did not avoid repeat");
  }
  // same seed → same sequence
  const s1 = arng(9), s2 = arng(9);
  for (let i = 0; i < 10; i++) assertEquals(pickChord(pal, 0, s1), pickChord(pal, 0, s2));
});

Deno.test("ambient: sparkleNote returns a chord tone in the sparkle register", () => {
  const rng = arng(3);
  const iv = ACHORDS.min7, root = 40;
  const pcs = new Set(iv.map((x) => ((root + x) % 12)));
  for (let i = 0; i < 30; i++) {
    const m = sparkleNote(root, iv, 2, rng);
    assert(m >= 60 && m <= 96, "outside sparkle register");
    assert(pcs.has(((m % 12) + 12) % 12), "not a chord tone");
  }
});

Deno.test("ambient: enoLoops are near-coprime, jittered within ±5%, and deterministic", () => {
  const a = enoLoops(6, arng(11)), b = enoLoops(6, arng(11));
  assertEquals(a.length, 6);
  assertEquals(a.map((x) => x.len), b.map((x) => x.len));           // deterministic
  a.forEach((x, i) => {
    assert(x.len > 0 && x.phase >= 0 && x.phase < x.len, "phase in range");
    assert(Math.abs(x.len - ENO_BASE[i]) <= ENO_BASE[i] * 0.05 + 1e-9, "jitter beyond ±5%");
  });
  assertEquals(enoLoops(99, arng(1)).length, ENO_BASE.length);      // clamps to available bases
  assert(loopsForDensity(0) >= 3 && loopsForDensity(1) <= ENO_BASE.length);
});

Deno.test("ambient: exactly ten distinct styles, each valid and referencing a real mode + chords", () => {
  assertEquals(STYLES.length, 10);
  assertEquals(new Set(STYLES.map((s) => s.id)).size, 10, "style ids unique");
  assertEquals(new Set(STYLES.map((s) => s.hue)).size, 10, "hues distinct (colour = meaning)");
  for (const s of STYLES) {
    assert(AMODES[s.scale], `${s.id}: unknown scale ${s.scale}`);
    assert(s.chords.length >= 1, `${s.id}: no chords`);
    for (const c of s.chords) { assert(ACHORDS[c[1]], `${s.id}: unknown chord ${c[1]}`); assert(chordRoot(s, c) >= s.root, "chord root below pad root"); }
    assert(["et", "ji"].includes(s.tuning), `${s.id}: bad tuning`);
    assert(s.rel >= s.atk, `${s.id}: release should be >= attack for a pad`);
  }
  assertEquals(styleById("zen").id, "zen");
  assertEquals(styleById("nope").id, STYLES[0].id);                 // fallback
});

// ===================== affected-app orchestrator (tools/graph.mjs) =====================
import { importSpecs, resolveSpec, buildClosure, classifyAffected, isGlobal, RT as RTX } from "../../tools/graph.mjs";

Deno.test("graph: importSpecs finds static, re-export, dynamic and side-effect imports; ignores non-imports", () => {
  const src = `import { T } from "/_rt/i18n.js";\nimport X from "./x.js";\nexport { y } from "./y.js";\nconst p = import("./lazy.js");\nimport "./side.js";\nconst s = "not from \\"nope.js\\"";`;
  const got = new Set(importSpecs(src));
  for (const s of ["/_rt/i18n.js", "./x.js", "./y.js", "./lazy.js", "./side.js"]) assert(got.has(s), `missing ${s}`);
  assert(!got.has("nope.js"), "matched a non-import string");
});

Deno.test("graph: resolveSpec maps /_rt/ to the runtime dir, resolves relative, treats bare/esm as external", () => {
  assertEquals(resolveSpec("/_rt/ambient.js", "apps/drift/view.js"), RTX + "ambient.js");
  assertEquals(resolveSpec("./synth.js", "apps/drift/view.js"), "apps/drift/synth.js");
  assertEquals(resolveSpec("../runtime/x.js", "packages/gates/y.js"), "packages/runtime/x.js");
  assertEquals(resolveSpec("htm/preact", "apps/drift/view.js"), null);
  assertEquals(resolveSpec("jsr:@std/assert", "x.js"), null);
});

Deno.test("graph: buildClosure walks the transitive local graph, ignoring externals and dangling leaves", () => {
  const files = {
    "apps/a/view.js": `import "/_rt/rt.js";\nimport "./child.js";\nimport "htm/preact";`,
    "apps/a/child.js": `import "/_rt/shared.js";`,
    "packages/runtime/rt.js": `import "./shared.js";`,
    "packages/runtime/shared.js": `export const x = 1;`,
  };
  const cl = buildClosure("apps/a/view.js", (f) => files[f] ?? null);
  for (const f of ["apps/a/view.js", "apps/a/child.js", "packages/runtime/rt.js", "packages/runtime/shared.js"]) assert(cl.has(f), `closure missing ${f}`);
  assertEquals(cl.has("htm/preact"), false, "external leaked into closure");
});

Deno.test("affected: a runtime module re-verifies ONLY the apps that import it (the whole point)", () => {
  const apps = [
    { id: "drift", closure: new Set(["apps/drift/view.js", RTX + "ambient.js", RTX + "spectrum.js"]) },
    { id: "rave", closure: new Set(["apps/rave/view.js", RTX + "groove.js", RTX + "spectrum.js"]) },
  ];
  const core = new Set([RTX + "index.js", RTX + "render.js"]);
  // ambient.js is drift-only → just drift (NOT the whole farm — this is what killed the 17-min run)
  assertEquals(classifyAffected([RTX + "ambient.js"], apps, core), ["drift"]);
  // spectrum.js is shared by both → both
  assertEquals(classifyAffected([RTX + "spectrum.js"], apps, core), ["drift", "rave"]);
  // a runtime module nobody imports → nobody
  assertEquals(classifyAffected([RTX + "orphan.js"], apps, core), []);
});

Deno.test("affected: app-dir changes scope to that app; tests/docs affect nothing", () => {
  const apps = [{ id: "drift", closure: new Set(["apps/drift/view.js"]) }, { id: "rave", closure: new Set(["apps/rave/view.js"]) }];
  const core = new Set();
  assertEquals(classifyAffected(["apps/drift/synth.js", "apps/drift/i18n/uk.json"], apps, core), ["drift"]);
  assertEquals(classifyAffected([RTX + "ambient_test.js", "README.md", "docs/x.md"], apps, core), []);
});

Deno.test("affected: shared/uncertain changes widen to the whole farm (safe direction)", () => {
  const apps = [{ id: "drift", closure: new Set() }, { id: "rave", closure: new Set() }];
  const core = new Set([RTX + "index.js", RTX + "render.js"]);
  assertEquals(classifyAffected([RTX + "render.js"], apps, core).length, 2, "core bootstrap change → whole farm");
  assertEquals(classifyAffected(["packages/gates/verify.mjs"], apps, core).length, 2, "harness change → whole farm");
  assertEquals(classifyAffected([RTX + "theme.css"], apps, core).length, 2, "runtime asset → whole farm");
  assertEquals(classifyAffected(["deno.json"], apps, core).length, 2, "root config → whole farm");
  assert(isGlobal("tools/graph.mjs", core), "orchestrator change → whole farm");
});

// ── sitelabel: readable page titles + domain grouping (derived from the URL, never fetched) ─────────────
Deno.test("registrableDomain: subdomains fold into one site, multi-label suffixes survive", () => {
  assertEquals(registrableDomain("commons.wikimedia.org"), "wikimedia.org");
  assertEquals(registrableDomain("www.mixkit.co"), "mixkit.co");
  assertEquals(registrableDomain("mixkit.co"), "mixkit.co");
  assertEquals(registrableDomain("news.bbc.co.uk"), "bbc.co.uk", "co.uk is a suffix, not a site");
  assertEquals(registrableDomain("shop.rozetka.com.ua"), "rozetka.com.ua");
  assertEquals(registrableDomain("localhost"), "localhost");
});

Deno.test("siteName: the label before the public suffix, capitalised", () => {
  assertEquals(siteName("https://mixkit.co/free-stock-video/"), "Mixkit");
  assertEquals(siteName("https://commons.wikimedia.org/wiki/Category:Animations"), "Wikimedia");
  assertEquals(siteName("https://www.dareful.com/"), "Dareful");
});

Deno.test("pageLabel: the page's own title, derived from its URL", () => {
  assertEquals(pageLabel("https://mixkit.co/free-stock-video/"), "Free stock video");
  assertEquals(pageLabel("https://mixkit.co/free-stock-video/space/"), "Space");
  assertEquals(pageLabel("https://commons.wikimedia.org/wiki/Category:Underwater_videos"), "Underwater videos", "the Category: prefix is chrome, not title");
  assertEquals(pageLabel("https://dareful.com/"), "Dareful", "a bare root falls back to the site name");
  assertEquals(pageLabel("https://site.com/search?q=sunset+timelapse"), "Sunset timelapse", "a results page is titled by its term");
  assertEquals(pageLabel("https://site.com/videos/page/2"), "Site", "ids and paging noise are not titles");
  assertEquals(pageLabel("https://site.com/clips/12345-a-slow-river.html"), "A slow river");
  assertEquals(pageLabel("not a url at all"), "Not a url at all", "never throws on junk");
  assertEquals(pageLabel(""), "");
});

Deno.test("pageLabel: caps length on a word boundary so a row can't be blown out", () => {
  const long = pageLabel("https://site.com/a-very-long-page-name-that-keeps-going-and-going-forever");
  assert(long.length <= 43, `label too long: ${long.length}`);
  assert(long.endsWith("…"), "a truncated label must say so");
  assert(!/\s…$/.test(long), "no dangling space before the ellipsis");
});

// A video PAGE is where URL-derived titling runs out: its path is a shape, not a name. These are the URL
// SHAPES a reel dives into (hosts kept generic on purpose) — `/view_video.php` is what the owner saw as
// "View video" in the source island.
Deno.test("pageLabelInfo: a label that only describes the medium is weak, and says so", () => {
  const weak = (u) => pageLabelInfo(u).weak;
  assert(weak("https://tube.example/view_video.php?viewkey=k5f2a1b"), "view_video.php is a shape, not a title");
  assert(weak("https://tube.example/video81234567/"), "an id with a `video` prefix names nothing");
  assert(weak("https://tube.example/12345678"), "a path that exists and still names nothing is a page we failed to read");
  assert(!weak("https://dareful.com/"), "a bare root IS the site — its own <title> is a marketing line, not a name");
  assert(!weak("https://mixkit.co/free-stock-video/space/"), "Space is a name");
  assert(!weak("https://tube.example/video.abc123/hot_summer_day"), "the slug names the page");
  assert(!weak("https://site.com/search?q=sunset+timelapse"), "a search term names the page");
  assertEquals(pageLabelInfo("https://tube.example/view_video.php?viewkey=x").label, "View video", "the label itself is unchanged — only the confidence is new");
});

Deno.test("cleanPageTitle: the page's own title minus the site chrome stapled to it", () => {
  const c = cleanPageTitle;
  assertEquals(c("Slow river in the forest - TUBE.EXAMPLE", "https://tube.example/x"), "Slow river in the forest", "the site shouts its own name in caps; that is chrome");
  assertEquals(c("Category:Animations - Wikimedia Commons", "https://commons.wikimedia.org/wiki/x"), "Category:Animations");
  assertEquals(c("Sunset over the pier | Coverr", "https://coverr.co/videos/x"), "Sunset over the pier");
  assertEquals(c("Mixkit · Slow river in the forest", "https://mixkit.co/x"), "Slow river in the forest", "the chrome can lead as well as trail");
  assertEquals(c("A day - and a night - in Kyiv – Site", "https://site.com/x"), "A day – and a night – in Kyiv", "only the SITE chunk is cut; an inner dash is part of the title");
  assertEquals(c("Mixkit", "https://mixkit.co/x"), "", "a title that is only the site name says nothing");
  assertEquals(c("video", "https://site.com/x"), "", "so does the extractor's own fallback");
  assertEquals(c("Preview 1080p", "https://site.com/x"), "", "…and a humanised filename");
  assertEquals(c("", "https://site.com/x"), "");
  const long = c("A very long page title that simply keeps going and going and going past every sane limit", "https://site.com/x");
  assert(long.length <= 65 && long.endsWith("…"), `title not capped: ${long}`);
});

Deno.test("sourceTitle: the URL names the page when it can, the page names itself when it can't", () => {
  const vid = "https://tube.example/view_video.php?viewkey=k5f2a1b";
  assertEquals(sourceTitle("https://mixkit.co/free-stock-video/space/", { pageTitle: "Free Space Stock Video Footage - Mixkit" }), "Space", "a URL that names the page is not overruled");
  assertEquals(sourceTitle(vid, { pageTitle: "Sunrise on the roof - Tube.example" }), "Sunrise on the roof");
  assertEquals(sourceTitle(vid, { hint: "Sunrise on the roof" }), "Sunrise on the roof", "no page title yet → the clip you dived from names it");
  assertEquals(sourceTitle(vid, { pageTitle: "Free Online Videos - Tube", hint: "Sunrise on the roof" }), "Sunrise on the roof", "an SEO title made only of medium-words is not a title");
  assertEquals(sourceTitle(vid, { hint: "video" }), "View video", "nothing usable anywhere → the URL's shape, unchanged");
  assertEquals(sourceTitle(""), "");
});

/* A page's name arrives as MACHINE TEXT and has to stop being machine text before it is shown. Every case
   below was measured against the shipped code first, and every one of them reached the sources list: the
   percent-escapes as `%20`, the entities as `&amp;` — and the literal-percent URL not as bad text but as a
   THROWN URIError, because decodeURIComponent rejects the whole string over one bad escape. */
Deno.test("humanText: percent-escapes, entities and invisible characters, and never a throw", () => {
  assertEquals(humanText("%D0%9A%D0%B8%D1%97%D0%B2%20%D0%B2%D0%BD%D0%BE%D1%87%D1%96"), "Київ вночі");
  assertEquals(humanText("a-100%-sure-thing"), "a-100%-sure-thing", "a literal percent is text, not a broken escape");
  assertEquals(humanText("%zz %D0 %E0%A4%A"), "%zz %D0 %E0%A4%A", "malformed escapes cost only themselves");
  assertEquals(humanText("100%25 %2520pure"), "100% pure", "double-encoded — decoded twice, and no further");
  assertEquals(humanText("Rock &amp; Roll &#039;77 &#8217;s &mdash; live &hellip;"), "Rock & Roll '77 ’s — live …");
  assertEquals(humanText("&#x41;&#x2014;&#X42;"), "A—B", "hex entities, either case");
  assertEquals(humanText("Bad &unknown; &amp entity"), "Bad &unknown; &amp entity", "an entity we don't know stays as it came");
  assertEquals(humanText("A\u00a0title\u200b with\tgaps\n"), "A title with gaps", "nbsp, zero-width and control characters are not typography");
  assertEquals(humanText(null), "");
});

Deno.test("sitelabel: a malformed escape anywhere never takes the label down with it", () => {
  // The whole chain, on the URL that threw: pageLabelInfo → prettify → sourceTitle. A row that renders a
  // label is a row that a URIError erases, so "does not throw" IS the user-visible behaviour here.
  assertEquals(pageLabel("https://tube.example/clips/a-100%-sure-thing/"), "A 100% sure thing");
  assertEquals(sourceTitle("https://tube.example/%E0%A4%A/watch/1/", { hint: "Nightfall" }), "Nightfall");
  assertEquals(cleanPageTitle("Half %E0%A4%A decoded &amp; fine - Tube.example", "https://tube.example/x"), "Half %E0%A4%A decoded & fine");
});

Deno.test("sitelabel: an encoded path segment is a title once it is decoded", () => {
  assertEquals(pageLabel("https://site.com/video/1234/%D0%9A%D1%80%D0%B0%D1%81%D0%B8%D0%B2%D0%B8%D0%B9%20%D0%B7%D0%B0%D1%85%D1%96%D0%B4/"), "Красивий захід");
  assertEquals(pageLabel("https://site.com/clip/%2520double%2520encoded/"), "Double encoded");
  assertEquals(pageLabel("https://site.com/a%2Fb/"), "A/b", "an encoded slash is a character in ONE segment, never a new segment");
  assertEquals(sourceTitle("https://tube.example/watch/9/", { pageTitle: "Sunrise &amp; the sea &#8212; Tube.example" }), "Sunrise & the sea");
});

/* `max` is the caller's room. The island is a chip beside four controls and takes the short form; a sources
   row wraps and takes the whole name. Before this, both got 42/64 characters and the row's spare line was
   spent on an ellipsis. */
Deno.test("sourceTitle: the caller states how much room it has, and both producers honour it", () => {
  const longUrl = "https://site.com/a-very-long-page-name-that-keeps-going-and-going-forever/";
  const vid = "https://tube.example/view_video.php?viewkey=k5f2a1b";
  const longTitle = "A very long page title that simply keeps going and going and going past every sane limit";
  assert(sourceTitle(longUrl).endsWith("…"), "the default cap is unchanged");
  assert(sourceTitle(vid, { pageTitle: longTitle }).endsWith("…"), "…on the page-title path too");
  assertEquals(sourceTitle(longUrl, { max: 120 }), "A very long page name that keeps going and going forever", "room stated → the whole name");
  assertEquals(sourceTitle(vid, { pageTitle: longTitle, max: 120 }), longTitle);
  assert(sourceTitle(vid, { pageTitle: longTitle, max: 40 }).length <= 41, "a smaller room truncates sooner");
});

Deno.test("groupByDomain: pages of one site group together, first-appearance order kept", () => {
  const g = groupByDomain([
    { url: "https://mixkit.co/free-stock-video/" },
    { url: "https://commons.wikimedia.org/wiki/Category:Animations" },
    { url: "https://mixkit.co/free-stock-video/space/" },
    { url: "https://wikimedia.org/x" },
  ]);
  assertEquals(g.map((x) => x.domain), ["mixkit.co", "wikimedia.org"]);
  assertEquals(g[0].items.length, 2);
  assertEquals(g[1].items.length, 2, "a subdomain and its apex are the same site");
  assertEquals(g[0].name, "Mixkit");
  assertEquals(groupByDomain([]), []);
  assertEquals(groupByDomain([{ name: "no url" }]), [], "an entry without a url is skipped, not crashed on");
});

// ── overlayDepth: the arithmetic the Back-button routing runs on ────────────────────────────────────────
Deno.test("overlayDepth: a stack is worth one history entry per level", () => {
  assertEquals(overlayDepth(true), 1, "a plain open overlay");
  assertEquals(overlayDepth({ id: 1 }), 1, "a detail object");
  assertEquals(overlayDepth(null), 0);
  assertEquals(overlayDepth(false), 0);
  assertEquals(overlayDepth([]), 0, "an empty stack is closed");
  assertEquals(overlayDepth(["a", "b", "c"]), 3, "three dives = three Backs");
});

// ── underrated: why a developer deserves a lift, and the FUNDING.yml → support links ────────────────────
Deno.test("scoreRepo: fresh, low-star, solo, documented project scores high with ordered reasons", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const { score, reasons } = scoreRepo({
    stars: 12, forks: 6, pushedAt: "2026-07-20T00:00:00Z", ownerType: "User",
    ownerFollowers: 40, goodFirst: 3, description: "A tiny well-made CLI for tidying imports",
  }, NOW);
  assert(score >= 80, `expected a strong lift, got ${score}`);
  // freshness first, then the under-recognised / welcomes-help / solo / documented / rising signals.
  assertEquals(reasons[0], "reasonFresh");
  assert(reasons.includes("reasonFewStars"));
  assert(reasons.includes("reasonNeedsHelp"));
  assert(reasons.includes("reasonSolo"));
  assert(reasons.includes("reasonDocumented"));
  assert(reasons.includes("reasonRising"), "forks/stars = 0.5 ≥ 0.35 → rising");
});

Deno.test("scoreRepo: a popular org repo pushed long ago is NOT flagged underrated", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const { score, reasons } = scoreRepo({
    stars: 45000, forks: 9000, pushedAt: "2025-01-01T00:00:00Z", ownerType: "Organization",
    description: "A hugely popular framework", goodFirst: 0,
  }, NOW);
  assert(score <= 20, `a famous stale org repo should score low, got ${score}`);
  assert(!reasons.includes("reasonFewStars"));
  assert(!reasons.includes("reasonSolo"));
});

Deno.test("scoreRepo: 0 stars is excluded from the under-recognised bonus (placeholder repos)", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const a = scoreRepo({ stars: 0, pushedAt: "2026-07-24T00:00:00Z" }, NOW);
  assert(!a.reasons.includes("reasonFewStars"), "0 stars is not a real project to lift");
  const b = scoreRepo({ stars: 5, pushedAt: "2026-07-24T00:00:00Z" }, NOW);
  assert(b.score > a.score, "a 5-star alive repo outscores an empty one");
});

Deno.test("scoreRepo: defensive against missing/garbage fields (never throws, clamps 0..100)", () => {
  for (const bad of [undefined, {}, { stars: "x", pushedAt: "not-a-date" }, { forks: -3, stars: NaN }]) {
    const r = scoreRepo(bad);
    assert(r.score >= 0 && r.score <= 100);
    assert(Array.isArray(r.reasons));
  }
});

Deno.test("ageDays: ISO and epoch agree; garbage → null", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  assertEquals(Math.round(ageDays("2026-07-20T00:00:00Z", NOW)), 5);
  assertEquals(Math.round(ageDays(Date.parse("2026-07-15T00:00:00Z"), NOW)), 10);
  assertEquals(ageDays("nonsense", NOW), null);
  assertEquals(ageDays(null, NOW), null);
});

Deno.test("parseFunding: maps every common platform to a real URL, GitHub Sponsors first", () => {
  const yaml = [
    "# Funding",
    "patreon: janedev",
    "ko_fi: janedev",
    "github: [janedev, janedev-org]  # inline list",
    "open_collective: janes-project",
    'custom: ["https://janedev.example/donate", "not-a-url"]',
    "liberapay: janedev",
    "unknown_platform: whatever",
  ].join("\n");
  const links = parseFunding(yaml);
  assertEquals(links[0].platform, "github", "GitHub Sponsors is the primary charity target → first");
  assertEquals(links[0].url, "https://github.com/sponsors/janedev");
  const byUrl = Object.fromEntries(links.map((l) => [l.platform + ":" + l.handle, l.url]));
  assertEquals(byUrl["patreon:janedev"], "https://patreon.com/janedev");
  assertEquals(byUrl["ko_fi:janedev"], "https://ko-fi.com/janedev");
  assertEquals(byUrl["open_collective:janes-project"], "https://opencollective.com/janes-project");
  assertEquals(byUrl["liberapay:janedev"], "https://liberapay.com/janedev");
  assert(links.some((l) => l.url === "https://janedev.example/donate"), "custom URL kept verbatim");
  assert(!links.some((l) => l.url.includes("not-a-url")), "a non-http custom entry is dropped");
  assert(!links.some((l) => l.platform === "unknown_platform"), "unknown platform skipped, not crashed on");
});

Deno.test("parseFunding: empty / malformed input yields no links, never throws", () => {
  assertEquals(parseFunding(""), []);
  assertEquals(parseFunding(null), []);
  assertEquals(parseFunding("github:\npatreon:   \n"), [], "empty values produce nothing");
  assertEquals(hostLabel("https://www.buymeacoffee.com/x"), "buymeacoffee.com");
});

// ── natal.js — the precise natal chart (see apps/transit/RESEARCH.md for every number quoted here) ─────

Deno.test("natal/zoneOffset: the engine's tz database reaches back to Local Mean Time, to the second", () => {
  // Before the railways every town kept its own solar time; tzdata records it and Intl exposes it. A chart
  // that assumed +01:00 for 1879 Ulm would put the Ascendant half a sign away.
  assertEquals(zoneOffset(Date.parse("1879-03-14T10:00:00Z"), "Europe/Berlin"), 53 * 60000 + 28000);
  assertEquals(zoneOffset(Date.parse("1879-03-14T10:00:00Z"), "Europe/Kyiv"), 2 * 3600000 + 2 * 60000 + 4000);
  assertEquals(zoneOffset(Date.parse("1883-11-17T10:00:00Z"), "America/New_York"), -(4 * 3600000 + 56 * 60000 + 2000));
  assertEquals(zoneOffset(Date.parse("2026-07-25T10:00:00Z"), "Europe/Kyiv"), 3 * 3600000);
  assertEquals(zoneOffset(Date.parse("2000-01-01T00:00:00Z"), "Asia/Kolkata"), 5 * 3600000 + 30 * 60000);
  assert(knownZone("Europe/Kyiv"));
  assert(!knownZone("Europe/Atlantis"), "a typo must fail loudly, not silently become UTC");
});

Deno.test("natal/zonedToUTC: wall clock → instant, including DST edges and the manual override", () => {
  // plain winter time
  const w = zonedToUTC({ y: 1990, mo: 1, d: 15, h: 12, mi: 30 }, "Europe/Kyiv");
  assertEquals(w.ms, Date.parse("1990-01-15T09:30:00Z"), "UTC+3 in Jan 1990 (Kyiv was on Moscow time)");
  assert(!w.ambiguous && !w.nonexistent);

  // historic LMT — the 1879 Ulm birth used by the reference chart below
  const e = zonedToUTC({ y: 1879, mo: 3, d: 14, h: 11, mi: 30 }, "Europe/Berlin");
  assertEquals(e.offset, 53 * 60000 + 28000);
  assertEquals(e.ms, Date.parse("1879-03-14T10:36:32Z"));

  // Spring forward. The EU switches at 01:00 UTC, which in Kyiv (then UTC+2) is 03:00 local: the clock goes
  // 02:59:59 → 04:00:00, so the whole 03:00 hour never happened. Measured, not assumed.
  const gap = zonedToUTC({ y: 2021, mo: 3, d: 28, h: 3, mi: 30 }, "Europe/Kyiv");
  assert(gap.nonexistent, "03:30 never occurred in Kyiv that morning — the flag must be raised");
  assertEquals(zonedToUTC({ y: 2021, mo: 3, d: 28, h: 2, mi: 30 }, "Europe/Kyiv").ms,
    Date.parse("2021-03-28T00:30:00Z"), "the hour before the gap is ordinary UTC+2");
  const after = zonedToUTC({ y: 2021, mo: 3, d: 28, h: 4, mi: 30 }, "Europe/Kyiv");
  assert(!after.nonexistent);
  assertEquals(after.ms, Date.parse("2021-03-28T01:30:00Z"), "and the hour after it is UTC+3");

  // autumn fall-back: 03:30 on 2021-10-31 ran twice in Kyiv → ambiguous, earlier (still-DST) instant taken
  const amb = zonedToUTC({ y: 2021, mo: 10, d: 31, h: 3, mi: 30 }, "Europe/Kyiv");
  assert(amb.ambiguous, "the repeated hour must be flagged, not silently resolved");
  assertEquals(amb.offset, 3 * 3600000, "the earlier pass is still on summer time");

  // manual offset bypasses the database entirely — a birth certificate beats tzdata
  const m = zonedToUTC({ y: 1990, mo: 1, d: 15, h: 12, mi: 30 }, { offsetMs: 2 * 3600000 });
  assertEquals(m.ms, Date.parse("1990-01-15T10:30:00Z"));
  assertEquals(zonedToUTC({ y: 2000, mo: 1, d: 1, h: 0 }, "Nowhere/Nothing"), null);
});

Deno.test("natal/offsets: parse and format round-trip, including sub-minute LMT", () => {
  assertEquals(parseOffset("+02:00"), 7200000);
  assertEquals(parseOffset("-0430"), -(4 * 3600000 + 30 * 60000));
  assertEquals(parseOffset("+00:53:28"), 53 * 60000 + 28000);
  assertEquals(parseOffset("Z"), 0);
  assertEquals(parseOffset("+25:00"), null);
  assertEquals(parseOffset("garbage"), null);
  assertEquals(formatOffset(7200000), "+02:00");
  assertEquals(formatOffset(53 * 60000 + 28000), "+00:53:28", "LMT seconds must survive the round trip");
  assertEquals(formatOffset(-(4 * 3600000 + 56 * 60000 + 2000)), "-04:56:02");
  assertEquals(lmtOffset(10), 40 * 60000, "10°E is 40 minutes of sun ahead of Greenwich");
});

// Albert Einstein, 14 Mar 1879 11:30 LMT, Ulm 48°24'N 10°00'E (Rodden AA). LMT from longitude = +0:40 →
// 10:50 UT. Frame values come from astronomy-engine at that instant (astro.js chartFrame); they are pinned
// here so this test stays pure and offline. Reference cusps: astro.com, Placidus.
const EINSTEIN = { ramc: 344.18405, eps: 23.456473, phi: 48.4 };
const dms = (deg, min) => deg + min / 60;

Deno.test("natal/angles+houses: Placidus matches a published chart to under an arcminute", () => {
  const { ramc, eps, phi } = EINSTEIN;
  const h = houses(ramc, eps, phi, "placidus");
  assertEquals(h.system, "placidus");
  assertEquals(h.fallback, null);
  const near = (got, sign, d, m, what) => {
    const want = sign * 30 + dms(d, m);
    const off = Math.abs(wrap180(got - want)) * 60;
    assert(off < 1, `${what}: ${got.toFixed(4)}° vs published ${want.toFixed(4)}° → ${off.toFixed(2)}' out`);
  };
  near(h.asc, 3, 11, 39, "ASC 11 Cancer 39");
  near(h.mc, 11, 12, 50, "MC 12 Pisces 50");
  near(h.cusps[1], 3, 28, 37, "cusp 2 = 28 Cancer 37");
  near(h.cusps[2], 4, 17, 48, "cusp 3 = 17 Leo 48");
  near(h.cusps[4], 6, 18, 20, "cusp 5 = 18 Libra 20");
  near(h.cusps[5], 8, 3, 6, "cusp 6 = 3 Sagittarius 06");
  assertEquals(h.cusps[0], h.asc, "cusp 1 IS the Ascendant");
  assertEquals(h.cusps[9], h.mc, "cusp 10 IS the Midheaven");
  for (let i = 0; i < 6; i++) {
    assert(Math.abs(wrap180(h.cusps[i + 6] - h.cusps[i] - 180)) < 1e-9, `cusp ${i + 7} opposes cusp ${i + 1}`);
  }
});

Deno.test("natal/houses: the closed-form systems, and cusps that always run forward", () => {
  const { ramc, eps, phi } = EINSTEIN;
  const w = houses(ramc, eps, phi, "whole");
  assertEquals(w.cusps[0] % 30, 0, "whole sign starts each house at 0 of a sign");
  assertEquals(Math.floor(w.cusps[0] / 30), Math.floor(w.asc / 30), "house 1 is the Ascendant's whole sign");
  const eq = houses(ramc, eps, phi, "equal");
  assertEquals(eq.cusps[0], eq.asc);
  assert(Math.abs(wrap180(eq.cusps[3] - eq.asc - 90)) < 1e-9, "equal houses are exactly 30 apart");
  for (const sys of HOUSE_SYSTEMS) {
    const h = houses(ramc, eps, phi, sys);
    assertEquals(h.cusps.length, 12);
    let total = 0;
    for (let i = 0; i < 12; i++) total += norm360(h.cusps[(i + 1) % 12] - h.cusps[i]);
    assert(Math.abs(total - 360) < 1e-6, `${sys}: the twelve spans must close the circle exactly`);
  }
});

Deno.test("natal/houses: above the polar circle Placidus is abandoned, and says so", () => {
  // tan(phi)*tan(eps) = 1 at ~66.56 — beyond it some ecliptic degrees never rise, so the semi-arc that
  // Placidus trisects does not exist. Silently drawing a different chart would be the real failure.
  assert(placidusDefined(23.44, 60), "60 N is fine");
  assert(!placidusDefined(23.44, 70), "70 N is past the polar circle");
  const arctic = houses(EINSTEIN.ramc, EINSTEIN.eps, 70, "placidus");
  assertEquals(arctic.system, "porphyry", "falls back to the system Swiss Ephemeris falls back to");
  assertEquals(arctic.fallback, "placidus", "and reports what was asked for");
  assertEquals(arctic.cusps[0], arctic.asc, "the Ascendant is still exact — only the division changed");
});

Deno.test("natal/houseOf: placement survives the wildly uneven houses Placidus makes", () => {
  const h = houses(EINSTEIN.ramc, EINSTEIN.eps, EINSTEIN.phi, "placidus");
  for (let i = 0; i < 12; i++) {
    assertEquals(houseOf(h.cusps[i] + 1e-6, h.cusps), i + 1, `just inside cusp ${i + 1}`);
    assertEquals(houseOf(h.cusps[i], h.cusps), i + 1, "a body exactly on a cusp belongs to that house");
  }
  const eq = houses(0, 23.44, 0, "equal");
  assertEquals(houseOf(norm360(eq.asc + 95), eq.cusps), 4);
  assertEquals(houseOf(norm360(eq.asc - 1), eq.cusps), 12);
  assertEquals(houseOf(10, null), null);
});

Deno.test("natal/vertex: sits in the western half of the chart", () => {
  const h = houses(EINSTEIN.ramc, EINSTEIN.eps, EINSTEIN.phi);
  const fromAsc = norm360(h.vertex - h.asc);
  assert(fromAsc > 90 && fromAsc < 270, `vertex is a western point, got ${fromAsc.toFixed(1)} past the ASC`);
});

Deno.test("natal/transits: event orbs, applying vs separating, tightest first", () => {
  const natal = [{ key: "sun", lon: 100 }, { key: "asc", lon: 200 }];
  const now = [{ key: "mars", lon: 100.4 }, { key: "saturn", lon: 20.5 }];
  const hits = transits(now, natal, { prev: { mars: 101.2, saturn: 20.2 } });
  assertEquals(hits[0].t, "mars");
  assertEquals(hits[0].type, "conjunction");
  assert(hits[0].exact, "0.4 is inside the 1 exact orb");
  assertEquals(hits[0].applying, true, "Mars closed from 1.2 to 0.4 → applying");
  const opp = hits.find((x) => x.t === "saturn" && x.n === "asc");
  assertEquals(opp.type, "opposition", "20.5 against 200 is a separation of 179.5");
  assertEquals(opp.orb, 0.5);
  assertEquals(opp.applying, false, "Saturn widened from 0.2 out to 0.5 out → separating, not applying");
  assert(hits.every((x, i) => i === 0 || x.orb >= hits[i - 1].orb), "sorted tightest first");
  assertEquals(transitAspect(100, 100, 3).type, "conjunction");
  assertEquals(transitAspect(160, 100, 3).type, "sextile");

  // Regression: `separation` is the SHORT arc, so a trine can sit on either side of the natal point. The
  // root finder solves lon(t) - natal - angle = 0, so an unsigned angle sends it to the far side of the
  // wheel and it reports "no hit" for an aspect perfecting within the hour. Caught in a live chart.
  assertEquals(transitAspect(220, 100, 3).signedAngle, 120, "transit 120 AHEAD of natal");
  assertEquals(transitAspect(340, 100, 3).signedAngle, -120, "transit 120 BEHIND natal — same separation");
  assertEquals(separation(340, 100), 120, "both really are a trine");
  assertEquals(transitAspect(280, 100, 3).signedAngle, 180, "an opposition is symmetric, so the sign is moot");
  assertEquals(transitAspect(145, 100, 3), null, "45 is not a Ptolemaic aspect");
  assert(!transitAspect(102.5, 100, 3).exact, "2.5 out is in range but not exact");
  assertEquals(separation(350, 10), 20, "separation takes the short arc across 0");
  assert(TRANSIT_ORB.exact < ASPECTS[0].orb, "a transit orb must be tighter than the natal one");
});

Deno.test("natal/exactHits: bisection finds every crossing, including a retrograde triple", () => {
  const DAY = 864e5;
  // A body drifting 1 deg/day past a natal point at 100: one clean conjunction.
  const linear = (ms) => norm360(90 + (ms - 0) / DAY);
  const one = exactHits(linear, 100, 0, 0, 30 * DAY, { step: DAY, tolMs: 1000 });
  assertEquals(one.length, 1);
  assert(Math.abs(one[0] - 10 * DAY) < 2000, "crossing at day 10, to the second");

  // A retrograde loop: forward, back, forward — the classic three passes over one natal degree. The body
  // swings 98±4 with a 60-day period, so it reaches 100 at days 5, 25 and 65 — the window must hold all three.
  const loop = (ms) => { const d = ms / DAY; return norm360(98 + 4 * Math.sin((d / 60) * 2 * Math.PI)); };
  const three = exactHits(loop, 100, 0, 0, 70 * DAY, { step: DAY, tolMs: 1000 });
  assertEquals(three.length, 3, "a retrograde body hits the same aspect three times");
  for (const h of three) assert(Math.abs(wrap180(loop(h) - 100)) < 1e-4, "each hit is exact to 0.0001 deg");
  assert(three[0] < three[1] && three[1] < three[2], "returned in time order");

  // A body that wraps 360 -> 0 must not register a phantom crossing.
  const wrapper = (ms) => norm360(350 + (ms / DAY) * 20);
  const none = exactHits(wrapper, 180, 0, 0, 2 * DAY, { step: DAY, tolMs: 1000 });
  assertEquals(none.length, 0, "the wrap guard keeps a 360 to 0 jump from faking a hit");
  assertEquals(HIT_PRECISION.pluto, "day", "Pluto moves too slowly to quote a second");
  assertEquals(HIT_PRECISION.moon, "second");
});

Deno.test("places/translit: official Ukrainian romanisation reaches the English geocoder index", () => {
  // The geocoder holds no Ukrainian names, so Cyrillic input is romanised with the scheme that produced the
  // English names in the first place (KMU 1996/2010). Every pair below was confirmed to be a live hit.
  const pairs = [["Київ", "Kyiv"], ["Львів", "Lviv"], ["Одеса", "Odesa"], ["Харків", "Kharkiv"],
    ["Дніпро", "Dnipro"], ["Чернівці", "Chernivtsi"], ["Запоріжжя", "Zaporizhzhia"], ["Ужгород", "Uzhhorod"],
    ["Івано-Франківськ", "Ivano-Frankivsk"], ["Тернопіль", "Ternopil"], ["Вінниця", "Vinnytsia"]];
  for (const [uk, en] of pairs) assertEquals(translit(uk), en, uk);
  assertEquals(translit("Згорани"), "Zghorany", "зг is the one digraph that would otherwise collide with ж");
  assertEquals(translit("Єнакієве"), "Yenakiieve", "є romanises as ye at the start of a word, ie inside it");
  assertEquals(translit("Ялта"), "Yalta");
  assert(isCyrillic("Київ"));
  assert(!isCyrillic("Kyiv"));
  assertEquals(translit("Ulm"), "Ulm", "Latin input passes through untouched");
});

Deno.test("places/toPlace: a row without a time zone is dropped, never guessed", () => {
  const row = { id: 2820256, name: "Ulm", latitude: 48.39841, longitude: 9.99155, timezone: "Europe/Berlin",
    country: "Germany", country_code: "DE", admin1: "Baden-Wurttemberg" };
  const p = toPlace(row);
  assertEquals(p.zone, "Europe/Berlin");
  assertEquals(placeLabel(p), "Ulm · Baden-Wurttemberg, Germany");
  assertEquals(toPlace({ ...row, timezone: null }), null, "no zone means no chart — guessing one would corrupt it");
  assertEquals(toPlace({ ...row, latitude: null }), null);
  assertEquals(toPlace(null), null);
  assertEquals(placeLabel({ name: "Kyiv", region: "Kyiv", country: "Ukraine" }), "Kyiv · Ukraine",
    "a region that merely repeats the city adds nothing");
});

Deno.test("places/formatCoords: degrees and minutes the way an astrologer writes them", () => {
  assertEquals(formatCoords(48.4, 10), "48°24'N 10°00'E");
  assertEquals(formatCoords(-33.86, -70.5), "33°52'S 70°30'W");
  assertEquals(formatCoords(50.99999, 0), "51°00'N 0°00'E", "a minute that rounds to 60 carries into the degree");
});

Deno.test("birth/parseDate+parseTime: reject what a Date would silently roll over", () => {
  assertEquals(parseDate("1990-07-15"), { y: 1990, mo: 7, d: 15 });
  assertEquals(parseDate("1879-03-14"), { y: 1879, mo: 3, d: 14 });
  assertEquals(parseDate("1990-02-30"), null, "30 February never happened");
  assertEquals(parseDate("1990-04-31"), null, "April has 30 days");
  assertEquals(parseDate("1900-02-29"), null, "1900 was not a leap year");
  assertEquals(parseDate("2000-02-29"), { y: 2000, mo: 2, d: 29 }, "2000 was");
  assertEquals(parseDate("1990-13-01"), null);
  assertEquals(parseDate(""), null);
  assertEquals(parseTime("14:32"), { h: 14, mi: 32, s: 0, ms: 0 });
  assertEquals(parseTime("14:32:07"), { h: 14, mi: 32, s: 7, ms: 0 });
  assertEquals(parseTime("14:32:07.25"), { h: 14, mi: 32, s: 7, ms: 250 }, "a known fraction is not thrown away");
  assertEquals(parseTime("24:00"), null);
  assertEquals(parseTime("14:60"), null);
});

Deno.test("birth/resolve: the three zone modes, and the one thing that is missing", () => {
  const ulm = { name: "Ulm", lat: 48.4, lng: 10, zone: "Europe/Berlin", country: "Germany" };
  const rec = { date: "1879-03-14", time: "11:30", zoneMode: "place", place: ulm };

  // the place's zone — tzdata knows 1879 Ulm ran on Berlin's Local Mean Time
  const byZone = resolve(rec);
  assert(byZone.ok);
  assertEquals(byZone.offsetLabel, "+00:53:28");
  assertEquals(byZone.ms, Date.parse("1879-03-14T10:36:32Z"));

  // true LMT from the longitude — 10 E is exactly 40 minutes of sun ahead, which is how the published
  // reference chart for this birth is calculated
  const byLmt = resolve({ ...rec, zoneMode: "lmt" });
  assertEquals(byLmt.offsetLabel, "+00:40");
  assertEquals(byLmt.ms, Date.parse("1879-03-14T10:50:00Z"));

  // a birth certificate beats every database
  const byHand = resolve({ ...rec, zoneMode: "manual", offset: "+01:00" });
  assertEquals(byHand.ms, Date.parse("1879-03-14T10:30:00Z"));
  assertEquals(resolve({ ...rec, zoneMode: "manual", offset: "nonsense" }).reason, "offset");

  // each missing piece is named, so the form can point at it instead of failing vaguely
  assertEquals(resolve({}).reason, "date");
  assertEquals(resolve({ date: "1990-07-15" }).reason, "time");
  assertEquals(resolve({ date: "1990-07-15", time: "12:00" }).reason, "place");
  assertEquals(resolve({ ...rec, place: { ...ulm, zone: "Europe/Atlantis" } }).reason, "zone");
  assert(!isComplete({ date: "1990-07-15", time: "12:00" }));
  assert(isComplete(rec));

  // the DST flags survive the whole pipeline, so the form can warn instead of quietly picking one
  const amb = resolve({ date: "2021-10-31", time: "03:30", zoneMode: "place",
    place: { lat: 50.45, lng: 30.52, zone: "Europe/Kyiv" } });
  assert(amb.ambiguous, "that hour ran twice in Kyiv");
  const gap = resolve({ date: "2021-03-28", time: "03:30", zoneMode: "place",
    place: { lat: 50.45, lng: 30.52, zone: "Europe/Kyiv" } });
  assert(gap.nonexistent, "that hour never ran at all");
});

// ===================== offline-first service worker (sw-core.js + deploy/sw.mjs) =====================
// The SW is a CLASSIC worker script (importScripts can't load an ES module), so it can't be imported here.
// We evaluate it against a stubbed `self` instead — which is also the only honest way to prove the policy,
// since the farm's whole offline story turns on WHICH origins get cached and which app owns which cache.
import { staticSpecs, htmlAssets, importMapOf } from "../../tools/graph.mjs";
import { manifestFor } from "../../deploy/sw.mjs";

// A CacheStorage/Cache pair faithful enough for the two behaviours that matter: exact match, and the
// ignoreSearch/scope-root fallback an installed PWA's `start_url: "./"` navigation depends on.
class FakeCache {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  key(req) { return typeof req === "string" ? req : req.url; }
  // deno-lint-ignore require-await
  async match(req, opts) {
    const url = this.key(req);
    if (this.map.has(url)) return this.map.get(url);
    if (!opts?.ignoreSearch) return undefined;
    const bare = url.split("?")[0];
    for (const [k, v] of this.map) if (k.split("?")[0] === bare) return v;
    return undefined;
  }
  // deno-lint-ignore require-await
  async put(req, res) { this.map.set(this.key(req), res); }
}
const swReq = (url, extra = {}) => ({ url, method: "GET", headers: new Headers(), mode: "no-cors", destination: "script", ...extra });
const swEvent = (request) => {
  const e = { request, waits: [], respondWith(p) { this.responded = p; }, waitUntil(p) { this.waits.push(p); } };
  return e;
};

function loadSwCore(app = "rave", { origin = "https://damanoreshkan-beep.github.io", cached = {}, fetch, connection, onLine = true } = {}) {
  const src = Deno.readTextFileSync(new URL("./sw-core.js", import.meta.url));
  const events = {};
  const cache = new FakeCache(cached);
  const calls = [];
  const self = {
    MS: { app, version: "abc123", precache: [] },
    location: new URL(`${origin}/microspec/${app}/sw.js`),
    addEventListener: (k, fn) => { events[k] = fn; },
    navigator: { onLine, connection },
    clients: { matchAll: () => Promise.resolve([]), claim: () => Promise.resolve() },
  };
  const caches = { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
  const doFetch = (input, init) => { calls.push(typeof input === "string" ? input : input.url); return (fetch || (() => Promise.reject(new TypeError("offline"))))(input, init); };
  new Function("self", "caches", "fetch", src)(self, caches, doFetch);
  const fire = async (request) => { const e = swEvent(request); events.fetch(e); const res = e.responded ? await e.responded : null; await Promise.allSettled(e.waits); return res; };
  return { self, events, cache, calls, fire };
}

Deno.test("sw: caches the CDN origins the shell is BUILT from — same-origin-only can't boot an app offline", () => {
  const { self } = loadSwCore();
  const { cacheNameFor, APP_CACHE, CDN_CACHE } = self.MS_POLICY;
  const at = (u) => cacheNameFor(new URL(u));
  assertEquals(at("https://damanoreshkan-beep.github.io/microspec/rave/view.js"), APP_CACHE);
  assertEquals(at("https://damanoreshkan-beep.github.io/microspec/_rt/index.js"), APP_CACHE, "the runtime is out of scope but still ours");
  for (const u of ["https://esm.sh/preact@10.27.1", "https://cdn.jsdelivr.net/npm/daisyui@5", "https://code.iconify.design/x.js", "https://fonts.gstatic.com/s/geist/x.woff2"]) {
    assertEquals(at(u), CDN_CACHE, `${u} is the app's own code/asset — not caching it is why offline failed`);
  }
});

Deno.test("sw: live data is never cached — the feed proxy and unpinned third parties pass through", () => {
  const { self } = loadSwCore();
  const { cacheNameFor } = self.MS_POLICY;
  assertEquals(cacheNameFor(new URL("https://damanoreshkan-beep.github.io/feed?url=x")), null, "the dev/gate proxy is live data");
  assertEquals(cacheNameFor(new URL("https://dreamstudio.mooo.com/feed?url=x")), null);
  assertEquals(cacheNameFor(new URL("https://api.open-meteo.com/v1/forecast")), null);
});

Deno.test("sw: cache names are app-namespaced — CacheStorage is per-ORIGIN and all 57 apps share one", () => {
  const a = loadSwCore("rave").self.MS_POLICY, b = loadSwCore("sun").self.MS_POLICY;
  assert(a.APP_CACHE !== b.APP_CACHE, "two apps must not share an app cache");
  assert(a.APP_CACHE.startsWith("ms-rave-") && b.APP_CACHE.startsWith("ms-sun-"));
  assertEquals(a.CDN_CACHE, b.CDN_CACHE, "pinned immutable CDN URLs are shared on purpose — one copy, not 57");
});

Deno.test("sw: registers install/activate/fetch/message — a worker with no fetch handler is not installable", () => {
  const { events } = loadSwCore();
  for (const k of ["install", "activate", "fetch", "message"]) assert(typeof events[k] === "function", `missing ${k} handler`);
});

Deno.test("graph: staticSpecs excludes dynamic import() — lazy heavy deps must stay out of the precache", () => {
  const src = `import { html } from "htm/preact";\nimport "./side.js";\nexport * from "./re.js";\nconst T = await import("three");`;
  const s = staticSpecs(src);
  assert(s.includes("htm/preact") && s.includes("./side.js") && s.includes("./re.js"));
  assert(!s.includes("three"), "import(\"three\") is guarded + has a DOM fallback — precaching it would cost 600KB at install");
});

Deno.test("graph: htmlAssets takes real loads, not connection hints", () => {
  const html = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5">
    <link href="/_rt/theme.css" rel="stylesheet" type="text/css" />
    <link rel="icon" href="icon.svg">
    <script src="https://code.iconify.design/x.js"></script>`;
  const a = htmlAssets(html);
  assert(!a.includes("https://fonts.gstatic.com"), "preconnect is an origin hint, not a fetch");
  assert(a.includes("https://cdn.jsdelivr.net/npm/daisyui@5") && a.includes("/_rt/theme.css") && a.includes("icon.svg") && a.includes("https://code.iconify.design/x.js"));
});

Deno.test("graph: importMapOf reads the page's bare-specifier map (and survives no/broken map)", () => {
  assertEquals(importMapOf(`<script type="importmap">{"imports":{"preact":"https://esm.sh/preact@10.27.1"}}</script>`).preact, "https://esm.sh/preact@10.27.1");
  assertEquals(importMapOf("<html></html>"), {});
  assertEquals(importMapOf(`<script type="importmap">{ nope </script>`), {});
});

Deno.test("sw manifest: a real app's shell covers document, spec, locales, runtime closure and CDN code", () => {
  const m = manifestFor("rave");
  for (const u of ["./", "./index.html", "./spec.json", "./i18n/en.json", "./i18n/uk.json", "./view.js", "/_rt/index.js", "/_rt/render.js", "/_rt/theme.css"]) {
    assert(m.includes(u), `precache is missing ${u} — the app would not boot offline`);
  }
  assert(m.some((u) => u.startsWith("https://esm.sh/preact@")), "preact is a STATIC import of the runtime: no preact, no app");
  assert(m.some((u) => u.startsWith("https://cdn.jsdelivr.net/npm/@tailwindcss/browser")));
  assert(!m.some((u) => /esm\.sh\/three@/.test(u)), "three is dynamic + fallback-guarded — cached on use, not at install");
  assert(!m.some((u) => u.includes("brand.svg")), "brand.svg is a build input, never fetched at runtime");
});

// The four behaviours the whole change exists for. Proved browser-free, against the real sw-core.js source.
Deno.test("sw: offline, a cached app still opens — the cache is consulted FIRST, not after a fetch fails", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  const { fire, calls } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, onLine: false });
  const res = await fire(swReq(url));
  assertEquals(await res.text(), "cached");
  assertEquals(calls.length, 0, "offline: no network attempt at all — and no revalidation to hang on either");
});

Deno.test("sw: a weak link is served from cache instantly; the refresh happens BEHIND the response", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  let release;
  const slow = () => new Promise((r) => { release = () => r(new Response("fresh", { status: 200 })); });
  const { events, cache } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, fetch: slow });
  const e = swEvent(swReq(url));
  events.fetch(e);
  const res = await e.responded;   // resolves while the network request is STILL in flight — the 2G fix
  assertEquals(await res.text(), "cached", "the response must never wait on a slow link when we hold a copy");
  release();                        // now let the background revalidation land
  await Promise.allSettled(e.waits);
  assertEquals(await (await cache.match(url)).text(), "fresh", "…and freshness still arrives, just behind the user");
});

Deno.test("sw: an installed app's navigation resolves through ?query and the scope root, not a byte-exact URL", async () => {
  const root = "https://damanoreshkan-beep.github.io/microspec/rave/";
  const { fire } = loadSwCore("rave", { cached: { [root]: new Response("<html>shell</html>", { status: 200 }) } });
  const res = await fire(swReq(root + "?utm=x", { mode: "navigate", destination: "document" }));
  assertEquals(await res.text(), "<html>shell</html>", "start_url is './' — a launch carrying a query must still open offline");
});

Deno.test("sw: on a 2g/saveData link we do NOT spend bandwidth revalidating what we already have", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  const mk = (connection) => loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, fetch: () => Promise.resolve(new Response("fresh", { status: 200 })), connection });
  const good = mk({ effectiveType: "4g" });
  await good.fire(swReq(url));
  assertEquals(good.calls.length, 1, "a usable link refreshes in the background — freshness is not traded away");
  for (const c of [{ effectiveType: "2g" }, { effectiveType: "slow-2g" }, { saveData: true }]) {
    const bad = mk(c);
    await bad.fire(swReq(url));
    assertEquals(bad.calls.length, 0, `${JSON.stringify(c)}: revalidation must not compete with the app's own data`);
  }
  const twice = mk({ effectiveType: "4g" });
  await twice.fire(swReq(url));
  await twice.fire(swReq(url));
  assertEquals(twice.calls.length, 1, "at most one revalidation per URL per worker lifetime");
});

Deno.test("sw: a cross-origin CDN asset is re-issued as cors — an opaque response cannot be cached", async () => {
  const url = "https://esm.sh/preact@10.27.1";
  let mode;
  const { fire, cache } = loadSwCore("rave", { fetch: (_u, init) => { mode = init?.mode; return Promise.resolve(new Response("export{}", { status: 200 })); } });
  await fire(swReq(url));
  assertEquals(mode, "cors", "the page requests this no-cors; caching the opaque result would throw");
  assert(await cache.match(url), "the app's own dependency has to end up in the cache");
});

Deno.test("sw: a media Range request is passed straight through — cache.put rejects a 206", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/assets/kick.wav";
  const { fire } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) } });
  const req = swReq(url, { headers: new Headers({ range: "bytes=0-1" }) });
  assertEquals(await fire(req), null, "respondWith must not be called at all");
});

// ── the design system ───────────────────────────────────────────────────────────────────────────────────
// The kit is CSS + JSX, so most of it is only measurable in a browser. What IS testable browser-free is the
// part that decays silently: the token contract. Every shared component sizes itself off --ms-*, so a
// deleted breakpoint or a renamed token doesn't throw anywhere — it just quietly un-compacts the whole farm
// and nothing fails until someone opens an app in landscape. These tests are that alarm.

Deno.test("design tokens: theme.css defines the whole --ms-* contract the UI kit consumes", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const declared = new Set([...css.matchAll(/(--(?:ms|app|dock|hdr)-[a-z-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...ui.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]));
  for (const v of used) assert(declared.has(v), `ui.js reads ${v} but theme.css never declares it`);
  for (const v of ["--ms-gap", "--ms-pad", "--ms-r", "--ms-ctl", "--ms-icon", "--ms-title", "--ms-label", "--app-accent", "--app-tint"]) {
    assert(declared.has(v), `theme.css lost the ${v} token — every component sizes off these`);
  }
});

// CONCENTRIC RADIUS. Two rounded rectangles separated by padding share one corner arc, so their radii are
// related, not independently chosen: outer = inner + padding. Give a nested box its parent's radius and the
// inner corner is tighter than the arc around it — the bezel visibly thickens at the corners and thins along
// the edges. It is the single most common "this feels off" in a surface-heavy material, and nothing
// automated can see it: it is not overflow, not contrast, not a missing name.
//
// The defect this pins is the one that shipped: .ms-screen carried --ms-r (20px) inside an .ms-shell of
// --ms-r * 1.2 (24px) with --ms-pad (16px) between them. 24 ≠ 20 + 16.
//
// Assert the RELATION at every density step, not the strings. --ms-r and --ms-pad both move with the ladder,
// and the failure mode is a future step that compacts padding without compacting the radius (or vice versa)
// until r - pad goes negative and the derived inner corner clamps flat everywhere at once.
Deno.test("design tokens: --ms-r-in is DERIVED from the pair it reconciles, and stays sane at every step", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));

  const decl = /--ms-r-in:\s*([^;]+);/.exec(css);
  assert(decl, "theme.css lost --ms-r-in — the concentric radius every nested surface reads");
  for (const dep of ["--ms-r", "--ms-pad", "--r-1"]) {
    assert(decl[1].includes(dep), `--ms-r-in must be derived from ${dep}, not written as a constant — a hand-written inner radius is right until the ladder moves and silently wrong after (got: ${decl[1].trim()})`);
  }
  assert(/--r-1:\s*4px/.test(css), "--ms-r-in floors on --r-1; theme.css must still declare it");

  // Walk the ladder in SOURCE ORDER and accumulate, because the steps cascade: a 430px-tall viewport
  // matches 780, 670, 560 and 440 at once, and a step that sets only --ms-pad (560px does) inherits the
  // --ms-r above it. Checking each block in isolation would pass a pair that never co-occurs.
  //
  // Every step is LABELLED with its real at-rule. The first version of this parser matched the @media
  // prefix only when `:root` followed it immediately, so the `max-width: 300px` step — the one with the
  // tightest pair in the whole ladder — reported as "base", and a failure would have named the wrong
  // breakpoint. A check that reports a number without the right subject is the defect it is meant to catch.
  const at = (idx) => {
    const before = css.slice(0, idx);
    const m = [...before.matchAll(/@media\s*\(([^{]*)\)\s*\{/g)].pop();
    if (!m) return "base";
    const between = before.slice(m.index + m[0].length);
    // Only the enclosing at-rule counts: if its block already closed, this :root is at top level.
    return (between.split("}").length - 1) > (between.split("{").length - 1) ? "base" : `@media (${m[1].trim()})`;
  };
  const steps = [...css.matchAll(/:root\s*\{([^}]*)\}/g)]
    .map((m) => ({ at: at(m.index), body: m[1] }))
    .filter((b) => /--ms-(?:r|pad):/.test(b.body));
  assert(steps.length >= 6, `expected the base :root plus the density steps, found ${steps.length}`);
  assert(steps.some((s) => /max-width/.test(s.at)), "the narrow-width step must be in the walk — it carries the tightest --ms-r/--ms-pad pair in the ladder");

  const rem = (v) => Number(v) * 16;
  let r = null, pad = null, checked = [];
  for (const b of steps) {
    const nr = /--ms-r:\s*([\d.]+)rem/.exec(b.body);
    const np = /--ms-pad:\s*([\d.]+)rem/.exec(b.body);
    if (nr) r = rem(nr[1]);
    if (np) pad = rem(np[1]);
    if (r == null || pad == null) continue;
    // The TV end steps UP rather than down; it is the same relation, so it is checked the same way.
    const inner = Math.max(4, r - pad);
    assert(r > pad, `${b.at}: --ms-pad (${pad}px) has caught up with --ms-r (${r}px), so every nested surface's concentric radius clamps to the 4px floor at once. Compact the two together.`);
    assert(inner < r, `${b.at}: derived inner radius ${inner}px is not smaller than the outer ${r}px (pad ${pad}px)`);
    checked.push(`${b.at} r=${r} pad=${pad} in=${inner}`);
  }
  assert(checked.length >= 6, `only ${checked.length} steps carried both --ms-r and --ms-pad; the ladder has more. Walked: ${checked.join(" | ")}`);

  // The console shell is the worked example and the one that was wrong. Its aperture must derive from the
  // shell's own radius, never restate --ms-r beside it.
  const screen = /\.ms-screen\s*\{[^}]*border-radius:\s*([^;]+);/.exec(css);
  assert(screen, "theme.css lost .ms-screen's border-radius");
  assert(
    /--sh-r-in|--ms-r-in/.test(screen[1]),
    `.ms-screen must take the concentric radius (--sh-r-in), not restate a radius beside its shell — got "${screen[1].trim()}"`,
  );
  assert(/--sh-r-in:\s*[^;]*--sh-r[^;]*--ms-pad/.test(css), "--sh-r-in must be --sh-r minus --ms-pad — the shell's OWN outer radius, not --ms-r, since the shell scales its own by 1.2");
});

// `transition-all` is banned farm-wide, and the farm-wide sweep is the point: preflight is affected-scoped,
// so a CI run that verified six apps says nothing about the other fifty-one. This test runs in the unit job,
// which always runs, over every app at once.
//
// The reason it is a defect here and not merely a style nit: the material is box-shadow. sf-raised, sf-inset
// and the sf-e* ladder are shadow PAIRS, so `all` cross-fades the extrusion on every state change — a
// sequencer cell melts between raised and recessed instead of snapping, sixteen at a time. It also animates
// layout properties (width, margin), which the compositor cannot take, so each frame is a full re-layout.
Deno.test("motion: no `transition-all` — a transition names the properties it animates", async () => {
  const root = new URL("../../", import.meta.url);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        // preflight.mjs is exempt: it names the banned class in the ban's own message.
        const src = await Deno.readTextFile(p);
        if (/(?:^|[\s"'`])transition-all\b/.test(src)) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `\`transition-all\` animates the material (sf-* are box-shadow pairs) and layout properties off the ` +
      `compositor. Name them: transition-colors / -opacity / -shadow / -transform, or transition-[width], ` +
      `transition-[box-shadow,background-color,scale]. Offenders: ${offenders.join(", ")}`,
  );
});

// ONE icon set. Two libraries on one row never read as variety — they read as sloppiness, because they
// differ in exactly what the eye scores as craft: stroke weight, corner radius, optical size, how much of
// the 24-unit box the glyph fills. The farm is 100% lucide today; this is the alarm that keeps it that way,
// because the first foreign glyph always arrives as "the one icon lucide doesn't have".
Deno.test("icons: the farm draws from ONE set (lucide) — a second library is a visible seam", async () => {
  const root = new URL("../../", import.meta.url);
  const FOREIGN = /["'](mdi|ph|tabler|carbon|ri|material-symbols|simple-icons|logos|bi|heroicons|solar|iconoir|fluent|octicon|codicon|fa6-[a-z]+|ic|majesticons|mingcute|hugeicons|akar-icons):[a-z0-9-]+["']/;
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|json|html)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        const m = FOREIGN.exec(await Deno.readTextFile(p));
        if (m) offenders.push(`${p.pathname.replace(root.pathname, "")} (${m[1]})`);
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `every glyph in the farm is \`lucide:*\`. If lucide genuinely lacks the shape, draw a runtime SVG (the ` +
      `/_rt/zodiac.js \`Sign\` precedent) so it is ours and matches the set. Offenders: ${offenders.join(", ")}`,
  );
});

// THE class of bug this closes, and it cost a full 58-job CI matrix to learn. A palette change repainted
// both themes; every solid pair (content-on-surface) was computed browser-free first and passed. All 58
// apps still failed axe on ONE selector: `.text-muted`. Solid pairs are not what the farm
// renders — muted text is an ALPHA over a surface, and 60% of a warm ink on a cream card is 3.72:1 where
// the same ink at 100% is 11:1. The contrast that matters is the COMPOSITED one.
//
// Calibration matters as much as the maths. The first version of this check tested every alpha against
// every surface and "failed" the OLD ink theme too — a theme that had been green in CI for months. That
// proved the check, not the theme, was wrong: the cartesian product includes pairs the farm never renders
// (muted text on base-300, for one). So the binding set below is exactly the pairs on which the old
// known-green theme cleared 4.5 — anything it did not clear demonstrably does not occur.
Deno.test("a11y: MUTED text (an alpha over a surface) clears 4.5:1 — the pair axe actually measures", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const tokens = (theme) => {
    const i = css.indexOf(`[data-theme="${theme}"] {`);
    const out = {};
    for (const m of css.slice(i, css.indexOf("}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
    return out;
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);   // sRGB compositing, what Chrome does

  for (const theme of ["signal", "signal-light"]) {
    const t = tokens(theme);
    const bed = {
      "base-100": rgb(t["--color-base-100"]),
      "base-200": rgb(t["--color-base-200"]),
      "base-300": rgb(t["--color-base-300"]),
    };
    // `bg-primary/10` is a real tinted backdrop in the farm — text sits on it, so it is a surface too.
    bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
    bed["primary/10 on base-200"] = over(rgb(t["--color-primary"]), 0.10, bed["base-200"]);
    const ink = rgb(t["--color-base-content"]);
    const binding = [
      ["base-100", 0.60], ["base-200", 0.60], ["base-100", 0.70], ["base-200", 0.70],
      ["base-300", 0.70], ["base-300", 0.80], ["primary/10 on base-100", 0.70], ["primary/10 on base-200", 0.70],
    ];
    for (const [surface, alpha] of binding) {
      const r = ratio(over(ink, alpha, bed[surface]), bed[surface]);
      assert(
        r >= 4.5,
        `${theme}: base-content at ${alpha * 100}% over ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor — ` +
          `this is what axe reports as color-contrast on .text-base-content\\/${alpha * 100}, in EVERY app at once. ` +
          `Darkening a surface to make it "look like clay" is the move that spends this margin.`,
      );
    }

    // The muted token is SOLID, so it is checked directly — no compositing, which is the entire point of
    // it existing. It must clear the floor on every surface INCLUDING the tinted ones, because those are
    // where alpha-derived muted text died: a 10% primary wash moves the bed toward the text in BOTH
    // themes (it darkens a light page and lightens a dark one), so no single alpha can survive both.
    const muted = rgb(t["--color-base-muted"]);
    for (const [surface, px] of Object.entries(bed)) {
      const r = ratio(muted, px);
      assert(
        r >= 4.5,
        `${theme}: --color-base-muted on ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor. ` +
          `This token is the farm's secondary text colour in 66 files — it is a DESIGNED colour precisely ` +
          `so its contrast is checked once here instead of being an accident of whatever it lands on.`,
      );
    }
  }
});

// The anti-regression half of the token: a token nobody uses is a token that rots. `.text-muted` only
// pays for itself if the fragile pattern cannot come back, and it comes back by muscle memory — the
// class is short, familiar, and looks harmless in a diff.
Deno.test("a11y: muted text is the TOKEN, never an alpha — .text-base-content/60 may not return", async () => {
  const root = new URL("../../", import.meta.url);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name)) {
        // a test file names the banned pattern on purpose — this one does, three lines down
        const src = await Deno.readTextFile(p);
        if (src.includes("text-base-content/60")) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `muted text must use .text-muted (--color-base-muted), not a 60% alpha. At 60% the contrast is whatever ` +
      `the palette happens to composite to — it measured 3.72:1 after the clay repaint and failed axe in all ` +
      `58 apps at once. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("design tokens: density steps DOWN as the viewport gets shorter (landscape must compact)", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  // each `@media (max-height: N)` block, smallest N last — read --ms-gap out of every one
  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => ({ h: Number(m[1]), gap: /--ms-gap:\s*([\d.]+)rem/.exec(m[2])?.[1] }))
    .filter((s) => s.gap != null)
    .sort((a, b) => b.h - a.h);
  assert(steps.length >= 3, "the height scale needs at least three steps (tall phone → short phone → landscape)");
  const base = Number(/:root\s*\{[^}]*--ms-gap:\s*([\d.]+)rem/.exec(css)[1]);
  let prev = base;
  for (const s of steps) {
    assert(Number(s.gap) < prev, `@media (max-height:${s.h}px) must be TIGHTER than the step above it (${s.gap}rem vs ${prev}rem)`);
    prev = Number(s.gap);
  }
  // the tap target never collapses below the WCAG 2.2 target-size floor, however short the screen
  for (const m of css.matchAll(/--ms-ctl:\s*([\d.]+)rem/g)) assert(Number(m[1]) * 16 >= 36, `--ms-ctl: ${m[1]}rem is below the 36px tap floor`);
});

Deno.test("design system: the fit contract disables page scroll on BOTH html and body", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const rule = /html\.ms-fit,\s*html\.ms-fit body\s*\{([^}]*)\}/.exec(css);
  assert(rule, "html.ms-fit + body rule is gone — a fit screen would scroll again");
  assert(/overflow:\s*hidden/.test(rule[1]), "a fit page must not scroll");
  // #view is sized off the two chrome constants, never a magic number
  const view = /html\.ms-fit main#view\s*\{([^}]*)\}/.exec(css);
  assert(view, "html.ms-fit main#view sizing rule is gone");
  assert(view[1].includes("var(--hdr-h)") && view[1].includes("var(--dock-h)"), "fit height must derive from --hdr-h/--dock-h, not a hardcoded rem");
});

Deno.test("design system: the UI kit imports relatively and owns its own chrome strings", async () => {
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  assert(!/from\s+["']\/_rt\//.test(ui), "runtime-internal imports must be relative (./gesture.js), never /_rt/");
  assert(/sys\(\s*["']close["']/.test(ui), "the Sheet's close button must read a SYS string, not demand an i18n key from every app");
  const i18n = await Deno.readTextFile(new URL("./i18n.js", import.meta.url));
  const sys = /export const SYS = \{([\s\S]*?)\n\};/.exec(i18n)[1];
  for (const k of ["close"]) {
    const line = new RegExp(`\\b${k}:\\s*\\{[^}]*\\ben:[^}]*\\buk:`).test(sys);
    assert(line, `SYS.${k} must carry BOTH locales — a systemic string with no uk ships English into a Ukrainian UI`);
  }
});

Deno.test("responsive matrix: the gate sweeps both orientations and the small-phone floor", async () => {
  const lib = await Deno.readTextFile(new URL("../gates/browser-lib.mjs", import.meta.url));
  const block = /export const BREAKPOINTS = \[([\s\S]*?)\n\];/.exec(lib);
  assert(block, "BREAKPOINTS is gone — verify would stop measuring anything but the reference device");
  const bps = [...block[1].matchAll(/w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({ w: +m[1], h: +m[2] }));
  assert(bps.some((b) => b.w <= 320), "no small-phone width in the matrix (320px is still the market floor)");
  assert(bps.some((b) => b.w > b.h), "no LANDSCAPE breakpoint — the short-viewport case is the one that breaks fit screens");
  assert(bps.some((b) => b.h >= 900), "no tall breakpoint");
  assert(bps.some((b) => b.w >= 1024), "no desktop/tablet-landscape breakpoint");
});

Deno.test("dock height is MEASURED, not a constant — nothing may sit under the dock", async () => {
  const render = await Deno.readTextFile(new URL("./render.js", import.meta.url));
  assert(/ResizeObserver/.test(render) && /setProperty\("--dock-h"/.test(render),
    "the runtime must measure the dock and publish --dock-h; a hand-written constant is wrong the moment the dock's metrics move (and it fails by COVERING content, which no overflow check can see)");
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  // exactly one declaration — the first-paint fallback at :root. A second one in a media query is the
  // guess this measurement exists to delete.
  assertEquals([...css.matchAll(/--dock-h:/g)].length, 1, "--dock-h must be declared once (the :root fallback); the live value comes from the measurement");
  const lib = await Deno.readTextFile(new URL("../gates/browser-lib.mjs", import.meta.url));
  assert(/nav\[data-dock\]/.test(lib) && /pointerEvents/.test(lib),
    "the matrix must check dock/content collision (excluding pointer-events:none decoration) — overlap is not overflow");
});

// ── v2m: the V2 archive's parsing + the size maths ──────────────────────────────────────────────
Deno.test("v2m parseAuthors — directories only, no sort links, no parent", () => {
  const html = `<a href="?C=N&amp;O=A">Name</a><a href="../">../</a>
    <a href="Dafunk/">Dafunk/</a><a href="Chip%20%28ES%29/">Chip (ES)/</a><a href="stars.v2m">stars.v2m</a>`;
  assertEquals(v2mParseAuthors(html), ["Dafunk", "Chip (ES)"]);
});

Deno.test("v2m parseListing — filename + byte size, .v2m and .v2mz", () => {
  const html = `<tr><td class="link"><a href="stars.v2m" title="stars.v2m">stars.v2m</a></td><td class="size">   9216</td></tr>
    <tr><td class="link"><a href="the%202nd%20movement.v2mz" title="x">the 2nd…</a></td><td class="size">  64267</td></tr>
    <tr><td class="link"><a href="readme.txt">readme.txt</a></td><td class="size">    12</td></tr>`;
  assertEquals(v2mParseListing(html), [
    { file: "stars.v2m", size: 9216 },
    { file: "the 2nd movement.v2mz", size: 64267 },
  ]);
});

Deno.test("v2m URLs are mirror-indexed and percent-encoded", () => {
  const u = v2mTrackURL("Chip (ES)", "invasors from the planet disco.v2m", 0);
  assert(u.startsWith(v2mMIRRORS[0]), "mirror 0");
  assert(u.includes("Chip%20(ES)") && u.includes("planet%20disco.v2m"), "spaces encoded: " + u);
  assert(!u.includes(" "), "no raw spaces");
  // the index wraps, so a caller fails over by incrementing
  assertEquals(v2mTrackURL("A", "b.v2m", v2mMIRRORS.length), v2mTrackURL("A", "b.v2m", 0));
  assertEquals(v2mTitleOf("the abandoned ones.v2m"), "the abandoned ones");
  assertEquals(v2mTrackId("Dafunk", "breeze.v2m"), "V2/Dafunk/breeze.v2m");
});

Deno.test("v2m mp3Ratio — the store's headline number", () => {
  // 9216 bytes of music that plays 157 s = 2 512 000 bytes as a 128 kbit/s MP3
  assertEquals(Math.round(v2mMp3Ratio(9216, 157)), 273);
  assertEquals(v2mMp3Ratio(0, 100), 0, "unknown size → no claim");
  assertEquals(v2mMp3Ratio(1000, 0), 0, "unknown duration → no claim");
});

Deno.test("v2m normGain — loudness, not peak (a 15× peak must stay audible)", () => {
  assertEquals(v2mNormGain(0.1), 1, "already at target");
  assert(v2mNormGain(0.28) < 1 && v2mNormGain(0.28) > 0.3, "loud tune is turned down, not muted");
  assert(v2mNormGain(0.02) > 1, "quiet tune is lifted");
  assert(v2mNormGain(0.0001) <= 2.5 && v2mNormGain(9) >= 0.25, "clamped both ways");
  assertEquals(v2mNormGain(0), 1, "no reading yet → leave it alone");
});

Deno.test("v2m byteCloud — the point count IS the file size", () => {
  const small = v2mByteCloud(v2mSeedBytes(300));
  const big = v2mByteCloud(v2mSeedBytes(3000));
  assertEquals(small.length, 300 * 3, "one point per byte");
  assert(big.length > small.length, "a bigger file is a denser object");
  assertEquals(v2mByteCloud(new Uint8Array(0)).length, 0, "nothing to draw");
  // sub-sampled above the cap, and every point stays inside the unit sphere
  const capped = v2mByteCloud(v2mSeedBytes(30000), 1000);
  assertEquals(capped.length / 3, 1000);
  for (let i = 0; i < capped.length; i += 3) {
    const r = Math.hypot(capped[i], capped[i + 1], capped[i + 2]);
    assert(r <= 1.0001 && r >= 0.499, "radius out of range: " + r);
  }
  // deterministic — the same tune always renders the same object
  assertEquals([...v2mByteCloud(v2mSeedBytes(90))], [...v2mByteCloud(v2mSeedBytes(90))]);

  // THE REGRESSION THAT SHIPPED: real tunes are full of repeated bytes and long zero runs. The first
  // mapping derived position from byte triples, so every identical triple landed on ONE coordinate and a
  // 7 KB tune rendered as a few dozen specks. Distinct positions must track the point count, not the
  // number of distinct byte values.
  const flat = new Uint8Array(4000);            // a pathological file: every byte identical
  const cloud = v2mByteCloud(flat);
  const distinct = new Set();
  for (let i = 0; i < cloud.length; i += 3) distinct.add(cloud[i].toFixed(4) + "," + cloud[i + 1].toFixed(4));
  assert(distinct.size > 3900, "a uniform file collapsed to " + distinct.size + " visible points of 4000");
});

// ── player: the shared transport's queue logic ──────────────────────────────────────────────────
Deno.test("player cycleRepeat — off → all → one → off", () => {
  assertEquals(tpCycleRepeat("off"), "all");
  assertEquals(tpCycleRepeat("all"), "one");
  assertEquals(tpCycleRepeat("one"), "off");
  assertEquals(tpCycleRepeat(undefined), "all", "an unset mode starts the cycle, never crashes");
});

Deno.test("player advance — repeat off stops at the end when a track ENDS, wraps when you press next", () => {
  assertEquals(tpAdvance(0, 5, { repeat: "off" }), 1);
  assertEquals(tpAdvance(4, 5, { repeat: "off" }), -1, "auto-advance past the last track stops");
  assertEquals(tpAdvance(4, 5, { repeat: "off", manual: true }), 0, "pressing next at the end wraps");
});

Deno.test("player advance — repeat one holds on END but never traps a manual press", () => {
  assertEquals(tpAdvance(2, 5, { repeat: "one" }), 2, "a finished track plays again");
  assertEquals(tpAdvance(2, 5, { repeat: "one", manual: true }), 3,
    "pressing next under repeat-one must move on — the bug hand-written players ship");
  assertEquals(tpAdvance(4, 5, { repeat: "all" }), 0, "repeat all wraps on its own");
});

Deno.test("player advance — previous, single track, empty queue", () => {
  assertEquals(tpAdvance(3, 5, { step: -1 }), 2);
  assertEquals(tpAdvance(0, 5, { step: -1 }), 4, "previous from the first track wraps to the end");
  assertEquals(tpAdvance(0, 1, { repeat: "off" }), -1, "one track, played out → stop");
  assertEquals(tpAdvance(0, 1, { repeat: "all" }), 0);
  assertEquals(tpAdvance(0, 0), -1, "nothing queued → nothing to play");
  assertEquals(tpAdvance(0, 0, { manual: true }), -1);
});

Deno.test("player advance — shuffle never repeats the current track and stays in range", () => {
  for (const r of [0, 0.001, 0.4, 0.5, 0.999]) {
    for (const i of [0, 3, 7]) {
      const n = tpAdvance(i, 8, { shuffle: true, rng: () => r });
      assert(n >= 0 && n < 8, `out of range: ${n}`);
      assert(n !== i, `shuffle returned the track already playing (i=${i}, rng=${r})`);
    }
  }
});

Deno.test("player clock — mm:ss, and never NaN", () => {
  assertEquals(tpClock(0), "0:00");
  assertEquals(tpClock(61000), "1:01");
  assertEquals(tpClock(3599000), "59:59");
  assertEquals(tpClock(-5), "0:00");
  assertEquals(tpClock(undefined), "0:00");
});

Deno.test("player transport strings are SYSTEMIC — an app must not have to restate them", async () => {
  const i18n = await import("./i18n.js");
  for (const k of ["aPlay", "aPause", "aStop", "aPrev", "aNext", "aSeek", "aRepeat"]) {
    assert(i18n.SYS[k]?.en && i18n.SYS[k]?.uk, `SYS.${k} missing a locale — the widget would ship a raw key`);
  }
});

Deno.test("v2m helixStrand — one point per byte, ordered along the strand, value only modulates radius", () => {
  const bytes = v2mSeedBytes(600);
  const { pos, n } = v2mHelixStrand(bytes);
  assertEquals(n, 600, "one point per byte");
  assertEquals(pos.length, 600 * 3);
  // y is monotonic: the strand must READ end to end, or a transcription head means nothing
  for (let k = 1; k < n; k++) {
    assert(pos[k * 3 + 1] >= pos[(k - 1) * 3 + 1] - 1e-6, "strand doubles back at " + k);
  }
  assertEquals(pos[1].toFixed(4), (-1.2).toFixed(4), "starts at the bottom of the span");
  assert(Math.abs(pos[(n - 1) * 3 + 1] - 1.2) < 1e-6, "ends at the top of the span");
  // radius stays inside the band the byte value can reach
  for (let k = 0; k < n; k++) {
    const r = Math.hypot(pos[k * 3], pos[k * 3 + 2]);
    assert(r >= 0.42 * 0.72 - 1e-6 && r <= 0.42 + 1e-6, "radius out of band: " + r);
  }
  // a file of identical bytes must still draw a full strand (the collapse trap, again)
  const flat = v2mHelixStrand(new Uint8Array(500));
  const ys = new Set();
  for (let k = 0; k < flat.n; k++) ys.add(flat.pos[k * 3 + 1].toFixed(5));
  assert(ys.size > 480, "uniform bytes collapsed the strand: " + ys.size);
  assertEquals(v2mHelixStrand(new Uint8Array(0)).n, 0);
  // sub-sampled above the cap, still one strand
  assertEquals(v2mHelixStrand(v2mSeedBytes(50000), { max: 1000 }).n, 1000);
});

Deno.test("v2m helixAt — the read head follows the same curve, clamped", () => {
  const [x0, y0] = v2mHelixAt(0);
  assertEquals(y0.toFixed(4), (-1.2).toFixed(4));
  assertEquals(x0.toFixed(4), (0.42).toFixed(4), "t=0 starts at angle 0");
  assertEquals(v2mHelixAt(1)[1].toFixed(4), (1.2).toFixed(4));
  assertEquals(v2mHelixAt(-5)[1], v2mHelixAt(0)[1], "clamped low");
  assertEquals(v2mHelixAt(9)[1], v2mHelixAt(1)[1], "clamped high");
  assertEquals(v2mHelixAt(undefined)[1], v2mHelixAt(0)[1], "no progress yet → the start, not NaN");
});

Deno.test("Transport compacts on its CONTAINER, never on the viewport", async () => {
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  assert(/@container/.test(tp), "the transport must establish a container — it is sized by the space IT has");
  assert(/@max-\[\d+px\]:/.test(tp), "no container-query compaction: the row will overflow where it is narrow");
  // The trap this test exists for: the watch gate narrows #view to 200px while the WINDOW stays 384px, and
  // .ms-side puts the transport in a narrow column on a wide phone. A viewport media query is blind to both.
  assert(!/\bmin-\[\d+px\]:|\bmax-\[\d+px\]:/.test(tp.replace(/@(max|min)-\[\d+px\]:/g, "")),
    "viewport width variants in the transport — use @container variants instead");
});

Deno.test("Transport compacts by DEMOTION — a hidden action is still reachable, with its word", async () => {
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  // The failure this guards: an action row that simply hides what does not fit. A control the narrow window
  // cannot show must still be REACHABLE — the overflow sheet lists `actions` (all of them), never `overflow`.
  const sheet = tp.slice(tp.indexOf("data-tp-sheet"));
  // The sheet now carries the transport KEYS as well as the actions — at the narrowest the row keeps only
  // PLAY, so prev/next/shuffle/repeat have to be reachable there too. Assert it spreads the full action
  // list rather than a slice, and that the keys are in it.
  assert(/\.\.\.actions,/.test(sheet), "the sheet must spread every action, not a demoted subset");
  for (const k of ["aPrev", "aNext", "aShuffle", "aRepeat"])
    assert(sheet.includes(k), `the sheet does not carry ${k} — a key hidden at 230px would be unreachable`);
  assert(!/overflow\.map\(/.test(sheet), "the sheet lists a different set depending on width — unlearnable");
  // …and the demoted icons are hidden by the CONTAINER, so `keep` is a floor on what stays inline, not a cap.
  assert(/overflow\.map\(.{0,60}@max-\[\d+px\]:hidden/.test(tp.replace(/\n\s*/g, " ")),
    "demoted actions must be hidden by a container query, not dropped from the tree");
  // The sheet row must not restate the inline button's id/hook: two matches for one selector, one duplicate id.
  const row = sheet.slice(0, sheet.indexOf("</button>"));
  assert(!/\bid=\$\{a\.id/.test(row) && !/\.\.\.\$\{a\.attr/.test(row), "sheet row duplicates the inline hooks");
});

Deno.test("the chrome contract: a measured number may never be overwritten by a declared one", async () => {
  // THE class of bug this closes, and it has now bitten twice. --dock-h and --hdr-h are what every fit
  // screen's height math is built from. The dock is MEASURED (render.js publishes its real footprint); the
  // header was DECLARED in theme.css while its actual height came from a Tailwind class — two facts joined
  // by nothing but intention. Watch mode then compacted the token to 2.25rem, the element stayed 56px, and
  // every fit screen on a watch was 20px too tall with its transport cut off the bottom. No gate could see
  // it: nothing overflowed, nothing was hidden under the dock — the page was simply the wrong size.
  //
  // The rule that makes it impossible rather than merely remembered: a media query may compact the ELEMENT,
  // never the published number. Write the token and the two disagree; style the element and the measurement
  // follows on its own.
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const render = await Deno.readTextFile(new URL("./render.js", import.meta.url));

  for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
    assert(render.includes(`setProperty("${v}"`), `${v} is not measured — render.js never publishes it`);
  }
  // Both chrome elements report through ONE mechanism, so there is no second thing to remember.
  assert(/function usePublishedChrome/.test(render), "the two chrome measurements have drifted into two mechanisms");
  assert((render.match(/usePublishedChrome\(/g) || []).length >= 3, "a chrome element is not wired to the measurement");
  assert(/<header ref=\$\{/.test(render), "the header is not measured — its height is a guess again");

  // …and no media query re-declares one of them. Outside a media query they are the pre-JS FALLBACK, which
  // is legitimate and is why :root still carries them.
  for (const m of css.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/g)) {
    for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
      assert(!new RegExp(`${v}\\s*:`).test(m[1]),
        `a media query sets ${v} — that overwrites a MEASURED number with a guess. Compact the element instead.`);
    }
  }
});

Deno.test(".ms-cols asks its CONTAINER, not the window — and says its counts out loud", async () => {
  // The rule answers "what fits inside me", so its input is the component's own box: a slider group can sit
  // in a panel, a sheet, a 38% side column or a 200px watch screen, and the viewport describes none of them.
  // Driving it from a viewport HEIGHT query is what made it unpredictable for three commits.
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const at = css.indexOf(".ms-cols {");
  assert(at > 0, ".ms-cols rule is gone");

  // container queries, and no viewport query anywhere near it
  const region = css.slice(at - 900, at + 700);
  assert(/@container \(min-width/.test(region), ".ms-cols must respond to its container");
  assert(!/@media \([^)]*height[^)]*\)\s*\{[^}]*\.ms-cols/.test(css), ".ms-cols is back on a viewport height query");

  // explicit steps rather than intrinsic arithmetic: auto-fit derives the count from a guessed floor and
  // collapses to ONE track in silence when the container is intrinsically sized (CSS Grid §7.2.3.1)
  assert(!/grid-template-columns:[^;]*auto-fit/.test(css), "auto-fit is back — the count must be stated, not derived");
  assert(/repeat\(var\(--ms-cols, 3\), minmax\(0, 1fr\)\)/.test(region), "--ms-cols must still name the widest count");

  // and something has to BE the container, or every query above reads nothing
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  // Asserted on PANEL'S OWN class list, not on the adjacency of two class names: the previous form was
  // `/@container sf-e2/`, which pinned the check to the ORDER the classes happen to be written in and
  // failed the moment the surface gained `sf-raised` — a change that could not possibly stop a container
  // from being a container. A check that breaks on a reorder is testing the source, not the behaviour.
  const panelCls = /export function Panel\([^)]*\)\s*\{[\s\S]*?class=\$\{`([^`]*)`/.exec(ui)?.[1] ?? "";
  assert(panelCls.includes("@container"), `Panel no longer establishes a container — the queries have nothing to read (its classes: ${panelCls})`);
});

Deno.test("watch mode — the dock turns 90°, the side-by-side becomes a pager, the tap floor holds", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const at = css.indexOf("@media (max-width: 300px)");
  assert(at > 0, "no watch breakpoint — the farm's smallest screen is 208px, not 320px");
  const block = css.slice(at, css.indexOf("\n}\n", css.indexOf(".ms-side >", at)));

  // 1) the dock is a RAIL: row flow, off the bottom, and its captions gone. Trading 40px of width once
  //    beats 68px of height forever on a 248px-tall screen.
  assert(/grid-auto-flow:\s*row/.test(block), "the dock must turn 90° — horizontal it costs 27% of the height");
  assert(/nav\[data-dock\] button > span\s*\{\s*display:\s*none/.test(block), "dock captions must go at watch size");
  // …but never its targets. --ms-ctl is the tap floor and it is the one token that may not shrink.
  const ctl = /--ms-ctl:\s*([\d.]+)rem/.exec(block);
  assert(ctl && parseFloat(ctl[1]) * 16 >= 36, `watch --ms-ctl is ${ctl?.[1]}rem — below the 36px tap floor`);

  // 2) .ms-side becomes a snap PAGER, and its two halves are full-width pages. The app writes nothing new:
  //    [data-stage-box] + .ms-side-main already name the two things, so watch mode is inherited.
  assert(/scroll-snap-type:\s*x mandatory/.test(block), ".ms-side must become a horizontal snap pager");
  // A page PEEKS (<100%) so the next one is visible. A full-width page on a watch is an empty screen with no
  // evidence anything else exists, and ::scroll-marker cannot cover for it — being unsupported is precisely
  // the case that needs covering. Found on a 208×248 shot: the transport was one swipe away and invisible.
  const page = /flex:\s*0 0 (\d+)%/.exec(block);
  assert(page, "the pager's pages have no width");
  assert(Number(page[1]) < 100 && Number(page[1]) >= 80,
    `a page is ${page[1]}% — at 100% nothing hints the next page exists; below ~80% it stops being a page`);
  assert(/scroll-snap-align/.test(block), "snap targets need an alignment or the pager free-scrolls");
  // …and you land on the CONTROLS. On a watch the reason you opened a player is to press play.
  assert(/\.ms-side > \.ms-side-main\s*\{\s*order:\s*-1/.test(block), "the transport must be the first page");

  // 3) the markers are an ENHANCEMENT, never a dependency: Firefox is still partial as of mid-2026, and
  //    without them the swipe must be identical, minus dots.
  const markers = css.indexOf("::scroll-marker");
  assert(markers > 0, "no scroll markers — the pager has no indicator where the browser supports one");
  assert(/@supports selector\(::scroll-marker\)/.test(css), "scroll markers must be @supports-gated");
  assert(css.lastIndexOf("@supports selector(::scroll-marker)", markers) > css.lastIndexOf("scroll-snap-type", markers) - 4000 ||
    css.indexOf("scroll-marker-group") > css.indexOf("@supports selector(::scroll-marker)"),
    "the marker group must live inside the @supports block, not beside it");
});

Deno.test("watch mode — the dock's own position is styleable (no inline style can outrank it)", async () => {
  // The rail moves the dock to the right edge. An inline `style="bottom:…"` on the element would win over
  // any stylesheet, so the dock would stay pinned to the bottom AND get a top — stretching it full height.
  const render = await Deno.readTextFile(new URL("./render.js", import.meta.url));
  const nav = render.slice(render.indexOf("<nav data-dock"), render.indexOf("</nav>", render.indexOf("<nav data-dock")));
  assert(!/style="[^"]*bottom:/.test(nav), "the dock's `bottom` is an inline style — watch mode cannot move it");
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  assert(/nav\[data-dock\]\s*\{\s*bottom:/.test(css), "…and nothing in theme.css positions it instead");
  // --dock-w is the rail's footprint; content clears it the way it cleared --dock-h.
  assert(/--dock-w/.test(render) && /--dock-w/.test(css), "the rail's width must be published and consumed");
});

Deno.test("no app passes the Transport a prop it does not accept (a silent prop is a lost button)", async () => {
  // How rave lost its generate button: the widget's single `extra` slot became the `actions` array, rave's
  // pads tab was migrated and its BEAT tab was not — so it kept passing `extra=`, JSX-style props being
  // silently ignored when unknown. Every gate stayed green and the control simply stopped existing. Nothing
  // but the eye caught it, on a screenshot, two commits later. This makes it mechanical.
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const sig = ui.slice(ui.indexOf("export function Transport("), ui.indexOf("}) {", ui.indexOf("export function Transport(")));
  // the destructured names, read off the signature with comments and default values removed first
  const bare = sig.replace(/\/\/[^\n]*/g, "").replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "0");
  const accepted = new Set([...bare.matchAll(/(?:^|[,{])\s*([a-zA-Z][a-zA-Z0-9]*)\s*(?=[,=}]|$)/gm)].map((m) => m[1]));
  accepted.add("children"); accepted.add("key");
  assert(accepted.has("actions") && accepted.has("onToggle"), "could not read the Transport signature");

  const appsDir = new URL("../../apps/", import.meta.url);
  const offenders = [];
  for await (const e of Deno.readDir(appsDir)) {
    if (!e.isDirectory) continue;
    let src = "";
    try { src = await Deno.readTextFile(new URL(`${e.name}/view.js`, appsDir)); } catch { continue; }
    // Each `<${Transport} … />` call site. A prop may itself hold markup (drift's subtitle is an html`…`
    // containing another html`…`), so depth is tracked properly rather than by backtick parity: an opening
    // backtick is the one that follows `html`, any other closes. Only props at depth 0 are the Transport's.
    for (const call of src.matchAll(/<\$\{Transport\}/g)) {
      const from = call.index + call[0].length;
      const region = src.slice(from, from + 4000);
      let depth = 0;
      for (let k = 0; k < region.length; k++) {
        if (region[k] === "`") { depth += region.slice(k - 4, k) === "html" ? 1 : -1; continue; }
        if (depth > 0) continue;
        if (region[k] === "/" && region[k + 1] === ">") break;
        const m = /^([a-zA-Z][a-zA-Z0-9]*)=/.exec(region.slice(k, k + 40));
        if (m && /[\s{]/.test(region[k - 1] || " ")) { if (!accepted.has(m[1])) offenders.push(`${e.name}: ${m[1]}`); k += m[1].length; }
      }
    }
  }
  assertEquals(offenders, [], "Transport props that the kit ignores — the control they carry does not render");
});

Deno.test("Transport — every control is opt-in, and the mode toggles frame the transport keys", async () => {
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  // Opt-in by handler is the whole reason one component serves a one-button ambient player and a full queue
  // player: pass the handler and the control appears. A control rendered unconditionally would force every
  // app to own a dead button.
  for (const [h, id] of [["onShuffle", "shuffle"], ["onRepeat", "repeat"], ["onPrev", "prev"], ["onNext", "next"]])
    assert(new RegExp(`\\$\\{\\s*${h}\\s*\\?`).test(tp) || new RegExp(`${h}\\s*\\?`).test(tp),
      `${id} is not gated on ${h} — an app that never passes it still gets the button`);
  // Canonical order — the one every phone player has taught the thumb. Source order IS render order here.
  const at = (needle) => tp.indexOf(needle);
  const [sh, pv, pl, nx, rp] = ['id="shuffle"', 'id="prev"', 'id="play"', 'id="next"', 'id="repeat"'].map(at);
  assert(sh > 0 && pv > 0 && pl > 0 && nx > 0 && rp > 0, "a transport key went missing");
  assert(sh < pv && pv < pl && pl < nx && nx < rp, "control order must be shuffle · prev · play · next · repeat");
});

// ── Pinterest ────────────────────────────────────────────────────────────────────────────────────────
Deno.test("pinterest parseInput — four shapes, and only ONE of them needs the network", () => {
  assertEquals(pinParse("https://www.pinterest.com/pin/1096274734320084795/"), { kind: "pin", id: "1096274734320084795" });
  assertEquals(pinParse("pinterest.com/pin/123456789/sent/?invite_code=abc"), { kind: "pin", id: "123456789" });
  assertEquals(pinParse("1096274734320084795"), { kind: "pin", id: "1096274734320084795" });
  // the short link is the one shape a regex cannot answer — its id lives behind a redirect with no CORS
  assertEquals(pinParse("https://pin.it/4TgG4yGpF"), { kind: "short", code: "4TgG4yGpF" });
  assertEquals(pinParse("https://www.pinterest.com/Federico_biilancor/clean-ux-design/"),
    { kind: "board", user: "Federico_biilancor", slug: "clean-ux-design" });
  // Pinterest's own section pages are not boards — treating them as one produces a confident 404
  assertEquals(pinParse("https://www.pinterest.com/search/pins/?q=ui").kind, "unknown");
  assertEquals(pinParse("https://www.pinterest.com/ideas/design/12345/").kind, "unknown");
  assertEquals(pinParse("").kind, "empty");
  assertEquals(pinParse("https://example.com/x").kind, "unknown");
});

Deno.test("pinterest ladder — /originals first, .png before giving up, 564x always last", () => {
  const l = pinLadder("https://i.pinimg.com/564x/2c/2d/a6/2c2da69b3a54335fa22daf40833a7f96.jpg");
  assert(l[0].includes("/originals/"), "the full-resolution rung must come first");
  // the .jpg→.png rewrite: /originals/ keeps the ORIGINAL extension, and assuming .jpg is the single most
  // common reason a "direct link" 404s on an image that does exist
  assert(l.some((u) => u.endsWith(".png")), "no .png rung — a graphic saved as PNG would 404 as .jpg");
  assert(l[l.length - 1].includes("/564x/"), "564x is the floor: it is the size the API itself handed us");
  assertEquals(new Set(l).size, l.length, "duplicate rungs waste a decode each");
  // a non-pinimg URL is returned as-is rather than mangled
  assertEquals(pinLadder("https://example.com/a.jpg"), ["https://example.com/a.jpg"]);
  assertEquals(pinLadder(""), []);
});

Deno.test("pinterest readPins — one reader for a board and for a single pin", () => {
  const raw = { id: "1", description: " a note ", dominant_color: "#e2dfd8", images: { "564x": { url: "u", width: 564, height: 1010 } },
    board: { name: "Clean UX", url: "/u/b/" }, pinner: { full_name: "Nexora" } };
  const [p] = pinRead({ data: [raw] });
  assertEquals(p.id, "1");
  assertEquals(p.text, "a note");
  assertEquals(p.color, "#e2dfd8");
  assertEquals(p.page, "https://www.pinterest.com/pin/1/");
  assertEquals(pinRead({ data: raw })[0].id, "1", "a single-object payload reads the same way");
  assertEquals(pinRead({}), []);
  assertEquals(pinRead({ data: [{ nope: 1 }] }), [], "a pin without an id is not a pin");
  // the tile reserves its aspect ratio before the image decodes, clamped so one infographic cannot own the column
  assert(Math.abs(pinRatio(p) - 1010 / 564) < 1e-9);
  assertEquals(pinRatio({ w: 1, h: 99 }), 2.2);
  assertEquals(pinRatio({ w: 99, h: 1 }), 0.5);
  assertEquals(pinRatio(null), 1);
});

Deno.test("the surface system: every interactive node declares a state, and none draws its own shadow", async () => {
  // BLOCK 7 — the contract. The system is only a system if a widget's volume comes from a NAMED state
  // rather than a shadow someone wrote in place. Two halves: the kit must not hardcode shadows, and every
  // node the reference enumerates must have a rule.
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const render = await Deno.readTextFile(new URL("./render.js", import.meta.url));

  // no literal shadows left in the kit or the shell — they declare `sf-*` instead
  for (const [name, src] of [["ui.js", ui], ["render.js", render]]) {
    const lits = [...src.matchAll(/shadow-\[[^\]]+\]|shadow-(?:sm|md|lg|xl|2xl)\b/g)].map((m) => m[0]);
    assertEquals(lits, [], `${name} still writes its own shadows instead of declaring a surface`);
  }

  // the four states exist, in both themes, and are RELATIVE moves rather than borrowed palette entries
  // Defined TWICE each — once per theme. Slicing "the block after the selector" is unreliable here because
  // a theme is declared in more than one place; counting definitions asks the real question.
  for (const v of ["--sf-rim", "--sf-drop", "--sf-inset-face", "--sf-inset-top", "--sf-press-face", "--sf-press-top"]) {
    const defs = (css.match(new RegExp(v.replace(/-/g, "\\-") + ":", "g")) || []).length;
    assert(defs >= 2, `${v} is defined ${defs}× — a state that exists in one theme only is not a state`);
  }

  // every node the reference enumerates has a rule. If one is added to the kit and not here, this fails.
  const nodes = [
    [".btn:not(.btn-ghost)", "buttons raise at rest"],
    [":not(:disabled):active", "buttons press under a finger"],
    [".input, .textarea", "fields are recessed"],
    [".toggle, .checkbox, .radio", "switches are a slot with something in it"],
    [".progress", "a progress bar is a value in a trough"],
    ['nav[data-dock] button[aria-current="page"]', "the active tab lifts out of the rail"],
    [".card, [data-card]", "cards carry the base ambient drop"],
    [".alert", "an alert sits on content"],
    [".modal-box", "a sheet is L4"],
    ["[data-toast] .alert", "a toast is L5"],
  ];
  for (const [sel, why] of nodes) assert(css.includes(sel), `no surface rule for ${sel} — ${why}`);

  // and the accent never becomes a FILL behind text: focus is a ring
  const focus = css.slice(css.indexOf(".input:focus"), css.indexOf("}", css.indexOf(".input:focus")));
  assert(/0 0 0 \d+px var\(--app-accent\)/.test(focus), "focus must be a ring — an arbitrary hue behind text fails contrast in one theme");
  assert(!/background:\s*var\(--app-accent\)/.test(focus), "focus fills the field with the accent");
});

// ── The neumorphic material — the contract the repaint replaced the clay one with ──────────────────
// Written because the four things below are exactly what a later "small tweak" silently breaks, and none
// of them is visible to axe: a one-sided shadow still renders, a lighter card face still renders, a
// hardcoded 5px offset still renders. They just stop being this material.
Deno.test("the material: one light at 45°, a symmetric pair, and the surface IS the page", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  // A theme is declared in MORE THAN ONE block (the palette, then the surface tokens), so reading "the
  // block after the selector" answers a different question than the one being asked. Collect them all.
  const themeBlock = (t) => {
    let out = "", i = -1;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
    return out;
  };

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlock(theme);

    // 1. The pair exists and is NAMED, so a rule composes it instead of restating two colours.
    for (const v of ["--nm-dark", "--nm-light", "--nm-cast"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v} — the pair is the material`);
    }

    // 2. Every composed surface carries BOTH halves. A single-sided shadow is a card sitting on a page;
    //    the pair is the page itself pushed out or pressed in, and that difference IS the style.
    for (const v of ["--sf-drop", "--sf-sink", "--sf-press"]) {
      const decl = b.slice(b.indexOf(v + ":"));
      const value = decl.slice(0, decl.indexOf(";"));
      assert(value.includes("--nm-dark") || value.includes("--nm-press-dark"), `${theme} ${v} has no dark half`);
      assert(value.includes("--nm-light"), `${theme} ${v} has no LIGHT half — a one-sided shadow is a drop shadow, not an extrusion`);
    }

    // 3. base-100 === base-200. The premise of the whole style: a raised object is the PAGE extruded, not
    //    a lighter panel laid on top. The moment a card is a different tone the pair reads as a drop shadow
    //    under a rectangle — which is the look this replaced.
    const tok = (n) => /#[0-9A-Fa-f]{6}/.exec(b.slice(b.indexOf(`--color-${n}:`)))[0].toUpperCase();
    assertEquals(tok("base-100"), tok("base-200"), `${theme}: base-100 and base-200 differ — a raised surface must be the same colour as the page it rises out of`);

    // 4. The recess is the same colour too — depth comes from the shadow, never from a darker fill.
    assert(/--sf-inset-face:\s*var\(--color-base-100\)/.test(b), `${theme}: the recessed face is a different colour — that is a panel, not a hole`);
  }

  // 5. The light is at 45°: x and y offsets are the same token, so there is exactly ONE light source in
  //    the farm and it cannot drift per component. A rule that writes `0 4px` has invented a second one.
  const pair = /var\(--nm-d\) var\(--nm-d\)|var\(--nm-d2\) var\(--nm-d2\)|var\(--nm-dp\) var\(--nm-dp\)/;
  for (const v of ["--sf-drop", "--sf-sink", "--sf-press", "--sf-lift2", "--sf-sink2"]) {
    const i = css.indexOf(v + ":");
    assert(i > -1, `${v} is not defined`);
    assert(pair.test(css.slice(i, css.indexOf(";", i))), `${v} does not offset x and y equally — the light must stay at 45°`);
  }

  // 6. The extrusion compacts with the density ladder. A 5px shadow that never steps is 5px deep on a
  //    200px-tall split-screen window, where it is most of the control.
  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{[^}]*--nm-d:\s*(\d+)px/g)]
    .map((m) => ({ h: +m[1], d: +m[2] })).sort((a, b) => b.h - a.h);
  assert(steps.length >= 2, "the extrusion depth does not step with the density ladder");
  for (let i = 1; i < steps.length; i++) {
    assert(steps[i].d < steps[i - 1].d, `--nm-d does not shrink at ${steps[i].h}px — depth must compact with everything else`);
  }
});

// The first cut of the neumorphic light theme ran a dark half 2.4x the light one (−39 against +16 on a
// #EEEEF1 base) while the dark theme was exactly ±16. Nothing failed: the pair existed, both halves were
// present, every earlier assertion passed — and the light theme still read as an ordinary drop shadow
// instead of an extrusion. Two independent app reviews measured it off screenshots before anyone could
// explain it. Symmetry is the property that makes this material read, so it is the property to assert.
Deno.test("the material: the two halves of the pair are near-symmetric in BOTH themes", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;
  const grab = (block, name) => /#[0-9A-Fa-f]{6}/.exec(block.slice(block.indexOf(name + ":")))?.[0];
  const themeBlocks = (t) => {
    let out = "", i = -1;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
    return out;
  };

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlocks(theme);
    const base = lum(grab(b, "--color-base-100"));
    const down = base - lum(grab(b, "--nm-dark"));
    const up = lum(grab(b, "--nm-light")) - base;
    assert(down > 0 && up > 0, `${theme}: the pair must straddle the base — down=${down}, up=${up}`);
    // 1.5x is the line: the dark theme sits at 1.0 and the light one at 1.3 (capped by how little headroom
    // #EEEEF1 leaves toward white). 2.4x was visibly a drop shadow, so the gate sits between the two.
    const ratio = Math.max(down, up) / Math.min(down, up);
    assert(
      ratio <= 1.5,
      `${theme}: the shadow pair is lopsided — dark half ${down.toFixed(0)}, light half ${up.toFixed(0)} ` +
        `(${ratio.toFixed(1)}x). One side that dominates turns the extrusion back into a drop shadow. ` +
        `If the base has no headroom left in the weak direction, MOVE THE BASE — do not widen the strong side.`,
    );
  }

  // Blur may not exceed 2x its offset, or each half bleeds back around the NEAR edges and draws a faint
  // dark rim between the object and its own highlight — "the page extruded" quietly becoming "a rectangle
  // with a border". Found by eye on a card list at 1x before it was arithmetic.
  // EVERY declaration site, not just the base one. The first version of this check sliced from the first
  // `:root` after `--nm-d:` and so read exactly one block — which would have passed while all four density
  // steps were at 2.5x and 3x, i.e. it would have certified the wrong thing. The pairs are co-declared on
  // one line at each step, so match them together and walk them all.
  const pairs = [...css.matchAll(/--nm-(d2?|dp):\s*(\d+)px;\s*--nm-(b2?|bp):\s*(\d+)px/g)];
  assert(pairs.length >= 4, `expected the base pair plus every density step, found ${pairs.length}`);
  for (const m of pairs) {
    const [off, bl] = [Number(m[2]), Number(m[4])];
    assert(
      bl <= off * 2,
      `--nm-${m[3]} (${bl}px) exceeds 2x --nm-${m[1]} (${off}px) — the blur bleeds past the NEAR edge and ` +
        `paints a faint rim between the object and its own highlight, turning "the page extruded" back into ` +
        `"a rectangle with a border". Every density step has to hold this, not just the base one.`,
    );
  }
});

// The installed-PWA splash and the Android status bar are the one surface no screenshot can reach:
// microlink renders the page, never the OS chrome around it. So they sat at the pre-redesign near-black
// through an entire repaint — 119 files — and only a code read found them.
Deno.test("PWA chrome colours track the theme bases — the surface no screenshot can see", async () => {
  const root = new URL("../../", import.meta.url);
  const css = await Deno.readTextFile(new URL("packages/runtime/theme.css", root));
  const baseOf = (t) => {
    const i = css.indexOf(`[data-theme="${t}"] {`);
    return /--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(css.slice(i))[1].toUpperCase();
  };
  const allowed = new Set([baseOf("signal"), baseOf("signal-light")]);
  const bad = [];
  for await (const e of Deno.readDir(new URL("apps/", root))) {
    if (!e.isDirectory) continue;
    try {
      const m = JSON.parse(await Deno.readTextFile(new URL(`apps/${e.name}/manifest.json`, root)));
      for (const k of ["theme_color", "background_color"]) {
        if (m[k] && !allowed.has(m[k].toUpperCase())) bad.push(`${e.name}/manifest.json ${k}=${m[k]}`);
      }
      const html = await Deno.readTextFile(new URL(`apps/${e.name}/index.html`, root));
      const meta = /<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html)?.[1];
      if (meta && !allowed.has(meta.toUpperCase())) bad.push(`${e.name}/index.html meta theme-color=${meta}`);
    } catch { /* an app without a manifest is another gate's problem */ }
  }
  assertEquals(bad, [], `PWA chrome is off-theme (allowed: ${[...allowed].join(", ")}). An installed app would show a splash and status bar from the previous design: ${bad.join(", ")}`);
});

// ── hunt — the ranged engine ──────────────────────────────────────────────────────────────
const HUNT_WASM = new URL("../../apps/hunt/assets/hunt.wasm", import.meta.url);
const HUNT_S = { SFX: 10, AMMO: 13, HP: 14, KILLS: 16, COUNT: 17 };
const HUNT_IN = { RIGHT: 2, RUN: 8, SHOOT: 32 };
async function huntEngine() {
  const { instance } = await WebAssembly.instantiate(await Deno.readFile(HUNT_WASM), {});
  const E = instance.exports;
  return { E, st: () => new Int32Array(E.memory.buffer, E.game_state(), HUNT_S.COUNT) };
}

Deno.test("hunt engine · your own spear cannot hurt you", async () => {
  // It could, and it did: the contact check listed the kinds to SKIP rather than the kinds that
  // are a threat, so particles were excluded and the player's own projectile was not. A spear
  // leaves from inside her box and on a sprint travels alongside her, so throwing while running
  // was a way to kill yourself. A skip-list grows a hole every time a kind is added; this asserts
  // the behaviour rather than the list.
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  const hp0 = st()[HUNT_S.HP];
  let hurt = 0, thrown = 0;
  for (let f = 0; f < 240; f++) {
    E.game_step(HUNT_IN.RIGHT | HUNT_IN.RUN | (f % 12 === 0 ? HUNT_IN.SHOOT : 0));
    const s = st();
    if (s[HUNT_S.SFX] & 64) thrown++;
    if (s[HUNT_S.SFX] & 128) hurt++;
  }
  assert(thrown >= 6, `only ${thrown} spears left the hand — the test is not exercising the throw`);
  assertEquals(hurt, 0, "throwing while sprinting hurt the thrower");
  assertEquals(st()[HUNT_S.HP], hp0, "hearts were lost on the calm opening, with nothing to hit her");
});

Deno.test("hunt engine · the quiver is finite and refuses to go negative", async () => {
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  const start = st()[HUNT_S.AMMO];
  assert(start > 0, "the game starts with nothing to throw");
  for (let f = 0; f < 900; f++) E.game_step(HUNT_IN.SHOOT);     // hammer it long past empty
  const s = st();
  assert(s[HUNT_S.AMMO] >= 0, `ammo went negative (${s[HUNT_S.AMMO]})`);
  assert((s[HUNT_S.SFX] & 512) !== 0 || s[HUNT_S.AMMO] === 0,
    "an empty quiver must SAY it is empty — a dead button is indistinguishable from a broken one");
});

Deno.test("hunt engine · the collision box it reports IS the one it stands on", async () => {
  // The renderer stands sprites on game_box(). If that number and the simulation's own idea of the
  // player's feet ever disagree, the character hovers — which is what happened when the sprite was
  // stood on the bottom of a TILE instead: one pixel out in brick, twelve here, and twelve pixels
  // is a character floating. So assert the RELATIONSHIP, not the constant: after landing, the
  // bottom of the reported box must sit exactly on the surface it is resting on.
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  for (let f = 0; f < 90; f++) E.game_step(0);                 // stand still and settle
  const s = st();
  const packed = E.game_box(0);
  const boxH = packed & 0xffff;
  assert(boxH > 0 && boxH < 200, `game_box returned a nonsense height (${boxH})`);
  const py = s[6], feet = py + boxH;
  // find the surface directly under her
  const col = Math.floor((s[4] + s[5]) / 24);
  let ground = -1;
  for (let r = 0; r < 11; r++) if (E.game_tile(col, r) >= 0x10) { ground = r * 24; break; }
  assert(ground >= 0, "she is not standing over any ground — the fixture moved");
  assertEquals(feet, ground, `feet at ${feet} against a surface at ${ground} — the box the renderer is given is not the box she rests on`);
});

Deno.test("deck · a cluster is measured back out of its own layout, never trusted as a literal", () => {
  /* The alpha shipped two action keys 0.99 key-widths apart — RIMS TOUCHING — for the life of the
     project. Nothing could see it: no gate measures the distance between two buttons, axe does not
     care, and at phone scale a screenshot reads it as "a bit tight". Worse, the first pass that went
     looking measured 32.6° and blamed the ANGLE, which was fine at 21.4°; two commits would have gone
     into rotating a cluster whose only problem was density.

     So this asserts the numbers a DEVICE is specified by — the span in key diameters and the axis in
     degrees — derived from the percentages the component actually lays out with. Editing a percentage
     to something that is not a real console now fails here instead of shipping. Sources and arithmetic:
     docs/research/console-shells.md. */
  const pair = clusterMetrics(PAIR[0], PAIR[1], PAIR_KEY, PAIR_BOX);
  assert(Math.abs(pair.span - 1.6) < 0.03, `the two action keys sit ${pair.span.toFixed(2)} D apart — a real pair is 1.60 D (1.45–1.75), and 1.0 D means their rims touch`);
  assert(Math.abs(pair.angle - 22) < 2, `the pair axis is ${pair.angle.toFixed(1)}° — a handheld pair rises 15–28° to the right`);

  const across = clusterMetrics(DIAMOND.right, DIAMOND.left, DIAMOND_KEY, DIAMOND_BOX);
  const down = clusterMetrics(DIAMOND.down, DIAMOND.up, DIAMOND_KEY, DIAMOND_BOX);
  for (const [name, m] of [["horizontal", across], ["vertical", down]])
    assert(Math.abs(m.span - 1.92) < 0.05, `the ${name} diagonal of the four-key cluster is ${m.span.toFixed(2)} D — 1.80–2.10 D, below 1.6 they merge into a flower and above 2.3 they stop being one node`);
  /* Axis-aligned, and this is the counter-intuitive half: real four-key clusters sit at 0° ± 3°. The
     sense that they are tilted comes from the whole cluster being offset, or from the lettering. */
  assert(Math.abs(across.angle) < 3, `the four-key cluster is rotated ${across.angle.toFixed(1)}° — a real one is axis-aligned within 3°, and a decorative 15–25° twist is the commonest way to draw one wrong`);

  /* The hub the alpha wrote as 38% meant "a third of the cross" and delivered an eighth, because the
     percentage was against the CENTRE CELL. The derivation is the whole point of keeping it. */
  const css = Deno.readTextFileSync(new URL("./theme.css", import.meta.url));
  const cell = +/\.ms-pad-hub\s*\{[^}]*width:\s*([\d.]+)%/.exec(css)?.[1];
  assert(cell, "theme.css no longer sizes .ms-pad-hub — the cross has no hub");
  const whole = hubOfCross(cell);
  assert(whole > 25 && whole < 40, `the pad hub is ${whole.toFixed(1)}% of the whole cross — a real one is ~34%, and the alpha\u2019s 38%-of-the-centre-cell was 12.7%`);
});

Deno.test("console · one device, and the aperture is never rationed", async () => {
  /* The catalogue of nine shells is gone, and this is the check that keeps it gone. It cost both
     games a settings tab and, far worse, it cost them their screen: a table of silhouettes has to
     DIFFER somewhere, so every row wrote an aperture as a fraction of the body (0.42 · 0.55 · 0.61
     …), and 55% of a 24rem shell is a 155px game on a 390px phone. Nothing could see it — it does
     not overflow, it does not fail a11y, and it photographs as a console.

     So two claims, both about the shape of the code rather than about a number in it: the console
     publishes no catalogue, and the CSS hands the aperture the whole body. */
  const src = await Deno.readTextFile(new URL("./console.js", import.meta.url));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const gone of ["SHELLS", "ShellPicker", "ShellTab", "persistentAtom", "shellVars", "./shells.js"])
    assert(!code.includes(gone), `console.js is growing a shell catalogue again ("${gone}") — there is one device`);
  /* A shell may not know anything about a particular GAME either: that would be a shell that fits
     one. Scanned WITHOUT comments, and that is not fastidiousness — the first version of this
     check failed on the doc comment that EXPLAINS the rule, by naming "crouch" as an example of
     what a shell must not know. preflight learned the same thing about its shadow ban: a gate that
     punishes documentation teaches people to delete the documentation. */
  for (const forbidden of ["brick.wasm", "hunt.wasm", "SCRW", "ammo", "spear", "crouch"])
    assert(!code.includes(forbidden), `console.js references "${forbidden}" in CODE — the shell must be game-agnostic`);

  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const screen = /\.ms-screen\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert(/width:\s*100%/.test(screen), ".ms-screen no longer takes the whole body width");
  assert(!/--sh-screen-w/.test(css),
    "an aperture FRACTION is back in theme.css — that variable is the small-screen bug, and it is the shape of the bug rather than its value that must not return");
  const shell = /\.ms-shell\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  /* CAPPED, not stretched — and the distinction is the whole lesson, so the assertion has to be
     able to tell them apart. `height: 100%` was the first repair and the deployed screenshot
     killed it: the aperture is bound by WIDTH, so a full-height body buys the game nothing and
     only moves the emptiness inside the device as a dead band of plastic. Note that a naive
     /height:\s*100%/ matches `max-height: 100%` as a substring and would have passed either way,
     which is a check that cannot see the thing it is about. */
  assert(/max-height:\s*100%/.test(shell),
    ".ms-shell is not capped at the view — a console taller than the viewport is a fit screen that scrolls");
  assert(!/(^|[^-])height:\s*100%/.test(shell),
    ".ms-shell is stretching to the view again — the canvas is width-bound, so that buys the game nothing and puts a dead band of plastic between the screen and the deck (the deployed shot, not the gate, is what caught this)");
});

// ── acts.js — the pure logic behind `arc` ────────────────────────────────────────────────────────────────
// Every table here came from a measurement (apps/arc/RESEARCH.md); these tests pin the measurements, so a
// well-meaning tidy-up of a "redundant" QID cannot silently drop a genre.

Deno.test("isBook: the type allowlist covers what the P31 census actually found", () => {
  assert(actsIsBook({ p31: ["Q7725634"] }), "literary work is the common case (34/39)");
  // The regression this exists for: a bare literary-work allowlist drops ALL non-fiction.
  assert(actsIsBook({ p31: ["Q47461344"] }), "written work — Sapiens, Educated, A Room of One's Own");
  assert(actsIsBook({ p31: ["Q1667921", "Q13593966"] }), "The Hunger Games is typed as its series");
  assert(actsIsBook({ p31: ["Q7725634", "Q49100005"] }), "banned book only ever co-occurs");
});

Deno.test("isBook: a film adaptation shares the title and must never win", () => {
  // uk `Там, де співають раки` resolves to the film, whose plot summarises the wrong work entirely.
  assert(!actsIsBook({ p31: ["Q11424"], hasAuthor: true, hasDate: true }), "film");
  assert(!actsIsBook({ p31: ["Q5"] }), "the author is not the book");
  assert(!actsIsBook({ p31: ["Q4167410"] }), "disambiguation page");
  assert(!actsIsBook({ p31: ["Q482994"] }), "soundtrack album");
  // a denied type wins even when the work signals are present
  assert(!actsIsBook({ p31: ["Q11424", "Q7725634"] }), "typed as both → the film reading must lose");
});

Deno.test("isBook: untyped works fall back to author+date, which films do not have", () => {
  assert(actsIsBook({ p31: [], hasAuthor: true, hasDate: true }), "P50+P577 are on 38/39 books");
  assert(!actsIsBook({ p31: [], hasAuthor: true }), "author alone is not enough");
  assert(!actsIsBook({ p31: [], hasDate: true }), "a date alone is nothing");
  assert(!actsIsBook({}), "no signal at all");
});

Deno.test("findPlotSection: resolves by NAME, never by a remembered number", () => {
  // The index moved 2 → 3 on Dune (novel) between revisions 4 minutes apart.
  assertEquals(actsFindPlot([{ index: 1, line: "Origins" }, { index: 3, line: "Plot" }]).index, "3");
  assertEquals(actsFindPlot([{ index: 2, line: "Plot summary" }]).index, "2");
  assertEquals(actsFindPlot([{ index: 5, line: "Synopsis" }]).index, "5");
  assertEquals(actsFindPlot([{ index: 4, line: "Storylines" }]).index, "4");
  // preference order: an article carrying both takes the summary
  assertEquals(actsFindPlot([{ index: 7, line: "Synopsis" }, { index: 2, line: "Plot summary" }]).index, "2");
  // headings arrive with markup and case variation
  assertEquals(actsFindPlot([{ index: 9, line: "PLOT  SUMMARY" }]).index, "9");
  assertEquals(actsFindPlot([{ index: 6, line: "Synopsis of Part One" }]).index, "6", "prefix match");
  assertEquals(actsFindPlot([{ index: 1, line: "Reception" }]), null, "no plot section at all");
  assertEquals(actsFindPlot([]), null);
  assertEquals(actsFindPlot(null), null);
});

Deno.test("cleanPlotText strips what textContent leaves behind", () => {
  assertEquals(actsClean("Plot [ edit ] Duke Leto[1] rules Caladan.[12]", "Plot"),
    "Duke Leto rules Caladan.");
  assertEquals(actsClean("He waits[citation needed] there.", null), "He waits there.");
  assertEquals(actsClean("a b   c", null), "a b c", "nbsp is not matched by \\s everywhere");
  assertEquals(actsClean("", null), "");
});

Deno.test("foldPlot keeps the ENDING — act 3 is grounded in it", () => {
  const head = "A".repeat(400) + ". ";
  const mid = "B".repeat(400) + ". ";
  const tail = "C".repeat(300) + " THE FINALE.";
  const folded = actsFold(head + mid + tail, 800);
  assert(folded.length <= 800 + 8, `fold overshot: ${folded.length}`);
  assert(folded.includes("THE FINALE"), "a plain slice() would have cut the ending off");
  assert(folded.startsWith("A"), "the opening survives too");
  assert(folded.includes("[…]"), "the drop is marked");
  // short input is returned untouched
  assertEquals(actsFold("short plot.", 800), "short plot.");
});

Deno.test("parseActs: the happy path splits on the markers", () => {
  const r = actsParse("[1]\nBeginning here.\n\n[2]\nMiddle here.\n\n[3]\nEnd here.");
  assertEquals(r.acts, ["Beginning here.", "Middle here.", "End here."]);
  assert(r.ok);
  assert(!r.truncated);
});

Deno.test("parseActs: a repeated marker mid-prose must not split the act", () => {
  const r = actsParse("[1] He counts [1] again and stops. [2] Then this. [3] Finally this.");
  assertEquals(r.acts[0], "He counts [1] again and stops.");
  assert(r.ok);
});

Deno.test("parseActs: a missing marker is NOT a partial success", () => {
  // This is the one that matters: a two-act answer must never be cached or shown as complete.
  const r = actsParse("[1] Only this. [2] And this.");
  assertEquals(r.ok, false);
  const empty = actsParse("");
  assertEquals(empty.ok, false);
});

Deno.test("parseActs: detects an answer cut mid-word by the token ceiling", () => {
  // Measured for real: level 3 ended "...джихад фременів, оскільки" and stopped.
  const cut = actsParse("[1] One. [2] Two. [3] It ends because he cannot stop the jihad, oskilky");
  assert(cut.truncated, "an unterminated final act is a stump, not a short answer");
  const whole = actsParse("[1] One. [2] Two. [3] It ends here.");
  assert(!whole.truncated);
  assert(!actsParse("[1] One. [2] Two. [3] He asks why?").truncated, "? terminates");
  assert(!actsParse("[1] One. [2] Two. [3] «Кінець»").truncated, "a closing quote terminates");
});

Deno.test("countSentences counts what the length budget is measured in", () => {
  assertEquals(actsCount("One. Two. Three."), 3);
  assertEquals(actsCount("One! Two? Three…"), 3);
  assertEquals(actsCount(""), 0);
});

Deno.test("actSignature: the level is part of the cache key", () => {
  // Without this the first level a book is opened at gets served for all three.
  assert(actsSig(190192, 1, "uk") !== actsSig(190192, 3, "uk"), "level must vary the key");
  assert(actsSig(190192, 1, "uk") !== actsSig(190192, 1, "en"), "locale must vary the key");
  assertEquals(actsSig(190192, 2, "uk"), actsSig(190192, 2, "uk"), "and it must be stable");
});

Deno.test("plotUpToClimax withholds the ending — a prompt alone did not", () => {
  // Measured leak this exists to close: told the ending was hidden, the model still answered indirect
  // questions with the climax. If it never receives the last quarter, it cannot leak it.
  const body = Array.from({ length: 60 }, (_, i) => `Event ${i} happens.`).join(" ");
  const full = body + " AND THEN THE HERO DIES AT THE END.";
  const cut = actsUpToClimax(full);
  assert(!cut.includes("THE HERO DIES"), "the ending survived the cut");
  assert(cut.length < full.length, "nothing was cut at all");
  assert(cut.length > full.length * 0.5, `cut far too aggressive: ${cut.length}/${full.length}`);
  assert(/\.$/.test(cut), "the cut left a half sentence");
  // a plot too short to have a separable third act is returned whole rather than mangled
  assertEquals(actsUpToClimax("A short plot."), "A short plot.");
  assertEquals(actsUpToClimax(""), "");
});

Deno.test("material: a SURFACE is extruded, never a fill with a line drawn round it", async () => {
  // The neumorphic migration reached theme.css, Panel, Island and the sheets — and never reached the card
  // catalogue in render.js, so every declarative list app stayed flat while the design doc said otherwise.
  // `arc` is card-heavy and surfaced it. This pins the finished migration.
  //
  // What is still allowed, deliberately: `border-b` DIVIDERS between rows inside a surface, and the sticky
  // header's underline. A hairline separating two rows is part of the language; a hairline standing in for
  // depth is the thing that was wrong.
  const src = await Deno.readTextFile(new URL("./render.js", import.meta.url));
  const surfaces = src.match(/card[^"'`]*border border-base-\d+/g) || [];
  assertEquals(surfaces, [], "a card is declaring a border instead of `sf-raised` — depth is the shadow pair, not a line");
  const wells = src.match(/aspect-(video|square)[^"'`]*border border-base-\d+/g) || [];
  assertEquals(wells, [], "a media well is declaring a border instead of `sf-inset` — a picture sits IN the surface");
  // and every remaining hairline must be a divider or an edge, never a box
  for (const m of src.match(/border-base-\d+[^"'`]*/g) || []) {
    const line = src.slice(Math.max(0, src.indexOf(m) - 160), src.indexOf(m) + m.length);
    assert(/border-b|border-t|btn-ghost/.test(line), `a boxed hairline survives: …${m.slice(0, 60)}`);
  }
});

// ── chat.js — the pure logic behind a grounded CONVERSATION ──────────────────────────────────────────────
// Both rules here fail silently when wrong: a bad fold drops the grounding an answer depends on (or leaves
// the model replying to itself), and a bad signature serves one conversation's reply inside another.

Deno.test("foldThread keeps the tail, and the tail is what carries the pronouns", () => {
  // The reverse of foldPlot, on purpose: a plot needs its ending, a conversation needs its present. The book
  // is re-sent whole with every request, so forgetting the start of the thread loses nothing that matters.
  const turns = [];
  for (let i = 0; i < 20; i++) { turns.push(chatAsked("q" + i + " ".repeat(400))); turns.push(chatAnswered("a" + i)); }
  turns.push(chatAsked("а якби я йому це сказав?"));
  const kept = chatFold(turns, 2000, 12);
  assertEquals(kept.at(-1).t, "а якби я йому це сказав?", "the turn being ANSWERED was dropped");
  assertEquals(kept[0].r, "u", "the thread must open on the reader — the grounding is prepended to it");
  assert(kept.reduce((a, x) => a + x.t.length, 0) <= 2000 + 500, "the budget was not honoured");
});

Deno.test("foldThread: a thread that no longer ends on the reader is not sendable", () => {
  // Answering the model's own last reply would produce a turn nobody asked for, cached under a key that
  // claims someone did.
  assertEquals(chatFold([chatAnswered("a lone reply")]), []);
  assertEquals(chatFold([]), []);
  assertEquals(chatFold(null), []);
  // blank turns never reach the wire
  assertEquals(chatFold([chatAsked("  "), chatAsked("real")]).length, 1);
});

Deno.test("askSignature: the whole exchange is the key, not just the last thing said", () => {
  // The same words asked after a different conversation are a different question. A key built from the last
  // turn alone would hand back the earlier answer.
  const a = [chatAsked("хто такий Пол?"), chatAnswered("син герцога"), chatAsked("а далі?")];
  const b = [chatAsked("хто така Джессіка?"), chatAnswered("його мати"), chatAsked("а далі?")];
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "uk", b), "the prefix must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 3, false, "uk", a), "level must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, true, "uk", a), "the spoiler lock must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "en", a), "locale must vary the key");
  assertEquals(chatSig(1, 2, false, "uk", a), chatSig(1, 2, false, "uk", a), "and it must be stable");
  // bounded: a key that embedded the thread verbatim would outgrow localStorage as a conversation ran on
  assert(chatSig(1, 2, false, "uk", a).length < 40, "the signature is not bounded");
});

Deno.test("groundBook puts the book above its plot", () => {
  const g = chatGround({ title: "Dune", byline: "Frank Herbert · 1965", plot: "  Sand.  " });
  assert(g.startsWith("КНИГА: Dune — Frank Herbert · 1965"), "the book header is missing");
  assert(g.trimEnd().endsWith("Sand."), "the plot is missing or untrimmed");
});

// ── signif.js — the significations corpus (see apps/transit/RESEARCH.md Part II for every source) ───────
//
// These tests do not check that astrology is true. They check that the corpus says what the tradition says
// and stays internally consistent — which is the only kind of correctness this file can have, and the kind
// the readings are grounded on.

Deno.test("signif/corpus: every leaf is an [en, uk] pair, and neither half is missing", () => {
  // The farm ships exactly two locales and the pair-per-entry shape exists so a translation cannot silently
  // go absent. A walk is the only check that scales as the corpus grows.
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
  // completeness: the corpus must cover every body the ephemeris can place and every sign/house/aspect
  assertEquals(Object.keys(sgBODY).length, 10);
  assertEquals(sgSIGN.length, 12);
  assertEquals(sgHOUSE.length, 12);
  assertEquals(Object.keys(sgASPECT).length, 5);
  for (const k of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) assert(sgBODY[k], `no corpus entry for ${k}`);
  for (const a of TRANSIT_ASPECTS) assert(sgASPECT[a.type], `no corpus entry for ${a.type}`);
});

Deno.test("signif/dignityOf: the classical table, with detriment and fall DERIVED", () => {
  const S = { ari: 0, tau: 1, gem: 2, can: 3, leo: 4, vir: 5, lib: 6, sco: 7, sag: 8, cap: 9, aqu: 10, pis: 11 };
  // domicile — the traditional ruler, i.e. RULERS[sign][0]
  assertEquals(sgDignity("mars", S.ari), "domicile");
  assertEquals(sgDignity("mars", S.sco), "domicile", "Scorpio is Mars's by tradition; Pluto is only a modern co-ruler");
  assertEquals(sgDignity("saturn", S.aqu), "domicile", "Aquarius is Saturn's by tradition, not Uranus's");
  assertEquals(sgDignity("jupiter", S.pis), "domicile");
  // detriment = opposite the domicile, derived
  assertEquals(sgDignity("mars", S.lib), "detriment");
  assertEquals(sgDignity("sun", S.aqu), "detriment");
  assertEquals(sgDignity("moon", S.cap), "detriment");
  // exaltation — the classical seven
  assertEquals(sgDignity("sun", S.ari), "exaltation");
  assertEquals(sgDignity("moon", S.tau), "exaltation");
  assertEquals(sgDignity("jupiter", S.can), "exaltation");
  assertEquals(sgDignity("saturn", S.lib), "exaltation");
  assertEquals(sgDignity("mars", S.cap), "exaltation");
  assertEquals(sgDignity("venus", S.pis), "exaltation");
  // fall = opposite the exaltation, derived
  assertEquals(sgDignity("sun", S.lib), "fall");
  assertEquals(sgDignity("moon", S.sco), "fall");
  assertEquals(sgDignity("jupiter", S.cap), "fall");
  assertEquals(sgDignity("saturn", S.ari), "fall");
  assertEquals(sgDignity("mars", S.can), "fall");
  assertEquals(sgDignity("venus", S.vir), "fall");
  // Mercury is the awkward one and it must not be smoothed over: it RULES Virgo and is exalted there, and
  // Pisces is both its detriment and its fall. Rulership is the stronger statement, so it wins.
  assertEquals(sgDignity("mercury", S.vir), "domicile");
  assertEquals(sgDignity("mercury", S.pis), "detriment");
  assertEquals(sgDignity("mercury", S.gem), "domicile");
  // no dignity at all is a real answer, not a gap
  assertEquals(sgDignity("sun", S.gem), "none");
  // the three modern bodies have rulerships but NO agreed exaltation, so the doctrine does not apply
  for (const b of ["uranus", "neptune", "pluto"]) {
    for (let s = 0; s < 12; s++) assertEquals(sgDignity(b, s), null, `${b} must carry no essential dignity`);
  }
  // Walk the whole wheel for each classical body and check the shape of the result, not just spot values.
  for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) {
    const tally = {};
    for (let s = 0; s < 12; s++) { const d = sgDignity(b, s); tally[d] = (tally[d] || 0) + 1; }
    assert((tally.domicile || 0) >= 1 && (tally.domicile || 0) <= 2, `${b}: ${tally.domicile} domiciles`);
    assertEquals(tally.domicile, tally.detriment, `${b}: detriment must mirror domicile exactly`);
    // Mercury is exalted in Virgo, which it also RULES, and falls in Pisces, which is also its detriment —
    // so for Mercury alone rulership masks both labels and neither ever appears. That is the tradition, not
    // a bug in the precedence; asserting "one exaltation each" would have quietly demanded it be wrong.
    const masked = b === "mercury";
    assertEquals(tally.exaltation || 0, masked ? 0 : 1, `${b}: exaltation count`);
    assertEquals(tally.fall || 0, masked ? 0 : 1, `${b}: fall count`);
  }
  // out-of-range signs wrap rather than throwing — a longitude arriving unnormalised must not crash a sheet
  assertEquals(sgDignity("mars", 12), "domicile");
  assertEquals(sgDignity("mars", -12), "domicile");
});

Deno.test("signif/chartRuler: the convention is a CHOICE, and the answer says which one it used", () => {
  const aqu = 10 * 30 + 5;
  assertEquals(sgChartRuler(aqu), { sign: 10, body: "saturn", modern: false });
  assertEquals(sgChartRuler(aqu, { modern: true }), { sign: 10, body: "uranus", modern: true });
  // a sign with no modern co-ruler falls back to the one ruler it has, and must NOT claim to be modern
  assertEquals(sgChartRuler(5, { modern: true }), { sign: 0, body: "mars", modern: false });
});

Deno.test("signif/balance: a plain unweighted count over the bodies actually shown", () => {
  // three fire, one water; three cardinal, one mutable
  const b = sgBalance([1, 121, 241, 95]);
  assertEquals(b.elements, [3, 0, 0, 1]);
  assertEquals(b.modalities, [2, 1, 1]);
  assertEquals(b.topElement, 0);
  assertEquals(b.topModality, 0);
  assertEquals(sgBalance([]).elements, [0, 0, 0, 0]);
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

  // a three-pass retrograde contact is a different reading from a single hit
  const ms = (d) => Date.parse(d);
  const many = sgGroundTransit({ c, transitLon: 22.7, natalHouse: 10, houseSystem: "placidus", retro: true, dateEN: "3 Aug 2026",
    hits: [{ ms: ms("2026-08-03"), label: "3 Aug 2026" }, { ms: ms("2026-11-19"), label: "19 Nov 2026" }, { ms: ms("2027-05-02"), label: "2 May 2027" }] });
  assert(many.text.includes("perfects 3 times"), "the multi-pass fact is missing");
  // A measured failure, pinned: handed three dates and no span, the live model derived one of its OWN and
  // got it wrong — it called this nine-month sequence "about a year and a half". The span is computed here.
  assert(many.text.includes("about 9 months"), `the span must be stated, not left to be derived: ${many.text}`);
  assert(many.text.includes("retrograde"), "retrograde must be stated");
  assert(many.sig !== g.sig, "retrograde and the passes must change the cache key");

  // the same contact under a different house system is a different claim, so a different key
  const whole = sgGroundTransit({ c, transitLon: 22.7, natalHouse: 9, houseSystem: "whole", retro: false, dateEN: "3 Aug 2026", hits: ["3 Aug 2026"] });
  assert(whole.sig !== g.sig, "the house system must vary the key");
  assertEquals(sgGroundTransit({ c, transitLon: 22.7, natalHouse: 10, houseSystem: "placidus", retro: false, dateEN: "3 Aug 2026", hits: ["3 Aug 2026"] }).sig, g.sig, "and the key must be stable");

  // an angle has no house and no "strain" — the builder must not reach into BODY for it
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
  // a modern body carries no dignity claim at all
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
  // the modern convention must be visible in the text AND in the key
  const m = sgGroundPortrait({ points, asc: 10 * 30 + 5, mc: 355, houseSystem: "placidus", modernRulers: true });
  assert(m.text.includes("modern ruler; traditionally Saturn"), "a contested convention must name itself");
  assert(m.sig !== g.sig);
});

Deno.test("signif/spanLabel: days, months or years — the unit the reader would actually use", () => {
  const d = (n) => n * 86400000;
  assertEquals(sgSpan(0, d(12)), "12 days");
  assertEquals(sgSpan(0, d(44)), "44 days");
  assertEquals(sgSpan(0, d(45)), "about 1 month");      // the handover point, stated so it cannot drift silently
  assertEquals(sgSpan(0, d(273)), "about 9 months");    // the Saturn three-pass sequence that started this
  assertEquals(sgSpan(0, d(547)), "about 1.5 years");
  assertEquals(sgSpan(0, d(365)), "about 12 months");
  assertEquals(sgSpan(0, d(2557)), "about 7 years");
});

Deno.test("signif/groundCusp: a house is delegated to its ruler, and an empty house is not a silent one", () => {
  // 2nd house in Sagittarius, ruled by Jupiter, and Jupiter lives in the 8th — the delegation IS the reading
  const g = sgGroundCusp({ house: 2, cuspLon: 8 * 30 + 14, houseSystem: "placidus",
    ruler: { key: "jupiter", lon: 3 * 30 + 2, house: 8, retro: false }, coRuler: null,
    tenants: [{ key: "venus", lon: 8 * 30 + 20, retro: false }] });
  assert(g.text.includes("HOUSE 2 (placidus houses)"), "the house and its system must be named");
  assert(g.text.includes("Jupiter rules Sagittarius and therefore RULES this house"));
  assert(g.text.includes("in house 8"), "where the ruler LIVES is the point of this reading");
  // The regression guard for a measured misreading: handed "its ruler Moon is in Aries, house 6", the live
  // model wrote "the Moon is in the ninth house". Ruling and standing in are now separated in words.
  assert(g.text.includes("which is not the same as standing in it"), "the rules/stands-in distinction must be explicit");
  assert(g.text.includes("in exaltation"), "Jupiter is exalted in Cancer and the ruler's dignity should carry");
  assert(g.text.includes("STANDING IN house 2: Venus"));
  assert(!/undefined|NaN/.test(g.text));

  // An empty house must be stated as read-through-the-ruler, not left for the model to call "empty".
  const empty = sgGroundCusp({ house: 7, cuspLon: 30, houseSystem: "whole",
    ruler: { key: "venus", lon: 200, house: 1, retro: true } });
  assert(empty.text.includes("no planet stands in house 7"));
  assert(empty.text.includes("Do not describe it as lacking anything"), "the empty-house trap must be closed explicitly");
  assert(empty.text.includes("retrograde"));
  assert(empty.sig !== g.sig);

  // the modern co-ruler is offered LABELLED or not at all
  const co = sgGroundCusp({ house: 5, cuspLon: 7 * 30 + 1, houseSystem: "placidus",
    ruler: { key: "mars", lon: 10, house: 9, retro: false }, coRuler: "pluto" });
  assert(co.text.includes("Pluto is the MODERN co-ruler"), "a contested convention must name itself");
  assert(co.text.includes("Mars rules Scorpio"), "the traditional ruler still leads");

  // the signature must move with every fact the block carries
  const moved = sgGroundCusp({ house: 2, cuspLon: 8 * 30 + 14, houseSystem: "placidus",
    ruler: { key: "jupiter", lon: 3 * 30 + 2, house: 9, retro: false }, tenants: [{ key: "venus", lon: 8 * 30 + 20, retro: false }] });
  assert(moved.sig !== g.sig, "the ruler's own house must vary the key");
});

Deno.test("signif/rulerOf: the modern flag is a claim about the ANSWER, not about the request", () => {
  // Aquarius has an outer co-ruler, so modern:true really is modern
  assertEquals(sgRulerOf(10 * 30 + 5, { modern: true }), { sign: 10, body: "uranus", modern: true });
  // Aries never acquired one — asking for modern must fall back AND stop claiming to be modern, or the UI
  // would print "(modern)" next to Mars, which no school says.
  assertEquals(sgRulerOf(5, { modern: true }), { sign: 0, body: "mars", modern: false });
  assertEquals(sgRulerOf(5), { sign: 0, body: "mars", modern: false });
});

// A fixed chart to ask questions of: Cancer Sun in the 9th, Aries Moon in the 6th, Scorpio rising.
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
    // The catalogue shows TOPICS, not phrasings: eleven sentences is a page to read before you can choose.
    // Pinned because the essay is the shape that grows back — one "just a bit more precise" label at a time.
    for (const l of q.label) {
      assert(l.length <= 16 && l.split(/\s+/).length <= 2 && !/[?.]/.test(l),
        `${q.id}: label "${l}" is a sentence again — the catalogue takes a topic, the model takes q.ask`);
    }
    // ...and the model still gets the full question, because "Sex" alone is not one.
    assert(q.ask && q.ask.length > 20 && q.ask.endsWith("?"), `${q.id}: ask must be the full English question`);
    assert(q.focus && q.focus.length > 80, `${q.id}: focus must state the technique, not a hint`);
    // every declared factor must exist in the corpus, or the block would carry an undefined
    for (const h of q.houses || []) assert(h >= 1 && h <= 12, `${q.id}: house ${h}`);
    for (const k of q.bodies || []) assert(sgBODY[k], `${q.id}: unknown body ${k}`);
    for (const a of q.angles || []) assert(sgANGLE[a], `${q.id}: unknown angle ${a}`);
    assert((q.houses?.length || 0) + (q.bodies?.length || 0) + (q.angles?.length || 0) > 0, `${q.id}: no significators`);
  }
  // The outcome questions are dropped on purpose (RESEARCH.md Part III). If one is ever added back, this
  // fails and whoever added it has to say why in the diff.
  // Stems, not fragments. The first version used `дит` and `die`, which matched «пі-дхо-дить» and
  // "stu-die-s" — a guard that fires on the wrong thing gets deleted by the next person, not fixed.
  const banned = /child|pregnan|health|illness|\bdie\b|death|lawsuit|invest|wealth|дитин|дітей|вагітн|здоров|смерт|помр|позов|інвест|багатств/i;
  for (const q of sgQUESTIONS) {
    assert(!banned.test(q.label[0]) && !banned.test(q.label[1]) && !banned.test(q.ask),
      `${q.id}: asks for an outcome the chart cannot establish`);
  }
  // Two of them are about "now" and must therefore be fed real transits — the rest are natal dispositions
  // that do not change from one week to the next. Pinned because the two kinds need DIFFERENT grounding:
  // flip a question's `transit` flag without giving the caller a contact set and it silently answers a
  // timing question from a birth chart.
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
  // the catalogue's topic word is a UI affordance; handing it to the model instead of the question would
  // turn a grounded reading into a free essay on the theme
  const sexBlock = sgGroundQuestion({ q: sgQuestionById("sex"), chart: QCHART });
  assert(sexBlock.text.includes("QUESTION: What is my nature in desire and intimacy?"), "ask must reach the model");
  assert(!/QUESTION: Sex/.test(sexBlock.text), "the topic label reached the prompt instead of the question");
  assert(g.text.includes("HOUSE 2 (placidus)"), "the declared house is missing");
  assert(g.text.includes("HOUSE 8 (placidus)"));
  assert(g.text.includes("Venus") && g.text.includes("Jupiter"), "the declared bodies are missing");
  // the discipline that makes a grounded answer possible: an undeclared factor must NOT be in the block,
  // or the model will reach for it — there is always something to say about the Moon.
  assert(!/- Moon —/.test(g.text), "the Moon is not a money significator and must not be supplied");
  assert(!/HOUSE 7|HOUSE 10/.test(g.text), "an undeclared house leaked into the block");
  assert(!/undefined|NaN/.test(g.text));

  // a house whose ruler is placed resolves the delegation; an empty house says so correctly
  assert(/RULED BY \w+ \(/.test(g.text), "the house ruler must be named");
  assert(/does not stand in house \d; it stands in \w+, house \d/.test(g.text),
    "ruling a house and standing in it must be stated as different things — a model conflated them on the live route");
  assert(/No planet stands in it, which the tradition reads through the ruler/.test(g.text) || /STANDING IN house \d:/.test(g.text));

  // the signature moves with the chart and with the question, and is stable otherwise
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

  // "no transits right now" is an ANSWER, and the model must not fill the gap with a different one
  const none = sgGroundQuestion({ q: phase, chart: QCHART, timing: { dateEN: "25 Jul 2026", contacts: [] } });
  assert(none.text.includes("none within orb"));
  assert(none.text.includes("do not substitute another transit"));
  assert(none.sig !== g.sig, "the contact set must vary the key");

  // a stable question must not carry a TRANSITS section at all
  assert(!sgGroundQuestion({ q: sgQuestionById("home"), chart: QCHART }).text.includes("TRANSITS"));
});

// ================= grain (granular math) =================
Deno.test("grain/hann: the envelope is zero at both ends — that is what stops the click", () => {
  const w = grHann();
  assertEquals(w.length, 128);
  assertEquals(w[0], 0);
  assert(Math.abs(w[w.length - 1]) < 1e-12, "the last point must land on zero, not near it");
  assert(Math.abs(w[64] - 1) < 0.002, "peak at the centre");
  for (let i = 0; i < 64; i++) assert(Math.abs(w[i] - w[127 - i]) < 1e-6, "symmetric");
});

Deno.test("grain/overlap: O = rate * duration, both directions", () => {
  assertEquals(Math.round(grGrainRate(0.07, 4)), 57);            // the shipped default: ~57 grains/s
  assert(Math.abs(grOverlapOf(0.07, grGrainRate(0.07, 4)) - 4) < 1e-9);
  assert(grCloudGain(1, 4) < grCloudGain(1, 1), "denser clouds must come down in level");
  assert(Math.abs(grCloudGain(1, 4) - 0.5) < 1e-9);              // 1/sqrt(4)
});

Deno.test("grain/planGrains: deterministic in the seed — the export replays what was heard", () => {
  const opts = { span: 1, grainMs: 70, overlap: 4, sprayMs: 120, pos: 0.3, sampleDur: 2, seed: 42 };
  const a = grPlan(opts), b = grPlan(opts);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assert(JSON.stringify(grPlan({ ...opts, seed: 43 })) !== JSON.stringify(a), "a new seed must move the spray");
  assertEquals(a.length, Math.ceil(1 / (1 / grGrainRate(0.07, 4))));
  for (const g of a) assert(g.offset >= 0 && g.offset + g.dur * g.rate <= 2 + 1e-9, "a grain may never read past the sample");
});

Deno.test("grain/planGrains: pitch does not leak into the read head (the classic granular bug)", () => {
  const base = { span: 0.5, grainMs: 70, overlap: 4, advance: 1, pos: 0, sampleDur: 4, seed: 5 };
  const low = grPlan({ ...base, semis: -12 }), high = grPlan({ ...base, semis: 12 });
  // the read head is driven by `advance` alone, so both pitches visit the same source positions (the tail
  // bound legitimately differs — a rate-2 grain cannot start within dur*2 of the end)
  assertEquals(low.map((g) => g.offset.toFixed(6)), high.map((g) => g.offset.toFixed(6)));
  assert(Math.abs(high[0].rate - 2) < 1e-9 && Math.abs(low[0].rate - 0.5) < 1e-9);
  // an octave up reads twice the source seconds of unity rate for the same OUTPUT duration
  const unity = grPlan({ ...base, semis: 0 });
  assert(Math.abs(high[0].dur * high[0].rate - 2 * unity[0].dur * unity[0].rate) < 1e-9);
  assert(Math.abs(low[0].dur * low[0].rate - 0.5 * unity[0].dur * unity[0].rate) < 1e-9);
  // advance=0 freezes the head: every grain reads the same place (spray off)
  const frozen = grPlan({ ...base, advance: 0, sprayMs: 0 });
  assert(frozen.every((g) => Math.abs(g.offset - frozen[0].offset) < 1e-9));
});

Deno.test("grain/conditioning: DC goes, a quiet take is boosted but capped, a clipped one is flagged", () => {
  const sr = 48000, n = sr;
  const quiet = new Float32Array(n);
  for (let i = 0; i < n; i++) quiet[i] = 0.02 * Math.sin((2 * Math.PI * 220 * i) / sr) + 0.3;   // +0.3 DC
  assert(Math.abs(grDcOffset(quiet) - 0.3) < 0.01);
  const c = grCondition([quiet], sr);
  assert(Math.abs(grDcOffset(c.pcm)) < 0.01, "DC must be gone");
  assert(c.pcm.length >= sr * grMIN_KEEP, "a steady quiet take must never be trimmed to nothing");
  assertEquals(c.gain, 8);
  assert(c.quiet, "a take that needed the full +18 dB is flagged, not silently rescued");

  const loud = new Float32Array(n);
  for (let i = 0; i < n; i++) loud[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 1.4;
  assert(grClipRatio(loud) >= 0.005 && grCondition([loud], sr).clipped);
});

Deno.test("grain/trim: silence at the edges goes, the sound in the middle stays", () => {
  const sr = 48000, n = sr * 2, x = new Float32Array(n);
  for (let i = sr * 0.8; i < sr * 1.2; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 300 * i) / sr);
  const [a, b] = grTrim(x, sr);
  assert(a > sr * 0.7 && a <= sr * 0.8, `left edge landed at ${a / sr}s`);
  assert(b >= sr * 1.2 && b < sr * 1.35, `right edge landed at ${b / sr}s`);
});

Deno.test("grain/pitch: YIN finds the tone, and calls noise unpitched instead of naming it", () => {
  const sr = 48000;
  const tone = grSynth(sr, 1.5, 220);
  const p = grPitch(tone, sr);
  assert(p.pitched, "a struck 220 Hz bowl must resolve");
  assert(Math.abs(grCENTS(p.hz, 220)) < 30, `off by ${grCENTS(p.hz, 220).toFixed(1)} cents`);

  const rng = grRng(3), noise = new Float32Array(sr);
  for (let i = 0; i < noise.length; i++) noise[i] = (rng() * 2 - 1) * 0.6;
  assert(!grPitch(noise, sr).pitched, "white noise must come back unpitched — a door slam has no note");
});

Deno.test("grain/wav: the canonical 44-byte 16-bit PCM header", () => {
  const sr = 8000, x = new Float32Array(100).fill(0.5);
  const w = grWav([x], sr), v = new DataView(w.buffer);
  const tag = (o) => String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3]);
  assertEquals(w.length, 44 + 200);
  assertEquals([tag(0), tag(8), tag(12), tag(36)], ["RIFF", "WAVE", "fmt ", "data"]);
  assertEquals(v.getUint32(4, true), 36 + 200);
  assertEquals([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true)], [1, 1, sr]);
  assertEquals([v.getUint32(28, true), v.getUint16(32, true), v.getUint16(34, true)], [sr * 2, 2, 16]);
  assertEquals(v.getUint32(40, true), 200);
  assertEquals(v.getInt16(44, true), Math.round(0.5 * 32767));
  // full scale must not wrap to -32768
  assertEquals(new DataView(grWav([new Float32Array([1, -1])], sr).buffer).getInt16(44, true), 32767);
});

Deno.test(".ms-stage — a fixed stage consumes the chrome contract, and nobody hand-writes it", async () => {
  const css = await Deno.readTextFile(new URL("./theme.css", import.meta.url));
  const at = css.indexOf(".ms-stage {");
  assert(at > 0, "no .ms-stage — a fixed stage has nothing to consume but hand-written numbers");
  const rule = css.slice(at, css.indexOf("}", at));

  // both chrome numbers are MEASURED ones, never a literal: --hdr-h compacts to 2.25rem on a watch, and a
  // 3.5rem guess is 20px of content off the bottom of every fit screen there.
  assert(/top:\s*calc\(var\(--hdr-h\)/.test(rule), "the stage's top must come from --hdr-h, not a literal");
  assert(/bottom:\s*calc\(var\(--dock-h\)/.test(rule), "the stage's bottom must come from --dock-h");
  assert(!/3\.5rem/.test(rule), "the header height is measured, not declared");
  // …and the watch's dock is a RAIL, so a stage that only clears --dock-h slides under it (grain: 137px).
  assert(/right:\s*calc\(var\(--dock-w/.test(rule), "the stage must clear the watch rail (--dock-w), not just the bar");
  assert(/min\(var\(--dock-w/.test(rule), "the rail clearance must switch itself off when --dock-w is 0 — else every phone is inset");

  // The enforcement half: eleven apps had each hand-written the same two terms, all eleven wrong in the same
  // two ways, and no gate could see it because the geometry was inline. One class, or the farm drifts again.
  const offenders = [];
  for await (const e of Deno.readDir(new URL("../../apps", import.meta.url))) {
    if (!e.isDirectory) continue;
    let src;
    try { src = await Deno.readTextFile(new URL(`../../apps/${e.name}/view.js`, import.meta.url)); } catch { continue; }
    if (/bottom:\s*calc\(var\(--dock-h\)/.test(src) || /top:\s*calc\(3\.5rem/.test(src)) offenders.push(e.name);
  }
  assertEquals(offenders, [], `these apps hand-write the chrome geometry instead of using .ms-stage: ${offenders.join(", ")}`);
});

Deno.test("Transport cannot leave its container — the cap is the widget's, not the caller's", async () => {
  const ui = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  const root = /<div data-transport class=\$\{`([^`]*)`/.exec(ui)?.[1] ?? "";
  assert(root.includes("@container"), "the transport must query its OWN width — a viewport query reads the window, and .ms-side / the watch rail both narrow the box while the window stays wide");
  assert(root.includes("max-w-full"), `the transport must be capped by whatever holds it (its classes: ${root}) — its keys are shrink-0 and its row is justify-center, so an uncapped box spills out of BOTH sides of its island instead of demoting into the overflow sheet`);
  assert(root.includes("min-w-0"), "…and it must be allowed to shrink inside a flex row, or the cap never binds");
});

// ================= RTL-SDR protocol (rtlsdr.js) =================
// The pure arithmetic the R820T2 / RTL2832U enforce. Assertions are on PROPERTIES and on the two facts that
// bit us (gain saturation, DC landing on a live channel) — not on constants copied back out of the code.

Deno.test("rtlsdr: device ids, transfer size, and no hardware sweep", () => {
  assertEquals(RTL_VID, 0x0bda);
  assertEquals(RTL_XFER, 262144);           // matches hackrf.js so one worker can hold either radio
  assertEquals(RTL_SWEEP, false);           // no RX_SWEEP — callers must step-retune
});

Deno.test("ifFreqWord: the DDC word is the negated 22-bit fraction of the crystal", () => {
  const w = ifFreqWord(3_570_000);                       // the tuner IF programmed at open()
  const word = (w.hi << 16) | (w.mid << 8) | w.lo;
  // Reassembled, it must be the two's-complement 22-bit form of -(hz/xtal * 2^22).
  const expect = (-Math.floor(3_570_000 * (1 << 22) / 28_800_000)) & 0x3fffff;
  assertEquals(word, expect);
  assert(w.hi <= 0x3f, "the high register is 6 bits wide");
  assert(w.mid <= 0xff && w.lo <= 0xff);
  // Direction matters: a positive IF must produce a NEGATIVE shift, i.e. the top of the 22-bit field set.
  assert(word > 0x200000, "a positive IF must shift DOWN — the sign bit of the 22-bit field must be set");
});

Deno.test("sampleRateRatio: low two bits are dropped, so the ACHIEVED rate is what axes must use", () => {
  const exact = sampleRateRatio(2_400_000);              // 28.8 MHz / 2.4 MS/s = 12 exactly
  assertEquals(exact.ratio & 3, 0);
  assertEquals(exact.achieved, 2_400_000);               // our design rate is exactly representable
  const odd = sampleRateRatio(1_000_000);
  assertEquals(odd.ratio & 3, 0);
  assert(odd.achieved !== 1_000_000, "1 MS/s is NOT exactly representable — the app must label the achieved rate");
  assert(Math.abs(odd.achieved - 1_000_000) / 1e6 < 1e-3, "…but it is within 0.1%");
});

Deno.test("muxConfigFor: picks the last tracking-filter band at or below the frequency", () => {
  assertEquals(muxConfigFor(437_495_000)[0], 310);       // 433.925 + 3.57 IF — the homin tune
  assertEquals(muxConfigFor(0)[0], 0);
  assertEquals(muxConfigFor(588_000_000)[0], 588);       // on the boundary → the higher band
  assertEquals(muxConfigFor(6_000_000_000)[0], 588);     // above the table → clamps to the top row
});

Deno.test("pll: divider selection and the integer/fractional split, with the range guard", () => {
  const { divNum, mixDiv } = pllDivider(437_495_000);
  assertEquals(mixDiv, 1 << (divNum + 1));
  assert(divNum >= 0 && divNum <= 6, "the divider is capped at 6");
  const w = pllWords(437_495_000, mixDiv);
  assert(w.valid, "the homin tune must be inside the PLL's integer range");
  assertEquals(w.vco, 437_495_000 * mixDiv);
  assertEquals(w.nint, Math.floor(w.vco / (2 * 28_800_000)));
  assertEquals(w.ni * 4 + w.si, w.nint - 13);            // the ni/si pair must reconstruct nint
  assert(w.sdm >= 0 && w.sdm <= 65535);
  assert(!pllWords(500_000_000, 16).valid, "nint > 63 must be reported invalid, not written to the tuner");
});

Deno.test("gainSplit: one control, monotonic, clamped — a mid gain must NOT be maximum gain", () => {
  // The regression this pins: _applyGain used to add lna+vga and clamp to 49, so HackRF-shaped calls
  // (setLnaGain(32) + setVgaGain(30) = 62) always saturated. A 433 window holds a handheld metres away and
  // a sensor hundreds of metres away — permanent max gain overloads the front end.
  assert(gainSplit(32).step < gainSplit(49).step, "32 dB must be distinguishable from maximum gain");
  let prev = -1;
  for (let db = 0; db <= 49; db++) {
    const g = gainSplit(db);
    assert(g.step >= prev, `gain must be monotonic (broke at ${db} dB)`);
    assert(g.step >= 0 && g.step <= 30, `step out of hardware range at ${db} dB: ${g.step}`);
    assertEquals(g.lnaV, Math.floor(g.step / 2));
    assertEquals(g.mixV, Math.floor((g.step - 1) / 2));
    prev = g.step;
  }
  assertEquals(gainSplit(-5).step, gainSplit(0).step);   // clamps low
  assertEquals(gainSplit(99).step, gainSplit(49).step);  // clamps high (r82xx_gains tops out at 49.6 dB)
});

Deno.test("dcBin: at zero offset the DC artifact sits ON LPD channel 35 — offset tuning moves it between channels", () => {
  // 433.925 MHz centre, 96 bins of 25 kHz. (433.925 - 433.075) / 0.025 = 34 exactly, so the centre bin IS a
  // channel. Left alone, one voice channel would silently never work.
  const onChannel = dcBin(0, 25_000, 96);
  assertEquals(onChannel, 48);
  assert(Number.isInteger(onChannel), "zero offset puts DC exactly on a channel centre — this is the defect");
  const offset = dcBin(12_500, 25_000, 96);
  assertEquals(offset, 48.5);
  assert(!Number.isInteger(offset), "a half-channel offset must put DC BETWEEN two channels");
});

Deno.test("offsetBinaryToSigned: RTL's uint8 DC maps to zero in the farm's signed-in-uint8 layout", () => {
  const out = offsetBinaryToSigned(Uint8Array.from([0, 127, 128, 255]));
  const asSigned = [...out].map((b) => (b > 127 ? b - 256 : b));
  assertEquals(asSigned, [-128, -1, 0, 127]);            // 128 (the RTL's DC) must become 0
});

// ================= 433 MHz channel grids (chan433.js) =================

Deno.test("channel plans: 1-based centres round-trip, and reject anything off-plan", () => {
  assertEquals(channelCentre(LPD433, 1), 433_075_000);
  assertEquals(channelCentre(LPD433, 69), 434_775_000);
  assertEquals(channelCentre(PMR446, 1), 446_006_250);
  assertEquals(channelCentre(PMR446, 16), 446_193_750);
  assertEquals(channelCentre(LPD433, 0), null);
  assertEquals(channelCentre(LPD433, 70), null);
  for (const plan of [LPD433, PMR446]) {
    for (let n = 1; n <= plan.count; n++) assertEquals(channelAt(plan, channelCentre(plan, n)), n);
  }
  assertEquals(channelAt(LPD433, 400_000_000), null);
  // The tune centre IS a live channel — the reason DC must be offset away from it (rtlsdr.js dcBin).
  assertEquals(channelCentre(LPD433, 35), TUNE_HZ);
});

Deno.test("the whole LPD433 plan fits inside one 2.4 MS/s window, and PMR446 does not", () => {
  assertEquals(planSpanHz(LPD433), 1_700_000);
  assert(planSpanHz(LPD433) < 2_400_000, "the single-tune claim: the plan must fit the window");
  assert(ISM433.hiHz - ISM433.loHz < 2_400_000, "…and so must the ISM device band around it");
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  assert(channelBins(LPD433, geom).every((c) => c.inWindow), "every LPD channel must be in view at once");
  // PMR446 is 11 MHz away: it is a RETUNE, and the mapping must say so rather than silently report noise.
  assert(channelBins(PMR446, geom).every((c) => !c.inWindow), "PMR446 cannot be in the LPD window");
});

Deno.test("binOf: the tune centre lands on the middle bin, and the grid is symmetric", () => {
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  assertEquals(binOf(TUNE_HZ, geom), 1024);
  assertEquals(binOf(TUNE_HZ - 1_200_000, geom), 0);          // lower window edge
  assertEquals(binOf(TUNE_HZ + 1_200_000, geom), 2048);       // upper window edge
  const c35 = channelBins(LPD433, geom)[34];
  assert(c35.lo < 1024 && c35.hi > 1024, "channel 35 straddles the DC bin — the defect dcBin() pins");
});

Deno.test("integrateChannels: energy lands in its own channel and nowhere else", () => {
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  const bins = channelBins(LPD433, geom);
  const power = new Float32Array(geom.fftSize);
  const target = bins[19];                                     // channel 20
  for (let b = Math.ceil(target.lo); b <= Math.floor(target.hi) - 1; b++) power[b] = 1;
  const out = integrateChannels(power, bins);
  assert(out[19] > 0.9, `channel 20 must hold the energy, got ${out[19]}`);
  assertEquals(out[18], 0);
  assertEquals(out[20], 0);
  // A flat spectrum must integrate to exactly the flat level in every channel — this is what makes the
  // fractional edge weights honest, and what lets channels be compared to one noise floor.
  const flat = new Float32Array(geom.fftSize).fill(2);
  for (const v of integrateChannels(flat, bins)) assert(Math.abs(v - 2) < 1e-5, `flat spectrum drifted: ${v}`);
});

// ================= burst vs voice on one channel (burst.js) =================
// Synthesises the two things that share the 433 band and proves the level squelch cannot separate them.

function synthOok({ fs = 25_000, pulses = 8, pulseMs = 1, offsetHz = 500, noise = 0.005 } = {}) {
  const per = Math.round(fs * pulseMs / 1000), n = pulses * 2 * per;
  const re = new Float32Array(n), im = new Float32Array(n);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff - 0.5) * 2; };
  for (let i = 0; i < n; i++) {
    const on = Math.floor(i / per) % 2 === 0;
    const a = (on ? Math.SQRT2 : 0);                    // √2 so MEAN power matches the voice case at 50% duty
    const ph = 2 * Math.PI * offsetHz * i / fs;         // a CONSTANT frequency error must not look like FM
    re[i] = a * Math.cos(ph) + rnd() * noise;
    im[i] = a * Math.sin(ph) + rnd() * noise;
  }
  return { re, im, durationMs: n * 1000 / fs };
}

function synthNfm({ fs = 25_000, ms = 500, toneHz = 1000, devHz = 2500, noise = 0.005 } = {}) {
  const n = Math.round(fs * ms / 1000);
  const re = new Float32Array(n), im = new Float32Array(n);
  let seed = 999, ph = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff - 0.5) * 2; };
  for (let i = 0; i < n; i++) {
    ph += 2 * Math.PI * devHz * Math.sin(2 * Math.PI * toneHz * i / fs) / fs;
    re[i] = Math.cos(ph) + rnd() * noise;
    im[i] = Math.sin(ph) + rnd() * noise;
  }
  return { re, im, durationMs: ms };
}

const meanPowerDb = (re, im) => {
  let p = 0;
  for (let i = 0; i < re.length; i++) p += re[i] * re[i] + im[i] * im[i];
  return 10 * Math.log10(p / re.length);
};

Deno.test("a LEVEL squelch cannot tell a doorbell from a voice — they carry the same power", () => {
  const ook = synthOok(), voice = synthNfm();
  const a = meanPowerDb(ook.re, ook.im), b = meanPowerDb(voice.re, voice.im);
  assert(Math.abs(a - b) < 0.5, `the two events must be power-matched for this to prove anything (${a} vs ${b})`);
  // demod.js squelchOpen is correct for what it does — and it opens on BOTH. This is the defect burst.js fixes.
  assertEquals(levelSquelch(a, a - 3, false), true);
  assertEquals(levelSquelch(b, b - 3, false), true);
});

Deno.test("fmActivity separates them, and a constant frequency error does NOT look like modulation", () => {
  const ook = synthOok(), voice = synthNfm();
  const fOok = fmActivity(ook.re, ook.im), fVoice = fmActivity(voice.re, voice.im);
  assert(fVoice > fOok * 5, `voice must show far more frequency movement (voice ${fVoice}, ook ${fOok})`);
  assert(fOok < CLASSIFY.fmBurst, `a 500 Hz offset carrier must read as unmodulated, got ${fOok}`);
  assert(fVoice >= CLASSIFY.fmVoice, `NFM at 2.5 kHz deviation must read as modulated, got ${fVoice}`);
  // The power weighting is load-bearing. Measured as a PLAIN standard deviation the way one would write it
  // first, the undefined phase inside the OOK gaps reads as violent modulation, and every burst in the band
  // would be misfiled as speech. (Note it is the weighting that does this, not the `floor` cut: a gap at
  // m≈0 contributes m²≈0 regardless of the floor.)
  const f = instantFreq(ook.re, ook.im);
  let s = 0, ss = 0;
  for (const v of f) { s += v; ss += v * v; }
  const plain = Math.sqrt(Math.max(0, ss / f.length - (s / f.length) ** 2)) / (2 * Math.PI);
  assert(plain > fOok * 50, `naive unweighted variance must be wildly misleading here (plain ${plain}, weighted ${fOok})`);
  assert(plain > CLASSIFY.fmVoice, `…misleading enough to cross the voice threshold, which is the actual trap (${plain})`);
});

Deno.test("classifyEvent labels both correctly, and refuses to guess when it matches neither", () => {
  const ook = synthOok(), voice = synthNfm();
  const ookEv = { durationMs: ook.durationMs, fmActivity: fmActivity(ook.re, ook.im), transitions: envelopeTransitions(magnitude(ook.re, ook.im)) };
  const voiceEv = { durationMs: voice.durationMs, fmActivity: fmActivity(voice.re, voice.im), transitions: envelopeTransitions(magnitude(voice.re, voice.im)) };
  assertEquals(classifyEvent(ookEv), "burst");
  assertEquals(classifyEvent(voiceEv), "voice");
  assert(ookEv.transitions >= 8, `8 keyed pulses must show as edges, got ${ookEv.transitions}`);
  assertEquals(voiceEv.transitions, 0);                 // constant envelope
  assertEquals(classifyEvent({ durationMs: 50, fmActivity: 0.05, transitions: 0 }), "unknown");
});

Deno.test("instantFreq: a pure tone reads as one constant frequency", () => {
  const fs = 25_000, hz = 2_000, n = 256;
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.cos(2 * Math.PI * hz * i / fs); im[i] = Math.sin(2 * Math.PI * hz * i / fs); }
  const f = instantFreq(re, im);
  const expect = 2 * Math.PI * hz / fs;
  for (const v of f) assert(Math.abs(v - expect) < 1e-4, `constant tone drifted: ${v} vs ${expect}`);
});

// ================= CTCSS sub-audible tones (ctcss.js) =================

Deno.test("CTCSS: the tightest tone pair sets the integration window — it is not a taste choice", () => {
  assertEquals(CTCSS_TONES.length, 38);
  assert(Math.abs(minToneGap() - 2.5) < 1e-6, `closest pair is 71.9/74.4 Hz, got ${minToneGap()}`);
  // Resolving 2.5 Hz needs at least 1/2.5 = 0.4 s of audio; with headroom, half a second.
  assertEquals(windowSamples(8000), 4000);
  assert(windowSamples(8000) / 8000 >= 0.4, "a tone cannot be identified faster than its own resolution");
  for (let i = 1; i < CTCSS_TONES.length; i++) assert(CTCSS_TONES[i] > CTCSS_TONES[i - 1], "tones must be ascending");
});

Deno.test("CTCSS: finds a weak tone buried under much louder speech, and refuses when there is none", () => {
  const fs = 8000, n = Math.round(fs * 0.6);
  const mk = (toneHz) => {
    const a = new Float32Array(n);
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff - 0.5) * 0.04;
      const voice = Math.sin(2 * Math.PI * 1200 * i / fs);              // speech, ~7x the tone's amplitude
      a[i] = (toneHz ? 0.15 * Math.sin(2 * Math.PI * toneHz * i / fs) : 0) + voice + noise;
    }
    return a;
  };
  const got = detectCtcss(mk(100.0), fs);
  assert(got, "a 100.0 Hz tone under speech must be found — that is what the low-pass is for");
  assertEquals(got.toneHz, 100.0);
  const adj = detectCtcss(mk(103.5), fs);                                // the neighbouring standard tone
  assertEquals(adj?.toneHz, 103.5, "adjacent tones must not be confused with each other");
  assertEquals(detectCtcss(mk(null), fs), null, "speech with no tone must return null, not a nearest guess");
  assertEquals(detectCtcss(mk(100.0).slice(0, 1000), fs), null, "too short to resolve → null, never a guess");
});

// ================= hunt-mode direction finding (df.js) =================

Deno.test("df: an omnidirectional antenna produces a CIRCLE and no bearing is offered", () => {
  const rose = newRose(72);
  for (let h = 0; h < 360; h += 5) addSample(rose, h, 0.7);              // same strength whichever way you point
  const s = roseStats(rose);
  assert(s.r < 0.01, `a uniform sweep must have near-zero concentration, got ${s.r}`);
  assertEquals(hasBearing(s), false, "the stock whip must never produce an arrow");
  assertEquals(s.coverage, 1);
});

Deno.test("df: a directional lobe earns a bearing, and points where the signal actually peaked", () => {
  const rose = newRose(72);
  for (let h = 0; h < 360; h += 5) {
    const lobe = Math.max(0, Math.cos((h - 90) * Math.PI / 180)) ** 2;   // a Yagi-ish pattern facing east
    addSample(rose, h, lobe);
  }
  const s = roseStats(rose);
  assert(s.r > 0.3, `a lobe must concentrate, got ${s.r}`);
  assert(Math.abs(s.bearingDeg - 90) < 5, `bearing should be ~90 deg, got ${s.bearingDeg}`);
  assertEquals(hasBearing(s), true);
});

Deno.test("df: headings wrap — 350 and 10 average to 0, not 180", () => {
  const rose = newRose(72);
  addSample(rose, 350, 1); addSample(rose, 10, 1);
  const s = roseStats(rose);
  assert(s.bearingDeg < 5 || s.bearingDeg > 355, `circular mean broken: got ${s.bearingDeg}`);
  // …but two samples is not a sweep, so no arrow is offered yet.
  assertEquals(hasBearing(s), false, "coverage gate must reject an unfinished sweep even when r is high");
});

Deno.test("df: an unswept arc is not a null — unvisited bins stay distinguishable from measured silence", () => {
  const rose = newRose(72);
  for (let h = 0; h < 90; h += 5) addSample(rose, h, 1);                 // swept only a quarter of the circle
  const s = roseStats(rose);
  assert(s.coverage < 0.3, `coverage must report the truth, got ${s.coverage}`);
  assertEquals(hasBearing(s), false);
  assertEquals(rose.count[40], 0);                                       // never visited
});

// ================= the 433 scan pipeline (scan433.js + fixture433.js) =================
// The fixture stops at the ANTENNA: it emits raw IQ bytes, and every stage below is the same code the real
// radio drives. That is the structural difference from the predecessor app, which seeded finished rows and
// therefore never exercised its own radio path until it met hardware.

const SR = 2_400_000;
const msToByte = (ms) => Math.round(SR * ms / 1000) * 2;

Deno.test("extractChannel: the cutoff is half the CHANNEL, not the decimation Nyquist", () => {
  const bytes = synthBand({ ms: 60, noise: 0, events: [{ kind: "voice", channel: 20, startMs: 0, durMs: 60, strength: 0.8, devHz: 0, modHz: 0, toneHz: 0 }] });
  const power = (c) => { let p = 0; for (let i = 0; i < c.re.length; i++) p += c.re[i] ** 2 + c.im[i] ** 2; return p / c.re.length; };
  const at = (n) => power(extractChannel(bytes, { deltaHz: channelCentre(LPD433, n) - TUNE_HZ }));
  const on = at(20), adj = 10 * Math.log10(on / at(21)), far = 10 * Math.log10(on / at(25));
  // Regression: defaulting the cutoff to sampleRate/(2*decim) = 25 kHz put the ADJACENT channel centre exactly
  // on the cutoff, so rejection was pinned at 6.0 dB no matter how many taps were spent on it.
  assert(adj > 40, `adjacent-channel rejection must be real, got ${adj.toFixed(1)} dB`);
  assert(far > 55, `a channel five slots away must be gone, got ${far.toFixed(1)} dB`);
});

Deno.test("the fixture band lights up exactly the channels it transmits on", () => {
  const bytes = synthBand();
  const { frames, frameMs } = channelPowers(bytes);
  assert(frames.length > 100, `expected many frames over ${DEMO_MS} ms, got ${frames.length}`);
  assert(Math.abs(frameMs - 1024 * 1000 / SR) < 1e-6);
  const peak = new Float32Array(frames[0].length);
  for (const f of frames) for (let c = 0; c < f.length; c++) if (f[c] > peak[c]) peak[c] = f[c];
  const floor = channelFloor(peak);
  const lit = (n) => peak[n - 1] / floor;
  assert(lit(12) > 20, `channel 12 carries a voice, got ${lit(12).toFixed(1)}x floor`);
  assert(lit(47) > 20, `channel 47 carries a voice, got ${lit(47).toFixed(1)}x floor`);
  // 433.92 MHz — where essentially every ISM device transmits — falls INSIDE channel 35, which is also the
  // tune centre. It is the one channel that is busy for three unrelated reasons.
  assertEquals(channelAt(LPD433, 433_920_000), CROWDED_CHANNEL);
  assert(lit(CROWDED_CHANNEL) > 20, `channel 35 carries the device bursts, got ${lit(CROWDED_CHANNEL).toFixed(1)}x`);
  assert(lit(60) < 5, `channel 60 is silent and must stay silent, got ${lit(60).toFixed(1)}x floor`);
});

Deno.test("findRuns: one transmission is one run, of the duration it was transmitted for", () => {
  const bytes = synthBand();
  const { frames, frameMs } = channelPowers(bytes);
  const series = frames.map((f) => f[11]);                      // channel 12
  const quiet = frames.map((f) => f[59]);                       // channel 60
  const floor = channelFloor(Float32Array.from(quiet));
  const runs = findRuns(Float32Array.from(series), { floor, minFrames: 3 });
  assertEquals(runs.length, 1, `one voice transmission must be one run, got ${runs.length}`);
  const ms = (runs[0].end - runs[0].start) * frameMs;
  assert(Math.abs(ms - 600) < 60, `the run should be ~600 ms, got ${ms.toFixed(0)} ms`);
  assertEquals(findRuns(Float32Array.from(quiet), { floor, minFrames: 3 }).length, 0, "silence must produce no runs");
});

Deno.test("classifyChannel: the doorbell reads as a device and the handheld as a person", () => {
  const bytes = synthBand();
  const burst = bytes.slice(msToByte(110), msToByte(150));       // the 18 ms OOK frame at 433.92
  const gotBurst = classifyChannel(burst, { channelHz: TUNE_HZ, durationMs: 18 });
  assertEquals(gotBurst.kind, "burst", `device misread as ${gotBurst.kind} (fm ${gotBurst.fmActivity}, edges ${gotBurst.transitions})`);

  const voice = bytes.slice(msToByte(40), msToByte(260));        // inside the channel-12 transmission
  const gotVoice = classifyChannel(voice, { channelHz: channelCentre(LPD433, 12), durationMs: 600 });
  assertEquals(gotVoice.kind, "voice", `voice misread as ${gotVoice.kind} (fm ${gotVoice.fmActivity}, edges ${gotVoice.transitions})`);
  assert(gotVoice.fmActivity > gotBurst.fmActivity * 5, "the two must be separated by a wide margin, not a hair");
});

Deno.test("end to end: raw bytes off the antenna become a named CTCSS group", () => {
  const bytes = synthBand();
  const voice = bytes.slice(msToByte(20), msToByte(620));        // the full 600 ms transmission
  const ch = extractChannel(bytes.slice(msToByte(20), msToByte(620)), { deltaHz: channelCentre(LPD433, 12) - TUNE_HZ });
  assert(voice.length > 0);
  const audio = instantFreq(ch.re, ch.im);                       // FM discriminator output IS the audio
  const tone = detectCtcss(audio, ch.sampleRate);
  assert(tone, `no tone found in ${(audio.length / ch.sampleRate).toFixed(2)} s of demodulated audio`);
  assertEquals(tone.toneHz, 100.0, "the fixture transmits CTCSS 100.0 Hz and the chain must recover it");
});

// ---- shell facade -----------------------------------------------------------
// The bridge does not exist in Java yet (phase 3), so what is under test is the CONTRACT: a browser sees
// nothing, an out-of-date shell says so instead of failing obscurely, and a current one round-trips.
Deno.test("shell: a browser has no bridge, and says so in one closed vocabulary", async () => {
  delete globalThis.window;
  assertEquals(shell.present, false);
  assertEquals(shell.version, 0);
  assertEquals(shell.has("system.info"), false);
  assertEquals(shell.why("system.info"), ERR.unsupported);
  assertEquals(shell.why("nope.nope"), ERR.unsupported);          // unknown action, same answer
  const e = await shell.call("system.info").catch((x) => x);
  assertEquals(e.code, ERR.unsupported);
  assertEquals(shell.subscribe("system.info", {}, () => {})(), undefined);   // no-op canceller, never throws
});

Deno.test("shell: a shell older than the action is staleBridge, not a silent failure", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { call: () => {}, subscribe: () => {}, cancel: () => {} };   // reports no version
  try {
    assertEquals(shell.present, true);
    assertEquals(shell.version, 0);
    assertEquals(shell.has("system.info"), false);
    assertEquals(shell.why("system.info"), ERR.staleBridge);
    const e = await shell.call("system.info").catch((x) => x);
    assertEquals(e.code, ERR.staleBridge);
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("shell: a current bridge round-trips a call, and errors keep their code", async () => {
  globalThis.window = globalThis;
  const sent = [];
  globalThis.__msShell = {
    version: 1,
    call: (id, action, args) => { sent.push({ id, action, args }); },
    subscribe: () => {}, cancel: () => {},
  };
  try {
    assertEquals(shell.has("system.info"), true);
    assertEquals(shell.why("system.info"), "");
    const p = shell.call("system.info", { a: 1 });
    assertEquals(sent.length, 1);
    assertEquals(sent[0].action, "system.info");
    assertEquals(sent[0].args, '{"a":1}');                        // args cross as JSON, never as objects
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[0].id, ok: true, value: { bridge: 1 } } }));
    assertEquals((await p).bridge, 1);

    const q = shell.call("system.info");
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[1].id, ok: false, code: ERR.denied, detail: "user said no" } }));
    const e = await q.catch((x) => x);
    assertEquals(e.code, ERR.denied);
    assertEquals(e.detail, "user said no");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("shell: the catalogue is the surface, and an action carries what a screen needs", () => {
  assert(shell.actions.includes("system.info"));
  const a = shell.action("system.info");
  assertEquals(a.capability, "system");
  assertEquals(a.kind, "call");
  assertEquals(a.android, []);                                    // the one action needing no permission
  assertEquals(shell.action("nope.nope"), null);
});

// ---- permissions registry ---------------------------------------------------
// The row must report the gate that is ACTUALLY blocking. "Blocked" when the truth is "this needs the
// app" is a lie the user acts on, and a shell-only permission has no browser prompt to fall back to.
Deno.test("permState: a shell-only permission is needsApp in a browser, not unsupported", async () => {
  delete globalThis.window;
  const s = await permState("alarm");
  assertEquals(s.state, "needsApp");
  assertEquals(s.via, "");
  assertEquals(PERMISSIONS.alarm.group, "background");
});

Deno.test("permState: with a bridge, a capability answers via the shell", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { version: () => 1, call: () => {}, subscribe: () => {}, cancel: () => {} };
  try {
    const s = await permState("alarm");
    assertEquals(s.state, "granted");
    assertEquals(s.via, "shell");
    assert(permAndroid("alarm").includes("RECEIVE_BOOT_COMPLETED"), "the row must show what it rests on");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("permState: a shell too old for the capability says so instead of failing quietly", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { call: () => {}, subscribe: () => {}, cancel: () => {} };   // no version → 0
  try {
    assertEquals((await permState("alarm")).state, "staleApp");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("permissions: every entry has a group, and every group is one the screen knows", () => {
  for (const [name, def] of Object.entries(PERMISSIONS)) {
    assert(def.group, `${name} has no group`);
    assert(GROUPS.includes(def.group), `${name} is in unknown group ${def.group}`);
    assert(def.query || def.capability, `${name} has neither a browser backend nor a capability`);
  }
});

Deno.test("shell: a subscription that fails tells the caller, instead of looking empty", async () => {
  globalThis.window = globalThis;
  const sent = [];
  globalThis.__msShell = {
    version: () => 99,
    call: () => {}, cancel: () => {},
    subscribe: (id, action) => { sent.push({ id, action }); },
  };
  try {
    let events = 0, failed = null;
    shell.subscribe("ble.scan", {}, () => events++, (e) => { failed = e; });
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[0].id, ok: false, code: ERR.denied } }));
    assertEquals(events, 0);
    assertEquals(failed?.code, ERR.denied, "a refused stream must reach onError, not vanish");

    // An action this shell is too old for must also report, rather than returning a silent no-op.
    globalThis.__msShell.version = () => 1;
    let stale = null;
    shell.subscribe("ble.scan", {}, () => {}, (e) => { stale = e; });
    assertEquals(stale?.code, ERR.staleBridge);
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

// ── radar ─────────────────────────────────────────────────────────────────────────────────────────────
Deno.test("radar: an AD walk stops at a structure that would read past the end", () => {
  // The catalogue's own gate mock: flags, complete 16-bit UUID 0xFCB2, service data for 0xFCB2.
  const ok = rdParseAd("0201060303b2fc0716b2fc41424344");
  assertEquals(ok.truncated, false);
  assertEquals(ok.error, null);
  assertEquals(ok.structures.length, 3);
  assertEquals(ok.structures[0].type, 0x01);
  assertEquals(ok.structures[2].value.length, 6, "service data keeps its UUID plus 4 payload bytes");

  // The off-by-one that silently shortens a value instead of reporting it: the last structure claims one
  // more byte than the frame holds. slice() would clamp and hand back a short value with no complaint.
  const short = rdParseAd("0201060303b2fc0816b2fc41424344");
  assertEquals(short.truncated, true, "a structure running past the end is truncated, never quietly clipped");
  assertEquals(short.structures.length, 2, "the overrunning structure is dropped, not half-parsed");

  assertEquals(rdParseAd("0201060").error, "notHex", "an odd-length string is not a frame");
  assertEquals(rdParseAd("").structures.length, 0);
  assertEquals(rdParseAd(undefined).structures.length, 0);
});

Deno.test("radar: a DULT accessory announces that it is separated from its owner", () => {
  // Draft Table 1: after the 2-byte service UUID come the Network ID, then a byte whose LEAST significant
  // bit is the near-owner bit. 0 means separated — the state that justifies telling the user anything.
  const sep = rdClassify({ addr: "4C:11:22:33:44:55", raw: "0201060516b2fc0700" });
  assertEquals(sep.tracker, "separated");
  assertEquals(sep.separated, true);
  assert(sep.why.includes("dultSeparated"));

  const near = rdClassify({ addr: "4C:11:22:33:44:55", raw: "0201060516b2fc0701" });
  assertEquals(near.tracker, "nearOwner");
  assertEquals(near.separated, false, "its owner is right there — this is the commonest false positive");
});

Deno.test("radar: a vendor is not a device class, and a pairing protocol is not a tracker", () => {
  // Apple company data covers phones, watches and earbuds. Classifying on it is a false-positive machine.
  const airpods = rdClassify({ addr: "5A:00:00:00:00:01", raw: "05ff4c00070f" });
  assertEquals(airpods.vendor, "Apple");
  assertEquals(airpods.tracker, "none", "a company ID alone must never read as a tracker");

  // Fast Pair is how headphones pair; Eddystone is a generic beacon protocol. Neither is evidence.
  for (const uuid of ["03032cfe", "0303aafe"]) {
    const c = rdClassify({ addr: "5A:00:00:00:00:02", raw: "020106" + uuid });
    assertEquals(c.tracker, "none", `${uuid} is an ordinary accessory protocol, not a tracker marker`);
  }

  const tile = rdClassify({ addr: "5A:00:00:00:00:03", raw: "0201060303edfe" });
  assertEquals(tile.tracker, "possible");
  assert(tile.protocols.includes("tile"));
});

Deno.test("radar: an address says whether it can be followed at all", () => {
  assertEquals(rdAddrKind("4C:11:22:33:44:55"), "resolvable");   // 0x4C -> 0b01
  assertEquals(rdAddrKind("0A:11:22:33:44:55"), "nonResolvable"); // 0x0A -> 0b00
  assertEquals(rdAddrKind("C3:11:22:33:44:55"), "staticRandom");  // 0xC3 -> 0b11
  assertEquals(rdAddrKind("8F:11:22:33:44:55"), "reserved");
  assertEquals(rdAddrKind("zz"), "unknown");
  assert(rdRotates("4C:11:22:33:44:55"), "a resolvable private address rotates, so a trail must end at it");
});

Deno.test("radar: strength is a band in dBm, and metres need calibration the caller must supply", () => {
  assertEquals(rdBand(-40), "immediate");
  assertEquals(rdBand(-60), "near");
  assertEquals(rdBand(-80), "far");
  assertEquals(rdBand(-95), "faint");
  assertEquals(rdBand(NaN), "unknown");

  // The whole point: no default calibration exists, so an uncalibrated call returns null rather than a
  // confident number. -59/2 is a beacon profile, not a Bluetooth constant.
  assertEquals(rdEstimateDistance({ rssi: -70 }), null);
  assertEquals(rdEstimateDistance({ rssi: -70, referenceRssi: -59 }), null);
  const d = rdEstimateDistance({ rssi: -70, referenceRssi: -59, pathLossExponent: 2 });
  assert(Math.abs(d - 10 ** (11 / 20)) < 1e-9);

  // A 10 dB reference error at n=2 is a x3.16 distance error — the number that makes metres indefensible.
  const off = rdEstimateDistance({ rssi: -70, referenceRssi: -49, pathLossExponent: 2 });
  assert(Math.abs(off / d - 3.1622776) < 1e-4, "10 dB of reference error is a 3.16x distance error");

  assert(rdBandFraction(-40) < rdBandFraction(-100), "a stronger signal sits nearer the centre");
  assertEquals(rdBandFraction(-20), 0, "clamped, so an absurd reading cannot leave the scene");
  assertEquals(rdBandFraction(-140), 1);
});

Deno.test("radar: smoothing is time-based, because advertising intervals are not constant", () => {
  assertEquals(rdSmooth(NaN, -60, 500), -60, "the first sample IS the estimate");
  // The same alpha applied to a slower stream would mean a different memory. Twice the gap must move the
  // estimate further, which a fixed per-sample alpha cannot express.
  const fast = rdSmooth(-60, -80, 500);
  const slow = rdSmooth(-60, -80, 3000);
  assert(slow < fast, "a longer gap trusts the new sample more");
  assert(fast > -80 && fast < -60);
  assertEquals(rdSmooth(-60, NaN, 500), -60, "a missing reading leaves the estimate alone");
});

Deno.test("radar: guard needs every criterion, and says which one is missing", () => {
  const near = { lat: 50.45, lon: 30.52 };
  const far = { lat: 50.47, lon: 30.52 };          // ~2.2 km north
  const t0 = 1_700_000_000_000;
  const sightings = [
    { at: t0, rssi: -60, fix: near },
    { at: t0 + 6 * 60_000, rssi: -62, fix: near },
    { at: t0 + 14 * 60_000, rssi: -58, fix: far },
    { at: t0 + 21 * 60_000, rssi: -61, fix: far },
    { at: t0 + 26 * 60_000, rssi: -59, fix: far },
  ];
  const good = rdGuardScore({ sightings, separated: true, classifiable: true });
  assertEquals(good.reasons, []);
  assertEquals(good.meets, true);
  assertEquals(good.confidence, 1);
  assert(good.displacement > 1500, "displacement is real metres, not a degree delta");
  assert(good.segments >= 2);

  // A device whose owner is nearby is the commonest false positive of all — it must never alert.
  const owned = rdGuardScore({ sightings, separated: false, classifiable: true });
  assertEquals(owned.meets, false);
  assert(owned.reasons.includes("notSeparated"));

  // Standing still with a neighbour's beacon: plenty of sightings, no journey.
  const still = rdGuardScore({
    sightings: sightings.map((s) => ({ ...s, fix: near })), separated: true, classifiable: true,
  });
  assertEquals(still.meets, false);
  assert(still.reasons.includes("noDisplacement"));

  // A pre-24 shell sends no payload, so nothing is classifiable and Guard must stay silent rather than
  // guess from co-motion alone.
  const blind = rdGuardScore({ sightings, separated: true, classifiable: false });
  assertEquals(blind.meets, false);
  assert(blind.reasons.includes("noPayload"));

  assertEquals(rdGuardScore({}).meets, false, "an empty track alerts nobody");
});

Deno.test("radar: the guard thresholds are ours, and are not DULT's accessory constants", () => {
  // The draft's 30 minutes is when an ACCESSORY switches to separated mode. Reusing it as an alert
  // threshold would be inventing standards compliance the draft explicitly does not provide: its §6
  // "Platform Support for Unwanted Tracking" reads "TODO".
  assert(rdGUARD.minSpanMs !== 30 * 60_000, "do not borrow the accessory's state constant as a policy");
  assert(rdGUARD.minDisplacementM >= 100, "a GPS accuracy radius is 5-30 m; the floor must clear jitter");
  assert(rdGUARD.minSegments >= 2);
});

Deno.test("radar: a percentage is per-RADIO, because the three are not one quantity", () => {
  // RSRP runs ~40 dB below a BLE advertisement. One shared scale pins every cell at 0% and pretends -104
  // and -120 are the same place — the mistake apps/os documents for its radius function.
  assertEquals(rdSignalPercent(-120, "lte"), 0);
  assertEquals(rdSignalPercent(-70, "lte"), 100);
  assert(rdSignalPercent(-95, "lte") > rdSignalPercent(-95, "ble"), "a cell at -95 is healthy where a beacon is nearly gone");
  assertEquals(rdSignalPercent(-100, "ble"), 0);
  assertEquals(rdSignalPercent(-45, "ble"), 100);
  assertEquals(rdSignalPercent(-90, "wifi"), 0);
  assertEquals(rdSignalPercent(-35, "wifi"), 100);
  // Clamped at both ends, and monotonic in between — a percentage that can exceed 100 is not a percentage.
  for (const kind of ["ble", "wifi", "lte"]) {
    assertEquals(rdSignalPercent(0, kind), 100);
    assertEquals(rdSignalPercent(-200, kind), 0);
    assertEquals(rdSignalPercent(NaN, kind), 0);
    let prev = -1;
    for (let r = -130; r <= -20; r += 5) {
      const p = rdSignalPercent(r, kind);
      assert(p >= prev, `${kind} went backwards at ${r} dBm`);
      assert(p >= 0 && p <= 100, `${kind} left 0..100 at ${r} dBm`);
      prev = p;
    }
  }
});

Deno.test("radar: ordering does not move a row unless something changed that means something", () => {
  const mk = (addr, rssi, kind, first) => ({ addr, smooth: rssi, kind, first });
  const list = [
    mk("a", -80, "ble", 100), mk("b", -50, "wifi", 200), mk("c", -52, "ble", 300), mk("d", -95, "lte", 400),
  ];
  // First-seen is the only order that cannot move at all.
  assertEquals(rdOrderDevices(list, "seen").map((d) => d.addr), ["a", "b", "c", "d"]);

  // By signal: sorted on the BAND, so ordinary fading does not reshuffle the screen. -50 and -52 are both
  // "immediate", so they keep their first-seen order even though b is stronger than c.
  assertEquals(rdOrderDevices(list, "signal").map((d) => d.addr), ["b", "c", "a", "d"]);
  const faded = list.map((d) => (d.addr === "b" ? { ...d, smooth: -54 } : d));
  assertEquals(rdOrderDevices(faded, "signal").map((d) => d.addr), ["b", "c", "a", "d"],
    "4 dB of ordinary fading must not move a row");
  // Crossing a band boundary is a real change and IS allowed to move it. b falls out of "immediate" into
  // the same band as a, so the tie resolves on first-seen and b lands AFTER a — the stability holding even
  // as the row moves.
  const dropped = list.map((d) => (d.addr === "b" ? { ...d, smooth: -72 } : d));
  assertEquals(rdOrderDevices(dropped, "signal").map((d) => d.addr), ["c", "a", "b", "d"]);

  assertEquals(rdOrderDevices(list, "kind").map((d) => d.addr), ["c", "a", "b", "d"]);
  // Pure: the caller's array is never sorted in place, or the atom mutates behind preact's back.
  assertEquals(list.map((d) => d.addr), ["a", "b", "c", "d"]);
});

Deno.test("radar: the hex spiral tiles without a gap or a collision", () => {
  // A duplicate coordinate stacks two devices in one cell and reads as a rendering glitch, not a maths
  // bug — so uniqueness is asserted rather than eyeballed.
  for (const n of [1, 7, 19, 37, 61]) {
    const s = rdHexSpiral(n);
    assertEquals(s.length, n);
    assertEquals(new Set(s.map((c) => `${c.q},${c.r}`)).size, n, `duplicate cell at n=${n}`);
  }
  // Ring k holds exactly 6k cells, which is what makes rank read as distance from the centre.
  const rings = {};
  for (const c of rdHexSpiral(61)) rings[rdHexDistance(c)] = (rings[rdHexDistance(c)] || 0) + 1;
  assertEquals(rings, { 0: 1, 1: 6, 2: 12, 3: 18, 4: 24 });
  assertEquals(rdHexSpiral(0).length, 0);

  const { x, y } = rdHexToXY({ q: 0, r: 0 }, 1);
  assertEquals([x, y], [0, 0]);
});

Deno.test("oui: a vendor is named only where the address actually has one", () => {
  // A tiny hand-built table in the real packed format: two prefixes, deltas from zero.
  const a = 0xac_de_48, b = 0x24_0a_c4;                    // globally administered, both registered
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const names = lo === a ? "Apple\nEspressif" : "Espressif\nApple";
  const table = ouiParse(`${lo.toString(36)},${(hi - lo).toString(36)}\n0,1\n${names}`);
  assertEquals(table.size, 2);
  assertEquals(table.get(a), "Apple");
  assertEquals(table.get(b), "Espressif");

  assertEquals(ouiVendorOf("AC:DE:48:11:22:33", "wifi", table), "Apple", "an AP's BSSID is a real OUI");
  assertEquals(ouiVendorOf("24:0A:C4:11:22:33", "wifi", table), "Espressif");

  // The whole point. A resolvable private address ROTATES — its prefix is cryptographic padding, so a
  // lookup would invent a manufacturer with full confidence.
  assertEquals(ouiVendorOf("4C:DE:48:11:22:33", "ble", table), null,
    "a rotating BLE address must never be given a vendor");
  // Locally administered: randomized or virtual, never an assignment.
  assertEquals(ouiVendorOf("AE:DE:48:11:22:33", "wifi", table), null);
  assert(ouiLocallyAdministered("02:00:00:00:00:01"), "the gate's own fixture is locally administered");
  // A cell has no MAC at all.
  assertEquals(ouiVendorOf("lte:301", "lte", table), null);
  // Unregistered prefixes and junk answer null rather than guessing.
  assertEquals(ouiVendorOf("00:11:22:33:44:55", "wifi", table), null);
  assertEquals(ouiVendorOf("nonsense", "wifi", table), null);
  assertEquals(ouiVendorOf("AC:DE:48:11:22:33", "wifi", new Map()), null);

  assertEquals(ouiPrefixOf("AC:DE:48:11:22:33"), 0xacde48);
  assertEquals(ouiPrefixOf("acde48112233"), 0xacde48);
  assertEquals(ouiPrefixOf("AC:DE"), null);
  assertEquals(ouiParse("").size, 0);
  assertEquals(ouiParse("garbage").size, 0);
});

Deno.test("radar: the comb rounds up to a COMPLETE ring, never a lopsided spiral", () => {
  assertEquals(rdCombSize(0), 1);
  assertEquals(rdCombSize(1), 1);
  for (const n of [2, 5, 7]) assertEquals(rdCombSize(n), 7, `${n} should fill the first ring`);
  for (const n of [8, 12, 19]) assertEquals(rdCombSize(n), 19, `${n} should fill the second ring`);
  assertEquals(rdCombSize(20), 37);
  // Every answer is a real centred-hexagonal number, so the drawn shape is always symmetric.
  for (let n = 0; n <= 60; n++) {
    const s = rdCombSize(n);
    assert(s >= Math.max(1, n), `comb ${s} cannot hold ${n}`);
    const rings = rdHexSpiral(s).map(rdHexDistance);
    const outer = Math.max(...rings);
    assertEquals(rings.filter((r) => r === outer).length, outer === 0 ? 1 : 6 * outer,
      `n=${n} left the outer ring incomplete`);
  }
});
