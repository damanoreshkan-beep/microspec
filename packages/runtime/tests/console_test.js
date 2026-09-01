// microspec runtime — console shell unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("console · one device, and the aperture is never rationed", async () => {
  /* The catalogue of nine shells is gone, and this is the check that keeps it gone. It cost both
     games a settings tab and, far worse, it cost them their screen: a table of silhouettes has to
     DIFFER somewhere, so every row wrote an aperture as a fraction of the body (0.42 · 0.55 · 0.61
     …), and 55% of a 24rem shell is a 155px game on a 390px phone. Nothing could see it — it does
     not overflow, it does not fail a11y, and it photographs as a console.

     So two claims, both about the shape of the code rather than about a number in it: the console
     publishes no catalogue, and the CSS hands the aperture the whole body. */
  const src = await Deno.readTextFile(P("packages/runtime/console.js"));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const gone of ["SHELLS", "ShellPicker", "ShellTab", "persistentAtom", "shellVars", "./shells.js"])
    assert(!code.includes(gone), `console.js is growing a shell catalogue again ("${gone}") — there is one device`);
  /* A shell may not know anything about a particular GAME either: that would be a shell that fits
     one. Scanned WITHOUT comments, and that is not fastidiousness — the first version of this
     check failed on the doc comment that EXPLAINS the rule, by naming "crouch" as an example of
     what a shell must not know. preflight learned the same thing about its shadow ban: a gate that
     punishes documentation teaches people to delete the documentation. */
  for (const forbidden of ["brick.wasm", "hunt.wasm", "SCRW", "ammo", "spear", "crouch"])
    assert(!code.includes(forbidden), `console.js references "${forbidden}" in CODE — the shell must be game-agnostic`);

  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const screen = /\.ms-screen\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert(/width:\s*100%/.test(screen), ".ms-screen no longer takes the whole body width");
  assert(!/--sh-screen-w/.test(css),
    "an aperture FRACTION is back in theme.css — that variable is the small-screen bug, and it is the shape of the bug rather than its value that must not return");
  const shell = /\.ms-shell\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  /* CAPPED, not stretched — and the distinction is the whole lesson, so the assertion has to be
     able to tell them apart. `height: 100%` was the first repair and the deployed screenshot
     killed it: the aperture is bound by WIDTH, so a full-height body buys the game nothing and
     only moves the emptiness inside the device as a dead band of plastic. Note that a naive
     /height:\s*100%/ matches `max-height: 100%` as a substring and would have passed either way,
     which is a check that cannot see the thing it is about. */
  assert(/max-height:\s*100%/.test(shell),
    ".ms-shell is not capped at the view — a console taller than the viewport is a fit screen that scrolls");
  assert(!/(^|[^-])height:\s*100%/.test(shell),
    ".ms-shell is stretching to the view again — the canvas is width-bound, so that buys the game nothing and puts a dead band of plastic between the screen and the deck (the deployed shot, not the gate, is what caught this)");
});
