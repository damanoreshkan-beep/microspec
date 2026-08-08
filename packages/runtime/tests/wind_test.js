// microspec runtime — wind (fipple-flute fingering) unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)


import { assertEquals } from "jsr:@std/assert@1";
import { fingeredSemitone, handCovered } from "../wind.js";

// ---- wind: fipple-flute fingering (packages/runtime/wind.js) ----
// The rule is physics, so it is checkable against the real charts players use — that is the whole reason
// it is a rule and not a transcribed table.

const SOPILKA = [11, 9, 7, 5, 4, 2, 0];                       // C-major prima: index = holes covered from the top
const fing = (s) => new Set([...s].map((c, i) => (c === "●" ? i : -1)).filter((i) => i >= 0));

Deno.test("fingeredSemitone: the diatonic staircase (all six covered → tonic, lift from the bottom)", () => {
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);   // До
  assertEquals(fingeredSemitone(fing("●●●●●○"), SOPILKA), 2);   // Ре
  assertEquals(fingeredSemitone(fing("●●●●○○"), SOPILKA), 4);   // Мі
  assertEquals(fingeredSemitone(fing("●●●○○○"), SOPILKA), 5);   // Фа
  assertEquals(fingeredSemitone(fing("●●○○○○"), SOPILKA), 7);   // Соль
  assertEquals(fingeredSemitone(fing("●○○○○○"), SOPILKA), 9);   // Ля
  assertEquals(fingeredSemitone(fing("○○○○○○"), SOPILKA), 11);  // Сі
});

Deno.test("fingeredSemitone: a fork flattens — the canonical cross-fingering", () => {
  // The reference case every whistle chart carries: C natural on a D whistle is ○●●○○○ — top hole open, so
  // the base is the seventh (C♯), and two holes covered BELOW the opening flatten it a semitone. Transposed
  // to a C sopilka the same fingering must give B♭ (A♯ = 10), a semitone under the open-holes B.
  assertEquals(fingeredSemitone(fing("○●●○○○"), SOPILKA), 10);
  // …and the rest of the chromatics fall out of the same line, unasked:
  assertEquals(fingeredSemitone(fing("●●●●○●"), SOPILKA), 3);   // Ре♯ (base Мі, forked)
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);   // Фа♯ (base Соль, forked)
  assertEquals(fingeredSemitone(fing("●○●●●●"), SOPILKA), 8);   // Соль♯ (base Ля, forked)
});

Deno.test("fingeredSemitone: only holes BELOW the first opening fork it", () => {
  // A hole covered below an opening flattens; the opening itself still decides the base. Covering MORE
  // below does not flatten further — a fork is a semitone, not a slider.
  assertEquals(fingeredSemitone(fing("●●○●○○"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);
  // All covered has no opening, so it can never be forked.
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);
  // Generic over the family: the scale and hole count are the caller's, not the runtime's.
  assertEquals(fingeredSemitone(new Set([0]), [7, 5, 0]), 5);   // a 2-hole pipe, its own tuning
});

Deno.test("handCovered: one finger must play the scale — the bug that made the pipe sound one note", () => {
  // Shipped without this and every hole on the instrument sounded Ля or Ля♯. Not a tuning error: a single
  // touch is a single hole, and a lone hole never forms the consecutive run from the top that sets the air
  // column, so the pitch collapsed to "nothing stopped, one fork" no matter where you pressed.
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([5]), 0);    // До   — one finger on the lowest hole stops all six
  assertEquals(semi([4]), 2);    // Ре
  assertEquals(semi([3]), 4);    // Мі
  assertEquals(semi([2]), 5);    // Фа
  assertEquals(semi([1]), 7);    // Соль
  assertEquals(semi([0]), 9);    // Ля
  assertEquals(semi([]), 11);    // Сі — a finger on the body of the pipe: breath, nothing stopped

  // Without the hand, the failure is total and identical everywhere — the regression this guards:
  assertEquals(fingeredSemitone(new Set([5]), SOPILKA), 10);
  assertEquals(fingeredSemitone(new Set([3]), SOPILKA), 10);
});

Deno.test("handCovered: a second finger below the first is a fork, not a re-stack", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([0, 2]), 8);   // Соль♯ — Ля forked
  assertEquals(semi([1, 3]), 6);   // Фа♯   — Соль forked
  assertEquals(semi([3, 5]), 3);   // Ре♯   — Мі forked
  // Order of touches must not matter: it is a set of fingers, not a sequence of taps.
  assertEquals(semi([3, 1]), semi([1, 3]));
});
