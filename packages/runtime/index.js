/* @ts-self-types="./index.d.ts" */
/**
 * # @microspec/core — the appless core of DreamStudio
 *
 * ![The portal: a ring of woven light, the four parts of the core beside it](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/hero.svg)
 *
 * A micro-PWA is a `spec.json` plus a `data.js` adapter (and, for an instrument, a view) against a
 * VERIFIED, zero-build runtime. This package is that runtime and everything that verifies it: the systemic
 * modules an app's page imports as `/_rt/<name>.js`, the spec schema, the gates (Deno first, then a real
 * Chromium with axe), the generators, and the tools that run all of it as one pipeline registry (8n8).
 * It carries NO apps — the product, DreamStudio, does, and pins this package.
 *
 * ## Two channels, one version
 *
 * ```json
 * { "imports": { "@microspec/core": "jsr:@microspec/core@<v>", "@microspec/core/": "jsr:@microspec/core@<v>/" } }
 * ```
 * ```json
 * { "dependencies": { "@microspec/core": "npm:@jsr/microspec__core@<v>" } }
 * ```
 *
 * EXECUTION rides the `jsr:` pin — tools and gates run from the registry
 * (`deno run -A jsr:@microspec/core@<v>/8n8 gates`). FILES ride the npm-compat tarball — `deno install`
 * materialises the runtime (js, css, sprites) under node_modules, which the page server and the build read.
 * Bump both, then `deno task install` and `deno task rtmap`. The laws of the three realms a tree runs in
 * (a checkout, the registry, the browser's import map) are on the `rtmap` and `preflight` pages.
 *
 * ## What is in the box
 *
 * - **runtime/** — the systemic modules: the render catalogue (`runtime/render.js`), the UI kit
 *   (`runtime/ui.js`: Sheet · Segmented · Island · Panel · Slider · Transport), the store and routing
 *   (`runtime/store.js`, `runtime/overlay.js`), i18n, the gate fixture switch (`runtime/gate.js`), audio and
 *   DSP (`audio`, `spectrum`, `groove`, `melody`), sensors and geo (`sensors`, `geofix`, `geomag`, `globe`,
 *   `orbit`), the Android shell bridge (`shell`, `shell-actions`, `apk`), identity and the sealed transport
 *   (`auth`, `account`, `sealed`, `sealedfetch`), the service-worker core, and the theme (`theme.css`).
 * - **schema** — `spec.schema.json` and its validator (`schema`): the contract, machine-checked.
 * - **gates** — `preflight` (Deno, no browser), `verify` (Chromium + axe at every breakpoint, per tab),
 *   `dist-eye` (the BUILT site in a real browser), `caps` (declared vs. used capabilities).
 * - **gen** — `scaffold` (spec → a runnable app), `authorless` (recipe → a complete list app, no LLM).
 * - **tools** — `8n8` (the registry and runner), `affected`, `build`, `sw`, `counts`, `readme`, `manifest`,
 *   `rtmap`, `relimports`, `noundef`, `kit`, `shell`, `graph`, `demo`, `dts`.
 *
 * ## The loop
 *
 * `deno task gates` runs the deterministic half of the registry — no network, no Chromium, about twenty
 * seconds — and is the floor before every push. CI runs `verify` for every affected app in a real browser,
 * the deploy builds and judges the built site with `dist-eye`, and a red main never deploys. Every gate
 * names its failing element: a red says WHY, so one CI round returns the whole work list.
 *
 * ## start()
 *
 * An app's page imports its `spec.json` and `data.js` and calls {@link start}: it validates the spec, builds
 * the store, wires theme, locale and haptics, installs the sealed fetch, registers the cache-first service
 * worker and owns the Back-button routing invariant — one history entry per open overlay, double-Back to
 * exit at the root. It is this module's only export.
 * @module
 */
// microspec runtime — entry. The app's index.html imports its spec.json + data.js and calls start().
import { render } from "preact";
import { html } from "htm/preact";
import { validateSpec } from "./validate.js";
import { createApp } from "./store.js";
import { overlayDepth } from "./overlay.js";
import { setApp, App } from "./render.js";
import { haptic, hapticFor } from "./sensors.js";
import { installSealedFetch } from "./sealedfetch.js";
import { gate } from "./gate.js";
import { loadMaterials, applyMaterial } from "./material.js";
import { installTelemetry } from "./telemetry.js";

