// gesture — mobile touch gestures shared by the runtime and apps (the farm is mobile-first). Two hooks:
//   useSheetDrag(onClose) — a bottom sheet you drag DOWN by its grip to dismiss; the box follows the finger
//     1:1, and on release it either flies out (past a distance, or a fast downward flick) or springs back.
//   useSwipe({onLeft,onRight}) — a horizontal swipe to move between items; it also swallows the tap the same
//     gesture would otherwise fire (so a swipe never also opens the card under it).
// Pointer Events cover mouse + touch in one path. Everything is guarded so a gesture can never throw into
// the render. The dismiss decision is a PURE function so it can be unit-tested (see runtime_test.js).
import { useRef } from "preact/hooks";
import { html } from "htm/preact";

// Dismiss when dragged far, or flicked down fast from a shorter distance. dy in px (down +), vy in px/ms.
export const pastDismiss = (dy, vy) => dy > 96 || (dy > 24 && vy > 0.5);

export function useSheetDrag(onClose) {
  const boxRef = useRef();
  const s = useRef({ on: false, y0: 0, y: 0, vy: 0, tp: 0 }).current;
  const setT = (y, spring) => { const b = boxRef.current; if (!b) return; b.style.transition = spring ? "transform .3s cubic-bezier(.2,.9,.2,1)" : "none"; b.style.transform = y ? `translateY(${y}px)` : ""; };
  const down = (e) => { if (!boxRef.current) return; s.on = true; s.y0 = e.clientY; s.y = 0; s.vy = 0; s.tp = performance.now(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } setT(0, false); };
  const move = (e) => { if (!s.on) return; const dy = e.clientY - s.y0, now = performance.now(), dt = Math.max(1, now - s.tp); s.vy = 0.6 * s.vy + 0.4 * ((dy - s.y) / dt); s.y = dy; s.tp = now; setT(dy > 0 ? dy : dy * 0.2, false); };
  const up = () => {
    if (!s.on) return; s.on = false;
    const b = boxRef.current;
    if (pastDismiss(s.y, s.vy)) {
      if (b) { b.style.transition = "transform .2s ease-in"; b.style.transform = "translateY(100%)"; }
      setTimeout(() => { try { onClose?.(); } catch { /* */ } if (b) { b.style.transition = "none"; b.style.transform = ""; } }, 180);
    } else setT(0, true);
  };
  // the grab affordance — drag STARTS here, so it never fights scrollable sheet content
  const grip = html`<div aria-hidden="true" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} style="touch-action:none;cursor:grab" class="mx-auto mb-2.5 -mt-0.5 h-1.5 w-10 shrink-0 rounded-full bg-base-content/25 active:bg-base-content/40"></div>`;
  return { boxRef, grip };
}

export function useSwipe({ onLeft, onRight, threshold = 55 } = {}) {
  const s = useRef({ on: false, x: 0, y: 0, at: 0 }).current;
  const down = (e) => { s.on = true; s.x = e.clientX; s.y = e.clientY; };
  const up = (e) => {
    if (!s.on) return; s.on = false;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.4) { s.at = performance.now(); try { (dx < 0 ? onLeft : onRight)?.(); } catch { /* */ } }
  };
  // a swipe that just moved should not also count as a tap on whatever was under the finger
  const clickCapture = (e) => { if (s.at && performance.now() - s.at < 400) { e.stopPropagation(); e.preventDefault(); s.at = 0; } };
  return { onPointerDown: down, onPointerUp: up, onPointerCancel: () => { s.on = false; }, onClickCapture: clickCapture, style: "touch-action:pan-y" };
}
