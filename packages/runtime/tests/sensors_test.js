// microspec runtime — sensors unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";
import { hapticFor, lookHeadingDeg, screenHeadingDeg, heldHeadingDeg, camControls } from "../sensors.js";

// camControls — a fake track records what applyConstraints received; nothing is guessed beyond getCapabilities
const fakeTrack = (caps, { settings = {}, reject = () => false } = {}) => {
  const calls = [];
  return { calls, getCapabilities: () => caps, getSettings: () => settings,
    applyConstraints: (c) => { calls.push(c.advanced[0]); return reject(c.advanced[0]) ? Promise.reject(new Error("no")) : Promise.resolve(); } };
};
Deno.test("camControls: caps read from the track; torch, zoom (clamped) and a focus point apply", async () => {
  const tr = fakeTrack({ torch: true, zoom: { min: 1, max: 8, step: 0.1 }, focusMode: ["continuous", "single-shot"] }, { settings: { zoom: 2 } });
  const c = camControls(tr);
  assertEquals(c.caps, { torch: true, zoom: { min: 1, max: 8, step: 0.1, now: 2 }, focus: true });
  assertEquals(await c.torch(true), true);
  assertEquals(await c.zoom(40), true);
  assertEquals(await c.zoom(0), true);
  assertEquals(await c.focusAt(1.4, -2), true);
  assertEquals(tr.calls, [{ torch: true }, { zoom: 8 }, { zoom: 1 }, { focusMode: "single-shot", pointsOfInterest: [{ x: 1, y: 0 }] }]);
});
Deno.test("camControls: a point the track refuses falls back to single-shot, then continuous", async () => {
  const tr = fakeTrack({ focusMode: ["continuous", "single-shot"] }, { reject: (a) => !!a.pointsOfInterest });
  assertEquals(await camControls(tr).focusAt(0.5, 0.5), true);
  assertEquals(tr.calls.map((a) => a.focusMode), ["single-shot", "single-shot"]);
  const tr2 = fakeTrack({ focusMode: ["continuous"] });
  assertEquals(await camControls(tr2).focusAt(0.5, 0.5), true);
  assertEquals(tr2.calls, [{ focusMode: "continuous" }]);
});
Deno.test("camControls: no track, or a track without the feature → caps off and every call resolves false", async () => {
  const none = camControls(null);
  assertEquals(none.caps, { torch: false, zoom: null, focus: false });
  assertEquals([await none.torch(true), await none.zoom(2), await none.focusAt(0.5, 0.5)], [false, false, false]);
  const flat = fakeTrack({ zoom: { min: 1, max: 1 } });
  assertEquals(camControls(flat).caps.zoom, null);
  assertEquals(await camControls(flat).zoom(2), false);
  assertEquals(flat.calls, []);
});

// shortest angular distance, the only honest way to compare two headings
const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

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

Deno.test("screenHeadingDeg — flat, it IS the (360−α) it replaces", () => {
  for (const a of [0, 37, 90, 180, 271, 359]) {
    assertAlmostEquals(screenHeadingDeg(a, 0), (360 - a) % 360, 1e-9, `α=${a}`);
    // a phone tilted the way one is actually read still reports the same direction
    assertAlmostEquals(screenHeadingDeg(a, 30), (360 - a) % 360, 1e-9, `α=${a} at 30° of pitch`);
  }
});

Deno.test("screenHeadingDeg — face-down the top edge points behind you, and says so", () => {
  // (360−α) claimed north here for a phone whose top edge is aimed due south.
  assertAlmostEquals(screenHeadingDeg(0, 180), 180, 1e-9);
  assertAlmostEquals(screenHeadingDeg(90, 170), (180 - 90 + 360) % 360, 1e-9);
});

Deno.test("screenHeadingDeg — null where the top edge points at the sky", () => {
  assertEquals(screenHeadingDeg(20, 90), null, "upright: no screen-top heading exists");
  assertEquals(screenHeadingDeg(20, 85), null, "5° off vertical is already unusable");
  assertEquals(screenHeadingDeg(20, 75) !== null, true, "15° off vertical still answers");
});

