import { assert, assertEquals } from "jsr:@std/assert@1";
import { field, declination, decimalYear, inRange, trueFrom } from "../geomag.js";


Deno.test("geomag: all 100 official NOAA test points", async () => {
  const { pkgRoot } = await import("../pkgroot.js");
  const txt = await Deno.readTextFile(new URL("packages/runtime/wmm2025_testvalues.txt", pkgRoot(import.meta.url, 3)));
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

Deno.test("trueFrom — east declination adds, and wraps the circle", () => {
  assertEquals(Math.round(trueFrom(0, 7.5) * 10) / 10, 7.5);
  assertEquals(Math.round(trueFrom(355, 10) * 10) / 10, 5);
  assertEquals(Math.round(trueFrom(5, -10) * 10) / 10, 355);
  assertEquals(trueFrom(123, null), 123, "no position → no model → the heading stays magnetic, uncorrected");
  const kyiv = declination(50.4501, 30.5234, 0, 2026.0);
  assert(kyiv > 5 && kyiv < 12, `Kyiv declination should be ~5-12° east, got ${kyiv}`);
  assert(trueFrom(0, kyiv) !== 0, "a compass in Kyiv that reports 0 is not pointing at true north");
});
