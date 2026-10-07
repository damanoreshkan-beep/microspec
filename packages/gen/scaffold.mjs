/* @ts-self-types="./scaffold.d.mts" */
/**
 * # scaffold — the deterministic half of authoring
 *
 * The agent writes only the app-specific files — `spec.json` (structure), `i18n/<locale>.json` (one file per
 * language) and `data.js`, `view.js` or `stream.js` — and this emits the boilerplate every app needs:
 * `index.html` with the instant app-shell and the mode-composed `start()` wiring, `manifest.json`, a
 * placeholder `sw.js` and `icon.svg`. It is identical for every app, so it is a function, not a habit; it
 * never overwrites a file that exists unless told to. A CLI script — it exports nothing.
 *
 * ![The pipeline around scaffold — every node a lit point, its needs as filaments](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-scaffold.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/scaffold apps/<id>            # emit what is missing
 * deno run -A jsr:@microspec/core/scaffold apps/<id> --force    # regenerate the four files
 * ```
 * `deno task 8n8 author` ends with it as the 8n8 node `scaffold`; `deno task demo` runs it over the generated
 * `apps/books` when the tree carries no apps.
 *
 * ## Flags and arguments
 * | Argument | Effect |
 * | --- | --- |
 * | `<appdir>` | The app folder, e.g. `apps/<id>`; a trailing slash is stripped. Missing: usage line, exit 2. |
 * | `--force` | Overwrite `index.html`, `manifest.json`, `sw.js`, `icon.svg` even when they exist. An `icon.svg` that wraps luminous art (`icon.webp` present) is kept even so. |
 *
 * ## What it checks / produces
 * Refuses, with a named reason, before writing anything:
 * - `✗ <appdir>/spec.json missing — author it first`
 * - `✗ <appdir>/i18n/ has no locale files — author i18n/uk.json + i18n/en.json`
 *
 * The mode is COMPOSED from the files present, never picked from a hierarchy: `tool` when `view.js` exists,
 * `stream` when `stream.js` exists, `data` when `data.js` exists (and by default), joined with `+`. The
 * boot wiring imports each part and hands `start()` either `load` alone or `{ load, views, stream }` — a
 * binary tool-else-data pick once dropped the second half on a forced re-scaffold and lists mounted empty
 * with zero runtime errors.
 *
 * Optional inputs: `brand.json` (`bg`, `fg`; default `#1f2430` on `#a78bfa`) and `brand.svg` (icon paths;
 * default a rounded square) for the icon tile; `head.html`, inlined verbatim into the head so app-owned
 * styles survive a regeneration; `icon.webp`, whose presence marks `icon.svg` as owned art.
 *
 * Written into `<appdir>`:
 * - `index.html` — `lang` (`uk` when the app has it, else the first locale), `data-theme` from `spec.theme`
 *   (default `dim`), `theme-color`, the CDN links (Tailwind, daisyUI, `/_rt/theme.css`, iconify, Geist), the
 *   browser import map, the plain-CSS boot shell (wordmark, sliding line, dock island, in the exact places
 *   the real chrome lands), then the module that composes `spec.json` + every `i18n/<locale>.json` and calls
 *   `start` from `/_rt/index.js`.
 * - `manifest.json` — name and short_name from the `uk`/`en` dictionary's `title` (else `spec.id`),
 *   description from `profTagline`, standalone display, the icon set under `icons/`.
 * - `sw.js` — a placeholder that precaches `./` and `./index.html` through `/_rt/sw-core.js`; `deploy/sw.mjs`
 *   replaces it from the finished import graph.
 * - `icon.svg` — the brand paths on a rounded 512 tile, the fallback for an app that has no art yet.
 * - `spec.json` gains `added` (today, `YYYY-MM-DD`) on an app's FIRST scaffold only — no `index.html` yet
 *   and no `added` — reported as `✓ spec.json (added: <date>)`. It is the app's birthday: `manifest` carries
 *   it into the store's apps.json and the store's Fresh rubric lists the newest apps by it. A re-scaffold,
 *   forced or not, never touches it.
 *
 * `theme-color` and `background_color` are MEASURED from the EFFECTIVE theme — the tree's `rt/theme.css`
 * when it has a brand, else the core's neutral `runtime.css` (`--color-base-100` of
 * `signal`, or `signal-light` when `spec.theme` contains `light`), never typed here: 76 chrome files once
 * carried a stale base after a repaint. A `theme.css` without that base throws.
 *
 * Every file reports `✓ <name>`, `· <name> (exists, kept)` or `· icon.svg (luminous art, kept)`, then
 * `scaffolded <appdir> [<mode> mode] — <n> file(s) written`.
 *
 * ## Exit codes
 * - `0` — scaffolded; a run that kept every file is still green.
 * - `1` — `spec.json` missing, or `i18n/` has no locale files.
 * - `2` — no app directory given (usage printed).
 *
 * ## Where it sits
 * 8n8 node `scaffold` · phase author · script · needs: view, i18n · needed by: noundef, preflight, kit, sw,
 * readme, manifest. Frozen 2026-06-18. `view` MUST run before it — the mode is read off the files, and the
 * wrong order yields a green preflight over an empty screen.
 *
 * ## Why
 * index.html + manifest.json + sw stub + icon.svg. Identical for every app, so it is a function.
 * @module
 */
