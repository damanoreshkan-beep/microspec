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
    apps.push({
      id: a.name,
      title: d.title || a.name,                  // the fallback the view falls back TO (uk-first, unchanged)
      titles: byLocale("title"),
      tagline: d.profTagline || "",
      taglines: byLocale("profTagline"),
      glyph: spec.profile?.icon || spec.tabs?.[0]?.icon || "lucide:box",
      art,
      icon,
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
