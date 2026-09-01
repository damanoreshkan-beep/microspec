/* @ts-self-types="./readme.d.mts" */
/**
 * # readme — every app's page, generated from the app itself
 *
 * Each app gets one deterministic, one-screen README.md built from its own `spec.json` + `i18n/` + brand:
 * the icon, the title and tagline, a screenshot when one exists, a badge row for what it is and what it
 * can reach, and relative links back into the farm. The page is a function of the app, so a change to
 * the app's copy makes the page stale — and staleness is a named failure, not a drift nobody notices:
 * `--check` is the 8n8 gate node `readme`. No infrastructure URLs: the READMEs travel with the public repo
 * and say nothing about where the live farm is hosted. A CLI script — it exports nothing.
 *
 * ![The 8n8 pipeline with the readme node lit](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-readme.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/readme            # (re)generate apps/<id>/README.md for every app
 * deno run -A jsr:@microspec/core/readme --check    # the gate: exit 1 if any README is stale
 * ```
 * `deno task gates` runs it as the 8n8 node `readme` with `--check`. The `demo` node runs it without the
 * flag as the last step of seeding `apps/books` (authorless → scaffold → sw → readme) in a tree that
 * carries no apps of its own.
 *
 * ## Flags and arguments
 * | flag | meaning |
 * | --- | --- |
 * | `--check` | compare only: report every app whose README no longer matches, write nothing |
 *
 * No positional arguments — it walks every `apps/<id>` that has a `spec.json`, in sorted order.
 *
 * ## What it produces
 * `apps/<id>/README.md`, one screen, in this order:
 * - `<img src="icon.svg">`, then `# title` — the `uk` dictionary wins over `en` (`title`, then the id).
 * - the lede: `profTagline` or `tagline`, else "title — part of the microspec farm".
 * - the badge row (shields.io, flat-square): the `category` in the farm accent, one shield per declared
 *   capability (`needs` → `WebUSB`, `Camera`, `Bluetooth`, `AI`, …), then `offline` and `installable`.
 * - `docs/shots/<id>.png` at 640px when the screenshot exists.
 * - the facts line: **Screens** (every non-profile tab's label, resolved through i18n), **Capabilities**,
 *   **Offline**, **Installable**.
 * - a link to the farm root and the store, and the footer naming this generator.
 *
 * Locales are read through `readLocales` from `packages/gen/compose.mjs`, the same reader the runtime
 * composes with. The generated text is byte-stable, so the gate is a string equality.
 *
 * Green is `readme: N app READMEs up to date`. Red is `stale app READMEs (run: deno run -A
 * deploy/readme.mjs): a, b, c` — the ids to regenerate. A plain run prints `readme: N written, M unchanged`.
 *
 * ## Exit codes
 * - `0` — every README matches its app (`--check`), or the READMEs were written.
 * - `1` — `--check` found at least one stale README.
 *
 * ## Where it sits
 * gate · script · needs: `scaffold`, `demo` · needed by: none — a leaf of the `gates` flow; `push` does
 * not gate on it, `deno task gates` does. `scaffold` precedes it because the page links `icon.svg`, and
 * `demo` precedes it because the core tree has no apps until the demo seeds one.
 *
 * ## Why
 * Each app's README is a one-screen card generated from its spec + i18n. Change the app's copy and the
 * page drifts, so the regeneration is a gate: `--check` fails when a README no longer matches its app.
 * @module
 */
// microspec — per-app README generator. Each app gets ONE deterministic, one-screen "card" built from its
// own spec.json + i18n + brand, so every app has a premium page and none drifts from its copy. `--check`
// fails when an app's spec or strings changed but its README did not — a gate node, exactly like sw.mjs.
//
//   deno run -A deploy/readme.mjs            # (re)generate apps/<id>/README.md for every app
//   deno run -A deploy/readme.mjs --check    # fail (exit 1) if any is stale — the gate
//
// Deliberately COMPACT (one screen): the app's icon, its title + tagline, a screenshot when one exists, a
// bright badge row for what it is and what it can reach, and relative links back into the farm. No infra
// URLs — the READMEs travel with the public repo and say nothing about where the live farm is hosted.
import { readLocales } from "../packages/gen/compose.mjs";

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));

