// microspec — app scaffolder (the deterministic half of authoring). The agent (LLM) writes only the
// app-specific files — spec.json (structure) + i18n/<locale>.json (translations, one file per language)
// + data.js (or view.js for a tool) — and this emits the identical boilerplate every app needs:
// index.html (composes spec + locale files, wired by mode), manifest.json, sw.js (network-first),
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
const mode = (await has(`${dir}/view.js`)) ? "tool" : (await has(`${dir}/stream.js`)) ? "stream" : "data";

const dict = i18n.uk || i18n.en || {};
const title = dict.title || spec.id;
const tagline = dict.profTagline || title;
const isLight = /light/.test(spec.theme || "");
const themeColor = isLight ? "#FAFAF9" : "#0A0A0B";
const bg = isLight ? "#FFFFFF" : "#0A0A0B";
const lang = i18n.uk ? "uk" : locales[0];

// index.html composes the spec from spec.json + each i18n/<locale>.json (imported as JSON modules) and
// hands start() a { ...spec, i18n } — so the translations stay isolated per-language files on disk.
const localeImports = locales.map((l) => `    import ${l} from "./i18n/${l}.json" with { type: "json" };`).join("\n");
const srcImport = mode === "tool" ? `    import * as views from "./view.js";`
  : mode === "stream" ? `    import { stream } from "./stream.js";`
  : `    import { load } from "./data.js";`;
const startArg = mode === "tool" ? "{ views }" : mode === "stream" ? "{ stream }" : "load";
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
const bootCss = `
    html,body{background:var(--color-base-200,#141416)}
    #boot{position:fixed;inset:0;z-index:60;background:var(--color-base-200,#141416);opacity:1;transition:opacity .4s ease;pointer-events:none}
    #boot.gone{opacity:0}
    #boot .bh{height:3.5rem;padding-top:env(safe-area-inset-top);display:flex;align-items:center;padding-left:1rem;background:color-mix(in oklch,var(--color-base-100,#0a0a0b) 80%,transparent);border-bottom:1px solid color-mix(in oklch,var(--color-base-content,#ececee) 10%,transparent)}
    #boot .bm{font-family:var(--font-mono,ui-monospace,monospace);text-transform:uppercase;letter-spacing:.05em;font-weight:700;font-size:1.02rem;color:var(--color-base-content,#ececee);opacity:.85}
    #boot .bb{position:absolute;left:0;right:0;top:calc(3.5rem + env(safe-area-inset-top));height:2px;overflow:hidden;background:color-mix(in oklch,var(--color-base-content,#ececee) 8%,transparent)}
    #boot .bb i{position:absolute;top:0;height:100%;width:38%;border-radius:2px;background:var(--color-primary,#ececee);animation:bootslide 1.1s cubic-bezier(.4,0,.2,1) infinite}
    #boot .bd{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + .75rem);width:12rem;height:3.25rem;border-radius:1.35rem;background:color-mix(in oklch,var(--color-base-100,#0a0a0b) 80%,transparent);border:1px solid color-mix(in oklch,var(--color-base-content,#ececee) 10%,transparent)}
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
      "motion": "https://esm.sh/motion@11.18.2"
    }
  }
  </script>
</head>
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
  display: "standalone", orientation: "portrait", theme_color: themeColor, background_color: bg, lang, icons,
}, null, 2) + "\n";

const sw = `const CACHE = "${spec.id}-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
// Network-first with REVALIDATION: fetch({cache:"no-cache"}) bypasses the browser HTTP cache (GitHub Pages
// sets max-age=600), so a fresh runtime/app deploy reaches installed PWAs immediately (304 when unchanged).
// Offline → fall back to the cached copy.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try { const r = await fetch(e.request, { cache: "no-cache" }); if (r && r.ok) c.put(e.request, r.clone()); return r; }
    catch { return (await c.match(e.request)) || Response.error(); }
  })());
});
`;

// icon.svg: brand paths on a rounded tile (matches the hand-authored icons; PNGs are a CI concern)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${brand.bg}"/><g transform="translate(81.92,81.92) scale(14.506666666666666)" fill="none" stroke="${brand.fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${brandPaths}</g></svg>\n`;

const files = { "index.html": indexHtml, "manifest.json": manifest, "sw.js": sw, "icon.svg": iconSvg };
let wrote = 0;
for (const [name, content] of Object.entries(files)) {
  const p = `${dir}/${name}`;
  if (!force && (await has(p))) { console.log(`  · ${name} (exists, kept)`); continue; }
  await Deno.writeTextFile(p, content);
  console.log(`  ✓ ${name}`);
  wrote++;
}
console.log(`\nscaffolded ${dir} [${mode} mode] — ${wrote} file(s) written`);
