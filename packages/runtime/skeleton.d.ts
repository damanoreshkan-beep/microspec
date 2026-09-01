/**
 * # runtime/skeleton.js — the structure renders now; only the unknown values are placeholders
 *
 * No content-less spinners and no layout-hiding "loading screens": the app's real structure renders
 * immediately, and only the not-yet-known VALUES are atomic skeletons in place — text decodes (a
 * letters/digits scramble that resolves into the value; also the reveal when EN is translated to the
 * locale), images are blinking pixels. Skeletons hold for a MIN time so a fast load never flashes, then
 * reveal smoothly. What it buys the farm is a deterministic gate: every decorative bit is aria-hidden and
 * goes INSTANT (final value, no animation) on localhost and under `prefers-reduced-motion`, so shots and e2e
 * see the finished page while the effect stays device-only. The lesson recorded here is that a skeleton
 * which misreports the size of what is coming is worse than none — it guarantees the layout shift it
 * exists to prevent.
 *
 * ![skeleton — value slots that scramble, hold, then decode into the real content](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-skeleton.svg)
 *
 * ## Import
 * ```js
 * import { Scramble, Pixels, useReveal } from "/_rt/skeleton.js";                    // an app's page: the import map resolves /_rt/
 * import { Scramble, Pixels, useReveal } from "@microspec/core/runtime/skeleton.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Scramble} — atomic text slot: with `text` it holds a scramble for `minMs` (900) then decodes in place over ~480 ms; without one it is a perpetual placeholder bar of `len` glyphs.
 * - {@link Pixels} — a blinking-pixel image placeholder on a `<canvas>` sized to its box, neutral grey in both themes; one frozen frame in the gate.
 * - {@link useReveal} — `useReveal(ready, minMs = 1000)` returns false while the whole skeleton should still show, true once `ready` and the hold has passed.
 * - {@link Reveal} — a `div.ms-reveal` wrapper whose children fade in when they replace a skeleton (the keyframes live in theme.css).
 * - {@link Loading} — the LAST-RESORT block: a few decoding lines with `role="status"` for a view with no structure to show yet.
 *
 * ## In practice
 * ```js
 * import { Scramble, Pixels, useReveal } from "/_rt/skeleton.js";                              // air
 *
 * const ready = useReveal(!!data);
 * // structure-shaped skeleton: gauge ring + forecast band + two stat lists, with decoding value slots.
 * if (!ready) return html`<div class="flex flex-col gap-5 items-center">
 *   <div class="w-36 h-36 rounded-full border-[6px] flex items-center justify-center" style="border-color:var(--sf-track-face)">
 *     <span class="text-5xl font-bold tabular-nums text-base-content/40"><${Scramble} len=${2} /></span>
 *   </div>
 *   <div class="text-lg font-bold text-base-content/50"><${Scramble} len=${8} /></div>
 *   <div class="w-full max-w-[420px] h-28 rounded-2xl overflow-hidden sf-inset"><${Pixels} /></div>
 * </div>`;
 *
 * // A value that arrives later decodes into itself, in place — earshot renders a received line this way:
 * html`<${Scramble} text=${row.text} minMs=${420} />`;
 * ```
 *
 * ## How it fits
 * It imports `htm/preact` and `preact/hooks` and nothing from the runtime. Inside the runtime, `render.js`
 * builds the generated list and card skeletons out of `Scramble`/`Pixels`/`useReveal` and decodes translated
 * text with `Scramble`; `video.js` and `globe.js` use `Pixels` for their image placeholders; `theme.css`
 * owns the `.ms-reveal` fade that {@link Reveal} applies. 24 farm apps import it directly — air, arc,
 * compass, earshot, globe, grain, handpan, horoscope, hunt, iching, imagine, iptv, kp, onthisday, persona,
 * rave, reel, ruler, sun, swarm, tarot, tgvoice, transit, v2m — and every generated app reaches it through
 * `render.js`.
 *
 * ## Invariants and pitfalls
 * - Never a content-less spinner or a layout-hiding loading screen: render the real layout with atomic
 *   `Scramble`/`Pixels` slots; `Loading` is the last resort.
 * - Instant in the gate: on `localhost`/`127.0.0.1`/`[::1]` and under `prefers-reduced-motion` a slot shows
 *   its final value with no animation, so shots and e2e are deterministic. `?__anim` in the page URL is the
 *   gate hook that exercises the animations anyway.
 * - A known value scrambles at its OWN full length, never a capped stand-in: the 72-char cap once applied to
 *   values too, so a 600-char description spent 900 ms as 72 characters and then grew ~8×. The cap still
 *   bounds a PLACEHOLDER, where `len` is only the caller's guess.
 * - With a target, the scramble is done in place — every non-space character becomes noise, whitespace is
 *   untouched — so the exact length, word shapes and wrap points hold and the paragraph occupies its final
 *   box from the first frame.
 * - A placeholder slot is `aria-hidden`; a value slot is not. `Pixels` is always aria-hidden.
 * - `useReveal` measures the hold from the component's FIRST render (`born`), not from when `ready` flipped:
 *   a fast load still holds the skeleton for `minMs`, a slow one reveals as soon as it is ready.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/skeleton.js — edit the JSDoc there, never this file.
/**
 * Atomic text value slot: holds a scramble for ~minMs then decodes into `text`; a perpetual placeholder bar without one.
 * @param props `text` (the value, or none for a placeholder), `len` (placeholder length guess), `cls`, `speed` (ms per tick), `minMs` (hold before decoding)
 * @returns the <span> the slot renders into
 */
export function Scramble({ text, len, cls, speed, minMs }: {
    text: any;
    len?: number;
    cls?: string;
    speed?: number;
    minMs?: number;
}): any;
/**
 * A blinking-pixel image placeholder on a <canvas> sized to its box; a single frozen frame in the gate.
 * @param props `cls` — extra classes on the canvas
 * @returns the aria-hidden <canvas>
 */
export function Pixels({ cls }: {
    cls?: string;
}): any;
/**
 * Hold a whole skeleton for a minimum time (no flash on a fast load), then reveal.
 * @param ready whether the real content is available
 * @param minMs the minimum hold since first render
 * @returns false while the skeleton should still show, true once it may reveal
 */
export function useReveal(ready: any, minMs?: number): boolean;
/**
 * Last-resort loading block: a few decoding lines for a view with no meaningful structure to show yet.
 * @param props `lines` — the placeholder length of each line
 * @returns the role="status" block
 */
export function Loading({ lines }?: {
    lines?: number[];
}): any;
/** Wrapper whose children fade in when they replace a skeleton (the `ms-reveal` class); final state in the gate. */
export function Reveal({ children, cls }: {
    children: any;
    cls?: string;
}): any;
