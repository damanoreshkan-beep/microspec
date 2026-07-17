// microspec runtime — playback rules. Pure and dependency-free ON PURPOSE: video.js is a Preact component
// and drags htm/preact behind it, so anything living there can never be reached by the unit gate. The
// decisions worth getting right are decisions, not markup — they belong where a test can hold them.


// Where to actually start, given a remembered position.
//
// Resuming is only kind when it lands you where you left. Two ways it turns hostile: a few seconds in, it
// "resumes" you to a spot you'd rather just watch from the top; at the very end, it drops you on the
// credits of a film you already finished and offers no way back in. Both read as the app being broken, so
// the rule is a band, not a saved number. A live stream has no position at all (duration = Infinity).
export const RESUME_MIN = 30;          // below this you have not started; starting over costs you nothing
export const RESUME_TAIL = 0.98;       // past this you have finished; the film starts over
export function resumeAt(saved, duration) {
  const t = Number(saved), d = Number(duration);
  if (!isFinite(t) || t < RESUME_MIN) return 0;
  if (!isFinite(d) || d <= 0) return 0;                 // live / unknown length → no such thing as resuming
  if (t >= d * RESUME_TAIL) return 0;
  return t;
}
