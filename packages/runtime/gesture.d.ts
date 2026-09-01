/**
 * # runtime/gesture.js — mobile touch gestures shared by the runtime and apps
 *
 * The farm is mobile-first, so the gestures an app needs are hooks here rather than reinvented per view:
 * a bottom sheet you drag DOWN by its grip to dismiss (the box follows the finger 1:1, then flies out or
 * springs back), a pane that FOLLOWS your finger left/right with edge resistance and commits to prev/next
 * on release, a four-way flick on a surface that does not move, and a single-vs-double tap discriminator.
 * Pointer Events cover mouse and touch in one path. Every callback is guarded so a gesture can never throw
 * into the render, a real drag swallows the click the same finger would otherwise fire (a swipe never also
 * opens the card under it), and the dismiss decision is a PURE function so the unit gate can test it.
 *
 * ![The gesture map: pointer down, move and up flowing into the sheet drag, the horizontal pan, the four-way swipe and the tap discriminator](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-gesture.svg)
 *
 * ## Import
 * ```js
 * import { useSheetDrag, usePanX, useSwipe, useTap } from "/_rt/gesture.js";                    // an app's page: the import map resolves /_rt/
 * import { pastDismiss, swipeDir } from "@microspec/core/runtime/gesture.js";                   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link useSheetDrag} — `useSheetDrag(onClose)` → `{ boxRef, grip }`: attach `boxRef` to the sheet box, render `grip` at its top; the drag STARTS on the grip so it never fights scrollable sheet content.
 * - {@link usePanX} — `usePanX({ onNext, onPrev, canNext, canPrev, threshold = 52, onDrag })` → `{ paneRef, pan }`: attach `paneRef` to the pane, spread `pan` on the element; the axis locks after 6 px, vertical movement is left to scroll.
 * - {@link useSwipe} — `useSwipe({ onLeft, onRight, onUp, onDown, threshold = 52 })` → pointer/click handlers to spread on a surface that does not move.
 * - {@link useTap} — `useTap({ onSingle, onDouble, delay = 260 })` → a click handler; a second tap inside the window fires `onDouble` and CANCELS the pending single. Both receive `{ x, y }` relative to the element.
 * - {@link pastDismiss} — `pastDismiss(dy, vy)`: true past 96 px, or past 24 px with a downward flick faster than 0.5 px/ms.
 * - {@link swipeDir} — re-exported from `swipe.js`: the pure four-way decision behind `useSwipe`.
 *
 * ## In practice
 * ```js
 * // tarot — swipe the reading left/right between spreads; the pane follows the finger and wraps
 * import { useSheetDrag, usePanX } from "/_rt/gesture.js";
 * const { paneRef, pan } = usePanX({ onNext: () => goSpread(1), onPrev: () => goSpread(-1) });   // canNext/canPrev default true → cyclic
 * html`<div class="overflow-hidden"><div ref=${paneRef} ...${pan} class="touch-pan-y will-change-transform">…</div></div>`;
 *
 * // iching — a sheet dismissed by its grip
 * const { boxRef, grip } = useSheetDrag(onClose);
 *
 * // tide — a field that does not move: flicks change station/current, a double tap toggles fullscreen
 * import { useSwipe, useTap } from "/_rt/gesture.js";
 * const swipe = useSwipe({ onDown: () => skip(1), onUp: () => skip(-1), onLeft: () => cycleCat(1), onRight: () => cycleCat(-1) });
 * const tap = useTap({ onDouble: () => toggleFs(fieldRef.current) });
 * const surface = { ...swipe, onClick: tap };
 * ```
 *
 * ## How it fits
 * Imports `preact/hooks` and `htm/preact` (so it is browser-only) and `swipe.js`, the pure decision kept
 * apart so the unit gate can import it without pulling htm/preact. Inside the runtime, `ui.js` and
 * `render.js` take `useSheetDrag` for the shared sheet; `dpad.js` explicitly stays out of it (drag-to-dismiss
 * and swipe-to-navigate are not game controls). Five farm apps import it directly — tarot, iching, rave,
 * reel, tide — and every app with a runtime sheet reaches it through `ui.js`.
 *
 * ## Invariants and pitfalls
 * - `usePanX` sets no `style` prop on purpose — add `touch-pan-y` on the element yourself — so Preact never resets the transform driven by ref.
 * - `useSwipe` needs `touch-none` (or `touch-pan-y` if a vertical scroll must survive) on the element, or the browser claims the gesture first.
 * - A drag over 8 px arms a click swallow for 450 ms (`onClickCapture` stops and prevents the click) — a committed pan or flick never also taps what is under it.
 * - `usePanX` locks the axis after 6 px of travel; a vertical decision lets scroll and tap through untouched. `onDrag` is called in the same px the pane is translated by, on every move and once with 0 on release, never with the axis undecided.
 * - Edge resistance: past 130 px the pane rubber-bands at 0.35; with `canNext`/`canPrev` false the shift is capped at 42 px and no commit happens.
 * - `useTap` binds to `onClick`; the element's own child links and buttons should `stopPropagation` so they are not also counted as taps. A double tap cancels the pending single, so the single action never fires as well.
 * - `useSheetDrag` calls `onClose` after the 180 ms fly-out, then clears the inline transform; an upward drag moves the box at 0.2×.
 * - Every callback is wrapped in try/catch — a painter or handler never breaks the gesture or throws into the render.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/gesture.js — edit the JSDoc there, never this file.
/**
 * Single-vs-double tap discriminator for one element; a double tap cancels the pending single.
 * @param opts options
 * @param opts.onSingle called with `{x,y}` (relative to the element) after `delay` ms with no second tap
 * @param opts.onDouble called with `{x,y}` on a second tap inside the window
 * @param opts.delay double-tap window in ms
 * @returns a click handler to bind to the element's onClick
 */
