#!/usr/bin/env -S deno run -A
/**
 * verify — the fast path: ALL three DOM gates (e2e + design checks + optional shots) in ONE
 * Chromium session with a warm cache. Replaces running e2e → check → shot as 3 cold boots.
 *
 *   deno task -c <harness>/deno.json verify <appdir> [--shots] [--device s25ultra] [--settle 1500]
 *
 * Order matters: settle+poll → design checks + shots on a CLEAN main view → e2e last
 * (e2e mutates tab/locale/filter state, so it must not precede the design snapshot).
 * Exit code = total failures (0 = green). --shots writes <appdir>/states/{main,last}.png.
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

try {
  const page = await browser.newPage();
  const { h, ev } = makeHelpers(page);
  console.log(`\n  verify: ${appdir}\n`);
  await gotoAndSettle(page, srv.url, settle);
  // Wait until DATA has settled, not just until the DOM mounted: skeletons clear on load OR error,
  // so "no .skeleton + has text" is a generic, family-agnostic "ready" signal. Covers slow multi-fetch
  // apps (e.g. art = 28 object fetches) that render skeleton .card immediately — cold-cache safe.
  for (let i = 0; i < 30; i++) { if ((await h.count(".skeleton")) === 0 && (await h.bodyText()).trim()) break; await h.wait(500); }

  if (wantShots) await Deno.mkdir(`${appdir}/states`, { recursive: true });
  const tabs = await ev(() => [...document.querySelectorAll("[data-tab]")].map((b) => b.getAttribute("data-tab")));
  const tabList = tabs.length ? tabs : [null];

  // design checks (a11y both themes · overflow@384 · glance@200) + shots on EVERY tab — a secondary view
  // (e.g. a matrix) used to ship un-gated because only the default tab was ever reviewed.
  for (let ti = 0; ti < tabList.length; ti++) {
    const tb = tabList[ti];
    if (ti > 0) {
      await h.click(`[data-tab="${tb}"]`); await h.wait(500);
      for (let i = 0; i < 20; i++) { if ((await h.count(".skeleton")) === 0 && (await h.bodyText()).trim()) break; await h.wait(300); }
    }
    const lbl = tabList.length > 1 && tb ? ` [${tb}]` : "";
    console.log(`  ${C.d}design${lbl}${C.x}`);
    for (const c of await runDesignChecks(ev)) c.ok ? ok(c.name + lbl, c.msg) : no(c.name + lbl, c.msg, c.detail);
    if (wantShots) await Deno.writeFile(`${appdir}/states/${ti === 0 ? "main" : "tab-" + tb}.png`, await page.screenshot());
  }
  if (tabList.length > 1) { await h.click(`[data-tab="${tabList[0]}"]`); await h.wait(300); }

  if (wantShots) {
    // one light-theme shot of the default tab for the human critique (per-tab LIGHT contrast is already
    // gated inside runDesignChecks above); flip data-theme, shoot, restore.
    const baseTheme = await ev(() => document.documentElement.getAttribute("data-theme") || "signal");
    await ev((th) => document.documentElement.setAttribute("data-theme", th.includes("light") ? th : th + "-light"), baseTheme);
    await h.wait(250);
    await Deno.writeFile(`${appdir}/states/light.png`, await page.screenshot());
    await ev((th) => document.documentElement.setAttribute("data-theme", th), baseTheme);
    console.log(`  ${C.g}✓${C.x} shots (per-tab + light) → ${appdir}/states/`);
  }

  console.log(`  ${C.d}e2e${C.x}`);
  for (const t of e2eSpec) {
    try { await t.run(h); ok(t.name); }
    catch (e) { no(t.name, e.message); }
  }
} finally {
  await browser.close();
  await srv.stop();
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
Deno.exit(fail ? 1 : 0);