import { readLocales, localeList } from "./compose.mjs";

const dir = (Deno.args[0] ?? "").replace(/\/$/, "");
const force = Deno.args.includes("--force");
if (!dir) { console.error("usage: scaffold.mjs <appdir> [--force]"); Deno.exit(2); }

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));

if (!(await has(`${dir}/spec.json`))) { console.error(`✗ ${dir}/spec.json missing — author it first`); Deno.exit(1); }
const spec = await readJson(`${dir}/spec.json`);
const i18n = await readLocales(dir);
const locales = localeList(i18n);
if (!locales.length) { console.error(`✗ ${dir}/i18n/ has no locale files — author i18n/uk.json + i18n/en.json`); Deno.exit(1); }
const brand = (await has(`${dir}/brand.json`)) ? await readJson(`${dir}/brand.json`) : { bg: "#1f2430", fg: "#a78bfa" };
const brandPaths = (await has(`${dir}/brand.svg`)) ? (await Deno.readTextFile(`${dir}/brand.svg`)).trim() : '<rect x="4" y="4" width="16" height="16" rx="3"/>';
const hasView = await has(`${dir}/view.js`), hasData = await has(`${dir}/data.js`), hasStream = await has(`${dir}/stream.js`);
const headExtra = (await has(`${dir}/head.html`)) ? (await Deno.readTextFile(`${dir}/head.html`)).trimEnd() + "\n" : "";
const mode = [hasView && "tool", hasStream && "stream", hasData && "data"].filter(Boolean).join("+") || "data";

