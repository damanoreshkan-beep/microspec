import { assert, assertEquals } from "jsr:@std/assert@1";
import { sys } from "../i18n.js";
import spec from "../../schema/spec.schema.json" with { type: "json" };

const WORDS = [
  "watchRow", "watchNeedTg", "watchCost", "watchBalance", "watchAbove", "watchBelow",
  "watchNow", "watchQuiet", "watchSave", "watchSignIn", "watchFree", "watchOff", "watchNoPlace", "watchTooMany", "watchFailed",
];

Deno.test("the bell paints nothing it cannot say in both languages", () => {
  for (const k of WORDS) {
    for (const loc of ["uk", "en"]) {
      const v = sys(k, loc);
      assert(typeof v === "string" && v.length > 0 && v !== k, `${k}/${loc} is missing`);
    }
    assert(sys(k, "uk") !== sys(k, "en"), `${k} is the same string in both languages`);
  }
});

Deno.test("the bell is declared on the TAB, because one app can hold two things worth watching", () => {
  const w = spec.properties.tabs.items.properties.watch;
  assert(w, "tabs[].watch is not in the schema");
  assertEquals(w.required, ["source"]);
  assertEquals(w.additionalProperties, false);
  assertEquals(Object.keys(w.properties).sort(), ["params", "source"]);
  assert(!spec.properties.profile.properties.watch, "profile.watch is still there");
});
