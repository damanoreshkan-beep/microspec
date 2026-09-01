/**
 * # runtime/ui.js — the UI kit: six interaction nodes, one geometry each, every app composes them
 *
 * The farm's ONE set of interaction nodes — Sheet, Segmented, Island, Panel, Slider, Transport — plus Stage
 * (the visible void a visualiser centres in) and Row (the one-line flex they all share). Why a kit in a farm
 * whose philosophy is "micro": micro is about what an app DOES, never about how many times the farm
 * reimplements a bottom sheet. Eight apps had hand-rolled one, and the copies had already drifted — some
 * centred the box, some ran full-bleed, three title sizes — with nothing broken enough for a gate to see. A
 * copied component fails slowly, by divergence, and no axe run reports "this app's sheet is 2px rounder than
 * the farm's". Every node reads the density tokens in theme.css (`--ms-gap` / `--ms-pad` / `--ms-r` /
 * `--ms-ctl` / `--ms-icon` / `--ms-title` / `--ms-label`, stepped by VIEWPORT HEIGHT) and the app's hue
 * (`--app-accent` / `--app-tint`) rather than a size: add a height breakpoint in theme.css and every app in the
 * farm compacts correctly.
 *
 * ![The ui module map: the six nodes plus Stage and Row, each reading the density tokens and the app hue from theme.css, Sheet and Transport wired to the caller's routing atom](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-ui.svg)
 *
 * ## Import
 * ```js
 * import { Sheet, Segmented, Island, Panel, Slider, Transport } from "/_rt/ui.js";                    // an app's page: the import map resolves /_rt/
 * import { Sheet, Segmented, Island, Panel, Slider, Transport } from "@microspec/core/runtime/ui.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Nodes**
 * - {@link Sheet} — `Sheet({ id, open, onClose, title, subtitle, icon, locale, size = "md", tone = "glass", children })`: the ONE bottom sheet — a native `<dialog>` with drag-to-dismiss grip, title row + close button, backdrop, and the farm's only sanctioned nested scroll (88dvh cap).
 * - {@link Segmented} — `Segmented({ items, value, onChange, variant = "solid", size = "md", scroll = false, attr = "data-seg", label, tone = "inset" })`: the ONE tab / option strip; items carry `id`, `label`, optional `icon`, `dot`, `meta`, `busy`, `title`. A fitted strip demotes to glyphs when the rail is narrower than its measured need.
 * - {@link Island} — `Island({ children, className, tag = "div", pinned = false, at = "bottom", tone = "glass", ...rest })`: the floating glass panel (the dock's material); `pinned` clears the measured chrome (`--dock-h` / `--hdr-h`); `tone` "glass" | "dark" (over media) | "frost" (over a stage).
 * - {@link Panel} — `Panel({ title, children, className, ...rest })`: the solid in-flow surface — the page extruded (`sf-raised sf-e2`), no border, optional mono micro-label.
 * - {@link Slider} — `Slider({ id, label, value, onInput, min = 0, max = 1, step = 0.02, attr = "data-macro" })`: a labelled range whose caption is the accessible name; the value is deliberately not printed.
 * - {@link Transport} — `Transport({ locale, playing, onToggle, onPrev, onNext, pos, dur, onSeek, repeat, onRepeat, shuffle, onShuffle, title, subtitle, lead, trail, stopIcon, size, disabled, className, actions, keep = 2, moreOpen, onMore, onMoreClose, onScrubStart, onScrub, onScrubEnd })`: the ONE play control; every part opt-in by handler, sizes "md" | "sm" | "hero", actions demoted into a history-backed overflow sheet.
 *
 * **Layout**
 * - {@link Stage} — `Stage({ children, className })`: the `flex-1 min-h-0` void between the chrome, `data-stage-box`; the canvas inside is `absolute inset-0` relative to this box, not the screen.
 * - {@link Row} — `Row({ children, className })`: the one-line flex (label left, control right) at the kit's gap.
 *
 * **Materials (class strings)**
 * - {@link FROST} — the frost recipe: a 60% base-100 wash, xl blur, a 10% hairline and one soft cast — glass over a stage.
 * - {@link SHEET_BOX} — the sheet box's class list (radius, `min(36rem,100vw)` width cap, `min-w-0`, 88dvh height cap), shared with the shell's own dialogs.
 *
 * ## In practice
 * ```js
 * import { Sheet, Segmented } from "/_rt/ui.js";
 *
 * // A one-of-N strip: colour enters only as `dot`, the count as mono `meta`; `scroll` makes it a rail.
 * const ListSwitcher = ({ lists, wishes, active, t }) => html`<div class="flex-1 min-w-0">
 *   <${Segmented} attr="data-list" scroll variant="outline" label=${T(t, "tabLists")}
 *     items=${lists.map((l) => ({ id: l.id, label: l.name, icon: l.icon, dot: l.color,
 *                                   meta: wishes.filter((w) => w.listId === l.id && !w.granted).length }))}
 *     value=${active} onChange=${setActive} /></div>`;                     // apps/wish/view.js
 *
 * // The sheet is a container; `open` and `onClose` come from the routing atom so system Back closes it.
 * html`<${Sheet} open onClose=${() => S.screen.set(null)} title=${T(t, "srcTitle")} icon="lucide:link">
 *   <form onSubmit=${load} class="flex flex-col gap-3">…</form>
 * </${Sheet}>`;                                                               // apps/reel/view.js
 * ```
 *
 * ## How it fits
 * Imports `htm/preact`, `preact` (`Fragment`), `preact/hooks`, and three runtime modules: `gesture.js`
 * (`useSheetDrag` — the sheet's grip), `i18n.js` (`sys` — the close / more / transport labels from the SYS
 * dictionary) and `player.js` (`REPEAT_ICON`, `clock` — the repeat glyph and the seek readout). `render.js`
 * imports `SHEET_BOX` so the shell's own dialogs share the box. 49 farm apps import it — rave, handpan, v2m,
 * tide, reel, wish, hive, mirage, outpost, fmradio… — Sheet in most of them, Segmented and Island next,
 * Transport in the players.
 *
 * ## Invariants and pitfalls
 * - Sheet and the Transport overflow are NOT history-backed by themselves, deliberately: routing is the
 *   caller's atom (`S.screen` for a tool app, `S.sheet` for the filter sheet). Pass `open` / `onClose` from it
 *   so Back closes them; a sheet that owned its own state would be the one screen Back could not reach.
 * - `min-w-0` in the sheet column is load-bearing: a flex item defaults to `min-width: auto`, and since
 *   DaisyUI gives `.modal-bottom > .modal-box` `width: 100%`, one unbreakable string inside pushes the
 *   DOCUMENT wide — four apps' "horizontal overflow at 208px" came from a sheet none of them wrote.
 * - Segmented contrast is a SHAPE, not a luminance step: in this theme `--color-primary` and
 *   `--color-base-content` are the same hex, so "active = text-primary" resolves to 100% vs 80% of one colour
 *   (1.56:1) — the dock shipped that for its whole life with every gate green. Use `solid` for the screen's
 *   primary mode, `outline` for a strip sitting ON content.
 * - A fitted strip demotes to glyphs, never squashes — but only when every option has an icon; without one,
 *   hiding the word is deletion. Colour reaches an option's MARK (`dot`), never its label.
 * - Transport answers to its CONTAINER width, never the viewport: the watch gate narrows `#view` to 200px
 *   while the window stays 384px, and `.ms-side` puts it in a narrow column on a full-width phone. Its
 *   `min-w-0 max-w-full` cap is what lets it demote into "…" instead of walking off the screen.
 * - Transport hides actions only where the app wired `onMore`: hidden and unreachable are the same thing, so
 *   without an overflow sheet nothing may hide. The sheet lists EVERY action, not just the demoted ones.
 * - Island `tone="dark"` and `tone="frost"` cast ALONE (`sf-frost`), never the extrusion pair: over a picture
 *   the pair's light half has nothing to shade against and draws a white ring — reel's island came out
 *   hard-outlined in the light theme.
 * - Panel has no hairline — an older comment said it did, and app authors copied that. Use Island only where
 *   the panel floats OVER content.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/ui.js — edit the JSDoc there, never this file.
/**
 * The ONE bottom sheet: a native `<dialog>` with drag-to-dismiss grip, optional title/subtitle/icon header
 * and close button, backdrop, and its own inner scroll (the farm's only sanctioned nested scroll).
 * @param props `open` / `onClose` should come from a routing atom so system Back closes it; `size` "md"|"lg";
 *   `tone` "glass" (opaque base-100) | "frost" (translucent over a stage); `locale` for the close label
 * @returns the sheet element
 */
