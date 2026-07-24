# Transits — AI interpretation (research note)

Goal: add a **grounded** AI reading of the current sky, mirroring the tarot `SynthSheet` pattern, but
astrologically real — the model must interpret ONLY the structured facts we compute, inventing nothing.

## Why the tarot `summarize` mode could NOT be reused verbatim
The VPS `/feed/ai` `summarize` system prompt is literally *"You are an experienced tarot reader… below is a
spread…"*. Feeding transit facts to it frames planets as tarot cards → fabrication. So a **new server mode
`astro`** was added with an *astrologer* system prompt (en+uk) that reads only the supplied positions +
aspects + retrogrades, in traditional-astrology terms, 3–4 sentences, "invent nothing".

## The missing interpretive core: ASPECTS
The app showed positions only. In astrology, "transits" = the **angular relationships (aspects)** between
planets. Without them an AI reading is generic sun-sign fluff. So aspects are computed in `/_rt/astro.js`
(`aspects()`, unit-tested) and both **surfaced in the UI** and **fed to the model**.

### Ptolemaic aspects + traditional orbs (the recipe)
| aspect | exact | base orb | nature |
|---|---|---|---|
| conjunction | 0° | 8° | neutral (blends the two) |
| sextile | 60° | 4° | soft (opportunity) |
| square | 90° | 6° | hard (tension/friction) |
| trine | 120° | 6° | soft (ease/flow) |
| opposition | 180° | 8° | hard (polarity/awareness) |

- **Luminary bonus**: +2° orb when the Sun or Moon is one of the pair (they radiate a wider influence).
- **Angular separation** is the short arc: `min(|a−b|, 360−|a−b|)` → 0..180. Match if `|sep − exact| ≤ orb`.
- **Orb** (how far from exact) = strength: tighter = stronger → sort tightest-first.
- **Applying vs separating**: compare the orb one day earlier (we already compute the previous-day chart for
  retrograde). Orb shrinking → **applying** (building, stronger); growing → **separating** (fading). Applying
  aspects carry the day's theme, so the reading leans on them.
- Bands don't overlap, so the first matching aspect per pair is the only one (`break`).

### Colour = meaning on the wheel (chords)
Aspect chords are drawn inside the zodiac ring (SkyDial `overlay`, behind the planet tokens). Encode nature
by **both** hue and stroke so it never relies on colour alone (axe / colour-blind):
- soft (trine/sextile) → success hue, solid hairline
- hard (square/opposition) → warning/error hue, dashed
- conjunction → neutral base-content, dotted
Endpoints at r≈32 (just inside the r=34 planet ring). No glyphs — aspect names are **words** (i18n en+uk),
never unicode astro symbols (preflight `\p{Emoji_Presentation}` risk).

## Structured input block fed to `astro` mode (canonical English, locale-independent → stable cache sig)
```
Transits for 24 Jul 2026.
Positions: Sun in Leo 1°; Moon in Sagittarius 12°; Mercury in Cancer 20° retrograde; …
Aspects: Sun square Saturn (orb 1.2°, applying); Moon trine Venus (orb 3.0°, separating); …
```
Signature (cache key) = `date | key:sign:deg:retro,… | a-b-type,…` rounded to whole degrees → same sky hits
cache; the reading is cached per locale in localStorage (fail-open, offline-friendly), like tarot.

## Reused runtime, unchanged pattern
- `/_rt/ai.js`: new systemic pair `interpret` / `isInterpreted` / `warmInterpret` (ns `astro`, mode `astro`),
  a mirror of `summary`/`warmSummary` — reusable by the horoscope app later.
- Sheet is history-backed (Back closes), skeleton while loading, 12s fail-open + retry, fixed GATE text for
  deterministic CI shots/e2e. Opened on demand (respects the free LLM quota), never per scrub.
