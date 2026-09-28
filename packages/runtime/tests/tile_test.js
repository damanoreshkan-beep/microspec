import { assert, assertEquals } from "jsr:@std/assert@1";
import { hexRgb, iconTint } from "../colour.js";

Deno.test("hexRgb: parses #rrggbb, #rgb shorthand, tolerates junk", () => {
  assertEquals(hexRgb("#ECECEE"), [236, 236, 238]);
  assertEquals(hexRgb("#fff"), [255, 255, 255]);
  assertEquals(hexRgb("E9458B"), [233, 69, 139]);
  assertEquals(hexRgb("#zzz"), [0, 0, 0]);
});

Deno.test("iconTint: dark theme keeps the brand tile + vibrant glyph", () => {
  const it = iconTint("#0C1014", "#E9458B", true);
  assert(it.tile.includes("#0C1014"), "dark tile built on the brand bg");
  assertEquals(it.glyph, "#E9458B", "dark glyph is the raw accent");
});

Deno.test("iconTint: light theme → pastel accent tile, no black square", () => {
  const it = iconTint("#0C1014", "#E9458B", false);
  assert(it.tile.includes("#fff") && it.tile.includes("#E9458B"), "light tile is the accent mixed into white");
  assert(!it.tile.includes("#0C1014"), "the raw near-black bg is NOT the light tile");
  assert(it.glyph.includes("#E9458B"), "light glyph carries the accent");
});

Deno.test("iconTint: inky/neutral accent falls back to the brand bg (stays legible on light)", () => {
  const it = iconTint("#0A0A0F", "#ECECEE", false);
  assert(it.tile.includes("#0A0A0F"), "light tile colours from the brand bg, not the near-white accent");
  assert(!it.glyph.includes("#ECECEE"), "glyph is not the invisible near-white accent");
  assert(iconTint("#231708", "#FFD21E", false).tile.includes("#FFD21E"), "saturated yellow stays the hue source");
});
