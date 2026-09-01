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
 *
 * `theme-color` and `background_color` are MEASURED from the runtime's `theme.css` (`--color-base-100` of
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
// microspec — app scaffolder (the deterministic half of authoring). The agent (LLM) writes only the
// app-specific files — spec.json (structure) + i18n/<locale>.json (translations, one file per language)
// + data.js (or view.js for a tool) — and this emits the identical boilerplate every app needs:
// index.html (composes spec + locale files, wired by mode), manifest.json, sw.js (placeholder — deploy/sw.mjs
// generates the real offline-first worker from the finished import graph),
// icon.svg (from brand). It never overwrites the authored files unless --force.
//
//   deno run -A scaffold.mjs <appdir> [--force]
//
// Modes: `tool` if view.js exists (start(spec,{views})), else `data` (start(spec, load)).
import { readLocales, localeList } from "./compose.mjs";

const dir = (Deno.args[0] ?? "").replace(/\/$/, "");
const force = Deno.args.includes("--force");
if (!dir) { console.error("usage: scaffold.mjs <appdir> [--force]"); Deno.exit(2); }

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));

if (!(await has(`${dir}/spec.json`))) { console.error(`✗ ${dir}/spec.json missing — author it first`); Deno.exit(1); }
const spec = await readJson(`${dir}/spec.json`);
const i18n = await readLocales(dir);           // translations live in apps/<id>/i18n/<locale>.json
const locales = localeList(i18n);
if (!locales.length) { console.error(`✗ ${dir}/i18n/ has no locale files — author i18n/uk.json + i18n/en.json`); Deno.exit(1); }
const brand = (await has(`${dir}/brand.json`)) ? await readJson(`${dir}/brand.json`) : { bg: "#1f2430", fg: "#a78bfa" };
const brandPaths = (await has(`${dir}/brand.svg`)) ? (await Deno.readTextFile(`${dir}/brand.svg`)).trim() : '<rect x="4" y="4" width="16" height="16" rx="3"/>';
// The boot is COMPOSED from the files, never picked from a hierarchy: an app may carry views AND an
// adapter (arc, persona: { load, views }) or views AND a stream (homin: { views, stream }). A binary
// tool-else-data pick once dropped the second half on a forced re-scaffold, and shelves/signal lists
// mounted empty with zero runtime errors.
const hasView = await has(`${dir}/view.js`), hasData = await has(`${dir}/data.js`), hasStream = await has(`${dir}/stream.js`);
// APP-OWNED head content (a custom <style>, an extra tag) lives in head.html and is inlined verbatim —
// index.html stays fully regenerable. Three apps once carried such blocks INSIDE the generated file and a
// forced re-scaffold silently amputated them (reel's noir, handpan's tone fields, hive's living comb).
const headExtra = (await has(`${dir}/head.html`)) ? (await Deno.readTextFile(`${dir}/head.html`)).trimEnd() + "\n" : "";
const mode = [hasView && "tool", hasStream && "stream", hasData && "data"].filter(Boolean).join("+") || "data";

const dict = i18n.uk || i18n.en || {};
const title = dict.title || spec.id;
const tagline = dict.profTagline || title;
const isLight = /light/.test(spec.theme || "");
// The installed-PWA splash + Android status bar. These MUST track the theme bases: they were left at
// the pre-redesign near-black through the neumorphic repaint, so every installed app showed a #0A0A0B
// splash butted against a #2A2A2E page. No screenshot can catch this — microlink does not render OS chrome.
// MEASURED off theme.css, never written here: a hex typed beside the thing it describes is right until the
// base moves, then silently wrong in every app at once (76 chrome files carried #2A2A2E after the black
// repaint). runtime_test.js still cross-checks every app's chrome against the same two bases.
import { pkgRoot } from "../runtime/pkgroot.js";
const themeCss = await Deno.readTextFile(new URL("packages/runtime/theme.css", pkgRoot(import.meta.url, 2)));
const baseOf = (t) => {
  const i = themeCss.indexOf(`[data-theme="${t}"] {`);
  const m = /--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(themeCss.slice(i));
  if (i < 0 || !m) throw new Error(`theme.css: no --color-base-100 for [data-theme="${t}"]`);
  return m[1].toUpperCase();
};
const themeColor = isLight ? baseOf("signal-light") : baseOf("signal");
const bg = themeColor;
const lang = i18n.uk ? "uk" : locales[0];

// index.html composes the spec from spec.json + each i18n/<locale>.json (imported as JSON modules) and
// hands start() a { ...spec, i18n } — so the translations stay isolated per-language files on disk.
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

// Instant app-shell (2027 first-paint pattern): painted straight from HTML on the FIRST frame, before the
// Tailwind CDN script or any ESM module has run — theme.css is a render-blocking <link>, so its vars are
// already available (fallbacks cover the microsecond before). It draws the header wordmark, a thin sliding
// loading line, and the dock island in the EXACT places the real chrome lands, so when the runtime mounts it
// simply fades to the live app — no blank frame, no white flash, no spinner. index.js removes #boot after
// the first render. Plain CSS only (Tailwind utilities don't exist yet).
// The shell wears the LUMINOUS material (theme.css): the header and the dock are the page with a lit edge
// (--sf-lift2 — rim + top edge), never a shadow pair. Fallbacks are the dark theme's own values.
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
  display: "standalone", orientation: "any", theme_color: themeColor, background_color: bg, lang, icons,
}, null, 2) + "\n";

// A placeholder worker, replaced the moment `deploy/sw.mjs` runs (which is gated in CI): the real precache
// manifest is derived from the app's finished import graph, which does not exist yet at scaffold time.
const sw = `// PLACEHOLDER — run \`deno run -A deploy/sw.mjs\` to generate the real worker for this app.\n` +
  `self.MS = { app: ${JSON.stringify(spec.id)}, version: "scaffold", precache: ["./", "./index.html"] };\n` +
  `importScripts("/_rt/sw-core.js");\n`;

// icon.svg: brand paths on a rounded tile (matches the hand-authored icons; PNGs are a CI concern)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${brand.bg}"/><g transform="translate(81.92,81.92) scale(14.506666666666666)" fill="none" stroke="${brand.fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${brandPaths}</g></svg>\n`;

const files = { "index.html": indexHtml, "manifest.json": manifest, "sw.js": sw, "icon.svg": iconSvg };
// An app with a luminous master (icon.webp) owns its icon.svg — tools/art/icon-import.mjs wrote it as the
// wrapper of that art, and the brand tile above is only the fallback for an app that has no art yet.
const hasArt = await has(`${dir}/icon.webp`);
let wrote = 0;
for (const [name, content] of Object.entries(files)) {
  const p = `${dir}/${name}`;
  if (name === "icon.svg" && hasArt) { console.log(`  · ${name} (luminous art, kept)`); continue; }
  if (!force && (await has(p))) { console.log(`  · ${name} (exists, kept)`); continue; }
  await Deno.writeTextFile(p, content);
  console.log(`  ✓ ${name}`);
  wrote++;
}
console.log(`\nscaffolded ${dir} [${mode} mode] — ${wrote} file(s) written`);
