# Transits — the precise natal chart (research note)

Goal: transits are only meaningful **against a natal chart**. A chart needs the birth **instant** (to the
second, in the right historical time zone) and the birth **place** (to place the Ascendant/MC/houses).
Everything below is verified, not assumed — each claim has a measurement next to it.

Superseded: the earlier note (AI interpretation of the *current* sky) is kept at the bottom.

---

## 1. The birth instant — wall clock → UTC, with history

The hard part is not the arithmetic, it is that "11:30 in Ulm on 14 Mar 1879" was **not** UTC+1. Before
standard time, every town ran on its own **Local Mean Time**. Astrologers care: a 53-minute error moves the
Ascendant by ~13°, i.e. half a sign.

**Finding (measured, not assumed): V8 exposes the full historic tz database, to the second.** No data file,
no API, no library — `Intl.DateTimeFormat` with an IANA zone honours LMT and every historical rule:

| zone | instant | offset V8 returns |
|---|---|---|
| `Europe/Berlin` | 1879-03-14 | **+00:53:28** (Berlin LMT) |
| `Europe/Kyiv` | 1879-03-14 | **+02:02:04** (Kyiv LMT) |
| `America/New_York` | 1883-11-17 | **−04:56:02** |
| `Europe/Kyiv` | 1990 / 2026 | +03:00:00 |

Sub-minute offsets survive — so the seconds of an LMT offset are not rounded away.

**Wall time → instant** is the *inverse* of what `Intl` gives, so it is solved by fixed-point iteration:

```
offsetAt(ts, tz)  = Date.UTC(...formatToParts(ts in tz)) − ts        // whole seconds, exact
zonedToUTC(wall)  = ts₀ = Date.UTC(wall);  ts = ts₀ − offsetAt(ts₀)
                    repeat twice more: ts = ts₀ − offsetAt(ts)        // converges; DST steps are ≤ 1 offset apart
```

Two edge cases have to be *reported*, never silently guessed — the UI surfaces both:
- **Nonexistent** wall time (spring-forward gap): `offsetAt(result) ≠ offsetAt(guess)` and re-substituting
  does not land on the requested wall time. We keep the post-transition offset and flag it.
- **Ambiguous** wall time (autumn fall-back, the hour runs twice): both offsets reproduce the wall time.
  Convention: take the **earlier** instant (the first pass, i.e. still-DST), and flag it so the user can
  switch to the manual offset if the birth certificate says otherwise.

`hourCycle: "h23"` — not `hour12: false`, which yields hour `24` on some engines.

**Escape hatches** (both in the form, because civil records beat databases):
- a **manual UTC offset** (`+02:00`, `+00:53:28`) that bypasses the tz database entirely;
- **true LMT from longitude** (`offset = longitude/15 h`), which is what astro.com uses for pre-standard-time
  births and what the reference chart below is calculated with.

Precision through the chain: the instant is a JS epoch-millisecond integer. `AstroTime.ut` for a 1 ms step
returns exactly 1.1574074074074074e-8 days (= 1/86 400 000) — **no precision is lost**, and float64 day
counts resolve ~1 µs near J2000 anyway.

## 2. The frame at that instant — RAMC and obliquity

Both come from astronomy-engine, which already ships in the farm; no hand-rolled sidereal formula.

- `SiderealTime(t)` → Greenwich **apparent** sidereal time in hours. Verified: at J2000.0 it returns
  18.697136 h; GMST is 18.697374 h and the equation of the equinoxes at that instant is −0.8587 s
  = −0.000239 h. The difference matches exactly, so the value is GAST (nutation already applied).
- `RAMC = GAST·15 + λ_east` (degrees, normalised) — the right ascension of the Midheaven.
- `e_tilt(t).tobl` → **true** obliquity of date (mean + nutation in obliquity). Verified 23.439280 mean /
  23.437680 true at J2000.

Apparent + true-of-date is the correct pair for tropical astrology, and it matches the `Ecliptic()` call
the wheel already uses (astronomy-engine v2 converts EQJ → **ECT**, true ecliptic of date).

## 3. The angles — closed forms

For a point *on the ecliptic*, `tan δ = tan ε · sin α`, which is what collapses the house equations.

