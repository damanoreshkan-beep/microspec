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
  const src = (await Promise.all(["render", "render-ctx", "list", "profile", "screens", "chrome", "dash"].map((n) => Deno.readTextFile(P(`packages/runtime/${n}.js`))))).join("\n");
  const got = scanCandidates(src);
  const broken = got.filter((t) => t.includes("var(") && !/\)\]$|\)$/.test(t));
  assertEquals(broken, [], "var() tokens cut inside brackets");
  assert(got.includes("rounded-[var(--ms-r)]"), "the radius token must be scanned from render.js");
});

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
