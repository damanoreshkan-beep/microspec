/* @ts-self-types="./playback.d.ts" */
/**
 * # runtime/playback.js — the resume band, kept where a test can hold it
 *
 * The playback rules of the runtime's video player, pure and dependency-free ON PURPOSE: `video.js` is a
 * Preact component and drags htm/preact behind it, so anything living there can never be reached by the
 * unit gate. The decisions worth getting right are decisions, not markup — they belong where a test can
 * hold them. The one decision here: where to actually start, given a remembered position. Resuming is only
 * kind when it lands you where you left. Two ways it turns hostile: a few seconds in, it "resumes" you to a
 * spot you would rather just watch from the top; at the very end, it drops you on the credits of a film you
 * already finished and offers no way back in. Both read as the app being broken, so the rule is a band, not
 * a saved number — and a live stream has no position at all.
 *
 * ![The playback module's map](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-playback.svg)
 *
 * ## Import
 * ```js
 * import { resumeAt, RESUME_MIN, RESUME_TAIL } from "/_rt/playback.js";                    // an app's page: the import map resolves /_rt/
 * import { resumeAt, RESUME_MIN, RESUME_TAIL } from "@microspec/core/runtime/playback.js";  // a product rt/ module or a Deno test
 * ```
 * `/_rt/video.js` re-exports all three, so an app that already imports the player needs no second import.
 *
 * ## What it exports
 * - {@link resumeAt} — `resumeAt(saved, duration)`: the position to seek to, or 0 to start from the top.
 * - {@link RESUME_MIN} — 30 seconds; below this you have not started, starting over costs you nothing.
 * - {@link RESUME_TAIL} — 0.98 of the duration; past this you have finished, the film starts over.
 * - {@link recoverPlan} — `recoverPlan(kind, tried)`: what a FATAL player error deserves — reload the
 *   stream, recover the decoder, or give up.
 * - {@link NET_RETRIES} / {@link MEDIA_RETRIES} — 2 and 1; the bound on that recovery.
 * - {@link fmtClock} — `fmtClock(sec)`: seconds as `4:03` / `1:05:00`, and "" for a live or unknown length.
 * - {@link scrubSpan} / {@link scrubTo} / {@link skipTo} / {@link fmtDelta} — the drag-to-seek rules: what a
 *   screen-width of travel is worth, where it lands, and how the offset reads while the finger is down.
 *
 * ## In practice
 * ```js
 * import { resumeAt } from "./playback.js";                          // runtime/video.js, inside Player
 *
 * const ready = () => {
 *   if (dead) return;
 *   // Seek before the first frame is shown, not after: seeking a visible <video> makes the resume look
 *   // like a glitch — you watch the opening for a beat, then get yanked.
 *   const at = resumeAt(startAt, v.duration);
 *   if (at > 0) { try { v.currentTime = at; } catch { } }                 // not seekable
 *   setState("playing");
 * };
 * createPlayer(v, url, { type, onReady: ready, onError: () => { if (!dead) setState("error"); } });
 * ```
 * The app owns persistence: it stores what `onTime(t, duration)` reports and hands it back as `startAt`.
 *
 * ## How it fits
 * Imports nothing. `runtime/video.js` imports `resumeAt` for the `Player` component's first-frame seek and
 * re-exports `resumeAt`, `RESUME_MIN`, `RESUME_TAIL`. No farm app imports it directly; two reach it through
 * `/_rt/video.js` — iptv and reel, the video apps whose `startAt` goes through the band. Every generated
 * `sw.js` precaches it. The unit gate holds it in `tests/playback_test.js` (a 90-minute film, the credits,
 * a live stream, nothing saved, a negative position).
 *
 * ## Invariants and pitfalls
 * - The rule is a band, not a saved number: below `RESUME_MIN` and at or past `duration × RESUME_TAIL`
 *   the answer is 0. The threshold itself (`saved === RESUME_MIN`) resumes.
 * - A live stream has no position to return to: `duration` of Infinity, NaN, 0 or negative answers 0.
 *   Infinity must never become a seek.
 * - Nothing saved (undefined, NaN, a non-number) answers 0; so does a negative position — never seek
 *   backwards out of the file. Inputs go through `Number()`, so a stored string is fine.
 * - Seek in `onReady`, before the first frame is shown; a seek on a visible element reads as a glitch.
 * - Persistence is NOT here — the app stores the position and passes `startAt`; this module never
 *   touches storage.
 * - "Fatal" is hls.js's word for "my own retries are spent", not for "this stream is gone": a network
 *   error is reloadable and a media error is recoverable. Only the third kind, and a spent budget, is
 *   really the end — see `recoverPlan`.
 * @module
 */
