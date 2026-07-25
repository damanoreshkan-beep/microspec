
import { generateAppIcons } from "./icons.mjs";
import { buildManifest } from "./manifest.mjs";

const OUT = "dist";
const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

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

await Deno.writeTextFile("apps/store/apps.json", JSON.stringify(await buildManifest(), null, 2) + "\n");

async function gitCount(path) {
  try { const { stdout, success } = await new Deno.Command("git", { args: ["rev-list", "--count", "HEAD", "--", path], stdout: "piped", stderr: "null" }).output(); return success ? (parseInt(new TextDecoder().decode(stdout).trim(), 10) || 0) : 0; } catch { return 0; }
}

const BUILD_SHA = (Deno.env.get("GITHUB_SHA") || "dev").slice(0, 7);
const CORE = "1." + (await gitCount("packages/runtime"));
for await (const e of Deno.readDir("packages/runtime")) {
  const keep = (e.name.endsWith(".js") && !e.name.endsWith("_test.js")) || e.name.endsWith(".css") || e.name.endsWith(".json");
  if (!e.isFile || !keep) continue;
  if (e.name === "build.js") await Deno.writeTextFile(`${OUT}/_rt/build.js`, `export const BUILD = "${BUILD_SHA}";\nexport const CORE = "${CORE}";\n`);
  else await Deno.copyFile(`packages/runtime/${e.name}`, `${OUT}/_rt/${e.name}`);
}

const ids = [];
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const outDir = `${OUT}/${a.name}`;
  const rt = (s) => s.replaceAll("/_rt/", "../_rt/");   
  await Deno.mkdir(outDir, { recursive: true });
  const appVer = "1." + (await gitCount(`apps/${a.name}`));   
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs") continue;
    if (/\.(html|js|json|svg|png|webmanifest)$/.test(f.name)) {
      if (f.name === "spec.json") {
        const spec = JSON.parse(await Deno.readTextFile(`apps/${a.name}/spec.json`));
        if (!spec.version) spec.version = appVer;               
        await Deno.writeTextFile(`${outDir}/spec.json`, rt(JSON.stringify(spec, null, 2) + "\n"));
      } else if (/\.(html|js|json)$/.test(f.name)) {
        await Deno.writeTextFile(`${outDir}/${f.name}`, rt(await Deno.readTextFile(`apps/${a.name}/${f.name}`)));
      } else {
        await Deno.copyFile(`apps/${a.name}/${f.name}`, `${outDir}/${f.name}`);
      }
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
    await generateAppIcons(`${outDir}/icons`, brand, paths);
  }
  await assertInstallable(outDir, a.name);   
  ids.push(a.name);
}

await Deno.writeTextFile(`${OUT}/index.html`, `<!doctype html><html lang="uk"><meta charset="utf-8"><title>microspec</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=./store/"><link rel="canonical" href="./store/"><script>location.replace("./store/"+location.search+location.hash)</script><body style="background:#0a0a0b"></body></html>\n`);
await Deno.writeTextFile(`${OUT}/.nojekyll`, "");
console.log(`built dist/ — ${ids.length} apps (store at /store/): ${ids.join(", ")}`);
