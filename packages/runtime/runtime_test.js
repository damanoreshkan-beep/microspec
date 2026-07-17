import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { validateSpec } from "./validate.js";
import { T, dictFor, ago, whenLabel } from "./i18n.js";
import { bjorklund, rotate, syncopation, syncopationNorm, harmonicity, grooveU, mulberry32, generateGroove, buildCandidate, scoreGroove, METRIC_WEIGHTS } from "./groove.js";
import { fingeredSemitone, handCovered } from "./wind.js";
import { field, declination, decimalYear, inRange, EPOCH, trueFrom } from "./geomag.js";
import { meanFix, stationaryTail, segErr, totalErr, usableFix, BIAS_FRAC } from "./geofix.js";
import { hapticFor } from "./sensors.js";
import { eaqiBand, pollutantBand, pollenBand, AQI_BANDS, POLLEN_BANDS } from "./air.js";
import { resumeAt, RESUME_MIN } from "./playback.js";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";

const i18n = { en: { hi: "hi" }, uk: { hi: "привіт" } };
const baseList = () => ({
  id: "app", i18n, translate: ["desc"],
  tabs: [{ id: "feed", type: "list", icon: "lucide:list", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }],
});

Deno.test("validateSpec accepts one valid tab per family", () => {
  validateSpec(baseList());
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "code", trailing: "rate" } }] });
  validateSpec({ ...baseList(), tabs: [{ id: "c", type: "converter", icon: "i", label: "hi", codeField: "code", rateField: "rate", base: "USD" }] });
  validateSpec({ ...baseList(), tabs: [{ id: "me", type: "profile", icon: "i", label: "hi" }] });
  validateSpec({ ...baseList(), tabs: [{ id: "d", type: "dashboard", icon: "i", label: "hi", hero: { value: "temp" } }] });
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
  for (const slot of ["subtitle", "body", "image"]) {
    validateSpec({ ...baseList(), translate: ["x"], tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", [slot]: "x" } }] });
  }
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
});

Deno.test("validateSpec: grid layout (launcher) needs a tile, exempt from feed density", () => {
  const gridTab = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", title: "title", ...card } }] });
  validateSpec(gridTab({ icon: "glyph" }));
  validateSpec(gridTab({ image: "iconUrl" }));
  const err = assertThrows(() => validateSpec(gridTab({})), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs a tile/.test(err.message), err.message);
});

Deno.test("validateSpec: searchFetch requires search:true", () => {
  const spec = baseList();
  spec.tabs[0].searchFetch = true; 
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
  assertEquals(dictFor(i18n, "de").hi, "hi"); 
  assertEquals(dictFor(null, "en"), {});
});

Deno.test("ago is relative and locale-aware", () => {
  const d = { agoToday: "today", agoYesterday: "yesterday", agoDays: "{n}d", agoWeeks: "{n}w" };
  const day = 86400000;
  assertEquals(ago(d, Date.now() - day * 0.1, "en"), "today");
  assertEquals(ago(d, Date.now() - day, "en"), "yesterday");
  assertEquals(ago(d, Date.now() - day * 3, "en"), "3d");
  assertEquals(ago(d, Date.now() - day * 14, "en"), "2w");
  assert(/\d{4}/.test(ago(d, Date.now() - day * 400, "en"))); 
});

Deno.test("whenLabel: locale-aware absolute + future countdown", () => {
  const d = { whenPast: "now", whenMin: "in {n}m", whenHours: "in {n}h", whenDays: "in {n}d" };
  const uk = { whenPast: "щойно", whenMin: "за {n} хв", whenHours: "за {n} год", whenDays: "за {n} дн" };
  const min = 60000;
  assert(/in 30m$/.test(whenLabel(d, Date.now() + 30 * min, "en")), "en minutes");
  assert(/in 3h$/.test(whenLabel(d, Date.now() + 180 * min, "en")), "en hours");
  assert(/за 3 дн$/.test(whenLabel(uk, Date.now() + 3 * 1440 * min, "uk")), "uk days");
  assertEquals(whenLabel(d, Date.now() - min, "en").split(" · ").pop(), "now"); 
  assert(!/·/.test(whenLabel(d, Date.now() + 30 * min, "en", false)), "full=false omits relative");
  assertEquals(whenLabel(d, undefined, "en"), ""); 
});


const str = (p) => p.map((v) => (v ? "x" : ".")).join("");