```
λ(α)  = atan2( sin α, cos α · cos ε )                     // ecliptic longitude of an ecliptic point at RA α
MC    = λ(RAMC)
ASC   = atan2( cos RAMC, −( sin RAMC · cos ε + tan φ · sin ε ) )
```

**Both are verified against an independent code path**, not against themselves — the computed longitude is
turned back into a vector, rotated ECT → EQD → HOR by astronomy-engine's rotation matrices, and inspected:

| check | result |
|---|---|
| altitude of the computed ASC | **0.000000000°** (refraction off) — it is exactly on the horizon |
| azimuth of the computed ASC | 54.04° — **east**, so it is rising, not setting |
| right ascension of the computed MC | 344.184051° vs RAMC 344.184051° — **Δ = 0** |

The **Vertex** (where the prime vertical cuts the ecliptic in the west) is the Ascendant of the co-latitude
`90°−φ` taken from the opposite meridian, `RAMC+180°`. The literature is inconsistent about a trailing
`+180°`, so it was settled by measurement rather than by picking a source: the un-flipped value lands at
azimuth **exactly 270.0000°** (due west) and the flipped one at **90.0000°** — the flipped one is the
*Antivertex*. No `+180°`.

## 4. Houses — Placidus by iteration

Placidus trisects the **semi-arc in time**, so its cusp equation is transcendental — no closed form. Using
`tan δ = tan ε sin α` to eliminate the declination gives the semi-arc as a function of RA alone:

```
DSA(α) = arccos( −sin α · tan φ · tan ε )        // diurnal semi-arc  (= 90° + ascensional difference)
NSA(α) = 180° − DSA(α)                           // nocturnal semi-arc
```

and each cusp is a fixed point (the map is a contraction at ordinary latitudes; it converges in <20 rounds
to 1e-11°, and the code caps at 200 and reports non-convergence rather than returning a wrong number):

| cusp | fixed point | seed |
|---|---|---|
| 11 | `α = RAMC + ⅓·DSA(α)` | RAMC + 30° |
| 12 | `α = RAMC + ⅔·DSA(α)` | RAMC + 60° |
| 2 | `α = RAMC + 180° − ⅔·NSA(α)` | RAMC + 120° |
| 3 | `α = RAMC + 180° − ⅓·NSA(α)` | RAMC + 150° |

Cusp longitudes are then `λ(α)`; cusps 4–9 are the opposite points; cusp 1 = ASC, cusp 10 = MC. Sanity: at
AD = 0 the seeds *are* the answers, and `RAMC + 180° − NSA = RAMC + 90° + AD` reproduces the ASC exactly.

**Above the polar circle Placidus is undefined** — `|sin α · tan φ · tan ε| > 1` means the ecliptic degree
never rises. `tan φ tan ε = 1` at φ = ±66.56°, so the failure is real, not theoretical, for Arctic births.
The code detects it and falls back to **Porphyry** (trisect the ASC→MC quadrants), which is what Swiss
Ephemeris does. Whole-sign and equal are also offered; both are closed-form and never fail.

### Verified against a published chart

Albert Einstein, 14 Mar 1879, 11:30 LMT, Ulm 48°24′N 10°00′E (Rodden AA) → LMT = 10/15 h = +0:40 → 10:50 UT.

| | computed | published (astro.com/Placidus) | Δ |
|---|---|---|---|
| ASC | 11°Can38.8′ | 11°Can39′ | 0.2′ |
| MC | 12°Pis50.4′ | 12°Pis50′ | 0.4′ |
| cusp 2 | 28°Can37.0′ | 28°Can37′ | 0.0′ |
| cusp 3 | 17°Leo48.5′ | 17°Leo48′ | 0.5′ |
| cusp 5 | 18°Lib20.0′ | 18°Lib20′ | 0.0′ |
| cusp 6 | 3°Sag06.6′ | 3°Sag06′ | 0.6′ |

Every cusp agrees to **under an arcminute** — the residual is the published values being truncated to whole
arcminutes. This is the unit test.

## 5. How good is the ephemeris, really

astronomy-engine advertises "within 1 arcminute of NOVAS". That is a bound, not the typical error, so it was
**measured** against JPL Horizons (DE440, apparent ecliptic longitude of date, geocentric) at the 1879 instant
above — a deliberately awkward date, 147 years before the present:

