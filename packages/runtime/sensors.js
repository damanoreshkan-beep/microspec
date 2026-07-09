
const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch {  } },
  tick: () => haptic.buzz(8),
  bump: () => haptic.buzz(18),
  ok: () => haptic.buzz([12, 40, 12]),
};
