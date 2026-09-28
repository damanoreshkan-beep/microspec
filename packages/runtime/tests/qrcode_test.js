import { assert, assertEquals } from "jsr:@std/assert@1";
import { qrMatrix } from "../qrcode.js";

Deno.test("qrcode qrMatrix: square, odd module count, with the three finder patterns", () => {
  const m = qrMatrix("https://damanoreshkan-beep.github.io/microspec/qr/");
  const n = m.length;
  assert(n >= 21 && n % 2 === 1, `module count ${n} should be odd, ≥21`);
  assertEquals(m.every((row) => row.length === n), true);
  const finder = (r0, c0) => m[r0][c0] && m[r0 + 6][c0 + 6] && !m[r0 + 1][c0 + 1] && m[r0 + 3][c0 + 3];
  assert(finder(0, 0), "top-left finder");
  assert(finder(0, n - 7), "top-right finder");
  assert(finder(n - 7, 0), "bottom-left finder");
});
