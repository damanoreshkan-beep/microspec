/* @ts-self-types="./player.d.ts" */
/**
 * # runtime/player.js — where the transport goes next, decided once
 *
 * The queue logic behind the kit's Transport widget. Before it, every music app hand-rolled its own: rave
 * had prev/play/next with a square stop and no seek, v2m had a seek bar, drift/ambient/synesth/fmradio had
 * a bare play toggle — five vocabularies for one idea, diverging quietly. The widget is a kit node
 * (ui.js Transport); what lives here is what a player has to get RIGHT and what a screenshot can never
 * check: where the transport goes at the end of a list, under each repeat mode, and whether the listener
 * pressed the button or the track simply ended. Pure, unit-tested, no DOM.
 *
 * ![The player module map: repeat cycle, advance and the clock readout feeding the Transport widget](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-player.svg)
 *
 * ## Import
 * ```js
 * import { advance, cycleRepeat, clock } from "/_rt/player.js";                    // an app's page: the import map resolves /_rt/
 * import { advance, cycleRepeat, clock } from "@microspec/core/runtime/player.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link REPEAT_MODES} — `["off", "all", "one"]`, the three repeat modes in cycle order.
 * - {@link REPEAT_ICON} — icon name per repeat mode (`lucide:repeat`, `lucide:repeat-1`) for the Transport widget.
 * - {@link cycleRepeat} — `cycleRepeat(mode)`: the next mode in the cycle; an unset or unknown mode counts as "off".
 * - {@link advance} — `advance(index, length, { step, repeat, shuffle, manual, rng })`: the next index, or -1 meaning "stop".
 * - {@link clock} — `clock(ms)`: an `m:ss` readout; negative or absent input renders `0:00`, never NaN.
 *
 * ## In practice
 * ```js
 * import { advance, cycleRepeat } from "/_rt/player.js";
 *
 * // Where "next" goes is the shared transport's logic, not this app's; this file only says what to play.
 * function step(dir, manual) {
 *   const q = queueList();
 *   const next = advance($qIndex.get(), q.length, { step: dir, repeat: $repeat.get(), shuffle: $shuffle.get(), manual });
 *   if (next < 0) { pause(); return false; }
 *   return playIndex(next);
 * }
 * const playNext = (manual = true) => step(1, manual);
 * // …and when the engine reports "ended": playNext(false) — the player plays on and obeys the repeat mode
 *
 * html`<${Transport} repeat=${repeat} onRepeat=${() => $repeat.set(cycleRepeat($repeat.get()))} … />`;   // v2m
 * ```
 *
 * ## How it fits
 * Imports nothing. `ui.js` imports `REPEAT_ICON` and `clock` to draw the Transport widget's repeat button and
 * time readout, so every app that renders a Transport reaches this file through the kit; two farm apps call
 * `advance` directly — v2m (the full queue with repeat and shuffle) and tide (station prev/next with
 * `repeat: "all", manual: true`, so a press never traps). `rt/earn.js` deliberately does NOT use `clock`:
 * its spans run past an hour and need `h:mm:ss`. Unit tests: `packages/runtime/tests/player_test.js`.
 *
 * ## Invariants and pitfalls
 * - `-1` means stop. Check `next < 0` before indexing the queue; an empty list (`length` 0) always returns -1.
 * - `manual` is the distinction hand-written players miss: under repeat-one a track that ENDS plays again, but a
 *   pressed next must move on. Pass `manual: false` from `onended`, `manual: true` from the buttons.
 * - Repeat "off" stops at the end of the list on its own and wraps to 0 for a manual press.
 * - "Previous" from the first track wraps to the last (`step: -1`), regardless of repeat mode.
 * - Shuffle never picks the track already playing; pass `rng` for a deterministic test.
 * - A single-track list under repeat "off" returns -1 when it ends and 0 for a press; every other mode returns 0.
 * - An unset or unknown repeat mode is treated as "off" by `cycleRepeat` — it starts the cycle and never throws.
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
