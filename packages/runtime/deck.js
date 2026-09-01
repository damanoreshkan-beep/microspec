/* @ts-self-types="./deck.d.ts" */
/**
 * Where a game console's keys sit — pure geometry, no DOM, no preact, no imports. Exports the measured
 * action-cluster layouts (`DIAMOND`, `PAIR` and their key sizes / boxes / slot orders), `clusterMetrics`
 * to derive span and angle back out of a layout so a test asserts the numbers a device is specified by,
 * and `hubOfCross` for the D-pad hub. Every constant is sourced in docs/research/console-shells.md.
 * @module
 */

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


/** Two-key cluster centres, `[x%, y%]` of the cluster box — 1.60 D apart on a 22° axis. */
export const PAIR = [
  [79.87, 31.26],   
  [20.13, 68.74],   
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
  const ratio = box[1] / box[0];                      
  const dx = (a[0] - b[0]) / 100;
  const dy = ((b[1] - a[1]) / 100) * ratio;           
  return { span: Math.hypot(dx, dy) / (key / 100), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}


/** The hub as a fraction of the whole cross, given its share of the centre cell. */
export const hubOfCross = (hubOfCell) => hubOfCell / 3;