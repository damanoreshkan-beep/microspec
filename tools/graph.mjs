/* @ts-self-types="./graph.d.mts" */
/**
 * Affected-app detection from the REAL import graph: pure functions (file IO injected) that resolve
 * specifiers, collect a file's imports, walk an entry's transitive closure and classify a changed-file
 * list into the set of apps CI must re-verify. Exports `RT`/`RT_OVERLAY` (where the core runtime lives in
 * this tree), `resolveSpec`, `importSpecs`, `staticSpecs`, `htmlAssets`, `importMapOf`, `buildClosure`,
 * `isGlobal` and `classifyAffected`; `tools/affected.mjs` is the thin IO wrapper the CI calls.
 * @module
 */

const PKG = "node_modules/@jsr/microspec__core/packages/runtime/";
/** Repo-relative prefix of the core runtime directory in this tree (the framework checkout's own, else the JSR package's). */
export const RT = (() => {
  try { Deno.statSync("packages/runtime/index.js"); return "packages/runtime/"; } catch {  }
  try { Deno.statSync(PKG + "index.js"); return PKG; } catch { return "packages/runtime/"; }
})();
/** File names of the product's own domain modules under rt/ — the overlay that shadows the core for those /_rt/ names. */
export const RT_OVERLAY = (() => {
  const names = new Set();
  try { for (const e of Deno.readDirSync("rt")) if (e.isFile && e.name.endsWith(".js")) names.add(e.name); } catch {  }
  return names;
})();
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
  if (f === "package.json" || f === ".npmrc") return true; 
  if ((f.startsWith(RT) || f.startsWith("rt/")) && !f.endsWith(".js")) return true; 
  if (f === RT + "sw-core.js") return true; 
  if (coreSet.has(f)) return true; 
  return false;
}

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
    if (isTest(f) || isDoc(f)) continue; 
    if (isGlobal(f, coreSet)) return allIds; 
    const am = /^apps\/([^/]+)\//.exec(f);
    if (am) {
      if (allIds.includes(am[1])) hit.add(am[1]);
      continue;
    }
    if (f.startsWith(RT) || f.startsWith("rt/")) {
      for (const a of apps) if (a.closure.has(f)) hit.add(a.id);
      continue;
    }
    return allIds; 
  }
  return [...hit].sort();
}
