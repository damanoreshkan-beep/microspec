// microspec runtime — playback unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { resumeAt, RESUME_MIN, recoverPlan, NET_RETRIES, MEDIA_RETRIES, fmtClock, scrubSpan, scrubTo, skipTo, fmtDelta } from "../playback.js";

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

Deno.test("fmtClock — the hours field appears only when there is one, and live has no clock", () => {
  assertEquals(fmtClock(0), "0:00");
  assertEquals(fmtClock(7), "0:07");
  assertEquals(fmtClock(243), "4:03");
  assertEquals(fmtClock(3600), "1:00:00");
  assertEquals(fmtClock(3905), "1:05:05", "under an hour the minutes pad, above it they must");
  assertEquals(fmtClock(59.9), "0:59", "a fraction of a second is not a second yet");
  for (const bad of [Infinity, NaN, -1, undefined, null, "abc"]) {
    assertEquals(fmtClock(bad), "", `a length nobody stated must not read as 0:00 (${bad})`);
  }
});

/* Drag-to-seek. The number that decides whether the gesture feels good is the SPAN — what a screen-width of
   travel is worth — so that is what these hold, at both bounds and in between. */
Deno.test("scrubSpan — a quarter of the clip, floored at 30s and capped at 180s", () => {
  assertEquals(scrubSpan(30), 30, "a short clip stays scrubbable end to end");
  assertEquals(scrubSpan(120), 30, "the floor still binds here");
  assertEquals(scrubSpan(400), 100);
  assertEquals(scrubSpan(3600), 180, "an hour-long film stays precise; a second swipe is cheap");
  for (const live of [0, -5, Infinity, NaN, undefined]) assertEquals(scrubSpan(live), 0, `nothing to scrub through (${live})`);
});

Deno.test("scrubTo — travel is a fraction of the width, and never leaves the clip", () => {
  // 400s clip → span 100s; a 384px surface → 0.26s per px.
  assertEquals(Math.round(scrubTo(200, 192, 384, 400)), 250, "half the width forward is half the span");
  assertEquals(Math.round(scrubTo(200, -192, 384, 400)), 150, "and back the same");
  assertEquals(scrubTo(10, -1000, 384, 400), 0, "dragging past the start stops at the start");
  assertEquals(scrubTo(390, 1000, 384, 400), 399.75, "and past the end stops a hair short — landing ON it would end the clip");
  assertEquals(scrubTo(42, 100, 384, Infinity), 42, "a live stream does not scrub");
  assertEquals(scrubTo(42, 100, 0, 400), 42, "a surface with no width cannot say what travel is worth");
});

Deno.test("skipTo — the ±10s tap is the same rule, and both ends hold", () => {
  assertEquals(skipTo(30, 10, 400), 40);
  assertEquals(skipTo(5, -10, 400), 0);
  assertEquals(skipTo(395, 10, 400), 399.75);
  assertEquals(skipTo(30, 10, Infinity), 40, "a live stream still moves — there is just no end to clamp to");
  assertEquals(skipTo(30, NaN, 400), 30, "a delta nobody computed changes nothing");
});

Deno.test("fmtDelta — signed, rounded, and a zero that says zero", () => {
  assertEquals(fmtDelta(10), "+0:10");
  assertEquals(fmtDelta(-64), "\u22121:04");
  assertEquals(fmtDelta(0.4), "0:00");
  assertEquals(fmtDelta(undefined), "0:00");
});
