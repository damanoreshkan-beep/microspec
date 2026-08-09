# weather — research note (2026-08-09)

What the rebuild needs to land in one pass: the exact Open-Meteo surface, and a recipe for a live sky that
belongs to THIS farm rather than to the stock photographic blue-sky idiom.

Delegated the API reading to Codex (thread 019fe7f7), then re-ran every load-bearing request myself. The
"validated by" column below is what I personally ran, not what the report claimed.

## 1. Open-Meteo — one request covers everything

**VERIFIED (my own probe, 2026-08-09 22:15 Europe/Kyiv):** every field below arrives in a SINGLE keyless,
CORS-open request. `access-control-allow-origin: *` with an `Origin:` header set to the github.io origin.

```
https://api.open-meteo.com/v1/forecast?latitude=50.4501&longitude=30.5234&timezone=auto&forecast_days=5
  &current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,
           wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,precipitation_probability,
           is_day,pressure_msl,visibility,uv_index
  &hourly=temperature_2m,weather_code,precipitation_probability
  &daily=sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,
         wind_speed_10m_max,weather_code,temperature_2m_max,temperature_2m_min
```

Captured `current` (real, not an example): `{"time":"2026-08-09T22:15","interval":900,
"temperature_2m":20.8,"apparent_temperature":20.8,"relative_humidity_2m":55,"weather_code":1,
"wind_speed_10m":2.5,"wind_direction_10m":8,"wind_gusts_10m":7.9,"cloud_cover":39,"precipitation":0,
"precipitation_probability":0,"is_day":0,"pressure_msl":1019.8,"visibility":41100,"uv_index":0}`.

Units, from the response's own `current_units`: °C · % · km/h · ° · mm · hPa · **m** (visibility) ·
unitless (`uv_index`, `is_day`).

Load-bearing facts, each validated by that captured response:

- **`cloud_cover`, `precipitation`, `precipitation_probability`, `is_day`, `visibility`, `uv_index`,
  `wind_gusts_10m` and `wind_direction_10m` all exist in `current`.** They are absent from the docs page's
  compact "current" selector, which is why the old adapter only asked for five of them — the rule is
  "every hourly variable is available as current", and the live 200 proves it. This is the whole reason the
  sky can be driven from one request instead of an hourly index lookup.
- **`timezone=auto` returns LOCAL WALL-CLOCK strings with no offset and no `Z`** (`"2026-08-09T22:15"`),
  plus `utc_offset_seconds: 10800` and `timezone: "Europe/Kyiv"`. So `new Date(d.current.time)` parses in
  the DEVICE's zone, not the location's — never do it. Slice the string, or build the instant from
  `Date.parse(t + "Z") - utc_offset_seconds * 1000`.
- **`current.time` is quarter-hourly (`interval: 900`) and `hourly.time[i]` is on the hour**, so
  `hourly.time.indexOf(current.time)` never matches. Match on the 13-char prefix (`"…T22"` + `":00"`).
- **`daily.weather_code[d]` is the most SEVERE code of the day**, not the midday one — a day whose only
  rain is a 03:00 shower is labelled rain. Accepted (that is the useful reading for a forecast row).
- **Errors are HTTP 400 with `{error: true, reason: "<internal decoder message>"}`.** `reason` is a Swift
  decoder string, not user-facing text — never surface or translate it.
- **Free tier: 600/min, 5 000/hour, 10 000/day, non-commercial, CC BY 4.0 attribution.** No `RateLimit-*`
  or `Retry-After` headers on 200 or on 400 (checked the captured header block). Attribution already ships
  as the profile `source` row.

**UNVERIFIED / not needed:** whether a real 429 carries `Retry-After` (I did not exhaust the quota).

## 2. Where the location comes from

**VERIFIED by reading the farm, not by asking:** `apps/air/view.js:112` already reverse-geocodes with
`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=…&longitude=…&localityLanguage=<loc>` —
keyless, CORS-open, and it returns `Київ` for `localityLanguage=uk`. Its policy allows exactly one use: the
CALLING DEVICE's freshly obtained coordinates, which is what `geo` hands us. So weather reuses the pattern
already in the farm instead of introducing a second geocoder.

Ruled out, with reasons:

