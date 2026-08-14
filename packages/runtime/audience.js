// audience — how many people are actually watching a LAN station, from a request counter alone.
//
// The shell's server (template/…/LanServer.java) exposes ONE number: `hits`, a monotonic count of 200s it
// has served. It cannot say who asked — there are no sockets, sessions or user agents on that surface. The
// old wall app printed `hits` beside an eye glyph, which is a lie by a factor of the poll rate: at a 700ms
// poll ONE viewer produces ~86 hits a minute, so a single person reads as a crowd.
//
// What the counter DOES carry honestly is a rate. Every viewer page polls on a fixed period, so each one
// contributes exactly 1000/pollMs requests per second and the audience is the rate scaled by that period.
// Deltas are noisy (a poll lands on either side of a sample boundary), so the rate is smoothed before it
// becomes a person; rounding a jittering 1.4 up and down would flicker the number in front of the owner.
const MIN_DT_MS = 1200;   // below this a single request's timing jitter dominates the delta

/** Requests per second between two {hits, at} samples. null when the pair cannot answer. */
export function ratePerSec(prev, next) {
  if (!prev || !next) return null;
  const dt = next.at - prev.at;
  if (!(dt >= MIN_DT_MS)) return null;
  const dh = next.hits - prev.hits;
  if (dh < 0) return null;                      // LanServer.start resets hits to 0 — a restart, not traffic
  return (dh * 1000) / dt;
}

/** Exponential smoothing. alpha is the weight of the NEW value; 0 keeps the old one forever. */
export function smooth(prev, next, alpha = 0.45) {
  if (prev == null || !Number.isFinite(prev)) return next;
  return prev + (next - prev) * alpha;
}

/**
 * A running estimate fed by server.status polls. Keeps the smoothed rate, not the smoothed head count:
 * averaging integers would round away the very fractions that distinguish one viewer from two.
 */
export function makeAudience(pollMs, { alpha = 0.45 } = {}) {
  let last = null, rate = null;
  return {
    /** @returns {number|null} whole viewers, or null while the estimate has no second sample yet. */
    push(hits, at) {
      const next = { hits, at };
      const r = ratePerSec(last, next);
      if (r == null) {
        // A restart zeroes the counter; keeping the old rate would credit the new station with a crowd.
        if (last && hits < last.hits) rate = null;
        if (!last || next.at - last.at >= MIN_DT_MS || hits < last.hits) last = next;
        return this.viewers;
      }
      last = next;
      rate = smooth(rate, r, alpha);
      return this.viewers;
    },
    reset() { last = null; rate = null; },
    get rate() { return rate; },
    /** Anything above zero is at least one person: a fraction means a poll straddled the sample edge. */
    get viewers() {
      if (rate == null) return null;
      const v = (rate * pollMs) / 1000;
      return v < 0.25 ? 0 : Math.max(1, Math.round(v));
    },
  };
}
