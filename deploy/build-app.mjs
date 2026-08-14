// deploy/build-app.mjs — the Safari-16.1 compat overlay for ONE built app, Deno-native (no Node).
//
// `buildAppCompat` is called by deploy/build.mjs for EVERY app after the normal copy pass: it bundles the
// app's JS and precompiles its Tailwind CSS, then rewrites the app's dist index.html to load those instead
// of the runtime CDNs + import map + import attributes. Fixes the three 16.1 blockers BY CONSTRUCTION:
//   • `import … with {type:json}`      → deno bundle inlines the JSON
//   • `<script type=importmap>`+esm.sh → deno bundle resolves + inlines the deps
//   • `@tailwindcss/browser@4` (regex) → precompiled static app.css (tailwind.mjs)
// App SOURCE is never touched — dev stays zero-build/modern; this transform is BUILD-only.
// See docs/RESEARCH-safari16-compat.md.

import { buildTailwind } from "./tailwind.mjs";
import { generateAppIcons } from "./icons.mjs";

const dec = new TextDecoder();

async function copyTree(src, dst) {
  await Deno.mkdir(dst, { recursive: true });
  for await (const e of Deno.readDir(src)) {
    if (e.isFile) await Deno.copyFile(`${src}/${e.name}`, `${dst}/${e.name}`);
    else if (e.isDirectory) await copyTree(`${src}/${e.name}`, `${dst}/${e.name}`);
  }
}

// Bundle + precompile CSS + rewrite index.html INTO outDir (which already holds the normal-build output:
// manifest, icons, sw, i18n). srcDir = apps/<id> (has /_rt/ imports + the import map). rtDir = ABSOLUTE
// path to packages/runtime (for the file:// import-map entry that resolves the runtime's /_rt/ imports).
export async function buildAppCompat({ srcDir, outDir, rtDir }) {
  const html = await Deno.readTextFile(`${srcDir}/index.html`);

  const entry = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!entry) throw new Error(`no inline <script type=module> entry in ${srcDir}/index.html`);

  const importmap = (() => {
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    const im = m ? JSON.parse(m[1]) : { imports: {} };
    im.imports["/_rt/"] = `file://${rtDir}/`; // resolve the runtime's absolute /_rt/ imports for the bundler
    return im;
  })();

  // staging dir alongside the output, holding app sources + generated entry + import map so relative
  // imports (./spec.json, ./view.js, ./i18n/…) resolve during bundling.
  const stage = `${outDir}/.stage`;
  await Deno.remove(stage, { recursive: true }).catch(() => {});
  await copyTree(srcDir, stage);
  await Deno.writeTextFile(`${stage}/entry.js`, entry[1]);
  await Deno.writeTextFile(`${stage}/importmap.json`, JSON.stringify(importmap, null, 2));

  // 1) bundle JS (native): inlines JSON + esm.sh deps → no importmap / no `with` at runtime
  const bundle = await new Deno.Command("deno", {
    args: ["bundle", "--platform", "browser", "--minify", "--import-map", `${stage}/importmap.json`, `${stage}/entry.js`, "-o", `${outDir}/app.js`],
    stdout: "piped", stderr: "piped",
  }).output();
  await Deno.remove(stage, { recursive: true }).catch(() => {});
  if (!bundle.success) throw new Error(`deno bundle failed:\n${dec.decode(bundle.stderr).split("\n").slice(-8).join("\n")}`);

  // 2) precompile Tailwind + daisyui → static app.css (scan this app's HTML + view.js for classes)
  const viewJs = await Deno.readTextFile(`${srcDir}/view.js`).catch(() => "");
  const { css, candidateCount } = await buildTailwind([html, viewJs]);
  await Deno.writeTextFile(`${outDir}/app.css`, css);

  // 3) rewrite index.html: drop tailwind/daisyui CDN + importmap + inline module; link app.css/app.js
  let out = html
    .replace(/[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4"><\/script>\n?/, "")
    .replace(/[ \t]*<link href="https:\/\/cdn\.jsdelivr\.net\/npm\/daisyui@5[^"]*"[^>]*>\n?/g, "")
    .replace(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\n?/, "")
    .replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module" src="app.js"></script>');
  // link the precompiled CSS after theme.css if present, else in <head>
  out = /<link href="\/_rt\/theme\.css"[^>]*>/.test(out)
    ? out.replace(/(<link href="\/_rt\/theme\.css"[^>]*>)/, '$1\n  <link rel="stylesheet" href="app.css">')
    : out.replace(/<\/head>/, '  <link rel="stylesheet" href="app.css">\n</head>');
  out = out.replaceAll("/_rt/", "../_rt/"); // app lives one level deep under dist/<id>/
  await Deno.writeTextFile(`${outDir}/index.html`, out);

  // 4) per-app compat gate: none of the three blockers may survive in the shipped files
  const shipped = out + "\n" + (await Deno.readTextFile(`${outDir}/app.js`));
  const leaks = [
    [/with\s*\{\s*type/, "import-with"],
    [/type="importmap"/, "importmap"],
    [/cdn\.tailwindcss|@tailwindcss\/browser/, "tailwind-CDN"],
  ].filter(([re]) => re.test(shipped)).map(([, m]) => m);
  if (leaks.length) throw new Error(`compat leak in output: ${leaks.join(", ")}`);

  const jsKB = (Deno.statSync(`${outDir}/app.js`).size / 1024).toFixed(0);
  const cssKB = (Deno.statSync(`${outDir}/app.css`).size / 1024).toFixed(0);
  return { candidateCount, jsKB, cssKB };
}

// ── standalone CLI: build one app into dist-compat/<id>/ (for local spikes / device testing) ──────────────
if (import.meta.main) {
  const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const id = Deno.args[0] || "store";
  const APP = `${ROOT}/apps/${id}`, RT = `${ROOT}/packages/runtime`, OUT = `${ROOT}/dist-compat/${id}`;
  await Deno.mkdir(OUT, { recursive: true });
  // static assets + generated icons so a standalone build doesn't 404
  for await (const f of Deno.readDir(APP)) {
    if (f.isFile && /\.(json|svg|webmanifest)$/.test(f.name) && !["spec.json", "brand.json", "apps.json"].includes(f.name)) {
      await Deno.copyFile(`${APP}/${f.name}`, `${OUT}/${f.name}`);
    }
  }
  await Deno.copyFile(`${APP}/sw.js`, `${OUT}/sw.js`).catch(() => {});
  if (await Deno.stat(`${APP}/brand.svg`).then(() => true).catch(() => false)) {
    const brand = await Deno.readTextFile(`${APP}/brand.json`).then(JSON.parse).catch(() => ({ bg: "#1f2430", fg: "#a78bfa" }));
    await generateAppIcons(`${OUT}/icons`, brand, (await Deno.readTextFile(`${APP}/brand.svg`)).trim());
  }
  await Deno.mkdir(`${ROOT}/dist-compat/_rt`, { recursive: true });
  for await (const f of Deno.readDir(RT)) if (f.isFile && f.name.endsWith(".css")) await Deno.copyFile(`${RT}/${f.name}`, `${ROOT}/dist-compat/_rt/${f.name}`);
  const r = await buildAppCompat({ srcDir: APP, outDir: OUT, rtDir: RT });
  console.log(`built dist-compat/${id}/  app.js ${r.jsKB}KB  app.css ${r.cssKB}KB  (${r.candidateCount} tw candidates) — compat gate clean`);
}
