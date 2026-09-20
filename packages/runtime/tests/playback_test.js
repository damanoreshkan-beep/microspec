// microspec runtime — playback unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { resumeAt, RESUME_MIN, recoverPlan, NET_RETRIES, MEDIA_RETRIES } from "../playback.js";

// ── resumeAt — resuming is only kind when it lands you where you left ─────────────────────────────

Deno.test("resumeAt — the band, not the saved number", () => {
  const D = 5400;                                        // a 90-minute film
  assertEquals(resumeAt(1800, D), 1800, "mid-film → resume exactly there");
  assertEquals(resumeAt(12, D), 0, "12s in you have not started — resuming there is just noise");
  assertEquals(resumeAt(RESUME_MIN, D), RESUME_MIN, "the threshold itself resumes");
  assertEquals(resumeAt(D * 0.99, D), 0, "on the credits of a film you finished → start over, not stranded");
  assertEquals(resumeAt(D, D), 0);
  // A live stream has no position to return to; Infinity must not become a seek.
  assertEquals(resumeAt(600, Infinity), 0, "live has no resume");
  assertEquals(resumeAt(600, 0), 0, "duration unknown → do not guess");
  assertEquals(resumeAt(NaN, D), 0);
  assertEquals(resumeAt(undefined, D), 0, "nothing saved → start at the start");
  assertEquals(resumeAt(-5, D), 0, "never seek backwards out of the file");
});

/* recoverPlan — what a FATAL hls.js error deserves. The bug it exists for: "fatal" was read as final, so one
   403 on one segment, or a manifest that arrived late on a mobile link, ended the clip with "Stream
   unavailable" — and the same clip played when it was opened again by hand. */
Deno.test("recoverPlan — a fatal NETWORK error is reloaded, twice, with a backing-off delay", () => {
  assertEquals(recoverPlan("network", { net: 0, media: 0 }), { act: "reload", delay: 500 });
  assertEquals(recoverPlan("network", { net: 1, media: 0 }), { act: "reload", delay: 1000 }, "the second waits longer — an immediate retry hits the same dead socket");
  assertEquals(recoverPlan("network", { net: NET_RETRIES, media: 0 }).act, "fail", "the budget is a budget");
});

Deno.test("recoverPlan — a fatal MEDIA error recovers the decoder once, immediately", () => {
  assertEquals(recoverPlan("media", { net: 0, media: 0 }), { act: "recover", delay: 0 });
  assertEquals(recoverPlan("media", { net: 0, media: MEDIA_RETRIES }).act, "fail");
  assertEquals(recoverPlan("media", { net: NET_RETRIES, media: 0 }).act, "recover", "a spent network budget is not the decoder's");
});

Deno.test("recoverPlan — any other kind is the end, and nothing is counted twice", () => {
  assertEquals(recoverPlan("", { net: 0, media: 0 }).act, "fail", "hls.js's third kind (OTHER) is unrecoverable");
  assertEquals(recoverPlan("mux", {}).act, "fail");
  assertEquals(recoverPlan("network").act, "reload", "no bookkeeping yet == nothing tried yet");
  assertEquals(recoverPlan("network", { net: "2" }).act, "fail", "a count that arrives as a string still counts");
});

