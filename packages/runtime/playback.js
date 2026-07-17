// microspec runtime — playback rules. Pure and dependency-free ON PURPOSE: video.js is a Preact component
// and drags htm/preact behind it, so anything living there can never be reached by the unit gate. The
// decisions worth getting right are decisions, not markup — they belong where a test can hold them.

// Pick the one file a browser can actually play, out of an archive item's pile.
//
// This is not "the first video file". A real Internet Archive item ships the ORIGINAL — frequently a
// Cinepak .avi of 773 MB that no browser has ever been able to decode — alongside the h.264 derivative
// that plays, plus ~70 thumbnails, a torrent and four metadata blobs. Take the original and you ship a
// black screen for a film that works fine; the app would look broken while the archive was perfect.
//
// So: extension must be playable, path must not be a thumbnail, then rank by codec (h.264 is the one
// format every phone decodes) and prefer the largest of the best rank — with range requests, size buys
// bitrate rather than waiting, and the viewer chose to watch a film.
const PLAYABLE = /\.(mp4|m4v|webm|ogv)$/i;
const THUMBS = /(^|\/)[^/]*\.thumbs\//i;
const RANK = [/h\.?\s*264|avc/i, /mpeg-?\s*4|mp4/i, /webm|vp[89]/i, /ogg|ogv|theora/i];
const rankOf = (f) => {
  const s = `${f.format || ""} ${f.name || ""}`;
  const i = RANK.findIndex((re) => re.test(s));
  return i < 0 ? RANK.length : i;
};
export function pickFile(files) {
  const ok = (files || []).filter((f) => f?.name && PLAYABLE.test(f.name) && !THUMBS.test(f.name));
  if (!ok.length) return null;
  return ok.sort((a, b) => rankOf(a) - rankOf(b) || (Number(b.size) || 0) - (Number(a.size) || 0))[0];
}

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