const dict = i18n.uk || i18n.en || {};
const title = dict.title || spec.id;
const tagline = dict.profTagline || title;
const isLight = /light/.test(spec.theme || "");
import { pkgRoot } from "../runtime/pkgroot.js";
const themeCss = await (async () => {
  const rt = `${Deno.cwd()}/rt/`;
  const expand = async (text) => {
    let head = "";
    for (const m of text.matchAll(/@import\s+"\.\/([\w.-]+\.css)";/g)) {
      const local = await Deno.readTextFile(rt + m[1]).catch(() => null);
      if (local != null) head += await expand(local) + "\n";
    }
    return head + text;
  };
  const core = await Deno.readTextFile(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 2)));
  const own = await Deno.readTextFile(rt + "theme.css").catch(() => null);
  return own == null ? core : core + "\n" + await expand(own);
})();
const baseOf = (t) => {
  let i = -1, base = null;
  while ((i = themeCss.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) {
    const m = /--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(themeCss.slice(i, themeCss.indexOf("\n}", i)));
    if (m) base = m[1].toUpperCase();
  }
  if (!base) throw new Error(`theme: no --color-base-100 for [data-theme="${t}"]`);
  return base;
};
const themeColor = isLight ? baseOf("signal-light") : baseOf("signal");
const bg = themeColor;
const lang = i18n.uk ? "uk" : locales[0];

const localeImports = locales.map((l) => `    import ${l} from "./i18n/${l}.json" with { type: "json" };`).join("\n");
const srcImport = [
  hasView && `    import * as views from "./view.js";`,
  hasStream && `    import { stream } from "./stream.js";`,
  (hasData || (!hasView && !hasStream)) && `    import { load } from "./data.js";`,
].filter(Boolean).join("\n");
const startArg = (!hasView && !hasStream) ? "load"
  : `{ ${[hasData && "load", hasView && "views", hasStream && "stream"].filter(Boolean).join(", ")} }`;
const startWiring = [
  `    import spec from "./spec.json" with { type: "json" };`,
  localeImports,
  srcImport,
  `    import { start } from "/_rt/index.js";`,
  `    start({ ...spec, i18n: { ${locales.join(", ")} } }, ${startArg});`,
].join("\n");

const bootCss = `
    html,body{background:var(--color-base-200,${bg})}
    #boot{position:fixed;inset:0;z-index:60;background:var(--color-base-200,${bg});opacity:1;transition:opacity .4s ease;pointer-events:none}
    #boot.gone{opacity:0}
    #boot .bh{height:3.5rem;padding-top:env(safe-area-inset-top);display:flex;align-items:center;padding-left:1rem;background:var(--color-base-100,${bg});box-shadow:var(--sf-lift2,0 0 0 1px rgba(255,232,196,.11),inset 0 1px 0 rgba(255,238,208,.2))}
    #boot .bm{font-family:var(--font-mono,ui-monospace,monospace);text-transform:uppercase;letter-spacing:.05em;font-weight:700;font-size:1.02rem;color:var(--color-base-content,#f2eee6);opacity:.85}
    #boot .bb{position:absolute;left:0;right:0;top:calc(3.5rem + env(safe-area-inset-top));height:2px;overflow:hidden;background:color-mix(in oklch,var(--color-base-content,#f2eee6) 8%,transparent)}
    #boot .bb i{position:absolute;top:0;height:100%;width:38%;border-radius:2px;background:var(--app-accent,#f2b84b);animation:bootslide 1.1s cubic-bezier(.4,0,.2,1) infinite}
    #boot .bd{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + .75rem);width:12rem;height:3.25rem;border-radius:1.35rem;background:var(--color-base-100,${bg});box-shadow:var(--sf-lift2,0 0 0 1px rgba(255,232,196,.11),inset 0 1px 0 rgba(255,238,208,.2))}
    @keyframes bootslide{0%{left:-38%}100%{left:100%}}
    @media(prefers-reduced-motion:reduce){#boot .bb i{animation:none;left:0;width:100%;opacity:.5}}`;
const bootShell = `  <div id="boot" aria-hidden="true"><div class="bh"><span class="bm">${title}</span></div><div class="bb"><i></i></div><div class="bd"></div></div>`;

const indexHtml = `<!DOCTYPE html>
<html lang="${lang}" data-theme="${spec.theme || "dim"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="${themeColor}">
  <title>${title}</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
  <link href="/_rt/theme.css" rel="stylesheet" type="text/css" />
  <script src="https://code.iconify.design/iconify-icon/3.0.0/iconify-icon.min.js"></script>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">
  <style>body{font-family:'Geist',ui-sans-serif,system-ui,sans-serif}</style>
  <style>${bootCss}
  </style>
  <script type="importmap">
  {
    "imports": {
      "preact": "https://esm.sh/preact@10.27.1",
      "preact/hooks": "https://esm.sh/preact@10.27.1/hooks",
      "htm/preact": "https://esm.sh/htm@3.1.1/preact?external=preact",
      "nanostores": "https://esm.sh/nanostores@0.11.4",
      "@nanostores/persistent": "https://esm.sh/@nanostores/persistent@0.10.2?external=nanostores",
      "@nanostores/preact": "https://esm.sh/@nanostores/preact@0.5.2?external=preact,nanostores",
      "motion": "https://esm.sh/motion@11.18.2",
      "lodash-es": "https://esm.sh/lodash-es@4.17.21",
      "three": "https://esm.sh/three@0.171.0",
      "three/addons/": "https://esm.sh/three@0.171.0/examples/jsm/",
      "pixi.js": "https://cdn.jsdelivr.net/npm/pixi.js@8.20.1/dist/pixi.min.mjs",
      "pixi-filters": "https://cdn.jsdelivr.net/npm/pixi-filters@6.1.5/dist/pixi-filters.min.mjs",
      "d3-geo": "https://esm.sh/d3-geo@3",
      "topojson-client": "https://esm.sh/topojson-client@3",
      "@microspec/core/runtime/": "/_rt/"
    }
  }
  </script>
${headExtra}</head>
<body class="bg-base-200 min-h-dvh">
${bootShell}
  <div id="app"></div>
  <script type="module">
${startWiring}
  </script>
</body>
</html>
`;

const icons = [
  { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
  { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
const manifest = JSON.stringify({
  name: title, short_name: title, description: tagline, start_url: "./", scope: "./",
  // display: STANDALONE, not fullscreen — a fullscreen WebAPK is letterboxed by Chromium under the camera
  // cutout on Samsung Internet (immersive + LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT = a dead black band, and a
  // page has zero web lever over it; measured on an S25, 2026-10-06, and the same cure a real PWA shipped —
  // whisper-money#1080). Standalone shows the system status bar instead, painted from theme-color (which the
  // runtime keeps matched to the live theme), so the top is a clean bar in the app's colour, no black slab.
  // True draw-under-the-cutout needs the Fullscreen API (rejected) or One UI's per-app "Camera cutout" toggle.
  display: "standalone", orientation: "any", theme_color: themeColor, background_color: bg, lang, icons,
  // spec.share — the OS share sheet lists the app; the page takes sh_* through /_rt/share.js takeShared().
  // Files need a POST multipart target (web-share-target Level 2): sw-core.js intercepts it, parks the files in a
  // cache and 303s to ./?sh_files=<n>. MIME types only in `accept` — an extension breaks the WebAPK install (validate.js).
  ...(spec.share?.files
    ? { share_target: { action: "./share-target", method: "POST", enctype: "multipart/form-data", params: { title: "sh_title", text: "sh_text", url: "sh_url", files: [{ name: "sh_files", accept: spec.share.files }] } } }
    : spec.share ? { share_target: { action: "./", method: "GET", params: { title: "sh_title", text: "sh_text", url: "sh_url" } } } : {}),
}, null, 2) + "\n";

const sw = `// PLACEHOLDER — run \`deno run -A deploy/sw.mjs\` to generate the real worker for this app.\n` +
  `self.MS = { app: ${JSON.stringify(spec.id)}, version: "scaffold", precache: ["./", "./index.html"] };\n` +
  `importScripts("/_rt/sw-core.js");\n`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${brand.bg}"/><g transform="translate(81.92,81.92) scale(14.506666666666666)" fill="none" stroke="${brand.fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${brandPaths}</g></svg>\n`;

const files = { "index.html": indexHtml, "manifest.json": manifest, "sw.js": sw, "icon.svg": iconSvg };
const hasArt = await has(`${dir}/icon.webp`);
const firstScaffold = !(await has(`${dir}/index.html`));
let wrote = 0;
for (const [name, content] of Object.entries(files)) {
  const p = `${dir}/${name}`;
  if (name === "icon.svg" && hasArt) { console.log(`  · ${name} (luminous art, kept)`); continue; }
  if (!force && (await has(p))) { console.log(`  · ${name} (exists, kept)`); continue; }
  await Deno.writeTextFile(p, content);
  console.log(`  ✓ ${name}`);
  wrote++;
}
if (firstScaffold && !spec.added) {
  spec.added = new Date().toISOString().slice(0, 10);
  await Deno.writeTextFile(`${dir}/spec.json`, JSON.stringify(spec, null, 2) + "\n");
  console.log(`  ✓ spec.json (added: ${spec.added})`);
  wrote++;
}
console.log(`\nscaffolded ${dir} [${mode} mode] — ${wrote} file(s) written`);
