/* @ts-self-types="./affected.d.mts" */
/**
 * Affected-app orchestrator, the CI entry — a script with no exports. Reads the changed files (stdin,
 * `--range`, or `--all`), walks the real import graph from tools/graph.mjs, and prints the JSON array of
 * app ids whose gates must run, ready to feed a GitHub Actions matrix.
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
