/* @ts-self-types="./relimports.d.mts" */
/**
 * # relimports — runtime modules import each other relatively
 *
 * The farm is served from a subpath (`…github.io/microspec/`). An absolute `/_rt/x.js` inside a runtime
 * module resolves to the domain root and 404s there, while working perfectly on a local server rooted at
 * `/` — a defect no local page load can show, so it is a rule. Apps are the opposite: they legitimately
 * import `/_rt/…` and the build rewrites those to `../_rt/…`. The rule therefore covers the runtime only —
 * `packages/runtime` in the core and the product's `rt/` overlay, which serves from the same `/_rt/` URL
 * space. A CLI script — it exports nothing.
 *
 * ![The 8n8 pipeline with the relimports node lit](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-relimports.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/relimports
 * ```
 * `deno task gates` runs it as the 8n8 node `relimports`. Run it in the root of the tree — the paths it
 * scans are relative to the cwd.
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in.
 *
 * ## What it checks
 * - which directories exist: `packages/runtime` when `packages/runtime/index.js` is present (the core
 *   checkout), and `rt/` when it is a directory (the product's domain overlay). A consumer tree scans only
 *   `rt/` — the core is scanned at home, before it is published.
 * - every regular `.js` file in those directories, except `_test.js` suites (fixtures embed `/_rt/…` as
 *   data). A symlinked core file reports as not-a-file and is skipped.
 * - every line matching `from "/_rt/` (single or double quotes) is a violation, reported as
 *   `dir/file.js:line: the import line`.
 *
 * Red prints `runtime modules must use relative imports (./x.js), not /_rt/ — absolute 404s under
 * /microspec/` followed by every offending line. Green prints `✓ runtime imports are relative` with the
 * directories it scanned. It writes nothing.
 *
 * ## Exit codes
 * - `0` — no absolute `/_rt/` import in any runtime module.
 * - `1` — at least one violation.
 *
 * ## Where it sits
 * gate · script · needs: none · needed by: none — a root of the `gates` flow that runs the moment the
 * flow starts, and a leaf `push` does not wait for. The same check lives in `verify.yml` as a grep step
 * over `packages/runtime`; this node is the local copy, so the answer arrives before the push instead of
 * a CI round after it.
 *
 * ![The three realms and their laws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Why
 * Runtime modules must import each other relatively — an absolute `/_rt/` 404s on the `/microspec/`
 * subpath while working locally, so only a rule can catch it. The check existed only in `verify.yml`, so
 * a violation cost a whole CI round; `/_rt/hero.js` shipped with one.
 * @module
 */
// Runtime modules must import each OTHER relatively.
//
// The farm is served from https://…github.io/microspec/, a SUBPATH. An absolute "/_rt/x.js" resolves to
// the domain root and 404s there, while working perfectly on a local server rooted at "/" — which is why
// this can only be caught by a rule, never by opening the page here.
//
// Apps are the opposite: they legitimately import "/_rt/…" and the build rewrites those to "../_rt/…".
// The rule therefore applies to packages/runtime/*.js ONLY, and *_test.js is exempt because fixtures
// embed such strings as data.
//
// This lived only in verify.yml, so a violation cost a full CI round to discover — packages/runtime/hero.js
// shipped with one. Same checks, run before the push.
//   deno run -A tools/relimports.mjs

const bad = [];
// the product's rt/ modules serve from the same /_rt/ URL space, so the same rule holds there (symlinked
// core files report !isFile and skip — they are scanned at home in packages/runtime)
const dirs = [];
try { Deno.statSync("packages/runtime/index.js"); dirs.push("packages/runtime"); } catch { /* consumer tree — the core is scanned at publish time */ }
try { if (Deno.statSync("rt").isDirectory) dirs.push("rt"); } catch { /* no domain overlay */ }
for (const dir of dirs) {
  for await (const f of Deno.readDir(dir)) {
    if (!f.isFile || !f.name.endsWith(".js") || f.name.endsWith("_test.js")) continue;
    const src = await Deno.readTextFile(`${dir}/${f.name}`);
    src.split("\n").forEach((line, i) => {
      if (/from\s+["']\/_rt\//.test(line)) bad.push(`${dir}/${f.name}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (bad.length) {
  console.error(`runtime modules must use relative imports (./x.js), not /_rt/ — absolute 404s under /microspec/\n`);
  for (const b of bad) console.error("  " + b);
  Deno.exit(1);
}
console.log(`  ✓ runtime imports are relative (${dirs.join(" + ")} scanned)`);
