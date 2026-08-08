
import { assert, assertEquals } from "jsr:@std/assert@1";
import { bandAt, BANDS as ETHER_BANDS, LISTEN_PRESETS, RADAR_SPAN, UNKNOWN } from "../bandplan.js";

Deno.test("bandplan: classifies known peaks to human bands, unknown otherwise; presets are analog-only", () => {
  assertEquals(bandAt(2_450_000_000).id, "ism24");     
  assertEquals(bandAt(433_920_000).id, "ism433");      
  assertEquals(bandAt(124_000_000).id, "air");         
  assertEquals(bandAt(1_575_420_000).id, "gps");       
  assertEquals(bandAt(3_000_000_000), UNKNOWN);        
  for (const b of ETHER_BANDS) assert(b.hi > b.lo, `${b.id} range ordered`);
  for (const p of LISTEN_PRESETS) assert(["am", "nfm", "wfm"].includes(p.mode), `${p.id} is analog voice`);
  assert(RADAR_SPAN.every(([a, z]) => z > a));
});
