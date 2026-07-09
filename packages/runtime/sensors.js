// microspec runtime — hardware capability layer. Uniform shape per capability so tool views can
// feature-detect and degrade: each exposes `supported` + methods that no-op when unavailable.
// Hardware needs a secure context (https/localhost); the headless gate has none, so views must
// render without live readings (structure/permission-state only).

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

// haptic — short vibration feedback (buzz/tick/bump). Silent no-op where unsupported.
export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch { /* denied */ } },
  tick: () => haptic.buzz(8),
  bump: () => haptic.buzz(18),
  ok: () => haptic.buzz([12, 40, 12]),
};
