// microspec runtime — trace unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { distanceM as trDist, length as trLength, bbox as trBbox, spanM as trSpan, boxAround as trBoxAround, segments as trSegments, simplify as trSimplify, project as trProject, share as trShare, stops as trStops, M_PER_DEG_LAT, mPerDegLon } from "../trace.js";

// ── trace.js — the geometry behind `trail` ────────────────────────────────────────────────────────────

Deno.test("trace: distance is haversine, and longitude shrinks with latitude", () => {
  // One degree of LATITUDE is the same length everywhere; it is the definition of the mean radius.
  assert(Math.abs(trDist({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - M_PER_DEG_LAT) < 0.5);
  assert(Math.abs(trDist({ lat: 49, lon: 12 }, { lat: 50, lon: 12 }) - M_PER_DEG_LAT) < 0.5);

  // One degree of LONGITUDE is not: at 60° it is half the equator's, which is the whole reason the
  // projection scales x by cos(lat) instead of treating degrees as square.
  assert(Math.abs(trDist({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - M_PER_DEG_LAT) < 0.5);
  assert(Math.abs(trDist({ lat: 60, lon: 0 }, { lat: 60, lon: 1 }) - M_PER_DEG_LAT / 2) < 60);

  assertEquals(trDist(null, { lat: 1, lon: 1 }), 0);
  assertEquals(trDist({ lat: 5, lon: 5 }, { lat: 5, lon: 5 }), 0);
});

Deno.test("trace: length sums consecutive fixes and needs no smoothing to be right", () => {
  const pts = [{ lat: 50, lon: 30 }, { lat: 50.001, lon: 30 }, { lat: 50.002, lon: 30 }];
  assert(Math.abs(trLength(pts) - M_PER_DEG_LAT * 0.002) < 0.1);
  assertEquals(trLength([{ lat: 1, lon: 1 }]), 0);
  assertEquals(trLength([]), 0);
});

Deno.test("trace: a box round-trips through boxAround → spanM", () => {
  const c = { lat: 50.45, lon: 30.52 };
  const box = trBoxAround(c, 1200, 800);
  const s = trSpan(box);
  assert(Math.abs(s.w - 1200) < 0.01, `w ${s.w}`);
  assert(Math.abs(s.h - 800) < 0.01, `h ${s.h}`);
  assertEquals(trBbox([]), null);
  assertEquals(trSpan(null), { w: 0, h: 0 });
});

Deno.test("trace: a stroke ends at a time gap AND at an impossible jump", () => {
  const base = { lat: 50, lon: 30 };
  const gapped = [
    { ...base, at: 0 }, { ...base, at: 10_000 },
    { ...base, at: 10_000 + 400_000 },                       // 6.6 min of silence — the page was not listening
  ];
  assertEquals(trSegments(gapped).map((s) => s.length), [2, 1]);

  // 600 m between consecutive fixes: nobody walked it, so the line must not be drawn.
  const jumped = [
    { lat: 50, lon: 30, at: 0 },
    { lat: 50.0054, lon: 30, at: 10_000 },
    { lat: 50.0055, lon: 30, at: 20_000 },
  ];
  assertEquals(trSegments(jumped).map((s) => s.length), [1, 2]);
  assertEquals(trSegments([]).length, 0);

  // One continuous walk stays ONE stroke — a splitter that splits everything is not a splitter.
  const walk = Array.from({ length: 6 }, (_, i) => ({ lat: 50 + i * 0.0002, lon: 30, at: i * 10_000 }));
  assertEquals(trSegments(walk).length, 1);
});

Deno.test("trace: simplify drops a wiggle below tolerance and keeps a spike above it", () => {
  const kx = mPerDegLon(50);
  const detour = (offsetM) => [
    { lat: 50.0000, lon: 30 },
    { lat: 50.0002, lon: 30 + offsetM / kx },
    { lat: 50.0004, lon: 30 },
  ];
  assertEquals(trSimplify(detour(1), 8).length, 2, "a 1 m wiggle at 8 m tolerance is noise");
  assertEquals(trSimplify(detour(40), 8).length, 3, "a 40 m detour is the shape of the walk");

  // Collinear fixes carry no shape at all and all of them go, however many there are.
  const straight = Array.from({ length: 9 }, (_, i) => ({ lat: 50 + i * 0.0002, lon: 30 }));
  assertEquals(trSimplify(straight, 8).length, 2);

  // Endpoints are never dropped, whatever the tolerance — a route must still start and end where it did.
  const kept = trSimplify(detour(1), 1e6);
  assertEquals(kept.length, 2);
  assertEquals(kept[0].lat, 50.0000);
  assertEquals(kept[kept.length - 1].lat, 50.0004);
  assertEquals(trSimplify([{ lat: 1, lon: 1 }], 8).length, 1);
});

Deno.test("trace: project keeps aspect, points north up, and fills the stage it is given", () => {
  const c = { lat: 50.45, lon: 30.52 };
  const box = trBoxAround(c, 1000, 1000);
  const corners = [
    { lat: box.maxLat, lon: box.minLon },   // north-west
    { lat: box.maxLat, lon: box.maxLon },
    { lat: box.minLat, lon: box.maxLon },
  ];
  const p = trProject(corners, { box, width: 100, height: 100 });
  // North-west lands at the ORIGIN: y grows downward, like every screen coordinate system.
  assert(Math.abs(p[0].x - 0) < 0.01 && Math.abs(p[0].y - 0) < 0.01, JSON.stringify(p[0]));
  assert(Math.abs(p[1].x - 100) < 0.01 && Math.abs(p[1].y - 0) < 0.01, JSON.stringify(p[1]));
  assert(Math.abs(p[2].y - 100) < 0.01, JSON.stringify(p[2]));

  // A 2:1 box on a square stage uses the full width and HALF the height — aspect preserved, not stretched.
  const wide = trBoxAround(c, 1000, 500);
  const wp = trProject([
    { lat: wide.maxLat, lon: wide.minLon }, { lat: wide.minLat, lon: wide.maxLon },
  ], { box: wide, width: 100, height: 100 });
  const s = trShare(wp, 100, 100);
  assert(Math.abs(s.w - 1) < 0.01, `w ${s.w}`);
  assert(Math.abs(s.h - 0.5) < 0.01, `h ${s.h}`);

  // Padding is inset on BOTH sides, and a day spent in one building has no span to scale by.
  const padded = trProject(corners, { box, width: 100, height: 100, pad: 10 });
  assert(Math.abs(padded[0].x - 10) < 0.01, JSON.stringify(padded[0]));
  const still = trProject([{ lat: c.lat, lon: c.lon }], { box: trBoxAround(c, 0, 0), width: 100, height: 100 });
  assertEquals(still, [{ x: 50, y: 50 }]);
  assertEquals(trProject([], { box, width: 10, height: 10 }), []);
});

Deno.test("trace: share is the one measurement no other gate takes", () => {
  // Overflow checks are one-sided: they fail ink that is too big and are silent about ink that is timid.
  const box = trBoxAround({ lat: 50, lon: 30 }, 1000, 1000);
  const full = trProject([
    { lat: box.maxLat, lon: box.minLon }, { lat: box.minLat, lon: box.maxLon },
  ], { box, width: 200, height: 200 });
  const s = trShare(full, 200, 200);
  assert(Math.abs(s.w - 1) < 1e-9 && Math.abs(s.h - 1) < 1e-9, JSON.stringify(s));
  assertEquals(trShare([], 200, 200), { w: 0, h: 0 });
  assertEquals(trShare(full, 0, 0), { w: 0, h: 0 });
});

Deno.test("trace: a stop is a cluster that lasted, not every pair of close fixes", () => {
  const at = (min) => min * 60_000;
  const here = { lat: 50.45, lon: 30.52 };
  const pts = [
    { ...here, at: at(0) }, { ...here, at: at(3) }, { ...here, at: at(9) },   // 9 minutes in one place
    { lat: 50.46, lon: 30.53, at: at(20) },                                    // moved on
  ];
  const found = trStops(pts);
  assertEquals(found.length, 1);
  assertEquals(found[0].ms, at(9));

  // Two fixes 30 seconds apart in the same spot is walking past, not stopping.
  assertEquals(trStops([{ ...here, at: 0 }, { ...here, at: 30_000 }]).length, 0);
  assertEquals(trStops([]).length, 0);
});
