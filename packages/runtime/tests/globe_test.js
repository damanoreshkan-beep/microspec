// The globe's one piece of arithmetic. Everything else in globe.js is canvas and pointer handling, which a
// unit test can only lie about; `ringAround` is a number turning into a shape, and it is the shape a rule
// is read through — the band the edge resolved, drawn around the reader's own point.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { geoDistance } from "d3-geo";
import { ringAround } from "../globe.js";

const KYIV = { lat: 50.45, lon: 30.52 };
const R = 6371;   // km, the same mean radius the edge measures distances on

Deno.test("a ring is every point at that many kilometres, on the sphere the edge measures on", () => {
  // 752 km is what the band "близько" resolves to at the station's nominal altitude — the number the reader
  // never sees and the circle he does.
  const g = ringAround(KYIV.lat, KYIV.lon, 752);
  assertEquals(g.type, "Polygon");
  const ring = g.coordinates[0];
  assert(ring.length > 30, "a circle needs enough points to look like one");
  for (const [lon, lat] of ring) {
    const km = geoDistance([KYIV.lon, KYIV.lat], [lon, lat]) * R;
    assert(Math.abs(km - 752) < 1, `a point ${Math.round(km)} km out is not on a 752 km ring`);
  }
});

Deno.test("the ring grows with the band and stays centred where the reader is", () => {
  const near = ringAround(KYIV.lat, KYIV.lon, 383), far = ringAround(KYIV.lat, KYIV.lon, 2252);
  const radius = (g) => geoDistance([KYIV.lon, KYIV.lat], g.coordinates[0][0]) * R;
  assert(radius(far) > radius(near));
  assert(Math.abs(radius(near) - 383) < 1);       // «прямо над головою»
  assert(Math.abs(radius(far) - 2252) < 1);       // «видно з мого двору», the horizon itself
  // A ring at the pole is still a ring: the reader may be anywhere, and a circle drawn in degrees of
  // longitude would collapse there.
  const pole = ringAround(89.5, 0, 752);
  for (const [lon, lat] of pole.coordinates[0]) assert(Math.abs(geoDistance([0, 89.5], [lon, lat]) * R - 752) < 1);
});
