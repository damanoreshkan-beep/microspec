// microspec runtime — melody unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { generateMelody, scoreMelody } from "../melody.js";
import { mulberry32 } from "../groove.js";

// ---- melody.js (the pitched-instrument generator: kalimba, handpan) ----
const D_KURD = [0, 7, 8, 10, 12, 14, 15, 17, 19];        // D Kurd fields as semitones from the ding
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];      // a C-major span

Deno.test("generateMelody is deterministic, seed-addressable, and in-scale", () => {
  const a = generateMelody(D_KURD, { seed: 2024 }), b = generateMelody(D_KURD, { seed: 2024 });
  assertEquals(JSON.stringify(a.notes), JSON.stringify(b.notes), "same seed must reproduce the phrase");
  assert(JSON.stringify(generateMelody(D_KURD, { seed: 7 }).notes) !== JSON.stringify(a.notes), "seeds differ");
  for (const n of a.notes) if (!n.rest) assert(n.i >= 0 && n.i < D_KURD.length, "index out of scale bounds");
});

Deno.test("every generated phrase RESOLVES — the last sounding note is the tonic", () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = generateMelody(C_MAJOR, { seed });
    const last = [...g.notes].reverse().find((n) => !n.rest);
    assert(last, `seed ${seed}: phrase is all rests`);
    assertEquals(((C_MAJOR[last.i] % 12) + 12) % 12, 0, `seed ${seed}: did not cadence on the tonic`);
    assert(g.score >= g.meanScore, `seed ${seed}: winner below its own pool mean`);
  }
});

Deno.test("THE CLAIM: generated melodies are SMOOTHER than random — not a dice roll", () => {
  // "Sweet" is, in part, Huron's small-interval preference. A coin-flip line over the same scale should move
  // by wildly bigger leaps on average than the scored search; if it ever stops, the generator is pointless.
  const meanLeap = (idxs, scale) => { let s = 0; for (let k = 1; k < idxs.length; k++) s += Math.abs(scale[idxs[k]] - scale[idxs[k - 1]]); return s / Math.max(1, idxs.length - 1); };
  let searchWins = 0, sumSearch = 0, sumRandom = 0;
  const SEEDS = 40;
  for (let seed = 0; seed < SEEDS; seed++) {
    const g = generateMelody(D_KURD, { seed });
    const gIdx = g.notes.filter((n) => !n.rest).map((n) => n.i);
    const rng = mulberry32(seed ^ 0x1234abcd);
    const rIdx = Array.from({ length: gIdx.length }, () => Math.floor(rng() * D_KURD.length));
    const gs = meanLeap(gIdx, D_KURD), rs = meanLeap(rIdx, D_KURD);
    sumSearch += gs; sumRandom += rs;
    if (gs < rs) searchWins++;
  }
  assert(searchWins >= SEEDS - 3, `the search must be smoother than random on ~every seed (won ${searchWins}/${SEEDS})`);
  assert(sumSearch / SEEDS < sumRandom / SEEDS - 0.6, "the smoothness margin must be decisive, not noise");
});

Deno.test("scoreMelody rewards a resolving, stepwise phrase over a leapy unresolved one", () => {
  const stepwise = [0, 1, 2, 1, 2, 3, 2, 1, 0].map((i) => ({ i }));      // walks and lands on the tonic
  const leapy = [0, 8, 1, 7, 2, 6, 3, 5, 4].map((i) => ({ i }));         // zig-zags, ends off the tonic
  assert(scoreMelody(stepwise, C_MAJOR) > scoreMelody(leapy, C_MAJOR), "sweet phrase must outscore the leapy one");
});
