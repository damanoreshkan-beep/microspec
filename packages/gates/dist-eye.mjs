/* @ts-self-types="./dist-eye.d.mts" */
/**
 * # dist-eye — the eye on the BUILT site
 *
 * Every other gate looks at the source. This one serves `dist/` exactly as production does — one static
 * root, apps at `/<id>/`, the runtime at `/_rt/` — opens every app in a real Chromium at the reference
 * device, measures what the build did to the token system, and keeps a PNG of each, before anything is
 * rsynced. It exists because of two days in August 2026 when the compat build's class scanner cut every
 * `[var(--…)]` token and production rendered with border-radius 0, no density ladder and no accent, while
 * every gate stayed green: none of them had ever looked at `dist/`. It fails on numbers, not impressions.
 * A gate script with no exports.
 *
 * ![The build line: apps and the runtime become one dist tree, dist-eye opens it in Chromium, rsync ships it, the live URL is probed](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/dist-eye [--dist dist] [--out dist-eye] [--apps a,b] [--light] [--jobs 4]
 * ```
 * The product runs it as `deno task dist-eye --dist dist --out dist-eye` in `deploy.yml`, right after
 * `deno task build` and before the rsync. Chromium comes from `CHROMIUM_PATH` (CI sets
 * `/usr/bin/google-chrome`; the default is `/usr/sbin/chromium`). Headless, no Xvfb.
 *
 * ## Flags and arguments
 * | flag | default | meaning |
 * | --- | --- | --- |
 * | `--dist <dir>` | `dist` | the built tree to serve; every directory except `_rt` and dot-dirs is an app |
 * | `--out <dir>` | `dist-eye` | where the PNGs and `report.json` go; created if missing |
 * | `--apps a,b` | all | restrict the run to these app ids |
 * | `--light` | off | open each page with `&theme=light`; shots are named `<app>~light.png` |
 * | `--jobs <n>` | `4` | pages opened at once in the one Chromium (1–8); 79 apps one after another took 216 s of a 305 s deploy (2026-09-03) |
 *
 * Every page is opened at `/<app>/?mock` on the S25 Ultra frame (384×832) at DPR 2 — enough for the eye,
 * and it keeps a farm of PNGs under the artifact budget. The gate waits for `load`, not for a quiet
 * network: an app that keeps a request in flight under `?mock` never goes idle.
 *
 * ## What it checks / produces
 * One line per app, `✓` or `✗`, with the measured `--ms-r`, the first kit surface's radius and the rule
 * count of `app.css`. An `✗` names every reason:
 * - `did not boot (#app empty)` — the shell rendered nothing.
 * - `--ms-r missing on :root (theme.css not applied)` — the token root is gone.
 * - `app.css has N rules (precompiled Tailwind missing/thin)` — fewer than 50 rules in the compiled sheet.
 * - `first kit surface has border-radius 0px (token classes not compiled): <class>` — a `.sf-raised`,
 *   `[data-island]`, `.card`, `.modal-box` or `.btn` exists but the radius token did not survive the build.
 * - `no kit surface found (…)` — none of those selectors matched at all.
 * - `uncaught: …` / `console.error: …` — up to three page errors, with network noise (`net::`, `ERR_`,
 *   `Failed to load resource`, CORS, favicon, manifest) filtered out.
 * - `same-origin N missing: 404 /path …` — measured at this gate's own server, not inferred from the
 *   console: a built file the page asks for and does not get is a shipping bug. `/feed/…` is excluded (an
 *   edge proxy in production, no backend here).
 * - `load failed: …` — navigation itself threw.
 *
 * Files: `<out>/<app>.png` (or `<app>~light.png`) for every app that loaded, and `<out>/report.json`
 * with the device, the theme and one row per app (`app`, `ok`, `msR`, `radius`, `appCss`, `why`). The
 * summary line reads `dist-eye: N/M apps render with the token system alive`. Green means every app
 * booted with its tokens resolved, its compiled CSS present, no page error and no missing built file.
 *
 * ## Exit codes
 * - 0 — every app in the list passed.
 * - 1 — at least one app failed: `N app(s) failed — the built site must not ship`.
 * - 2 — no apps found under `--dist` (or none matched `--apps`).
 *
 * ## Where it sits
 * No 8n8 node — it needs a built tree and Chromium, so it lives in the product's `deploy.yml` between
 * `build` and the rsync, and its `<out>/` directory is uploaded as the `dist-eye` artifact (14 days);
 * `tools/art/shots-import.mjs` turns that artifact into store screenshots. `verify` is the source-side
 * eye — the breakpoint matrix, a11y and e2e on the unbuilt pages; this gate is the last measurement
 * before the site is live.
 *
 * ![The verify matrix: the breakpoints drawn to scale, the checks beside them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/verify.svg)
 *
 * ## Why
 * `verify.mjs` runs the source with the CDN. Between 2026-08-14 and 08-16 the compat build cut every
 * token class and production shipped without its radius, density or accent, green all the way — because
 * no gate looked at `dist/`. This one does, and a gate that cannot show its work is a rumour, so it keeps
 * the shot the taste review reads next.
 * @module
 */
