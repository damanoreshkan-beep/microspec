/* @ts-self-types="./player.d.ts" */
/**
 * The queue logic behind the kit's Transport widget — one pure, unit-tested answer to "where does the
 * transport go next" instead of five hand-rolled players. Exports the repeat cycle (`REPEAT_MODES`,
 * `REPEAT_ICON`, `cycleRepeat`), `advance` and the `clock` readout.
 * @module
 */
// microspec runtime — PLAYBACK: the queue logic behind the kit's Transport widget (SYSTEMIC, pure).
//
// Before this, every music app hand-rolled its own: rave had prev/play/next with a square stop and no seek,
// v2m had prev/play/next with a seek bar, drift/ambient/synesth/fmradio had a bare play toggle — five
// vocabularies for one idea, diverging quietly. This is the kit's answer, same as Sheet/Segmented: one
// component, configured, never forked. Every control is OPTIONAL — pass the handler and it appears.
//
// The WIDGET is a kit node (ui.js Transport). What lives here is what a player has to get RIGHT and what
// a screenshot can never check: where the transport goes next at the end of a list, under each repeat mode,
// and whether the listener pressed the button or the track simply ended. Pure, unit-tested, no DOM.

// ── repeat: the standard three-state cycle every player uses ──────────────────────────────────────────
/** The three repeat modes, in cycle order: off → all → one. */
export const REPEAT_MODES = ["off", "all", "one"];
/** Icon name per repeat mode, for the Transport widget. */
export const REPEAT_ICON = { off: "lucide:repeat", all: "lucide:repeat", one: "lucide:repeat-1" };
/**
 * The next repeat mode in the cycle; an unset or unknown mode counts as "off".
 * @param mode the current repeat mode
 * @returns the following entry of REPEAT_MODES
 */
export function cycleRepeat(mode) {
  const i = Math.max(0, REPEAT_MODES.indexOf(mode));    // an unset/unknown mode IS "off" — cycle on from it
  return REPEAT_MODES[(i + 1) % REPEAT_MODES.length];
}

/**
 * Where the transport goes next. Returns the next index, or **-1 meaning "stop"**.
 *
 * `manual` is the distinction hand-written players usually miss: when a track ENDS under repeat-one it
 * plays again, but when the listener presses ▶︎▶︎ they mean "move on" — repeat-one must not trap them on
 * one track. Likewise "off" wraps for a manual press and stops at the end of the list on its own.
 */
export function advance(index, length, { step = 1, repeat = "off", shuffle = false, manual = false, rng = Math.random } = {}) {
  const len = Math.max(0, Math.floor(length || 0));
  if (len === 0) return -1;
  if (len === 1) return repeat === "off" && !manual ? -1 : 0;
  if (repeat === "one" && !manual) return Math.min(Math.max(index, 0), len - 1);
  if (shuffle) {
    let n = Math.floor(rng() * (len - 1));
    if (n >= index) n += 1;                            // never the track already playing
    return Math.min(n, len - 1);
  }
  const next = index + step;
  if (next >= len) return repeat === "off" && !manual ? -1 : 0;
  if (next < 0) return len - 1;                        // "previous" from the first track wraps to the end
  return next;
}

/** mm:ss for a transport readout. Negative/absent → 0:00, so a missing duration never renders NaN. */
export function clock(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
