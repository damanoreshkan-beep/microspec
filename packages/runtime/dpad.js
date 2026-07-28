
import { useRef, useEffect, useCallback } from "preact/hooks";

/** Mirrored in tools/wasm/brick/game.c and packages/runtime/brick.js. */
export const PAD = { LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16 };

/** Which way a point inside a square pad is pushing. Dead zone in the middle, and the axes are
    exclusive on the diagonal only where the finger really is diagonal. */
export function padDirection(x, y, w, h, dead = 0.22) {
  const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1;
  let bits = 0;
  if (Math.hypot(nx, ny) < dead) return 0;
  if (nx < -dead) bits |= PAD.LEFT;
  if (nx > dead) bits |= PAD.RIGHT;
  if (ny > dead && Math.abs(ny) > Math.abs(nx)) bits |= PAD.DOWN;
  return bits;
}

/**
 * `useGamePad()` → { mask, padProps, buttonProps }
 *
 * `mask` is a ref holding the live bitmask. Read it from the game loop; never render off it.
 * `padProps` go on the D-pad surface, `buttonProps(bit)` on each action key.
 */
export function useGamePad({ onChange } = {}) {
  const mask = useRef(0);
  const pads = useRef(new Map());          
  const set = useCallback((id, bits) => {
    if (bits) pads.current.set(id, bits); else pads.current.delete(id);
    let m = 0;
    for (const b of pads.current.values()) m |= b;
    if (m !== mask.current) { mask.current = m; onChange?.(m); }
  }, [onChange]);

  useEffect(() => {
    const clear = (e) => set(e.pointerId, 0);
    addEventListener("pointerup", clear);
    addEventListener("pointercancel", clear);
    addEventListener("blur", () => { pads.current.clear(); if (mask.current) { mask.current = 0; onChange?.(0); } });
    return () => { removeEventListener("pointerup", clear); removeEventListener("pointercancel", clear); };
  }, [set, onChange]);

  const capture = (e) => { try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {  } };
  const fromEvent = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return padDirection(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  };

  const padProps = {
    style: { touchAction: "none" },
    onPointerDown: (e) => { capture(e); set(e.pointerId, fromEvent(e)); },
    onPointerMove: (e) => { if (pads.current.has(e.pointerId)) set(e.pointerId, fromEvent(e)); },
    onPointerUp: (e) => set(e.pointerId, 0),
    onPointerCancel: (e) => set(e.pointerId, 0),
    onPointerLeave: (e) => { if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) set(e.pointerId, 0); },
  };

  const buttonProps = (bit) => ({
    style: { touchAction: "none" },
    onPointerDown: (e) => { capture(e); set(e.pointerId, bit); },
    onPointerUp: (e) => set(e.pointerId, 0),
    onPointerCancel: (e) => set(e.pointerId, 0),
  });

  return { mask, padProps, buttonProps, set };
}

/** Keyboard, for the breakpoints that have one. Free, and it is what makes the gate playable. */
export const KEYS = {
  ArrowLeft: PAD.LEFT, KeyA: PAD.LEFT,
  ArrowRight: PAD.RIGHT, KeyD: PAD.RIGHT,
  ArrowDown: PAD.DOWN, KeyS: PAD.DOWN,
  ArrowUp: PAD.JUMP, KeyW: PAD.JUMP, Space: PAD.JUMP, KeyZ: PAD.JUMP,
  ShiftLeft: PAD.RUN, ShiftRight: PAD.RUN, KeyX: PAD.RUN,
};

export function useKeyboardPad(mask, onChange) {
  useEffect(() => {
    const apply = (code, down) => {
      const bit = KEYS[code];
      if (!bit) return;
      const next = down ? mask.current | bit : mask.current & ~bit;
      if (next !== mask.current) { mask.current = next; onChange?.(next); }
    };
    const dn = (e) => { if (KEYS[e.code]) { e.preventDefault(); apply(e.code, true); } };
    const up = (e) => apply(e.code, false);
    addEventListener("keydown", dn);
    addEventListener("keyup", up);
    return () => { removeEventListener("keydown", dn); removeEventListener("keyup", up); };
  }, [mask, onChange]);
}
