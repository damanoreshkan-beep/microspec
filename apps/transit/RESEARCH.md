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

Six controls, in order of how much they actually buy:

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
6. **A groundedness floor the server can measure** (`groundedCheck`, ai-prompts.js): of the bodies the input
   supplied, how many does the reply NAME? Below the floor it is re-asked once with its own answer in the
   thread; still below, it is returned flagged `ungrounded` and kept out of both caches. Added last and
   listed last because it buys the least *when the other five are working* — and because it is the only one
   that catches the failure in §10a, which the other five are structurally unable to see.

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

## 10a. The third failure: a reading that invented nothing and said nothing (2026-08-06)

The owner sent back a live sky reading and said it had no substance. He was right, and the interesting part
is that **every control in §10 passed it.** It invented no planet, derived no number, assigned no gender,
was not truncated. It simply was not about the chart:

> Цього дня ти перевіряєш, перш ніж підпустити інших до своїх ідей чи емоцій… Ти прагнеш глибшого
> розуміння та зв'язку… але водночас ти відчуваєш потребу усамітнитись…

Three separate faults sat behind it, and only the first is obvious once seen.

**The prompt was quoting itself.** «ти перевіряєш, перш ніж підпустити» is, word for word, the illustration
GROUND_RULES carried of how to phrase the direct register. The model took the example of HOW TO PHRASE and
used it as WHAT TO SAY. This generalises past astrology and is the most portable thing in this note: **an
instruction written in the OUTPUT language, in the output's register, at the output's length, is
indistinguishable from output.** A style rule may name the grammatical move; it may not hand over a finished
sentence in the target language. Both locales lost their illustrations.

**The sky mode had no corpus.** It was the only one of the six sending bare coordinates — a natal list and a
contact list, meanings left to whatever the model had absorbed. Sending the whole natal chart made it worse:
ten placements the reading was never going to use are ten invitations to write about something else.
`groundSky()` now builds the same kind of block as its five siblings, from the contacts only.

**And its prompt could not be failed.** The siblings each state an order of thought whose steps are visible
in the answer — the transit prompt demands a duration, the house prompt demands the ruler's placement.
"Розкрий головний мотив дня" cannot be failed, so nothing ever failed it. It also described an input it no
longer received ("the planets and the aspects between them" is a *mundane* sky reading; the client sends
transits against a natal chart), and a model handed a mismatch resolves it the cheap way — it writes the
reading the prompt described.

### What the numbers actually were

One chart, 7 Aug 2026, three contacts supplied, `POST /feed/ai` on the deployed edge:

| | provider | contacts named |
|---|---|---|
| before | gemini-2.5-flash | **0** of 3 |
| before | gemini-2.5-flash-lite | 3 of 3 |
| before | gemini-2.5-flash | **0** of 3 |
| after | gemini-2.5-flash | 3 |
| after | gemini-2.5-flash | 3 |
| after | gemini-2.5-flash | 4 |

Two things in that table matter more than the improvement. **The primary provider was the one that drifted**
— the weaker `-lite` model was the one using its data, so a single control run against whichever model
answered first would have said the route was fine. And **one run of three looked correct before any fix**,
which is exactly how a systematic failure gets recorded as a fluke.

### The failure the fix uncovered

Re-measuring found something the first three probes could not have shown, *because none of them named a
factor at all*: once the readings started naming things, they had to TRANSLATE the names. The grounding
blocks are English by construction — that is what keeps one cache signature valid across both locales — so
every Ukrainian name in the output is the model's own work. Two of three grounded replies rendered
**"Midheaven" as «Середньовіччя»**, which is the Middle Ages. A third opened with «Найсхідніший контакт
цього дня» — "the most *eastern* contact", a mistranslation of «найтісніший» wrapped around a stage
direction that was never meant to be spoken aloud.

The planets came through clean (Плутон, Меркурій, Сатурн, Венера); it is the **angles** that have no
everyday Ukrainian and invite a guess. So the uk rules carry a glossary for the five of them and name the
mistranslation as the trap it is, and both locales now forbid narrating the brief. Neither fault was
reachable by any gate: the replies were well-formed, grounded, and passed the new check. It took reading the
Ukrainian.

