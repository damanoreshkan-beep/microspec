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

import { compile } from "https://esm.sh/tailwindcss@4.3.3";

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

// Broad candidate extraction from source text. Over-inclusion is harmless — Tailwind emits nothing for
// tokens that are not real utilities; UNDER-inclusion silently drops CSS and breaks the look on device,
// so this stays permissive: variants (md:, hover:, dark:), negatives (-mx-2), important (!p-0),
// slashes (bg-white/10) and arbitrary values ([&>svg]:hidden, w-[42px]).
export function scanCandidates(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/[!-]?[a-z][a-z0-9]*(?:[-:/][a-z0-9!.%#[\]()_&>*+~,=]+)*/gi)) {
    const t = m[0];
    if (t.length > 1 && !/^https?:/.test(t)) out.add(t);
  }
  return [...out];
}

// Compile the given source texts' classes into one static stylesheet.
export async function buildTailwind(sourceTexts, { plugins = ["daisyui"], base = "/" } = {}) {
  const input = [`@import "tailwindcss";`, ...plugins.map((p) => `@plugin "${p}";`)].join("\n");
  const compiler = await compile(input, { base, loadStylesheet, loadModule });
  const candidates = [...new Set(sourceTexts.flatMap(scanCandidates))];
  const css = compiler.build(candidates);
  return { css, candidateCount: candidates.length };
}
