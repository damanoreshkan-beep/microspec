/* @ts-self-types="./deck.d.ts" */
/**
 * # runtime/deck.js — where a game console's keys sit, as measurable data
 *
 * Pure geometry: no DOM, no preact, no imports. The action-cluster layouts a console draws with live here
 * as percentages of a cluster box, and `clusterMetrics` derives the span and the angle back OUT of them.
 * The reason it is a file of its own is a lesson the farm kept relearning: the alpha's action pair sat
 * 0.99 key-widths apart — rims touching — and nothing could tell. No gate measures the distance between
 * two buttons, a phone-scale screenshot reads it as "a bit tight", and the first research pass that went
 * looking got the number wrong in the other direction (32.6° and blamed the angle, which was fine at
 * 21.4°). A number that describes an element has to be measurable FROM it, so the unit test asserts the
 * derived values, not the literals, and a future edit to a percentage cannot quietly move a cluster off
 * its device. Every constant is sourced in `docs/research/console-shells.md`.
 *
 * ![The deck module: the four-key diamond, the two-key pair, and the metrics derived from them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-deck.svg)
 *
 * ## Import
 * ```js
 * import { DIAMOND, DIAMOND_ORDER, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "/_rt/deck.js";   // an app's page: the import map resolves /_rt/
 * import { clusterMetrics, hubOfCross, PAIR, PAIR_KEY, PAIR_BOX } from "@microspec/core/runtime/deck.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **The four-key cluster**
 * - {@link DIAMOND} — slot centres `{ right, down, up, left }`, each `[x%, y%]` of the cluster box, axis-aligned.
 * - {@link DIAMOND_ORDER} — `["right", "down", "up", "left"]`: which slot each action takes, in the order a game declares them.
 * - {@link TRIANGLE_ORDER} — `["right", "down", "up"]`: the diamond without its left slot, the shape three keys make.
 * - {@link DIAMOND_KEY} — key diameter, 34.25% of the box width.
 * - {@link DIAMOND_BOX} — the box `[2.92, 2.92]` in key diameters.
 *
 * **The two-key cluster**
 * - {@link PAIR} — two centres `[x%, y%]`, 1.60 D apart on a 22° axis rising to the right; the first key high and right.
 * - {@link PAIR_KEY} — key diameter, 40.26% of the box width.
 * - {@link PAIR_BOX} — the box `[2.4836, 1.5993]` in key diameters.
 *
 * **Derivations**
 * - {@link clusterMetrics} — `clusterMetrics(a, b, key, box)` returns `{ span, angle }`: centre distance in key diameters and the axis in degrees rising to the right.
 * - {@link hubOfCross} — `hubOfCross(hubOfCell)` is the D-pad hub as a fraction of the WHOLE cross, given its share of the centre cell.
 *
 * ## In practice
 * ```js
 * import { clusterMetrics, hubOfCross, DIAMOND, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "../deck.js";   // packages/runtime/tests/deck_test.js
 *
 * const pair = clusterMetrics(PAIR[0], PAIR[1], PAIR_KEY, PAIR_BOX);
 * assert(Math.abs(pair.span - 1.6) < 0.03, `the two action keys sit ${pair.span.toFixed(2)} D apart`);
 * assert(Math.abs(pair.angle - 22) < 2, `the pair axis is ${pair.angle.toFixed(1)}°`);
 *
 * const across = clusterMetrics(DIAMOND.right, DIAMOND.left, DIAMOND_KEY, DIAMOND_BOX);
 * assert(Math.abs(across.span - 1.92) < 0.05);
 * assert(Math.abs(across.angle) < 3);            // a real four-key cluster is axis-aligned
 *
 * const whole = hubOfCross(cell);                // cell = the % theme.css gives .ms-pad-hub
 * assert(whole > 25 && whole < 40);
 * ```
 *
 * ## How it fits
 * It imports nothing and touches nothing — a module of numbers and two functions. `console.js` imports the
 * layouts (`DIAMOND`, `DIAMOND_ORDER`, `TRIANGLE_ORDER`, `DIAMOND_KEY`, `DIAMOND_BOX`, `PAIR`, `PAIR_KEY`,
 * `PAIR_BOX`) to place the keys of the shared console shell, and `tests/deck_test.js` imports the
 * derivations to assert the device numbers. No farm app imports it directly: apps reach the geometry
 * through `console.js` (hunt is the farm's consumer today), and a game never sees a percentage.
 *
 * ## Invariants and pitfalls
 * - Positions are `[x, y]` in PERCENT of the cluster box; key diameters are percent of the box WIDTH.
 * - Tests assert `clusterMetrics` output — the span in key diameters and the axis in degrees — never the
 *   percentages. A pair at 1.0 D has its rims touching; a real pair is 1.60 D (1.45–1.75) on a 15–28° axis.
 * - The four-key cluster is AXIS-ALIGNED, 0° ± 3°. The impression that a real one is tilted comes from the
 *   whole cluster being offset or from the lettering; a decorative 15–25° twist is the commonest way to draw one wrong.
 * - The cross's numbers are NOT here: the seat, the hub and the arm radius are plain CSS in `theme.css`, and a
 *   copy in JS would be two constants for one measurement — the exact failure this file exists to prevent.
 * - The number a device is specified by is the hub against the WHOLE cross; the number CSS can express is the
 *   hub against its centre cell. The alpha wrote 38% meaning a third and got an eighth — `hubOfCross` is that division by 3.
 * - `clusterMetrics` corrects for the box's own aspect (`box[1] / box[0]`) so y is in x units; screen y grows
 *   downward, so a positive angle means rising to the right.
 * @module
 */
