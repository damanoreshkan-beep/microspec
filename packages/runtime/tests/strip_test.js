// runtime.css — a horizontal strip's scrollbar is hidden farm-wide and "there is more" is said by the strip's own
// edge fading, driven by its scroll position; the CONTRACT this pins is the one that makes the fade honest:
// no overflow → no fade on either side (the base values), start → right fade, end → left fade.
import { assert, assertMatch } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";

const css = await Deno.readTextFile(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));

Deno.test("strip: .overflow-x-auto hides its scrollbar in both engines", () => {
  assertMatch(css, /\.overflow-x-auto\s*\{[^}]*scrollbar-width:\s*none/);
  assertMatch(css, /\.overflow-x-auto::-webkit-scrollbar\s*\{\s*display:\s*none/);
});

Deno.test("strip: the edge fade is a scroll-driven mask on two registered numbers, silent without overflow", () => {
  assertMatch(css, /@property --ms-sx-l \{ syntax: "<number>"; inherits: false; initial-value: 0; \}/);
  assertMatch(css, /@property --ms-sx-r \{ syntax: "<number>"; inherits: false; initial-value: 0; \}/);
  const block = css.match(/@supports \(animation-timeline: scroll\(\)\) \{([\s\S]*?)\n\}/);
  assert(block, "the fade must sit behind @supports (animation-timeline: scroll()) — the Safari 16 floor has no timelines");
  const b = block[1];
  assertMatch(b, /--ms-sx-l:\s*0;\s*--ms-sx-r:\s*0;/);                      // no overflow → both edges plain
  assertMatch(b, /animation-timeline:\s*scroll\(self inline\)/);
  assertMatch(b, /mask-image:\s*linear-gradient\(to right, transparent 0, #000 calc\(var\(--ms-sx-l\) \* 1\.75rem\), #000 calc\(100% - var\(--ms-sx-r\) \* 1\.75rem\), transparent 100%\)/);
  assertMatch(b, /@keyframes ms-strip-edges \{ from \{ --ms-sx-l: 0; --ms-sx-r: 1; \} to \{ --ms-sx-l: 1; --ms-sx-r: 0; \} \}/);
});