export function Sheet({ id, open, onClose, title, subtitle, icon, locale, size, tone, children }: {
    id: any;
    open: any;
    onClose: any;
    title: any;
    subtitle: any;
    icon: any;
    locale: any;
    size?: string;
    tone?: string;
    children: any;
}): any;
/**
 * The ONE tab / option strip for a one-of-N choice. Items carry `id`, `label`, and optionally `icon`,
 * `dot` (the option's colour, painted on its mark), `meta` (trailing mono count), `busy`, `title`.
 * @param props `value` the selected id; `onChange(id)`; `variant` "solid" (filled ink pill) | "outline"
 *   (hairline pill, for strips sitting ON content); `size` "md"|"sm"; `scroll` makes it a rail; `attr`
 *   the data attribute each button carries (e2e hook); `label` the group's accessible name; `tone` "inset"|"frost"
 * @returns the strip element
 */
export function Segmented({ items, value, onChange, variant, size, scroll, attr, label, tone }: {
    items: any;
    value: any;
    onChange: any;
    variant?: string;
    size?: string;
    scroll?: boolean;
    attr?: string;
    label: any;
    tone?: string;
}): any;
/**
 * The floating glass panel — the dock's material, reusable for a tool app's persistent controls.
 * @param props `pinned` fixes it to clear the chrome (`at` "bottom" above the dock | "top" under the header,
 *   both off the MEASURED chrome tokens); `tone` "glass" | "dark" (over media) | "frost" (over a stage);
 *   `tag` "div" | "section"; `className` for width/radius/row; other props pass to the element
 * @returns the island element (wrapped in a positioner when pinned)
 */
