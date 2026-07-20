
export function phase(elapsedMs, periodMs) {
  if (!(periodMs > 0)) return 0;
  const p = (elapsedMs % periodMs) / periodMs;
  return p < 0 ? p + 1 : p;
}

export const swing = (ph) => Math.cos(2 * Math.PI * ph);

export function state(elapsedMs, periodMs, ampDeg = 30) {
  const ph = phase(elapsedMs, periodMs);
  const s = swing(ph);
  const weightA = (s + 1) / 2;
  return {
    ph,
    s,
    angle: ampDeg * s,
    weightA,
    weightB: 1 - weightA,
    active: s >= 0 ? 0 : 1,
    breath: periodMs > 0 ? Math.floor(elapsedMs / periodMs) : 0,
  };
}
