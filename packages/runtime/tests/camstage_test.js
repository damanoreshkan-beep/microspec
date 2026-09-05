// camstage.js — the one camera stage of the kit. The maths a tap-to-focus needs is pure and pinned here: a
// viewport point under a cover fit maps to the sensor point it shows, and the front camera mirrors it.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { camPoint, CamStage } from "../camstage.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

Deno.test("camPoint: the centre is the centre, whatever the fit", () => {
  for (const [vw, vh, asp] of [[1920, 1080, 0.46], [1080, 1920, 0.46], [640, 480, 1.5]]) {
    const p = camPoint(0.5, 0.5, vw, vh, false, asp);
    assert(near(p.x, 0.5) && near(p.y, 0.5), `${vw}×${vh} @ ${asp}: ${p.x},${p.y}`);
  }
});

Deno.test("camPoint: a landscape picture on a portrait screen is cropped left and right — the screen's edge is inside the sensor", () => {
  // 16:9 picture over a 9:19.5 viewport: the visible strip is a narrow slice of the sensor's width
  const asp = 384 / 832, l = camPoint(0, 0.5, 1920, 1080, false, asp), r = camPoint(1, 0.5, 1920, 1080, false, asp);
  assert(l.x > 0.3 && l.x < 0.5, `left edge ${l.x}`);
  assert(r.x > 0.5 && r.x < 0.7, `right edge ${r.x}`);
  assert(near(l.x, 1 - r.x), "the crop is symmetric");
  assert(near(camPoint(0.5, 0, 1920, 1080, false, asp).y, 0), "the top is the top");
});

Deno.test("camPoint: the front camera mirrors x only", () => {
  const asp = 0.5, a = camPoint(0.2, 0.3, 1080, 1920, false, asp), m = camPoint(0.2, 0.3, 1080, 1920, true, asp);
  assert(near(a.x, 1 - m.x) && near(a.y, m.y), `${a.x},${a.y} vs ${m.x},${m.y}`);
});

Deno.test("camPoint: never leaves the sensor", () => {
  for (const [u, v] of [[-1, -1], [2, 2], [0, 1], [1, 0]]) {
    const p = camPoint(u, v, 1920, 1080, false, 0.5);
    assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${u},${v} → ${p.x},${p.y}`);
  }
});

Deno.test("CamStage is a component", () => { assertEquals(typeof CamStage, "function"); });
