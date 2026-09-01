/* @ts-self-types="./shell-gen.d.mts" */
/**
 * Generates everything that must agree with the shell action catalogue (packages/shell/actions.json) so
 * the two sides cannot drift: validates the catalogue against its schema, rejects duplicate ids and
 * actions ahead of the bridge version, and writes the runtime's action table
 * (packages/runtime/shell-actions.js). `--check` fails when it is stale. A CLI script — it exports nothing.
 * @module
 */
import Ajv2020 from "npm:ajv@8/dist/2020.js";   

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

const ids = catalogue.actions.map((a) => a.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) { console.error(`duplicate action ids: ${[...new Set(dupes)].join(", ")}`); Deno.exit(1); }

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

const body = `/* @ts-self-types="./shell-actions.d.ts" */
/**
 * The shell action catalogue as code — generated from packages/shell/actions.json so shell.js can negotiate
 * with whatever APK bridge it runs in. Exports CATALOGUE_BRIDGE (the bridge version the page was built
 * against) and ACTIONS (every action id with its capability, kind, minBridge, Android permissions and the
 * mock the gate answers with, since CI runs Chromium and never the APK).
 * @module
 */
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
