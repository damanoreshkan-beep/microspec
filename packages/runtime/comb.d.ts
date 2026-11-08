/**
 * # runtime/comb.js — the honeycomb DISPLAY: a set of like things laid from the centre outward, on the GPU
 *
 * "мене задовбав скролл вниз … я хочу соти реальні, продумані. від центру наружу,
 * канвас … рівень канвасу. 60 fps" — and the next day: "ні одной фічі не втратити … більші картки, кластери,
 * слогани апок, зумування … якість преміум 4к". A page that scrolls down is a document; a set of apps or songs is
 * not a document, it is a FIELD. This module lays that field as a honeycomb that grows from the centre — ring
 * after ring, the first item in the middle, the next around it, every GROUP a contiguous territory — on one
 * full-screen canvas with no element per cell: the lattice, the camera, the inertia, the snap, the pinch and every
 * touch live in `comb.wasm` (a machine on {@link MachineStage}, ABI 1), the pixels in `comb.frag`, and this file is
 * the glue neither of them can be — it rasterises each item's form into ONE icon atlas and its name and line into
 * ONE text atlas at the density the screen asks for, hands them to the stage as `cam` and `tex2`, feeds the theme's
 * colours and the groups to the machine's memory, and turns the machine's HUD (the tap, the cell under the lens, the
 * cell the lens SETTLED on) back into calls on the app — and the app's own current item back into the lens.
 *
 * ![The comb: items → atlases (cam, tex2) + colours (buf) → the machine lays, moves, zooms, snaps → the shader draws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-comb.svg)
 *
 * ## Import
 * ```js
 * import { Comb, MARK } from "/_rt/comb.js";                                       // an app's page
 * import { spiral, atlasPlan, COMB_MAX, LEVELS } from "@microspec/core/runtime/comb.js";   // a Deno test, a product rt/ module
 * ```
 *
 * ## What it exports
 * - {@link Comb} — the display: `{ items, groups, cell, focus, zoom, onOpen, onFocus, onSettle, onReady, top = 0,
 *   bottom = 0, zClass = "z-0" }`. `items` is the ordered set, GROUP-MAJOR, index 0 at the centre:
 *   `{ id, name, subtitle?, icon?, color?, mark?, form?, group? }` — `subtitle` the card's line (a slogan, a first
 *   sentence), `icon` a same-origin picture URL (null = the theme's material fills the form), `color` the halo's and
 *   the lit rim's — a palette name (`"accent"` · `"secondary"` · `"ink"`, resolved from the live theme) or a
 *   `#rrggbb` (default: the accent), `mark` from {@link MARK}, `form` a shape.js name (default `shapeOf(id)`),
 *   `group` an index into `groups` (`{ id, name, color }`, at most 28, colours the same way). `cell(item, i, mode)`
 *   renders ONE cell as DOM: the accessible twin behind the canvas (visually hidden, so a screen reader, the keyboard
 *   and the gate's e2e reach every item) and the visible fallback on the core's `.ms-comb` lattice wherever WebGL2 is
 *   not. `focus` is the app's CURRENT item id: when it changes, the lens eases to that cell (the host → the field);
 *   `onSettle(item, i)` fires when the lens comes to rest on a cell after a finger has moved the field (the field →
 *   the host: fonoteka plays that song); `onFocus(item, i)` follows the lens live; `onOpen(item, i)` is a tap inside
 *   a form. `zoom` asks a level (0 overview · 1 default · 2 cards), the same levels a pinch snaps to.
 * - {@link spiral} — `(n) → [[q, r], …]`, the one-group lattice, the machine's own walk (the JS twin the tests hold it to).
 * - {@link atlasPlan} — `(n, size, aspect, want) → { cols, rows, tileW, tileH, size }` the tile grid for `n` tiles.
 * - {@link MARK}, {@link COMB_MAX} (217 — eight rings), {@link LEVELS} (0.8 · 1 · 1.35), {@link PARAM} (the `set` indices).
 *
 * ## The contract
 * - The lattice is pointy-top hexagonal, stretched 1.3× vertically so a name fits under a form; the pitch is
 *   `clamp(min(W, H) / 4.2, 84, 120)` CSS px × the zoom — the machine decides, the shader obeys. Index 0 sits under
 *   the LENS (between the header, the app's `top`, the dock and the app's `bottom` — an island's `--island-h` is
 *   read too); a lens of +15% grows the centre. One finger drags the world; a release flings it and it settles on
 *   the nearest cell exactly; past the field's edge a rubber band. Two fingers zoom about their midpoint; on release
 *   the zoom eases to the nearest level — at the cards level the rows unfold so every cell shows its line.
 * - Groups are territories: a group's first cell anchors at the first free site of the spiral, its others take the
 *   nearest free site to that anchor; every cell's hexagon is tinted with its group's colour, faintly, so the
 *   borders between groups read; at the overview the group's name lies across its territory.
 * - Colours come from the THEME, never from here: `--app-accent`, `--color-secondary`, `--color-base-content`,
 *   `--color-base-200` are resolved to sRGB on every theme change and written to the machine's palette, and a form
 *   with no picture takes the theme's material (`--ds-fill`). Text is set in the page's font.
 * - Two atlases: icons at the source's own 256 px (512 for a small set), so the form at the centre is never
 *   magnified; names and lines on a separate atlas sized by the screen (`0.9 × pitch × 1.15 × dpr`, 4096² where the
 *   GPU allows) with mipmaps, so the type is crisp at every zoom. The icon atlas uploads progressively (names
 *   first, at most two more uploads), the text atlas once per locale.
 * - `data-comb` on the wrapper: `gl` or `dom`; `data-comb-focus` the item under the lens, `data-comb-group` its
 *   group's id, `data-comb-zoom` the level, `data-comb-ready` once the machine runs.
 *
 * ## Why
 * Every set of like things in the farm wanted the same thing — the comb — and a CSS lattice could only ever be a
 * grid wearing a costume: it scrolls, it reflows, it has no centre and no zoom. Here the comb is a display in its
 * own right, written once; an app brings items, groups and a cell, and gets the field — with nothing it had lost.
 *
 * @module
 */