Deno.test("bjorklund reproduces Toussaint's traditional rhythms", () => {
  assertEquals(str(bjorklund(3, 8)), "x..x..x.", "tresillo (Cuba)");
  assertEquals(str(bjorklund(5, 8)), "x.xx.xx.", "cinquillo (Cuba)");
  assertEquals(str(bjorklund(2, 5)), "x.x..", "E(2,5)");
  assertEquals(str(bjorklund(4, 16)), "x...x...x...x...", "four-on-the-floor");
  assertEquals(str(bjorklund(5, 16)), "x..x..x..x..x...", "bossa-nova clave");
});

Deno.test("bjorklund edges: k<=0, k>=n, n=0 never throw", () => {
  assertEquals(str(bjorklund(0, 8)), "........");
  assertEquals(str(bjorklund(8, 8)), "xxxxxxxx");
  assertEquals(str(bjorklund(99, 4)), "xxxx");     
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
    for (const id of g.voices) assertEquals(g.tracks[id].length, 16, `seed ${seed}: ${id} wrong length`);
    assertEquals(Object.keys(g.tracks).sort().join(), [...g.voices].sort().join(), `seed ${seed}: tracks must match the line-up`);
  }
});

Deno.test("THE CLAIM: the scored search beats random — it is not a dice roll", () => {
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
    if (syncopationNorm(merge(g.tracks, "low")) <= 0.3) lowOk++;
    const mid = syncopationNorm(merge(g.tracks, "mid"));
    if (mid > 0.05 && mid < 0.8) midOk++;
  }
  assertEquals(lowOk, SEEDS, "the low end must hold the pulse on every seed");
  assert(midOk >= SEEDS * 0.9, `mid-band syncopation off the Witek peak too often (${midOk}/${SEEDS})`);
});

Deno.test("scoreGroove punishes a floorless beat and rewards the backbeat", () => {
  const base = buildCandidate(mulberry32(3), ROLES);
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
  const withHref = () => ({ ...baseList(), tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", href: "url", title: "name", body: "desc" } }] });
  const err = assertThrows(() => validateSpec(withHref()), Error);
  assert(err.message.includes("spec.tabs[0].card.href") && /detail/.test(err.message), err.message);

  validateSpec({ ...withHref(), detail: { title: "name", body: "desc", actions: [{ href: "url", label: "open" }] } });
  validateSpec(baseList());

  validateSpec({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", href: "url", title: "title", icon: "glyph" } }] });
});

Deno.test("validateSpec: detail.body is an accepted long-form slot", () => {
  validateSpec({ ...baseList(), detail: { title: "name", body: "desc" } });
  validateSpec({ ...baseList(), detail: { title: "name" } });   
});

Deno.test("validateSpec: feed body prose must be translated (or declared already-localized)", () => {
  const feedBody = () => { const s = { ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }] }; delete s.translate; return s; };
  const err = assertThrows(() => validateSpec(feedBody()), Error);
  assert(err.message.includes("spec.tabs[0].card.body") && /translate/.test(err.message), err.message);

  validateSpec({ ...feedBody(), translate: ["desc"] });          
  validateSpec({ ...feedBody(), localized: true });              

  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
  validateSpec({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", subtitle: "addr" } }] });
});


const SOPILKA = [11, 9, 7, 5, 4, 2, 0];                       
const fing = (s) => new Set([...s].map((c, i) => (c === "●" ? i : -1)).filter((i) => i >= 0));

Deno.test("fingeredSemitone: the diatonic staircase (all six covered → tonic, lift from the bottom)", () => {
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);   
  assertEquals(fingeredSemitone(fing("●●●●●○"), SOPILKA), 2);   
  assertEquals(fingeredSemitone(fing("●●●●○○"), SOPILKA), 4);   
  assertEquals(fingeredSemitone(fing("●●●○○○"), SOPILKA), 5);   
  assertEquals(fingeredSemitone(fing("●●○○○○"), SOPILKA), 7);   
  assertEquals(fingeredSemitone(fing("●○○○○○"), SOPILKA), 9);   
  assertEquals(fingeredSemitone(fing("○○○○○○"), SOPILKA), 11);  
});

Deno.test("fingeredSemitone: a fork flattens — the canonical cross-fingering", () => {
  assertEquals(fingeredSemitone(fing("○●●○○○"), SOPILKA), 10);
  assertEquals(fingeredSemitone(fing("●●●●○●"), SOPILKA), 3);   
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);   
  assertEquals(fingeredSemitone(fing("●○●●●●"), SOPILKA), 8);   
});

Deno.test("fingeredSemitone: only holes BELOW the first opening fork it", () => {
  assertEquals(fingeredSemitone(fing("●●○●○○"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);
  assertEquals(fingeredSemitone(new Set([0]), [7, 5, 0]), 5);   
});

Deno.test("handCovered: one finger must play the scale — the bug that made the pipe sound one note", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([5]), 0);    
  assertEquals(semi([4]), 2);    
  assertEquals(semi([3]), 4);    
  assertEquals(semi([2]), 5);    
  assertEquals(semi([1]), 7);    
  assertEquals(semi([0]), 9);    
  assertEquals(semi([]), 11);    

  assertEquals(fingeredSemitone(new Set([5]), SOPILKA), 10);
  assertEquals(fingeredSemitone(new Set([3]), SOPILKA), 10);
});

Deno.test("handCovered: a second finger below the first is a fork, not a re-stack", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([0, 2]), 8);   
  assertEquals(semi([1, 3]), 6);   
  assertEquals(semi([3, 5]), 3);   
  assertEquals(semi([3, 1]), semi([1, 3]));
});


