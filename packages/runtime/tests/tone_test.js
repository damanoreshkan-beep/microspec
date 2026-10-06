import { assert, assertEquals } from "jsr:@std/assert@1";
import { SYS } from "../i18n.js";
import { pkgRoot } from "../pkgroot.js";

const css = await Deno.readTextFile(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));

Deno.test("tone: the three tones are drawn as overlays that never take the finger, with the owner's shader tints", () => {
  for (const [id, tint, vig] of [["noir", "#FFFFFF", "0"], ["green", "#8CFF26", ".6"], ["amber", "#FF5900", ".2"]]) {
    const m = css.match(new RegExp(`:root\\[data-tone="${id}"\\]\\s*\\{([^}]*)\\}`));
    assert(m, `no rule for ${id}`);
    assert(m[1].includes(`--tone-tint: ${tint}`) && m[1].includes(`--tone-vig: ${vig}`), `${id}: ${m[1].trim()}`);
  }
  const after = css.match(/:root\[data-tone\]::after\s*\{([^}]*)\}/)[1];
  assert(/position: fixed/.test(after) && /pointer-events: none/.test(after) && /backdrop-filter: grayscale\(1\)/.test(after) && /mix-blend-mode: multiply/.test(after));
  assert(!/^\s*html\s*\{[^}]*filter/m.test(css), "a filter on <html> would re-parent every fixed element");
});

Deno.test("tone: every circle has its word in both locales", () => {
  for (const k of ["tone", "toneNormal", "toneNoir", "toneGreen", "toneAmber"]) { assert(SYS[k]?.en && SYS[k]?.uk, k); }
  assertEquals(SYS.toneAmber.uk, "Жовтий");
});
