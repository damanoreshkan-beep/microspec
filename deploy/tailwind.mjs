
import { compile } from "https://esm.sh/tailwindcss@4.3.3";

const TW = "https://cdn.jsdelivr.net/npm/tailwindcss@4.3.3"; 
const DAISY = "https://esm.sh/daisyui@5";                    

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

async function loadModule(id, base) {
  const spec = id.startsWith("daisyui") ? id.replace(/^daisyui/, DAISY) : `https://esm.sh/${id}`;
  const mod = await import(spec);
  return { base, module: mod.default ?? mod };
}

export function scanCandidates(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/[!-]?[a-z][a-z0-9]*(?:[-:/][a-z0-9!.%#[\]()_&>*+~,=]+)*/gi)) {
    const t = m[0];
    if (t.length > 1 && !/^https?:/.test(t)) out.add(t);
  }
  return [...out];
}

export async function buildTailwind(sourceTexts, { plugins = ["daisyui"], base = "/" } = {}) {
  const input = [`@import "tailwindcss";`, ...plugins.map((p) => `@plugin "${p}";`)].join("\n");
  const compiler = await compile(input, { base, loadStylesheet, loadModule });
  const candidates = [...new Set(sourceTexts.flatMap(scanCandidates))];
  const css = compiler.build(candidates);
  return { css, candidateCount: candidates.length };
}
