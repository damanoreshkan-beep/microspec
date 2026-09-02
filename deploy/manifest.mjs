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

/**
 * Scans apps/ (every directory with a spec.json, the store itself excluded) and builds the launcher's grid items.
 * @returns the app entries sorted by title (uk collation), ready to be written as apps/store/apps.json
 */
export async function buildManifest() {
  const apps = [];
  for await (const a of Deno.readDir("apps")) {
    if (!a.isDirectory || a.name === "store" || !(await has(`apps/${a.name}/spec.json`))) continue;
    const spec = await readJson(`apps/${a.name}/spec.json`);
    const i18n = await readLocales(`apps/${a.name}`);
    const d = i18n.uk || i18n.en || {};
    // Every OTHER string in the farm has en+uk parity — the preflight gate fails a build that drops one.
    // The launcher was the exception, and it is the farm's front door: one title was baked per app here,
    // so an English store listed sixty Ukrainian names under English chrome. The tile text is app-authored
    // and therefore cannot live in the store's own dict, so the manifest carries BOTH and the view picks.
    const byLocale = (key) => Object.fromEntries(
      Object.entries(i18n).map(([l, dict]) => [l, dict?.[key]]).filter(([, v]) => v),
    );
    const brand = (await has(`apps/${a.name}/brand.json`)) ? await readJson(`apps/${a.name}/brand.json`) : { bg: "#1f2430", fg: "#a78bfa" };
    // The app's REAL icon paths (lucide-stroke, inheriting stroke → theme-adaptive in the store tile). `glyph`
    // stays as a fallback for any app without a brand.svg.
    const art = (await has(`apps/${a.name}/brand.svg`)) ? (await Deno.readTextFile(`apps/${a.name}/brand.svg`)).trim() : "";
    // The luminous icon (apps/<id>/icon.webp + the icon.svg wrapper the grid loads) — the store shows the
    // picture itself when it exists; `art`/`glyph` stay as the fallback for an app without one.
    const icon = await has(`apps/${a.name}/icon.webp`);
    // The app page's material (2026-08-31): its SCREENS (the tab labels, per locale — what the app is made
    // of, in the app's own words) and whether the store holds a screenshot of it (apps/store/assets/shot-<id>
    // .webp, imported from the deploy's dist-eye artifact by tools/art/shots-import.mjs).
    const tabs = (spec.tabs ?? []).filter((t) => t.type !== "profile");
    const screens = Object.fromEntries(
      Object.entries(i18n).map(([l, dict]) => [l, tabs.map((t) => (t.label && dict?.[t.label]) || (t.titleKey && dict?.[t.titleKey]) || null).filter(Boolean)]).filter(([, v]) => v.length),
    );
    // One REAL capture per screen (tab), in the app's populated ?mock state — apps/store/assets/shot-<id>--
    // <tab>.webp, from vps/eye-batch.mjs on the deployed farm via tools/art/shots-import.mjs. The array is
    // the tab ids that have one, in tab order, so the app page's carousel and the featured card's ground
    // (the first) never point at a file that is not there.
    const shots = [];
    for (const tb of tabs) if (await has(`apps/store/assets/shot-${a.name}--${tb.id}.webp`)) shots.push(tb.id);
    apps.push({
      id: a.name,
      title: d.title || a.name,                  // the fallback the view falls back TO (uk-first, unchanged)
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
      version: spec.version || ("1." + (await gitCount(`apps/${a.name}`))),
      category: spec.category || "feeds",
      // Hardware an app cannot work without. Six apps open a HackRF One over WebUSB — 9% of the farm whose
      // entire surface is a "connect your device" screen for anyone without a ~$300 SDR. The store owes
      // that disclosure BEFORE the tap, not after. Carried from spec.json `needs`, which only became
      // trustworthy in 9c189eb (it had drifted: all six used WebUSB and none declared it).
      needs: [...new Set((spec.tabs ?? []).flatMap((t) => t.needs ?? []))].sort(),
      // Which device the `usb` note names. Defaults to the HackRF (six apps); a non-HackRF USB app (ax56, an
      // RTL8852AU) sets `spec.deviceNote` to its own store i18n key so the disclosure names the right hardware.
      ...(spec.deviceNote ? { deviceNote: spec.deviceNote } : {}),
      // The app's birthday (scaffold stamps it on the first scaffold). The store's Fresh rubric is this field
      // and a window — the newest apps join by being scaffolded and leave by ageing, nobody curates a list.
      ...(spec.added ? { added: spec.added } : {}),
    });
  }
  apps.sort((x, y) => x.title.localeCompare(y.title, "uk"));
  return apps;
}

if (import.meta.main) {
  const apps = await buildManifest();
  await Deno.writeTextFile("apps/store/apps.json", JSON.stringify(apps, null, 2) + "\n");
  console.log(`manifest: ${apps.length} apps → apps/store/apps.json (${apps.map((a) => a.id).join(", ")})`);
}
