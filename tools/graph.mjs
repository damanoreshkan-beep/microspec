// microspec — affected-app detection from the REAL import graph. Deno-native, zero deps, no node_modules:
// the dependency truth already lives in the `import` statements, so we read it (not a hand-maintained
// package.json graph, not a coarse "any packages/** change → all 54 apps" rule). CI then verifies only the
// apps a change can actually reach. Pure functions (file IO injected) → unit-tested in runtime_test.js.
//
// This is our orchestrator's brain. Deno already gives us the pieces (the module graph via imports, a task
// runner, workspaces); we just needed the affected-set policy on top — a few small pure functions, not a
// framework. `tools/affected.mjs` is the thin IO wrapper the CI calls.

// Where the CORE runtime lives in THIS tree: the framework checkout uses its own packages/runtime; a
// product consumes the core as the @microspec/core PACKAGE, materialized under node_modules by JSR's
// npm-compat layer. The product's rt/ is an OVERLAY of its own domain modules — real files only, no
// mirrors: resolveSpec routes each /_rt/ name to the overlay when the file exists there, else to the core.
const PKG = "node_modules/@jsr/microspec__core/packages/runtime/";
export const RT = (() => {
  try { Deno.statSync("packages/runtime/index.js"); return "packages/runtime/"; } catch { /* not the framework checkout */ }
  try { Deno.statSync(PKG + "index.js"); return PKG; } catch { return "packages/runtime/"; }
})();
export const RT_OVERLAY = (() => {
  const names = new Set();
  try { for (const e of Deno.readDirSync("rt")) if (e.isFile && e.name.endsWith(".js")) names.add(e.name); } catch { /* no overlay */ }
  return names;
})();
// The product's domain modules import the core by BARE specifier (browser: the page import map rewrites it
// to /_rt/; Deno: package.json). The graph must see those edges as local core files.
const BARE_RT = "@microspec/core/runtime/";

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
  if (spec.startsWith("/_rt/")) {
    const name = spec.slice(5);
    return RT_OVERLAY.has(name) ? "rt/" + name : RT + name;
  }
  if (spec.startsWith(BARE_RT)) return RT + spec.slice(BARE_RT.length);
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

// The specifiers a file reaches STATICALLY (`from "x"`, side-effect `import "x"`) — i.e. what must exist for
// the module to evaluate at all. Deliberately excludes dynamic `import("x")`: those are the farm's lazy,
// guarded, fallback-having heavy deps (three), which the service worker precache must NOT pull in.
export function staticSpecs(src) {
  const out = new Set();
  let m;
  const from = /\bfrom\s*["']([^"']+)["']/g;
  while ((m = from.exec(src))) out.add(m[1]);
  const side = /(?:^|[;\n])\s*import\s+["']([^"']+)["']/g;
  while ((m = side.exec(src))) out.add(m[1]);
  return [...out];
}

// Every URL an index.html actually LOADS: <script src> and <link rel=stylesheet|preload|icon href>. Excludes
// rel=preconnect/dns-prefetch, whose href is an origin hint rather than a fetch, and rel=manifest (which the
// precache lists explicitly). Returns them verbatim (absolute CDN URLs and same-origin paths alike).
export function htmlAssets(html) {
  const out = new Set();
  const tag = /<(script|link)\b([^>]*)>/gi;
  let m;
  while ((m = tag.exec(html))) {
    const attrs = m[2];
    if (m[1].toLowerCase() === "link") {
      const rel = (/\brel\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1] || "";
      if (!/^(stylesheet|preload|icon|apple-touch-icon)$/i.test(rel)) continue;
    }
    const url = (/\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(attrs) || [])[1];
    if (url) out.add(url);
  }
  return [...out];
}

// The page's import map, as { bareSpecifier: url }. Bare specifiers resolve through it, so this is how a
// static `import "preact"` becomes a precacheable esm.sh URL.
export function importMapOf(html) {
  const m = /<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  try { return JSON.parse(m[1]).imports || {}; } catch { return {}; }
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
  if (f === "package.json" || f === ".npmrc") return true; // the core dependency moved → all apps
  if ((f.startsWith(RT) || f.startsWith("rt/")) && !f.endsWith(".js")) return true; // runtime CSS / config / asset → all apps
  if (f === RT + "sw-core.js") return true; // the shared service worker: every app importScripts it, but no
  // app's IMPORT graph reaches it (a worker isn't imported), so closure attribution would miss it entirely
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
    if (f.startsWith(RT) || f.startsWith("rt/")) {
      for (const a of apps) if (a.closure.has(f)) hit.add(a.id);
      continue;
    }
    return allIds; // unknown top-level path → be safe, whole farm
  }
  return [...hit].sort();
}
