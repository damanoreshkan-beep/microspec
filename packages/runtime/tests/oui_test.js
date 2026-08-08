
import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseOui as ouiParse, vendorOf as ouiVendorOf, prefixOf as ouiPrefixOf, locallyAdministered as ouiLocallyAdministered } from "../oui.js";

Deno.test("oui: a vendor is named only where the address actually has one", () => {
  const a = 0xac_de_48, b = 0x24_0a_c4;                    
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const names = lo === a ? "Apple\nEspressif" : "Espressif\nApple";
  const table = ouiParse(`${lo.toString(36)},${(hi - lo).toString(36)}\n0,1\n${names}`);
  assertEquals(table.size, 2);
  assertEquals(table.get(a), "Apple");
  assertEquals(table.get(b), "Espressif");

  assertEquals(ouiVendorOf("AC:DE:48:11:22:33", "wifi", table), "Apple", "an AP's BSSID is a real OUI");
  assertEquals(ouiVendorOf("24:0A:C4:11:22:33", "wifi", table), "Espressif");

  assertEquals(ouiVendorOf("4C:DE:48:11:22:33", "ble", table), null,
    "a rotating BLE address must never be given a vendor");
  assertEquals(ouiVendorOf("AE:DE:48:11:22:33", "wifi", table), null);
  assert(ouiLocallyAdministered("02:00:00:00:00:01"), "the gate's own fixture is locally administered");
  assertEquals(ouiVendorOf("lte:301", "lte", table), null);
  assertEquals(ouiVendorOf("00:11:22:33:44:55", "wifi", table), null);
  assertEquals(ouiVendorOf("nonsense", "wifi", table), null);
  assertEquals(ouiVendorOf("AC:DE:48:11:22:33", "wifi", new Map()), null);

  assertEquals(ouiPrefixOf("AC:DE:48:11:22:33"), 0xacde48);
  assertEquals(ouiPrefixOf("acde48112233"), 0xacde48);
  assertEquals(ouiPrefixOf("AC:DE"), null);
  assertEquals(ouiParse("").size, 0);
  assertEquals(ouiParse("garbage").size, 0);
});