// dist-eye — the eye on the BUILT site. Serves dist/ exactly as production does (one static root, apps at
// /<id>/, the runtime at /_rt/), opens every app in a real Chromium at the reference device, MEASURES what
// the token system did to the page, and keeps a PNG of each — before anything is shipped.
//
// Why a separate gate: verify.mjs runs the SOURCE with the CDN. Between 2026-08-14 and 08-16 the compat
// build's class scanner cut every `[var(--…)]` token and production rendered with border-radius 0, no
// density ladder and no accent — while every gate stayed green, because none of them ever looked at dist/.
// This one does, and it fails on numbers, not impressions:
//   • the page booted (#app has children, no uncaught error, no console.error outside network noise)
//   • the token system is alive: --ms-r resolves on :root AND the first kit surface (.sf-raised) has a
//     computed border-radius > 0 AND the precompiled app.css is loaded with real rules
//   • no same-origin request 4xx/5xx while it loads (measured at this gate's own server — a built file the
//     page asks for and does not get is a shipping bug, whatever the console says)
//   • the shot exists (the taste review reads it next; a gate that cannot show its work is a rumour)
//
//   deno run -A packages/gates/dist-eye.mjs [--dist dist] [--out dist-eye] [--apps a,b] [--light]
//
// Chromium: CHROMIUM_PATH (CI: /usr/bin/google-chrome). Prints one line per app and a summary; exit 1 on
// any failure. Deno, no Xvfb (headless).
import { serveDir } from "jsr:@std/http@1/file-server";
import { bootBrowser, DEVICES } from "./browser-lib.mjs";

const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DIST = flag("--dist", "dist");
const OUT = flag("--out", "dist-eye");
const only = (flag("--apps", "") || "").split(",").filter(Boolean);
const light = args.includes("--light");
const dev = { ...DEVICES.s25ultra, dpr: 2 };   // 2× is plenty for the eye and keeps 71 PNGs under the artifact budget

const apps = [];
for await (const e of Deno.readDir(DIST)) if (e.isDirectory && e.name !== "_rt" && !e.name.startsWith(".")) apps.push(e.name);
apps.sort();
const list = only.length ? apps.filter((a) => only.includes(a)) : apps;
if (!list.length) { console.error("dist-eye: no apps found under " + DIST); Deno.exit(2); }

const ac = new AbortController();
// Every same-origin request the page makes comes through THIS server, so a missing built file is measured
// here — status + path, exact — instead of being inferred from a console line. The console filter below
// deliberately drops "Failed to load resource" (third-party noise under ?mock), which is precisely how a
// 404 for the runtime's world-110m.json (bundled path drift) shipped to every deployed globe unseen.
// Missing built files, keyed by the FIRST path segment — the app id (`/rukh/assets/x.webp`) or `_rt` — so
// that pages opened in parallel attribute a 404 to the app that asked for it; a runtime miss is everyone's.
const missingBy = new Map();
const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, async (req) => {
  const res = await serveDir(req, { fsRoot: DIST, quiet: true, headers: ["cache-control: no-store"] });
  // Scope: BUILT FILES. /feed/* is the edge proxy nginx serves in production — this file server has no
  // backend, so its 404s here say nothing about dist (dou/hf lit up on exactly that in the dry run).
  const path = new URL(req.url).pathname;
  if (res.status >= 400 && !path.startsWith("/feed")) { const seg = path.split("/")[1] || ""; if (!missingBy.has(seg)) missingBy.set(seg, []); missingBy.get(seg).push(`${res.status} ${path}`); }
  return res;
});
const JOBS = Math.max(1, Math.min(8, Number(flag("--jobs", "4")) || 4));
const base = `http://localhost:${server.addr.port}`;
await Deno.mkdir(OUT, { recursive: true });

