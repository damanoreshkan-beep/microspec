import { assert } from "jsr:@std/assert@1";
import { APPS } from "../../../tools/graph.mjs";

Deno.test("manifest — no app sets orientation (the phone's auto-rotate setting decides)", async () => {
  let n = 0, entries = [];
  try { entries = [...Deno.readDirSync(APPS)]; } catch { }
  for (const d of entries) {
    if (!d.isDirectory) continue;
    let mf; try { mf = JSON.parse(await Deno.readTextFile(`${APPS}/${d.name}/manifest.json`)); } catch { continue; }
    n++;
    assert(!("orientation" in mf), `${d.name}: manifest sets orientation "${mf.orientation}" — remove it`);
  }
  assert(n > 0, `only ${n} manifests found`);
});
