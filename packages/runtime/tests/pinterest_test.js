// microspec runtime — pinterest unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseInput as pinParse, ladder as pinLadder, readPins as pinRead, ratio as pinRatio } from "../pinterest.js";

Deno.test("pinterest parseInput — four shapes, and only ONE of them needs the network", () => {
  assertEquals(pinParse("https://www.pinterest.com/pin/1096274734320084795/"), { kind: "pin", id: "1096274734320084795" });
  assertEquals(pinParse("pinterest.com/pin/123456789/sent/?invite_code=abc"), { kind: "pin", id: "123456789" });
  assertEquals(pinParse("1096274734320084795"), { kind: "pin", id: "1096274734320084795" });
  // the short link is the one shape a regex cannot answer — its id lives behind a redirect with no CORS
  assertEquals(pinParse("https://pin.it/4TgG4yGpF"), { kind: "short", code: "4TgG4yGpF" });
  assertEquals(pinParse("https://www.pinterest.com/Federico_biilancor/clean-ux-design/"),
    { kind: "board", user: "Federico_biilancor", slug: "clean-ux-design" });
  // Pinterest's own section pages are not boards — treating them as one produces a confident 404
  assertEquals(pinParse("https://www.pinterest.com/search/pins/?q=ui").kind, "unknown");
  assertEquals(pinParse("https://www.pinterest.com/ideas/design/12345/").kind, "unknown");
  assertEquals(pinParse("").kind, "empty");
  assertEquals(pinParse("https://example.com/x").kind, "unknown");
});

Deno.test("pinterest ladder — /originals first, .png before giving up, 564x always last", () => {
  const l = pinLadder("https://i.pinimg.com/564x/2c/2d/a6/2c2da69b3a54335fa22daf40833a7f96.jpg");
  assert(l[0].includes("/originals/"), "the full-resolution rung must come first");
  // the .jpg→.png rewrite: /originals/ keeps the ORIGINAL extension, and assuming .jpg is the single most
  // common reason a "direct link" 404s on an image that does exist
  assert(l.some((u) => u.endsWith(".png")), "no .png rung — a graphic saved as PNG would 404 as .jpg");
  assert(l[l.length - 1].includes("/564x/"), "564x is the floor: it is the size the API itself handed us");
  assertEquals(new Set(l).size, l.length, "duplicate rungs waste a decode each");
  // a non-pinimg URL is returned as-is rather than mangled
  assertEquals(pinLadder("https://example.com/a.jpg"), ["https://example.com/a.jpg"]);
  assertEquals(pinLadder(""), []);
});

Deno.test("pinterest readPins — one reader for a board and for a single pin", () => {
  const raw = { id: "1", description: " a note ", dominant_color: "#e2dfd8", images: { "564x": { url: "u", width: 564, height: 1010 } },
    board: { name: "Clean UX", url: "/u/b/" }, pinner: { full_name: "Nexora" } };
  const [p] = pinRead({ data: [raw] });
  assertEquals(p.id, "1");
  assertEquals(p.text, "a note");
  assertEquals(p.color, "#e2dfd8");
  assertEquals(p.page, "https://www.pinterest.com/pin/1/");
  assertEquals(pinRead({ data: raw })[0].id, "1", "a single-object payload reads the same way");
  assertEquals(pinRead({}), []);
  assertEquals(pinRead({ data: [{ nope: 1 }] }), [], "a pin without an id is not a pin");
  // the tile reserves its aspect ratio before the image decodes, clamped so one infographic cannot own the column
  assert(Math.abs(pinRatio(p) - 1010 / 564) < 1e-9);
  assertEquals(pinRatio({ w: 1, h: 99 }), 2.2);
  assertEquals(pinRatio({ w: 99, h: 1 }), 0.5);
  assertEquals(pinRatio(null), 1);
});
