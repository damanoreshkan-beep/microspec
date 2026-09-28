/* @ts-self-types="./build.d.mts" */
/**
 * # build — the farm assembled into one static dist/, refused if any app cannot install
 *
 * The site build: a script with no exports. It flattens the core runtime and the product's rt/ overlay
 * into one dist/_rt, then emits every app under dist/<id>/ with a git-derived version, generated PNG
 * icons, a link-preview card and the Safari 16.1 compat bundle — and asserts each one installable as a
 * PWA against the BUILT output (manifest, icons, service worker), because nothing else in the farm does.
 * The Chromium verify gate checks a11y, overflow and e2e on the SOURCE; it never reads the manifest a
 * user installs from, and `books` shipped green with zero icons. No backend, no transpiler for dev:
 * absolute /_rt/ imports become relative ../_rt/ so the site serves from any base path.
 *
 * ![The build: apps and the runtime become a static site, judged in a real browser before it ships](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/build
 * ```
 * Run from the tree that owns apps/. No task wraps it: verify.yml runs it as the step "Build check (dist
 * assembles)", after counts and sw; the product's deploy runs it, judges dist/ with dist-eye, then rsyncs.
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in. One environment variable: `GITHUB_SHA` stamps `BUILD` in
 * dist/_rt/build.js (first 7 characters); absent, the stamp is `dev`. Versions come from git history —
 * `CORE` is 1.<commits touching packages/runtime>, an app's is 1.<commits touching apps/<id>> — so a
 * shallow clone yields a low but deterministic number, never a manual bump.
 *
 * ## What it produces
 * - dist/_rt — every .js (not _test.js), .css, .json and .webp of the core runtime (packages/runtime in
 *   the checkout, node_modules/@jsr/microspec__core/packages/runtime in a consumer), then the product's
 *   rt/ overlay copied on top: one flat, merged runtime the bundler resolves /_rt/ against.
 * - dist/<id>/ for every app with a spec.json — html, js and json rewritten /_rt/ to ../_rt/, spec.json
 *   stamped with the version unless the author pinned one, svg/png/webp/webmanifest/wgsl/frag copied,
 *   i18n/ and assets/ copied through. e2e.spec.mjs, .md and .bak files are skipped; any other extension is
 *   listed at the end as "matched no copy rule" rather than dropped — hero.wgsl once vanished that way.
 * - dist/<id>/icons/ from brand.svg + brand.json, icon.webp as the luminous master when the app has one;
 *   dist/<id>/og.png and the meta block injected into index.html from the app's uk strings.
 * - The compat pass (build-app.mjs): each app bundled, its Tailwind precompiled; app source is untouched.
 * - apps/store/apps.json refreshed from the specs when the store exists; dist/index.html redirecting to
 *   ./store/ with the store's own preview block, or a plain page naming the build in the appless tree;
 *   dist/sw-custom.js, the kill-switch for the pre-farm worker on the same origin; dist/.nojekyll.
 *
 * ## What it refuses
 * Every failure names the app and the reason, and the first one stops the build:
 * - manifest.json missing or invalid; "manifest is not installable — missing …" (name or short_name,
 *   start_url, a standalone/fullscreen/minimal-ui display, a png icon of 192 and of 512, purpose any).
 * - an icon the manifest references that is not in the build, not a valid PNG, or not the declared size.
 * - sw.js missing, its importScripts target absent from the build, no fetch handler one hop away, or no
 *   precache manifest ("run deploy/sw.mjs"); index.html that does not link the manifest.
 * - apps/<id>/brand.svg missing — no icons, no install, and never a silent skip.
 * - "compat build failed for k/n app(s)" with the full list; "link preview incomplete"; og.png missing.
 * Green means every app in dist/ is one Chrome will offer to install and one a preview bot can unfurl.
 *
 * ## Exit codes
 * - 0 — dist/ assembled; the last line lists the apps.
 * - 1 — any refusal above (an uncaught error, so its message is the last thing printed).
 *
 * ## Where it sits
 * Not an 8n8 node. The verify workflow's unit job runs it after the local gates; the product's deploy
 * runs it, then dist-eye over the result in a real Chromium, then rsync to the VPS. It runs in both
 * realms — the framework checkout and a consumer with the package under node_modules — and picks the
 * runtime source by which one exists.
 *
 * ![The three realms a microspec tree runs in](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Why
 * Nothing else in the farm verifies that an app can actually be installed. A build that only copies would
 * let a non-installable app ship green — it did, once — so the build asserts the real criteria Chrome
 * uses to offer "Install", against the built manifest and generated icons that live here and nowhere the
 * verify gate looks. Fail loud, per app, on every build.
 * @module
 */

