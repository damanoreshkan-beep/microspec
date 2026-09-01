/* @ts-self-types="./shell-gen.d.mts" */
/**
 * # shell — the Android action catalogue generates both sides, so they cannot drift
 *
 * The APK bridge and the page negotiate over one catalogue, packages/shell/actions.json. This script is
 * the only writer of the runtime's copy of it: it validates the catalogue against its draft 2020-12
 * schema, rejects duplicate ids and actions declared ahead of the bridge version, and emits
 * packages/runtime/shell-actions.js — the table shell.js reads to decide what the bridge it runs in can
 * do, and the mock the gate answers with, since CI runs Chromium and never the APK. The generated module
 * carries its own registry docs; a doc written into it by hand is deleted by the next regeneration.
 *
 * ![The shell node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-shell.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/shell            # write packages/runtime/shell-actions.js
 * deno run -A jsr:@microspec/core/shell --check    # fail if it is stale
 * ```
 * `deno task shell` writes; `deno task gates` runs `--check` as the 8n8 node `shell`.
 *
 * ## Flags and arguments
 * | Flag | Effect |
 * | --- | --- |
 * | `--check` | Compare the generated source with the file on disk; write nothing. |
 *
 * No other arguments. Every path is fixed off the package root (packages/runtime/pkgroot.js): the
 * catalogue at packages/shell/actions.json, its schema at packages/shell/catalogue.schema.json, the
 * output at packages/runtime/shell-actions.js.
 *
 * ## What it checks / produces
 * - `actions.json does not match catalogue.schema.json` — ajv (draft 2020-12, allErrors) lists every
 *   violation with its instance path.
 * - `duplicate action ids` — two actions with one id would silently shadow each other in the table; the
 *   schema cannot express uniqueness, so it is checked here.
 * - `minBridge ahead of bridgeVersion` — an action the current bridge template cannot possibly
 *   implement is a typo, not a plan.
 * - `✗ packages/runtime/shell-actions.js is stale — run deno task shell` (`--check` only) — the file on
 *   disk differs from what the catalogue generates now.
 * - Green: `✓ shell-actions.js matches the catalogue (N actions, bridge V)`.
 * - Written (without `--check`): packages/runtime/shell-actions.js, exporting `CATALOGUE_BRIDGE` (the
 *   bridge version the page was built against) and `ACTIONS` — id to `{ capability, kind, minBridge,
 *   android, mock }` — with its own `@ts-self-types` directive, module doc and a JSDoc per export, so
 *   JSR scores the generated entrypoint like any other.
 *
 * The Java dispatch registry is not generated from here: it lives in the private edge repo, is
 * hand-written against this catalogue, and a disagreement is caught on a real device.
 *
 * ## Exit codes
 * - `0` — the catalogue is valid and the table is written, or (`--check`) current.
 * - `1` — schema violation, duplicate id, minBridge ahead of the bridge, or (`--check`) a stale table.
 *
 * ## Where it sits
 * 8n8 node `shell` · phase gate · script, frozen 2026-07-28 · needs: none · needed by: none — a target of
 * the `gates` flow (the pre-push floor), so it starts the moment the flow does, in parallel with every
 * other root node.
 *
 * ## Why
 * The Android action catalogue generates both sides; `--check` fails when they drift.
 * @module
 */
// Generate everything that must agree with the shell action catalogue, so the two sides cannot drift.
//
//   deno run -A tools/shell-gen.mjs           write the generated files
//   deno run -A tools/shell-gen.mjs --check   fail if they are stale (the pre-push gate)
//
// Today it emits the runtime's action table. The Java dispatch registry lives in the PRIVATE edge repo
// and is NOT generated from here yet — that crosses a repo boundary and gets decided in phase 3 rather
// than guessed at now. Until then the Java side is hand-written against this file, and `os` (§6 of the
// plan) is what catches a disagreement on a real device.
import Ajv2020 from "npm:ajv@8/dist/2020.js";   // the catalogue schema is draft 2020-12, like spec.schema.json

import { pkgRoot } from "../packages/runtime/pkgroot.js";
const ROOT = pkgRoot(import.meta.url, 1);
const CATALOGUE = new URL("packages/shell/actions.json", ROOT);
const SCHEMA = new URL("packages/shell/catalogue.schema.json", ROOT);
const OUT = new URL("packages/runtime/shell-actions.js", ROOT);