// microspec runtime — playback rules. Pure and dependency-free ON PURPOSE: video.js is a Preact component
// and drags htm/preact behind it, so anything living there can never be reached by the unit gate. The
// decisions worth getting right are decisions, not markup — they belong where a test can hold them.


// Where to actually start, given a remembered position.
//
// Resuming is only kind when it lands you where you left. Two ways it turns hostile: a few seconds in, it
// "resumes" you to a spot you'd rather just watch from the top; at the very end, it drops you on the
// credits of a film you already finished and offers no way back in. Both read as the app being broken, so
// the rule is a band, not a saved number. A live stream has no position at all (duration = Infinity).
/** Seconds below which a saved position counts as not started — resume goes back to 0. */
export const RESUME_MIN = 30;          // below this you have not started; starting over costs you nothing
/** Fraction of the duration past which the film counts as finished — resume goes back to 0. */
export const RESUME_TAIL = 0.98;       // past this you have finished; the film starts over
/**
 * Where to actually start playback, given a remembered position and the media duration.
 * @param saved remembered position in seconds
 * @param duration media duration in seconds (Infinity or NaN for a live stream)
 * @returns the position to seek to, or 0 to start from the top
 */
export function resumeAt(saved, duration) {
  const t = Number(saved), d = Number(duration);
  if (!isFinite(t) || t < RESUME_MIN) return 0;
  if (!isFinite(d) || d <= 0) return 0;                 // live / unknown length → no such thing as resuming
  if (t >= d * RESUME_TAIL) return 0;
  return t;
}

/* WHAT TO DO ABOUT A FATAL PLAYER ERROR — the second decision worth a test.
   hls.js calls an error "fatal" when its own retries are spent, and the first version of video.js treated
   that word as final: one fatal error, `onError`, "Stream unavailable" forever, with nothing to press. But
   two of the three fatal kinds are recoverable, and hls.js's own guidance is to recover them rather than
   report them — a network error means "start loading again", a media error means "flush and recover the
   decoder". Both are exactly what a viewer does by hand when they close the clip and open it again, which
   is how this failure was actually being worked around: a proxied clip that 403s ONE segment, a manifest
   that arrives late on a mobile link, a decoder that trips over a discontinuity — every one of them ended
   the clip, and every one of them played on the second attempt.
   Bounded on purpose: two network attempts and one decoder recovery. Past that the stream really is gone,
   and a player that retries forever is a player that never says so. The delay backs off (0.5s, then 1s) —
   an immediate retry hits the same dead socket, and hls.js's own retry budget is already spent by then. */
/** Fatal network errors to retry with a reload before giving up. */
export const NET_RETRIES = 2;
/** Fatal media (decoder) errors to recover from before giving up. */
export const MEDIA_RETRIES = 1;
/**
 * What to do about a FATAL player error: reload the stream, recover the decoder, or give up.
 * @param kind "network", "media", or anything else (an unrecoverable kind)
 * @param tried how many of each have been attempted already, `{ net, media }`
 * @returns `{ act: "reload" | "recover" | "fail", delay }` — `delay` in ms, 0 for immediate
 */
export function recoverPlan(kind, tried = {}) {
  const net = Number(tried.net) || 0, med = Number(tried.media) || 0;
  if (kind === "network" && net < NET_RETRIES) return { act: "reload", delay: 500 * (net + 1) };
  if (kind === "media" && med < MEDIA_RETRIES) return { act: "recover", delay: 0 };
  return { act: "fail", delay: 0 };
}

