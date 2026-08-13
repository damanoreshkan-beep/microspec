# The compass jumps when you lift the phone

Owner report, 2026-08-13: the heading "leaps from 20° to −300°". The same words as the swarm report of
2026-08-11, and the same cause — but swarm was fixed by giving ONE app an opt-in, and every other dial in
the farm was left reading the number that had already been proven wrong.

## What was actually wrong

`compass.start` handed consumers `(360 − α) % 360`. α is the first of three Tait-Bryan angles (Z-X'-Y''),
and it stops being a heading long before the phone is vertical:

* **Gimbal lock.** At β = 90° the Z axis (α) and the Y'' axis (γ) coincide. One physical orientation then
  has infinitely many valid `(α, β, γ)` descriptions, and the platform is free to hand back a different
  one on the next event — α hundreds of degrees away, γ absorbing the difference. Nothing moved; the
  reading moved 40°, or 300°.
* **Conditioning, before that.** Converting the rotation vector to Euler amplifies noise in α by ~1/cos β.
  At 75° of pitch that is already 4×. The band where the reading is merely getting bad is much wider than
  the band where it breaks.
* **No smoothing can fix either.** The value arriving is not noisy — it is a *different valid description*
  of the same direction. An EMA drags the needle through the whole spurious arc.

W3C `orientation-event` acknowledges gimbal lock as a disadvantage of Tait-Bryan angles and offers no
normative guidance whatsoever. The fix has to come from the matrix.

## The recipe

The spec's own rotation matrix (verified against the primary source, term for term):

    R = Rz(α)·Rx(β)·Ry(γ)

Take the columns, which are where the device axes end up in the world (x = east, y = north, z = up):

| device axis | world vector | means |
|---|---|---|
| **+y** — top edge of the screen | `(−sinα·cosβ, cosα·cosβ, sinβ)` | what a dial/rose/needle calls "ahead" |
| **−z** — out of the back, the rear camera | `(−cosα·sinγ − sinα·sinβ·cosγ, −sinα·sinγ + cosα·sinβ·cosγ, −cosβ·cosγ)` | what a viewfinder aims at |

Heading is `atan2(east, north)`. Three consequences, all of them load-bearing:

1. **The screen-top heading reduces to (360 − α) when the phone is flat**, so this is not a new convention —
   it is the old one, computed a way that also knows when it is invalid.
2. **The horizontal length is the confidence.** For the screen-top axis it is exactly `|cos β|`, and the old
   formula threw it away. Below ~0.15 (9° of vertical) there is no heading to report.
3. **The two axes cannot fail together:** `|h_y|² + |h_z|² = 1 + sin²γ·cos²β ≥ 1`, so one of them always
   keeps a horizontal projection of at least 0.707. A hand-held heading is therefore ALWAYS defined.

So `heldHeadingDeg` uses the screen-top axis while the phone is flat, crossfades to the camera axis as it
comes upright (smoothstep over `|cos β|` from 0.5 ≈ 60° of pitch to 0.15 ≈ 81°), and never returns null.
The two axes are the same real-world direction — "away from the person holding it" — so lifting the phone
is a handoff, not a change of meaning. The crossfade is also where α's 1/cos β noise lives, so weight has
already left the bad term by the time it goes bad.

Only the screen-top term takes the screen-orientation correction. The camera does not turn when the UI does
— that is why `look` mode skips it, and the same reasoning applies inside the blend.

## What "it doesn't jump" is tested as

A fixed per-step threshold is not a continuity test. Rolled 60°, the camera axis genuinely aims 60° away
from the screen's top edge, so the handoff has that much ground to cover and covering it *smoothly* is all
anyone can ask. What separates a slew from a jump is that a slew shrinks with the sample step: quartering
the pitch step quarters the movement. A discontinuity does not care how finely it is sampled — which is
precisely how α behaved at β ≈ 90. `sensors_test.js` sweeps β at 1° and at 0.25° and asserts the ratio.

## Deliberately not touched

* **iOS `webkitCompassHeading`** — a heading, not Euler angles, and its upright behaviour cannot be checked
  from this device. Left exactly as it was rather than "fixed" against hardware nobody has run it on.
* **Null β/γ** (some low-end Android) — nothing to project from; falls back to raw α, i.e. the old path.
* **`look: true`** (swarm) — a viewfinder wants the camera axis at every pitch, never the screen's top edge.
* **tarot** — reads raw `alpha` off `deviceorientation` as an ENTROPY source for a shuffle, not as a
  bearing. A jumpy sensor is not a defect there.
