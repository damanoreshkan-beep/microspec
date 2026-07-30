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

# Part II — interpretation: what a contact and a placement MEAN (2026-07-29)

The chart above is arithmetic and it is verifiable to the arcsecond. Part II is a different kind of claim,
and the difference has to be stated before anything is built:

> **Astrology is not an empirically validated causal system.** Nothing here asserts that Saturn does
> anything to anyone. What *can* be true or false is **fidelity to the tradition**: whether "Mars rules
> Aries", "the sixth house signifies sickness and service" and "a square is read as friction" are what the
> tradition actually says. That is the sense of "truthful" this part is built to satisfy — a sourced corpus
> of conventional significations, with the contested parts labelled contested, and a model that is not
> allowed to add to it.

The design follows from that: **the meanings ship as data, not as a prompt.** A verified corpus lives in
`packages/runtime/signif.js`, the UI renders it directly (so a model outage costs the *prose*, never the
substance), and the model receives that same corpus as grounding with one job — connective synthesis in the
reader's language.

## 8. The corpus, and what each table is sourced from

| Table | Content | How it was verified |
|---|---|---|
| **Dignities** | domicile + exaltation per planet; detriment/fall **derived** as the opposite sign | [Wikipedia, *Essential dignity*](https://en.wikipedia.org/wiki/Essential_dignity) — full table read and transcribed; cross-checked against the ruler list already in `zodiac.js` |
| **Rulerships** | traditional = `RULERS[i][0]`; modern co-ruler = `RULERS[i][1]` | `packages/runtime/zodiac.js:34` — verified that the array's first element is the traditional ruler for all 12 signs, so no second rulership table is introduced |
| **Planet significations** | role, transit action, strain | [Wikipedia, *Planets in astrology*](https://en.wikipedia.org/wiki/Planets_in_astrology) — quoted wording per planet |
| **Planet tempo** | period, time per sign, retrograde season | astronomical, cross-checked against `HIT_WINDOW`/`SCAN_STEP` in `natal.js` |
| **Sign element / modality / polarity** | fire·earth·air·water, cardinal·fixed·mutable | [Wikipedia, *Astrological sign*](https://en.wikipedia.org/wiki/Astrological_sign); the maths already exists as `ELEMENT`/`MODALITY` in `synastry.js:9` and is reused, not re-derived |
| **House topics** | the field of life each house governs | [Wikipedia, *House (astrology)*](https://en.wikipedia.org/wiki/House_(astrology)) for the modern formulation, cross-read against [Lilly, *Christian Astrology*, "Of the Twelve Houses"](https://www.skyscript.co.uk/lilly_houses.html) for the traditional one |
| **Aspect natures** | conjunction/sextile/square/trine/opposition | Ptolemy's doctrine as carried by the existing `TRANSIT_ASPECTS` table (`natal.js:224`), which already assigns `soft`/`hard`/`neutral` |

**Derived, never duplicated.** Detriment is the sign opposite the domicile and fall the sign opposite the
exaltation, so the corpus stores 7 + 7 facts instead of 4 tables that can drift apart. `dignityOf()` is a
pure lookup and is unit-tested against all 120 (body, sign) pairs.

**Only the seven classical bodies carry dignity.** Uranus, Neptune and Pluto have modern *rulership*
assignments (Aquarius, Pisces, Scorpio) but no agreed exaltation — the "Uranus exalted in Scorpio" family of
claims is a 20th-century invention with no consensus, so it is **absent**, not guessed.

### What is labelled contested, and therefore never asserted flat

- **Outer-planet rulership.** Traditional astrology gives Aquarius to Saturn, Pisces to Jupiter and Scorpio
  to Mars. The corpus carries both conventions and the UI names which one it is showing.
- **House system.** Placidus and whole-sign disagree about which house a planet is in, and the app already
  offers four systems. Every grounding block and every factual row **names the active system**, because
  "Mars in the 10th" is a statement about Placidus, not about the sky.
- **Retrograde.** Modern practice reads it as review/internalisation; traditional astrology treats it as an
  accidental debility. The corpus states the factual condition and the modern reading, labelled.
- **The Vertex** as "fated encounters" is a modern convention and is labelled as one.
- **Orbs.** `1° exact / 3° range` (§7) is this app's convention, not a tradition-wide constant.

## 9. The composition rules (the method, not the meanings)

A reading that concatenates keywords is not a reading. The order below is the standard modern synthesis and
it is what the prompts encode — it is a *method*, so it is stated as one rather than dressed as a fact.

**A transit** — the moving body supplies the process, the natal point supplies what is being touched:

```
transiting body   → the nature and the TEMPO of what is arriving
aspect            → how the two meet (fuse · flow · grate · oppose)
natal point       → the function being activated
its house         → the field of life it happens in
orb + phase       → how close, and building or dispersing
retrograde/passes → one contact, or a three-pass revisit
```

The tempo term is load-bearing and it is astronomy, not doctrine: a Moon square lasts hours and a Pluto
square recurs over years. The app already knows the difference (`HIT_WINDOW`, `HIT_PRECISION`), so the
reading is told the same thing rather than being left to imply that every contact is a day.

**A natal placement** — `planet = what · sign = how · house = where`, qualified by dignity (how easily the
planet can work in its own manner) and by retrograde. Not two canned paragraphs glued together: one
behaviour, in one arena.

**The whole chart** — luminaries + Ascendant first, then the chart ruler, then angular planets, then element
and modality balance, then repeated themes, then the tightest aspects. Everything in that list is computable
from data the app already has; nothing is invented to fill a heading.

## 10. What stops a grounded reading from drifting

Five controls, in order of how much they actually buy:

1. **The facts layer is not AI.** Every sheet renders the computed configuration and the corpus keywords
   from local data. The model's failure mode is a missing paragraph, never a wrong fact.
2. **Closed-world prompts.** The server prompt says: use only the supplied `FACTS` and `MEANINGS`; add no
   body, sign, house, aspect, dignity or event that is not in them; no medical, legal, financial, death or
   pregnancy claims; no certainty language for a symbolic system.
3. **The tempo and the orb are inputs**, so the model cannot describe a fourteen-year Neptune transit as a
   mood that passes on Tuesday.
4. **Sentence budgets, not character budgets** — measured in `apps/arc/RESEARCH.md` §5 and re-used:
   transit 3–5 sentences, placement 3–4, portrait 8–12 with a stated no-dumping-ground rule.
5. **A truncated reply is never cached** (the `acts` lesson): a stump is worse than a miss, because a miss
   retries and a cached stump is forever. This used to be true for `acts`/`ask` only; the `reading()` factory
   in `ai-core.js` now makes it true everywhere by construction.

### Two failures the live route actually produced, and what fixed them

The controls above are not theory — both of these came back from `POST /feed/ai` on the deployed edge, and
neither would have been caught by a "do not invent" instruction alone.

- **A DERIVED number.** Given three exact-hit dates and no span, the model wrote *"приблизно півтора року"*
  for a sequence running 3 Aug 2026 → 2 May 2027 — **nine months**. Every input it used was genuinely in the
  block, so closed-world grounding could not catch it: the invention was the *arithmetic*. Fixed twice over —
  `spanLabel()` computes the span and states it, and the prompt now forbids deriving any figure at all
  ("every number, date or span you state must appear verbatim in the input"). Re-measured: *"близько 9
  місяців, з 3 серпня 2026 до 2 травня 2027"*.
- **It assigned the reader a gender.** *"Ти схильн**а**…"* — Ukrainian marks gender in adjectives and past
  tense, and the chart contains no such fact. A reading that misgenders the person on the first line is worse
  than no reading. Fixed in the prompt by naming the trap and the way out: present tense, impersonal and
  nominal constructions (*«тобі властиво», «ця позиція дає», «є схильність»*), which are gender-free in
  Ukrainian. Re-measured across three placements: clean.

Both are the same lesson in different clothes — **the model does not have to leave the grounding to say
something untrue about you.** Whatever a reading can compute or assume for itself has to be supplied, or
forbidden.

## 11. Two structural changes this required

**`/_rt/ai.js` was one file with five unrelated capabilities.** It is now four: `ai-core.js` (the wire, the
per-namespace localStorage cache, the in-flight dedupe, the shared `aiTick`, and a `reading()` factory that
turns a `(namespace, mode)` pair into the `get/has/warm` triple every capability was hand-repeating),
`ai-text.js`, `ai-astro.js`, `ai-books.js`. **The build copies `packages/runtime/` flat and skips
directories** (`deploy/build.mjs:82` — `e.isFile` is required), so a tidy `runtime/ai/` subdirectory would
404 in production; flat siblings plus a facade is the repo's own precedent (`astro.js` re-exports
`aspects.js` and `natal.js`). Measured blast radius:
`printf 'packages/runtime/ai.js\n' | deno run -A tools/affected.mjs` → `["arc","horoscope","imagine","retouch","tarot","transit"]`.

**`?tab=` and `?screen=`** joined `?theme=`/`?locale=`/`?detail=` in `render.js`, for the reason already
written next to `?detail=`: the screenshot service is the only browser this project has and **it cannot
tap**. Two of the three new surfaces live outside the first tab, and preflight only ever mounts the first
tab (`docs/GATE_BLINDSPOTS.md:132`) — so without this the reading sheets would have shipped unseen by both
the eye and the local gate.

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
