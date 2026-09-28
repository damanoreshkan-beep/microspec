import { compile } from "tailwindcss";

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
  const mod = id.startsWith("daisyui") ? await import("daisyui") : await import(`https://esm.sh/${id}`);
  return { base, module: mod.default ?? mod };
}

import { scanCandidates } from "./candidates.mjs";
export { scanCandidates };
export async function buildTailwind(sourceTexts, { plugins = ["daisyui"], base = "/" } = {}) {
  const input = [`@import "tailwindcss";`, ...plugins.map((p) => `@plugin "${p}";`)].join("\n");
  const compiler = await compile(input, { base, loadStylesheet, loadModule });
  const candidates = [...new Set(sourceTexts.flatMap(scanCandidates))];
  const css = compiler.build(candidates);
  if (candidates.includes("rounded-[var(--ms-r)]") && !css.includes("var(--ms-r)")) throw new Error("tailwind: rounded-[var(--ms-r)] scanned but not compiled — the token system would ship absent");
  if (candidates.includes("@container") && !css.includes("container-type")) throw new Error("tailwind: @container scanned but not compiled — container queries would ship absent");
  if (candidates.includes("[&>button]:flex-1") && !/>\s*button/.test(css)) throw new Error("tailwind: [&>button]:flex-1 scanned but not compiled — Segmented would ship without its flex children");
  return { css, candidateCount: candidates.length };
}