export function Island({ children, className, tag, pinned, at, tone, ...rest }: {
    [x: string]: any;
    children: any;
    className?: string;
    tag?: string;
    pinned?: boolean;
    at?: string;
    tone?: string;
    rest?: any;
}): any;
/**
 * The solid in-flow surface: the page extruded at the shallow elevation, with an optional mono micro-label.
 * @param props `title` the micro-label; `className` extra classes; other props pass to the element
 * @returns the panel element
 */
export function Panel({ title, children, className, ...rest }: {
    [x: string]: any;
    title: any;
    children: any;
    className?: string;
    rest?: any;
}): any;
/**
 * A labelled range whose mono caption is also the input's accessible name; the value is deliberately not printed.
 * @param props `id`; `label`; `value`; `onInput(number)`; `min`/`max`/`step` (default 0…1 by 0.02);
 *   `attr` the data attribute the label carries (default `data-macro`)
 * @returns the label element wrapping the range input
 */
export function Slider({ id, label, value, onInput, min, max, step, attr }: {
    id: any;
    label: any;
    value: any;
    onInput: any;
    min?: number;
    max?: number;
    step?: number;
    attr?: string;
}): any;
/**
 * The ONE play control. Every part is opt-in by handler: `onToggle` (play/pause), `onPrev`/`onNext`,
 * `onSeek` with `pos`/`dur` (the seek bar), `onRepeat`/`onShuffle`, `title`/`subtitle`, `actions` (the
 * app's own tools, demoted into an overflow sheet when they do not fit). Sizes "md" | "sm" | "hero".
 * @param props see the destructured parameter list; `locale` selects the SYS strings for the labels
 * @returns the transport container (an `@container` that compacts on width and height)
 */
export function Transport({ locale, playing, onToggle, onPrev, onNext, pos, dur, onSeek, repeat, onRepeat, shuffle, onShuffle, title, subtitle, lead, trail, stopIcon, size, disabled, className, actions, keep, moreOpen, onMore, onMoreClose, onScrubStart, onScrub, onScrubEnd, }: {
    locale?: string;
    playing?: boolean;
    onToggle: any;
    onPrev: any;
    onNext: any;
    pos?: number;
    dur?: number;
    onSeek: any;
    repeat: any;
    onRepeat: any;
    shuffle?: boolean;
    onShuffle: any;
    title: any;
    subtitle: any;
    lead: any;
    trail: any;
    stopIcon?: boolean;
    size?: string;
    disabled?: boolean;
    className?: string;
    actions?: any[];
    keep?: number;
    moreOpen: any;
    onMore: any;
    onMoreClose: any;
    onScrubStart: any;
    onScrub: any;
    onScrubEnd: any;
}): any;
/**
 * The visible void between the chrome — the `flex-1 min-h-0` box a fit view's canvas centres in.
 * @param props `children` the canvas/stage content; `className` extra classes
 * @returns the `data-stage-box` element
 */
export function Stage({ children, className }: {
    children: any;
    className?: string;
}): any;
/** The frost recipe (class list): a 60% base-100 wash, xl blur, a 10% hairline and one soft cast — glass over a stage. */
export const FROST: "bg-base-100/60 backdrop-blur-xl border border-base-content/10 sf-frost text-base-content";
/** The sheet box's class list — the shell every bottom sheet in the farm shares (radius, width cap, 88dvh height cap). */
export const SHEET_BOX: "modal-box rounded-t-[1.75rem] max-w-[min(36rem,100vw)] mx-auto min-w-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)] pb-8 max-h-[88dvh]";
/** The one-line flex row used inside panels and sheets (label left, control right) at the kit's gap. */
export function Row({ children, className }: {
    children: any;
    className?: string;
}): any;
