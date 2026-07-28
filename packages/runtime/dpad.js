// dpad — a game control deck on Pointer Events.
//
// gesture.js already owns drag-to-dismiss and swipe-to-navigate; neither is a game control. A deck
// is different in three ways that each cost a bug if you get them wrong:
//
//   1. What is pressed is decided by the finger's POSITION on every move, not by whichever button
//      happened to be under it at pointerdown. You rest a thumb on a console and slide it; a key
//      bound at press time captures the pointer and every key you cross afterwards goes deaf.
//   2. TWO pointers at once, minimum: a thumb on the pad and a thumb on the action keys. One
//      shared "current control" makes running-and-jumping impossible, which reads as the game
//      being broken rather than as the input being wrong.
//   3. The state is written by REF, never through a re-render. A setState per pointermove would
//      re-render the whole console sixty times a second to move a value nothing draws.
//
// (An earlier per-button version of this lived here and is gone: two input systems in one file is
// exactly the divergence the farm bans, and the second one was only ever the wrong half.)
//
// Runtime-internal imports must be RELATIVE.

import { useRef, useEffect, useCallback } from "preact/hooks";
import { haptic } from "./sensors.js";

/** Mirrored in tools/wasm/brick/game.c and packages/runtime/brick.js. */
export const PAD = { LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16 };

/**
 * `useTouchDeck()` — the whole control deck as ONE touch surface.
 *
 * A physical console is not a page of buttons: you rest a thumb on it and slide, and whatever is
 * under the thumb is what is pressed. Per-button handlers cannot express that, because the first
 * one to see `pointerdown` captures the pointer and every key you slide onto afterwards is deaf.
 * So the deck root owns the pointer and resolves the control by POSITION on every move.
 *
 *   data-bit="N"   a held control — pressed while the finger is over it (a direction, a jump key)
 *   data-act       a momentary action — fires when the finger LIFTS over it (start, sound, records)
 *
 * Feedback is split the same way the runtime splits it. The runtime's delegated listener owns
 * `pointerdown`, so the keys carry `data-haptic="bump"` and it answers the first press. Sliding
 * ONTO a new key is not a tap and no delegated listener can see it, so this hook answers that —
 * which is exactly the documented reason an app may call `haptic.*` itself: an outcome the tap
 * could not predict. Neither fires twice, because they own different events.
 */
export function useTouchDeck({ onAct, latchMs = 320 } = {}) {
  const mask = useRef(0);
  const held = useRef(new Map());          // pointerId → the element it is currently pressing
  const pressed = useRef(new Set());
  const latched = useRef(new Set());       // keys double-tapped into a hold
  const lastTap = useRef(new Map());       // element → when it was last released

  const synth = useRef(0);                 // keyboard / assistive-technology presses
  const bitOf = (el) => +el?.getAttribute("data-bit") || 0;
  const recompute = () => {
    let m = synth.current;
    for (const el of held.current.values()) m |= bitOf(el);
    for (const el of latched.current) m |= bitOf(el);
    mask.current = m;
  };
  /** A click from a keyboard or a screen reader has no pointer lifecycle, so give it a moment of
      press instead — otherwise the pad is unusable without a finger. */
  const pulse = useCallback((bit, ms = 140) => {
    synth.current |= bit; recompute();
    setTimeout(() => { synth.current &= ~bit; recompute(); }, ms);
  }, []);
  const paint = (el, on) => {
    if (!el) return;
    const stay = on || latched.current.has(el);
    el.classList.toggle("sf-pressed", stay);
    if (el.hasAttribute("data-latch")) el.setAttribute("aria-pressed", latched.current.has(el) ? "true" : "false");
    if (stay) pressed.current.add(el); else pressed.current.delete(el);
  };
  const at = (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    return hit?.closest?.("[data-bit],[data-act]") || null;
  };

  const release = useCallback((id) => {
    const el = held.current.get(id);
    if (!el) return;
    held.current.delete(id);
    // Only unpaint if no OTHER finger is still on the same key.
    if (![...held.current.values()].includes(el)) paint(el, false);
    recompute();
  }, []);

  /* A thumb that drifts off a key onto bare deck must NOT let go: on a physical pad your thumb
     rides the plastic, and only another key takes the press away from the one you are on. So an
     empty hit keeps the current key, and the press changes only when the finger reaches a
     different control. (This is also why the deck, not the key, owns the pointer.) */
  const move = useCallback((e, first) => {
    const found = at(e);
    const was = held.current.get(e.pointerId) || null;
    const el = found || (first ? null : was);
    if (el === was) return;
    if (el) held.current.set(e.pointerId, el); else held.current.delete(e.pointerId);
    if (was && ![...held.current.values()].includes(was)) paint(was, false);   // no finger left on it
    if (el) {
      paint(el, true);
      if (!first) haptic.bump();      // the runtime owns the press; this is the slide onto the next key
    }
    recompute();
  }, []);

  useEffect(() => () => { for (const el of pressed.current) el.classList.remove("sf-pressed"); }, []);

  const deckProps = {
    style: { touchAction: "none" },
    onPointerDown: (e) => {
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
      move(e, true);
    },
    onPointerMove: (e) => { if (e.buttons || e.pointerType === "touch") move(e, false); },
    onPointerUp: (e) => {
      const el = held.current.get(e.pointerId);
      if (el?.hasAttribute("data-act")) onAct?.(el.getAttribute("data-act"), el);
      /* A LATCH key (the run button) holds itself on a double tap and lets go on the next one —
         a platformer asks you to hold run for minutes at a time, and a thumb parked on B is a
         thumb that cannot steer. The interval is measured from the EVENT timestamps rather than
         from a clock read, so it tracks the gesture that produced it. */
      if (el?.hasAttribute("data-latch")) {
        if (latched.current.has(el)) { latched.current.delete(el); haptic.tick(); }
        else if (e.timeStamp - (lastTap.current.get(el) ?? -Infinity) < latchMs) { latched.current.add(el); haptic.ok(); }
        lastTap.current.set(el, e.timeStamp);
      }
      release(e.pointerId);
    },
    onPointerCancel: (e) => release(e.pointerId),
  };

  return { mask, deckProps, release, pulse };
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
