// microspec runtime — gesture unit tests: the pure decisions behind the hooks.
import { assertEquals } from "jsr:@std/assert@1";
import { swipeDir as gSwipeDir } from "../swipe.js";

Deno.test("gesture swipeDir — dominant axis, threshold, tap is null", () => {
  assertEquals(gSwipeDir(0, 0), null);
  assertEquals(gSwipeDir(30, 40), null);
  assertEquals(gSwipeDir(80, 10), "right");
  assertEquals(gSwipeDir(-80, 30), "left");
  assertEquals(gSwipeDir(10, 90), "down");
  assertEquals(gSwipeDir(-40, -70), "up");
  assertEquals(gSwipeDir(60, 60), "right");          // a perfect diagonal reads as horizontal
  assertEquals(gSwipeDir(20, 20, 10), "right");
});

