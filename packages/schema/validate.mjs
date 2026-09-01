/* @ts-self-types="./validate.d.mts" */
/**
 * # schema — the contract, machine-checked
 *
 * The author-time gate: ajv (draft 2020-12) over each app's `spec.json` against
 * `packages/schema/spec.schema.json`. This is the SoT-driven half of "AI can't emit an invalid spec" — the
 * generator runs the same compiled validator in its retry loop (packages/gen), so a bad spec never reaches
 * the runtime. The CLI validates the COMPOSED spec — structure plus the `i18n/<locale>.json` dictionaries
 * beside it — because that composition is the contract the runtime actually sees. As a module it exports
 * {@link validateSchema}, the compiled validator itself.
 *
 * ![The pipeline around validate — every node a lit point, its needs as filaments](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-validate.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/schema apps/<id>/spec.json [apps/<other>/spec.json ...]
 * ```
 * `deno task gates` runs it as the 8n8 node `validate` over every `apps/<id>/spec.json` the tree holds
 * (expanded in code, not by a shell). CI's verify.yml runs the same command over a shell glob of `apps/`.
 *
 * ## Flags and arguments
 * | Argument | Effect |
 * | --- | --- |
 * | `<spec.json> ...` | One or more spec files; each is composed with the `i18n/` folder next to it. None given: usage line, exit 2. |
 *
 * No flags.
 *
 * ## What it checks / produces
 * Per file, in order — every file is reported, the run does not stop at the first red:
 * - `✗ <file> — not valid JSON: <message>` — the spec (or a locale file beside it) did not parse.
 * - `✗ <file>` followed by one line per schema violation: `<instancePath> <message>`, with the offending
 *   key in parentheses when the violation is an unknown property. `allErrors` is on, so a spec lists all
 *   of its failures in one run. A missing `i18n/en.json` reads `/i18n must have required property 'en'`.
 * - `✓ <file>` — the composed spec meets the schema.
 *
 * It writes nothing. Green means every spec in the argument list, with its dictionaries, is a valid
 * microspec contract; the runtime's own `validate.js` guards the same shape at boot.
 *
 * ## Exit codes
 * - `0` — every spec valid.
 * - `1` — at least one spec failed to parse or violated the schema.
 * - `2` — no spec files given (usage printed).
 *
 * ## Where it sits
 * 8n8 node `validate` · phase gate · script · needs: spec, demo · needed by: push. Frozen 2026-06-11. It is
 * also the `verify` gate of the `i18n` agent node — deliberately not of `spec`, because the composition it
 * checks first exists once the dictionaries are written. verify.yml runs it as the step "Schema contract
 * gate (ajv) over every app spec".
 *
 * ## Why
 * ajv against packages/schema/spec.schema.json — the contract, machine-checked.
 * @module
 */
// Author-time contract gate: validate a spec.json against the microspec JSON Schema (draft 2020-12).
// This is the SoT-driven half of "AI can't emit an invalid spec" — the generator runs the same
// compiled validator in its retry loop (packages/gen), so a bad spec never reaches the runtime.
//   deno run -A validate.mjs <spec.json> [<spec.json> ...]
import Ajv2020 from "npm:ajv@8/dist/2020.js";
import addFormats from "npm:ajv-formats@3";
import { readLocales } from "../gen/compose.mjs";

import { pkgRoot } from "../runtime/pkgroot.js";
const schema = JSON.parse(await Deno.readTextFile(new URL("packages/schema/spec.schema.json", pkgRoot(import.meta.url, 2))));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
/**
 * The compiled ajv validator for a composed spec (spec.json + i18n): returns true when the spec meets the
 * schema, otherwise false with the failures in `validateSchema.errors`.
 */
export const validateSchema = ajv.compile(schema);

if (import.meta.main) {
  const files = Deno.args;
  if (!files.length) { console.error("usage: validate.mjs <spec.json>..."); Deno.exit(2); }
  let bad = 0;
  for (const f of files) {
    let spec;
    // Compose the full spec: structure (spec.json) + translations (i18n/<locale>.json), so ajv validates
    // the contract the runtime actually sees (i18n is required but lives in separate per-locale files).
    try {
      spec = JSON.parse(await Deno.readTextFile(f));
      spec.i18n = await readLocales(f.replace(/\/spec\.json$/, ""));
    }
    catch (e) { console.log(`✗ ${f} — not valid JSON: ${e.message}`); bad++; continue; }
    if (validateSchema(spec)) { console.log(`✓ ${f}`); }
    else {
      bad++;
      console.log(`✗ ${f}`);
      for (const e of validateSchema.errors) console.log(`   ${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
    }
  }
  Deno.exit(bad ? 1 : 0);
}
