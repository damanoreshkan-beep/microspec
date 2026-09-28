/* @ts-self-types="./manifest.d.mts" */
/**
 * # manifest — the launcher list: an app's identity outside its own folder
 *
 * The store is the farm's front door, and it cannot read sixty spec files at load. This script scans every
 * app directory with a spec.json (the store itself excluded — a store does not list itself), reads its
 * locales, brand and icon material, and writes the grid items the store renders to apps/store/apps.json.
 * A tile reproduces the app's real icon from brand colours plus the glyph, so dev and prod look identical
 * with no image dependency. Every other string in the farm has en+uk parity; the launcher was the exception
 * and listed sixty Ukrainian names under English chrome, so the manifest now carries titles and taglines
 * per locale and the view picks. It also carries the hardware an app cannot work without, because the
 * store owes that disclosure before the tap, not after.
 *
 * ![The manifest node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-manifest.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/manifest
 * ```
 * No consumer task; `deno task 8n8 manifest` runs it as the 8n8 node `manifest`. deploy/build.mjs imports
 * {@link buildManifest} and writes the same file itself when the tree has an apps/store.
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in (apps/ under the current directory).
 *
 * ## What it checks / produces
 * - Writes apps/store/apps.json: an array sorted by title with Ukrainian collation, one entry per app:
 *   `id`, `title` (uk-first fallback), `titles` and `taglines` per locale (from `title` / `profTagline`),
 *   `glyph` (profile icon, else the first tab's icon, else `lucide:box`), `art` (brand.svg text),
 *   `icon` (whether icon.webp exists), `screens` (per-locale tab labels, profile tabs excluded), `shots`
 *   (tab ids that have apps/store/assets/shot-id--tab.webp, in tab order), `bg` / `fg` (brand.json, or
 *   `#1f2430` / `#a78bfa`), `href`, `version`, `category` (`feeds` by default), `needs` (the sorted union
 *   of every tab's `needs`), `deviceNote` when the spec names one, and `added` (the app's birthday,
 *   `YYYY-MM-DD`, stamped into spec.json by scaffold on the first scaffold) when the spec carries it — the
 *   store's Fresh rubric lists the newest apps by it and drops them as they age.
 * - `version` is `spec.version`, or `1.` plus the number of commits touching the app — the same count
 *   deploy/build.mjs uses, so the store can flag a new version. Outside a git tree the count is 0.
 * - A directory without spec.json is skipped, never an error. brand.json, brand.svg and icon.webp are
 *   optional; a missing one falls back to the defaults above.
 * - Prints the app count, the output path and the ids it wrote.
 *
 * ## Exit codes
 * - 0 — apps/store/apps.json written.
 * - 1 — an uncaught throw: no apps/ directory, a spec or locale file that is not valid JSON, or no
 *   apps/store directory to write into (the standalone run does not create it; build.mjs guards on it).
 *
 * ## Where it sits
 * ship · script (frozen 2026-06-19) · needs: scaffold · needed by: no node lists it, and it is not in the
 * `gates` flow — it is reached through the `all` flow, by name, or through the build:
 *
 * ![apps + /_rt → dist → dist-eye → rsync → live](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Why
 * The launcher list (apps/store/apps.json) — the app's identity outside its own folder.
 * @module
 */
import { readLocales } from "../packages/gen/compose.mjs";
import { APPS } from "../tools/graph.mjs";

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));
async function gitCount(path) {
  try { const { stdout, success } = await new Deno.Command("git", { args: ["rev-list", "--count", "HEAD", "--", path], stdout: "piped", stderr: "null" }).output(); return success ? (parseInt(new TextDecoder().decode(stdout).trim(), 10) || 0) : 0; } catch { return 0; }
}

/**
 * Scans apps/ (every directory with a spec.json, the store itself excluded) and builds the launcher's grid items.
 * @returns the app entries sorted by title (uk collation), ready to be written as apps/store/apps.json
 */
export async function buildManifest() {
  const apps = [];
  for await (const a of Deno.readDir(APPS)) {
    if (!a.isDirectory || a.name === "store" || !(await has(`${APPS}/${a.name}/spec.json`))) continue;
    const spec = await readJson(`${APPS}/${a.name}/spec.json`);
    if (spec.hidden) continue;
    const i18n = await readLocales(`${APPS}/${a.name}`);
    const d = i18n.uk || i18n.en || {};
    const byLocale = (key) => Object.fromEntries(
      Object.entries(i18n).map(([l, dict]) => [l, dict?.[key]]).filter(([, v]) => v),
    );
    const brand = (await has(`${APPS}/${a.name}/brand.json`)) ? await readJson(`${APPS}/${a.name}/brand.json`) : { bg: "#1f2430", fg: "#a78bfa" };
    const art = (await has(`${APPS}/${a.name}/brand.svg`)) ? (await Deno.readTextFile(`${APPS}/${a.name}/brand.svg`)).trim() : "";
    const icon = await has(`${APPS}/${a.name}/icon.webp`);
    const tabs = (spec.tabs ?? []).filter((t) => t.type !== "profile");
    const screens = Object.fromEntries(
      Object.entries(i18n).map(([l, dict]) => [l, tabs.map((t) => (t.label && dict?.[t.label]) || (t.titleKey && dict?.[t.titleKey]) || null).filter(Boolean)]).filter(([, v]) => v.length),
    );
    const shots = [];
    for (const tb of tabs) if (await has(`${APPS}/store/assets/shot-${a.name}--${tb.id}.webp`)) shots.push(tb.id);
    apps.push({
      id: a.name,
      title: d.title || a.name,
      titles: byLocale("title"),
      tagline: d.profTagline || "",
      taglines: byLocale("profTagline"),
      glyph: spec.profile?.icon || spec.tabs?.[0]?.icon || "lucide:box",
      art,
      icon,
      screens,
      shots,
      bg: brand.bg,
      fg: brand.fg,
      href: `./${a.name}/`,
      version: spec.version || ("1." + (await gitCount(`${APPS}/${a.name}`))),
      category: spec.category || "feeds",
      needs: [...new Set((spec.tabs ?? []).flatMap((t) => t.needs ?? []))].sort(),
      ...(spec.deviceNote ? { deviceNote: spec.deviceNote } : {}),
      ...(spec.added ? { added: spec.added } : {}),
    });
  }
  apps.sort((x, y) => x.title.localeCompare(y.title, "uk"));
  return apps;
}

if (import.meta.main) {
  const apps = await buildManifest();
  await Deno.writeTextFile(`${APPS}/store/apps.json`, JSON.stringify(apps, null, 2) + "\n");
  console.log(`manifest: ${apps.length} apps → ${APPS}/store/apps.json (${apps.map((a) => a.id).join(", ")})`);
}
