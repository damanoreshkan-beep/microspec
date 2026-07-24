// microspec — affected-app detection from the REAL import graph. Deno-native, zero deps, no node_modules:
// the dependency truth already lives in the `import` statements, so we read it (not a hand-maintained
// package.json graph, not a coarse "any packages/** change → all 54 apps" rule). CI then verifies only the
// apps a change can actually reach. Pure functions (file IO injected) → unit-tested in runtime_test.js.
//
// This is our orchestrator's brain. Deno already gives us the pieces (the module graph via imports, a task
// runner, workspaces); we just needed the affected-set policy on top — a few small pure functions, not a
// framework. `tools/affected.mjs` is the thin IO wrapper the CI calls.

export const RT = "packages/runtime/"; // where /_rt/ actually lives in the repo

const dirOf = (p) => {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
};
function normalize(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

// Resolve a module specifier referenced in `fromFile` → a repo-relative path, or null when it is EXTERNAL
// (a bare/esm/jsr/npm specifier — those are CDN-pinned in index.html and never change per commit, so they
// don't affect which app to re-verify). App files use absolute `/_rt/…`; runtime files use relative `./…`.
export function resolveSpec(spec, fromFile) {
  if (spec.startsWith("/_rt/")) return RT + spec.slice(5);
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return normalize(dirOf(fromFile) + "/" + spec);
  }
  return null;
}

// Every LOCAL module specifier a source file references: `… from "x"` (import + re-export), dynamic
// `import("x")`, and side-effect `import "x"`. Over-detection is safe here (it can only verify MORE apps,
// never fewer), so a loose match beats a fragile parser.
export function importSpecs(src) {
  const out = new Set();
  let m;
  const from = /\bfrom\s*["']([^"']+)["']/g;
  while ((m = from.exec(src))) out.add(m[1]);
  const dyn = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dyn.exec(src))) out.add(m[1]);
  const side = /(?:^|[;\n])\s*import\s+["']([^"']+)["']/g;
  while ((m = side.exec(src))) out.add(m[1]);
  return [...out];
}

// Transitive local closure of an entry file (includes the entry). `read(path) → string | null` (null when a
// file is missing — a dangling import is simply a leaf). External specifiers are ignored.
export function buildClosure(entry, read) {
  const seen = new Set(), stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = read(f);
    if (src == null) continue;
    for (const spec of importSpecs(src)) {
      const r = resolveSpec(spec, f);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

const isTest = (f) =>
  /(?:^|\/)[^/]*_test\.[jt]sx?$/.test(f) || /\.test\.[jt]sx?$/.test(f);
const isDoc = (f) =>
  /\.md$/.test(f) || f.startsWith("docs/") || f === "README.md" ||
  f === "LICENSE";

// A changed file that could plausibly affect EVERY app → force the whole farm. Conservative on purpose: the
// only unsafe error is verifying too FEW apps, so anything shared/uncertain widens to all.
//  - the build/verify harness, schema and authoring toolkit (packages/gates|schema|gen)
//  - deployment + workflows + root config
//  - a non-JS runtime asset (theme.css, a runtime deno.json, fonts) — every app loads these
//  - a runtime module in the shared bootstrap closure (index.js → render/store/validate/…): every app runs it
export function isGlobal(f, coreSet) {
  if (/^packages\/(gates|schema|gen)\//.test(f)) return true;
  if (
    /^deploy\//.test(f) || /^\.github\/workflows\//.test(f) ||
    /^tools\//.test(f)
  ) return true;
  if (f === "deno.json" || f === "deno.jsonc" || f === "deno.lock") return true;
  if (f.startsWith(RT) && !f.endsWith(".js")) return true; // runtime CSS / config / asset → all apps
  if (coreSet.has(f)) return true; // shared bootstrap module → all apps
  return false;
}

// The affected set. `apps`: [{ id, closure:Set<file> }]; `coreSet`: the bootstrap closure. Returns a sorted
// app-id array; a whole-farm trigger returns every id.
export function classifyAffected(changed, apps, coreSet) {
  const allIds = apps.map((a) => a.id).sort();
  const hit = new Set();
  for (const f of changed) {
    if (isTest(f) || isDoc(f)) continue; // unit-only / docs → no app's verify changes
    if (isGlobal(f, coreSet)) return allIds; // whole farm
    const am = /^apps\/([^/]+)\//.exec(f);
    if (am) {
      if (allIds.includes(am[1])) hit.add(am[1]);
      continue;
    }
    if (f.startsWith(RT)) {
      for (const a of apps) if (a.closure.has(f)) hit.add(a.id);
      continue;
    }
    return allIds; // unknown top-level path → be safe, whole farm
  }
  return [...hit].sort();
}
