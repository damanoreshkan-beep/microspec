// microspec runtime — spec validation unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)


import { assert, assertThrows } from "jsr:@std/assert@1";
import { validateSpec } from "../validate.js";

const i18n = { en: { hi: "hi" }, uk: { hi: "привіт" } };
const baseList = () => ({
  // translate is not incidental here: a feed card.body is API prose, and the contract requires it be
  // translated (or the app declare spec.localized). A fixture without it would not be a legal app.
  id: "app", i18n, translate: ["desc"],
  tabs: [{ id: "feed", type: "list", icon: "lucide:list", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }],
});

Deno.test("validateSpec accepts one valid tab per family", () => {
  // list
  validateSpec(baseList());
  // list/row
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "code", trailing: "rate" } }] });
  // converter
  validateSpec({ ...baseList(), tabs: [{ id: "c", type: "converter", icon: "i", label: "hi", codeField: "code", rateField: "rate", base: "USD" }] });
  // profile
  validateSpec({ ...baseList(), tabs: [{ id: "me", type: "profile", icon: "i", label: "hi" }] });
  // dashboard
  validateSpec({ ...baseList(), tabs: [{ id: "d", type: "dashboard", icon: "i", label: "hi", hero: { value: "temp" } }] });
  // tool
  validateSpec({ ...baseList(), tabs: [{ id: "t", type: "tool", icon: "i", label: "hi", view: "ruler" }] });
});

Deno.test("validateSpec accepts detail + filters + searchFetch", () => {
  const spec = baseList();
  spec.tabs[0].search = true;
  spec.tabs[0].searchFetch = true;
  spec.detail = { title: "name", rows: [{ field: "bio", label: "hi" }], actions: [{ href: "url", label: "hi" }] };
  spec.filters = { controls: [{ type: "segment", key: "lang", label: "hi", options: [["en", "hi"]] }] };
  validateSpec(spec);
});

Deno.test("validateSpec throws path-named errors", () => {
  const cases = [
    [{}, "spec.id"],
    [{ id: "a", i18n, tabs: [] }, "spec.tabs"],
    [{ id: "a", tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "feed", title: "x" } }] }, "spec.i18n"],
    [{ ...baseList(), fav: {} }, "spec.fav.key"],
    [{ ...baseList(), tabs: [{ id: "t", type: "lst", icon: "i", label: "l" }] }, "spec.tabs[0].type"],
    [{ ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "feed" } }] }, "spec.tabs[0].card.title"],
    [{ ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "row", title: "x" } }] }, "spec.tabs[0].card.lead"],
    [{ ...baseList(), tabs: [{ id: "t", type: "converter", icon: "i", label: "l" }] }, "spec.tabs[0].codeField"],
    [{ ...baseList(), tabs: [{ id: "t", type: "tool", icon: "i", label: "l" }] }, "spec.tabs[0].view"],
    [{ ...baseList(), tabs: [{ id: "t", type: "dashboard", icon: "i", label: "l" }] }, "spec.tabs[0].hero"],
    [{ ...baseList(), detail: { rows: [] } }, "spec.detail.title"],
    [{ ...baseList(), filters: { controls: [{ type: "select", key: "k", label: "l" }] } }, "spec.filters.controls[0].optionsFrom"],
  ];
  for (const [spec, path] of cases) {
    const err = assertThrows(() => validateSpec(spec), Error);
    assert(err.message.includes(path), `expected error to name "${path}", got: ${err.message}`);
  }
});

Deno.test("validateSpec: feed card needs a preview slot (no raw title-only cards)", () => {
  const raw = { ...baseList(), tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name" } }] };
  const err = assertThrows(() => validateSpec(raw), Error);
  assert(err.message.includes("spec.tabs[0].card") && /preview slot/.test(err.message), err.message);
  // any one preview slot satisfies it (a `body` slot also has to declare its translation — see the
  // body-prose contract test below; that is a separate rule, not this one)
  for (const slot of ["subtitle", "body", "image"]) {
    validateSpec({ ...baseList(), translate: ["x"], tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", [slot]: "x" } }] });
  }
  // row layout is exempt (compact title+value line)
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
});

Deno.test("validateSpec: grid layout (launcher) needs a tile, exempt from feed density", () => {
  const gridTab = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", title: "title", ...card } }] });
  // icon or image satisfies the tile requirement
  validateSpec(gridTab({ icon: "glyph" }));
  validateSpec(gridTab({ image: "iconUrl" }));
  // a grid with neither is rejected (needs a tile), NOT the feed "preview slot" message
  const err = assertThrows(() => validateSpec(gridTab({})), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs a tile/.test(err.message), err.message);
});

Deno.test("validateSpec: searchFetch requires search:true", () => {
  const spec = baseList();
  spec.tabs[0].searchFetch = true; // no search:true
  const err = assertThrows(() => validateSpec(spec), Error);
  assert(err.message.includes("searchFetch requires search"));
});

Deno.test("validateSpec: spec.v mismatch rejected", () => {
  assertThrows(() => validateSpec({ ...baseList(), v: 99 }), Error, "spec.v");
});

Deno.test("validateSpec: a card that leaves the app needs a detail (the drill-down contract)", () => {
  // The farm's rule: a tap opens the IN-APP detail; the outbound link lives in detail.actions. Without
  // spec.detail the runtime renders the card as <a target="_blank">, so the tap throws the user out to the
  // source before they can read, save, or even see what the item is. books, dou and hn all shipped that
  // way — the pattern existed, nothing enforced it.
  const withHref = () => ({ ...baseList(), tabs: [{ id: "feed", type: "list", icon: "i", label: "hi", card: { layout: "feed", href: "url", title: "name", body: "desc" } }] });
  const err = assertThrows(() => validateSpec(withHref()), Error);
  assert(err.message.includes("spec.tabs[0].card.href") && /detail/.test(err.message), err.message);

  // …and passes once a detail exists.
  validateSpec({ ...withHref(), detail: { title: "name", body: "desc", actions: [{ href: "url", label: "open" }] } });
  // A card with no href never needed one.
  validateSpec(baseList());

  // `grid` is exempt — the launcher tile, where leaving IS the point (it opens another app).
  validateSpec({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "grid", href: "url", title: "title", icon: "glyph" } }] });
});

