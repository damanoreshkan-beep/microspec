# apps/brick — provenance

Two vendored things ship in this app, and they have different origins.

## `brick.wasm` — the game engine · MIT, ours

An original NES-era platformer simulation written for this farm. Source, recipe and the reason it
exists at all: [`tools/wasm/brick/`](../../../tools/wasm/brick/README.md).

It contains **no Nintendo code, no ROM and no ripped asset, and needs none to run.** That was the
constraint that shaped the whole app: `SuperMarioBros-C` requires an unmodified
`Super Mario Bros. (JU) (PRG0) [!].nes` because the graphics live in the cartridge's CHR data (and
it carries no licence at all); `binjnes` is cleanly MIT but is an emulator with no game inside it;
the Infinite Mario and Mari0 ports ship redrawn Nintendo sprites. None of them can be distributed
from a public repository, so the engine is written rather than borrowed.

## `../art.js` — the artwork · CC0 1.0, Kenney

Derived from **[Kenney](https://kenney.nl) — "Pixel Platformer" (1.2)**, released under
[Creative Commons Zero 1.0 Universal](http://creativecommons.org/publicdomain/zero/1.0/):

> This content is free to use in personal, educational and commercial projects.
> Written permission not required, support us by crediting or donating (voluntary).

CC0 asks for nothing, so this notice is a courtesy and a record, not an obligation. Kenney's work
saved this app from programmer-art, and it deserves to be named.

**What we changed.** The pack is colour; this app has none. A passive-matrix LCD has a backplate,
a polariser and segments that are only ever more or less opaque — so
[`tools/art/brick-import.mjs`](../../../tools/art/brick-import.mjs) quantises the chosen tiles and
characters by luminance into **five ink densities**, with the black and white points measured from
the picked art rather than guessed. The result is committed as text (`apps/brick/art.js`), which is
why this app ships **no image files at all**.

**What we added.** All of the depth. The source art is flat; the volume comes from
[`apps/brick/atlas.js`](../atlas.js), computed from each sprite's own silhouette under the farm's
single light source — upper-left at 45°, the same `--nm-dark`/`--nm-light` pair that extrudes the
console around the screen. Blocks are extruded with a drawn highlight and a side wall, figures get
a contour, terrain gets a rim, and everything is banded into a density hierarchy so the character
is always the densest mark on the plate. Nothing in that is inherited from the pack, and none of it
was drawn by hand.

## Rebuilding either

```sh
bash tools/wasm/brick/build.sh                  # → assets/brick.wasm  (needs emscripten)
deno run -A tools/art/brick-import.mjs          # → ../art.js          (fetches the CC0 zip)
deno run -A tools/art/brick-import.mjs --check  # fail if the committed art is stale
```

The importer refuses to run if the pack's own `License.txt` stops saying Creative Commons Zero.
