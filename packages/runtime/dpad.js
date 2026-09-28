/* @ts-self-types="./dpad.d.ts" */
/**
 * # runtime/dpad.js — a game control deck on Pointer Events
 *
 * `gesture.js` owns drag-to-dismiss and swipe-to-navigate; neither is a game control. A deck differs in
 * three ways that each cost a bug: what is pressed is decided by the finger's POSITION on every move, not
 * by the button under it at pointerdown (you rest a thumb on a console and slide it); TWO pointers at
 * once, minimum — a thumb on the pad and a thumb on the action keys, or running-and-jumping is impossible
 * and the game reads as broken; and the state is written by REF, never through a re-render, because a
 * setState per pointermove would re-render the whole console sixty times a second to move a value nothing
 * draws. So the deck root owns the pointer, every source of input — fingers, latched keys, the keyboard,
 * assistive clicks — feeds ONE recompute of a bit mask, and the simulation reads that mask once a frame.
 * An earlier per-button version lived here and is gone: two input systems in one file is the divergence
 * the farm bans.
 *
 * ![The dpad module: fingers, keyboard and assistive pulses feeding one mask that the simulation reads](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-dpad.svg)
 *
 * ## Import
 * ```js
 * import { useTouchDeck, useKeyboardPad, PAD } from "/_rt/dpad.js";                    // an app's page: the import map resolves /_rt/
 * import { keyboardOnly, markPointer, fromPointer } from "@microspec/core/runtime/dpad.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link useTouchDeck} — `useTouchDeck({ onAct, latchMs = 320, minPress = 90 })` returns `{ mask, deckProps, release, pulse, setKeys }`: the held-bits ref, the props to spread on the deck root, and the keyboard / assistive feeders.
 * - {@link useKeyboardPad} — `useKeyboardPad(setKeys, onAction)` feeds the deck's mask from the window's key events, reporting the WHOLE held set on every change.
 * - {@link PAD} — `{ LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16, SHOOT: 32 }`, the bit mask that is the contract between a deck and a simulation.
 * - {@link KEYS} — keyboard `code` → `PAD` bit: arrows or WASD to move, Z/Space/Up/W to jump, X/Shift to run, C/Ctrl to throw.
 * - {@link ACTION_KEYS} — momentary keys, `{ Enter: "start", KeyM: "sound" }`.
 * - {@link keyboardOnly} — `keyboardOnly(fn)` wraps an onClick so it fires for keyboard and assistive technology only, never for the click that follows a pointer gesture.
 * - {@link markPointer} — `markPointer(el)` records that a pointer gesture just handled this element.
 * - {@link fromPointer} — `fromPointer(el, within = 500)` — whether a pointer marked the element inside the window, in ms.
 *
 * ## In practice
 * ```js
 * import { useTouchDeck, useKeyboardPad, PAD } from "/_rt/dpad.js";           // apps/hunt
 *
 * const DECK_PAD = [
 *   { id: "padUp", pad: "up", bit: PAD.JUMP, icon: "lucide:chevron-up", label: "padUp" },
 *   { id: "padLeft", pad: "left", bit: PAD.LEFT, icon: "lucide:chevron-left", label: "padLeft" },
 *   { id: "run", bit: PAD.RUN, icon: "lucide:wind", label: "keyRun", latch: true },
 * ];
 *
 * const act = useCallback((name) => { if (name === "start") restartRef.current?.(); }, []);
 * const { mask, deckProps, pulse, setKeys } = useTouchDeck({ onAct: act });
 * useKeyboardPad(setKeys, act);
 *
 * const clock = makeClock(() => { E.step(mask.current); });                  // the simulation reads the mask once a frame
 *
 * html`<${GameConsole} deck=${deckProps} pad=${DECK_PAD}
 *   onKeyboard=${(k) => (k.bit ? pulse(k.bit) : act(k.act))} />`;
 * ```
 *
 * ## How it fits
 * It imports `useRef` / `useEffect` / `useCallback` from `preact/hooks` and `haptic` from `./sensors.js`
 * (runtime-internal imports are RELATIVE). Inside the runtime, `console.js` imports `keyboardOnly` for
 * every key's onClick. The mask bits are mirrored in the product's `rt/hunt.js` and in
 * `tools/wasm/hunt/game.c` — any game added to the farm mirrors the same bits. One farm app imports it
 * today — hunt, the platformer — and the console shell every future game shares reaches it through
 * `console.js`.
 *
 * ## Invariants and pitfalls
 * - Keys are declared by attribute: `data-bit="N"` is a held control, pressed while the finger is over it;
 *   `data-act` is a momentary action that fires when the finger LIFTS over it; `data-latch` holds itself on
 *   a double tap (within `latchMs`) and lets go on the next. Pressed keys get the `sf-pressed` class.
 * - ONE writer of the mask. The keyboard used to assign `mask.current` itself while touch recomputed it from
 *   scratch, and each wiped the other's held state; now every source is an input to one recompute.
 * - A press must survive at least one simulation step: a press shorter than `minPress` (90 ms) is extended
 *   through `pulse`, or a tapped jump never leaves the ground and a tapped throw never spends a spear.
 * - A thumb that drifts off a key onto bare deck must NOT let go — an empty hit keeps the current key; the
 *   press changes only when the finger reaches a different control.
 * - Position first, TARGET second: a synthetic pointerdown carries no coordinates, so `elementFromPoint`
 *   answers with whatever sits at 0,0; the resolver falls back to the event's target, which is every
 *   assistive-technology activation and every tap the gate makes.
 * - A key can be activated by a finger and by the click that follows it; `markPointer` / `fromPointer` /
 *   `keyboardOnly` exist so a real tap does not fire both and toggle the sound twice.
 * - A bit an app can send but `KEYS` cannot name is a control that exists on half the devices: hunt's throw
 *   carried SHOOT (32) with no keyboard binding, and on a desktop the ranged game could not throw at all —
 *   nothing failed, the gate only ever tapped.
 * - `useKeyboardPad` listens on the window, steps aside for INPUT / TEXTAREA / SELECT / contentEditable and
 *   for meta / ctrl / alt chords, and drops every held key on `blur` and `visibilitychange` — or the player
 *   walks into a wall forever.
 * - Feedback is split by event: the runtime's delegated listener owns `pointerdown` (keys carry
 *   `data-haptic="bump"`); this hook answers the slide ONTO a new key, which no delegated listener can see.
 * @module
 */

