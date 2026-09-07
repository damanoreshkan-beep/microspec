// microspec runtime — permissions unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { PERMISSIONS, GROUPS, permLabels, permState, permAndroid } from "../permissions.js";

// ---- permissions registry ---------------------------------------------------
// The row must report the gate that is ACTUALLY blocking. "Blocked" when the truth is "this needs the
// app" is a lie the user acts on, and a shell-only permission has no browser prompt to fall back to.

Deno.test("permState: a shell-only permission is needsApp in a browser, not unsupported", async () => {
  delete globalThis.window;
  const s = await permState("alarm");
  assertEquals(s.state, "needsApp");
  assertEquals(s.via, "");
  assertEquals(PERMISSIONS.alarm.group, "background");
});

Deno.test("permState: with a bridge, a capability answers via the shell", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { version: () => 1, call: () => {}, subscribe: () => {}, cancel: () => {} };
  try {
    const s = await permState("alarm");
    assertEquals(s.state, "granted");
    assertEquals(s.via, "shell");
    assert(permAndroid("alarm").includes("RECEIVE_BOOT_COMPLETED"), "the row must show what it rests on");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("permState: a shell too old for the capability says so instead of failing quietly", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { call: () => {}, subscribe: () => {}, cancel: () => {} };   // no version → 0
  try {
    assertEquals((await permState("alarm")).state, "staleApp");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("permissions: every entry has a group, and every group is one the screen knows", () => {
  for (const [name, def] of Object.entries(PERMISSIONS)) {
    assert(def.group, `${name} has no group`);
    assert(GROUPS.includes(def.group), `${name} is in unknown group ${def.group}`);
    assert(def.query || def.capability, `${name} has neither a browser backend nor a capability`);
  }
});

// A row with no label renders as a blank line in every app that lists it, and the labels are built in
// rather than per-app i18n — so nothing else in the farm can catch a row added without one.
Deno.test("permissions: every row is labelled in both locales", () => {
  for (const loc of ["uk", "en"]) {
    const L = permLabels(loc);
    for (const name of Object.keys(PERMISSIONS)) assert(L[name], `${name} has no ${loc} label`);
  }
});

// mesh is one row over four Android permissions: a node scans, connects AND advertises. Declaring the
// two halves separately was the alternative; one row that grants all four is what an app actually needs.
Deno.test("permissions: the mesh row rests on the whole set the transport needs", () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { version: () => 99, call: () => {}, subscribe: () => {}, cancel: () => {} };
  try {
    const need = permAndroid("mesh");
    for (const p of ["BLUETOOTH_SCAN", "BLUETOOTH_ADVERTISE", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION"]) {
      assert(need.includes(p), `the mesh row must rest on ${p}`);
    }
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});
