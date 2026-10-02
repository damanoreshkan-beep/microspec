/* @ts-self-types="./listing.d.mts" */
/**
 * # listing — an app has not shipped until its store card has: an icon, screenshots, words for people
 *
 * The store is where a person meets an app, and three things about that card were nobody's job: the icon,
 * the screenshots and the description. Every gate was green for an app with a placeholder glyph, no
 * pictures and a description written for its author ("WebGL field", "WebAssembly module", "k-anonymity") —
 * so each new app shipped that way and the owner asked for the same three fixes every time. This gate makes
 * them part of "done". It exports nothing.
 *
 * ![The listing node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-listing.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/listing --check
 * ```
 * `deno task gates` runs it as the 8n8 node `listing`. A tree with no `apps/store` has no card to check and passes.
 *
 * ## What it checks, per listed app
 * - **icon** — `icon.webp` (the art master), once any app in the tree has one.
 * - **screenshots** — `apps/store/assets/shot-<id>--<tab>.webp` and `…--light.webp` for every non-profile
 *   tab. `deno run -A jsr:@microspec/core/store-shots <id>` takes them from the working tree.
 * - **description** — `profTagline` in every locale: at most 240 characters; a first sentence of 12–90
 *   characters (the store shows it alone as the subtitle); and none of the words in `JARGON`. A description
 *   says what the person gets; how it is built belongs in RESEARCH.md.
 * - **catalog** — `apps/store/apps.json` agrees with the tree on icon, shots, titles and taglines (run
 *   `manifest` after changing any of them).
 *
 * ## Exit codes
 * - `0` — every card is complete, or there is no store.
 * - `1` — at least one card is not; each line names the app, the locale and the offending words.
 * @module
 */

import { APPS } from "../tools/graph.mjs";
import { buildManifest } from "./manifest.mjs";

const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

/** Words that describe how an app is built instead of what a person gets from it. */
export const JARGON = /\b(webgl|websocket|webassembly|wasm|webusb|webrtc|webview|audioworklet|pcm|api|pwa|json|indexeddb|localstorage|hls|cdn|https?|urls?|sideload|heatmap|shaders?|render\w*|synth\w*|k-anonymity|on-device|open[- ]source|oss)\b|(?<![\p{L}])(шейдер\p{L}*|рендер\p{L}*|синтез\p{L}*|семпл\p{L}*|k-анонімн\p{L}*|[мк]гц|[mk]hz)(?![\p{L}])/giu;

/**
 * What is wrong with one description, as the store will show it.
 * @param text the `profTagline` of one locale
 * @returns the problems, empty when the description is fit for a person
 */
export function taglineProblems(text) {
  const s = String(text || "").trim(), out = [];
  if (!s) return ["missing"];
  if (s.length > 240) out.push(`${s.length} characters (max 240)`);
  const first = /^(.{12,90}?[.!?—])\s/u.exec(s + " ")?.[1] ?? s;
  if (first.length < 12 || first.length > 90) out.push(`first sentence is ${first.length} characters (12–90: the store shows it alone)`);
  const words = [...new Set([...s.matchAll(JARGON)].map((m) => m[0]))];
  if (words.length) out.push(`says how it is built, not what a person gets: ${words.join(", ")}`);
  return out;
}

if (import.meta.main) {
  if (!(await has(`${APPS}/store/spec.json`))) { console.log("  ✓ no store in this tree — no cards to check"); Deno.exit(0); }
  const apps = await buildManifest();
  const anyArt = apps.some((a) => a.icon);
  let catalog = [];
  try { catalog = JSON.parse(await Deno.readTextFile(`${APPS}/store/apps.json`)); } catch { }
  const listed = new Map(catalog.map((a) => [a.id, a]));
  const bad = [];
  for (const a of apps) {
    const say = (m) => bad.push(`${a.id}: ${m}`);
    if (anyArt && !a.icon) say("no icon.webp — the card shows a placeholder glyph");
    const spec = JSON.parse(await Deno.readTextFile(`${APPS}/${a.id}/spec.json`));
    for (const t of (spec.tabs ?? []).filter((t) => t.type !== "profile")) {
      for (const light of ["", "--light"]) {
        if (!(await has(`${APPS}/store/assets/shot-${a.id}--${t.id}${light}.webp`))) say(`no screenshot of "${t.id}"${light ? " (light)" : ""} — run store-shots ${a.id}`);
      }
    }
    for (const [loc, text] of Object.entries(a.taglines)) for (const p of taglineProblems(text)) say(`description (${loc}) ${p}`);
    if (!Object.keys(a.taglines).length) say("no description (profTagline)");
    const c = listed.get(a.id), key = (x) => JSON.stringify([x?.icon, x?.shots, x?.titles, x?.taglines]);
    if (key(c) !== key(a)) say("apps/store/apps.json is stale for this app — run manifest");
  }
  if (!bad.length) { console.log(`  ✓ ${apps.length} store cards complete: icon, screenshots, a description for people`); Deno.exit(0); }
  for (const b of bad) console.error(`  ✗ ${b}`);
  console.error(`\n  ${bad.length} problem(s) on ${new Set(bad.map((b) => b.split(":")[0])).size} card(s). The store card is part of the app.`);
  Deno.exit(1);
}
