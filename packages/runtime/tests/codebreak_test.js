
import { assert, assertEquals } from "jsr:@std/assert@1";
import { mulberry32 } from "../groove.js";
import { feedback, solved, makeSecret } from "../codebreak.js";

Deno.test("codebreak feedback: exact vs partial, and the repeated-colour trap", () => {
  assertEquals(feedback([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, partial: 0 });
  assertEquals(feedback([1, 2, 1, 2], [2, 1, 2, 1]), { exact: 0, partial: 4 });
  assertEquals(feedback([0, 0, 0, 0], [1, 1, 1, 1]), { exact: 0, partial: 0 });
  assertEquals(feedback([0, 1, 2, 3], [0, 0, 0, 0]), { exact: 1, partial: 0 });
  assertEquals(feedback([0, 0, 1, 2], [0, 1, 0, 0]), { exact: 1, partial: 2 });
  const fb = feedback([3, 3, 3, 1], [3, 1, 1, 3]);
  assert(fb.exact + fb.partial <= 4, "exact+partial can't exceed the slot count");
  assertEquals(fb, { exact: 1, partial: 2 });
});

Deno.test("codebreak solved: only a full house of exacts wins", () => {
  assert(solved(feedback([2, 4, 1, 5], [2, 4, 1, 5]), 4));
  assert(!solved(feedback([2, 4, 1, 5], [2, 4, 1, 0]), 4));
  assert(!solved({ exact: 3, partial: 1 }, 4));
});

Deno.test("codebreak makeSecret is deterministic, in range, right length", () => {
  const a = makeSecret(mulberry32(42), 6, 4), b = makeSecret(mulberry32(42), 6, 4);
  assertEquals(a, b, "same seed → same code (shareable)");
  assert(makeSecret(mulberry32(1), 6, 4).join() !== a.join(), "different seeds diverge");
  for (let seed = 0; seed < 40; seed++) {
    const c = makeSecret(mulberry32(seed), 6, 4);
    assertEquals(c.length, 4, `seed ${seed}: wrong length`);
    for (const v of c) assert(Number.isInteger(v) && v >= 0 && v < 6, `seed ${seed}: colour ${v} out of range`);
  }
});