Deno.test("geomag: all 100 official NOAA test points", async () => {
  const txt = await Deno.readTextFile(new URL("./wmm2025_testvalues.txt", import.meta.url));
  const pts = txt.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/).map(Number));
  assertEquals(pts.length, 100, "the official test set is 100 points — a short read is a silent pass");
  for (const [year, alt, lat, lon, D, I, H, X, Y, Z, F] of pts) {
    const r = field(lat, lon, alt, year);
    const where = `(${lat}, ${lon}) alt=${alt}km ${year}`;
    let dD = Math.abs(r.declination - D); if (dD > 180) dD = 360 - dD;   
    assert(dD < 0.01, `${where}: declination ${r.declination.toFixed(3)} vs ${D}`);
    assert(Math.abs(r.inclination - I) < 0.01, `${where}: inclination ${r.inclination.toFixed(3)} vs ${I}`);
    for (const [name, got, want] of [["X", r.X, X], ["Y", r.Y, Y], ["Z", r.Z, Z], ["H", r.H, H], ["F", r.F, F]]) {
      assert(Math.abs(got - want) < 5, `${where}: ${name} ${got.toFixed(1)} vs ${want}`);
    }
  }
});

Deno.test("geomag: Ukraine's declination is real, eastward, and drifts", () => {
  const d = declination(50.45, 30.52, 0.2, 2026.5);
  assert(d > 6 && d < 10, `Kyiv declination out of the plausible band: ${d.toFixed(2)}°`);
  assert(Math.abs(declination(50.45, 30.52, 0, 2029.9) - declination(50.45, 30.52, 0, 2025.0)) > 0.1, "no secular drift");
  assert(Math.abs(declination(51.5, -0.13, 0, 2026.5)) < 3, "London should be near zero");
  assert(Math.abs(declination(64.8, -147.7, 0, 2026.5)) > 10, "Fairbanks should be far off");
});

Deno.test("geomag: decimalYear + validity window", () => {
  assertEquals(decimalYear(new Date(Date.UTC(2026, 0, 1))), 2026);
  assert(Math.abs(decimalYear(new Date(Date.UTC(2026, 6, 2))) - 2026.5) < 0.01);
  assert(inRange(2025.0) && inRange(2029.9), "inside the model's window");
  assert(!inRange(2024.9) && !inRange(2030.0), "outside it, WMM2025 is extrapolation and must say so");
});