/* THE CLOCK UNDER THE PICTURE. Pure, and here rather than in the component, for the same reason as the rest
   of this file: it is a decision (what a duration LOOKS like) and the unit gate can hold it.
   An hour changes the shape — 1:05 is a minute and five seconds, 1:05:00 is an hour — so the hours field
   appears only when there is one, and the minutes pad only under it. A stream that has not said how long it
   is (NaN, Infinity, a negative) has no clock at all: the caller shows LIVE, never "0:00", which reads as a
   video that failed to load. */
/**
 * Seconds as a clock: `0:07`, `4:03`, `1:05:00`. Empty string for a live or unknown duration.
 * @param sec seconds
 * @returns the clock string, or "" when there is no finite position to show
 */
export function fmtClock(sec) {
  // `Number(null)` is 0, and 0 is a real position — so nothing-at-all is rejected before the conversion.
  if (sec === null || sec === undefined || sec === "") return "";
  const n = Number(sec);
  if (!isFinite(n) || n < 0) return "";
  const whole = Math.floor(n), h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/* ── SCRUBBING WITH A FINGER ──────────────────────────────────────────────────────────────────────────────
   A drag across the picture is the one seek gesture people already know, and the whole quality of it is in
   one number: how many seconds a screen-width of travel is worth. Both ends are bad. Map the WHOLE clip to
   the width and a 40-minute film moves four minutes per millimetre — you cannot land on anything. Fix the
   rate (say a second per pixel) and a 30-second clip is over before your finger has crossed a third of the
   screen.
   So the span scales with the clip and is bounded at both ends: a quarter of the duration, never less than
   30s (a short clip stays scrubbable end to end) and never more than 180s (a long one stays precise, and a
   second swipe is cheap). On a 384px phone that is 13px per second at the floor and 2px per second at the
   ceiling — both inside what a thumb can hold steady. */
/** Seconds of media that one full screen-width of drag is worth, for a clip of this length. */
export function scrubSpan(duration) {
  const d = Number(duration);
  if (!isFinite(d) || d <= 0) return 0;                  // live or unknown: there is nothing to scrub through
  return Math.min(180, Math.max(30, d / 4));
}
/**
 * Where a horizontal drag lands: the position it started from, plus what the travel is worth, clamped.
 * @param from position the drag started at, in seconds
 * @param dx horizontal travel in CSS pixels (right is forward)
 * @param width the surface's width in CSS pixels
 * @param duration the media duration in seconds
 * @returns the target position in seconds, inside [0, duration]
 */
export function scrubTo(from, dx, width, duration) {
  const d = Number(duration), w = Number(width), span = scrubSpan(d);
  if (!span || !isFinite(w) || w <= 0) return Number(from) || 0;
  return skipTo(from, (Number(dx) || 0) / w * span, d);
}
/**
 * A position moved by a delta and kept inside the media: the rule behind both the drag and the ±10s tap.
 * @param from position in seconds
 * @param delta seconds to move (negative rewinds)
 * @param duration the media duration in seconds
 * @returns the new position, inside [0, duration]
 */
export function skipTo(from, delta, duration) {
  const d = Number(duration), to = (Number(from) || 0) + (Number(delta) || 0);
  if (!isFinite(to)) return Number(from) || 0;
  // A hair off the end rather than exactly on it: seeking to `duration` ENDS the clip, which is not what
  // "drag to the right" means to anyone holding the phone.
  const top = isFinite(d) && d > 0 ? Math.max(0, d - 0.25) : Infinity;
  return Math.min(top, Math.max(0, to));
}
/** A signed offset for the scrubbing HUD: `+0:10`, `−1:04`, `0:00`. */
export function fmtDelta(sec) {
  const n = Math.round(Number(sec) || 0);
  if (!n) return "0:00";
  return (n < 0 ? "\u2212" : "+") + fmtClock(Math.abs(n));
}
