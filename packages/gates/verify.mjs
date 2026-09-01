#!/usr/bin/env -S deno run -A
/* @ts-self-types="./verify.d.mts" */
/**
 * # verify — the deep gate: every DOM check across an app's states in one Chromium session
 *
 * Beyond the happy path, it exercises the states production actually hits — loading/skeleton, settled,
 * interactive (e2e), animated — and watches for any runtime error the whole time. Deterministic by
 * default (animations are instant); the animated pass forces them on. CI-only by design: the authoring
 * device may never run Chromium, so the local gates stop at linkedom (preflight) and this is the run
 * whose conclusion the `ci` node reads. Farm-wide must-haves — the haptic answer to a tap and PWA
 * installability — are checked here on every app rather than left to one app's e2e.
 *
 * ![The responsive matrix to scale, the checks beside it](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/verify.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/verify <appdir> [--shots] [--device s25ultra] [--settle 1500]
 * ```
 * `deno task verify apps/<id>` in this repo; verify.yml runs it once per affected app with `--shots`
 * (CHROMIUM_PATH=/usr/bin/google-chrome, a 3-minute budget per app). The app directory must carry
 * `e2e.spec.mjs` — its e2e cases are imported from there, through the consumer's local importer when
 * one is present, since a verify run from the registry may not import file:// itself.
 *
 * ## Flags and arguments
 * | Argument | Default | Effect |
 * | --- | --- | --- |
 * | `<appdir>` | `.` | the app directory, served locally for the session (a trailing slash is stripped) |
 * | `--shots` | off | write `<appdir>/states/main.png`, `tab-<id>.png` per further tab, and `light.png` |
 * | `--device <id>` | `s25ultra` | viewport from `DEVICES` — s25ultra 384×832 at dpr 3.5, desktop 1280×900; an unknown id falls back to s25ultra |
 * | `--settle <ms>` | `1500` | how long the settled state is given after navigation |
 * | `HEADFUL=1` (env) | unset | the headful debug path; needs a live Xvfb — `deno task setup` starts one |
 *
 * ## What it checks / produces
 * In order, every line printed as ✓ or ✗ with its reason:
 * 1. **loading** (`?__hold=1` freezes data-loading): no bare DaisyUI spinner in the DOM; the app is not a
 *    blank screen — chrome plus skeleton must be visible; the design checks (axe in both themes, overflow
 *    at 384px, chrome without lateral shift) pass on the skeleton itself.
 * 2. **settled**, per tab (`[data-tab]`): the design checks again, then the responsive matrix — the same
 *    tab re-measured at every breakpoint from the 320×568 phone floor to 1280×900, landscape and
 *    split-screen included, skipping any width below the app's declared `spec.minWidth`.
 * 3. **haptic**: spy on `navigator.vibrate`, dispatch a real pointerdown on the first interactive element,
 *    require the runtime to answer — a tap without feedback means the delegated listener is broken.
 * 4. **PWA**: `<link rel=manifest>` present, fetchable, with a name and an installable `display`; a
 *    service worker registers, activates, and its `ms-` cache holds `./` or `./index.html`. Registering
 *    is not working — a worker whose precache holds no document cannot open offline. Each failure is
 *    named.
 * 5. **e2e**: every case of `e2e.spec.mjs` run against the page helpers; a throw is a ✗ with its message.
 * 6. **animated** (`?__anim=1` forces decode, scramble and motion to actually run): no spinner leaked,
 *    the app is still visible after 2.6 s.
 * 7. **runtime errors**: any uncaught exception or `console.error` during the whole session — network
 *    noise (favicon, net::, CORS, 4xx/5xx) is filtered out; the first eight distinct ones are printed.
 *
 * Ends with `N passed, M failed`. Green means every state rendered, held its layout at every breakpoint,
 * answered a tap, installed, passed its own e2e and threw nothing.
 *
 * ## Exit codes
 * - `0` — no failures.
 * - `1` — at least one ✗ (the count is printed; the code is 1 however many).
 * - `2` — `HEADFUL=1` and no virtual display could be started.
 *
 * ## Where it sits
 * No 8n8 node of its own — Chromium never runs on the authoring device. verify.yml's `verify` job runs it
 * per app in the affected matrix (tools/affected.mjs, from the real import graph) after the unit job's
 * gates, uploads `<appdir>/states/` as the `shot-<app>` artifact, and the `ci` node (needs: push) reads
 * that run's conclusion. `deno task red` prints its ✗ lines from the last run in full.
 *
 * ![The push node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-push.svg)
 *
 * ## Why
 * A gate that only ever measured the happy path at 384×832 could not say otherwise: a non-installable app
 * shipped green, a registered worker cached nothing reachable so no app opened offline, and a haptic
 * function nobody called was a function nobody felt. One Chromium session over every state, every
 * breakpoint and every tab, with runtime-error surveillance the whole time, is what makes a green mean
 * something the eye would agree with.
 * @module
 */
