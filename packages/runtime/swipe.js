/* @ts-self-types="./swipe.d.ts" */
/**
 * The pure decision behind gesture.js useSwipe, kept apart so the unit gate can import it without pulling
 * htm/preact through the browser import map. Exports `swipeDir`, which turns a released pointer's delta into
 * "left" / "right" / "up" / "down", or null for a tap or wobble.
 * @module
 */
// microspec runtime — the PURE decision behind gesture.js useSwipe (kept apart so the unit gate can import
// it: gesture.js pulls htm/preact, which Deno's type-check cannot resolve outside the browser import map).
// Which way a released pointer went, or null for a tap/wobble. The dominant axis wins; a perfect diagonal
// reads as horizontal. dx right +, dy down +.
/**
 * Classify a released pointer's travel as a swipe direction; the dominant axis wins, a perfect diagonal
 * reads as horizontal.
 * @param dx horizontal delta in px, right positive
 * @param dy vertical delta in px, down positive
 * @param threshold minimum travel on the dominant axis before it counts as a swipe (default 52)
 * @returns "left" | "right" | "up" | "down", or null for a tap / wobble below the threshold
 */
export function swipeDir(dx, dy, threshold = 52) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  return ax >= ay ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
