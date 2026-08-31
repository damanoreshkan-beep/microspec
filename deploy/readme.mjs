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
