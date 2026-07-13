// Author-time contract gate: validate a spec.json against the microspec JSON Schema (draft 2020-12).
// This is the SoT-driven half of "AI can't emit an invalid spec" — the generator runs the same
// compiled validator in its retry loop (packages/gen), so a bad spec never reaches the runtime.
//   deno run -A validate.mjs <spec.json> [<spec.json> ...]
import Ajv2020 from "npm:ajv@8/dist/2020.js";
import addFormats from "npm:ajv-formats@3";
import { readLocales } from "../gen/compose.mjs";

const schema = JSON.parse(await Deno.readTextFile(new URL("./spec.schema.json", import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
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