Deno.test("meanFix — averaging shrinks the random error toward the truth", () => {
  const rnd = mulberry32(7);
  const truth = { lat: 50.4501, lng: 30.5234 };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const ss = Array.from({ length: 60 }, () => ({          
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
  const walked = [{ ...base, lat: base.lat - 40 / 110540, t: 500 }, ...still];
  assertEquals(stationaryTail(walked, { now: 6000 }).length, 5, "the pre-walk fix must be cut, not averaged");
  const old = [{ ...base, t: -60000 }, ...still];
  assertEquals(stationaryTail(old, { now: 6000, maxAgeMs: 25000 }).length, 5);
  assertEquals(stationaryTail([], { now: 0 }).length, 0);
});

Deno.test("stationaryTail — 'same spot' scales with the fix quality", () => {
  const at = (dLat, accuracy) => ({ lat: 50.45 + dLat / 110540, lng: 30.52, accuracy, t: 1000 });
  const coarse = [at(-6, 10), { ...at(0, 10), t: 2000 }];
  const fine = [at(-6, 1), { ...at(0, 1), t: 2000 }];
  assertEquals(stationaryTail(coarse, { now: 2000 }).length, 2);
  assertEquals(stationaryTail(fine, { now: 2000 }).length, 1);
});

Deno.test("segErr / totalErr — a measurement carries its endpoints' doubt", () => {
  assertEquals(segErr({ accuracy: 3 }, { accuracy: 4 }), 5);          
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
  assertEquals(Math.round(trueFrom(0, 7.5) * 10) / 10, 7.5);      
  assertEquals(Math.round(trueFrom(355, 10) * 10) / 10, 5);        
  assertEquals(Math.round(trueFrom(5, -10) * 10) / 10, 355);       
  assertEquals(trueFrom(123, null), 123, "no position → no model → the heading stays magnetic, uncorrected");
  const kyiv = declination(50.4501, 30.5234, 0, 2026.0);
  assert(kyiv > 5 && kyiv < 12, `Kyiv declination should be ~5-12° east, got ${kyiv}`);
  assert(trueFrom(0, kyiv) !== 0, "a compass in Kyiv that reports 0 is not pointing at true north");
});

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
  assertEquals(hapticFor(el('<button><span id=i>go</span></button>', "#i")), "tick");
});

Deno.test("hapticFor — silence where a buzz would be a fault, not feedback", () => {
  assertEquals(hapticFor(el("<div id=x>text</div>", "#x")), null, "plain text is not tappable");
  assertEquals(hapticFor(el('<input id=x type="text">', "#x")), null, "a buzz per keystroke is a broken phone");
  assertEquals(hapticFor(el("<textarea id=x></textarea>", "#x")), null);
  assertEquals(hapticFor(el('<input id=x type="search">', "#x")), null);
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

Deno.test("resumeAt — the band, not the saved number", () => {
  const D = 5400;                                        
  assertEquals(resumeAt(1800, D), 1800, "mid-film → resume exactly there");
  assertEquals(resumeAt(12, D), 0, "12s in you have not started — resuming there is just noise");
  assertEquals(resumeAt(RESUME_MIN, D), RESUME_MIN, "the threshold itself resumes");
  assertEquals(resumeAt(D * 0.99, D), 0, "on the credits of a film you finished → start over, not stranded");
  assertEquals(resumeAt(D, D), 0);
  assertEquals(resumeAt(600, Infinity), 0, "live has no resume");
  assertEquals(resumeAt(600, 0), 0, "duration unknown → do not guess");
  assertEquals(resumeAt(NaN, D), 0);
  assertEquals(resumeAt(undefined, D), 0, "nothing saved → start at the start");
  assertEquals(resumeAt(-5, D), 0, "never seek backwards out of the file");
});


Deno.test("validateSpec: an action either leaves the app or plays in it", () => {
  const withDetail = (actions) => ({ ...baseList(), detail: { title: "name", actions } });
  validateSpec(withDetail([{ label: "open", href: "url" }]));
  validateSpec(withDetail([{ label: "watch", play: "video" }]));
  validateSpec(withDetail([{ label: "watch", play: "video", icon: "lucide:play" }]));
  assertThrows(() => validateSpec(withDetail([{ label: "x" }])), Error, "spec.detail.actions[0].href");
  const err = assertThrows(() => validateSpec(withDetail([{ label: "x", href: "url", play: "video" }])), Error);
  assert(err.message.includes("spec.detail.actions[0].play"), err.message);
  assertThrows(() => validateSpec(withDetail([{ play: "video" }])), Error, "spec.detail.actions[0].label");
});

Deno.test("validateSpec: gallery needs art, because the art IS the recognition", () => {
  const gal = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "gallery", title: "name", ...card } }] });
  validateSpec(gal({ image: "iconUrl" }));
  validateSpec(gal({ icon: "glyph" }));
  validateSpec(gal({ image: "iconUrl", subtitle: "publisher", badges: [{ field: "version" }] }));
  const err = assertThrows(() => validateSpec(gal({ subtitle: "publisher" })), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs art/.test(err.message), err.message);
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
  assertEquals(pollutantBand("pm2_5", 10), 0, "10 tops Good");
  assertEquals(pollutantBand("pm2_5", 10.5), 1);
  assertEquals(pollutantBand("pm2_5", 75), 4);
  assertEquals(pollutantBand("pm2_5", 80), 5, "beyond the last breakpoint → extreme");
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
  assertEquals(pollenBand("grass", 20), 1, "20 grass grains = Low");
  assertEquals(pollenBand("ragweed", 20), 2, "20 ragweed grains = Moderate (lower threshold)");
  assertEquals(pollenBand("birch", 60), 3, "trees peak fast: 60 birch = High");
  assertEquals(pollenBand("mugwort", null), -1);
  assert(POLLEN_BANDS.length === 5);
});
