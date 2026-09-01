/* @ts-self-types="./rtmap.d.mts" */
/**
 * # rtmap — the product's preflight import map, generated from its rt/ overlay
 *
 * The browser-free gate (preflight) mounts real app views in Deno, and every `/_rt/` import they make has to
 * route per-file: the domain overlay's own names to `./rt/`, everything else to the pinned core on JSR. This
 * script derives that map from the tree instead of trusting a hand-kept one — a stale map is a gate that
 * tests the wrong runtime. One realm for the whole mounted graph: the views (file), the overlay (file) and
 * the core (https) all resolve their bare deps through this map's pins, so there is exactly one preact.
 * A tree with no `rt/` overlay (the framework itself) needs no map and generates none. A CLI script — it
 * exports nothing.
 *
 * ![The three realms the core runs from — a file checkout, the JSR cache, node_modules — and their laws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/rtmap            # (re)write preflight.map.json at the consumer's root
 * deno run -A jsr:@microspec/core/rtmap --check    # fail if the committed map is stale
 * ```
 * Run it from the consumer's root. `deno task gates` runs it as the 8n8 node `rtmap`, with `--check`.
 *
 * ## Flags and arguments
 * | Flag | Effect |
 * | --- | --- |
 * | `--check` | Compare the committed `preflight.map.json` with what the tree implies; red on drift, the map is not rewritten. The shims are written regardless. |
 *
 * No positional arguments — it reads the tree it is run in: `rt/`, `deno.json`, `preflight.map.json`.
 *
 * ## What it checks / produces
 * Inputs, in the order the code reads them:
 * - `rt/` — every `.js` file except `_test.js` suites, sorted: the overlay's names. No `rt/`, or an empty
 *   one, means the framework tree: `✓ no rt/ overlay — no preflight map needed`, exit 0, nothing written.
 * - the consumer's `deno.json` `imports` — must carry a `jsr:@microspec/core@<version>` pin; that version is
 *   the base `https://jsr.io/@microspec/core/<version>/`. Without it: `rtmap: deno.json imports carry no
 *   jsr:@microspec/core@<version> pin`, exit 1.
 * - the core's own `deno.json` manifest (the npm pins — ONE source, so one preact instance) and its
 *   `packages/gates/preflight.importmap.json` (the app-only pins: motion, lodash-es, …). Manifest keys win.
 *
 * `preflight.map.json` (committed, drift-checked) routes:
 * - the bare deps — manifest pins first, preflight-map extras where the manifest has no key;
 * - `canvas` → the pinned core's `packages/gates/canvas-stub.js`;
 * - `/_rt/<name>` → `./rt/<name>` for every overlay file — exact keys beat the prefix key by the import-map spec;
 * - `/_rt/` and `@microspec/core/runtime/` → the pinned core's `packages/runtime/`.
 *
 * The gitignored test shims under `.microspec/` are written on EVERY run, `--check` included, because a
 * fresh CI checkout has none: `tests/unit_test.js`, `tests/mcp_test.js` and `tests/pipeline_test.js` import
 * the core's suites at the pin (`deno test` refuses a remote URL as a test module — silently, when a local
 * file rides along, which once passed a unit node that had run half its suites); `preflight.mjs` and
 * `verify.mjs` plant a local `__msImport` before loading the core's harness, so a gate can dynamically
 * import consumer files.
 *
 * Green: `✓ preflight map matches rt/ + the <pin> pin (<n> overlay entries; shims refreshed)`.
 * Red: `preflight.map.json is stale — run the core's tools/rtmap.mjs`.
 *
 * ## Exit codes
 * - `0` — map written (or, under `--check`, the committed map matches), or the tree has no `rt/` overlay.
 * - `1` — `deno.json` carries no `jsr:@microspec/core@<version>` pin, or `--check` found the committed map stale.
 *
 * ## Where it sits
 * 8n8 node `rtmap` · phase gate · script · needs: nothing · needed by: preflight, unit, mcp, pipeline.
 * Frozen 2026-08-31. It is part of the `gates` flow, and because it writes the shims even under `--check`,
 * the nodes that follow it point at `.microspec/` instead of a remote URL.
 *
 * ![The pipeline around rtmap — every node a lit point, its needs as filaments](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-rtmap.svg)
 *
 * ## Why
 * The product's preflight import map, generated from its rt/ overlay (exact keys beat the prefix key).
 * Preflight mounts real views in Deno, and their /_rt/ imports must route per-file — a stale map is a gate
 * that tests the wrong runtime. A tree with no overlay generates nothing.
 * @module
 */
// microspec — the PRODUCT's preflight import map, GENERATED (like the sw stubs): the browser-free gate
// mounts real app views in Deno, and their /_rt/ imports must route per-file — the domain overlay's names
// to ./rt/, everything else to the CORE ON JSR (https). One realm for the whole mounted graph: the views
// (file), the overlay (file) and the core (https) all resolve their bare deps through THIS map's esm.sh
// pins, so there is exactly one preact. Exact keys beat the prefix key by the import-map spec.
//   deno run -A <core>/tools/rtmap.mjs            # (re)write preflight.map.json at the consumer's root
//   deno run -A <core>/tools/rtmap.mjs --check    # fail if it is stale
// A tree with no rt/ overlay (the framework itself) needs no map and generates none.
const check = Deno.args.includes("--check");