// A capability id → the human name + a shield colour. The farm's own accent (neon) marks the app's category;
// capabilities are a cooler grey so the eye lands on the category first.
const ACCENT = "C13BFF";                 // the one farm accent (noir neon)
const CAP = {
  usb: "WebUSB", camera: "Camera", sensors: "Sensors", audio: "Audio", geo: "Location",
  storage: "Offline store", clipboard: "Clipboard", share: "Share", wakelock: "Wake lock",
  ble: "Bluetooth", ai: "AI", background: "Background audio", notify: "Notifications",
};
const enc = (s) => encodeURIComponent(String(s)).replace(/-/g, "--").replace(/_/g, "__");
const shield = (label, value, color) => `![${label}](https://img.shields.io/badge/${enc(label)}-${enc(value)}-${color}?style=flat-square)`;

async function build(dir, id) {
  const spec = await readJson(`${dir}/spec.json`);
  const i18n = await readLocales(dir);
  const dict = i18n.uk || i18n.en || {};
  const en = i18n.en || dict;
  const title = dict.title || en.title || id;
  const tagline = (dict.profTagline || dict.tagline || en.profTagline || "").trim();
  const cat = spec.category || "app";
  const needs = Array.isArray(spec.needs) ? spec.needs : [];
  const tabs = (spec.tabs || [])
    .filter((t) => t.type !== "profile")
    .map((t) => (t.label && dict[t.label]) || (t.label && en[t.label]) || t.id);
  const shot = (await has(`docs/shots/${id}.png`)) ? `../../docs/shots/${id}.png` : null;

  const capBadges = needs.length
    ? needs.map((n) => shield("cap", CAP[n] || n, "000000")).join(" ")
    : "";
  const badges = [
    shield("", cat, ACCENT),
    capBadges,
    shield("", "offline", "1F6B42"),
    shield("", "installable", "000000"),
  ].filter(Boolean).join(" ");

  const lede = tagline || `${title} — part of the microspec farm.`;
  const facts = [
    tabs.length ? `**Screens** ${tabs.join(" · ")}` : null,
    `**Capabilities** ${needs.length ? needs.map((n) => CAP[n] || n).join(" · ") : "—"}`,
    `**Offline** yes`,
    `**Installable** yes`,
  ].filter(Boolean).join("  ·  ");

  return `<div align="center">

<img src="icon.svg" width="84" height="84" alt="${title}">

# ${title}

**${lede}**

${badges}
${shot ? `\n<br>\n\n<img src="${shot}" width="640" alt="${title}">\n` : ""}
</div>

---

${facts}

Part of the **[microspec farm](../../)** — an AI-authored, gated micro-PWA. Every screen is accessible,
responsive, installable and offline by construction. Browse the whole set from the **[store](../store/)**.

<sub>Generated from \`spec.json\` + \`i18n/\` by \`deploy/readme.mjs\` — edit the app, not this file.</sub>
`;
}

const apps = [];
for await (const e of Deno.readDir("apps")) if (e.isDirectory && (await has(`apps/${e.name}/spec.json`))) apps.push(e.name);
apps.sort();

const check = Deno.args.includes("--check");
const stale = [];
let wrote = 0;
for (const id of apps) {
  const dir = `apps/${id}`;
  const md = await build(dir, id);
  const p = `${dir}/README.md`;
  const cur = (await has(p)) ? await Deno.readTextFile(p) : null;
  if (cur === md) continue;
  if (check) { stale.push(id); continue; }
  await Deno.writeTextFile(p, md);
  wrote++;
}

if (check) {
  if (stale.length) {
    console.error(`stale app READMEs (run: deno run -A deploy/readme.mjs): ${stale.join(", ")}`);
    Deno.exit(1);
  }
  console.log(`readme: ${apps.length} app READMEs up to date`);
} else {
  console.log(`readme: ${wrote} written, ${apps.length - wrote} unchanged`);
}
