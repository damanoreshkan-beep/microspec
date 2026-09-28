import { assert, assertEquals } from "jsr:@std/assert@1";
import { apkPower } from "../apk.js";
import { FLAVOURS, FLAVOUR_OF } from "../shell-actions.js";

Deno.test("apkPower: every flavour the catalogue defines is forwarded, not just the one someone typed", () => {
  assert(FLAVOURS.length > 0, "the catalogue defines no flavours — this test would prove nothing");
  for (const f of FLAVOURS) {
    assertEquals(apkPower({ profile: { apk: f } }), f, `profile.apk "${f}" must reach the edge as power "${f}"`);
  }
});

Deno.test("apkPower: an app that asks for nothing gets the default shell", () => {
  assertEquals(apkPower({ profile: {} }), undefined);
  assertEquals(apkPower({}), undefined);
  assertEquals(apkPower(undefined), undefined);
});

Deno.test("apkPower: a flavour the catalogue does not define is dropped, never forwarded", () => {
  assertEquals(apkPower({ profile: { apk: "quantum" } }), undefined);
  assertEquals(apkPower({ profile: { apk: "" } }), undefined);
});

Deno.test("the flavour list is derived from the capability map, not a second copy of it", () => {
  const fromMap = [...new Set(Object.values(FLAVOUR_OF).flat())].sort();
  assertEquals(FLAVOURS, fromMap, "FLAVOURS must be exactly the flavours named in FLAVOUR_OF");
});
