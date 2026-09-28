/* @ts-self-types="./render.d.ts" */
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
import { Fragment } from "preact";
import { useRef, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { authWall } from "./authwall.js";
import { A, VIEWS, Empty } from "./render-ctx.js";
import { Chart, ListView, SegmentBar, SortBar, TogglesBar } from "./list.js";
import { Profile } from "./profile.js";
import { WatchScreen, PermissionsScreen, SignInScreen, ApkScreen, DetailView, PlayerHost } from "./screens.js";
import { FilterChips, FilterSheet, InstallModal, AppBar, QrModal, DockFade, CleanExit, Dock, Toast, ConfirmSheet } from "./chrome.js";
import { ConverterView, DashboardView } from "./dash.js";
export { setApp, isIOS, isStandalone } from "./render-ctx.js";
export { Battery } from "./chrome.js";

function TabView({ tab }) {
  if (tab.type === "list") return html`<${ListView} tab=${tab} />`;
  if (tab.type === "converter") return html`<${ConverterView} tab=${tab} />`;
  if (tab.type === "dashboard") return html`<${DashboardView} tab=${tab} />`;
  if (tab.type === "profile") return html`<${Profile} tab=${tab} />`;
  if (tab.type === "tool") { const V = VIEWS[tab.view]; return V ? html`<${V} t=${A.S.t.get()} tab=${tab} S=${A.S} toast=${A.toast} undo=${A.undo} confirm=${A.confirm} screen=${A.S.screen.get()} openScreen=${(s) => A.S.screen.set(s)} closeScreen=${() => A.S.screen.set(null)} />` : Empty("lucide:wrench", `view "${tab.view}" not provided`, null); }
  return Empty("lucide:construction", `${tab.type} view — coming soon`, null);
}

/**
 * The app root: the chrome (app bar, dock, dock fade, toast), the current tab's view and every systemic
 * overlay (detail, permissions, sign-in, APK, QR, install) driven by the routing atoms in the app context.
 * @returns the Preact tree the boot mounts into `#app`
 */
export function App() {
  const cur = useStore(A.S.tab), screen = useStore(A.S.screen);
  useEffect(() => authWall.listen(() => { if (A.S.screen.get() !== "signin") A.S.screen.set("signin"); }), []);
  const tab = A.spec.tabs.find((x) => x.id === cur) || A.spec.tabs[0];
  const items = useStore(A.S.data).items;
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    let q; try { q = new URLSearchParams(location.search); } catch { return; }
    const wantTab = q.get("tab"), wantScreen = q.get("screen");
    if (wantTab && A.spec.tabs.some((x) => x.id === wantTab)) A.S.tab.set(wantTab);
    if (wantScreen) A.S.screen.set(wantScreen);
  }, []);
  const shot = useRef(false);
  useEffect(() => {
    if (shot.current || !A.spec.detail || !items?.length) return;
    let want; try { want = new URLSearchParams(location.search).get("detail"); } catch { return; }
    if (!want) return;
    shot.current = true;
    const hit = items.find((it) => String(it.id ?? "") === want || String(A.favKey(it) ?? "") === want);
    if (hit) A.S.detail.set(hit);
  }, [items]);
  const fit = !!tab.fit;
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("ms-fit", fit);
    return () => el.classList.remove("ms-fit");
  }, [fit]);
  const clean = useStore(A.S.clean);
  useEffect(() => {
    if (!clean) return;
    const s = document.documentElement.style;
    s.setProperty("--hdr-h", "0px");
    s.setProperty("--dock-h", "0px");
  }, [clean]);
  return html`<${Fragment}>
    ${clean ? null : html`<${AppBar} />`}
    ${A.spec.filters ? html`<${FilterChips} />` : null}
    ${tab.type === "list" && tab.chart ? html`<${Chart} tab=${tab} />` : null}
    ${tab.type === "list" && tab.segments ? html`<${SegmentBar} tab=${tab} />` : null}
    ${tab.type === "list" && tab.sort ? html`<${SortBar} tab=${tab} />` : null}
    ${tab.type === "list" && tab.toggles ? html`<${TogglesBar} tab=${tab} />` : null}
    <main id="view" class="px-4 pt-4 max-w-xl mx-auto flex flex-col gap-3" style=${fit ? null : "padding-bottom:calc(var(--dock-h) + 1.5rem)"}>
      <${TabView} tab=${tab} />
    </main>
    ${A.spec.detail ? html`<${DetailView} />` : null}
    <${PlayerHost} />
    ${A.spec.filters ? html`<${FilterSheet} />` : null}
    ${screen === "perms" ? html`<${PermissionsScreen} />` : null}
    ${screen === "watch" ? html`<${WatchScreen} />` : null}
    ${screen === "apk" ? html`<${ApkScreen} />` : null}
    ${screen === "signin" ? html`<${SignInScreen} />` : null}
    ${clean ? null : html`<${DockFade} />`}
    <${InstallModal} />
    <${QrModal} />
    <${ConfirmSheet} />
    ${clean ? html`<${CleanExit} />` : html`<${Dock} />`}
    <${Toast} />
  </${Fragment}>`;
}