### Two things this changed structurally

**`CORPUS` 3 → 4, and the sky reading's signature finally contains it.** The old key was hand-built at the
call site (`view.js`) out of the date, the Ascendant and the contacts — no corpus version, unlike the other
five, which take theirs from `groundX()`. So no change to a meaning or a prompt could ever have expired a
cached sky reading; every browser would have kept serving the old voice forever. `groundSky` returns the
pair, which is the whole reason the builders return `{ text, sig }` together.

**The block is measured, not estimated.** A real chart on an ordinary day had 17 contacts inside the 3°
range; at six contacts the block came to 5 988 characters against the mode's 6 000-character cap — twelve
short of silently losing its own composition rules off the end, which looks exactly like a model ignoring
instructions. The list caps at four (all a 3–4 sentence reading can name, and it states that it is capped)
and the mode's cap went to 8 000.

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

# Part III — the houses, and the ten questions (2026-07-30)

## 12. A house is not its cusp — it is delegated to its ruler

The cusps panel showed twelve degrees. The thing it could not show is the technique that makes a house
readable at all: **a house is handed to the ruler of the sign on its cusp, and that ruler lives somewhere
else in the chart.** "Your second house is in Sagittarius, and Jupiter, which rules it, sits in the eighth"
is a statement about money and other people's resources, and no degree column can carry it.

`groundCusp()` therefore supplies, per house: the cusp sign, the traditional ruler **with its own sign,
house, dignity and retrograde state**, the modern co-ruler labelled as modern, and the planets tenanting the
house. Two traps are closed in the data rather than left to the model:

- **The empty house.** An absent tenant list reads to a model as "this area of your life is empty". The
  tradition says the opposite — an untenanted house is read through its ruler — so the block says that
  outright and the prompt repeats it.
- **Ruling vs standing in.** See §14; this one cost a live answer.

## 13. Eleven questions, and the six that were dropped

The catalogue (`QUESTIONS` in `signif.js`) is **closed**, and that is the design rather than a limitation:

- **It is the only honest way to be grounded.** Each question declares the significators it may be answered
  from — `love` sees the 7th, the 5th, Venus and the Ascendant, and nothing else. A free-text box has no such
  set, so it would be a wishing well with a language model at the bottom.
- **It removes the injection surface entirely.** There is no user text. Compare `ask` in `ai-books.js`, which
  takes free text and needs a whole prompt section to defend itself.
- **It caches.** Ten questions × one chart = ten answers, permanently.

