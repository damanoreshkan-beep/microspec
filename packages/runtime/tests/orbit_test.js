// microspec runtime — orbit unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { sat, makeSat, parseTleText, subpoint, sunEciUnit, isSunlit, FALLBACK_TLE } from "../orbit.js";

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
