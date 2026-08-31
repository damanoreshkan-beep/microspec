// deploy/tailwind.mjs — compile Tailwind v4 + daisyui to a STATIC stylesheet, Deno-native.
//
// Why: the farm's runtime `@tailwindcss/browser@4` CDN crashes Safari 16.1 (JSC rejects a regex the
// browser build uses → SyntaxError → white screen). The compat build precompiles the CSS instead.
// This runs the SAME Tailwind v4 engine, but at build time, via esm.sh's denonext build — pure JS,
// NO Node, NO native `oxide` binary. See docs/RESEARCH-safari16-compat.md (F2).
//
// Usage:
//   import { buildTailwind } from "./tailwind.mjs";
//   const { css } = await buildTailwind([htmlText, viewJsText]);   // scans classes, returns CSS

import { compile } from "tailwindcss"; // bare: pinned npm:tailwindcss@4.3.3 in deno.json (same pure-JS engine; oxide is a separate package) — JSR rejects https imports

const TW = "https://cdn.jsdelivr.net/npm/tailwindcss@4.3.3"; // raw package files (index.css + partials)
const DAISY = "https://esm.sh/daisyui@5";                    // pure-JS plugin (denonext), no oxide

// resolve @import "tailwindcss" and its nested relative @imports from the published package
async function loadStylesheet(id, base) {
  const url = id === "tailwindcss"
    ? `${TW}/index.css`
    : id.startsWith(".")
      ? new URL(id, base.endsWith("/") ? base : base + "/").href
      : `${TW}/${id.replace(/^tailwindcss\//, "")}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`tailwind: cannot load stylesheet "${id}" (${url}): ${r.status}`);
  return { base: url.slice(0, url.lastIndexOf("/")), content: await r.text() };
}

// resolve @plugin "daisyui" (and any other JS plugin) to its module
async function loadModule(id, base) {
  const spec = id.startsWith("daisyui") ? id.replace(/^daisyui/, DAISY) : `https://esm.sh/${id}`;
  const mod = await import(spec);
  return { base, module: mod.default ?? mod };
}

import { scanCandidates } from "./candidates.mjs";
export { scanCandidates };
// Compile the given source texts' classes into one static stylesheet.
export async function buildTailwind(sourceTexts, { plugins = ["daisyui"], base = "/" } = {}) {
  const input = [`@import "tailwindcss";`, ...plugins.map((p) => `@plugin "${p}";`)].join("\n");
  const compiler = await compile(input, { base, loadStylesheet, loadModule });
  const candidates = [...new Set(sourceTexts.flatMap(scanCandidates))];
  const css = compiler.build(candidates);
  // The one failure this build has actually had: a token with a CSS variable inside brackets scanned wrong and
  // its rule was silently absent. If the sources use the farm's radius token, the stylesheet must carry it.
  if (candidates.includes("rounded-[var(--ms-r)]") && !css.includes("var(--ms-r)")) throw new Error("tailwind: rounded-[var(--ms-r)] scanned but not compiled — the token system would ship absent");
  // The second: tokens that START with `[` or `@` (the kit's child variants and container queries) were cut
  // at their first letter and silently absent from every deployed app (2026-08-21).
  if (candidates.includes("@container") && !css.includes("container-type")) throw new Error("tailwind: @container scanned but not compiled — container queries would ship absent");
  if (candidates.includes("[&>button]:flex-1") && !/>\s*button/.test(css)) throw new Error("tailwind: [&>button]:flex-1 scanned but not compiled — Segmented would ship without its flex children");
  return { css, candidateCount: candidates.length };
}
