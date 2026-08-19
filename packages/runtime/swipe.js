// microspec runtime — the PURE decision behind gesture.js useSwipe (kept apart so the unit gate can import
// it: gesture.js pulls htm/preact, which Deno's type-check cannot resolve outside the browser import map).
// Which way a released pointer went, or null for a tap/wobble. The dominant axis wins; a perfect diagonal
// reads as horizontal. dx right +, dy down +.
export function swipeDir(dx, dy, threshold = 52) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  return ax >= ay ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
