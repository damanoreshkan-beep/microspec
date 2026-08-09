// microspec runtime — weather unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  curvePath, isSnowCode, isStormCode, moonPhase, skyInk, skyVary, solarPosition, wmoIcon, wmoKey,
} from "../weather.js";

Deno.test("WMO codes map to one lucide glyph and one condition key each", () => {
  assertEquals(wmoIcon(0), "lucide:sun");
  assertEquals(wmoKey(0), "wClear");
  assertEquals(wmoKey(2), "wPartly");
  assertEquals(wmoKey(3), "wOvercast");
  assertEquals(wmoKey(45), "wFog");
  assertEquals(wmoKey(61), "wRain");
  assertEquals(wmoKey(95), "wThunder");
  // Every code the API can return must land on a key, including the gaps in the WMO table.
  for (let c = 0; c <= 99; c++) {
    assert(wmoIcon(c).startsWith("lucide:"), `code ${c} has no lucide glyph`);
    assert(wmoKey(c).startsWith("w"), `code ${c} has no condition key`);
  }
});

Deno.test("snow and storm codes are the ones the sky changes behaviour for", () => {
  assert(isSnowCode(73) && isSnowCode(77) && isSnowCode(85));
  assert(!isSnowCode(61), "rain is not snow");
  assert(!isSnowCode(95), "a thunderstorm is not snow");
  assert(isStormCode(95) && isStormCode(99));
  assert(!isStormCode(82), "violent showers are not a thunderstorm");
});

Deno.test("solarPosition agrees with Open-Meteo's own sunrise/sunset for Kyiv", () => {
  // Ground truth from the API itself (2026-08-09, Europe/Kyiv, UTC+3): sunrise 05:37, sunset 20:29.
  // Sunrise is defined at -0.833° (refraction + the sun's radius), so that is what we must land on.
  const lat = 50.4501, lng = 30.5234;
  const rise = solarPosition(lat, lng, Date.parse("2026-08-09T02:37:00Z"));
  const set = solarPosition(lat, lng, Date.parse("2026-08-09T17:29:00Z"));
  assertAlmostEquals(rise.alt, -0.833, 0.1, "sunrise altitude");
  assertAlmostEquals(set.alt, -0.833, 0.1, "sunset altitude");
  assert(rise.az > 50 && rise.az < 75, `August sunrise is NE, got ${rise.az}`);
  assert(set.az > 285 && set.az < 310, `August sunset is NW, got ${set.az}`);
  // Local solar noon: highest of the day, due south.
  const noon = solarPosition(lat, lng, Date.parse("2026-08-09T10:03:00Z"));
  assert(noon.alt > 55 && noon.alt < 56, `noon altitude ${noon.alt}`);
  assertAlmostEquals(noon.az, 180, 1.5, "solar noon is due south");
  // And the sun is genuinely down in the middle of the night, not merely near the horizon.
  assert(solarPosition(lat, lng, Date.parse("2026-08-09T21:00:00Z")).alt < -15);
});

Deno.test("moonPhase tracks the real phase to within half a day", () => {
  // Cross-checked against astronomy-engine (worst of three 2026 dates: 0.42 days). Not imported here —
  // these tests run offline; the check is recorded so the tolerance is not a guess.
  assertAlmostEquals(moonPhase(Date.parse("2026-08-09T21:00:00Z")), 0.8912, 0.017);
  assertAlmostEquals(moonPhase(Date.parse("2026-03-03T12:00:00Z")), 0.5005, 0.017);
  for (const iso of ["1999-01-01T00:00:00Z", "2030-06-15T00:00:00Z"]) {
    const p = moonPhase(Date.parse(iso));
    assert(p >= 0 && p < 1, `phase out of range before/after the epoch: ${p}`);
  }
});

