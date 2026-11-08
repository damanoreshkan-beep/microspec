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
// GENERATED by tools/dts.mjs from packages/runtime/dpad.js — edit the JSDoc there, never this file.
/**
 * The whole control deck as ONE touch surface — see the note above.
 * @param opts `{ onAct, latchMs, minPress }` — momentary-action callback `(act, el)`, the double-tap latch window in ms, the minimum press length in ms
 * @returns `{ mask, deckProps, release, pulse, setKeys }` — the held-bits ref, the props to spread on the deck root, and the keyboard / assistive feeders
 */
export function useTouchDeck({ onAct, latchMs, minPress }?: {
    latchMs?: number;
    minPress?: number;
    onAct?: any;
}): {
    mask: any;
    deckProps: {
        ref: any;
        style: {
            touchAction: string;
        };
        onPointerDown: (e: any) => void;
        onPointerMove: (e: any) => void;
        onPointerUp: (e: any) => void;
        onPointerCancel: (e: any) => void;
    };
    release: any;
    pulse: any;
    setKeys: any;
};
/**
 * Feeds the deck's mask from the keyboard. It reports the WHOLE held set on every change rather
 * than toggling a bit, so the deck stays the single owner of the mask and a key held while a
 * finger is also down cannot erase it.
 *
 * A key event goes to the focused element, and nothing here is focused when the page loads, so
 * this listens on the window — but it steps aside for text entry, or typing in any field anywhere
 * in the app would drive the player.
 */
export function useKeyboardPad(setKeys: any, onAction: any): void;
/**
 * Record that a pointer gesture just handled this element, so the click that follows can be ignored.
 * @param el the key element (nullable)
 */
export function markPointer(el: any): void;
/**
 * Whether a pointer gesture handled this element recently.
 * @param el the key element (nullable)
 * @param within the window in ms (default 500)
 * @returns true if a pointer marked it inside the window
 */
export function fromPointer(el: any, within?: number): boolean;
/** The activation guard every app's onClick should use: keyboard and AT only. */
export function keyboardOnly(fn: any): (e: any) => void;
/** The input bit mask — the contract between a deck and a simulation, mirrored in every game. */
export const PAD: {};
/** Keyboard `code` → `PAD` bit: arrows or WASD to move, Z/Space to jump, X/Shift to run, C/Ctrl to throw. */
export const KEYS: {};
/** Momentary keys — the ones a console has as buttons rather than as directions. */
export const ACTION_KEYS: {};
