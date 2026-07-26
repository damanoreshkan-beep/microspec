
export const REPEAT_MODES = ["off", "all", "one"];
export const REPEAT_ICON = { off: "lucide:repeat", all: "lucide:repeat", one: "lucide:repeat-1" };
export function cycleRepeat(mode) {
  const i = Math.max(0, REPEAT_MODES.indexOf(mode));    
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
    if (n >= index) n += 1;                            
    return Math.min(n, len - 1);
  }
  const next = index + step;
  if (next >= len) return repeat === "off" && !manual ? -1 : 0;
  if (next < 0) return len - 1;                        
  return next;
}

/** mm:ss for a transport readout. Negative/absent → 0:00, so a missing duration never renders NaN. */
export function clock(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
