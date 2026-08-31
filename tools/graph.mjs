
export const RT = (() => {
  try { Deno.statSync("rt/index.js"); return "rt/"; } catch { return "packages/runtime/"; }
})();

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

export function resolveSpec(spec, fromFile) {
  if (spec.startsWith("/_rt/")) return RT + spec.slice(5);
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return normalize(dirOf(fromFile) + "/" + spec);
  }
  return null;
}

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

export function staticSpecs(src) {
  const out = new Set();
  let m;
  const from = /\bfrom\s*["']([^"']+)["']/g;
  while ((m = from.exec(src))) out.add(m[1]);
  const side = /(?:^|[;\n])\s*import\s+["']([^"']+)["']/g;
  while ((m = side.exec(src))) out.add(m[1]);
  return [...out];
}

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

export function importMapOf(html) {
  const m = /<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  try { return JSON.parse(m[1]).imports || {}; } catch { return {}; }
}

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

export function isGlobal(f, coreSet) {
  if (/^packages\/(gates|schema|gen)\//.test(f)) return true;
  if (
    /^deploy\//.test(f) || /^\.github\/workflows\//.test(f) ||
    /^tools\//.test(f)
  ) return true;
  if (f === "deno.json" || f === "deno.jsonc" || f === "deno.lock") return true;
  if (f.startsWith(RT) && !f.endsWith(".js")) return true; 
  if (f === RT + "sw-core.js") return true; 
  if (coreSet.has(f)) return true; 
  return false;
}

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
    if (f.startsWith(RT)) {
      for (const a of apps) if (a.closure.has(f)) hit.add(a.id);
      continue;
    }
    return allIds; 
  }
  return [...hit].sort();
}
