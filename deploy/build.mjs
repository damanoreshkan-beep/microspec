// microspec — assemble the farm into a static site for GitHub Pages. No backend: apps use the
// direct-first CORS chain (feed.js). Output: dist/_rt (shared runtime), dist/<app>/ per app, and the
// `home` store app assembled at the site ROOT (dist/index.html) as the launcher. Absolute `/_rt/`
// imports become relative `../_rt/` (or `./_rt/` at root) so the site works at any base path.
//   deno run -A deploy/build.mjs

import { generateAppIcons } from "./icons.mjs";
import { buildManifest } from "./manifest.mjs";

const OUT = "dist";
const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

await Deno.remove(OUT, { recursive: true }).catch(() => {});
await Deno.mkdir(`${OUT}/_rt`, { recursive: true });

// 0) refresh the store launcher's app list from the current specs (home/data.js imports it)
await Deno.writeTextFile("apps/home/apps.json", JSON.stringify(await buildManifest(), null, 2) + "\n");

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

// 2) each app → dist/<id>; the `home` store goes to dist/store/ (NOT the root) so its manifest scope
//    (/…/store/) does NOT envelop the apps (/…/<id>/). Sibling scopes = each app stays independently
//    installable even when the store PWA is installed. The root is a redirect to ./store/ (below).
const ids = [];
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const outDir = a.name === "home" ? `${OUT}/store` : `${OUT}/${a.name}`;
  const rt = (s) => s.replaceAll("/_rt/", "../_rt/");   // everything is now one level deep under dist/
  await Deno.mkdir(outDir, { recursive: true });
  const appVer = "1." + (await gitCount(`apps/${a.name}`));   // app version = commits touching this app
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs") continue;
    if (/\.(html|js|json|svg|png|webmanifest)$/.test(f.name)) {
      if (f.name === "spec.json") {
        const spec = JSON.parse(await Deno.readTextFile(`apps/${a.name}/spec.json`));
        if (!spec.version) spec.version = appVer;               // stamp unless the author pinned one
        await Deno.writeTextFile(`${outDir}/spec.json`, rt(JSON.stringify(spec, null, 2) + "\n"));
      } else if (/\.(html|js|json)$/.test(f.name)) {
        await Deno.writeTextFile(`${outDir}/${f.name}`, rt(await Deno.readTextFile(`apps/${a.name}/${f.name}`)));
      } else {
        await Deno.copyFile(`apps/${a.name}/${f.name}`, `${outDir}/${f.name}`);
      }
    }
  }
  // per-locale translations live in an i18n/ subdir the top-level file loop skips — copy it through
  if (await has(`apps/${a.name}/i18n`)) {
    await Deno.mkdir(`${outDir}/i18n`, { recursive: true });
    for await (const lf of Deno.readDir(`apps/${a.name}/i18n`)) {
      if (lf.isFile && lf.name.endsWith(".json")) await Deno.copyFile(`apps/${a.name}/i18n/${lf.name}`, `${outDir}/i18n/${lf.name}`);
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
  ids.push(a.name);
}

// root → redirect to the store (which now lives in its own scope at /store/)
await Deno.writeTextFile(`${OUT}/index.html`, `<!doctype html><html lang="uk"><meta charset="utf-8"><title>microspec</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=./store/"><link rel="canonical" href="./store/"><script>location.replace("./store/"+location.search+location.hash)</script><body style="background:#0a0a0b"></body></html>\n`);
await Deno.writeTextFile(`${OUT}/.nojekyll`, "");
console.log(`built dist/ — ${ids.length} apps (home → /store/): ${ids.join(", ")}`);
