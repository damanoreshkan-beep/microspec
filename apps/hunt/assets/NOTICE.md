# apps/hunt — provenance

## `hunt.wasm` — the engine · MIT, ours

Forked from [`tools/wasm/brick`](../../../tools/wasm/brick/README.md) and extended into a ranged
game: thrown spears with swept collision, a finite quiver, hearts instead of a single life, and
pickups for both. Recipe and measurements: [`tools/wasm/hunt`](../../../tools/wasm/hunt/README.md).

No third-party code. No ROM. No ripped asset.

## `../art.js` — the characters · CC0 1.0, LuizMelo

Derived from two character packs by **[LuizMelo](https://luizmelo.itch.io)**, both released under
**Creative Commons Zero v1.0 Universal** (stated in itch's own licence field, not only in the
description):

| Pack | Used as | Animations |
|---|---|---|
| [Huntress](https://luizmelo.itch.io/huntress) | the player | idle 8 · run 8 · jump 2 · fall 2 · attack 5 · hit 3 · death 8 |
| [Martial Hero](https://luizmelo.itch.io/martial-hero) | the swordsman | idle 10 · run 8 · jump · fall · attack · hit · death |

CC0 asks for nothing, so this is a record and a courtesy rather than an obligation.

**One correction worth keeping.** The huntress carries a **spear**, not a bow — from a thumbnail the
shaft reads as a drawn bowstring, and it took rendering the attack frames at 5× to settle it. The
game is built around what the art actually shows: a thrown spear. This is exactly the failure mode
that makes an asset pack expensive — an animation named `Attack` promises nothing about what the
character is holding, and the only way to know is to look.

**What we changed.** The pack ships 150×150 frames with a ~32×42 figure in the middle, in full
colour. The importer ([`tools/art/hunt-import.mjs`](../../../tools/art/hunt-import.mjs)):

- trims each animation to the **union** box of its frames — trimming each frame to its own box
  re-centres the character every step and the walk cycle jitters;
- quantises to a **32-colour palette measured from the art itself** (those entries cover 88.4% of
  every opaque pixel; the rest map to their nearest neighbour);
- derives a **RAMP** — for each palette entry, which entry is its highlight and which its shade.
  The ink model in `brick` got this for free as `level ± 1`; a palette cannot, because neighbouring
  entries are not neighbouring shades. Weighted by hue proximity, so a lit edge on skin stays skin
  instead of jumping to the brightest thing in the picture;
- **run-length codes** the indices. One byte per pixel came to 231 KB of base64 against 8.8 KB for
  the whole of `brick` — fine after gzip, but a third of a megabyte of unreadable text in a
  repository people review. Pairs of (value, run) bring it to 45.8 KB, and the round-trip is
  verified identical.

So this app, like `brick`, ships **no image files at all**.

**What we added.** The depth. The source art is flat; the extrusion, the silhouette-derived rim and
the 45° ground-shadow projection are ours, under the same single light as the rest of the farm.

## Rebuilding

```sh
bash tools/wasm/hunt/build.sh                  # → assets/hunt.wasm  (needs emscripten)
deno run -A tools/art/hunt-import.mjs          # → ../art.js
deno run -A tools/art/hunt-import.mjs --check  # fail if the committed art is stale
```

The source sheets are fetched into a git-ignored cache. itch.io serves its downloads through a
browser-only flow, so they come from a mirror that vendors the same CC0 files — which CC0 expressly
permits, and which is the only reason this is reproducible without a browser on this machine.