export function useTap({ onSingle, onDouble, delay }?: {
    delay?: number;
    onSingle?: any;
    onDouble?: any;
}): (e: any) => void;
/**
 * A bottom sheet dragged down by its grip: follows the finger 1:1, then flies out (calling `onClose`) or
 * springs back on release.
 * @param onClose called after the fly-out animation when the drag passes the dismiss threshold
 * @returns `{ boxRef, grip }` — attach `boxRef` to the sheet box and render `grip` at its top
 */
export function useSheetDrag(onClose: any): {
    boxRef: any;
    grip: any;
};
/**
 * A horizontally pannable pane that follows the finger with edge resistance and commits to prev/next on
 * release, swallowing the click the same drag would have fired.
 * @param opts options
 * @param opts.onNext called on a committed leftward pan
 * @param opts.onPrev called on a committed rightward pan
 * @param opts.canNext whether a next item exists (heavy resistance at the edge otherwise)
 * @param opts.canPrev whether a previous item exists
 * @param opts.threshold px of travel needed to commit
 * @param opts.onDrag optional live progress in px, called with 0 on release
 * @returns `{ paneRef, pan }` — attach `paneRef` to the pane and spread `pan` on the element
 */
export function usePanX({ onNext, onPrev, canNext, canPrev, threshold, onDrag }?: {
    canNext?: boolean;
    canPrev?: boolean;
    threshold?: number;
    onNext?: any;
    onPrev?: any;
    onDrag?: any;
}): {
    paneRef: any;
    pan: {
        onPointerDown: (e: any) => void;
        onPointerMove: (e: any) => void;
        onPointerUp: () => void;
        onPointerCancel: () => void;
        onClickCapture: (e: any) => void;
    };
};
/**
 * A four-way flick on a surface that does not move: commits on release and swallows the click the same
 * drag would fire.
 * @param opts options
 * @param opts.onLeft called on a leftward flick
 * @param opts.onRight called on a rightward flick
 * @param opts.onUp called on an upward flick
 * @param opts.onDown called on a downward flick
 * @param opts.threshold px of travel needed to count as a flick
 * @returns pointer/click handlers to spread on the element
 */
export function useSwipe({ onLeft, onRight, onUp, onDown, threshold }?: {
    threshold?: number;
    onLeft?: any;
    onRight?: any;
    onUp?: any;
    onDown?: any;
}): {
    onPointerDown: (e: any) => void;
    onPointerMove: (e: any) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClickCapture: (e: any) => void;
};
/**
 * Pure dismiss decision for a dragged sheet.
 * @param dy drag distance in px, down positive
 * @param vy release velocity in px/ms, down positive
 * @returns true when the sheet should fly out rather than spring back
 */
export function pastDismiss(dy: any, vy: any): boolean;
