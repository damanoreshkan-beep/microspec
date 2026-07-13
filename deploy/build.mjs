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

// 1) shared runtime → dist/_rt (all .js except unit tests)
for await (const e of Deno.readDir("packages/runtime")) {
  const keep = (e.name.endsWith(".js") && !e.name.endsWith("_test.js")) || e.name.endsWith(".css");
  if (e.isFile && keep) await Deno.copyFile(`packages/runtime/${e.name}`, `${OUT}/_rt/${e.name}`);
}

// 2) each app → dist/<id>, EXCEPT `home` which is the store launcher and assembles at the site root
//    (dist/). Skip dev-only e2e; rewrite /_rt/ imports to the right relative depth per destination.
const ids = [];
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const atRoot = a.name === "home";
  const outDir = atRoot ? OUT : `${OUT}/${a.name}`;
  const rt = (s) => s.replaceAll("/_rt/", atRoot ? "./_rt/" : "../_rt/");
  await Deno.mkdir(outDir, { recursive: true });
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs") continue;
    if (/\.(html|js|json|svg|png|webmanifest)$/.test(f.name)) {
      if (/\.(html|js|json)$/.test(f.name)) {
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
  // PWA icons — real PNGs (installability); generated from the app's brand
  if (await has(`apps/${a.name}/brand.svg`)) {
    const brand = (await has(`apps/${a.name}/brand.json`)) ? JSON.parse(await Deno.readTextFile(`apps/${a.name}/brand.json`)) : { bg: "#1f2430", fg: "#a78bfa" };
    const paths = (await Deno.readTextFile(`apps/${a.name}/brand.svg`)).trim();
    await generateAppIcons(`${outDir}/icons`, brand, paths);
  }
  ids.push(a.name);
}

await Deno.writeTextFile(`${OUT}/.nojekyll`, "");
console.log(`built dist/ — ${ids.length} apps (home → site root): ${ids.join(", ")}`);
