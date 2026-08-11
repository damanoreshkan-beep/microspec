# iching — the ceremony rebuild (2026-08-11)

The ask→cast→answer flow, rebuilt around one full-screen ceremony. Decisions logged here are CLOSED.

## What was actually broken (measured, not guessed)

- `/feed/ai` mode `summarize` **works** (probed with the allowlisted Origin; Gemini answers in uk).
  The client was the problem: under the gate / offline the read sheet had **no fixture** (tarot has
  `GATE_SUMMARY`; iching held a skeleton forever), the reading was never **persisted** (cache-only —
  a cleared localStorage forgets an answer the journal still lists), and the question had **no
  relationship** to the journal (same question → new cast → contradictory answer).

## The flow (owner's spec, 2026-08-11)

1. Tap the question slot → a **full-screen ceremony** (`S.screen === "ask"`, history-backed, Back closes).
2. Submit → journal lookup by normalized question (`trim → collapse spaces → lowercase`, stored as `qk`).
   - **Known question → the SAME entry replays**: same lines, same stored text. The Book does not answer
     one question twice.
   - New question (or empty) → a fresh cast, saved immediately.
3. **Casting animation** (~2.5s): six lines flicker randomly (90ms), then lock **bottom-first**
   (1000 + i·280ms) with a glue effect — the two yin halves slide together into a yang bar (animated SVG
   `x`/`width`, `transition-[x,width]`; a full bar crossfades over the seam). One `navigator.vibrate(6)`
   per lock — a state event, not a tap, so it does not collide with the systemic haptic.
4. **Answer**: hexagram header fades in, the reading **types out** letter by letter (~20ms/char, capped)
   with an sr-only full copy for screen readers. The text is written into the journal entry (`tx[locale]`)
   the moment it lands, so a repeat — even offline — replays it verbatim.
5. **Recast once per day**: the button shows only when `entry.day !== today` (local `YYYY-MM-DD`).
   Recast overwrites the entry in place (new lines, new day, `tx` cleared) — one entry per question.

## Determinism contract

`instant()` = `gate || prefers-reduced-motion` (same idiom as `/_rt/skeleton.js`): no flicker, no
typewriter, no motion entry — final state immediately. Fixed `GATE_READING` (uk+en) mirrors tarot's
`GATE_SUMMARY`. `GATE_ROWS` is the ONE fixture: journal list, question lookup, and the seeded `$last`
all read it, and `g1` carries an old `day` so the e2e can see the recast button appear for a replayed
question and NOT for a fresh one (under the gate every answer text is identical, so presence of
`[data-recast]`/`[data-asked]` is what proves the dedupe branch ran).

## Closed decisions

- **Typewriter stays app-local.** First consumer; promote to `/_rt/skeleton.js` only when a second app
  wants it. (A runtime edit = whole-farm verify + SW manifest churn for every importer.)
- **Ceremony is a full-screen `class="modal"` dialog** (tarot's Ritual precedent) — not a `Sheet`
  (`modal-bottom` is the banned hand-roll; full-screen is not that shape). Opaque `#0b0f14`, fixed dark
  in both themes like the island, because it floats over the always-dark WebGPU field.
- **The AI signature stays `method|lines|question`** — the runtime cache dedupes transport; the journal
  (`tx` per locale) is the durable copy the replay reads first.
- **No quick-cast button on the island.** All casting goes through the ceremony; the question slot is the
  single entry point (a faux-input button, like a search bar that opens a search screen).
