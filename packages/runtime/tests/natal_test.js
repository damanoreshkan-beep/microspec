// microspec runtime — natal unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
// ── natal.js — the precise natal chart (see apps/transit/RESEARCH.md for every number quoted here) ─────
import { aspects, ASPECTS } from "../aspects.js";
import { zoneOffset, knownZone, zonedToUTC, parseOffset, formatOffset, lmtOffset, houses, houseOf, HOUSE_SYSTEMS, placidusDefined, transits, transitAspect, separation, exactHits, TRANSIT_ORB, TRANSIT_ASPECTS, HIT_PRECISION, norm360, wrap180 } from "../natal.js";

// Albert Einstein, 14 Mar 1879 11:30 LMT, Ulm 48°24'N 10°00'E (Rodden AA). LMT from longitude = +0:40 →
// 10:50 UT. Frame values come from astronomy-engine at that instant (astro.js chartFrame); they are pinned
// here so this test stays pure and offline. Reference cusps: astro.com, Placidus.
const EINSTEIN = { ramc: 344.18405, eps: 23.456473, phi: 48.4 };
const dms = (deg, min) => deg + min / 60;

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