import { generateAppIcons } from "./icons.mjs";
import { renderOgCard, metaBlock, injectMeta, previewGaps, SITE_NAME } from "./og.mjs";
import { buildManifest } from "./manifest.mjs";
import { buildAppCompat } from "./build-app.mjs";

const OUT = "dist";
const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

const PKG_RT = "node_modules/@jsr/microspec__core/packages/runtime";
const RTSRC = (await has("packages/runtime/index.js")) ? "packages/runtime" : PKG_RT;
const RT_OVERLAY = (await has("rt")) ? "rt" : null;
const isFileAt = async (dir, e) => e.isFile || (e.isSymlink && (await Deno.stat(`${dir}/${e.name}`).catch(() => ({ isFile: false }))).isFile);

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

if (await has("apps/store")) await Deno.writeTextFile("apps/store/apps.json", JSON.stringify(await buildManifest(), null, 2) + "\n");

async function gitCount(path) {
  try { const { stdout, success } = await new Deno.Command("git", { args: ["rev-list", "--count", "HEAD", "--", path], stdout: "piped", stderr: "null" }).output(); return success ? (parseInt(new TextDecoder().decode(stdout).trim(), 10) || 0) : 0; } catch { return 0; }
}

const BUILD_SHA = (Deno.env.get("GITHUB_SHA") || "dev").slice(0, 7);
const CORE = "1." + (await gitCount("packages/runtime"));
for await (const e of Deno.readDir(RTSRC)) {
  const keep = (e.name.endsWith(".js") && !e.name.endsWith("_test.js")) || e.name.endsWith(".css") || e.name.endsWith(".json") || e.name.endsWith(".webp");
  if (!keep || !(await isFileAt(RTSRC, e))) continue;
  if (e.name === "build.js") await Deno.writeTextFile(`${OUT}/_rt/build.js`, `export const BUILD = "${BUILD_SHA}";\nexport const CORE = "${CORE}";\n`);
  else await Deno.copyFile(`${RTSRC}/${e.name}`, `${OUT}/_rt/${e.name}`);
}
if (RT_OVERLAY) {
  for await (const e of Deno.readDir(RT_OVERLAY)) {
    const keep = (e.name.endsWith(".js") && !e.name.endsWith("_test.js")) || e.name.endsWith(".css") || e.name.endsWith(".json") || e.name.endsWith(".webp");
    if (!keep || !(await isFileAt(RT_OVERLAY, e))) continue;
    await Deno.copyFile(`${RT_OVERLAY}/${e.name}`, `${OUT}/_rt/${e.name}`);
  }
}

