// microspec — generate the store launcher's data. Scans every app's spec.json + brand.json and writes
// apps/home/apps.json (the grid items the `home` store app renders). Run by build.mjs, and standalone
// whenever an app is added/removed:
//   deno run -A deploy/manifest.mjs
//
// A tile reproduces the app's real PNG icon from brand colours + the iconify glyph (bg rect + fg glyph),
// so it looks identical in dev and prod with no image dependency. `home` is excluded (a store doesn't
// list itself).
import { readLocales } from "../packages/gen/compose.mjs";

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));
// app version = commits touching the app (matches deploy/build.mjs) — so the store can flag "new version".
async function gitCount(path) {
  try { const { stdout, success } = await new Deno.Command("git", { args: ["rev-list", "--count", "HEAD", "--", path], stdout: "piped", stderr: "null" }).output(); return success ? (parseInt(new TextDecoder().decode(stdout).trim(), 10) || 0) : 0; } catch { return 0; }
}

export async function buildManifest() {
  const apps = [];
  for await (const a of Deno.readDir("apps")) {
    if (!a.isDirectory || a.name === "home" || !(await has(`apps/${a.name}/spec.json`))) continue;
    const spec = await readJson(`apps/${a.name}/spec.json`);
    const i18n = await readLocales(`apps/${a.name}`);
    const d = i18n.uk || i18n.en || {};
    const brand = (await has(`apps/${a.name}/brand.json`)) ? await readJson(`apps/${a.name}/brand.json`) : { bg: "#1f2430", fg: "#a78bfa" };
    apps.push({
      id: a.name,
      title: d.title || a.name,
      tagline: d.profTagline || "",
      glyph: spec.profile?.icon || spec.tabs?.[0]?.icon || "lucide:box",
      bg: brand.bg,
      fg: brand.fg,
      href: `./${a.name}/`,
      version: spec.version || ("1." + (await gitCount(`apps/${a.name}`))),
    });
  }
  apps.sort((x, y) => x.title.localeCompare(y.title, "uk"));
  return apps;
}

if (import.meta.main) {
  const apps = await buildManifest();
  await Deno.writeTextFile("apps/home/apps.json", JSON.stringify(apps, null, 2) + "\n");
  console.log(`manifest: ${apps.length} apps → apps/home/apps.json (${apps.map((a) => a.id).join(", ")})`);
}