const NOISE = /favicon|net::|Failed to load resource|ERR_|status of [45]|CORS|Access-Control|manifest/i;
const browser = await bootBrowser(dev);
const rows = [];
let fails = 0;
// JOBS pages at once in the ONE Chromium (measured 2026-09-03: 79 apps one after another took 216 s of a
// 305 s deploy — the pages are static and the machine idles between loads). Each worker takes the next app
// off the list; rows are reported in list order at the end so the log reads the same as before.
const byApp = new Map();
async function runOne(app) {
    const page = await browser.newPage();
    const errs = [];
    page.addEventListener("pageerror", (e) => errs.push("uncaught: " + String(e.detail?.message || e.detail || e).split("\n")[0].slice(0, 160)));
    page.addEventListener("console", (e) => { if (e.detail?.type === "error") { const tx = String(e.detail.text || ""); if (!NOISE.test(tx)) errs.push("console.error: " + tx.slice(0, 160)); } });
    const url = `${base}/${app}/?mock${light ? "&theme=light" : ""}`;
    let m = null, why = [];
    missingBy.delete(app);
    try {
      await page.setViewportSize({ width: dev.width, height: dev.height });
      // "load", not networkidle2: an app that keeps a request in flight under ?mock (hf polls its Spaces) never
      // goes idle and Astral gives up after 5 retries. The token measurement needs the shell, not a quiet network.
      await page.goto(url, { waitUntil: "load" });
      await new Promise((r) => setTimeout(r, 2000));
      m = await page.evaluate(() => {
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const surf = document.querySelector(".sf-raised, [data-island], .card, .modal-box, .btn");
        const sheets = [...document.styleSheets].map((s) => { let n = 0; try { n = s.cssRules.length; } catch { n = -1; } return { href: (s.href || "").split("/").pop(), rules: n }; });
        return {
          booted: !!document.querySelector("#app")?.children.length,
          msR: cs(document.documentElement).getPropertyValue("--ms-r").trim(),
          msCtl: cs(document.documentElement).getPropertyValue("--ms-ctl").trim(),
          surface: surf ? { cls: surf.className.toString().slice(0, 60), radius: cs(surf).borderRadius } : null,
          appCss: sheets.find((s) => s.href === "app.css")?.rules ?? 0,
          themeCss: sheets.find((s) => s.href === "theme.css")?.rules ?? 0,
        };
      });
      const px = parseFloat(m.surface?.radius || "0") || 0;
      if (!m.booted) why.push("did not boot (#app empty)");
      if (!m.msR) why.push("--ms-r missing on :root (theme.css not applied)");
      if (m.appCss < 50) why.push(`app.css has ${m.appCss} rules (precompiled Tailwind missing/thin)`);
      if (m.surface && !(px > 0)) why.push(`first kit surface has border-radius ${m.surface.radius} (token classes not compiled): ${m.surface.cls}`);
      if (!m.surface) why.push("no kit surface found (.sf-raised/[data-island]/.card/.modal-box/.btn)");
      if (errs.length) why.push(...errs.slice(0, 3));
      const missing = [...(missingBy.get(app) || []), ...(missingBy.get("_rt") || [])];
      if (missing.length) why.push(`same-origin ${missing.length} missing: ${[...new Set(missing)].slice(0, 4).join(", ")}`);
      await Deno.writeFile(`${OUT}/${app}${light ? "~light" : ""}.png`, await page.screenshot());
    } catch (e) {
      why.push("load failed: " + String(e?.message || e).slice(0, 160));
    } finally { await page.close().catch(() => {}); }
    const bad = why.length > 0;
    if (bad) fails++;
    byApp.set(app, { app, ok: !bad, msR: m?.msR, radius: m?.surface?.radius, appCss: m?.appCss, why });
}
try {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, list.length) }, async () => { while (next < list.length) await runOne(list[next++]); }));
  for (const app of list) {
    const r = byApp.get(app) || { app, ok: false, why: ["not run"] };
    rows.push(r);
    console.log(`  ${r.ok ? "✓" : "✗"} ${app.padEnd(12)} --ms-r=${(r.msR || "-").padEnd(8)} radius=${(r.radius || "-").padEnd(6)} app.css=${String(r.appCss ?? "-").padEnd(4)}${r.ok ? "" : " — " + r.why.join(" · ")}`);
  }
} finally {
  await browser.close().catch(() => {});
  ac.abort(); await server.finished.catch(() => {});
}
await Deno.writeTextFile(`${OUT}/report.json`, JSON.stringify({ device: dev, light, rows }, null, 1));
console.log(`\n  dist-eye: ${list.length - fails}/${list.length} apps render with the token system alive · shots in ${OUT}/`);
if (fails) { console.log(`  ${fails} app(s) failed — the built site must not ship`); Deno.exit(1); }