let names = [];
try {
  names = [...Deno.readDirSync("rt")]
    .filter((e) => e.isFile && e.name.endsWith(".js") && !e.name.endsWith("_test.js"))
    .map((e) => e.name).sort();
} catch { /* no overlay */ }
if (!names.length) {
  if (check) console.log("  ✓ no rt/ overlay — no preflight map needed");
  Deno.exit(0);
}

// the consumer's pinned core version — the single source is its own deno.json imports entry
const consumer = JSON.parse(await Deno.readTextFile("deno.json"));
const pin = /jsr:@microspec\/core@([^/"]+)/.exec(JSON.stringify(consumer.imports ?? {}))?.[1];
if (!pin) { console.error("rtmap: deno.json imports carry no jsr:@microspec/core@<version> pin"); Deno.exit(1); }
const base = `https://jsr.io/@microspec/core/${pin}/`;

// The bare-dep pins come from the CORE'S OWN MANIFEST (npm:…), never esm.sh: the core's modules load from
// jsr (https) and resolve their preact through the package manifest — npm's copy. If the consumer's views
// resolved the same names to esm.sh, two preacts would meet in one tree and hooks would crash on `__H`
// (measured: every tool app red, every list app green). One source of pins ⇒ one instance.
const manUrl = new URL("../deno.json", import.meta.url); // tools/ → the package root — NEVER nest a second "../" base (this exact off-by-one 404'd twice)
const manifest = manUrl.protocol === "file:"
  ? JSON.parse(await Deno.readTextFile(manUrl))
  : await (await fetch(manUrl)).json();
const imports = { ...manifest.imports };
// …plus the APP-ONLY pins (motion, lodash-es, …) from the core's own preflight map — names the manifest
// does not carry because no core module imports them. Manifest keys WIN: those must stay one-instance.
const pfUrl = new URL("../packages/gates/preflight.importmap.json", import.meta.url);
const pf = pfUrl.protocol === "file:" ? JSON.parse(await Deno.readTextFile(pfUrl)) : await (await fetch(pfUrl)).json();
for (const [k, v] of Object.entries(pf.imports)) {
  if (!(k in imports) && k !== "canvas" && k !== "/_rt/") imports[k] = v;
}
imports["canvas"] = `${base}packages/gates/canvas-stub.js`;
for (const n of names) imports[`/_rt/${n}`] = `./rt/${n}`;
imports["/_rt/"] = `${base}packages/runtime/`;
imports["@microspec/core/runtime/"] = `${base}packages/runtime/`;

const want = JSON.stringify({
  "//": "GENERATED by @microspec/core tools/rtmap.mjs — do not edit by hand (--check gates drift). Routes each /_rt/ name: the rt/ overlay's own files exactly, the pinned core on JSR for the rest; one realm, one preact.",
  imports,
}, null, 2) + "\n";

// The test SHIMS. `deno test` refuses a remote URL as a test module ("No test modules found") — and worse,
// it does so SILENTLY when a local file rides along, which once passed a unit node that had run only half
// its suites. So the consumer gets local one-line shims that import the core's suites at the pin; the
// gate nodes point at these. Gitignored, regenerated here, drift-checked with the map.
const SHIMS = {
  ".microspec/tests/unit_test.js": `import "${base}packages/runtime/runtime_test.js";\n`,
  ".microspec/tests/mcp_test.js": `import "${base}tools/mcp/server_test.js";\n`,
  ".microspec/tests/pipeline_test.js": `import "${base}tools/8n8/run_test.js";\n`,
  // gate harnesses that dynamically import CONSUMER files: the import() must originate locally (a remote
  // importer may neither import file:// nor use the import map), so the shim plants a local importer first.
  ".microspec/preflight.mjs": `globalThis.__msImport = (s) => import(s);\nawait import("${base}packages/gates/preflight.mjs");\n`,
  ".microspec/verify.mjs": `globalThis.__msImport = (s) => import(s);\nawait import("${base}packages/gates/verify.mjs");\n`,
};

// The shims are gitignored BUILD ARTIFACTS — a fresh checkout (CI) has none, so even --check WRITES them
// (always safe: derived, never committed). Only the COMMITTED map is drift-checked.
await Deno.mkdir(".microspec/tests", { recursive: true });
for (const [p, body] of Object.entries(SHIMS)) await Deno.writeTextFile(p, body);

const have = await Deno.readTextFile("preflight.map.json").catch(() => "");
if (check) {
  if (want !== have) { console.error("preflight.map.json is stale — run the core's tools/rtmap.mjs"); Deno.exit(1); }
  console.log(`  ✓ preflight map matches rt/ + the ${pin} pin (${names.length} overlay entries; shims refreshed)`);
} else {
  await Deno.writeTextFile("preflight.map.json", want);
  console.log(`preflight.map.json + ${Object.keys(SHIMS).length} shims: core ${pin}, ${names.length} overlay entries`);
}
