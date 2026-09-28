/* @ts-self-types="./gesture.d.ts" */
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
import { useRef, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { swipeDir } from "./swipe.js";
export { swipeDir } from "./swipe.js";

/**
 * Pure dismiss decision for a dragged sheet.
 * @param dy drag distance in px, down positive
 * @param vy release velocity in px/ms, down positive
 * @returns true when the sheet should fly out rather than spring back
 */
export const pastDismiss = (dy, vy) => dy > 96 || (dy > 24 && vy > 0.5);

/**
 * Single-vs-double tap discriminator for one element; a double tap cancels the pending single.
 * @param opts options
 * @param opts.onSingle called with `{x,y}` (relative to the element) after `delay` ms with no second tap
 * @param opts.onDouble called with `{x,y}` on a second tap inside the window
 * @param opts.delay double-tap window in ms
 * @returns a click handler to bind to the element's onClick
 */
export function useTap({ onSingle, onDouble, delay = 260 } = {}) {
  const s = useRef({ t: 0 }).current;
  useEffect(() => () => { if (s.t) clearTimeout(s.t); }, []);
  return (e) => {
    let x = 0, y = 0;
    try { const r = e.currentTarget.getBoundingClientRect(); x = (e.clientX || r.left + r.width / 2) - r.left; y = (e.clientY || r.top + r.height / 2) - r.top; } catch { }
    if (s.t) { clearTimeout(s.t); s.t = 0; try { onDouble && onDouble({ x, y }); } catch { } }
    else { s.t = setTimeout(() => { s.t = 0; try { onSingle && onSingle({ x, y }); } catch { } }, delay); }
  };
}

/**
 * A bottom sheet dragged down by its grip: follows the finger 1:1, then flies out (calling `onClose`) or
 * springs back on release.
 * @param onClose called after the fly-out animation when the drag passes the dismiss threshold
 * @returns `{ boxRef, grip }` — attach `boxRef` to the sheet box and render `grip` at its top
 */
export function useSheetDrag(onClose) {
  const boxRef = useRef();
  const s = useRef({ on: false, y0: 0, y: 0, vy: 0, tp: 0 }).current;
  const setT = (y, spring) => { const b = boxRef.current; if (!b) return; b.style.transition = spring ? "transform .3s cubic-bezier(.2,.9,.2,1)" : "none"; b.style.transform = y ? `translateY(${y}px)` : ""; };
  const down = (e) => { if (!boxRef.current) return; s.on = true; s.y0 = e.clientY; s.y = 0; s.vy = 0; s.tp = performance.now(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } setT(0, false); };
  const move = (e) => { if (!s.on) return; const dy = e.clientY - s.y0, now = performance.now(), dt = Math.max(1, now - s.tp); s.vy = 0.6 * s.vy + 0.4 * ((dy - s.y) / dt); s.y = dy; s.tp = now; setT(dy > 0 ? dy : dy * 0.2, false); };
  const up = () => {
    if (!s.on) return; s.on = false;
    const b = boxRef.current;
    if (pastDismiss(s.y, s.vy)) {
      if (b) { b.style.transition = "transform .2s ease-in"; b.style.transform = "translateY(100%)"; }
      setTimeout(() => { try { onClose?.(); } catch { } if (b) { b.style.transition = "none"; b.style.transform = ""; } }, 180);
    } else setT(0, true);
  };
  const grip = html`<div aria-hidden="true" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} style="touch-action:none;cursor:grab" class="mx-auto mb-2.5 -mt-0.5 h-1.5 w-10 shrink-0 rounded-full bg-base-content/25 active:bg-base-content/40"></div>`;
  return { boxRef, grip };
}

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
export function usePanX({ onNext, onPrev, canNext = true, canPrev = true, threshold = 52, onDrag } = {}) {
  const paneRef = useRef();
  const s = useRef({ on: false, x0: 0, y0: 0, dx: 0, decided: 0, at: 0 }).current;
  const setX = (x, spring) => { const p = paneRef.current; if (!p) return; p.style.transition = spring ? "transform .26s cubic-bezier(.2,.85,.25,1)" : "none"; p.style.transform = x ? `translateX(${x}px)` : ""; };
  const resist = (dx) => { const a = Math.abs(dx), lim = 130; return Math.sign(dx) * (a <= lim ? a : lim + (a - lim) * 0.35); };
  const down = (e) => { s.on = true; s.x0 = e.clientX; s.y0 = e.clientY; s.dx = 0; s.decided = 0; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } setX(0, false); };
  const move = (e) => {
    if (!s.on) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.decided) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; s.decided = Math.abs(dx) > Math.abs(dy) ? 1 : -1; }
    if (s.decided !== 1) return;
    s.dx = dx;
    const atEdge = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
    const shift = atEdge ? Math.sign(dx) * Math.min(Math.abs(dx) * 0.2, 42) : resist(dx);
    setX(shift, false);
    if (onDrag) { try { onDrag(shift); } catch { } }
  };
  const up = () => {
    if (!s.on) return; s.on = false;
    if (s.decided !== 1) return;
    if (onDrag) { try { onDrag(0); } catch { } }
    if (Math.abs(s.dx) > 8) s.at = performance.now();
    const dir = s.dx < 0 ? 1 : -1, can = dir === 1 ? canNext : canPrev;
    if (Math.abs(s.dx) > threshold && can) { try { (dir === 1 ? onNext : onPrev)?.(); } catch { } requestAnimationFrame(() => setX(0, true)); }
    else setX(0, true);
  };
  const clickCapture = (e) => { if (s.at && performance.now() - s.at < 450) { e.stopPropagation(); e.preventDefault(); s.at = 0; } };
  return { paneRef, pan: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onClickCapture: clickCapture } };
}

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
export function useSwipe({ onLeft, onRight, onUp, onDown, threshold = 52 } = {}) {
  const s = useRef({ on: false, x0: 0, y0: 0, dx: 0, dy: 0, at: 0 }).current;
  const down = (e) => { s.on = true; s.x0 = e.clientX; s.y0 = e.clientY; s.dx = 0; s.dy = 0; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } };
  const move = (e) => { if (!s.on) return; s.dx = e.clientX - s.x0; s.dy = e.clientY - s.y0; };
  const up = () => {
    if (!s.on) return; s.on = false;
    const dir = swipeDir(s.dx, s.dy, threshold);
    if (Math.abs(s.dx) > 8 || Math.abs(s.dy) > 8) s.at = performance.now();
    if (!dir) return;
    try { ({ left: onLeft, right: onRight, up: onUp, down: onDown })[dir]?.(); } catch { }
  };
  const clickCapture = (e) => { if (s.at && performance.now() - s.at < 450) { e.stopPropagation(); e.preventDefault(); s.at = 0; } };
  return { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onClickCapture: clickCapture };
}
