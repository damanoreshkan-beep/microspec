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
let missing = [];
const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, async (req) => {
  const res = await serveDir(req, { fsRoot: DIST, quiet: true, headers: ["cache-control: no-store"] });
  // Scope: BUILT FILES. /feed/* is the edge proxy nginx serves in production — this file server has no
  // backend, so its 404s here say nothing about dist (dou/hf lit up on exactly that in the dry run).
  const path = new URL(req.url).pathname;
  if (res.status >= 400 && !path.startsWith("/feed")) missing.push(`${res.status} ${path}`);
  return res;
});
const base = `http://localhost:${server.addr.port}`;
await Deno.mkdir(OUT, { recursive: true });

const NOISE = /favicon|net::|Failed to load resource|ERR_|status of [45]|CORS|Access-Control|manifest/i;
const browser = await bootBrowser(dev);
const rows = [];
let fails = 0;
try {
  for (const app of list) {
    const page = await browser.newPage();
    const errs = [];
    page.addEventListener("pageerror", (e) => errs.push("uncaught: " + String(e.detail?.message || e.detail || e).split("\n")[0].slice(0, 160)));
    page.addEventListener("console", (e) => { if (e.detail?.type === "error") { const tx = String(e.detail.text || ""); if (!NOISE.test(tx)) errs.push("console.error: " + tx.slice(0, 160)); } });
    const url = `${base}/${app}/?mock${light ? "&theme=light" : ""}`;
    let m = null, why = [];
    missing = [];
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
      if (missing.length) why.push(`same-origin ${missing.length} missing: ${[...new Set(missing)].slice(0, 4).join(", ")}`);
      await Deno.writeFile(`${OUT}/${app}${light ? "~light" : ""}.png`, await page.screenshot());
    } catch (e) {
      why.push("load failed: " + String(e?.message || e).slice(0, 160));
    } finally { await page.close().catch(() => {}); }
    const bad = why.length > 0;
    if (bad) fails++;
    rows.push({ app, ok: !bad, msR: m?.msR, radius: m?.surface?.radius, appCss: m?.appCss, why });
    console.log(`  ${bad ? "✗" : "✓"} ${app.padEnd(12)} --ms-r=${(m?.msR || "-").padEnd(8)} radius=${(m?.surface?.radius || "-").padEnd(6)} app.css=${String(m?.appCss ?? "-").padEnd(4)}${bad ? " — " + why.join(" · ") : ""}`);
  }
} finally {
  await browser.close().catch(() => {});
  ac.abort(); await server.finished.catch(() => {});
}
await Deno.writeTextFile(`${OUT}/report.json`, JSON.stringify({ device: dev, light, rows }, null, 1));
console.log(`\n  dist-eye: ${list.length - fails}/${list.length} apps render with the token system alive · shots in ${OUT}/`);
if (fails) { console.log(`  ${fails} app(s) failed — the built site must not ship`); Deno.exit(1); }
