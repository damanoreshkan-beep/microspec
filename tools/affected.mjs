/* @ts-self-types="./affected.d.mts" */
/**
 * # affected — which apps a change actually reaches, computed from the real import graph.
 *
 * The farm is its own monorepo framework: Deno workspaces and this orchestrator, no Turborepo, no Nx, no
 * node_modules. CI verifies only the apps a change reaches, and this script is how that scope is computed
 * rather than guessed. It reads the changed files (stdin, `--range`, or `--all` for the whole farm), builds
 * each app's import closure from its entry (view.js or data.js) through every `/_rt/` module it pulls in,
 * builds the shared bootstrap closure from the runtime's index.js, and prints one compact JSON array of app
 * ids ready to feed a GitHub Actions matrix. Conservative on purpose: the only unsafe error is verifying
 * too FEW apps, so anything shared or uncertain widens to all. It exports nothing.
 *
 * ![The affected node in the ship lane](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-affected.svg)
 *
 * ## Usage
 * ```sh
 * git diff --name-only <base>...<head> | deno run -A jsr:@microspec/core/affected   # scoped, from stdin
 * deno run -A jsr:@microspec/core/affected --range <base>...<head>                  # scoped, runs git itself
 * deno run -A jsr:@microspec/core/affected --all                                    # whole farm
 * ```
 * `deno task affected` runs it in the framework tree; the 8n8 node `affected` runs it with `--all`.
 * Output is the array alone on stdout, e.g. `["books"]` or `[]`.
 *
 * ## Flags and arguments
 * | argument | meaning |
 * | --- | --- |
 * | `--all` | skip the diff: every app with a gate. What verify.yml uses when it has no usable diff base |
 * | `--range <base>...<head>` | run `git diff --name-only` on that range and classify its output |
 * | stdin | with neither flag, one changed path per line (blank lines ignored) |
 *
 * ## What it checks / produces
 * - The farm is the set of `apps/<id>/` that carry BOTH `spec.json` and `e2e.spec.mjs`, mirroring
 *   verify.yml's apps_with_gate; an app without a gate is never in the answer.
 * - An app's closure starts at `apps/<id>/view.js`, else `apps/<id>/data.js`; an app with neither is
 *   reached only by a change inside its own directory.
 * - Classification, per changed file, in tools/graph.mjs (unit-tested): a test or doc file changes no app's
 *   verify; a global file returns EVERY id at once — packages/gates, packages/schema, packages/gen, deploy/,
 *   the workflows, tools/, deno.json, deno.lock, package.json, a non-JS runtime asset, the shared service
 *   worker sw-core.js (every app importScripts it, but no import graph reaches it), or any module in the
 *   bootstrap closure; a file under `apps/<id>/` hits that app; a runtime module (core `packages/runtime/`
 *   or a product's `rt/` overlay) hits the apps whose closure contains it; any other top-level path is
 *   unknown and widens to the whole farm.
 * - Produces the sorted JSON array on stdout and nothing else. `[]` means nothing app-relevant changed, and
 *   verify.yml skips the whole browser matrix on it.
 *
 * ## Exit codes
 * - `0` — the array was printed (there is no other deliberate exit).
 * - `1` — Deno's own: an uncaught error, such as a `--range` git cannot diff.
 *
 * ## Where it sits
 * 8n8 node `affected` · phase ship · script, frozen 2026-07-16 · needs: none · needed by: none in the DAG.
 * Its consumer is verify.yml's discover step: after the unit job it decides the `verify` matrix, and CI
 * runs Chromium and axe only over the ids it names.
 *
 * ![From apps and the runtime to dist and the live site](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Why
 * Which apps a change actually reaches, from the real import graph — CI's scope, computed not guessed.
 * @module
 */
// microspec — affected-app orchestrator (the CI entry). Reads the changed files, walks the REAL import graph
// (tools/graph.mjs), and prints the JSON array of apps to verify. Deno-native, zero deps.
//
//   git diff --name-only <base>...<head> | deno run -A tools/affected.mjs      # scoped
//   deno run -A tools/affected.mjs --range <base>...<head>                     # scoped (runs git itself)
//   deno run -A tools/affected.mjs --all                                       # whole farm (no usable base)
//
// Output: a compact JSON array on stdout, e.g. ["drift"] or [] — ready to feed a GitHub Actions matrix.

import { buildClosure, classifyAffected, RT } from "./graph.mjs";

const read = (f) => {
  try {
    return Deno.readTextFileSync(f);
  } catch {
    return null;
  }
};

// the farm = app dirs that actually have a gate (spec + e2e), mirroring verify.yml's apps_with_gate.
function allApps() {
  const ids = [];
  try {
    for (const e of Deno.readDirSync("apps")) {
      if (!e.isDirectory) continue;
      if (
        read(`apps/${e.name}/spec.json`) != null &&
        read(`apps/${e.name}/e2e.spec.mjs`) != null
      ) ids.push(e.name);
    }
  } catch { /* no apps dir */ }
  return ids.sort();
}
const appEntry = (id) =>
  ["view.js", "data.js"].map((c) => `apps/${id}/${c}`).find((p) =>
    read(p) != null
  ) || null;

function changedFromArgs() {
  const args = Deno.args;
  if (args.includes("--all")) return null; // signal: whole farm
  const ri = args.indexOf("--range");
  if (ri >= 0 && args[ri + 1]) {
    const out = new Deno.Command("git", {
      args: ["diff", "--name-only", args[ri + 1]],
    }).outputSync();
    return new TextDecoder().decode(out.stdout).split("\n").filter(Boolean);
  }
  return null; // fall through to stdin
}

async function readStdin() {
  const buf = await new Response(Deno.stdin.readable).text();
  return buf.split("\n").map((s) => s.trim()).filter(Boolean);
}

const ids = allApps();
let changed = changedFromArgs();
if (changed === null && !Deno.args.includes("--all")) {
  changed = await readStdin();
}

let affected;
if (Deno.args.includes("--all") || changed === null) {
  affected = ids;
} else {
  const core = buildClosure(`${RT}index.js`, read);
  const apps = ids.map((id) => {
    const e = appEntry(id);
    return {
      id,
      closure: e ? buildClosure(e, read) : new Set([`apps/${id}/`]),
    };
  });
  affected = classifyAffected(changed, apps, core);
}
console.log(JSON.stringify(affected));
