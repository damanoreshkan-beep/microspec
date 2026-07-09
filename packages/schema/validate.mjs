import Ajv2020 from "npm:ajv@8/dist/2020.js";
import addFormats from "npm:ajv-formats@3";

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
    try { spec = JSON.parse(await Deno.readTextFile(f)); }
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
