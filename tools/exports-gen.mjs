const check = Deno.args.includes("--check");

const exports = { ".": "./packages/runtime/index.js" };
const names = [];
for (const e of Deno.readDirSync("packages/runtime")) {
  if (!e.isFile || !e.name.endsWith(".js") || e.name.endsWith("_test.js") || e.name.endsWith(".local_test.js")) continue;
  names.push(e.name);
}
for (const n of names.sort()) exports[`./runtime/${n}`] = `./packages/runtime/${n}`;

Object.assign(exports, {
  "./8n8": "./tools/8n8/run.mjs",
  "./affected": "./tools/affected.mjs",
  "./authorless": "./packages/gen/authorless.mjs",
  "./build": "./deploy/build.mjs",
  "./caps": "./packages/gates/capabilities.mjs",
  "./counts": "./deploy/counts.mjs",
  "./demo": "./tools/demo.mjs",
  "./dist-eye": "./packages/gates/dist-eye.mjs",
  "./graph": "./tools/graph.mjs",
  "./kit": "./tools/kit-manifest.mjs",
  "./manifest": "./deploy/manifest.mjs",
  "./noundef": "./tools/noundef.mjs",
  "./preflight": "./packages/gates/preflight.mjs",
  "./readme": "./deploy/readme.mjs",
  "./relimports": "./tools/relimports.mjs",
  "./rtmap": "./tools/rtmap.mjs",
  "./scaffold": "./packages/gen/scaffold.mjs",
  "./schema": "./packages/schema/validate.mjs",
  "./shell": "./tools/shell-gen.mjs",
  "./sw": "./deploy/sw.mjs",
  "./verify": "./packages/gates/verify.mjs",
});

const cfg = JSON.parse(Deno.readTextFileSync("deno.json"));
const want = JSON.stringify(exports, null, 2);
const have = JSON.stringify(cfg.exports ?? {}, null, 2);
if (check) {
  if (want !== have) { console.error("exports map is stale — run: deno run -A tools/exports-gen.mjs"); Deno.exit(1); }
  console.log(`  ✓ exports map matches the tree (${Object.keys(exports).length} entries)`);
} else {
  cfg.exports = exports;
  Deno.writeTextFileSync("deno.json", JSON.stringify(cfg, null, 2) + "\n");
  console.log(`exports: ${Object.keys(exports).length} entries written to deno.json`);
}
