/* @ts-self-types="./pixelfx.d.ts" */
/**
 * # runtime/pixelfx.js — a pixel-art effect, played once over an element
 *
 * A moment that deserves a flourish — a card turned, a reading arrived — gets a short hand-made pixel effect on
 * top of it: feathers of light, shadow tendrils, a pillar of flame, a splash, a lightning strike, a bloom. The
 * effects are code from the vendored pixelfx library (`./pixelfx.vendor.js`, MIT), drawn into a small frame and
 * scaled up with crisp pixels on a transparent canvas, so whatever sits under it stays visible. The library is
 * loaded on the first play, so no app pays for it until an effect runs.
 *
 * ## Import
 * ```js
 * import { PixelFx, PIXEL_FX } from "/_rt/pixelfx.js";                    // an app's page: the import map resolves /_rt/
 * import { PixelFx, PIXEL_FX } from "@microspec/core/runtime/pixelfx.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link PIXEL_FX} — the names of the effects there are: `featherBurst`, `shadowTendrils`, `flamePillar`, `splash`, `lightningStrike`, `healingBloom`.
 * - {@link PixelFx} — `<PixelFx fx play scale />`: plays effect `fx` once each time `play` changes to a new non-null value.
 *
 * ## In practice
 * ```js
 * import { PixelFx } from "/_rt/pixelfx.js";
 *
 * // The parent is `relative`; the effect's own anchor lands on the parent's centre, and it plays once per new draw.
 * html`<div class="relative">
 *   <img src=${card} alt="" />
 *   <${PixelFx} fx=${reversed ? "shadowTendrils" : "featherBurst"} play=${drawId} scale=${2} />
 * </div>`
 * ```
 *
 * ## Invariants and pitfalls
 * - One play per new `play` value; `null` or `undefined` plays nothing. The same value twice plays once.
 * - The frame loop stops the moment the effect is done and the canvas is cleared: nothing runs while it rests.
 * - Under `prefers-reduced-motion: reduce` and in the gate nothing plays.
 * - The canvas is `aria-hidden` and lets every touch through; the parent decides whether it clips the effect.
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { gate } from "./gate.js";

/** The names of the effects {@link PixelFx} can play. */
export const PIXEL_FX = Object.freeze(["featherBurst", "shadowTendrils", "flamePillar", "splash", "lightningStrike", "healingBloom"]);

let lib = null;
const load = () => (lib ||= import("./pixelfx.vendor.js"));
const still = () => gate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * Plays one pixel-art effect over its parent, once per new `play` value. The effect's anchor sits on the parent's
 * centre; the parent should be `position: relative`.
 * @param props.fx one of {@link PIXEL_FX}
 * @param props.play a value that changes each time the effect should play again; null plays nothing
 * @param props.scale screen pixels per effect pixel (default 2)
 * @param props.class extra classes on the canvas
 * @returns a transparent canvas that is empty while it rests
 */
export function PixelFx({ fx, play, scale = 2, class: cls = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (play == null || !cv || !PIXEL_FX.includes(fx) || still()) return;
    let raf = 0, live = true;
    load().then((L) => {
      if (!live) return;
      const mod = L[fx], [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin || [w / 2, h / 2];
      cv.width = w; cv.height = h;
      Object.assign(cv.style, { width: `${w * scale}px`, height: `${h * scale}px`, marginLeft: `${-ox * scale}px`, marginTop: `${-oy * scale}px` });
      const ctx = cv.getContext("2d"), frame = L.createFrame(w, h), img = new ImageData(w, h);
      const run = L.createFx(mod, { x: ox, y: oy });
      let last = 0;
      const tick = (now) => {
        if (!live) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        run.update(dt);
        if (run.done()) { ctx.clearRect(0, 0, w, h); return; }
        L.clearFrame(frame);
        run.draw(frame);
        L.composite(frame, img.data, null);
        ctx.putImageData(img, 0, 0);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => {});
    return () => { live = false; cancelAnimationFrame(raf); cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height); };
  }, [fx, play]);
  return html`<canvas ref=${ref} aria-hidden="true" class=${`ms-pixelfx ${cls}`} style="position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;image-rendering:pixelated;z-index:5"></canvas>`;
}
