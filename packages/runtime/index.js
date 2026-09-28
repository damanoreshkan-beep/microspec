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
import { installUsage } from "./usage.js";
import { initTelegram, inTelegram } from "./tma.js";

installSealedFetch();

function registerWorker(app) {
  if (!("serviceWorker" in navigator)) return;
  const S = app.S;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const offer = () => S.update.set(true);
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(); });
    });
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "ms-update") offer(); });
    let asked = false;
    app.applyUpdate = () => {
      asked = true;
      if (reg.waiting) reg.waiting.postMessage("ms-skip-waiting");
      else location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!asked) return;
      asked = false;
      location.reload();
    });
  }).catch(() => {});
}

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
  app.canRefresh = typeof opts.load === "function";
  setApp(app, opts.views || {});
  const { S, load } = app;
  installTelemetry(spec.id);
  installUsage(S);
  initTelegram();
  if (inTelegram()) import("./auth.js").then((a) => a.restore().then((s) => (s ? null : a.loginTelegram())).catch(() => {})).catch(() => {});

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  const urlTheme = (() => {
    try { const q = new URLSearchParams(location.search).get("theme"); return q ? (q.includes("light") ? "signal-light" : "signal") : null; } catch { return null; }
  })();
  applyTheme(urlTheme || S.theme.get());
  S.theme.listen((t) => applyTheme(urlTheme || t));
  try { if (new URLSearchParams(location.search).get("update") === "1") S.update.set(true); } catch { }
  loadMaterials().then((list) => {
    S.materials.set(list);
    if (list.length) applyMaterial(S.material.get() || list[0].id, list);
  });
  S.material.listen((id) => applyMaterial(id, S.materials.get()));

  const applyLang = (l) => { try { document.documentElement.lang = l; } catch { } };
  applyLang(S.locale.get());
  S.locale.listen(applyLang);

  addEventListener("pointerdown", (e) => {
    const pattern = hapticFor(e.target);
    if (pattern) haptic[pattern]?.();
  }, { capture: true, passive: true });

  render(html`<${App} />`, document.getElementById("app"));
  try { clearTimeout(globalThis.__msBootT); } catch { }
  const boot = document.getElementById("boot");
  if (boot && !/[?&]__boot\b/.test(location.search)) { requestAnimationFrame(() => { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); }); }
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); });
  S.detail.listen((v) => { if (v == null && S.screen.get()) S.screen.set(null); });

  const overlays = [
    [S.clean, () => S.clean.set(false), (v) => v === true],
    [S.stack, () => S.stack.set(S.stack.get().slice(0, -1)), (v) => v],
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
    [S.qrOpen, () => S.qrOpen.set(false), (v) => v === true],
    [S.searchOpen, () => S.searchOpen.set(false), (v) => v === true],
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.player, () => S.player.set(null), (v) => v != null],
    [S.confirm, () => S.confirm.set(null), (v) => v != null],
  ];
  const depthOf = ([a, , isOpen]) => overlayDepth(isOpen(a.get()));
  const openCount = () => overlays.reduce((n, o) => n + depthOf(o), 0);
  const anyOpen = () => openCount() > 0;
  let depth = 0, fromPop = false, selfBack = 0, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const n = openCount();
    if (fromPop) { depth = n; return; }
    if (n > depth) { const d = n - depth; depth = n; for (let i = 0; i < d; i++) history.pushState({ msOverlay: 1 }, ""); }
    else if (n < depth) { const d = depth - n; depth = n; if (history.state?.msOverlay) { selfBack++; history.go(-d); } }
  });
  try {
    const q = new URLSearchParams(location.search);
    const want = q.get("screen");
    if (want) S.screen.set(want);
    if (q.get("install") && !matchMedia("(display-mode: standalone)").matches) S.installOpen.set(true);
  } catch { }

  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack--; return; }
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
    if (exitArmed) { clearTimeout(exitTimer); exitArmed = false; history.back(); return; }
    exitArmed = true;
    history.pushState({ msRoot: 1 }, "");
    app.toast("__exit__");
    exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
  });

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvent.set(e); });
  addEventListener("appinstalled", () => { S.installEvent.set(null); S.installOpen.set(false); });
  registerWorker(app);

  const hold = typeof location !== "undefined" && location.search.includes("__hold");
  if (opts.stream) {
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    if (!hold) try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else if (!hold) {
    load();
  }
}
