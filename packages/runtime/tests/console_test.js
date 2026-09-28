import { assert } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("console · one device, and the aperture is never rationed", async () => {
  const src = await Deno.readTextFile(P("packages/runtime/console.js"));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const gone of ["SHELLS", "ShellPicker", "ShellTab", "persistentAtom", "shellVars", "./shells.js"])
    assert(!code.includes(gone), `console.js is growing a shell catalogue again ("${gone}") — there is one device`);
  for (const forbidden of ["brick.wasm", "hunt.wasm", "SCRW", "ammo", "spear", "crouch"])
    assert(!code.includes(forbidden), `console.js references "${forbidden}" in CODE — the shell must be game-agnostic`);

  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const screen = /\.ms-screen\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert(/width:\s*100%/.test(screen), ".ms-screen no longer takes the whole body width");
  assert(!/--sh-screen-w/.test(css),
    "an aperture FRACTION is back in theme.css — that variable is the small-screen bug, and it is the shape of the bug rather than its value that must not return");
  const shell = /\.ms-shell\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert(/max-height:\s*100%/.test(shell),
    ".ms-shell is not capped at the view — a console taller than the viewport is a fit screen that scrolls");
  assert(!/(^|[^-])height:\s*100%/.test(shell),
    ".ms-shell is stretching to the view again — the canvas is width-bound, so that buys the game nothing and puts a dead band of plastic between the screen and the deck (the deployed shot, not the gate, is what caught this)");
});
