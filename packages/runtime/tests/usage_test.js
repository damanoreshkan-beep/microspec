// usage.js — the browser-free half: which data-* hook names a control, the machinery attributes that are
// skipped, and the caps. The delegated listener and the flush points are exercised on the live site by the
// drivers, the same way telemetry's are.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { hookOf, flushUsage, installUsage, CENSUS_MS, MAX_KEYS } from "../usage.js";

/** The smallest thing that behaves like the DOM nodes hookOf walks: attributes + parentElement. */
const node = (attrs, parent = null) => ({
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  parentElement: parent,
  getAttribute: (n) => attrs[n] ?? null,
});

Deno.test("hookOf: the data-* name of the control, without the prefix and without the value", () => {
  assertEquals(hookOf(node({ "data-montage": "" })), "montage");
  assertEquals(hookOf(node({ "data-chunk": "7" })), "chunk", "the NAME is the census key; the value never is");
});

Deno.test("hookOf: walks up from the icon inside the button to the element that carries the hook", () => {
  const button = node({ "data-generate": "", class: "btn" });
  const icon = node({ class: "icon" }, button);
  assertEquals(hookOf(icon), "generate");
});

Deno.test("hookOf: the runtime's own machinery attributes are not controls", () => {
  assertEquals(hookOf(node({ "data-haptic": "bump" })), "", "haptics are how a control feels, not what it is");
  assertEquals(hookOf(node({ "data-theme": "dark" })), "");
  // a real button carries both: the hook must win over the machinery beside it
  const both = node({ "data-haptic": "bump", "data-share": "" });
  assertEquals(hookOf(both), "share");
});

Deno.test("hookOf: nothing to name, and a node with no attributes at all", () => {
  assertEquals(hookOf(node({ class: "wrap" })), "");
  assertEquals(hookOf(null), "");
  assertEquals(hookOf({}), "");
});

Deno.test("hookOf: the walk is bounded, so a deep tree cannot cost a tap its frame", () => {
  let el = node({ "data-root": "" });
  for (let i = 0; i < 20; i++) el = node({ class: "x" }, el);   // hook is 20 hops up
  assertEquals(hookOf(el), "", "beyond the hop limit the tap is simply uncounted");
});

Deno.test("flushUsage + installUsage: inert without a document, and silent with nothing to say", () => {
  let fetched = 0; const real = globalThis.fetch;
  globalThis.fetch = () => { fetched++; return Promise.resolve(new Response("")); };
  try { installUsage(null); flushUsage(); } finally { globalThis.fetch = real; }
  assertEquals(fetched, 0, "a census with no taps sends nothing, and report() is a no-op in tests anyway");
});

Deno.test("budget: the roll-up is slow and the key count is capped", () => {
  assertEquals(CENSUS_MS, 120000);
  assertEquals(MAX_KEYS, 40);
  assert(CENSUS_MS >= 60000, "a census that flushed often would be the stream it exists to avoid");
});
