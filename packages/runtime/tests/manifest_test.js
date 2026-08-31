// microspec runtime — every app manifest keeps rotation ON. The farm's design is adaptive (the verify matrix
// sweeps landscape and split shapes), so a manifest that locks the installed app to portrait throws all of
// that away on the home screen; 72 scaffolds carried "portrait" until 2026-08-19 and nobody could rotate.
import { assert } from "jsr:@std/assert@1";

Deno.test("manifest — no app locks orientation (adaptive design: rotation stays on)", async () => {
  // cwd-relative, NOT import.meta: this suite ships inside the @microspec/core package, and the apps live
  // in the CONSUMER'S tree (the cwd the gates run from) — an import.meta path would look inside the package.
  let n = 0, entries = [];
  try { entries = [...Deno.readDirSync("apps")]; } catch { /* appless checkout before the demo node */ }
  for (const d of entries) {
    if (!d.isDirectory) continue;
    let mf; try { mf = JSON.parse(await Deno.readTextFile(`apps/${d.name}/manifest.json`)); } catch { continue; }
    n++;
    assert(!mf.orientation || mf.orientation === "any" || mf.orientation === "natural", `${d.name}: manifest locks orientation to "${mf.orientation}"`);
  }
  // ≥1: the framework tree carries only its GENERATED demo app (the core knows no apps; the split,
  // 2026-08-31), the product tree the whole farm — the invariant is per-manifest either way.
  assert(n > 0, `only ${n} manifests found`);
});
