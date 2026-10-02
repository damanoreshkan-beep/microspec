import { buildTailwind } from "./tailwind.mjs";
import { generateAppIcons } from "./icons.mjs";
import { BOOT_BEACON } from "./boot-beacon.mjs";
import { APPS } from "../tools/graph.mjs";

const dec = new TextDecoder();

async function copyTree(src, dst) {
  await Deno.mkdir(dst, { recursive: true });
  for await (const e of Deno.readDir(src)) {
    if (e.isFile) await Deno.copyFile(`${src}/${e.name}`, `${dst}/${e.name}`);
    else if (e.isDirectory) await copyTree(`${src}/${e.name}`, `${dst}/${e.name}`);
  }
}

export async function buildAppCompat({ srcDir, outDir, rtDir, sharedSources = [] }) {
  const html = await Deno.readTextFile(`${srcDir}/index.html`);

  const entry = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!entry) throw new Error(`no inline <script type=module> entry in ${srcDir}/index.html`);

  const importmap = (() => {
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    const im = m ? JSON.parse(m[1]) : { imports: {} };
    im.imports["/_rt/"] = `file://${rtDir}/`;
    im.imports["@microspec/core/runtime/"] = `file://${rtDir}/`;
    return im;
  })();

  const stage = `${outDir}/.stage`;
  await Deno.remove(stage, { recursive: true }).catch(() => {});
  await copyTree(srcDir, stage);
  await Deno.writeTextFile(`${stage}/entry.js`, entry[1]);
  await Deno.writeTextFile(`${stage}/importmap.json`, JSON.stringify(importmap, null, 2));

  // The bundle downloads the app's CDN graph, so a CI runner's bad minute fails it: three tries, then the
  // error carries the bundler's own words (the caller used to keep only the first line, which is the label).
  let bundle;
  for (let attempt = 1; attempt <= 3; attempt++) {
    bundle = await new Deno.Command("deno", {
      args: ["bundle", "--platform", "browser", "--minify", "--import-map", `${stage}/importmap.json`, `${stage}/entry.js`, "-o", `${outDir}/app.js`],
      stdout: "piped", stderr: "piped",
    }).output();
    if (bundle.success) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  await Deno.remove(stage, { recursive: true }).catch(() => {});
  if (!bundle.success) throw new Error(`deno bundle failed 3 times: ${dec.decode(bundle.stderr).replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-12).join(" ⏎ ")}`);

  const appJs = [];
  for await (const e of Deno.readDir(srcDir)) {
    if (e.isFile && e.name.endsWith(".js")) appJs.push(await Deno.readTextFile(`${srcDir}/${e.name}`));
  }
  const { css, candidateCount } = await buildTailwind([html, ...appJs, ...sharedSources]);
  await Deno.writeTextFile(`${outDir}/app.css`, css);

  let out = html
    .replace(/<head>/, `<head>\n  <script>${BOOT_BEACON}</script>`)
    .replace(/[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4"><\/script>\n?/, "")
    .replace(/[ \t]*<link href="https:\/\/cdn\.jsdelivr\.net\/npm\/daisyui@5[^"]*"[^>]*>\n?/g, "")
    .replace(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\n?/, "")
    .replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module" src="app.js"></script>');
  out = /<link href="\/_rt\/theme\.css"[^>]*>/.test(out)
    ? out.replace(/(<link href="\/_rt\/theme\.css"[^>]*>)/, '$1\n  <link rel="stylesheet" href="app.css">')
    : out.replace(/<\/head>/, '  <link rel="stylesheet" href="app.css">\n</head>');
  out = out.replaceAll("/_rt/", "../_rt/");
  await Deno.writeTextFile(`${outDir}/index.html`, out);

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

if (import.meta.main) {
  const ROOT = Deno.cwd();
  const id = Deno.args[0] || "store";
  const RT = await Deno.stat(`${ROOT}/rt/index.js`).then(() => `${ROOT}/rt`).catch(() => `${ROOT}/packages/runtime`);
  const APP = `${ROOT}/${APPS}/${id}`, OUT = `${ROOT}/dist-compat/${id}`;
  await Deno.mkdir(OUT, { recursive: true });
  for await (const f of Deno.readDir(APP)) {
    if (f.isFile && /\.(json|svg|webp|webmanifest)$/.test(f.name) && !["spec.json", "brand.json", "apps.json"].includes(f.name)) {
      await Deno.copyFile(`${APP}/${f.name}`, `${OUT}/${f.name}`);
    }
  }
  await Deno.copyFile(`${APP}/sw.js`, `${OUT}/sw.js`).catch(() => {});
  if (await Deno.stat(`${APP}/brand.svg`).then(() => true).catch(() => false)) {
    const brand = await Deno.readTextFile(`${APP}/brand.json`).then(JSON.parse).catch(() => ({ bg: "#1f2430", fg: "#a78bfa" }));
    const master = await Deno.readFile(`${APP}/icon.webp`).catch(() => null);
    await generateAppIcons(`${OUT}/icons`, brand, (await Deno.readTextFile(`${APP}/brand.svg`)).trim(), master);
  }
  await Deno.mkdir(`${ROOT}/dist-compat/_rt`, { recursive: true });
  const isF = async (e) => e.isFile || (e.isSymlink && (await Deno.stat(`${RT}/${e.name}`).catch(() => ({ isFile: false }))).isFile);
  for await (const f of Deno.readDir(RT)) if (f.name.endsWith(".css") && (await isF(f))) await Deno.copyFile(`${RT}/${f.name}`, `${ROOT}/dist-compat/_rt/${f.name}`);
  const sharedSources = [];
  for await (const f of Deno.readDir(RT)) if (f.name.endsWith(".js") && !f.name.endsWith("_test.js") && (await isF(f))) sharedSources.push(await Deno.readTextFile(`${RT}/${f.name}`));
  const r = await buildAppCompat({ srcDir: APP, outDir: OUT, rtDir: RT, sharedSources });
  console.log(`built dist-compat/${id}/  app.js ${r.jsKB}KB  app.css ${r.cssKB}KB  (${r.candidateCount} tw candidates) — compat gate clean`);
}