/**
 * verify — the deep gate: every DOM check across the app's STATES in ONE Chromium session. Beyond the
 * happy path, it exercises the states production actually hits — loading/skeleton, animated, interactive —
 * and watches for any runtime error the whole time. Order: loading(skeleton) → settled(design+shots) →
 * e2e → animated. Deterministic by default (animations are instant); the animated pass forces them on.
 *
 *   deno run -A verify.mjs <appdir> [--shots] [--device s25ultra] [--settle 1500]
 *
 * Exit code = total failures (0 = green). --shots writes <appdir>/states/{main,tab-*,light}.png.
 */
import { ensureDisplayUp, serveLocal, bootBrowser, makeHelpers, gotoAndSettle, runDesignChecks, runResponsiveMatrix, DEVICES } from "./browser-lib.mjs";

const appdir = (Deno.args[0] ?? ".").replace(/\/$/, "");
const opt = (n, d) => { const i = Deno.args.indexOf("--" + n); return i >= 0 ? Deno.args[i + 1] : d; };
const wantShots = Deno.args.includes("--shots");
const dev = DEVICES[opt("device", "s25ultra")] ?? DEVICES.s25ultra;
const settle = Number(opt("settle", 1500));

// Headless (default) needs no display; only the HEADFUL debug path requires a live Xvfb.
if (Deno.env.get("HEADFUL") === "1" && !(await ensureDisplayUp())) { console.error("No virtual display and Xvfb won't start. Try:  deno task setup"); Deno.exit(2); }

// through the consumer's local importer when present — a remote (jsr) verify may not import file:// itself
const e2eSpec = (await (globalThis.__msImport ?? ((x) => import(x)))(`file://${appdir}/e2e.spec.mjs`)).default;
const srv = serveLocal(appdir);
const browser = await bootBrowser(dev);

