// deploy/candidates.mjs — the Tailwind candidate scanner keeps bracketed values WHOLE. Regression pin for
// 2026-08-14 → 08-16, when every var()-carrying token was cut at its first inner hyphen and production shipped
// without the density/radius/accent tokens while every gate was green.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { scanCandidates } from "../../../deploy/candidates.mjs";

Deno.test("scanCandidates: tokens with CSS variables inside brackets survive whole", () => {
  const got = scanCandidates(`class="rounded-[var(--ms-r)] h-[var(--ms-ctl)] gap-[var(--ms-gap)] p-[var(--ms-pad)] text-[var(--ms-label)] text-[var(--app-accent)] w-[calc(var(--ms-r)*2)] rounded-(--ms-r) bg-base-content/70 !p-0 -mx-2 hover:bg-white/10 [&>svg]:hidden"`);
  for (const t of ["rounded-[var(--ms-r)]", "h-[var(--ms-ctl)]", "gap-[var(--ms-gap)]", "p-[var(--ms-pad)]", "text-[var(--ms-label)]", "text-[var(--app-accent)]", "w-[calc(var(--ms-r)*2)]", "rounded-(--ms-r)", "bg-base-content/70", "!p-0", "-mx-2", "hover:bg-white/10"]) {
    assert(got.includes(t), "missing: " + t + " in " + JSON.stringify(got));
  }
  assert(!got.some((t) => t.startsWith("http")));
});

Deno.test("scanCandidates: the runtime kit's own classes are all kept whole (no token ends at an open bracket)", async () => {
  const src = await Deno.readTextFile(new URL("../render.js", import.meta.url));
  const got = scanCandidates(src);
  // over-inclusion (JS fragments like "Icon(") is harmless; a var() token that does not close its bracket is the bug
  const broken = got.filter((t) => t.includes("var(") && !/\)\]$|\)$/.test(t));
  assertEquals(broken, [], "var() tokens cut inside brackets");
  assert(got.includes("rounded-[var(--ms-r)]"), "the radius token must be scanned from render.js");
});
