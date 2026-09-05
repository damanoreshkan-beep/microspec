// godotstage.js — the engine under the page. Without a shell (this test, every browser) there is no engine:
// available() is false and the element is honest about it. The gate's mock makes the has-engine branch of an
// app's tree render in Chromium; the engine itself is proven on a device.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { GodotStage, godotAvailable, godotSave } from "../godotstage.js";
import { ACTIONS } from "../shell-actions.js";

Deno.test("godotAvailable: false where no shell answers", () => {
  assertEquals(godotAvailable(), false);
});

Deno.test("the six engine actions are in the catalogue with their kinds", () => {
  for (const [id, kind] of [["godot.start", "call"], ["godot.stop", "call"], ["godot.set", "call"], ["godot.input", "call"], ["godot.save", "call"], ["godot.state", "subscribe"]]) {
    assert(ACTIONS[id], `${id} missing from the catalogue`);
    assertEquals(ACTIONS[id].kind, kind, id);
    assertEquals(ACTIONS[id].capability, "godot", id);
  }
});

Deno.test("godotSave rejects without a shell rather than pretending", async () => {
  let failed = false;
  try { await godotSave("x.png"); } catch { failed = true; }
  assert(failed);
});

Deno.test("GodotStage is a component", () => { assertEquals(typeof GodotStage, "function"); });