// Wrap fetch before any app code runs, so every call to our backend travels as a sealed envelope without a
// single app knowing. Apps keep doing plain `fetch(VPS_PROXY + …)`; see sealedfetch.js for what it does not
// intercept and for the honest limit on what pinning a key in delivered JS can achieve.
installSealedFetch();

// The service worker (sw-core.js) is cache-first, so a fresh deploy lands on the NEXT launch rather than
// mid-session. That trade buys an app that opens instantly offline and on a weak link — but the freshness
// half still has to be honest, so when a new version is ready we say so and offer the restart. We never take
// it: skipWaiting behind the user's back swaps the caches under running code.
// `updateViaCache: "none"` makes the browser re-check sw.js AND the imported core past its own HTTP cache,
// so a deploy is noticed on the next launch instead of up to GitHub Pages' max-age later.
function registerWorker(app) {
  if (!("serviceWorker" in navigator)) return;
  const S = app.S;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const offer = () => S.update.set(true);
    // A worker already parked in `waiting` means an update installed during an earlier visit.
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      // `controller` guards the first-ever install, which is not an "update" and must not nag.
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(); });
    });
    // The worker also tells us when a background revalidation found a changed shell file.
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "ms-update") offer(); });
    let asked = false;
    app.applyUpdate = () => {
      asked = true;
      if (reg.waiting) reg.waiting.postMessage("ms-skip-waiting");   // → controllerchange → reload
      else location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!asked) return;   // a claim() we didn't ask for must never yank the page out from under the user
      asked = false;
      location.reload();
    });
  }).catch(() => {});
}

// start(spec, load) — data app; OR start(spec, { load?, views? }) — tool app with custom views.
/**
 * Boot the app: validate the spec, create the store, mount the UI and start loading (or streaming) data.
 * @param spec the app's spec.json object
 * @param arg2 a `load` function (data app) or `{ load?, views?, stream? }` (tool / stream app)
 * @returns nothing; throws when the spec is invalid so a broken app never starts half-way
 */
