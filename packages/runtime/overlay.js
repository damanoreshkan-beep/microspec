/* @ts-self-types="./overlay.d.ts" */
/**
 * The arithmetic the Back-button routing runs on: how many history entries an overlay atom's value is worth,
 * kept pure and unit-tested so the invariant "system Back closes the top layer and never exits the app by
 * accident" is proven rather than inlined in the bootstrap. Exports `overlayDepth`.
 * @module
 */
// overlay — the arithmetic the Back-button routing runs on (index.js). Pure, dependency-free, unit-tested:
// the invariant "system Back closes the top layer and never exits the app by accident" is the one every app
// inherits, so the counting behind it belongs somewhere it can be proven rather than inline in the bootstrap.

// overlayDepth(v) — how many history entries an overlay atom's value is worth.
//   a plain overlay (S.sheet=true, S.detail={…})  → 1  (open) or 0 (closed/null/false)
//   a STACK overlay (S.stack=["a","b"])           → its LENGTH — one entry per level, which is what lets
//                                                   Back unwind a drill-down one step at a time instead of
//                                                   collapsing the whole dive in a single press.
/**
 * How many history entries an overlay atom's value is worth: a stack's length, 1 for an open plain overlay,
 * 0 when closed.
 * @param v the overlay atom's value (array, truthy, or falsy)
 * @returns the depth as a non-negative integer
 */
export const overlayDepth = (v) => (Array.isArray(v) ? v.length : v ? 1 : 0);