// deck — where a game console's keys sit. Pure geometry: no DOM, no preact, no imports.
//
// This is here rather than inside console.js for the reason the farm keeps relearning: the alpha's
// action pair sat 0.99 key-widths apart, i.e. with its rims TOUCHING, and nothing could tell. No
// gate measures the distance between two buttons, a screenshot at phone scale reads it as "a bit
// tight", and the first research pass that went looking got the number wrong in the other
// direction (it reported 32.6° and blamed the angle, which was fine at 21.4°). A number that
// describes an element has to be measurable FROM it — so the positions live here as data and
// `clusterMetrics` derives the span and the angle back out of them. The unit test asserts the
// derived values, not the literals, which means a future edit to a percentage cannot quietly move
// a cluster off its device.
//
// Every constant is sourced in `docs/research/console-shells.md`.
//
// Positions are [x, y] in PERCENT of the cluster box. Key diameters are percent of the box WIDTH.

/* Four keys. Opposite centres 1.92 D, box 2.92 D, so a centre lies 0.96/2.92 = 32.88% from the
   middle. AXIS-ALIGNED: real four-key clusters sit at 0° ± 3°, and the impression that they are
   tilted comes from the whole cluster being offset or from the lettering. A decorative 15–25°
   twist is the single most common way to draw one wrong. */
/** Four-key cluster slot centres, `[x%, y%]` of the cluster box, axis-aligned. */
export const DIAMOND = {
  right: [82.88, 50],
  down: [50, 82.88],
  up: [50, 17.12],
  left: [17.12, 50],
};
/** Which slot each action takes, in the order a game declares them. */
export const DIAMOND_ORDER = ["right", "down", "up", "left"];
/** A triangle is the diamond without its left slot — the shape three keys actually make. */
export const TRIANGLE_ORDER = ["right", "down", "up"];
/** Diamond key diameter, % of the cluster box width. */
export const DIAMOND_KEY = 34.25;
/** Diamond cluster box `[w, h]` in key diameters. */
export const DIAMOND_BOX = [2.92, 2.92];

/* Two keys. Centres 1.60 D apart on a 22° axis rising to the right, which makes the box
   2.4836 D × 1.5993 D and puts each centre half a key in from its own two edges. */
/** Two-key cluster centres, `[x%, y%]` of the cluster box — 1.60 D apart on a 22° axis. */
export const PAIR = [
  [79.87, 31.26],   // the first key, high and right
  [20.13, 68.74],   // the second, low and left
];
/** Pair key diameter, % of the cluster box width. */
export const PAIR_KEY = 40.26;
/** Pair cluster box `[w, h]` in key diameters. */
export const PAIR_BOX = [2.4836, 1.5993];

/**
 * Measure a cluster back out of its own layout.
 *
 * @param a,b  two slot positions, [x%, y%] of the box
 * @param key  key diameter, % of the box width
 * @param box  [w, h] of the cluster box in key diameters
 * @returns `{ span, angle }` — centre distance in KEY DIAMETERS, and the axis in degrees rising
 *          to the right. Both are the numbers a device is specified by, so both are what a test
 *          should assert; the percentages above are an implementation of them.
 */
export function clusterMetrics(a, b, key, box) {
  const ratio = box[1] / box[0];                      // the box's own aspect, to put y in x units
  const dx = (a[0] - b[0]) / 100;
  const dy = ((b[1] - a[1]) / 100) * ratio;           // screen y grows downward; rising = positive
  return { span: Math.hypot(dx, dy) / (key / 100), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/* ── the cross ──────────────────────────────────────────────────────────────────────────────────
   A cross is a 3×3 grid, so its arms are a third of it each. Its numbers are NOT here: the seat,
   the hub and the arm radius are plain CSS in theme.css, and a copy of them in JS would be two
   constants for one measurement — the exact failure this file exists to prevent. What is here is
   the derivation a test needs, because the number a device is specified by is the hub against the
   WHOLE cross, while the number CSS can express is the hub against its centre cell. The alpha wrote
   38% meaning a third and got an eighth. */

/** The hub as a fraction of the whole cross, given its share of the centre cell. */
export const hubOfCross = (hubOfCell) => hubOfCell / 3;