const C = { g: "\x1b[32m", r: "\x1b[31m", d: "\x1b[2m", x: "\x1b[0m" };
let pass = 0, fail = 0;
const ok = (n, m = "") => { console.log(`  ${C.g}✓${C.x} ${n}${m ? C.d + " — " + m + C.x : ""}`); pass++; };
const no = (n, m, det) => { console.log(`  ${C.r}✗${C.x} ${n} — ${m}`); (det || []).forEach((l) => console.log(`      ${l}`)); fail++; };
const settleData = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count(".skeleton, [data-skel]")) === 0 && (await h.bodyText()).trim()) break; await h.wait(500); } };
// a bare DaisyUI spinner is banned (see /_rt/skeleton.js); count any that leaked into the live DOM
const spinnerCount = (ev) => ev(() => document.querySelectorAll(".loading-spinner,.loading-ring,.loading-dots,.loading-ball,.loading-bars,.loading-infinity").length);
const isBlank = (ev) => ev(() => (document.body.innerText || "").replace(/\s/g, "").length < 2 && document.querySelectorAll("main *, nav [data-tab]").length < 2);

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: dev.width, height: dev.height });   // TRUE 384px (Chromium clamps --window-size)
  const { h, ev } = makeHelpers(page);

  // ── runtime-error surveillance (shift-right): fail on ANY uncaught exception across the whole run. ──
  const runErrs = [];
  try {
    page.addEventListener("pageerror", (e) => runErrs.push("uncaught: " + String(e.detail?.message || e.detail || e).split("\n")[0].slice(0, 200)));
    page.addEventListener("console", (e) => { if (e.detail?.type === "error") { const tx = String(e.detail.text || ""); if (!/favicon|net::|Failed to load resource|ERR_|status of [45]|CORS|Access-Control/i.test(tx)) runErrs.push("console.error: " + tx.slice(0, 200)); } });
  } catch { /* older Astral without page events — surveillance degrades to none */ }

  console.log(`\n  verify: ${appdir}\n`);

  // ── 1) LOADING / SKELETON state (?__hold freezes data-loading) — never a spinner, never blank, and the
  //       skeleton itself must pass a11y + layout. This is the state users hit first on every cold open. ──
  await gotoAndSettle(page, srv.url + "?__hold=1", 900);
  console.log(`  ${C.d}loading state${C.x}`);
  const spL = await spinnerCount(ev);
  spL === 0 ? ok("no spinner while loading") : no("no spinner while loading", `${spL} bare spinner(s) — use a skeleton`);
  (await isBlank(ev)) ? no("app visible while loading", "blank screen — show chrome + skeleton") : ok("app visible while loading");
  // The app's own floor (spec.minWidth): the responsive matrix skips any breakpoint narrower than it, so
  // an app that states it cannot go below 320px is not held to a shape it never claimed to support.
  const appSpec = (() => { try { return JSON.parse(Deno.readTextFileSync(`${appdir}/spec.json`)); } catch { return {}; } })();
  const designOpts = { minWidth: appSpec.minWidth || 0 };
  for (const c of await runDesignChecks(ev)) c.ok ? ok(c.name + " [loading]", c.msg) : no(c.name + " [loading]", c.msg, c.detail);

  // ── 2) SETTLED state — design checks (a11y both themes · overflow@384) + responsive matrix + shots per tab. ──
  await gotoAndSettle(page, srv.url, settle);
  await settleData(h);
  if (wantShots) await Deno.mkdir(`${appdir}/states`, { recursive: true });
  const tabs = await ev(() => [...document.querySelectorAll("[data-tab]")].map((b) => b.getAttribute("data-tab")));
  const tabList = tabs.length ? tabs : [null];
  for (let ti = 0; ti < tabList.length; ti++) {
    const tb = tabList[ti];
    if (ti > 0) { await h.click(`[data-tab="${tb}"]`); await h.wait(500); await settleData(h); }
    const lbl = tabList.length > 1 && tb ? ` [${tb}]` : "";
    console.log(`  ${C.d}design${lbl}${C.x}`);
    for (const c of await runDesignChecks(ev)) c.ok ? ok(c.name + lbl, c.msg) : no(c.name + lbl, c.msg, c.detail);
    // Responsive matrix — the SAME tab re-measured at every breakpoint and aspect ratio. Per tab, not
    // once per app: a fit instrument and its scrolling profile are different layouts with different
    // failure modes, and only one of them is on screen at a time.
    console.log(`  ${C.d}responsive${lbl}${C.x}`);
    for (const c of await runResponsiveMatrix(page, ev, dev, designOpts)) c.ok ? ok(c.name + lbl, c.msg) : no(c.name + lbl, c.msg, c.detail);
    if (wantShots) await Deno.writeFile(`${appdir}/states/${ti === 0 ? "main" : "tab-" + tb}.png`, await page.screenshot());
  }
  if (tabList.length > 1) { await h.click(`[data-tab="${tabList[0]}"]`); await h.wait(300); }

  // ── Touch feedback is a farm-wide must-have, so it is checked on EVERY app, not left to one app's e2e. ──
  // hapticFor() is unit-tested, but a pure function nobody calls is a pure function nobody feels: the whole
  // feature is the delegated listener in index.js, and that wiring is exactly what a unit test cannot see.
  // So: spy on navigator.vibrate, dispatch a REAL pointerdown (h.click() calls .click(), which never fires
  // one — a tap in this harness is not a tap), and require the runtime to answer.
  const buzz = await ev(() => {
    if (!("vibrate" in navigator)) return { skip: true };
    const el = document.querySelector("nav[data-dock] button, main button:not([disabled]), main a[href]");
    if (!el) return { none: true };
    let n = 0;
    const orig = navigator.vibrate;
    try {
      navigator.vibrate = () => { n++; return true; };
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    } finally { navigator.vibrate = orig; }
    return { n };
  });
  if (buzz.skip) ok("haptic: тактильний відгук на тап", "пропущено — Vibration API немає в цьому браузері");
  else if (buzz.none) ok("haptic: тактильний відгук на тап", "немає інтерактивних елементів");
  else buzz.n > 0 ? ok("haptic: тактильний відгук на тап")
    : no("haptic: тап без відгуку", "runtime не викликав vibrate на pointerdown — делегування в index.js розірване");

  // ── PWA installability (runtime half): the manifest must link + parse with an installable display, and a
  //    service worker must actually REGISTER in a real browser. The build gate covers the static side
  //    (icons/manifest fields); this covers what only a browser can see — a dead SW means Chrome offers no
  //    "Install". Neither was ever checked, so a non-installable app shipped green (Потік/flux prompted this).
  const pwa = await ev(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return "no <link rel=manifest>";
    let mf; try { mf = await (await fetch(link.href)).json(); } catch { return "manifest not fetchable / invalid JSON"; }
    if (!mf.name && !mf.short_name) return "manifest has no name/short_name";
    if (!["standalone", "fullscreen", "minimal-ui"].includes(mf.display)) return `manifest display="${mf.display}" is not installable`;
    if (!("serviceWorker" in navigator)) return "no serviceWorker support";
    let reg = null;
    for (let i = 0; i < 20 && !reg; i++) { reg = await navigator.serviceWorker.getRegistration(); if (!reg) await new Promise((r) => setTimeout(r, 300)); }
    if (!reg) return "service worker never registered (Chrome offers no install)";
    // Registering is not the same as WORKING. The farm shipped a registered worker that cached nothing
    // reachable, so every app was "installable" and none of them opened offline. Wait for it to activate and
    // for its precache to hold the document — the one thing that makes a cold offline launch possible.
    for (let i = 0; i < 40; i++) {
      if (reg.active) {
        const mine = (await caches.keys()).find((n) => n.startsWith("ms-") && n !== "ms-cdn-v1");
        if (mine) {
          const c = await caches.open(mine);
          if (await c.match("./") || await c.match("./index.html")) return null;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return "service worker activated but its precache holds no document — the app cannot open offline";
  });
  pwa === null ? ok("PWA: манифест + service worker + офлайн-кеш → встановлюється") : no("PWA: не встановлюється як застосунок", pwa);

  if (wantShots) {
    const baseTheme = await ev(() => document.documentElement.getAttribute("data-theme") || "signal");
    await ev((th) => document.documentElement.setAttribute("data-theme", th.includes("light") ? th : th + "-light"), baseTheme);
    await h.wait(250);
    await Deno.writeFile(`${appdir}/states/light.png`, await page.screenshot());
    await ev((th) => document.documentElement.setAttribute("data-theme", th), baseTheme);
    console.log(`  ${C.g}✓${C.x} shots (per-tab + light) → ${appdir}/states/`);
  }

  // ── 3) e2e (mutates tab/locale/filter state → after the settled snapshot). ──
  console.log(`  ${C.d}e2e${C.x}`);
  for (const t of e2eSpec) {
    try { await t.run(h); ok(t.name); }
    catch (e) { no(t.name, e.message); }
  }

  // ── 4) ANIMATED state (?__anim forces the decode/scramble/pixels + motion to actually run) — verify they
  //       complete without error and the app stays functional (the settled gate takes the instant path and
  //       skips all this code). Then re-check the app is still visible and spinner-free after settling. ──
  console.log(`  ${C.d}animation${C.x}`);
  await gotoAndSettle(page, srv.url + "?__anim=1", 600);
  await h.wait(2600);                                                     // let decode + stagger complete
  const spA = await spinnerCount(ev);
  spA === 0 ? ok("animations: no spinner after settle") : no("animations: spinner leaked", `${spA}`);
  (await isBlank(ev)) ? no("animations: app still visible", "blank after animating") : ok("animations: app still visible + settled");

  // ── final: runtime-error verdict for the entire session. ──
  runErrs.length === 0 ? ok("no runtime errors (whole session)") : no("runtime errors", `${runErrs.length}`, [...new Set(runErrs)].slice(0, 8));
} finally {
  await browser.close();
  await srv.stop();
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
Deno.exit(fail ? 1 : 0);
