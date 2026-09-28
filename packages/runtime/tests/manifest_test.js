import { assert } from "jsr:@std/assert@1";

Deno.test("manifest — no app locks orientation (adaptive design: rotation stays on)", async () => {
  let n = 0, entries = [];
  try { entries = [...Deno.readDirSync("apps")]; } catch { }
  for (const d of entries) {
    if (!d.isDirectory) continue;
    let mf; try { mf = JSON.parse(await Deno.readTextFile(`apps/${d.name}/manifest.json`)); } catch { continue; }
    n++;
    assert(!mf.orientation || mf.orientation === "any" || mf.orientation === "natural", `${d.name}: manifest locks orientation to "${mf.orientation}"`);
  }
  assert(n > 0, `only ${n} manifests found`);
});