Deno.test("heldHeadingDeg — the leap the owner reported does not survive the projection", () => {
  // The sensor re-expresses one physical orientation with α jumped and γ absorbing it. Raw α moves 40°
  // between these two events; the phone has not moved at all.
  const a = heldHeadingDeg(20, 90, 0), b = heldHeadingDeg(-300, 90, 320);
  assertAlmostEquals(apart(a, b), 0, 1e-6, "same orientation ⇒ same heading");
  assertAlmostEquals(apart((360 - 20) % 360, (360 - -300) % 360), 40, 1e-9, "…which the old formula did not give");
});

Deno.test("heldHeadingDeg — raising the phone does not turn the needle", () => {
  // One facing, every grip from flat on the palm to straight up. Nothing about the direction changed.
  for (const a of [0, 47, 200, 314]) {
    for (let beta = 0; beta <= 90; beta += 3) {
      assertAlmostEquals(apart(heldHeadingDeg(a, beta, 0), (360 - a) % 360), 0, 1e-6, `α=${a} β=${beta}`);
    }
  }
});

Deno.test("heldHeadingDeg — never null, at any orientation", () => {
  // |h_y|² + |h_z|² = 1 + sin²γ·cos²β ≥ 1: the two axes cannot go degenerate together. A dial that
  // freezes reads as broken exactly like one that jumps, so this is a contract, not an optimisation.
  for (let beta = -180; beta <= 180; beta += 7) {
    for (let gamma = -90; gamma <= 90; gamma += 7) {
      const h = heldHeadingDeg(123, beta, gamma);
      assertEquals(typeof h === "number" && Number.isFinite(h), true, `β=${beta} γ=${gamma} → ${h}`);
      assertEquals(h >= 0 && h < 360, true, `β=${beta} γ=${gamma} out of range: ${h}`);
    }
  }
});

Deno.test("heldHeadingDeg — continuous through the handoff, at any roll", () => {
  // The contract behind "it jumps" is CONTINUITY, and a fixed threshold does not test it: rolled 60° the
  // camera axis genuinely aims 60° off the screen's top edge, so the handoff has that much ground to
  // cover and covering it smoothly is the most anyone can ask. What separates a slew from a jump is that
  // a slew shrinks with the step — quarter the pitch step, quarter the movement. A discontinuity does not
  // care how finely it is sampled, which is exactly how the old α reading behaved at β≈90.
  const sweep = (gamma, step) => {
    let prev = heldHeadingDeg(80, 0, gamma), worst = 0;
    for (let beta = step; beta <= 100; beta += step) {
      const h = heldHeadingDeg(80, beta, gamma);
      worst = Math.max(worst, apart(h, prev));
      prev = h;
    }
    return worst;
  };
  for (const gamma of [-60, -30, 0, 25, 55]) {
    const coarse = sweep(gamma, 1), fine = sweep(gamma, 0.25);
    assertEquals(coarse < 6, true, `γ=${gamma}: ${coarse.toFixed(2)}° for one degree of pitch`);
    assertEquals(fine < coarse / 3 + 0.05, true,
      `γ=${gamma}: ${coarse.toFixed(2)}° at 1° steps but ${fine.toFixed(2)}° at 0.25° — that is a step, not a slew`);
  }
});

Deno.test("heldHeadingDeg — landscape turns the dial, not the camera", () => {
  assertAlmostEquals(heldHeadingDeg(0, 0, 0, 90), 90, 1e-9, "flat: the UI frame is rotated");
  assertAlmostEquals(heldHeadingDeg(0, 90, 0, 90), lookHeadingDeg(0, 90, 0), 1e-9,
    "upright: the reading is the camera's, which the screen rotation does not touch");
});

Deno.test("hapticFor — destructive hits harder; apps can opt out or up", () => {
  assertEquals(hapticFor(el('<button id=x class="btn btn-error">delete</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="bump">clear</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="off">silent</button>', "#x")), null, "an element that fires its own must be able to stay silent");
  assertEquals(hapticFor(el('<button id=x data-haptic="ok">saved</button>', "#x")), "ok");
});
