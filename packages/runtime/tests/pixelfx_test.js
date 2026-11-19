import { assert, assertEquals } from "jsr:@std/assert@1";
import { PIXEL_FX } from "../pixelfx.js";
import * as L from "../pixelfx.vendor.js";

Deno.test("every named effect is in the vendored bundle, a one-shot with a size", () => {
  assertEquals(PIXEL_FX.length, 6);
  for (const k of PIXEL_FX) {
    const m = L[k];
    assert(m?.meta, `${k} is bundled`);
    assertEquals(m.meta.loop, false, `${k} ends by itself`);
    assert(m.meta.size?.[0] > 0 && m.meta.size?.[1] > 0, `${k} has a size`);
  }
});

Deno.test("an effect draws pixels over transparency and then finishes", () => {
  for (const k of PIXEL_FX) {
    const m = L[k], [w, h] = m.meta.size, [ox, oy] = m.meta.origin || [w / 2, h / 2];
    const frame = L.createFrame(w, h), out = new Uint8ClampedArray(w * h * 4), fx = L.createFx(m, { x: ox, y: oy });
    let lit = 0, n = 0;
    while (!fx.done() && n < 600) {
      fx.update(1 / 30);
      L.clearFrame(frame);
      fx.draw(frame);
      L.composite(frame, out, null);
      let c = 0;
      for (let i = 3; i < out.length; i += 4) if (out[i]) c++;
      lit = Math.max(lit, c);
      n++;
    }
    assert(lit > 1000, `${k} lit ${lit} pixels at its peak`);
    assert(lit < w * h, `${k} leaves transparent pixels around it`);
    assert(fx.done(), `${k} finished within ${n} frames`);
  }
});
