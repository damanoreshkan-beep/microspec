
import { useRef, useEffect, useCallback } from "preact/hooks";
import { haptic } from "./sensors.js";

const pointered = new WeakMap();
export const markPointer = (el) => { if (el) pointered.set(el, Date.now()); };
export const fromPointer = (el, within = 500) => !!el && Date.now() - (pointered.get(el) ?? -Infinity) < within;

/** The activation guard every app's onClick should use: keyboard and AT only. */
export const keyboardOnly = (fn) => (e) => { if (!e.detail && !fromPointer(e.currentTarget)) fn(e); };


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
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {  }
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
