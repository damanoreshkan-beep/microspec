// gesture — mobile touch gestures shared by the runtime and apps (the farm is mobile-first). Two hooks:
//   useSheetDrag(onClose) — a bottom sheet you drag DOWN by its grip to dismiss; the box follows the finger
//     1:1, and on release it either flies out (past a distance, or a fast downward flick) or springs back.
//   usePanX({onNext,onPrev}) — the reading FOLLOWS your finger left/right (translateX, 1:1 with edge
//     resistance so it can never scroll the page), and on release commits to prev/next or springs back. It
//     also swallows the tap the same drag would otherwise fire (so a swipe never also opens the card under it).
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

export function usePanX({ onNext, onPrev, canNext = true, canPrev = true, threshold = 52 } = {}) {
  const paneRef = useRef();
  const s = useRef({ on: false, x0: 0, y0: 0, dx: 0, decided: 0, at: 0 }).current;
  const setX = (x, spring) => { const p = paneRef.current; if (!p) return; p.style.transition = spring ? "transform .26s cubic-bezier(.2,.85,.25,1)" : "none"; p.style.transform = x ? `translateX(${x}px)` : ""; };
  const resist = (dx) => { const a = Math.abs(dx), lim = 130; return Math.sign(dx) * (a <= lim ? a : lim + (a - lim) * 0.35); };  // follow 1:1, then rubber-band
  const down = (e) => { s.on = true; s.x0 = e.clientX; s.y0 = e.clientY; s.dx = 0; s.decided = 0; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } setX(0, false); };
  const move = (e) => {
    if (!s.on) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.decided) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; s.decided = Math.abs(dx) > Math.abs(dy) ? 1 : -1; }  // lock the axis
    if (s.decided !== 1) return;                                                                     // vertical → let scroll/tap through
    s.dx = dx;
    const atEdge = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
    setX(atEdge ? Math.sign(dx) * Math.min(Math.abs(dx) * 0.2, 42) : resist(dx), false);             // heavy resistance at the ends
  };
  const up = () => {
    if (!s.on) return; s.on = false;
    if (s.decided !== 1) return;
    if (Math.abs(s.dx) > 8) s.at = performance.now();                                                // any real drag suppresses the tap
    const dir = s.dx < 0 ? 1 : -1, can = dir === 1 ? canNext : canPrev;
    if (Math.abs(s.dx) > threshold && can) { try { (dir === 1 ? onNext : onPrev)?.(); } catch { /* */ } requestAnimationFrame(() => setX(0, true)); }  // commit: swap content, glide it home
    else setX(0, true);                                                                              // spring back
  };
  const clickCapture = (e) => { if (s.at && performance.now() - s.at < 450) { e.stopPropagation(); e.preventDefault(); s.at = 0; } };
  // NB: no `style` prop (add `touch-pan-y` on the element) — so Preact never resets the transform we drive by ref
  return { paneRef, pan: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onClickCapture: clickCapture } };
}
