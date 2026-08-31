// microspec runtime — every app manifest keeps rotation ON. The farm's design is adaptive (the verify matrix
// sweeps landscape and split shapes), so a manifest that locks the installed app to portrait throws all of
// that away on the home screen; 72 scaffolds carried "portrait" until 2026-08-19 and nobody could rotate.
import { assert } from "jsr:@std/assert@1";

Deno.test("manifest — no app locks orientation (adaptive design: rotation stays on)", async () => {
  const root = new URL("../../../apps/", import.meta.url);
  let n = 0;
  for await (const d of Deno.readDir(root)) {
    if (!d.isDirectory) continue;
    let mf; try { mf = JSON.parse(await Deno.readTextFile(new URL(`${d.name}/manifest.json`, root))); } catch { continue; }
    n++;
    assert(!mf.orientation || mf.orientation === "any" || mf.orientation === "natural", `${d.name}: manifest locks orientation to "${mf.orientation}"`);
  }
  // ≥1: the framework tree carries only its GENERATED demo app (the core knows no apps; the split,
  // 2026-08-31), the product tree the whole farm — the invariant is per-manifest either way.
  assert(n > 0, `only ${n} manifests found`);
});