Ranking evidence is **thin and I will not pretend otherwise.** Consultation-topic lists
([Vedicfeed](https://vedicfeed.com/questions-to-ask-astrologer/),
[AstroPush](https://astropush.com/blog/what-to-ask-an-astrologer)) agree on the *set* of topics, and Lilly's
*Christian Astrology* Book II is organised by question type — a 1647 FAQ, and the same topics — but neither
establishes a *frequency order*. The ordering here is a reasoned synthesis, not a measurement.

**A topic is not a phrasing (2026-07-30).** The catalogue first shipped its full questions as the buttons —
«До кого мене тягне і що притягує до мене?» and ten more. Read on the phone that is a page of prose you have
to work through *before* you can choose, and what a person actually arrives with is a **topic**: work, love,
sex, money. So the entry splits in two: `label` is the topic in en + uk (a word, at most two, no question
mark — the unit gate pins that shape, because the essay is what grows back one "slightly more precise" label
at a time), and `ask` is the precise English question the **model** is handed, where the phrasing is the
difference between an answer and a meditation. The prompt is byte-identical to what it was — `ask` carries
the old sentence — so `CORPUS` did **not** move and every cached reading stays valid.

The blunt list also exposed a gap the sentences had hidden: there was no **sex** question. It is one of the
topics people actually bring, it is not an outcome claim (§ the six dropped below), and the tradition reads
it — Mars for desire, Venus for what attracts, the fifth for pleasure and the eighth for intimacy proper.
Its `focus` bounds it the same way the others are bounded: temperament, pace and terms; never an act, a
partner, an event, advice or a prediction. Eleven now, and the catalogue reads as a row of pills.

**Two of the eleven are timing-shaped** (`workNow`, `phase`) and are fed real transits with exact dates; the
other nine are natal dispositions that do not change week to week. The distinction is unit-tested, because
flipping a question's `transit` flag without giving the caller a contact set would silently answer a timing
question from a birth chart.

**What was dropped, and why no reframing rescued it:** will I have children · am I pregnant · what is wrong
with my health · when will I die · will I win the case · should I invest. Every one asks for an outcome a
birth chart does not establish, and the person wants *the outcome* — a symbolic answer to "when will I die"
is a worse answer, not a safer one. A unit test fails if one is ever added back, so it has to be argued for
in a diff rather than slipped in.

**One gap the catalogue exposed, and the fix.** Asked "what work suits me", the first live answer never named
a kind of work — it paraphrased "identity, vitality and conscious purpose". That was the closed-world rule
behaving *correctly* on missing data: naming an occupation not in the grounding would be invention. So the
occupations went into the corpus. The tradition really does assign trades to planets (Lilly gives each planet
its professions), so `BODY[k].work` leads with the modern reading and keeps the classical list behind it —
and the three modern bodies say plainly that they have no classical list. The re-measured answer names
representing and leading (Sun on the MC) against building, land and administration (Saturn in Capricorn), and
notes the tension between them. That is an answer.

## 14. The third way a grounded model still lies: it misreads

§10 recorded two failures — a **derived** number, and an **assumed** gender. This part found a third, and it
is the most insidious because the fact was right there:

> The block said `Its ruler Moon … is in Aries, house 6`. The answer said **«у дев'ятому домі знаходиться
> Місяць»** — the Moon is in the ninth house. It is not; it rules the ninth and stands in the sixth.

Not invention, not arithmetic — **a conflation of two relations**, rulership and placement. Fixed in both
places, because either alone leaves the ambiguity: the block now says `RULED BY Moon. Moon does not stand in
house 9; it stands in Aries, house 6`, and a ground rule spells out that a planet may be called "in" a house
only if it is listed after `STANDING IN`. `CORPUS` went to 2 so every answer built on the old wording expires
— the wording changed while the signature inputs did not, and without the bump the wrong answer would have
been served forever.

**A fourth thing worth recording about measurement itself.** The no-gender rule held on `gemini-2.5-flash`
and was ignored by `gemini-2.5-flash-lite`, which is in the same rotation — so "it worked when I tested it"
was a statement about which daily bucket had quota that minute. Rules are now placed **first and repeated
last**, and verified against the *weak* model specifically. Any prompt rule tested on one provider is untested.

## 15. Why there is no fifth tab

The catalogue is the app's headline feature and it still does not get a dock tab. Measured, not assumed: the
dock is content-sized with `min-w-14` per button inside `left-3 right-3`, so at the 384px reference each of
five buttons gets ~72px, minus `px-3.5` either side leaves ~44px of label — and **«МОМЕНТИ» truncates**. No
app in the farm ships five tabs (max is four: transit, rave, reel, handpan, v2m). A new feature that damages
the labels of the four that already exist is not worth a tab, so it opens from the Chart tab, which is where
the natal chart lives — and these answers are the natal chart asked a question.

## 16. Two named days and a calendar, not five approximations

The scrubber's preset row was `−1 mo · −1 wk · today · +1 wk · +1 mo`. Four of those five are **guesses at
which day someone means**: nobody wants the sky of "seven days from now", they want a day they can name — a
date, an appointment, a birthday. Only two days have names in a language, so only two get a chip
(**today · tomorrow**), and the whole rest of the year goes to the platform's own **date picker**, which is
the one control that can express "the 14th".

Three details are load-bearing:

- **The offset is measured between local midnights and rounded** (`dayOffset`), not divided out of a
  millisecond difference. A DST hour inside the span turns 20 days into 19.96, and `Math.floor` would then
  show the 13th for a picked 14th — once a year, in one timezone, which is exactly the bug that never gets
  reproduced. `ymd()` is built from the local getters for the same reason: `toISOString()` names *yesterday*
  for everyone west of Greenwich.
- **The picker's window is the slider's window** (±365 days, one `SCRUB` constant), so a chosen day can
  never land outside the range the slider can represent — a value the control cannot show is a lie about
  state.
- **The native input covers its chip at `opacity: 0`** rather than being opened by `showPicker()`. That call
  needs a transient activation and is not on every engine; a chip that opens the calendar on some phones and
  does nothing on others is worse than no chip. The chip stays the row's third slot and its two material
  states, and shows the chosen day instead of a word it does not have.

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

# Part IV — synastry: two charts, and a time nobody knows (2026-08-21)

The compatibility tab shipped as the crudest thing in the app: it took two birth dates, computed each
person's Sun/Moon/Mercury/Venus/Mars at noon UTC, threw the longitudes away with `signOf`, and scored the
pair by SIGN DISTANCE. Three separate problems came out of that one shortcut, and they are worth separating
because only one of them is about astrology.

## 17. The degree inside the sign was being computed and then discarded

Sign distance cannot tell 1° Cancer from 29° Cancer. A pair one degree off an exact trine and a pair
twenty-eight degrees off scored the same number, because both were "four signs apart". The ephemeris was
already producing the real longitudes; `signOf` dropped them on the floor one line later.

`contacts(A, B)` in `packages/runtime/synastry.js` now measures the aspect between the longitudes and keeps
the distance from exact. It is a CROSS product, not a half-matrix: A.Sun–B.Sun is a real contact between two
different Suns, and A.Venus–B.Mars is a different claim from B.Venus–A.Mars.

## 18. Orbs belong to the planets, not to the aspects

VERIFIED, and it is the one place synastry parts company with `aspects.js`. Deborah Houlding, tracing the
classical use of aspects, is explicit that per-aspect orbs are recent:

> "Only within the last century have orbs come to be determined by the nature of the aspect rather than the
> planets involved, a simplifying process which fails to accept that some planets have a stronger influence
> than others."
> — [The Classical Origin and Traditional Use of Aspects](https://www.skyscript.co.uk/aspects.html)

The older model gives each PLANET an orb, and two planets are in aspect when their distance from exact is
inside the sum of their two MOIETIES (each planet's orb radius). Dariot's table as Houlding reproduces it,
itself from Al-Biruni — read from the primary source, not taken from the research pass:

| | Sun | Moon | Mercury | Venus | Mars | Jupiter | Saturn |
|---|---|---|---|---|---|---|---|
| orb radius | 15° | 12° | 7° | 7° | 8° | 9° | 9° |
| **moiety** | **7½°** | **6°** | **3½°** | **3½°** | **4°** | **4½°** | **4½°** |

So Sun–Moon reaches 13½° and Mercury–Venus only 7°. That is the substantive claim and it is why the model is
worth adopting: the luminaries carry further than the small personal planets, which per-aspect orbs cannot
express. Houlding also records that the sources disagree among themselves — 12° for everything, 15°, the
mean of the two planets, Ptolemy's 5° — so this is ONE documented system, named and cited in the code,
never "the" traditional orb.

`aspects.js` is deliberately left alone: transit orbs are already their own question (§7), and one module
changing its mind about what a trine is would be worse than two modules being explicit about why they
differ.

**The three modern planets have no moiety**, because the tradition ended before they were found. There is no
honest number to invent for them, and that — not screen space — is why the tab reads five bodies and stops.

## 19. Which aspects, and the quincunx

The five Ptolemaic aspects only. Same source: the semisextile "was dismissed as too weak to be of noticeable
influence", and the inconjunct/quincunx named the ABSENCE of an aspect — *aversum*, "turned away from",
*asyndeton*, "unconnected". Modern relationship astrology does read the quincunx, and reads it as constant
adjustment, but that is a 20th-century reinterpretation of aversion rather than received technique. Shipping
it would be asserting a modern school as the tradition, which is the one thing §8's rules forbid.

## 20. There is no traditional basis for a compatibility percentage — so the ring says so

VERIFIED, and this is the finding the tab most needed. Classical judgement of an aspect turns on the nature,
dignity, reception and condition of the planets involved: a square between two well-placed planets is not
simply bad, and a trine to an afflicted Venus is not simply good. A single scalar erases exactly the
conditions the tradition judges by. The numeric systems that do exist have named 20th-century authors
(Elbert Benjamine's astrodynes) or are closed scoring inside commercial software; neither is received
technique, and no public weighting table for the commercial ones could be verified at all.

The ring therefore stays — it is the screen's spine — but it is labelled in the code and in the grounding
block as **this app's index, computed by the formula in `score()`**, and the AI prompt is forbidden from
handing it back as a percentage of compatibility. What the tradition supplies is the CONTACTS; the number
on top of them is ours.

### Two dead bands, both found by measuring rather than by looking

The index is a strength-weighted read of the contacts an axis actually has. Getting there took two measured
corrections, and both were invisible to every gate:

1. **Scoring absent pairs at neutral collapsed the whole scale.** Only ~11 of the 25 possible contacts exist
   in a typical pair, so three dead slots in a five-pair axis dragged everything back to the midpoint. Over
   1 500 random pairs the overall ran 54–70 and *two of the four bands became mathematically unreachable* —
   the app would have shipped "challenge" and "harmony" as labels no user could ever see. An absent pair is
   AVERSION, which is not a mild connection but no connection, so it now gets no vote at all.
2. **Weighting by strength without pulling toward neutral ignored the orb it had just measured.** An axis
   whose only contact was a 12°-wide trine scored exactly 90 — the same as an exact one — and a real pair
   came out 90/90/90/90/86. Caught by rendering a grounding block and READING it, not by any assertion.
   Each vote is now pulled toward neutral by its own strength before being weighted.

Measured distribution after both fixes, over 3 000 random pairs: **48–84, median 65** (p05 56, p25 62,
p75 68, p95 74). The old 48/62/78 band cuts sorted a distribution that no longer exists, so they were re-cut
to **58/65/72**, which splits it roughly 10 · 40 · 40 · 10. The number is NOT stretched across 0–100:
rescaling would widen the gaps between scores without adding anything that measures them.

## 21. The unknown birth time, and why it became a slider

This is the honest limit of the whole tab, and it was previously hidden. Measured on this ephemeris over 900
sampled dates:

| body | mean motion / 24 h | max | ± around noon |
|---|---|---|---|
| Sun | 0.99° | 1.02° | ±0.49° |
| **Moon** | **13.18°** | **15.28°** | **±6.59° (±7.64° worst)** |
| Mercury | 1.22° | 2.20° | ±0.61° |
| Venus | 1.04° | 1.26° | ±0.52° |
| Mars | 0.57° | 0.79° | ±0.28° |

**The Moon changes SIGN inside the birth day 43.8% of the time** (394 of 900). The old screen took noon,
drew a Moon glyph, and said nothing — so roughly one card in five was confidently showing a Moon sign that
was a coin toss. The four other bodies are solid to about a degree and need no such warning.

The standard practice for an unknown time is a **noon chart**, and the sources are consistent that it is a
computational placeholder, not a recovered time: no Ascendant, no Midheaven, no houses, and therefore no
HOUSE OVERLAYS — a whole standard layer of synastry that this input cannot support at all. What ships is
honestly *planetary* synastry, and the grounding block says so in those words so the model cannot reach for
"your seventh house of partnership", which is the single most predictable sentence in relationship astrology.

So the fix is not a disclaimer, it is a control. A **±24 h slider in 30-minute steps** moves the whole chart
and recomputes live — measured at **0.19 ms** for both charts, so there is nothing to debounce and no reason
to make the user wait. ±24 h rather than ±12 h covers the unknown hour AND the unknown timezone, since a
date recorded in local time can sit up to 14 hours from the UTC day. The Moon visibly moves under the
slider; the card marks it when its sign changes inside the day around the current position. The reading
alone settles a second behind, because each distinct chart is one paid request.

## 22. The AI reading (`astroMatch`)

Sixth mode in the astrology family, same contract as the other five: closed-world block, corpus supplied
alongside every factor, `groundedCheck(2)`, cap 6 000 (worst case measured at 4 256 characters over 400
random pairs). Two rules are specific to it, and both come from failures already measured elsewhere in this
file — a prompt that describes an input the client does not send gets the reading the prompt described
(§10), so the absence of houses is stated in the block AND in the prompt; and two charts invite two portraits
back to back, which is not a synastry, so the required shape is contact-first.
