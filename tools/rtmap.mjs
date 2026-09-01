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
 * - the consumer's `deno.json` `imports` — must carry a `jsr:@microspec/core@<spec>` entry. The spec is a
 *   RANGE by default (`@1` = every 1.x; the owner edits no version by hand), so the base is the version that
 *   RESOLVED — `deno.lock`'s specifiers entry, else the npm-compat package under node_modules — as
 *   `https://jsr.io/@microspec/core/<resolved>/`. No entry: `rtmap: deno.json imports carry no
 *   jsr:@microspec/core@<spec> entry`, exit 1; a range that has not resolved yet: `run deno task install first`.
 * - the core's own `deno.json` manifest (the npm pins — ONE source, so one preact instance) and its
 *   `packages/gates/preflight.importmap.json` (the app-only pins: motion, lodash-es, …). Manifest keys win.
 *
 * `preflight.map.json` (committed, drift-checked) routes:
 * - the bare deps — manifest pins first, preflight-map extras where the manifest has no key;
 * - `canvas` → the pinned core's `packages/gates/canvas-stub.js`;
 * - `/_rt/<name>` → `./rt/<name>` for every overlay file — exact keys beat the prefix key by the import-map spec;
 * - `/_rt/` and `@microspec/core/runtime/` → the pinned core's `packages/runtime/`.
 *
 * The consumer's local entries under `.microspec/` are written ONCE, when missing, and then committed —
 * the scaffold rule, not a build artifact. They carry no version: `tests/unit_test.js`, `tests/mcp_test.js`
 * and `tests/pipeline_test.js` import the core's exported suites by bare specifier (`deno test` refuses a
 * remote URL as a test module — silently, when a local file rides along, which once passed a unit node
 * that had run half its suites); `preflight.mjs` and `verify.mjs` plant a local `__msImport` before loading
 * the core's harness, so a gate can dynamically import consumer files; `core.mjs` is the one dispatcher
 * for every core tool (`deno run -A .microspec/core.mjs 8n8 gates`) — `import.meta.resolve` applies the
 * import map, so the pinned version lives in `deno.json` imports alone.
 *
 * Green: `✓ preflight map matches rt/ + the <pin> pin (<n> overlay entries; .microspec/ entries present)`.
 * Red: `preflight.map.json is stale — run the core's tools/rtmap.mjs`, or `.microspec/ entries were
 * missing and have been written — commit them`.
 *
 * ## Exit codes
 * - `0` — map written (or, under `--check`, the committed map matches and every entry exists), or the tree
 *   has no `rt/` overlay.
 * - `1` — `deno.json` carries no `jsr:@microspec/core@<version>` pin, `--check` found the committed map
 *   stale, or an entry under `.microspec/` was missing (it is written, and must be committed).
 *
 * ## Where it sits
 * 8n8 node `rtmap` · phase gate · script · needs: nothing · needed by: preflight, unit, mcp, pipeline.
 * Frozen 2026-08-31. It is part of the `gates` flow; the nodes that follow it point at the committed
 * `.microspec/` entries instead of a remote URL.
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

