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
  assert(n > 2, `only ${n} manifests found`);
});
