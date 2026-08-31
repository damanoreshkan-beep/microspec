// deploy/candidates.mjs — the Tailwind candidate scanner keeps bracketed values WHOLE. Regression pin for
// 2026-08-14 → 08-16, when every var()-carrying token was cut at its first inner hyphen and production shipped
// without the density/radius/accent tokens while every gate was green.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { scanCandidates } from "../../../deploy/candidates.mjs";
import { pkgRoot } from "../pkgroot.js";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("scanCandidates: tokens with CSS variables inside brackets survive whole", () => {
  const got = scanCandidates(`class="rounded-[var(--ms-r)] h-[var(--ms-ctl)] gap-[var(--ms-gap)] p-[var(--ms-pad)] text-[var(--ms-label)] text-[var(--app-accent)] w-[calc(var(--ms-r)*2)] rounded-(--ms-r) bg-base-content/70 !p-0 -mx-2 hover:bg-white/10 [&>svg]:hidden"`);
  for (const t of ["rounded-[var(--ms-r)]", "h-[var(--ms-ctl)]", "gap-[var(--ms-gap)]", "p-[var(--ms-pad)]", "text-[var(--ms-label)]", "text-[var(--app-accent)]", "w-[calc(var(--ms-r)*2)]", "rounded-(--ms-r)", "bg-base-content/70", "!p-0", "-mx-2", "hover:bg-white/10"]) {
    assert(got.includes(t), "missing: " + t + " in " + JSON.stringify(got));
  }
  assert(!got.some((t) => t.startsWith("http")));
});

Deno.test("scanCandidates: the runtime kit's own classes are all kept whole (no token ends at an open bracket)", async () => {
  const src = await Deno.readTextFile(P("packages/runtime/render.js"));
  const got = scanCandidates(src);
  // over-inclusion (JS fragments like "Icon(") is harmless; a var() token that does not close its bracket is the bug
  const broken = got.filter((t) => t.includes("var(") && !/\)\]$|\)$/.test(t));
  assertEquals(broken, [], "var() tokens cut inside brackets");
  assert(got.includes("rounded-[var(--ms-r)]"), "the radius token must be scanned from render.js");
});

// 2026-08-21 (mirage's split shot): a token may START with `[` or `@`. Requiring a leading letter cut the
// kit's child variants to `button]:flex-1`, `@container` to `container`, and `@max-[9rem]/sl:flex-row` to a
// VIEWPORT media query — so dist shipped every Segmented without flex children and no container query at all.
Deno.test("scanCandidates: tokens that start with a bracket or an at sign survive whole", () => {
  const got = scanCandidates("class=\"@container flex [&>button]:flex-1 [&>button]:min-w-0 @max-[9rem]/sl:flex-row @max-[17rem]:hidden [&::-webkit-scrollbar]:hidden\"");
  for (const t of ["@container", "[&>button]:flex-1", "[&>button]:min-w-0", "@max-[9rem]/sl:flex-row", "@max-[17rem]:hidden", "[&::-webkit-scrollbar]:hidden"]) {
    assert(got.includes(t), "missing: " + t + " in " + JSON.stringify(got));
  }
});

Deno.test("scanCandidates: the kit's container queries and child variants are scanned from ui.js", async () => {
  const got = scanCandidates(await Deno.readTextFile(P("packages/runtime/ui.js")));
  for (const t of ["@container", "[&>button]:flex-1", "[&>button]:min-w-0", "[&>button]:shrink-0"]) assert(got.includes(t), "missing from ui.js scan: " + t);
});
