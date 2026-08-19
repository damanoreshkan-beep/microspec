export function swipeDir(dx, dy, threshold = 52) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  return ax >= ay ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
