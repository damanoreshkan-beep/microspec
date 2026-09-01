/* @ts-self-types="./validate.d.mts" */
/**
 * Author-time contract gate: the compiled ajv validator for spec.json against the microspec JSON Schema
 * (draft 2020-12). Exports `validateSchema`, the same validator the generator runs in its retry loop, so a
 * bad spec never reaches the runtime; as a CLI it composes each spec with its i18n/ and reports errors.
 * @module
 */
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
