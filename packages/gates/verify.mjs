#!/usr/bin/env -S deno run -A
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
import { ensureDisplayUp, serveLocal, bootBrowser, makeHelpers, gotoAndSettle, runDesignChecks, DEVICES } from "./browser-lib.mjs";

const appdir = (Deno.args[0] ?? ".").replace(/\/$/, "");
const opt = (n, d) => { const i = Deno.args.indexOf("--" + n); return i >= 0 ? Deno.args[i + 1] : d; };
const wantShots = Deno.args.includes("--shots");
const dev = DEVICES[opt("device", "s25ultra")] ?? DEVICES.s25ultra;
const settle = Number(opt("settle", 1500));

if (!(await ensureDisplayUp())) { console.error("No virtual display and Xvfb won't start. Try:  deno task setup"); Deno.exit(2); }

const e2eSpec = (await import(`file://${appdir}/e2e.spec.mjs`)).default;
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
  for (const c of await runDesignChecks(ev)) c.ok ? ok(c.name + " [loading]", c.msg) : no(c.name + " [loading]", c.msg, c.detail);

  // ── 2) SETTLED state — design checks (a11y both themes · overflow@384 · glance@200) + shots on EVERY tab. ──
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
    if (wantShots) await Deno.writeFile(`${appdir}/states/${ti === 0 ? "main" : "tab-" + tb}.png`, await page.screenshot());
  }
  if (tabList.length > 1) { await h.click(`[data-tab="${tabList[0]}"]`); await h.wait(300); }
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