Deno.test("skyVary normalises readings into the shader's 0..1 channels", () => {
  const [alt, cloud, wet, wind] = skyVary({ alt: 30, cloudPct: 50, precipMm: 2, precipProb: 40, windKmh: 22.5 });
  assertAlmostEquals(alt, 0.5, 1e-9, "30° of 60 is half the altitude range");
  assertAlmostEquals(cloud, 0.5, 1e-9);
  assertAlmostEquals(wet, Math.sqrt(0.25), 1e-9, "sqrt keeps light rain visible");
  assertAlmostEquals(wind, 0.5, 1e-9);
  // Night floors at civil twilight, not at the nadir — below -12° the sky stops changing.
  assertEquals(skyVary({ alt: -12 })[0], -1);
  assertEquals(skyVary({ alt: -40 })[0], -1);
  assertEquals(skyVary({ alt: 90 })[0], 1);
  // Probability alone wets the sky a little; a downpour saturates rather than overflowing.
  assert(skyVary({ precipProb: 100 })[2] > 0.2 && skyVary({ precipProb: 100 })[2] < 0.25);
  assertEquals(skyVary({ precipMm: 40 })[2], 1);
  assertEquals(skyVary({})[2], 0, "a dry sky is exactly dry");
});

Deno.test("skyInk carries the discrete conditions and the light's screen position", () => {
  const [snow, haze, storm, lightX] = skyInk({ code: 73, visibilityM: 8000, az: 180 });
  assertEquals(snow, 1);
  assertEquals(storm, 0);
  assertAlmostEquals(haze, 0.5, 1e-9, "8 km sits mid-way between 1 km and 15 km");
  assertAlmostEquals(lightX, 0.5, 1e-9, "due south is centre frame");
  assertEquals(skyInk({ visibilityM: 40000 })[1], 0, "clear air is not hazy");
  assertEquals(skyInk({ visibilityM: 200 })[1], 1, "fog saturates");
  assertEquals(skyInk({ az: 90 })[3], 0, "sunrise at the left edge");
  assertEquals(skyInk({ az: 270 })[3], 1, "sunset at the right edge");
  assertEquals(skyInk({ az: 20 })[3], 0, "before sunrise the light stays pinned, never off-frame");
  assertEquals(skyInk({ code: 96 })[2], 1);
});

Deno.test("curvePath draws a spline through the values and closes an area under it", () => {
  const { line, area, points, min, max } = curvePath([18, 21, 19, 24], 120, 60, 10);
  assertEquals(points.length, 4);
  assertEquals(min, 18);
  assertEquals(max, 24);
  assertEquals(points[0].x, 0);
  assertEquals(points[3].x, 120, "the last point sits on the right edge");
  assertEquals(points[3].y, 10, "the maximum sits at the top pad");
  assertEquals(points[0].y, 50, "the minimum sits at the bottom of the band");
  assert(line.startsWith("M0.00,50.00"), line.slice(0, 20));
  assertEquals(line.match(/C/g).length, 3, "one cubic per gap");
  assert(area.endsWith("Z"), "the area is closed");
  assert(area.includes("L0.00,60"), "the area drops to the full height, not to the padded band");
});

Deno.test("curvePath survives the inputs that would otherwise divide by zero", () => {
  // A flat forecast is a real forecast. Pinning it to the bottom of the band would read as a cold snap.
  const flat = curvePath([20, 20, 20], 100, 40, 4);
  assertEquals(flat.points.map((p) => p.y), [20, 20, 20], "flat data sits on the centre line");
  assertEquals(curvePath([], 100, 40).line, "", "nothing to draw returns empty strings, never NaN");
  assertEquals(curvePath([5], 100, 40).line, "", "one point is not a curve");
  assertEquals(curvePath(null, 100, 40).points.length, 0);
  const holes = curvePath([1, null, 3, undefined, NaN, 9], 100, 40);
  assertEquals(holes.points.length, 3, "non-finite readings are dropped, not plotted as zero");
  assert(!holes.line.includes("NaN"));
});