export function start(spec, arg2) {
  try { validateSpec(spec); }
  catch (e) { console.error("%c⛔ Invalid spec.json — app not started\n%c" + e.message, "font-weight:bold;color:#f87171", "color:#fca5a5"); throw e; }

  const opts = typeof arg2 === "function" ? { load: arg2 } : (arg2 || {});
  const app = createApp(spec, opts.load || (async () => ({ items: [], meta: {} })));
  // Only data apps pass a real load — for tool/stream apps the AppBar refresh would be a dead affordance
  // (it calls the no-op load and updates nothing), so it's hidden there. See the taste-gate finding.
  app.canRefresh = typeof opts.load === "function";
  setApp(app, opts.views || {});
  const { S, load } = app;
  installTelemetry(spec.id);   // the farm's own Sentry: page errors + app reports → /feed/log (never under the gate)

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  // `?theme=light` — a URL override, and the reason it exists is the taste gate rather than the product.
  // Half of every design review is "and now look at it in the other theme", but the only thing that could
  // produce a light-theme still was verify.mjs --shots, i.e. a local Chromium — which this project may
  // never run (proot takes the terminal down with it). So the rule was unenforceable by the person meant
  // to enforce it. One query param makes the screenshot service able to shoot both themes.
  // It does NOT persist: nothing writes S.theme, so a shared link cannot silently change someone's setting.
  const urlTheme = (() => {
    try { const q = new URLSearchParams(location.search).get("theme"); return q ? (q.includes("light") ? "signal-light" : "signal") : null; } catch { return null; }
  })();
  applyTheme(urlTheme || S.theme.get());
  S.theme.listen((t) => applyTheme(urlTheme || t));
  // `?update=1` — the same reason: the update card only exists when a worker has found a newer build, which
  // no screenshot can arrange. The flag raises the offer without a worker so the eye can judge the card.
  // Nothing is applied by it: the card's button still goes through applyUpdate, which needs a real worker.
  try { if (new URLSearchParams(location.search).get("update") === "1") S.update.set(true); } catch { /* no URL */ }
  // The MATERIAL — a product's theme modules (material.js). The registry decides whether a picker exists:
  // no /_rt/themes.json (the core's own demo, a product with one look) → an empty list and no row.
  loadMaterials().then((list) => {
    S.materials.set(list);
    if (list.length) applyMaterial(S.material.get() || list[0].id, list);
  });
  S.material.listen((id) => applyMaterial(id, S.materials.get()));
  // The DreamStudio tilt engine: device tilt moves the light on the portal's rim (header hairline, dock
  // strand). Event-driven, zero rAF at rest, never prompts for permission, off under reduced-motion and
  // under the gate — a page with no sensor is simply statically lit. docs/research/dreamstudio-style.md.

  // ONE farm accent — the noir-neon. The farm used to give each app its own hue (spec.accent, written here);
  // the design now speaks a SINGLE accent across every app, so the per-app override is gone and --app-accent
  // stays the literal declared once in theme.css. spec.accent lives on only as the icon generator's input.
  // It is a MARK colour (dots, rings, fills, glow); the kit never puts text or text-bearing backgrounds on it.

  // <html lang> follows the UI locale. Every app's index.html ships lang="uk" hardcoded, so switching to
  // English left the document still declaring Ukrainian — a screen reader then pronounces English text
  // with Ukrainian phonemes, and it is the correct source of truth for anything that needs the locale
  // without a prop (the UI kit's own chrome reads it).
  const applyLang = (l) => { try { document.documentElement.lang = l; } catch { /* */ } };
  applyLang(S.locale.get());
  S.locale.listen(applyLang);

  // Touch feedback, for the whole farm, from one place. These are apps, not pages: a tap that answers
  // is most of what separates the two, and a runtime that leaves it to each view ships a dock that
  // buzzes next to buttons that don't. `pointerdown`, not click — the answer has to land under the
  // finger, not after the handler. Passive + capture so it can never delay or swallow a gesture, and it
  // reads the element rather than the app's intent, so a control added tomorrow is already covered.
  // (navigator.vibrate is Android/Chrome; iOS Safari has no Vibration API at all and stays silent.)
  addEventListener("pointerdown", (e) => {
    const pattern = hapticFor(e.target);
    if (pattern) haptic[pattern]?.();
  }, { capture: true, passive: true });

  render(html`<${App} />`, document.getElementById("app"));
  // Dissolve the HTML instant app-shell (#boot) now the live app is painted underneath it — a crossfade from
  // the wordmark/loading-line shell to the real chrome in the same places, so first load never flashes blank.
  const boot = document.getElementById("boot");
  if (boot && !/[?&]__boot\b/.test(location.search)) { requestAnimationFrame(() => { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); }); } // ?__boot freezes the shell for review/gates
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); }); // leaving a tab closes its sub-screen
  S.detail.listen((v) => { if (v == null && S.screen.get()) S.screen.set(null); });               // closing a drill-down closes the sheet its body opened

  // Back-button routing invariant: hardware/browser Back closes an open overlay (detail, sheet,
  // install modal, tool sub-screen) instead of exiting the PWA. Each open state = one history entry;
  // closing via UI consumes it with history.back() so history stays balanced. Tabs are NOT routed.
  // Ordered BOTTOM → TOP: overlays stack, and Back must close only the top one. The player opens over a
  // detail, so a flat "Back closes everything" would drop the viewer from the film all the way back to the
  // list, losing the item they were reading — one history entry per open layer is what makes Back mean
  // "the previous screen" rather than "the beginning".
  // BOTTOM-most on purpose: S.stack is a drill-down INSIDE a tab (a dive, a drilled feed), and any sheet or
  // detail opened while you're down there was opened later, so it must close before the drill-down unwinds.
  const overlays = [
    // BOTTOM-most of all: clean screen is a property of the surface you are looking at, not something opened
    // on top of it — so a dive taken while the chrome is hidden unwinds first, and only the last Back gives
    // the dock back. It is here at all because hiding the dock removes the app's navigation: without a
    // history entry, the Back that should restore the chrome would leave the app instead.
    [S.clean, () => S.clean.set(false), (v) => v === true],
    [S.stack, () => S.stack.set(S.stack.get().slice(0, -1)), (v) => v],   // an array: one history entry PER level
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
    [S.qrOpen, () => S.qrOpen.set(false), (v) => v === true],
    // detail BELOW screen (since 2026-08-17): a detail BODY (`detail.view`) may open a sheet on S.screen —
    // persona's conversation history — and Back must close that sheet before the drill-down under it.
    // Nothing opens a detail from inside a screen (checked across apps/), so the other order had no client.
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.player, () => S.player.set(null), (v) => v != null],
    [S.confirm, () => S.confirm.set(null), (v) => v != null],   // danger-confirm sheet — stacks on top, Back cancels
  ];
  // Depth, not a boolean count: every overlay is worth 1 entry except a stack overlay, worth its length.
  const depthOf = ([a, , isOpen]) => overlayDepth(isOpen(a.get()));
  const openCount = () => overlays.reduce((n, o) => n + depthOf(o), 0);
  const anyOpen = () => openCount() > 0;
  // selfBack COUNTS our own balancing jumps, it is not a flag: two overlays can close in one tick (a tool
  // that resets a drill-down stack AND closes its sheet), that is two history.go() calls, two popstates —
  // and a boolean would swallow only the first, leaving the second to be read as a user Back at the root.
  let depth = 0, fromPop = false, selfBack = 0, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const n = openCount();
    if (fromPop) { depth = n; return; }                       // Back already consumed the entry — don't balance it
    if (n > depth) { const d = n - depth; depth = n; for (let i = 0; i < d; i++) history.pushState({ msOverlay: 1 }, ""); }  // a stack can grow by more than one
    else if (n < depth) { const d = depth - n; depth = n; if (history.state?.msOverlay) { selfBack++; history.go(-d); } } // closing via UI balances history
  });
  // A sub-screen is ADDRESSABLE: ?screen=perms opens it on load. A screenshot service cannot tap, so
  // until an overlay could be reached from the URL the eye could only ever review a landing page —
  // exactly the gap ?detail= closed for drill-downs. Set after the listeners are wired, so the history
  // entry is pushed by the same path a tap takes and Back stays balanced.
  try {
    const q = new URLSearchParams(location.search);
    const want = q.get("screen");
    if (want) S.screen.set(want);
    // ?install=1 — the store's "Install" button. Apps are sibling ORIGIN-SCOPES and no page can prompt an
    // install for another scope, so the store opens the app with this flag and the app raises its own
    // install sheet on arrival (the same history-backed overlay the profile row opens).
    if (q.get("install") && !matchMedia("(display-mode: standalone)").matches) S.installOpen.set(true);
  } catch { /* no URL access — nothing to open */ }

  // Double-Back-to-exit at the app ROOT (TikTok-style). A persistent guard entry makes the first hardware/
  // browser Back at root catchable: we cancel it and warn, then allow a second Back within ~2s to leave.
  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack--; return; }                                       // our own balancing back()
    // Back closes the TOP-most overlay only — the player returns you to the detail you opened it from.
    if (anyOpen()) {
      for (let i = overlays.length - 1; i >= 0; i--) {
        const [, close] = overlays[i];
        if (!depthOf(overlays[i])) continue;
        fromPop = true; try { close(); } finally { fromPop = false; }
        depth = openCount();
        break;
      }
      return;
    }
    if (exitArmed) { clearTimeout(exitTimer); exitArmed = false; history.back(); return; } // 2nd Back → actually leave
    exitArmed = true;
    history.pushState({ msRoot: 1 }, "");                                              // re-arm the guard → cancel this Back
    app.toast("__exit__");
    exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
  });

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvent.set(e); });
  addEventListener("appinstalled", () => { S.installEvent.set(null); S.installOpen.set(false); });
  registerWorker(app);

  // Test hook (gate only): ?__hold freezes the app in its LOADING state so the skeleton gate can inspect it.
  const hold = typeof location !== "undefined" && location.search.includes("__hold");
  if (opts.stream) {
    // Live data source (WebSocket/SSE/…): the app opens its own connection and pushes the current items;
    // the list family renders them with its search / filter / sort. The stream owns its reconnect logic.
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    if (!hold) try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else if (!hold) {
    load();
  }
}
