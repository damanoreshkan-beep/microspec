// microspec runtime — sensors unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";
import { hapticFor, lookHeadingDeg } from "../sensors.js";

// Parsed with the real linkedom DOM, not a stub with a fake closest(): the whole function IS a selector
// plus a few exceptions, and a hand-rolled closest() would only ever prove that my stub agrees with me.
const el = (h, sel) => new DOMParser().parseFromString(`<body>${h}</body>`, "text/html").querySelector(sel);

Deno.test("hapticFor — every tappable answers, by default and without the app asking", () => {
  for (const [h, sel] of [
    ["<button id=x>go</button>", "#x"],
    ['<a id=x href="/y">go</a>', "#x"],
    ['<div id=x role="button">go</div>', "#x"],
    ['<button data-tab="me" id=x>me</button>', "#x"],
    ['<div id=x class="btn">go</div>', "#x"],
    ['<input id=x type="checkbox">', "#x"],
    ["<select id=x><option>a</option></select>", "#x"],
    ["<summary id=x>more</summary>", "#x"],
  ]) assertEquals(hapticFor(el(h, sel)), "tick", `${h} should tick`);
  // the tap lands on the icon INSIDE the button — closest() is why this works
  assertEquals(hapticFor(el('<button><span id=i>go</span></button>', "#i")), "tick");
});

Deno.test("hapticFor — silence where a buzz would be a fault, not feedback", () => {
  assertEquals(hapticFor(el("<div id=x>text</div>", "#x")), null, "plain text is not tappable");
  assertEquals(hapticFor(el('<input id=x type="text">', "#x")), null, "a buzz per keystroke is a broken phone");
  assertEquals(hapticFor(el("<textarea id=x></textarea>", "#x")), null);
  assertEquals(hapticFor(el('<input id=x type="search">', "#x")), null);
  // Feedback for an action that will not happen is a lie you can feel.
  assertEquals(hapticFor(el("<button id=x disabled>go</button>", "#x")), null);
  assertEquals(hapticFor(el('<button id=x aria-disabled="true">go</button>', "#x")), null);
  assertEquals(hapticFor(null), null);
});

Deno.test("lookHeadingDeg — camera heading, checked against the W3C worked example", () => {
  assertAlmostEquals(lookHeadingDeg(0, 90, 0), 0, 1e-9, "upright portrait, camera north");
  assertAlmostEquals(lookHeadingDeg(270, 90, 0), 90, 1e-9, "heading = 360−α when upright, matching the flat convention");
  assertAlmostEquals(lookHeadingDeg(0, 45, 0), 0, 1e-9, "pitching the camera down does not turn it");
});

Deno.test("lookHeadingDeg — invariant under the gimbal-lock re-expression that broke swarm's aim", () => {
  // at β=90° the sensor may hand back the SAME orientation with α jumped and γ compensating;
  // the exact leap the owner reported: α 1° → −300° (≡60°). The projected heading must not move.
  const a = lookHeadingDeg(1, 90, 0), b = lookHeadingDeg(60, 90, -59);
  assertAlmostEquals(a, 359, 1e-9);
  assertAlmostEquals(b, a, 1e-6, "α+γ preserved ⇒ same physical orientation ⇒ same heading");
  assertAlmostEquals(lookHeadingDeg(10, 90, 0), lookHeadingDeg(0, 90, 10), 1e-6);
});

Deno.test("lookHeadingDeg — null where a camera heading does not exist", () => {
  assertEquals(lookHeadingDeg(123, 0, 0), null, "flat on the table: camera straight down");
  assertEquals(lookHeadingDeg(45, 180, 0), null, "flat face-down: camera straight up");
  assertEquals(lookHeadingDeg(0, 85, 0) !== null, true, "5° off vertical is still a heading");
});

Deno.test("hapticFor — destructive hits harder; apps can opt out or up", () => {
  assertEquals(hapticFor(el('<button id=x class="btn btn-error">delete</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="bump">clear</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="off">silent</button>', "#x")), null, "an element that fires its own must be able to stay silent");
  assertEquals(hapticFor(el('<button id=x data-haptic="ok">saved</button>', "#x")), "ok");
});
