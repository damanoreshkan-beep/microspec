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

  console.log(`  ${C.d}design${C.x}`);
  for (const c of await runDesignChecks(ev)) c.ok ? ok(c.name, c.msg) : no(c.name, c.msg, c.detail);

  if (wantShots) {
    await Deno.mkdir(`${appdir}/states`, { recursive: true });
    await Deno.writeFile(`${appdir}/states/main.png`, await page.screenshot());
    const tabs = await ev(() => [...document.querySelectorAll("[data-tab]")].map((b) => b.getAttribute("data-tab")));
    if (tabs.length > 1) { await h.click(`[data-tab="${tabs[tabs.length - 1]}"]`); await h.wait(500); await Deno.writeFile(`${appdir}/states/last.png`, await page.screenshot()); await h.click(`[data-tab="${tabs[0]}"]`); await h.wait(300); }
    // light-theme shot — the gate otherwise only ever reviews the dark theme, so light-mode defects (baked
    // colours, dark-only shadows) ship unseen. Diagnostic (never fails); feeds the human design critique.
    const baseTheme = await ev(() => document.documentElement.getAttribute("data-theme") || "signal");
    await ev((th) => document.documentElement.setAttribute("data-theme", th.includes("light") ? th : th + "-light"), baseTheme);
    await h.wait(250);
    await Deno.writeFile(`${appdir}/states/light.png`, await page.screenshot());
    await ev((th) => document.documentElement.setAttribute("data-theme", th), baseTheme);
    console.log(`  ${C.g}✓${C.x} shots (main + light) → ${appdir}/states/`);
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
