// microspec runtime — the APK flavour derivation. Pure logic: no browser, no network.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)
//
// Why this file exists. A heavier shell FLAVOUR is named in four places — the catalogue's `flavours` map,
// the spec schema's `profile.apk` enum, the download path in render.js, and the edge's own two ladders —
// and only the first is authoritative. render.js carried `profile.apk === "godot" ? "godot" : undefined`,
// so when `"mesh"` entered the schema every mesh app quietly downloaded the `full` shell and the bridge
// refused its capability on the device with "capability not granted to this page". Nothing was red: the
// schema accepted the value, the edge would have honoured it, and the one ternary in between dropped it.
// These tests tie the derivation to the catalogue so the NEXT flavour cannot repeat it.

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
  // The edge would answer "template not configured" (503) for one of these; refusing here means the
  // download row fails on a name the shell could never carry, instead of after a round trip.
  assertEquals(apkPower({ profile: { apk: "quantum" } }), undefined);
  assertEquals(apkPower({ profile: { apk: "" } }), undefined);
});

Deno.test("the flavour list is derived from the capability map, not a second copy of it", () => {
  const fromMap = [...new Set(Object.values(FLAVOUR_OF).flat())].sort();
  assertEquals(FLAVOURS, fromMap, "FLAVOURS must be exactly the flavours named in FLAVOUR_OF");
});
