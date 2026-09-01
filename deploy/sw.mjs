/* @ts-self-types="./sw.d.mts" */
/**
 * # sw — per-app offline precache, regenerated from the real import graph
 *
 * A worker's scope is derived from its own path and GitHub Pages cannot send `Service-Worker-Allowed`,
 * so every app needs its own apps/<id>/sw.js — but that file holds no logic. It carries the app's identity
 * and its precache manifest, then `importScripts("/_rt/sw-core.js")` (build rewrites /_rt/ to ../_rt/
 * like every other app file). The manifest is the app's SHELL: everything it needs to boot with the
 * network unplugged, computed from index.html through the module closure rather than listed by hand. The
 * version is a hash of the manifest, not of file contents, so a runtime edit does not rewrite every stub
 * and drag the farm through verify; the cache name changes only when the shape of the shell does.
 *
 * ![The sw node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-sw.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/sw            # (re)write every app's sw.js
 * deno run -A jsr:@microspec/core/sw --check    # fail if any stub is stale
 * ```
 * `deno task gates` runs `--check` as the 8n8 node `sw`; verify.yml runs the same check before the build.
 * It reads `apps/` from the tree it is run in — every directory with a spec.json is an app.
 *
 * ## Flags and arguments
 * | Flag | Effect |
 * | --- | --- |
 * | `--check` | Compare every stub with what the graph generates; write nothing. |
 *
 * No other arguments.
 *
 * ## What it checks / produces
 * The precache manifest of an app, in order of discovery:
 * - `./`, `./index.html`, `./manifest.json` — always;
 * - what index.html loads by tag — same-origin (theme.css, icon.svg) and CDN `<script>` / `<link>` alike —
 *   and what a same-origin runtime stylesheet `@import`s (`/_rt/theme.css` is one line, `@import
 *   "./runtime.css"`, in the core and in a product's overlay; the overlay's copy is read when the tree has one);
 * - the module closure of index.html: the app's own files (spec.json, the i18n dictionaries, view.js …)
 *   and the /_rt/ modules it reaches, followed through code files only — an i18n string that happens to
 *   contain `from "…"` must not invent a dependency;
 * - the CDN URLs behind bare specifiers the closure imports statically (preact, htm, nanostores, motion),
 *   resolved through the page's own import map;
 * - the app's shaders (any `.wgsl` or `.frag` beside index.html) — they arrive by fetch(), so the closure
 *   is blind to them; discovered, not listed, because the third app to ship a shader would otherwise have
 *   gone offline-blank with every gate green.
 *
 * Deliberately NOT in it: the app's assets directory (card scans, wasm, sample kits, environment maps)
 * and anything reached only by a guarded dynamic `import("three")`. Those are cached on first use; the
 * shell is a small fixed install cost, media is not.
 *
 * - `stale service workers (run: deno run -A deploy/sw.mjs): a, b` (`--check`) — the named apps' sw.js
 *   differ from what the graph generates now; adopting a kit component is enough to cause it.
 * - `<id>: no index.html — skipped` — a directory with a spec.json but no page gets no worker.
 * - Green: `sw: N stubs up to date`. Without `--check`: `sw: N stub(s) written, M unchanged`.
 * - Written: apps/<id>/sw.js — `self.MS = { app, version, precache }`, then
 *   `importScripts("/_rt/sw-core.js")`. build.mjs refuses a dist whose sw.js carries no `self.MS`.
 *
 * {@link manifestFor} and {@link stubFor} are exported for the unit tests and other tools.
 *
 * ## Exit codes
 * - `0` — every stub current (`--check`), or every stub written.
 * - `1` — `--check` found at least one stale stub.
 *
 * ## Where it sits
 * 8n8 node `sw` · phase gate · script, frozen 2026-07-09 · needs: scaffold, demo · needed by: push. The
 * stub is what build.mjs ships into dist/, and what verify's PWA check waits on: the worker must activate
 * and its precache must hold the document before an app counts as installable.
 *
 * ![The build: apps and /_rt to dist, dist-eye, rsync, live](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Why
 * Per-app offline precache, regenerated from the REAL import graph. Adopting a kit component is enough to
 * stale it, which is why this is a gate and not a habit.
 * @module
 */
