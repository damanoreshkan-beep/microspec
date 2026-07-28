# tools/wasm/hunt — the ranged engine

`apps/hunt/assets/hunt.wasm` is a **vendored binary**, built once offline and committed like a
codec. Same recipe and same flags as [`tools/wasm/brick`](../brick/README.md) — read that first;
this file is only the delta.

```sh
bash tools/wasm/hunt/build.sh      # → apps/hunt/assets/hunt.wasm
```

## Forked, not rewritten

It starts from `tools/wasm/brick/game.c` and therefore keeps every fix already paid for there: the
ground probe one pixel **below** the box, the spawn floor read from the **spawn column** rather than
the generator's cursor, difficulty derived from the **track** rather than the player, and floor
division for tile arithmetic. Those were three separate bugs and a day of measurement; a clean
rewrite would have re-bought them.

## What is different

**Geometry, measured from the art.** The huntress is **32×42 px** (measured off the sheet, not
guessed), so the tile is **24 px** and she stands 1.75 tiles tall — the usual platformer
proportion. The screen is **384×264** (16×11 tiles), which lands 1:1 on a 384px phone: no
fractional scale, no shimmer. Physics is brick's, scaled ×1.333, and the measurements confirm the
scaling was right — the jump clears **4.00 tiles standing, 5.38 walking, 8.75 running**, the same
figures in tiles as brick.

**A ranged game.** `K_SPEAR` is a projectile entity with its own lifetime and a shallow arc, and
`throw_spear()` gives it a third of the thrower's speed — a spear thrown at a sprint that travels
like one thrown standing still reads as if the world were on rails. Throwing interrupts nothing:
you can throw while running, rising or falling, which is exactly why the weapon is drawn as an
**overlay** rather than as its own body pose (the display-list `attr` has 3 bits of frame, and the
locomotion poses already spend six of the eight).

**Swept collision.** `spear_hits()` walks the segment the spear travelled this frame rather than
testing overlap where it landed. A projectile misses a target when its per-frame step exceeds the
target's width plus its own; at 6 px/frame against a 20 px enemy that cannot happen today, but a
projectile that silently passes through a target is invisible to every gate and to the eye, so the
sweep is the belt to the braces rather than a bet on the current constants.

**Hearts, not one life.** `hurt()` costs a heart, grants **70 frames of mercy** and shoves the
player away from whatever hit them. Without the invulnerability window a player standing inside an
enemy loses three hearts in three frames and never learns what hit them. Falling out of the world
is still instant — a pit is a pit.

**Supply.** `SEG_SUPPLY` scatters spears and hearts (hearts deliberately rarer), because an endless
run with a finite quiver is only fair if the track keeps handing you more. Measured over 3 000
generated columns: **40 spears, 10 hearts**. A heart picked up at full health is worth points
rather than nothing — a pickup the game ignores feels like a bug.

**A third enemy.** `K_HERO` is a swordsman: faster, cannot be stomped, and takes two spears (his
`timer` field doubles as health — nothing else reads it for an enemy).

## Measured

```
size        12 952 B raw · 0 imports
step cost   0.28 µs/frame  (60 000 steps, V8/Deno on aarch64)
jump        4.00 tiles standing · 5.38 walking · 8.75 running · rise 4.17
track       over 3 000 columns: 40 spear pickups, 10 hearts, MAX_GAP 3 against a 4.00 reach
```

## Two bugs the fork introduced, both the same shape

Worth writing down because they are the cost of forking, and both were caught by a machine rather
than by reading:

1. **`st[16]` against 17 state indices.** Adding ammo, hp, invuln and kills pushed the state block
   past the array it lives in — an out-of-bounds write, caught only by `-Wall`. The array is sized
   from the enum now (`st[S_COUNT]`), so the next field cannot repeat it.
2. **`ground_row = 12` in an 11-row map.** A literal survived the drop from brick's 15 rows, so
   every ground tile was written out of range and silently dropped: the player spawned into an
   empty world and fell. It derives from `GROUND_MAX` now.

Both are the farm's oldest lesson in a new costume — *a number that describes a thing must be
derived from that thing*, or it is right until the thing moves.

## License

`game.c` is MIT, © the microspec authors. The art is separate and CC0 — see
`apps/hunt/assets/NOTICE.md`.
