/* @ts-self-types="./dpad.d.ts" */
/**
 * A game control deck on Pointer Events: the deck root owns the pointer and resolves the pressed key by
 * POSITION on every move, several fingers at once, state written by ref rather than re-render. Exports
 * `useTouchDeck` (the deck as one touch surface), `useKeyboardPad` + `KEYS` / `ACTION_KEYS` (the desktop
 * layout), the `PAD` bit mask shared with the simulations, and the `keyboardOnly` activation guard.
 * @module
 */
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

/* Which controls a pointer gesture has just handled. A key can be activated two ways — a finger
   (the deck, by position) and a click (keyboard, assistive technology, a synthetic tap) — and
   without a record of the first, a real tap fires both and the sound toggles twice. Kept module-
   level and weak so it costs nothing and holds no element alive. */
const pointered = new WeakMap();
/**
 * Record that a pointer gesture just handled this element, so the click that follows can be ignored.
 * @param el the key element (nullable)
 */
export const markPointer = (el) => { if (el) pointered.set(el, Date.now()); };
/**
 * Whether a pointer gesture handled this element recently.
 * @param el the key element (nullable)
 * @param within the window in ms (default 500)
 * @returns true if a pointer marked it inside the window
 */
export const fromPointer = (el, within = 500) => !!el && Date.now() - (pointered.get(el) ?? -Infinity) < within;

/** The activation guard every app's onClick should use: keyboard and AT only. */
export const keyboardOnly = (fn) => (e) => { if (!e.detail && !fromPointer(e.currentTarget)) fn(e); };

/* Mirrored in tools/wasm/hunt/game.c and packages/runtime/hunt.js. Any game added to the farm
   mirrors these same bits — the mask is the contract between a deck and a simulation.

   SHOOT is here and not only in hunt's own table because of what its absence did: hunt's throw key
   carried `IN.SHOOT` (32) from the app, `KEYS` below had no binding that could ever produce that
   bit, and so on a desktop the ranged game — a huntress, a finite quiver, an enemy you are meant
   to kill at distance — could not throw at all. Nothing failed. The button was on screen, the
   touch deck drove it, the e2e tapped it and watched the quiver go down, and the one input path
   the gate never exercised was the only one a keyboard has. A bit that an app can send but the
   shared keyboard map cannot name is a control that exists on half the devices. */
/** The input bit mask — the contract between a deck and a simulation, mirrored in every game. */
export const PAD = { LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16, SHOOT: 32 };

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
/* A press must survive at least one SIMULATION STEP. The game reads the mask once a frame, so a
   press that goes down and up inside 16 ms is invisible to it — the button did nothing, and on a
   fast tap of a jump key that is indistinguishable from a broken control. Both games showed it at
   once: a tapped throw that never spent a spear, and a tapped jump that never left the ground, so
   the player ran into the first pit. Held presses are unaffected; only the short ones are extended,
   and they are extended by the same mechanism a keyboard or a screen reader already uses. */
const MIN_PRESS = 90;

/**
 * The whole control deck as ONE touch surface — see the note above.
 * @param opts `{ onAct, latchMs, minPress }` — momentary-action callback `(act, el)`, the double-tap latch window in ms, the minimum press length in ms
 * @returns `{ mask, deckProps, release, pulse, setKeys }` — the held-bits ref, the props to spread on the deck root, and the keyboard / assistive feeders
 */
