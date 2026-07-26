# The player widget — one configurable transport for the whole farm, down to a split-screen window

Research note for: *"the tracks must auto-advance, there must be a repeat/next control, and it has to be ONE
systemic configurable player widget — look at rave and other music players. And it must survive the small
window I get when I run two apps at once on an S25 Ultra: the visualiser small on the left, the player beside
it, functions becoming icons rather than disappearing, the dock included."*

Scope: `packages/runtime/player.js` (the pure queue logic) + `packages/runtime/ui.js` `Transport` (the widget)
+ every app in the farm that plays sound.

## 1. What the farm already had, and what it actually lacked

`Transport` + `advance()` landed in an earlier cycle and already solve the two things a hand-written player
gets wrong: **auto-advance obeying the repeat mode** (`ended` → `advance(..., {manual:false})`), and the
**manual/automatic distinction** (repeat-one replays on end but must never trap a listener who pressed skip).
`v2m` consumes both. So the ask is mostly an **adoption** problem, not a design problem — measured:

| App | Play control before this cycle |
|---|---|
| `v2m` | `Transport` (full: seek, repeat, prev/next, save in `trail`) |
| `rave` | `Transport` on the player tab; a **hand-rolled island row** on the pads tab |
| `handpan` | hand-rolled, **twice** (pads tab + loop tab) + a per-row play button |
| `fmradio` | hand-rolled row (seek down · play · seek up · settings · power) |
| `ambient` `drift` `synesth` `kalimba` `breathe` `sopilka` | a bare `btn-circle` play toggle each |

Nine apps, six vocabularies, one idea. Every one of them is a place where a fix to the scrub interaction, the
a11y labels or the compact ladder has to be made again — which is the exact failure mode the Sheet/Segmented
rule exists to stop.

Two genuine gaps in the widget itself:

- **no shuffle control** — `advance()` has taken `shuffle` since day one and it is unit-tested, but nothing
  can turn it on. The logic shipped without its switch.
- **no vocabulary for an app's own controls beyond a single `extra` slot.** rave's pads row carries four
  (generate · clear · save · settings), handpan five. One slot cannot hold them, which is precisely why those
  two apps kept their hand-rolled rows — the kit did not offer a way to be a full player.

## 2. The canonical control set (what a "proper" player is)

Androidʼs Media3 Compose (`media3-ui-compose-material3`) is the closest thing to a normative list, and it is
worth matching because it is what a phone user's muscle memory already holds:

> `PlayPauseButton` · `PreviousButton` · `NextButton` · `SeekBackButton` · `SeekForwardButton` ·
> `ShuffleButton` · `RepeatButton` · `MuteButton` · `ProgressSlider` · `PositionAndDurationText`

Mapped onto this farm: play/pause · prev · next · seek bar · position/duration · repeat are **present**;
**shuffle is the missing one**; and two are deliberately declined:

- **mute/volume — no.** On a phone the volume rocker is the system's, always available, and a per-app volume
  slider is a control the OS already owns. It costs a row and buys a duplicate. (An app that genuinely needs a
  *mix* level — `ambient`'s per-layer faders — has `Slider`, which is a different thing.)
- **seek ±10 s — only where the medium has it.** It belongs to spoken/long-form audio; a 90-second tracker
  tune has a scrub bar and no use for a 10-second jump. Left out of the default row, available as an `action`
  to any app that wants it.

Notably Media3 documents **no** compact/expanded split and **no** priority order — the compose components are
individually placed by the app. So the compaction ladder below is ours to define; there is no standard to
inherit, only the mini-player convention (artwork · title · play/pause · next) that every phone player uses
as its floor.

## 3. The real constraint: what a split-screen window leaves

The owner's device is a 6.9" S25 Ultra (`384×832` CSS px at DPR 3.5). Two apps at once → each gets roughly
**412×430**, and the floating-window case goes to **360×340** — both already in the gate's matrix as
`split` / `split-sm`. After `--hdr-h` (3.5rem) and `--dock-h` (~4.25rem, less once compacted) that leaves
**~200–260px of actual view height**.

Android's own window size classes put the boundary at **compact height < 480dp** ("two-pane layouts are not
practical"; landscape phones are 99.78% compact-height). Our thresholds bracket it deliberately:

| Threshold | What changes | Why that number |
|---|---|---|
| ≤780 / ≤670 / ≤560px | the `--ms-*` density steps | ordinary phones, landscape |
| **≤520px** (+ ≥340 wide) | **`.ms-side`** — stage moves BESIDE the controls | just under Android's 480dp compact-height line, in CSS px |
| **≤440px** | fourth density step; **dock drops labels, keeps 36px targets** | the split/`split-sm` band itself |

Android says two panes are impractical at compact height — but that guidance is about two *content* panes. A
**stage + its transport** is the opposite case: stacking them is what fails (a visualiser and a transport
cannot share 200px vertically), and putting them side by side is what every landscape video player on the
platform already does. `.ms-side` is that move, and it is why the answer is *not* "hide the visualiser".

## 4. The recipe — the compaction ladder

The rule the whole thing hangs on: **compact by DEMOTION, never by deletion.** A control that no longer fits
becomes an icon; an icon that no longer fits moves into a sheet with its label; nothing ever disappears.

Ladder, in order of what is sacrificed as the widget's **container** narrows or the viewport shortens:

1. **full** — title + subtitle, scrub bar with both timestamps, `repeat · prev · PLAY · next · shuffle`,
   the app's actions as labelled-by-aria icon buttons on one row.
2. **≤ 340px of container** — gaps collapse (`gap-4` → `gap-1.5`), the side buttons drop to `btn-sm`, the
   subtitle keeps one line and truncates.
3. **≤ 300px of container** — the play button steps to 44px→40px (never below the 36px floor, WCAG 2.2 target
   size is 24px and the farm's floor is deliberately higher), the action row **wraps** to a second line rather
   than overflowing. Wrapping costs height only where `.ms-side` has already bought height back by going wide.
4. **more actions than the row can hold** — the overflow becomes one `lucide:ellipsis` button opening a
   `Sheet` whose rows carry the **words**, which is strictly more legible than the icons were.

**Container queries, never viewport ones.** The widget lives in a 38%-wide column under `.ms-side` and in a
200px `#view` under the watch gate, on a viewport that is 384px wide in both cases. A `min-[380px]:` rule
matches the window and is blind to both — this shipped 4px of overflow twice already. `Transport` is
`@container`, and every step above is `@max-[Npx]:`.

**Vertical arithmetic for the split band** (measured, at `--ms-ctl: 2.25rem` = 36px):

```
head (title+subtitle)   ~34px
scrub + timestamps      ~30px
button row              ~40px
gaps (3 × --ms-gap 0.3) ~14px
                        ─────
transport total         ~118px      → fits the ~200px view, leaving the stage its 38% column
```

That is the whole reason the stage goes to a *column* rather than shrinking: 118px of transport plus any
usable stage height does not fit in 200px stacked, and does fit side by side.

## 5. Making it stick — the gate, not the intention

Three enforcement points, because "use the kit" as a written rule is what produced six vocabularies:

- **preflight** — an app view that renders a play/pause control (`lucide:play` + `lucide:pause`/`lucide:square`
  on a button) without importing `Transport` from `/_rt/ui.js` **fails**. Same shape as the existing
  `modal-bottom` ban: the check is on the source, it is cheap, and it names the replacement.
- **unit** — the ladder's invariants are class strings, so they are testable browser-free: the play button
  never drops below 36px at any step; every optional control renders iff its handler is passed; the overflow
  sheet contains **every** action that the row dropped.
- **the eye** — `shoot.mjs <app> --bp split` and `--bp split-sm`, in **both themes**, is now part of the taste
  pass rather than an optional extra. A green responsive matrix proves nothing overflows; it cannot see that
  the transport is a squashed mess, and the matrix has been green through every defect in `GATE_BLINDSPOTS.md`.

## 6. Bottom line

1. The queue logic was already right and already shared; the widget was missing its **shuffle** switch and any
   way to carry an app's **own** controls — which is why the two richest music apps never adopted it.
2. The split-screen answer is `.ms-side` + the ≤440px density step + demotion-not-deletion, and it is systemic:
   an app that reaches for its own height media query is doing it wrong.
3. Adoption is the deliverable. Nine apps, one widget, and a preflight rule so the tenth cannot regress.

Sources: [Media3 Material3 Compose components](https://developer.android.com/media/media3/ui/compose-material3) ·
[Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes) ·
[Support multi-window mode](https://developer.android.com/develop/adaptive-apps/guides/support-multi-window-mode)