| body | Δ | body | Δ |
|---|---|---|---|
| Sun | 0.004″ | Jupiter | 0.24″ |
| Moon | 2.74″ | Saturn | 1.91″ |
| Mercury | 2.06″ | Uranus | 0.84″ |
| Venus | 0.11″ | Neptune | 0.47″ |
| Mars | 1.94″ | Pluto | 5.70″ |

Worst case **5.7″ = 0.095′**, an order of magnitude inside the advertised bound.

**What "to the millisecond" honestly means here**, and what the UI is allowed to claim:

- The **time pipeline is exact**: tz offsets to the second, epoch-ms integers, no rounding anywhere.
- The **angles are exact for the instant given**: ASC moves ~15′/minute of clock time, so 1 ms of birth-time
  error moves it by ~0.015″ — far below the ephemeris noise. Getting the birth *minute* right matters
  thousands of times more than anything in the code, which is exactly why the form takes seconds and shows
  the resolved UTC instant back to the user.
- **Exact-hit times inherit the ephemeris error, divided by the body's speed.** Sun 0.004″ ÷ 2.6″/min → sub-
  second. Moon 2.74″ ÷ 33″/min → ~5 s. Pluto 5.70″ ÷ ~1.4″/day → ~4 days. So hit times are reported at the
  resolution the body actually supports: **seconds** for Sun/Moon/Mercury/Venus/Mars, **minutes** for
  Jupiter/Saturn, **the day** for Uranus/Neptune/Pluto. Printing "14:22:07.431" for a Pluto transit would be
  a lie told with decimal places.

## 6. Exact hits — root-finding, not scanning

A transit "perfects" when the signed separation from the natal point crosses the aspect angle. `f(t) =
wrap180( λ_transit(t) − λ_natal − angle )` is continuous and changes sign at the hit, so: **coarse scan** at
a body-appropriate step to bracket a sign change (with an `|Δ| < 90°` guard so a wrap-around is never
mistaken for a crossing), then **bisection** to a 1-second tolerance — ~40 iterations, each one ephemeris
call, which is cheap because only the one body is evaluated.

Retrograde bodies hit the same aspect up to three times (direct, retrograde, direct again). The scan returns
**all** brackets in the window, so a triple pass shows as three dated hits rather than one — a Pluto contact
against a real chart returns five.

Two numbers make this affordable, and both are per-body:

- the **window** scales to the body's speed — ±3 days for the Moon, ±12 years for Pluto. A fixed window
  either reports "no hit" for a Pluto aspect that is plainly building, or buries today's Moon hit in a month
  of them.
- the **scan step** is sized so the body moves ≲0.5° per sample: fine enough that a retrograde loop cannot
  slip a *pair* of crossings between two samples, coarse enough that the Pluto window is hundreds of
  ephemeris calls, not thousands.

Measured on a real 14-contact chart: **225 ms total, 57 ms for the worst single contact.** That is fine as a
background task and far too slow inside a render, so the view solves one contact per task with a yield
between them and each card carries a skeleton until its own answer lands.

## 7. Transit orbs are not natal orbs

Natal aspect orbs (8°/6°/4°, the `aspects.js` table) describe a *standing* relationship. A transit is an
*event*, and the traditional working orb is far tighter — 1° is the common choice, 2–3° for "coming into
range". The app uses **1° exact / 3° in range** with the in-range band rendered dimmer, and sorts by orb so
the tightest (i.e. the one actually happening) is on top. Reusing the natal 8° conjunction orb here would
report a Pluto conjunction as "active" for **six years**, which is why the natal table is not reused.

---

## Appendix — the earlier note (AI interpretation of the current sky)

The `astro` mode on the VPS (`/feed/ai`) carries an *astrologer* system prompt in en+uk that interprets only
the supplied positions/aspects/retrogrades and invents nothing — the tarot `summarize` prompt could not be
reused because it frames every input as a tarot card. Aspects (Ptolemaic five, orbs 8/6/4 + 2° luminary
bonus, applying vs separating from the previous-day chart) are computed in `/_rt/aspects.js`, drawn as chords
inside the zodiac ring (soft = success hue solid, hard = error hue dashed, conjunction = neutral dotted, so
nature never reads on colour alone) and fed to the model as a canonical-English block whose signature is the
per-locale cache key. The sheet is history-backed, skeleton-while-loading, 12 s fail-open with retry, and a
fixed reading under the gate for deterministic CI shots.