const ids = [];
const skipped = [];
const previews = new Map();
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const outDir = `${OUT}/${a.name}`;
  const rt = (s) => s.replaceAll("/_rt/", "../_rt/");
  await Deno.mkdir(outDir, { recursive: true });
  const appVer = "1." + (await gitCount(`apps/${a.name}`));
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs" || /\.(md|bak\.[a-z]+\.js)$/.test(f.name)) continue;
    if (/\.(html|js|css|json|svg|png|webp|webmanifest|wgsl|frag)$/.test(f.name)) {
      if (f.name === "spec.json") {
        const spec = JSON.parse(await Deno.readTextFile(`apps/${a.name}/spec.json`));
        if (!spec.version) spec.version = appVer;
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
  if (await has(`apps/${a.name}/i18n`)) {
    await Deno.mkdir(`${outDir}/i18n`, { recursive: true });
    for await (const lf of Deno.readDir(`apps/${a.name}/i18n`)) {
      if (lf.isFile && lf.name.endsWith(".json")) await Deno.copyFile(`apps/${a.name}/i18n/${lf.name}`, `${outDir}/i18n/${lf.name}`);
    }
  }
  if (await has(`apps/${a.name}/assets`)) {
    await Deno.mkdir(`${outDir}/assets`, { recursive: true });
    for await (const af of Deno.readDir(`apps/${a.name}/assets`)) {
      if (af.isFile) await Deno.copyFile(`apps/${a.name}/assets/${af.name}`, `${outDir}/assets/${af.name}`);
    }
  }
  {
    if (!(await has(`apps/${a.name}/brand.svg`))) throw new Error(`apps/${a.name}/brand.svg is missing — no PNG icons would be generated and the app would not be installable`);
    const brand = (await has(`apps/${a.name}/brand.json`)) ? JSON.parse(await Deno.readTextFile(`apps/${a.name}/brand.json`)) : { bg: "#1f2430", fg: "#a78bfa" };
    const paths = (await Deno.readTextFile(`apps/${a.name}/brand.svg`)).trim();
    const master = (await has(`apps/${a.name}/icon.webp`)) ? await Deno.readFile(`apps/${a.name}/icon.webp`) : null;
    await generateAppIcons(`${outDir}/icons`, brand, paths, master);
    const uk = JSON.parse(await Deno.readTextFile(`apps/${a.name}/i18n/uk.json`));
    const title = uk.title || a.name, tagline = uk.profTagline || uk.heroBody || "";
    await Deno.writeFile(`${outDir}/og.png`, await renderOgCard({ brand, paths, title, tagline, master }));
    previews.set(a.name, { title, description: tagline || `${title} — ${SITE_NAME}` });
  }
  await assertInstallable(outDir, a.name);
  ids.push(a.name);
}

const RT_ABS = `${Deno.cwd()}/${OUT}/_rt`;
const sharedSources = [];
for (const dir of [RTSRC, RT_OVERLAY].filter(Boolean)) {
  for await (const f of Deno.readDir(dir)) {
    if (f.name.endsWith(".js") && !f.name.endsWith("_test.js") && (await isFileAt(dir, f))) sharedSources.push(await Deno.readTextFile(`${dir}/${f.name}`));
  }
}
const compatFails = [];
for (const id of ids) {
  try { await buildAppCompat({ srcDir: `apps/${id}`, outDir: `${OUT}/${id}`, rtDir: RT_ABS, sharedSources }); }
  catch (e) { compatFails.push(`${id}: ${String(e.message).split("\n")[0]}`); }
}
if (compatFails.length) throw new Error(`compat build failed for ${compatFails.length}/${ids.length} app(s):\n  ${compatFails.join("\n  ")}`);
console.log(`compat: bundled JS + precompiled CSS for ${ids.length} apps (Safari 16.1 floor)`);

for (const id of ids) {
  const p = previews.get(id);
  if (!p) throw new Error(`${id}: no link-preview record — the app loop did not render its card`);
  const withMeta = injectMeta(await Deno.readTextFile(`${OUT}/${id}/index.html`), metaBlock({ path: `/${id}/`, ...p }));
  await Deno.writeTextFile(`${OUT}/${id}/index.html`, withMeta);
  const gaps = previewGaps(withMeta);
  if (gaps.length) throw new Error(`${id}: link preview incomplete — ${gaps.join(", ")}`);
  try { await Deno.stat(`${OUT}/${id}/og.png`); } catch { throw new Error(`${id}: og.png missing`); }
}
console.log(`link previews: og.png + meta block for ${ids.length} apps`);

await Deno.writeTextFile(`${OUT}/sw-custom.js`, `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (!k.startsWith("ms-")) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url).catch(() => {});
})());
`);
if (await has("apps/store")) {
  const storeUk = JSON.parse(await Deno.readTextFile("apps/store/i18n/uk.json"));
  const rootHtml = injectMeta(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${storeUk.title || "microspec"}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=./store/"><script>location.replace("./store/"+location.search+location.hash)</script></head><body style="background:#0a0a0b"></body></html>\n`, metaBlock({ path: "/", title: storeUk.title || "microspec", description: storeUk.profTagline || "", image: "/store/og.png" }));
  await Deno.writeTextFile(`${OUT}/index.html`, rootHtml);
} else {
  await Deno.writeTextFile(`${OUT}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>microspec</title></head><body>microspec ${BUILD_SHA}</body></html>\n`);
}
await Deno.writeTextFile(`${OUT}/.nojekyll`, "");
if (skipped.length) console.log(`note: ${skipped.length} app file(s) matched no copy rule: ${skipped.join(", ")}`);
console.log(`built dist/ — ${ids.length} apps (store at /store/): ${ids.join(", ")}`);
