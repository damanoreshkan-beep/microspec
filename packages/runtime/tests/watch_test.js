// The bell's two contracts that a refactor can silently break: every word it paints exists in both
// languages, and the spec key an app opts in with is one the schema will actually accept. The firing
// logic it drives is not here — it lives on the edge (microspec-edge edge/watch.test.js), which is the
// only place that can decide a crossing.
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
  // And it is NOT on the profile any more: two declaration sites is the shape that drifts.
  assert(!spec.properties.profile.properties.watch, "profile.watch is still there");
});

// The gate's fixture is the only edge a headless run has, so a source that answers in numbers must go on
// answering in numbers there. A fixture that gave every source bands would photograph a control five apps
// do not have, and the gate would be green on a screen production never shows.
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

// The admin row's two contracts: it can be said in both languages, and the path it points at is never
// written in this repository — the edge hands it to an admin and to nobody else.
Deno.test("the admin row is a word here and a path from the edge", async () => {
  for (const loc of ["uk", "en"]) {
    const v = sys("adminRow", loc);
    assert(typeof v === "string" && v.length > 0 && v !== "adminRow", `adminRow/${loc} is missing`);
  }
  assert(sys("adminRow", "uk") !== sys("adminRow", "en"));
  const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));
  const src = await Deno.readTextFile(P("packages/runtime/render.js"));
  const auth = await Deno.readTextFile(P("packages/runtime/auth.js"));
  // A literal here would publish the surface to everyone who reads a public repository.
  assert(!/\/feed\/admin\/ui/.test(src + auth), "the panel's path must not be written in the public runtime");
  assert(/adminPanel\(\)/.test(src), "the row asks the edge instead");
});