Deno.test("validateSpec: detail.body is an accepted long-form slot", () => {
  // The card can only ever show a 2-line clamp; without a body slot the drill-down was thinner than the
  // thing it drilled into.
  validateSpec({ ...baseList(), detail: { title: "name", body: "desc" } });
  validateSpec({ ...baseList(), detail: { title: "name" } });   // still optional
});

Deno.test("validateSpec: feed body prose must be translated (or declared already-localized)", () => {
  // dou shipped English job descriptions into a Ukrainian UI for months. The translate engine existed and
  // five apps used it; dou just never declared it, and nothing asked.
  const feedBody = () => { const s = { ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", body: "desc" } }] }; delete s.translate; return s; };
  const err = assertThrows(() => validateSpec(feedBody()), Error);
  assert(err.message.includes("spec.tabs[0].card.body") && /translate/.test(err.message), err.message);

  validateSpec({ ...feedBody(), translate: ["desc"] });          // translated at render time
  validateSpec({ ...feedBody(), localized: true });              // adapter already returns the active locale

  // Scoped to `body` on purpose: identifiers must NOT be machine-translated. A row card of names/values
  // (crypto, rates) and a subtitle holding an address stay legal untouched — translating "Bitcoin" or
  // "Khreshchatyk 1" would corrupt them, not localize them.
  validateSpec({ ...baseList(), tabs: [{ id: "r", type: "list", icon: "i", label: "hi", card: { layout: "row", title: "name", lead: "a", trailing: "b" } }] });
  validateSpec({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", card: { layout: "feed", title: "name", subtitle: "addr" } }] });
});

// ── detail.actions: href XOR play — and the two validators must agree ─────────────────────────────
Deno.test("validateSpec: an action either leaves the app or plays in it", () => {
  const withDetail = (actions) => ({ ...baseList(), detail: { title: "name", actions } });
  validateSpec(withDetail([{ label: "open", href: "url" }]));
  validateSpec(withDetail([{ label: "watch", play: "video" }]));
  validateSpec(withDetail([{ label: "watch", play: "video", icon: "lucide:play" }]));
  // neither → the button would do nothing at all
  assertThrows(() => validateSpec(withDetail([{ label: "x" }])), Error, "spec.detail.actions[0].href");
  // both → two meanings, and the runtime would have to guess which the author meant
  const err = assertThrows(() => validateSpec(withDetail([{ label: "x", href: "url", play: "video" }])), Error);
  assert(err.message.includes("spec.detail.actions[0].play"), err.message);
  assertThrows(() => validateSpec(withDetail([{ play: "video" }])), Error, "spec.detail.actions[0].label");
});

// ── gallery — the catalogue showcase, and why it is not `grid` ────────────────────────────────────
Deno.test("validateSpec: gallery needs art, because the art IS the recognition", () => {
  const gal = (card) => ({ ...baseList(), tabs: [{ id: "apps", type: "list", icon: "i", label: "hi", card: { layout: "gallery", title: "name", ...card } }] });
  validateSpec(gal({ image: "iconUrl" }));
  validateSpec(gal({ icon: "glyph" }));
  validateSpec(gal({ image: "iconUrl", subtitle: "publisher", badges: [{ field: "version" }] }));
  // Strip the art and it is just a worse feed — scanning a catalogue is looking, not reading.
  const err = assertThrows(() => validateSpec(gal({ subtitle: "publisher" })), Error);
  assert(err.message.includes("spec.tabs[0].card") && /needs art/.test(err.message), err.message);
  // …and it is NOT held to the feed preview-slot rule: a gallery tile with no body is the whole point.
  validateSpec(gal({ image: "iconUrl" }));
  assertThrows(() => validateSpec(gal({ image: "iconUrl", title: "" })), Error, "spec.tabs[0].card.title");
});

Deno.test("validateSpec: gallery is a real layout, and a typo is still caught", () => {
  const bad = { ...baseList(), tabs: [{ id: "t", type: "list", icon: "i", label: "l", card: { layout: "galery", title: "name", image: "x" } }] };
  assertThrows(() => validateSpec(bad), Error, "spec.tabs[0].card.layout");
});

Deno.test("validateSpec: browse rides on searchFetch (a shelf, not a search box)", () => {
  const tab = (extra) => ({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", search: true, searchFetch: true, ...extra, card: { layout: "feed", title: "name", body: "desc" } }] });
  validateSpec(tab({ browse: true }));
  validateSpec(tab({}));
  // browse is meaningless without the fetch it modifies — and searchFetch still needs a search box.
  const err = assertThrows(() => validateSpec({ ...baseList(), tabs: [{ id: "f", type: "list", icon: "i", label: "hi", searchFetch: true, card: { layout: "feed", title: "name", body: "desc" } }] }), Error);
  assert(err.message.includes("searchFetch requires search"), err.message);
});