- **Open-Meteo's geocoder cannot reverse.** `?name=50.4501,30.5234` returns `{"generationtime_ms":…}` with
  no `results` — confirmed live. It is forward-only, which is exactly what `packages/runtime/places.js`
  already wraps, and its language list has no `uk` (hence that file's transliteration).
- **Photon** rejects `lang=uk` outright (`400`, "Supported are: default, de, en, fr") — fails the farm's
  en+uk rule on its own.
- **Nominatim** does return `Київ`/`Kyiv` correctly, but its policy is 1 req/s per application with a
  required identifying User-Agent — a header a browser will not let us set. Fallback only.

Fallback chain the adapter implements: fresh fix → last fix (persisted) → Kyiv.

## 3. The sky — why it is NOT a blue sky

I pulled the 21st catalogue for the reference idiom (`get_inspiration`, then the previews themselves).
**"Cloudscape"** is the canonical answer everyone builds: saturated cerulean, white cumulus, full-bleed.
Looked at it — and it is the wrong answer here, for a reason worth writing down: this farm's material is
neutral greyscale (`base-100 #2A2A2E` / `#EEEEF1`) and colour is reserved for MEANING. A photographic blue
sky would be the single most saturated object in the farm and would make every other app look like it
belongs to a different product.

The one preview that read as shippable at this bar was the storm hero: near-black, monochrome, sparse fine
streaks on a slight shear. Structure and motion carry the weather; hue does not. That is the register.

So the stage is **the base colour, LIT** — the same idea as the enclosure wash in `theme.css`, driven by
real numbers:

| channel | source | what it does |
|---|---|---|
| `vary.x` sun altitude | computed from lat/lng/now (SunCalc via `/_rt/astro.js`) | height + strength of the light, day↔night |
| `vary.y` cloud | `current.cloud_cover / 100` | coverage and opacity of the fbm deck |
| `vary.z` wet | `current.precipitation` (mm/h) + probability | streak density |
| `vary.w` wind | `current.wind_speed_10m` | drift speed of the deck, shear of the streaks |
| `ink.x` snow | WMO code 71-77, 85-86 | streaks become slow drifting flakes |
| `ink.y` haze | `current.visibility` | veil that flattens contrast |
| `ink.z` storm | WMO code 95-99 | rare lightning |
| `ink.w` azimuth | sun azimuth | horizontal position of the light |
| `seed` | moon phase | the night light's shape |
| `env.x` | **the runtime**, not the app | light-theme amount, so the sky inverts with the theme |

**The luminance contract.** The hero type sits directly on the stage (no card — a card would hide the very
thing that makes this app worth opening). Legibility therefore cannot be left to taste: the shader clamps
its output to the base colour ±0.075 in linear luminance across the top 55% of the frame, and fades to the
flat base by 75% down, where the panels start. Contrast for `base-content` is then never worse than it is
on the flat page. Axe cannot see any of this — it reads the DOM background — so the clamp IS the gate, and
it is pinned in the shader with a comment.

`prefers-reduced-motion` is already handled one level up: `hero.js` freezes the clock at t=2s and the scene
still renders.

## 4. What had to change in the runtime (and why it is not app-local)

- **`hero.js` published `vary` as a hardcoded `[0,0,0,0]`** — the offline tool could sweep those four
  channels but the shipped renderer could not set them at all, so no stage could ever be data-driven. Now
  `vary` takes a value or a function, exactly like `ink`.
- **The uniform block grew 48 → 64 bytes** for `env: vec4f`, which the RUNTIME fills (currently
  `env.x` = light-theme amount, animated over 250ms so a theme toggle cross-fades). An app must not derive
  the theme itself: the view does not re-render on a theme toggle, and every stage would re-implement it.
  Existing 48-byte shader structs keep binding against the larger buffer — verified by rendering
  `apps/iching/hero.wgsl` and `apps/tarot/hero.wgsl` through `tools/art/hero.mjs` after the change.
- **`dashboard` gained `stage` and `strip.curve`** so this stays a declarative dashboard. The alternative
  was a `tool` tab, which is how `arc` ended up re-implementing the card list, the star and the skeleton.

## 5. Pitfalls hit while doing this

- The old adapter fetched LIVE in the gate — no fixture at all, against the farm's own rule. A transient
  Open-Meteo blip would have redded a run for an unrelated commit. Fixed here.
- `apps/weather` has no `spec.accent`, but `brand.json` already carries `fg: #38bdf8`. The mirror was
  simply never written; the app therefore rendered with the default tint while its icon was blue.