const catalogue = JSON.parse(await Deno.readTextFile(CATALOGUE));
const schema = JSON.parse(await Deno.readTextFile(SCHEMA));

const ajv = new Ajv2020({ allErrors: true, strict: false });
if (!ajv.validate(schema, catalogue)) {
  console.error("actions.json does not match catalogue.schema.json:");
  for (const e of ajv.errors) console.error(`  ${e.instancePath || "/"} ${e.message}`);
  Deno.exit(1);
}

// Duplicate ids would silently shadow each other in the table; the schema cannot express it.
const ids = catalogue.actions.map((a) => a.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) { console.error(`duplicate action ids: ${[...new Set(dupes)].join(", ")}`); Deno.exit(1); }

// An action the current template cannot possibly implement is a typo, not a plan.
const ahead = catalogue.actions.filter((a) => a.minBridge > catalogue.bridgeVersion);
if (ahead.length) {
  console.error(`minBridge ahead of bridgeVersion ${catalogue.bridgeVersion}: ${ahead.map((a) => a.id).join(", ")}`);
  Deno.exit(1);
}

const table = Object.fromEntries(catalogue.actions.map((a) => [a.id, {
  capability: a.capability,
  kind: a.kind,
  minBridge: a.minBridge,
  android: a.android,
  mock: a.mock,
}]));

// The generated module carries its own registry docs (the @ts-self-types directive, a module doc and a
// JSDoc per export) — JSR scores a generated entrypoint like any other, and a doc written into the output
// by hand is deleted by the next regeneration.
const body = `/* @ts-self-types="./shell-actions.d.ts" */
/**
 * # runtime/shell-actions.js — the Android action catalogue as code
 *
 * Generated from packages/shell/actions.json by tools/shell-gen.mjs so shell.js can negotiate with
 * whatever APK bridge it runs in: every action id with its capability, kind, the bridge version it needs,
 * the Android permissions it costs, and the mock the gate answers with (CI runs Chromium, never the APK).
 * Both sides of the bridge are generated from the one catalogue, so they cannot drift; a doc written into
 * this file by hand is deleted by the next regeneration.
 *
 * ![The module's map: no runtime imports, two exports, read by shell.js](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-shell-actions.svg)
 *
 * ## Import
 * \`\`\`js
 * import { ACTIONS, CATALOGUE_BRIDGE } from "/_rt/shell-actions.js";                   // an app's page
 * import { ACTIONS } from "@microspec/core/runtime/shell-actions.js";                  // a product rt/ module or a Deno test
 * \`\`\`
 *
 * ## What it exports
 * - {@link CATALOGUE_BRIDGE} — the bridge version this catalogue was generated for (what the PAGE was built against).
 * - {@link ACTIONS} — id → \`{ capability, kind, minBridge, android, mock }\` for all ${catalogue.actions.length} actions (bridge ${catalogue.bridgeVersion}).
 *
 * ## How it fits
 * Imported by runtime/shell.js, which compares CATALOGUE_BRIDGE with the bridge the APK reports and refuses
 * an action whose minBridge is ahead of it; the mock is what the verify gate receives for every action.
 * Regenerate with \`deno task shell\` after editing the catalogue — the 8n8 node \`shell\` reds a stale table.
 * @module
 */
// GENERATED by tools/shell-gen.mjs from packages/shell/actions.json — do not edit.
// Run \`deno task shell\` after changing the catalogue; \`--check\` gates it before every push.
/** The bridge version this catalogue was generated for — what the PAGE was built against. */
export const CATALOGUE_BRIDGE = ${catalogue.bridgeVersion};
/** Every shell action by id: { capability, kind ("call"|"subscribe"), minBridge, android permissions, mock }. */
export const ACTIONS = ${JSON.stringify(table, null, 2)};
`;

const check = Deno.args.includes("--check");
const current = await Deno.readTextFile(OUT).catch(() => null);
if (check) {
  if (current !== body) {
    console.error("✗ packages/runtime/shell-actions.js is stale — run `deno task shell`");
    Deno.exit(1);
  }
  console.log(`  ✓ shell-actions.js matches the catalogue (${ids.length} action${ids.length === 1 ? "" : "s"}, bridge ${catalogue.bridgeVersion})`);
} else {
  await Deno.writeTextFile(OUT, body);
  console.log(`shell: ${ids.length} action(s) → packages/runtime/shell-actions.js (bridge ${catalogue.bridgeVersion})`);
}
