import { assert, assertEquals } from "jsr:@std/assert";
import { makeAudience, ratePerSec, smooth } from "../audience.js";

const POLL = 700;   // the viewer page's poll period; one viewer therefore makes 1000/700 req/s

Deno.test("audience/ratePerSec: requests per second between two samples", () => {
  assertEquals(ratePerSec({ hits: 0, at: 0 }, { hits: 10, at: 5000 }), 2);
  assertEquals(ratePerSec(null, { hits: 1, at: 1000 }), null, "one sample cannot carry a rate");
  assertEquals(ratePerSec({ hits: 0, at: 0 }, { hits: 5, at: 900 }), null, "too short to be anything but jitter");
  assertEquals(ratePerSec({ hits: 90, at: 0 }, { hits: 3, at: 4000 }), null, "a counter that went backwards is a restart");
});

Deno.test("audience/smooth: the first value seeds, later ones ease", () => {
  assertEquals(smooth(null, 4), 4);
  assertEquals(smooth(0, 10, 0.5), 5);
  assertEquals(smooth(10, 10, 0.5), 10, "a steady signal must not drift");
});

/** Feed a station serving `viewers` pollers for `seconds`, sampled every 4s the way the view does. */
function run(a, viewers, seconds, startAt = 0, startHits = 0) {
  let hits = startHits, t = startAt, out = null;
  for (let i = 0; i < seconds / 4; i++) {
    t += 4000;
    hits += Math.round((viewers * 4000) / POLL);
    out = a.push(hits, t);
  }
  return { viewers: out, hits, t };
}

Deno.test("audience: one poller reads as one person, not as 86", () => {
  const a = makeAudience(POLL);
  const { viewers, hits } = run(a, 1, 60);
  assert(hits > 80, `a single viewer really did make ${hits} requests in a minute`);
  assertEquals(viewers, 1, "and must still be reported as one person");
});

Deno.test("audience: the head count tracks the room", () => {
  for (const n of [2, 3, 7, 12]) {
    const a = makeAudience(POLL);
    assertEquals(run(a, n, 90).viewers, n, `${n} pollers`);
  }
});

Deno.test("audience: nobody watching reads as zero, not as null forever", () => {
  const a = makeAudience(POLL);
  assertEquals(run(a, 0, 30).viewers, 0);
});

Deno.test("audience: the first sample cannot answer yet", () => {
  const a = makeAudience(POLL);
  assertEquals(a.push(0, 1000), null, "no delta exists yet");
  assertEquals(a.viewers, null);
});

Deno.test("audience: the room emptying decays to zero", () => {
  const a = makeAudience(POLL);
  const seed = run(a, 5, 60);
  assertEquals(seed.viewers, 5);
  const gone = run(a, 0, 60, seed.t, seed.hits);
  assertEquals(gone.viewers, 0, "a rate that stops must fall to nobody");
});

Deno.test("audience: a station restart does not credit the new one with the old crowd", () => {
  const a = makeAudience(POLL);
  const seed = run(a, 6, 60);
  assertEquals(seed.viewers, 6);
  // LanServer.start() sets hits back to 0 — the very next sample is smaller than the last.
  assertEquals(a.push(0, seed.t + 4000), null, "the estimate is dropped, not carried over");
  assertEquals(run(a, 1, 40, seed.t + 4000, 0).viewers, 1, "and rebuilds from the new station");
});

Deno.test("audience: a poll straddling a sample edge is still one person", () => {
  // 4s of a 700ms poll is 5.71 requests; real samples alternate 5 and 6 as the boundary drifts.
  const a = makeAudience(POLL);
  let hits = 0, t = 0, seen = null;
  for (let i = 0; i < 30; i++) { t += 4000; hits += (i % 2 ? 5 : 6); seen = a.push(hits, t); }
  assertEquals(seen, 1, "jitter must not flicker the number in front of the owner");
});

Deno.test("audience: reset clears both the sample and the smoothed rate", () => {
  const a = makeAudience(POLL);
  run(a, 4, 60);
  a.reset();
  assertEquals(a.viewers, null);
  assertEquals(a.rate, null);
});