// microspec — generate each app's service-worker stub (apps/<id>/sw.js) from the REAL import graph.
//
//   deno run -A deploy/sw.mjs           # (re)write every app's stub
//   deno run -A deploy/sw.mjs --check   # fail if any stub is stale (a local gate, like counts.mjs --check)
//
// A per-app sw.js file is unavoidable — a worker's scope is derived from its own path and GitHub Pages can't
// send `Service-Worker-Allowed` — but it holds no logic: just the app's identity and the precache manifest,
// then `importScripts("/_rt/sw-core.js")` (build.mjs rewrites /_rt/ → ../_rt/ like every other app file).
//
// The manifest is the app's SHELL: everything needed to boot with the network unplugged.
//   · the app's own files, reached from index.html through the import graph (spec.json, i18n/*.json, view.js…)
//   · the /_rt/ modules that closure reaches
//   · what index.html loads by tag (theme.css, icon.svg, the CDN <script>/<link>s)
//   · the CDN URLs behind bare specifiers the closure imports STATICALLY (preact, htm, nanostores, motion)
// Deliberately NOT in it: apps/<id>/assets/* (card scans, wasm, sample kits) and anything reached only by a
// guarded dynamic import("three"). Those are cached on first use; the shell is a small fixed install cost,
// media is not.
//
// The version is a hash of the manifest itself, NOT of the files' contents — a runtime edit must not rewrite
// 57 stubs (and drag the whole farm through verify) when stale-while-revalidate already refreshes content.
// The cache name only has to change when the SHAPE of the shell changes.

import { buildClosure, htmlAssets, importMapOf, resolveSpec, RT, staticSpecs } from "../tools/graph.mjs";

const read = (f) => { try { return Deno.readTextFileSync(f); } catch { return null; } };
const exists = (f) => read(f) != null;

// Follow imports through code only. buildClosure regexes whatever read() returns, and an i18n string that
// happens to contain `from "…"` would otherwise invent a phantom dependency.
const codeOnly = (f) => (/\.(js|mjs|html)$/.test(f) ? read(f) : read(f) == null ? null : "");

async function hash(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 5).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes an app's precache manifest — the shell URLs (own files, /_rt/ modules, tag-loaded assets, CDN
 * pins behind static bare specifiers, shaders) reached from apps/<id>/index.html through the import graph.
 * @param id the app id (apps/<id>)
 * @param opts optional `{ read }` — a file reader injected by the unit tests in place of the real one
 * @returns the sorted list of URLs to precache, or null when the app has no index.html
 */
