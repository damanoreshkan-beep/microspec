# tools/wasm/brick — the platformer engine

`apps/brick/assets/brick.wasm` is a **vendored binary**: an original NES-era side-scrolling
platformer, compiled to WebAssembly. The farm has no build step, so it is built once, offline,
and committed like a vendored codec.

Unlike `tools/wasm/v2m` there is nothing to fetch — **every line of `game.c` is ours (MIT)**.
That is the point: no existing "Mario" engine can ship from a public repo. `SuperMarioBros-C`
requires an unmodified `Super Mario Bros. (JU) (PRG0) [!].nes` because the graphics live in the
ROM's CHR data (and carries `License: TODO`); `binjnes` is cleanly MIT but is an emulator with no
game in it; the Infinite Mario and Mari0 ports ship redrawn Nintendo sprites. See
`apps/brick/RESEARCH.md` §0.

## Rebuild

```sh
pacman -S emscripten             # once — Arch, native aarch64 (NOT emsdk, which is x86_64-only)
bash tools/wasm/brick/build.sh   # → apps/brick/assets/brick.wasm
```

`emcc` is installed here but **not on `PATH`**; `build.sh` sources `/etc/profile.d/emscripten.sh`
itself, exactly like the v2m recipe.

## What it is

A **zero-import reactor**. No libc I/O, no clock, no `Math.random`, no `malloc` — the host hands
in one frame's input, the engine hands back a display list and a state block, and both live in
exported linear memory. `engine.js` instantiates it with `WebAssembly.instantiate(bytes, {})` and
nothing else.

| Export | Does |
|---|---|
| `game_init(seed)` · `game_step(inputMask)` | one step is exactly 1/60 s — see below |
| `game_dl()` · `game_dl_count()` | `int16[n*4]`: `id, x, y, attr`. `id < 0x100` tile, `≥ 0x100` sprite |
| `game_state()` | `int32[13]`: frame, score, coins, dist, camx, px, py, pstate, pdir, dead, sfx, dln, ground |
| `game_tile(c,r)` · `game_gen_col()` · `game_gen_ahead(n)` | terrain inspection — **for `runtime_test.js` only**, nothing in the app reads them |

**`game_step` takes no `dt`.** A variable timestep makes the jump arc depend on the display's
refresh rate; the accumulator lives in `apps/brick/engine.js` and this is called a whole number
of times per frame.

**The engine never makes a sound and never draws.** It reports what happened this frame in the
`sfx` bitmask and what is on screen in the display list. The light, the bevels, the contact
shadows and the LCD are `apps/brick/render.js`'s business.

## Why the flags

| Flag | Buys |
|---|---|
| `--no-entry` | reactor module (a library, not a program) |
| `-sFILESYSTEM=0` `-sMALLOC=emmalloc` | nothing left to import — the engine never allocates anyway |
| `-sALLOW_MEMORY_GROWTH=0` | the exported memory is fixed, so JS heap views never invalidate |
| `-sINITIAL_MEMORY=1MB` | measured: map + entities + display list + stack fit inside it |

Deliberately **not** here, though v2m has them: `--profiling-funcs` (we set `export_name`
explicitly, so the names are already readable), `-sSTANDALONE_WASM` (measured: byte-identical
output, zero imports either way), `_malloc`/`_free` exports (JS never writes into the heap),
`-sINITIAL_MEMORY=32MB`, and everything C++-specific (`-std=c++17`, `___wasm_call_ctors`,
`-include compat.h`). Plain C with no static constructors needs no `_initialize()` call.

## Measured, not asserted

Against the exact binary this directory produces:

```
size            10 079 B raw · 3 673 B gzip
imports         0            (build.sh fails the build otherwise)
step cost       0.59 µs/frame  (60 000 steps in 35.3 ms, V8/Deno on aarch64)
display list    72 entries = 576 B on a populated frame  (vs 245 760 B for an RGBA framebuffer)
jump rise       67 px = 4.19 tiles, 54 frames airtime
jump reach      4.00 tiles standing · 5.38 walking · 8.81 running (2 tiles of run-up saturates it)
```

The jump numbers are why `MAX_GAP` is **3**: crossing N empty columns costs N+1 tiles of travel,
so a 3-wide gap needs 4.00 tiles and even a *walking* player has 5.38. Every gap is preceded by a
`GAP_RUNWAY` of flat ground so the standing-jump case can never arise, and followed by five flat
columns of landing room.

`packages/runtime/runtime_test.js` re-measures all of it against the shipped binary and walks
80 000 generated columns asserting no gap ever exceeds the measured reach — an endless generator
that can author an unjumpable gap is an unwinnable game, and **no rendering gate can see it**.

## Three bugs this engine had, all the same bug

Recorded because they cost the whole first build, and each was a number *asserted* where it should
have been *measured*:

1. **Ground contact probed the box's own bottom pixel.** Resting puts that pixel on the last free
   row, so the check is true on the landing frame and false forever after: the player stands on the
   floor permanently airborne and the jump key does nothing. Probe one pixel **below** the box.
2. **Spawn used the generator's `ground_row`.** That variable holds the height of the last column
   generated — twenty columns ahead — so the player spawned buried in the floor and the X resolver
   shoved it backwards a tile per frame. Probe the spawn column's actual floor.
3. **Difficulty read the player's progress.** The generator scan never moves a player, so it only
   ever measured the gentlest possible track and reported gaps of 2 where the game ships 3.
   Difficulty belongs to the **track** (`gen_col`), which also makes a seed reproducible.

## License

All of `game.c` is MIT, © the microspec authors. It contains no Nintendo code, no ROM, and no
ripped asset, and it needs none to run.
