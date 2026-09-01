/**
 * # runtime/render.js — the catalogue: an app declares what it is and never draws chrome
 *
 * The Preact render catalogue. It reads an app's spec and renders it through an allow-listed set of
 * component families: the shell (app bar, dock, dock fade, toast, confirm sheet), the LIST family (feed,
 * row, grid, gallery and table cards, badges, sections, segments, sort and toggle strips, search and
 * `searchFetch`, one sentinel for client windowing and server paging, a live bar chart), the CONVERTER and
 * DASHBOARD families (hero, hourly strip with a spline, days, an optional WebGPU stage), PROFILE (account,
 * install, APK, share, theme, language, permissions), the top-level DETAIL drill-down with an in-app player,
 * the FILTER sheet and chips, and the systemic screens (permissions, sign-in, APK, the desktop QR, the clean
 * screen). What it buys the farm is that sixty apps share one shell, one empty state, one skeleton, one
 * favourite star, one chrome contract — and a fix lands in all of them at once. The lesson behind most of
 * the comments in this file is the same one: `--hdr-h` and `--dock-h` are MEASURED by the element, never
 * declared, because a hand-written constant drifts past the real footprint with every gate green.
 *
 * ![The render module map: spec in, families out, the chrome around them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-render.svg)
 *
 * ## Import
 * ```js
 * import { setApp, App, isIOS, isStandalone } from "/_rt/render.js";                    // an app's page: the import map resolves /_rt/
 * import { setApp, App, isIOS, isStandalone } from "@microspec/core/runtime/render.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link setApp} — `setApp(app, views)`: binds the app context (`{ spec, S, load, toast, toggleFav, favKey, swap, … }`) and the tool-app views keyed by `tab.view`; called once by the boot before the first render.
 * - {@link App} — the app root: chrome, the current tab's view and every systemic overlay, driven by the routing atoms in `S`.
 * - {@link isIOS} — whether the page runs on an iOS device (the install flow differs: no `beforeinstallprompt`).
 * - {@link isStandalone} — whether the page runs as an installed PWA (standalone display mode, or iOS's `navigator.standalone`).
 *
 * ## In practice
 * ```js
 * // Apps never import this file: index.js's start() does, once. This is that boot, reduced to its render half.
 * import { render } from "preact";
 * import { html } from "htm/preact";
 * import { createApp } from "./store.js";
 * import { setApp, App } from "./render.js";
 *
 * const app = createApp(spec, load);                     // spec.json + the app's data.js loader
 * app.canRefresh = typeof load === "function";            // a tool app hides the dead refresh affordance
 * setApp(app, views || {});                               // tool-app views: { [tab.view]: PreactComponent }
 * render(html`<${App} />`, document.getElementById("app"));
 * ```
 * A tool view receives `{ t, tab, S, toast, undo, confirm, screen, openScreen, closeScreen }`; a `detail.view`
 * body receives `{ item, t, loc, S, toast, undo, confirm }` — the same helper set, so an interactive drill-down
 * never has to reach for a `tool` tab and hand-roll the list around it.
 *
 * ## How it fits
 * The widest import list in the runtime: `authwall`, `i18n`, `apk`, `gate`, `ui` (`SHEET_BOX`), `version`,
 * `permissions`, `translate`, `skeleton`, `enrich`, `db`, `gesture`, `weather` (`curvePath`), plus Preact,
 * htm and nanostores. Heavy leaves are lazy-imported so the bootstrap closure stays small: `account.js` and
 * `signin.js`/`auth.js` (only apps that sign a reader in), `video.js` (only apps whose detail declares
 * `play`), `hero.js` (only a tab with a `stage`), `qrcode.js` (only when the desktop QR modal opens).
 * Imported by `index.js` alone — `start()` calls `setApp` and mounts `App` — so every one of the 74 farm apps
 * runs through it and none imports it by name; the generated `sw.js` of each app precaches it.
 *
 * ## Invariants and pitfalls
 * - Chrome is measured, not declared: the app bar and the dock publish `--hdr-h`, `--dock-h` and `--dock-w`
 *   from their own `offsetHeight` through a ResizeObserver. Nothing else may write those numbers, and the
 *   dock fade is exactly `--dock-h` tall — one rem taller and it veils rave's sequencer and kalimba's keys.
 * - `S.clean` removes the app bar, the dock and the fade and sets both numbers to 0px, one-directionally:
 *   there is no cleanup restoring old values, because the remounted chrome republishes what it measures.
 * - A skeleton must take the shape the content will take (gallery grid stays 3-up, row stays a row), or the
 *   page jumps the moment data lands. Never a spinner.
 * - `sections` compose with every layout — grid, gallery, table, feed — through `GRID_FOR`; returning the flat
 *   grid regardless is what silently ate arc's shelf headings.
 * - Item `href` values from feed data go through `safeHref`: only `http(s)` survives; `javascript:` and
 *   `data:` URLs render nothing.
 * - The list windows the DOM (24 items per scroll step, 120 rows for a table) and one sentinel drives both the
 *   client window and `A.loadMore()`; `loadMore` no-ops with no cursor or a page in flight, so it may fire freely.
 * - `?tab=`, `?screen=` and `?detail=` open a tab, a sub-screen or one item's drill-down on load — for the
 *   screenshot service that cannot tap. Validated against the spec and the loaded items, never persisted.
 * - Section counts are a mono `text-muted` micro-label, not `badge-ghost`: DaisyUI's two-class rule wins on
 *   specificity and the count stayed at axe-serious contrast in dark.
 * - The active dock tab is a filled pill, not a brighter text colour: in this theme `--color-primary` and
 *   `--color-base-content` are the same ink, so the old idiom measured 1.56:1 between states.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/render.js — edit the JSDoc there, never this file.
/**
 * Binds the app context the catalogue renders from. Called once by the boot before the first render.
 * @param app the app context — { spec, S (atoms), load, toast, toggleFav, favKey, swap, … }
 * @param views tool-app custom views keyed by `tab.view`, or nothing for declarative apps
 */
export function setApp(app: any, views: any): void;
/**
 * The app root: the chrome (app bar, dock, dock fade, toast), the current tab's view and every systemic
 * overlay (detail, permissions, sign-in, APK, QR, install) driven by the routing atoms in the app context.
 * @returns the Preact tree the boot mounts into `#app`
 */
export function App(): any;
/** Whether the page runs on an iOS device (the install flow differs: no `beforeinstallprompt`). */
export function isIOS(): boolean;
/** Whether the page runs as an installed PWA (standalone display mode, or iOS's `navigator.standalone`). */
export function isStandalone(): any;