export function manifestFor(id, { read: rd = read } = {}) {
  const dir = `apps/${id}`;
  const html = rd(`${dir}/index.html`);
  if (html == null) return null;
  const urls = new Set(["./", "./index.html", "./manifest.json"]);

  // 1) what index.html loads by tag — same-origin (theme.css, icon.svg) and CDN alike
  for (const a of htmlAssets(html)) {
    if (/^https?:\/\//.test(a)) urls.add(a);
    else if (a.startsWith("/_rt/")) urls.add(a);
    else if (!a.startsWith("/")) urls.add(a.startsWith("./") ? a : `./${a}`);
  }
  // 1b) …and what a same-origin runtime stylesheet @imports: /_rt/theme.css is one line in the core and a
  //     product's overlay, `@import "./runtime.css"` — a shell that precached only the link would style
  //     nothing offline. The overlay's copy wins when the tree has one, as it does when served.
  const cssOf = (name) => rd(`rt/${name}`) ?? rd(`${RT}${name}`);
  // a product's theme registry (material.js reads it at boot) is part of the shell when the tree ships one
  if (rd("rt/themes.json") != null) urls.add("/_rt/themes.json");
  for (const u of [...urls]) {
    const m = /^\/_rt\/([\w.-]+\.css)$/.exec(u);
    if (!m) continue;
    const seen = new Set([m[1]]), queue = [m[1]];
    while (queue.length) {
      const src = cssOf(queue.shift());
      if (!src) continue;
      for (const im of src.matchAll(/@import\s+(?:url\()?["']\.\/([\w.-]+\.css)["']\)?/g)) {
        if (seen.has(im[1])) continue;
        seen.add(im[1]); queue.push(im[1]); urls.add(`/_rt/${im[1]}`);
      }
    }
  }

  // 2) the module closure of index.html: the app's own files + the /_rt/ modules they reach
  const closure = [...buildClosure(`${dir}/index.html`, codeOnly)].filter((f) => rd(f) != null).sort();
  for (const f of closure) {
    if (f.startsWith(RT)) urls.add(`/_rt/${f.slice(RT.length)}`);
    else if (f.startsWith(`${dir}/`) && f !== `${dir}/index.html`) urls.add(`./${f.slice(dir.length + 1)}`);
  }

  // 3) bare specifiers the closure imports statically → their CDN URLs, via the page's own import map
  const imports = importMapOf(html);
  for (const f of closure) {
    const src = rd(f);
    if (!src || !/\.(js|mjs|html)$/.test(f)) continue;
    for (const spec of staticSpecs(src)) {
      if (resolveSpec(spec, f)) continue;                       // local — already handled above
      const url = imports[spec] || imports[spec.replace(/\/.*$/, "/")];
      if (url) urls.add(url);
    }
  }

  // 4) the app's shaders. They are part of the shell — a few hundred bytes a stage cannot start without —
  // but they arrive by fetch() rather than import, so the closure above is blind to them. DISCOVERED, not
  // listed: this was two hardcoded filenames (hero.wgsl, presence.frag) and the third app to ship a shader
  // would have gone offline-blank with every gate green. The environment map beside them stays OUT, like
  // every other assets/* payload: it is megabytes, and SWR caches it on the first online run.
  try {
    for (const e of Deno.readDirSync(dir)) {
      if (e.isFile && /\.(wgsl|frag)$/.test(e.name)) urls.add(`./${e.name}`);
    }
  } catch { /* an injected read() against a directory that does not exist — the unit tests' shape */ }

  return [...urls].sort();
}

const STUB = (id, version, precache) =>
  `// GENERATED by deploy/sw.mjs — do not edit by hand (\`deno run -A deploy/sw.mjs\`; --check gates it).\n` +
  `// Scope comes from this file's own path, so every app needs its own worker; the logic lives once in\n` +
  `// /_rt/sw-core.js. \`precache\` is this app's shell — enough to boot with the network unplugged.\n` +
  `self.MS = {\n  app: ${JSON.stringify(id)},\n  version: ${JSON.stringify(version)},\n  precache: [\n` +
  precache.map((u) => `    ${JSON.stringify(u)},\n`).join("") +
  `  ],\n};\nimportScripts("/_rt/sw-core.js");\n`;

/**
 * Builds the source of an app's sw.js stub: its precache manifest wrapped in the generated worker, with a
 * version hashed from the manifest itself so the cache name changes only when the shell's shape does.
 * @param id the app id (apps/<id>)
 * @returns the stub source, or null when the app has no index.html
 */
export async function stubFor(id) {
  const precache = manifestFor(id);
  return precache && STUB(id, await hash(JSON.stringify(precache)), precache);
}

if (import.meta.main) {
  const ids = [...Deno.readDirSync("apps")].filter((e) => e.isDirectory && exists(`apps/${e.name}/spec.json`)).map((e) => e.name).sort();
  const check = Deno.args.includes("--check");
  const stale = [];
  let written = 0;

  for (const id of ids) {
    const want = await stubFor(id);
    if (!want) { console.warn(`${id}: no index.html — skipped`); continue; }
    const path = `apps/${id}/sw.js`;
    if (read(path) === want) continue;
    if (check) { stale.push(id); continue; }
    Deno.writeTextFileSync(path, want);
    written++;
  }

  if (check) {
    if (stale.length) {
      console.error(`stale service workers (run: deno run -A deploy/sw.mjs): ${stale.join(", ")}`);
      Deno.exit(1);
    }
    console.log(`sw: ${ids.length} stubs up to date`);
  } else {
    console.log(`sw: ${written} stub(s) written, ${ids.length - written} unchanged`);
  }
}
