// microspec runtime — overlay unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { overlayDepth } from "../overlay.js";

// ── overlayDepth: the arithmetic the Back-button routing runs on ────────────────────────────────────────
Deno.test("overlayDepth: a stack is worth one history entry per level", () => {
  assertEquals(overlayDepth(true), 1, "a plain open overlay");
  assertEquals(overlayDepth({ id: 1 }), 1, "a detail object");
  assertEquals(overlayDepth(null), 0);
  assertEquals(overlayDepth(false), 0);
  assertEquals(overlayDepth([]), 0, "an empty stack is closed");
  assertEquals(overlayDepth(["a", "b", "c"]), 3, "three dives = three Backs");
});