// the consumer's core version. Its deno.json imports name a jsr:@microspec/core@<spec>; the spec is a RANGE
// by default (`@1` = every 1.x — the owner edits no version by hand, 2026-09-01), so the version the map is
// built for is the one that RESOLVED: deno.lock's specifiers entry for that spec, else the package the
// npm-compat channel materialized. An exact spec needs no lookup.
const consumer = JSON.parse(await Deno.readTextFile("deno.json"));
const spec = /jsr:@microspec\/core@([^/"]+)/.exec(JSON.stringify(consumer.imports ?? {}))?.[1];
if (!spec) { console.error("rtmap: deno.json imports carry no jsr:@microspec/core@<spec> entry"); Deno.exit(1); }
const resolvedCore = async () => {
  if (/^\d+\.\d+\.\d+/.test(spec)) return spec;
  try {
    const lock = JSON.parse(await Deno.readTextFile("deno.lock"));
    const v = lock.specifiers?.[`jsr:@microspec/core@${spec}`];
    if (v) return v;
  } catch { /* no lock */ }
  try { return JSON.parse(await Deno.readTextFile("node_modules/@microspec/core/package.json")).version; } catch { /* not installed */ }
  console.error(`rtmap: jsr:@microspec/core@${spec} has not resolved yet — run deno task install first`); Deno.exit(1);
};
const pin = await resolvedCore();
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

// The consumer's LOCAL ENTRIES under .microspec/ — committed, not generated: written once when missing
// (the scaffold rule), then owned by the tree. They carry NO version: every specifier is bare and resolves
// through the consumer's own import map, so the pin lives in deno.json imports alone.
// - tests/*: `deno test` refuses a remote URL as a test module ("No test modules found") — and worse,
//   SILENTLY when a local file rides along, which once passed a unit node that had run only half its
//   suites. A one-line local file importing the exported suite is the fix; the gate nodes point at these.
// - preflight.mjs / verify.mjs: gate harnesses that dynamically import CONSUMER files. The import() must
//   originate locally (a remote importer may neither import file:// nor use the import map), so the entry
//   plants a local importer first.
// - core.mjs: the one dispatcher for every core tool (`deno run -A .microspec/core.mjs 8n8 gates`):
//   import.meta.resolve applies the import map, so `@microspec/core/8n8` becomes the pinned jsr: URL, and
//   the tool still EXECUTES in the registry realm — as a child with the caller's args and permissions.
const ENTRIES = {
  ".microspec/tests/unit_test.js": `import "@microspec/core/tests/runtime";\n`,
  ".microspec/tests/mcp_test.js": `import "@microspec/core/tests/mcp";\n`,
  ".microspec/tests/pipeline_test.js": `import "@microspec/core/tests/8n8";\n`,
  ".microspec/preflight.mjs": `globalThis.__msImport = (s) => import(s);\nawait import("@microspec/core/preflight");\n`,
  ".microspec/verify.mjs": `globalThis.__msImport = (s) => import(s);\nawait import("@microspec/core/verify");\n`,
  ".microspec/core.mjs": `// The core's tools, run from THIS tree's pin: \`deno run -A .microspec/core.mjs <tool> [args]\`.
// import.meta.resolve applies the import map, so the version is deno.json's alone; the tool executes in the
// registry realm as a child process with the caller's args (a CLI argument is never import-mapped).
const [tool, ...rest] = Deno.args;
if (!tool) { console.error("usage: core.mjs <tool> [args]"); Deno.exit(2); }
const spec = import.meta.resolve(\`@microspec/core/\${tool}\`);
const out = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--minimum-dependency-age", "0", spec, ...rest], stdin: "inherit", stdout: "inherit", stderr: "inherit" }).output();
Deno.exit(out.code);
`,
};

await Deno.mkdir(".microspec/tests", { recursive: true });
const missing = [];
for (const [p, body] of Object.entries(ENTRIES)) {
  if (await Deno.stat(p).then(() => true, () => false)) continue;
  await Deno.writeTextFile(p, body);
  missing.push(p);
}

const have = await Deno.readTextFile("preflight.map.json").catch(() => "");
if (check) {
  if (want !== have) { console.error("preflight.map.json is stale — run the core's tools/rtmap.mjs"); Deno.exit(1); }
  if (missing.length) { console.error(`.microspec/ entries were missing and have been written — commit them:\n  ${missing.join("\n  ")}`); Deno.exit(1); }
  console.log(`  ✓ preflight map matches rt/ + the ${pin} pin (${names.length} overlay entries; .microspec/ entries present)`);
} else {
  await Deno.writeTextFile("preflight.map.json", want);
  console.log(`preflight.map.json: core ${pin}, ${names.length} overlay entries${missing.length ? `; wrote ${missing.length} .microspec/ entr${missing.length === 1 ? "y" : "ies"} — commit them` : ""}`);
}