import { useRef, useEffect, useCallback } from "preact/hooks";
import { haptic } from "./sensors.js";

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
const MIN_PRESS = 90;

/**
 * The whole control deck as ONE touch surface — see the note above.
 * @param opts `{ onAct, latchMs, minPress }` — momentary-action callback `(act, el)`, the double-tap latch window in ms, the minimum press length in ms
 * @returns `{ mask, deckProps, release, pulse, setKeys }` — the held-bits ref, the props to spread on the deck root, and the keyboard / assistive feeders
 */
export function useTouchDeck({ onAct, latchMs = 320, minPress = MIN_PRESS } = {}) {
  const mask = useRef(0);
  const held = useRef(new Map());
  const since = useRef(new Map());
  const pressed = useRef(new Set());
  const latched = useRef(new Set());
  const lastTap = useRef(new Map());

  const synth = useRef(0);
  const keys = useRef(0);
  const root = useRef(null);
  const bitOf = (el) => +el?.getAttribute("data-bit") || 0;
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
  const at = (e) => {
    const hit = (e.clientX || e.clientY) ? document.elementFromPoint(e.clientX, e.clientY) : null;
    return hit?.closest?.("[data-bit],[data-act]") || e.target?.closest?.("[data-bit],[data-act]") || null;
  };

  const release = useCallback((id) => {
    const el = held.current.get(id);
    if (!el) return;
    held.current.delete(id);
    if (![...held.current.values()].includes(el)) paint(el, false);
    recompute();
  }, []);

  const move = useCallback((e, first) => {
    const found = at(e);
    const was = held.current.get(e.pointerId) || null;
    const el = found || (first ? null : was);
    if (el === was) return;
    if (el) held.current.set(e.pointerId, el); else held.current.delete(e.pointerId);
    if (was && ![...held.current.values()].includes(was)) paint(was, false);
    if (el) {
      paint(el, true);
      if (!first) haptic.bump();
    }
    recompute();
  }, []);

  useEffect(() => () => { for (const el of pressed.current) el.classList.remove("sf-pressed"); }, []);

  const deckProps = {
    ref: root,
    style: { touchAction: "none" },
    onPointerDown: (e) => {
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { }
      since.current.set(e.pointerId, e.timeStamp);
      move(e, true);
    },
    onPointerMove: (e) => { if (e.buttons || e.pointerType === "touch") move(e, false); },
    onPointerUp: (e) => {
      const el = held.current.get(e.pointerId);
      markPointer(el);
      const began = since.current.get(e.pointerId);
      since.current.delete(e.pointerId);
      const bit = bitOf(el);
      if (bit && (began == null || e.timeStamp - began < minPress)) pulse(bit, minPress);
      if (el?.hasAttribute("data-act")) onAct?.(el.getAttribute("data-act"), el);
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
      e.preventDefault();
      if (!e.repeat) { down.add(e.code); apply(); }
    };
    const up = (e) => { if (down.delete(e.code)) apply(); };
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