export function useTouchDeck({ onAct, latchMs = 320, minPress = MIN_PRESS } = {}) {
  const mask = useRef(0);
  const held = useRef(new Map());          // pointerId → the element it is currently pressing
  const since = useRef(new Map());         // pointerId → when that press began
  const pressed = useRef(new Set());
  const latched = useRef(new Set());       // keys double-tapped into a hold
  const lastTap = useRef(new Map());       // element → when it was last released

  const synth = useRef(0);                 // assistive-technology / click pulses
  const keys = useRef(0);                  // whatever the keyboard is holding down
  const root = useRef(null);               // the deck element, so a key press can be SEEN
  const bitOf = (el) => +el?.getAttribute("data-bit") || 0;
  /* One writer. The keyboard used to assign mask.current itself while touch recomputed it from
     scratch, so any pointer event wiped a held key and any key wiped a held finger — two owners of
     one ref, last write wins, and the bug only shows when you use both at once. Every source is an
     input to this function now and nothing else assigns the mask. */
  const recompute = () => {
    let m = synth.current | keys.current;
    for (const el of held.current.values()) m |= bitOf(el);
    for (const el of latched.current) m |= bitOf(el);
    mask.current = m;
  };
  /** What the keyboard is holding. It also PAINTS the matching keys: a console whose buttons do
      not move when you press the arrows looks broken, and the press state is the only feedback a
      keyboard player gets — there is no finger on the glass to watch. */
  const setKeys = useCallback((bits) => {
    if (bits === keys.current) return;
    const before = keys.current;
    keys.current = bits;
    const deck = root.current;
    if (deck) for (const el of deck.querySelectorAll("[data-bit]")) {
      const b = bitOf(el);
      if (((before & b) !== 0) === ((bits & b) !== 0)) continue;
      paint(el, (bits & b) !== 0 || [...held.current.values()].includes(el));
    }
    recompute();
  }, []);

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
  /* Position first, TARGET second. Resolving by position is what makes sliding work; but a
     synthetic pointerdown carries no coordinates, so elementFromPoint answers with whatever sits
     at 0,0 and the deck sees nothing at all. That is every assistive-technology activation and
     every tap the gate makes — which is how a latch that works under a thumb can fail a test that
     is right. Fall back to the element the event was dispatched on. */
  const at = (e) => {
    const hit = (e.clientX || e.clientY) ? document.elementFromPoint(e.clientX, e.clientY) : null;
    return hit?.closest?.("[data-bit],[data-act]") || e.target?.closest?.("[data-bit],[data-act]") || null;
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
    ref: root,
    style: { touchAction: "none" },
    onPointerDown: (e) => {
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
      since.current.set(e.pointerId, e.timeStamp);
      move(e, true);
    },
    onPointerMove: (e) => { if (e.buttons || e.pointerType === "touch") move(e, false); },
    onPointerUp: (e) => {
      const el = held.current.get(e.pointerId);
      markPointer(el);
      // too quick for the simulation to have seen it — hold the bit a moment longer
      const began = since.current.get(e.pointerId);
      since.current.delete(e.pointerId);
      const bit = bitOf(el);
      if (bit && (began == null || e.timeStamp - began < minPress)) pulse(bit, minPress);
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
    onPointerCancel: (e) => { since.current.delete(e.pointerId); release(e.pointerId); },
  };

  return { mask, deckProps, release, pulse, setKeys };
}

/* Keyboard is not a fallback here — a console on a desktop is played with two hands on the keys,
   and the arrows are the pad. Both layouts every platformer player already has in their fingers:
   arrows or WASD to move, Z/Space to jump, X/Shift to run, C/Ctrl to throw.

   A game that only has four of these still only receives four: the mask is an AND of what the
   keyboard sends and what the simulation reads, so a binding no game uses costs nothing. The
   inverse is what cost something — see the note on SHOOT above. */
/** Keyboard `code` → `PAD` bit: arrows or WASD to move, Z/Space to jump, X/Shift to run, C/Ctrl to throw. */
export const KEYS = {
  ArrowLeft: PAD.LEFT, KeyA: PAD.LEFT,
  ArrowRight: PAD.RIGHT, KeyD: PAD.RIGHT,
  ArrowDown: PAD.DOWN, KeyS: PAD.DOWN,
  ArrowUp: PAD.JUMP, KeyW: PAD.JUMP, Space: PAD.JUMP, KeyZ: PAD.JUMP,
  ShiftLeft: PAD.RUN, ShiftRight: PAD.RUN, KeyX: PAD.RUN,
  KeyC: PAD.SHOOT, ControlLeft: PAD.SHOOT, ControlRight: PAD.SHOOT,
};

/** Momentary keys — the ones a console has as buttons rather than as directions. */
export const ACTION_KEYS = { Enter: "start", KeyM: "sound" };

/**
 * Feeds the deck's mask from the keyboard. It reports the WHOLE held set on every change rather
 * than toggling a bit, so the deck stays the single owner of the mask and a key held while a
 * finger is also down cannot erase it.
 *
 * A key event goes to the focused element, and nothing here is focused when the page loads, so
 * this listens on the window — but it steps aside for text entry, or typing in any field anywhere
 * in the app would drive the player.
 */
export function useKeyboardPad(setKeys, onAction) {
  useEffect(() => {
    const down = new Set();
    const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    const apply = () => { let m = 0; for (const c of down) m |= KEYS[c] || 0; setKeys(m); };
    const dn = (e) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (ACTION_KEYS[e.code] && !e.repeat) { e.preventDefault(); onAction?.(ACTION_KEYS[e.code]); return; }
      if (!KEYS[e.code]) return;
      e.preventDefault();                       // arrows and space scroll the page otherwise
      if (!e.repeat) { down.add(e.code); apply(); }
    };
    const up = (e) => { if (down.delete(e.code)) apply(); };
    // Losing focus with a key held would leave the player walking into a wall forever.
    const drop = () => { if (down.size) { down.clear(); apply(); } };
    addEventListener("keydown", dn);
    addEventListener("keyup", up);
    addEventListener("blur", drop);
    document.addEventListener("visibilitychange", drop);
    return () => {
      removeEventListener("keydown", dn); removeEventListener("keyup", up);
      removeEventListener("blur", drop); document.removeEventListener("visibilitychange", drop);
    };
  }, [setKeys, onAction]);
}
