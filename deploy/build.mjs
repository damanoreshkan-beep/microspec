// microspec — assemble the farm into a static site (served from our VPS at https://dreamstudio.mooo.com/; GitHub Pages until 2026-08-16). No backend: apps use the
// direct-first CORS chain (feed.js). Output: dist/_rt (shared runtime), dist/<app>/ per app, and the
// `home` store app assembled at the site ROOT (dist/index.html) as the launcher. Absolute `/_rt/`
// imports become relative `../_rt/` (or `./_rt/` at root) so the site works at any base path.
//   deno run -A deploy/build.mjs

import { generateAppIcons } from "./icons.mjs";
import { buildManifest } from "./manifest.mjs";
import { buildAppCompat } from "./build-app.mjs";

const OUT = "dist";
const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

// ── PWA installability gate ─────────────────────────────────────────────────────────────────────────────
// Nothing else in the farm verifies that an app can actually be INSTALLED — the Chromium verify gate checks
// a11y / overflow / e2e / runtime errors, but never the manifest, icons or service worker. So a
// non-installable app shipped green (books, with zero icons; and any app whose manifest drifts). This asserts
// the real criteria Chrome uses to offer "Install", against the BUILT output (built manifest + generated
// icons live here, not in the source the verify gate serves) — fail-loud, per app, on every build.
const iconArea = (s) => Math.max(0, ...String(s || "").split(/\s+/).map((x) => parseInt(x, 10) || 0));
async function assertInstallable(outDir, id) {
  let mf;
  try { mf = JSON.parse(await Deno.readTextFile(`${outDir}/manifest.json`)); }
  catch { throw new Error(`${id}: manifest.json missing or invalid JSON — not installable`); }
  const missing = [];
  if (!mf.name && !mf.short_name) missing.push("name/short_name");
  if (!mf.start_url) missing.push("start_url");
  if (!["standalone", "fullscreen", "minimal-ui"].includes(mf.display)) missing.push(`display (got "${mf.display}")`);
  const pngs = (mf.icons || []).filter((i) => (i.type || "").includes("png") && (!i.purpose || i.purpose.split(/\s+/).includes("any")));
  if (!pngs.some((i) => iconArea(i.sizes) >= 192)) missing.push("a ≥192px png icon (purpose any)");
  if (!pngs.some((i) => iconArea(i.sizes) >= 512)) missing.push("a ≥512px png icon (purpose any)");
  if (missing.length) throw new Error(`${id}: manifest is not installable — missing ${missing.join(", ")}`);
  // every icon the manifest points at must EXIST in the build and (for png) be a real PNG of the stated size —
  // a 404 or wrong-size icon makes Chrome silently refuse the install.
  for (const i of mf.icons || []) {
    const p = `${outDir}/${i.src}`;
    if (!(await has(p))) throw new Error(`${id}: manifest references "${i.src}" but it is not in the build — it would 404 and block install`);
    if ((i.type || "").includes("png")) {
      const b = await Deno.readFile(p);
      if (!(b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)) throw new Error(`${id}: "${i.src}" is not a valid PNG`);
      const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
      const want = iconArea(i.sizes);
      if (want && (w !== want || h !== want)) throw new Error(`${id}: "${i.src}" is ${w}×${h} but the manifest declares ${want}×${want}`);
    }
  }
  // Chrome will not offer install without a service worker that has a fetch handler, and the page must link
  // the manifest.
  // The worker is a generated stub (deploy/sw.mjs) that importScripts the shared core, so the fetch handler
  // Chrome requires lives one hop away — follow it, and fail if the hop is broken. A stub pointing at a
  // missing core would install, serve nothing, and quietly un-installable every app in the farm at once.
  const sw = await Deno.readTextFile(`${outDir}/sw.js`).catch(() => "");
  if (!sw) throw new Error(`${id}: sw.js missing — not installable`);
  let swBody = sw;
  const imported = /importScripts\(\s*["']([^"']+)["']\s*\)/.exec(sw);
  if (imported) {
    const core = `${outDir}/${imported[1]}`;
    swBody = await Deno.readTextFile(core).catch(() => "");
    if (!swBody) throw new Error(`${id}: sw.js importScripts("${imported[1]}") but that file is not in the build`);
  }
  if (!/addEventListener\(\s*["']fetch["']/.test(swBody)) throw new Error(`${id}: sw.js is missing a fetch handler — not installable`);
  if (!/self\.MS\s*=/.test(sw)) throw new Error(`${id}: sw.js carries no precache manifest — run deploy/sw.mjs`);
  const html = await Deno.readTextFile(`${outDir}/index.html`);
  if (!/rel=["']manifest["']/.test(html)) throw new Error(`${id}: index.html does not link the manifest`);
}

await Deno.remove(OUT, { recursive: true }).catch(() => {});
await Deno.mkdir(`${OUT}/_rt`, { recursive: true });

// 0) refresh the store launcher's app list from the current specs (home/data.js imports it)
await Deno.writeTextFile("apps/store/apps.json", JSON.stringify(await buildManifest(), null, 2) + "\n");

// git-derived versions (auto, no manual bump): the number of commits that touched a path IS its version's
// build number, so a version moves exactly when its code changes. Needs history — the deploy checkout uses
// fetch-depth: 0; a shallow clone falls back to a low count (still deterministic per deploy via BUILD sha).
async function gitCount(path) {
  try { const { stdout, success } = await new Deno.Command("git", { args: ["rev-list", "--count", "HEAD", "--", path], stdout: "piped", stderr: "null" }).output(); return success ? (parseInt(new TextDecoder().decode(stdout).trim(), 10) || 0) : 0; } catch { return 0; }
}

// 1) shared runtime → dist/_rt (all .js except unit tests). build.js is stamped with the deployed commit +
//    the core version (commits touching the runtime).
const BUILD_SHA = (Deno.env.get("GITHUB_SHA") || "dev").slice(0, 7);
const CORE = "1." + (await gitCount("packages/runtime"));
for await (const e of Deno.readDir("packages/runtime")) {
  const keep = (e.name.endsWith(".js") && !e.name.endsWith("_test.js")) || e.name.endsWith(".css") || e.name.endsWith(".json");
  if (!e.isFile || !keep) continue;
  if (e.name === "build.js") await Deno.writeTextFile(`${OUT}/_rt/build.js`, `export const BUILD = "${BUILD_SHA}";\nexport const CORE = "${CORE}";\n`);
  else await Deno.copyFile(`packages/runtime/${e.name}`, `${OUT}/_rt/${e.name}`);
}

// 2) each app → dist/<id>; the `store` launcher lands at dist/store/ — its own scope (/…/store/) does NOT
//    envelop the apps (/…/<id>/), so each app stays independently installable even when the store PWA is
//    installed. The root is a redirect to ./store/ (below).
const ids = [];
const skipped = [];   // app files no copy rule matched — printed at the end so they cannot vanish quietly
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const outDir = `${OUT}/${a.name}`;
  const rt = (s) => s.replaceAll("/_rt/", "../_rt/");   // everything is now one level deep under dist/
  await Deno.mkdir(outDir, { recursive: true });
  const appVer = "1." + (await gitCount(`apps/${a.name}`));   // app version = commits touching this app
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs" || /\.(md|bak\.[a-z]+\.js)$/.test(f.name)) continue;
    // The extension list is an ALLOW-list, so anything new drops out of dist/ silently — hero.wgsl did
    // exactly that, and the app would have 404'd on production with a black stage and a green CI. Unknown
    // extensions are now reported (below) instead of vanishing.
    if (/\.(html|js|json|svg|png|webmanifest|wgsl)$/.test(f.name)) {
      if (f.name === "spec.json") {
        const spec = JSON.parse(await Deno.readTextFile(`apps/${a.name}/spec.json`));
        if (!spec.version) spec.version = appVer;               // stamp unless the author pinned one
        await Deno.writeTextFile(`${outDir}/spec.json`, rt(JSON.stringify(spec, null, 2) + "\n"));
      } else if (/\.(html|js|json)$/.test(f.name)) {
        await Deno.writeTextFile(`${outDir}/${f.name}`, rt(await Deno.readTextFile(`apps/${a.name}/${f.name}`)));
      } else {
        await Deno.copyFile(`apps/${a.name}/${f.name}`, `${outDir}/${f.name}`);
      }
    } else {
      skipped.push(`${a.name}/${f.name}`);
    }
  }
  // per-locale translations live in an i18n/ subdir the top-level file loop skips — copy it through
  if (await has(`apps/${a.name}/i18n`)) {
    await Deno.mkdir(`${outDir}/i18n`, { recursive: true });
    for await (const lf of Deno.readDir(`apps/${a.name}/i18n`)) {
      if (lf.isFile && lf.name.endsWith(".json")) await Deno.copyFile(`apps/${a.name}/i18n/${lf.name}`, `${outDir}/i18n/${lf.name}`);
    }
  }
  // static binary assets (e.g. tarot's public-domain card scans) live in an assets/ subdir the top-level
  // file loop also skips — copy it through verbatim so image-backed apps work offline at the /<app>/ path.
  if (await has(`apps/${a.name}/assets`)) {
    await Deno.mkdir(`${outDir}/assets`, { recursive: true });
    for await (const af of Deno.readDir(`apps/${a.name}/assets`)) {
      if (af.isFile) await Deno.copyFile(`apps/${a.name}/assets/${af.name}`, `${outDir}/assets/${af.name}`);
    }
  }
  // PWA icons — real PNGs (installability); generated from the app's brand.
  // A missing brand.svg is FATAL, never a silent skip: Chrome needs a real PNG ≥192 to offer an install, so
  // skipping quietly ships an app that simply cannot be installed while every gate stays green. That is not
  // hypothetical — `books` shipped exactly that way (authorless never wrote brand.svg), and nobody noticed
  // until someone tried to install it. Fail loudly at build instead.
  {
    if (!(await has(`apps/${a.name}/brand.svg`))) throw new Error(`apps/${a.name}/brand.svg is missing — no PNG icons would be generated and the app would not be installable`);
    const brand = (await has(`apps/${a.name}/brand.json`)) ? JSON.parse(await Deno.readTextFile(`apps/${a.name}/brand.json`)) : { bg: "#1f2430", fg: "#a78bfa" };
    const paths = (await Deno.readTextFile(`apps/${a.name}/brand.svg`)).trim();
    await generateAppIcons(`${outDir}/icons`, brand, paths);
  }
  await assertInstallable(outDir, a.name);   // fail the build if this app cannot be installed as a PWA
  ids.push(a.name);
}

// COMPAT PASS — the deployed artifact must run on the compat floor (Safari 16.1, the owner's iPad). Every
// app is bundled (import attributes + import maps + esm.sh deps resolved away) and its Tailwind precompiled
// to a static stylesheet (the runtime @tailwindcss/browser CDN crashes JSC 16.1). App SOURCE is untouched —
// dev stays zero-build/modern; this is build-only. Fail LOUD with the full list so no app ships half-migrated.
// See docs/RESEARCH-safari16-compat.md.
const RT_ABS = `${Deno.cwd()}/packages/runtime`;
// the shared kit renders most of the UI, so its class names must feed the per-app Tailwind scan (read once)
const sharedSources = [];
for await (const f of Deno.readDir("packages/runtime")) {
  if (f.isFile && f.name.endsWith(".js") && !f.name.endsWith("_test.js")) sharedSources.push(await Deno.readTextFile(`packages/runtime/${f.name}`));
}
const compatFails = [];
for (const id of ids) {
  try { await buildAppCompat({ srcDir: `apps/${id}`, outDir: `${OUT}/${id}`, rtDir: RT_ABS, sharedSources }); }
  catch (e) { compatFails.push(`${id}: ${String(e.message).split("\n")[0]}`); }
}
if (compatFails.length) throw new Error(`compat build failed for ${compatFails.length}/${ids.length} app(s):\n  ${compatFails.join("\n  ")}`);
console.log(`compat: bundled JS + precompiled CSS for ${ids.length} apps (Safari 16.1 floor)`);

// A KILL-SWITCH for the site that lived on this origin before the farm (a Vite PWA, "dreamstudio", whose
// worker was /sw-custom.js at scope /). A browser that ever visited it still holds that worker and serves the
// old shell offline-first without asking the server — the owner saw the old site the day the farm moved in
// (2026-08-16). Same URL, new script: the browser fetches it on its next check, installs this, and this
// deletes every cache that is not ours (ours are namespaced ms-*) and unregisters itself; the open tabs are
// reloaded onto the real page. Kept indefinitely — it is one file, and the old worker has no expiry.
await Deno.writeTextFile(`${OUT}/sw-custom.js`, `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (!k.startsWith("ms-")) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url).catch(() => {});
})());
`);
// root → redirect to the store (which now lives in its own scope at /store/)
await Deno.writeTextFile(`${OUT}/index.html`, `<!doctype html><html lang="uk"><meta charset="utf-8"><title>microspec</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=./store/"><link rel="canonical" href="./store/"><script>location.replace("./store/"+location.search+location.hash)</script><body style="background:#0a0a0b"></body></html>\n`);
await Deno.writeTextFile(`${OUT}/.nojekyll`, "");
if (skipped.length) console.log(`note: ${skipped.length} app file(s) matched no copy rule: ${skipped.join(", ")}`);
console.log(`built dist/ — ${ids.length} apps (store at /store/): ${ids.join(", ")}`);
