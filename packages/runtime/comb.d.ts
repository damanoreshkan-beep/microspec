/**
 * # runtime/comb.js — the honeycomb DISPLAY: a set of like things laid from the centre outward, on the GPU
 *
 * "мене задовбав скролл вниз … я хочу соти реальні, продумані. від центру наружу,
 * канвас … рівень канвасу. 60 fps." A page that scrolls down is a document; a set of apps or songs is not a
 * document, it is a field. This module lays that field as a honeycomb that grows from the centre — ring after
 * ring, the first item in the middle, the next six around it — on one full-screen canvas, with no element per
 * cell: the lattice, the camera, the inertia, the snap and every touch live in `comb.wasm` (a machine on
 * {@link MachineStage}, ABI 1), the pixels in `comb.frag`, and this file is the glue neither of them can be — it
 * rasterises each item's form and name into ONE atlas, hands it to the stage as the `cam` picture, and turns the
 * machine's HUD (which cell was tapped, which sits under the lens) back into calls on the app.
 *
 * ![The comb: items → atlas (cam) + colours (buf) → the machine lays, moves, snaps → the shader draws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-comb.svg)
 *
 * ## Import
 * ```js
 * import { Comb } from "/_rt/comb.js";                               // an app's page
 * import { spiral, atlasPlan, COMB_MAX } from "@microspec/core/runtime/comb.js";   // a Deno test, a product rt/ module
 * ```
 *
 * ## What it exports
 * - {@link Comb} — the display: `{ items, cell, onOpen, onFocus, top = 0, bottom = 0, zClass = "z-0" }`. `items` is the
 *   ordered set, index 0 at the centre, then clockwise rings: `{ id, name, icon?, color?, mark?, form? }` — `icon` a
 *   same-origin picture URL (null = the item's colour fills its form), `color` a `#rrggbb` the halo and the lit rim
 *   take, `mark` from {@link MARK} (`new` an amber dot, `updated` a cyan one, `lit` a glowing rim — the song that
 *   plays), `form` one of shape.js's names (default `shapeOf(id)`). `cell(item, i)` renders ONE cell as DOM: it is the
 *   accessible twin behind the canvas (visually hidden, so a screen reader, the keyboard and the gate's e2e reach
 *   every item), and it is the visible fallback — the core's `.ms-comb` lattice — wherever WebGL2 is not. `onOpen(item,
 *   i)` fires on a tap inside a form, `onFocus(item, i)` when the cell under the lens changes. `top`/`bottom` are extra
 *   CSS px the app's own chrome takes (an island, a strip); the header and the dock are read from `--hdr-h`/`--dock-h`.
 *   `onReady(api)` hands the machine's api up, for a value the app drives every frame without a render — fonoteka
 *   sets `PARAM.pulse` (0..1, the song's bass envelope at the audio clock) and the lit cell breathes with it.
 * - {@link spiral} — `(n) → [[q, r], …]` the axial coordinates of the first `n` cells, the machine's own walk (the JS
 *   twin the tests hold it to).
 * - {@link atlasPlan} — `(n, size = 2048) → { cols, rows, tileW, tileH, size }` the tile grid that holds `n` items.
 * - {@link MARK}, {@link COMB_MAX} (217 — eight rings), {@link PARAM} (the machine's `set` indices).
 *
 * ## The contract
 * - The lattice is pointy-top hexagonal, stretched 1.3× vertically so a name fits under a form; the pitch is
 *   `clamp(min(W, H) / 4.2, 84, 120)` CSS px — the machine decides, the shader obeys. Index 0 sits under the LENS
 *   (the point between the header and the dock); a lens of +15% grows the centre, so what is dragged to the middle
 *   comes forward. One finger drags the world; a release flings it and it settles on the nearest cell exactly; past
 *   the comb's edge a rubber band pulls it back. A tap inside a form is `onOpen`; a moved finger is never a tap.
 * - The atlas is drawn in this document, from the items' pictures: 2048² max, one tile an item, the form clipped by
 *   its organic path with a black ground (the art is made on black), the name set in the page's font, white, two lines
 *   at most. It uploads progressively (a new ImageBitmap every ~200 ms while pictures land), so the names and forms
 *   appear within the first frames and the art fills in.
 * - `data-comb` on the wrapper reports `gl` (the stage runs) or `dom` (the fallback lattice); `data-comb-focus` the
 *   focused item's id. The twin's buttons carry whatever `cell` gives them.
 * - Reduced motion and the gate make the arrival instant (`still`); nothing moves at rest.
 *
 * ## Why
 * Every set of like things in the farm wanted the same thing — the comb — and a CSS lattice could only ever be a
 * grid wearing a costume: it scrolls, it reflows, it has no centre. Here the comb is a display in its own right,
 * written once; an app brings items and a cell, and gets the field.
 *
 * @module
 */
/**
 * The axial coordinates of the first `n` cells, the way the machine lays them: the centre, then every ring clockwise
 * from its top-left cell.
 * @param n how many cells
 * @returns `[[q, r], …]` of length `min(n, COMB_MAX)`
 */
export function spiral(n: any): number[][];
/**
 * The atlas grid for `n` items: as many columns as the square root asks, widened until the rows fit the size.
 * @param n how many items
 * @param size the atlas side in device px (2048 is safe on every WebGL2 device)
 * @param max the widest tile wanted — a comb of three songs does not need 1024-px tiles
 * @returns `{ cols, rows, tileW, tileH, size }`
 */
export function atlasPlan(n: any, size?: number, max?: number): {
    cols: number;
    rows: number;
    tileW: number;
    tileH: number;
    size: number;
};
/** `#rrggbb` → the packed integer the machine's cell table takes. */
export function rgbOf(hex: any): number;
/**
 * Rasterise the items into one atlas canvas: names first (so the field reads at once), then every picture as it
 * lands, publishing a fresh ImageBitmap through `publish` while it grows. Browser only; returns a stop function.
 * @param items the comb's items
 * @param plan from {@link atlasPlan}
 * @param publish `(bitmap) => void` — called with each new picture of the atlas
 * @param font the CSS font family the names are set in
 * @returns `() => void` stop
 */
export function buildAtlas(items: any, plan: any, publish: any, font?: string): () => void;
/**
 * The honeycomb display: the items from the centre outward on the GPU, their accessible twin behind it, the core's
 * CSS lattice where WebGL2 is not.
 * @param props see the module note
 * @returns the stage, the twin (or the fallback lattice)
 */
export function Comb({ items, cell, onOpen, onFocus, onReady: onApi, top, bottom, zClass }: {
    items?: any[];
    cell: any;
    onOpen: any;
    onFocus: any;
    onReady: any;
    top?: number;
    bottom?: number;
    zClass?: string;
}): any;
/** Eight rings — 1 + 6 + 12 + … + 48 cells; the machine's site map is 17 × 17. */
export const COMB_MAX: 217;
/** The machine's `set(i, v)` indices for its parameters; a cell's colour is `16 + i` (packed 0xRRGGBB), its mark `256 + i`. */
export const PARAM: Readonly<{
    count: 0;
    top: 1;
    bottom: 2;
    width: 3;
    height: 4;
    still: 5;
    cols: 6;
    rows: 7;
    tileW: 8;
    tileH: 9;
    atlas: 10;
    pulse: 11;
    colour: 16;
    mark: 256;
}>;
/** A cell's mark bits: a dot for new/updated, `lit` for the one that plays. */
export const MARK: Readonly<{
    none: 0;
    new: 1;
    updated: 2;
    lit: 4;
}>;
