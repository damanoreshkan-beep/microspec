import { assert, assertEquals } from "jsr:@std/assert@1";
import { sys } from "../i18n.js";
import spec from "../../schema/spec.schema.json" with { type: "json" };
import { pkgRoot } from "../pkgroot.js";

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

Deno.test("the fixture offers words only where the edge does", async () => {
  const { gateFixture } = await import("../watch.js");
  for (const s of ["iss", "air", "kp", "quake"]) {
    const f = gateFixture(s);
    assert(f.sources[s].bands?.length, `${s} answers in words on the edge and must here`);
    assertEquals(f.rules[0].band, "close");
  }
  for (const s of ["weather", "rate", "uah", "coin", "launch"]) {
    const f = gateFixture(s);
    assertEquals(f.sources[s].bands, null, `${s} is a number a person reads`);
    assertEquals(f.rules[0].band, null);
  }
});

Deno.test("the admin row is a word here and a path from the edge", async () => {
  for (const loc of ["uk", "en"]) {
    const v = sys("adminRow", loc);
    assert(typeof v === "string" && v.length > 0 && v !== "adminRow", `adminRow/${loc} is missing`);
  }
  assert(sys("adminRow", "uk") !== sys("adminRow", "en"));
  const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));
  const src = (await Promise.all(["render", "render-ctx", "list", "profile", "screens", "chrome", "dash"].map((n) => Deno.readTextFile(P(`packages/runtime/${n}.js`))))).join("\n");
  const auth = await Deno.readTextFile(P("packages/runtime/auth.js"));
  assert(!/\/feed\/admin\/ui/.test(src + auth), "the panel's path must not be written in the public runtime");
  assert(/adminPanel\(\)/.test(src), "the row asks the edge instead");
});
