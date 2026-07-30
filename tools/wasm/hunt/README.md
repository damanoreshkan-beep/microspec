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

## Feel: four defects that no gate could see

Every one of these renders perfectly, passes preflight and axe, and is felt within ten seconds of
play. They were found by driving the shipped binary in Deno and counting, which is also the only
way to know they are fixed.

**The jump was a level, not an edge, and had no grace at all.** `(in & IN_JUMP) && p->onground`
was tested only on frames where the player was already grounded, so a jump pressed **0, 1, 2, 3, 5
or 8 frames after walking off a ledge was refused in every case** — zero frames of coyote time,
measured across six seeds. Worse, reading the held bit made holding the button an auto-hop: 600
frames of held jump produced **11 `SFX_JUMP` events**, so you could never hold for height and then
land quietly. Now: a `COYOTE` counter reset while grounded, a `JUMP_BUF` counter set on the press
edge, both six frames, both spent when the jump fires. Measured after: a single press is granted on
the frame she leaves the ground and on each of the **five** frames after it, refused on the sixth,
and 600 held frames produce **exactly one** jump. The two-gravity variable height is untouched and
proven so — tap 29 px, hold 100 px, **3.45×**, identical before and after.

**Enemies stood in the landing zone, and the comment said they did not.** `seg_pick()` zeroed
`safe_left` at the *start* of the flat run it had just authored, so the enemy roll's
`safe_left == 0` test was true for every column of the landing room after a gap. Measured over 25
seeds: **30.8%** of enemies stood within five columns of the far side of a hole (19.2% inside the
first 300 columns, which is the part a player actually reaches) — you commit to an arc you cannot
alter and land on an enemy. `safe_left` is now spent one column at a time in `gen_one`, *after* the
roll and never across the gap itself: **0.0%**, over 7 485 enemies.

**The hopper was a walker.** Both got `-WALKER_V`, and the hop fired on `(frame_no & 63) < 2` — a
**global** counter, so every hopper alive left the ground on the same two frames of every 64. Two
hoppers placed side by side hopped on frames 33, 97, 161, 225 — *the same list*. The phase is now
`e->timer`, seeded per entity by the generator (measured: 40 distinct phases over 1 468 hoppers),
and the two hoppers hop at 6/63/120/177 and 32/89/146/203 — same 57-frame cadence, 26 frames apart.
They are also no longer the same animal: `HOPPER_V` is 3/5 of a walker's ground speed against a
measured 26 px hop, so a hopper is something you can outrun but not ignore, and it arrives at head
height.

**Four fifths of the difficulty ramp was unreachable.** `difficulty()` saturated at column 1200; a
bot that jumps holes and spears what is in front of it reached a mean of **275** columns and a best
of **544** over 12 seeds, so no run ever saw past 45% of the curve, and the reachable part moved
gap chance by eight points across a whole run. It saturates at **300** now. The same bot: mean
**254**, best **330**, 4 of 12 runs saturating it. That costs 8% of run length and buys the whole
authored curve — including everything else keyed off `d`, which was stranded with it: the swordsman
now appears around column 70 and the hopper around 118 rather than at 282 and 469, and `pending_gap`
reaches its 3-tile clamp inside a real run instead of never. The later half of a run is a different
track, not the same track with a bigger percentage.

## Measured

```
size        13 755 B raw · 0 imports
step cost   0.36 µs/frame  (60 000 steps, V8/Deno on aarch64)
jump        4.00 tiles standing · 5.38 walking · 8.75 running · rise 4.17 — unchanged by the feel work
grace       6 frames of coyote · 6 frames of buffer · 1 jump per press, however long it is held
track       over 3 000 columns: 43 spear pickups, 9 hearts, MAX_GAP 3 against a 4.00 reach
generator   80 000 columns: 4 326 gaps, widest 3, 0 of them without a 3-column runway
enemies     100 000 columns: 7 485 spawned, 0 of them inside a post-gap landing zone
```

All of it is reproducible against the shipped binary from Deno alone, with no browser. The entity
array is not exported and must not be — but it is findable without changing the ABI: scan linear
memory for entity 0's fixed-point x/y, accept the candidate only if it tracks `S_PX + S_CAMX` for
120 frames, and the enemy census above falls out of it. That is worth writing down because the
alternative — adding a debug export to measure a bug — puts the measurement inside the thing being
measured.

Every constant in the physics block used to be annotated with the **16 px-tile ancestor's** number:
`FP` is 8, so `MAX_WALK 600` is 2.344 px/f and was labelled 1.5625. The comments are the true
figures now, with the tile-relative value beside them — that second number is the one that is
genuinely shared with brick, and it is why the reach in tiles came out within 2% of brick's.

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