/**
 * The axial coordinates of the first `n` cells of ONE group, the way the machine lays them: the centre, then every
 * ring clockwise from its top-left cell.
 * @param n how many cells
 * @returns `[[q, r], …]` of length `min(n, COMB_MAX)`
 */
export function spiral(n: any): number[][];
/**
 * A tile grid for `n` tiles of aspect `aspect` (height / width) in a square atlas: as many columns as the square
 * root asks, widened until the rows fit; a tile is never wider than `want` (the screen's need) nor than the atlas allows.
 * @param n how many tiles
 * @param size the atlas side in device px
 * @param aspect tile height / width
 * @param want the widest tile wanted
 * @returns `{ cols, rows, tileW, tileH, size }`
 */
export function atlasPlan(n: any, size?: number, aspect?: number, want?: number): {
    cols: number;
    rows: number;
    tileW: number;
    tileH: number;
    size: number;
};
/** `#rrggbb` → the packed integer the machine's tables take. */
export function rgbOf(hex: any): number;
/**
 * The ICON atlas: every item's picture through its own organic form on a black ground (or the theme's material when
 * it has none), progressively — the forms first, then pictures as they land, at most three uploads.
 * @param items the comb's items
 * @param plan `{ cols, tileW, size }` from {@link atlasPlan} (square tiles)
 * @param publish `(bitmap) => void`
 * @param fill the theme's material URL for a form without a picture, or ""
 * @returns `() => void` stop
 */
export function buildIcons(items: any, plan: any, publish: any, fill?: string): () => void;
/**
 * The TEXT atlas: every item's name (two lines) and line (three), and every group's caption, white on transparent,
 * in the page's font at the density the screen asks for; published once as a blob URL (the stage mipmaps it).
 * @param items the comb's items
 * @param groups the comb's groups
 * @param plan from {@link atlasPlan} with the text aspect
 * @param publish `(url) => void`
 * @returns `() => void` stop
 */
export function buildText(items: any, groups: any, plan: any, publish: any): () => void;
/**
 * The honeycomb display: the items from the centre outward on the GPU, their accessible twin behind it, the core's
 * CSS lattice where WebGL2 is not.
 * @param props see the module note
 * @returns the stage, the twin (or the fallback lattice)
 */
export function Comb({ items, groups, cell, focus, zoom, onOpen, onFocus, onSettle, onReady: onApi, top, bottom, zClass }: {
    items?: any[];
    groups?: any[];
    cell: any;
    focus: any;
    zoom: any;
    onOpen: any;
    onFocus: any;
    onSettle: any;
    onReady: any;
    top?: number;
    bottom?: number;
    zClass?: string;
}): any;
/** Eight rings — 1 + 6 + 12 + … + 48 cells; the machine's site map is 17 × 17. */
export const COMB_MAX: 217;
/** The zoom levels a pinch snaps to: overview · default · cards. */
export const LEVELS: readonly number[];
/** The machine's `set(i, v)` indices; a cell's colour is `colour + i` (0xRRGGBB), its mark `mark + i`, its group `group + i`; a group's colour `groupColour + g`. */
export const PARAM: Readonly<{
    count: 0;
    top: 1;
    bottom: 2;
    width: 3;
    height: 4;
    still: 5;
    iconCols: 6;
    iconTile: 7;
    textCols: 8;
    textTileW: 9;
    textTileH: 10;
    pulse: 11;
    iconAtlas: 12;
    textAtlas: 13;
    zoom: 14;
    goal: 15;
    colour: 16;
    mark: 256;
    group: 512;
    groupColour: 768;
}>;
/** A cell's mark bits: a dot for new/updated, `lit` for the one that plays. */
export const MARK: Readonly<{
    none: 0;
    new: 1;
    updated: 2;
    lit: 4;
}>;
