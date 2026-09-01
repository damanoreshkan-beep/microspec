/* @ts-self-types="./graph.d.mts" */
/**
 * # graph — the orchestrator's brain, read off the import statements
 *
 * The dependency truth already lives in the `import` lines, so the farm reads it — not a hand-maintained
 * package graph, not a coarse "any change under packages → all apps" rule. These are pure functions with
 * file IO injected: resolve a specifier, collect a file's imports, walk an entry's transitive closure,
 * classify a changed-file list into the apps CI must re-verify. Deno-native, zero deps, no framework:
 * Deno already gives the module graph, a task runner and workspaces; the affected-set policy on top is a
 * few small functions, unit-tested in `packages/runtime/tests/graph_test.js`. `tools/affected.mjs` is the
 * thin IO wrapper CI calls; `deploy/sw.mjs` walks the same closure to write each app's precache.
 *
 * ![The three realms — the framework checkout, the JSR cache, the product's rt overlay — and the laws that hold across them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Usage
 * A library, not a command — it has no `main` and reads no arguments.
 * ```js
 * import { buildClosure, classifyAffected, RT } from "jsr:@microspec/core/graph";
 * ```
 * The CLI over it is `deno run -A jsr:@microspec/core/affected` (`deno task affected` in both trees).
 *
 * ## Flags and arguments
 * None — it is a module. Two things are decided at import time from the tree it is loaded in:
 * - {@link RT} — where the core runtime lives: `packages/runtime/` in the framework checkout, else
 *   `node_modules/@jsr/microspec__core/packages/runtime/` when the product has materialized the package.
 * - {@link RT_OVERLAY} — the `.js` file names under `rt/`, the product's own domain modules that shadow
 *   the core for those `/_rt/` names. Real files only, no mirrors.
 *
 * ## What it checks / produces
 * - {@link resolveSpec} — a specifier as written → a repo-relative path, or `null` when it is external
 *   (bare, esm, jsr, npm: CDN-pinned in `index.html`, never changing per commit). `/_rt/x.js` routes to
 *   the overlay when `rt/x.js` exists, else to the core; `@microspec/core/runtime/x.js` routes to the
 *   core; `./` and `../` resolve against the importing file.
 * - {@link importSpecs} — every specifier a source file references: `from "x"`, dynamic `import("x")`,
 *   side-effect `import "x"`. Loose on purpose: over-detection can only verify more apps, never fewer.
 * - {@link staticSpecs} — the same without dynamic `import()`: what must exist for the module to evaluate.
 *   The lazy, guarded heavy deps (three) stay out of the service-worker precache this way.
 * - {@link htmlAssets} — every URL an `index.html` actually loads: `<script src>` and `<link href>` with
 *   `rel` stylesheet, preload, icon or apple-touch-icon. Preconnect, dns-prefetch and manifest excluded.
 * - {@link importMapOf} — the page's inline import map as `{ bare: url }`, `{}` when absent or unparsable.
 * - {@link buildClosure} — the transitive local closure of an entry, including the entry; `read(path)`
 *   returns source or `null`, and a missing file is simply a leaf.
 * - {@link isGlobal} — whether one changed file widens to the whole farm: anything under
 *   `packages/gates`, `packages/schema`, `packages/gen`, `deploy/`, `tools/` or the workflows; `deno.json`,
 *   `deno.jsonc`, `deno.lock`, `package.json`, `.npmrc`; a non-`.js` runtime asset (theme.css, fonts);
 *   `sw-core.js` (every app `importScripts` it, no import graph reaches it); any module in the shared
 *   bootstrap closure.
 * - {@link classifyAffected} — the affected set as a sorted array of app ids. Tests and docs change no
 *   app's verify; a global file returns every id; a file under an app hits that app; a runtime file hits
 *   every app whose closure contains it; an unknown top-level path returns every id, because the only
 *   unsafe error is verifying too few.
 *
 * ## Exit codes
 * None — no `Deno.exit` here. The wrapper `affected` prints the JSON array and exits with its own codes.
 *
 * ## Where it sits
 * No 8n8 node of its own; two nodes run on it. `affected` (phase ship, `tools/affected.mjs --all`) is
 * the scope `verify.yml` computes in its "Discover apps to verify" step — `git diff --name-only` piped
 * into `affected`, or `--all` on a manual run. `sw` (phase gate, `deploy/sw.mjs --check`) uses
 * `buildClosure`, `staticSpecs`, `htmlAssets` and `importMapOf` to regenerate each app's precache from
 * the real graph. The `unit` node runs its tests.
 *
 * ## Why
 * CI verifies only the apps a change can actually reach — computed, not guessed. The graph is conservative
 * in exactly one direction: shared or uncertain widens to all, because a stale service worker or a missed
 * app is the failure that ships, and an extra verified app only costs minutes.
 * @module
 */
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
/** Repo-relative prefix of the core runtime directory in this tree (the framework checkout's own, else the JSR package's). */
export const RT = (() => {
  try { Deno.statSync("packages/runtime/index.js"); return "packages/runtime/"; } catch { /* not the framework checkout */ }
  try { Deno.statSync(PKG + "index.js"); return PKG; } catch { return "packages/runtime/"; }
})();
/** File names of the product's own domain modules under rt/ — the overlay that shadows the core for those /_rt/ names. */
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
/**
 * Resolves a module specifier to a repo-relative path, or null when it is external (CDN-pinned).
 * @param spec the specifier as written in the import statement
 * @param fromFile repo-relative path of the file that contains the import
 * @returns the repo-relative path of the local module, or null for an external specifier
 */
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
/**
 * Collects every module specifier a source file references — static, dynamic and side-effect imports.
 * @param src the file's source text
 * @returns the unique specifiers, unresolved, in order of first appearance
 */
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
/**
 * Collects the specifiers a file reaches statically (`from "x"` and side-effect imports), excluding dynamic `import()`.
 * @param src the file's source text
 * @returns the unique static specifiers, unresolved
 */
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
/**
 * Lists every URL an index.html actually loads via `<script src>` and stylesheet/preload/icon `<link href>`.
 * @param html the page source
 * @returns the unique asset URLs, verbatim
 */
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
/**
 * Reads the page's inline import map.
 * @param html the page source
 * @returns the map's `imports` object ({ bareSpecifier: url }), or {} when there is none or it fails to parse
 */
export function importMapOf(html) {
  const m = /<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  try { return JSON.parse(m[1]).imports || {}; } catch { return {}; }
}

// Transitive local closure of an entry file (includes the entry). `read(path) → string | null` (null when a
// file is missing — a dangling import is simply a leaf). External specifiers are ignored.
/**
 * Walks the transitive local import closure of an entry file, including the entry itself.
 * @param entry repo-relative path of the entry module
 * @param read `(path) => string | null` — returns a file's source, or null when it is missing
 * @returns a Set of repo-relative paths reachable from the entry
 */
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
/**
 * Decides whether a changed file could plausibly affect every app and must therefore trigger the whole farm.
 * @param f repo-relative path of the changed file
 * @param coreSet the shared bootstrap closure (Set of repo-relative paths)
 * @returns true when the change widens to all apps
 */
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
/**
 * Computes the affected set: which apps a list of changed files can reach.
 * @param changed repo-relative paths of the changed files
 * @param apps `[{ id, closure: Set<file> }]` — every app with its import closure
 * @param coreSet the shared bootstrap closure (Set of repo-relative paths)
 * @returns a sorted array of app ids; every id when a whole-farm trigger is hit
 */
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
