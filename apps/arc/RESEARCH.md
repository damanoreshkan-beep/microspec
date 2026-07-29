# arc — a book's plot as three acts

**What it is.** Search a book by title, get its story retold as three acts — Beginning, Middle, End — at a
length you choose. The retelling is AI-written but **grounded** in the real encyclopaedic plot text, never
recalled from the model's own memory. The End is locked until you tap it.

Every number below was measured by me against the primary source. Claims I did not verify are marked
UNVERIFIED and the build does not depend on them.

---

## 1. The source: Wikipedia (MediaWiki Action API) + Wikidata

Both keyless, both return `Access-Control-Allow-Origin: *`, so the app talks to them directly from the
static origin — no proxy, no key, nothing on our backend.

Rejected, each for a measured reason:

| Source | Why not |
|---|---|
| Google Books | keyless daily quota is **0** → HTTP 429; and it echoes the request Origin rather than `*` |
| Open Library | catalogue is good, prose is not: Stoner 1000 chars, Тигролови 494, Dune none. Kept ONLY as a cover fallback |
| WDQS SPARQL | real book-only filter, but `Stoner John Williams` returns 0 rows — the text search is not dependable |
| REST `/mobile-sections`, `/page/segments` | HTTP 403, no CORS |
| REST `/page/summary` | 390 chars for Dune — an intro, not a plot |
| Wikipedia alone | its search is not book-only: `Dune` returns the landform, the film, the franchise and a disambiguation page |

### The call chain — 4 requests, and the first 2 already render the list

```
1. en.wikipedia /w/api.php?action=query&generator=search&gsrsearch=<q>
     &prop=pageprops|pageimages&ppprop=wikibase_item&piprop=thumbnail   → candidates + QID + thumbnail
2. wikidata     /w/api.php?action=wbgetentities&ids=<all 10 QIDs>       → P31 type, P50 author, P577 year
   ── only for the book actually opened ──
3. en.wikipedia action=parse&prop=sections                              → resolve the plot section BY NAME
4. en.wikipedia action=parse&section=N&prop=text                        → the plot HTML
```

Step 2 is **one batched call for all ten results**, not ten calls. Measured median for the list: ~950 ms.

### Book-only filtering: an allowlist derived from a census, not guessed

`haswbstatement:` does **not** work on en.wikipedia (measured: `totalhits: 0` plus a spelling suggestion —
the keyword is not parsed). It works on wikidata.org only. `incategory:Novels` returns 0; the real
categories are far too specific (`American science fiction novels`). So typing comes from a QID roundtrip.

I ran a `P31` census over **39 known books** (`scratchpad/p31.mjs`):

```
Q7725634  literary work   34/39   (87%)
Q47461344 written work     3      ← non-fiction: Sapiens, Educated, A Room of One's Own
Q1667921  novel series     2      ← The Hunger Games is typed as the series
Q13593966 literary trilogy 2
Q49100005 banned book      1      (co-occurs, never alone)
```

**A bare `Q7725634` allowlist silently drops every work of non-fiction.** Codex flagged this only as a
guess; the census makes it a fact. The allowlist is therefore all of the above, plus a secondary signal:
`P50` (author) is present on **38/39** and `P577` (date) on **38/39**, while films carry P57 not P50, and
humans and disambiguation pages carry neither.

The one miss in 39 is `Lessons in Chemistry`, whose enwiki title resolves to a **disambiguation page** —
a title-resolution problem, not a typing one.

**Covers are unreliable:** Wikidata `P18` is present on only **25/39 (64%)**, and the search thumbnail is
spottier still (Dune has one, Stoner and Тигролови do not). So a deterministic generated tile is required,
not optional — `apps/wiki` already does this and the runtime has `letterTile`.

### Plot extraction

Section headings actually observed across 28 sampled articles: `Plot` (10), `Plot summary` (9),
`Synopsis` (2), plus long-tail (`Storylines`, `Features of plotline`). So the section is resolved **by
name against an allowlist**, never by a fixed number — and the number cannot be cached anyway:

> **The section index is not stable.** On `Dune (novel)` the Plot section moved from index 2 to index 3
> across two revisions **4 minutes 24 seconds apart**. `section=Plot` is rejected (`invalidsection`).
> Cache the index only together with the `revid`.

Coverage: **23/28** sampled books have a plot section, and all 23 exceed 1500 clean characters
(Dune 8151, Crime and Punishment 16448, The Fault in Our Stars 2900).

Cleaning pitfalls, all observed: `<sup>` citation markers become `[1]` in `textContent` and must be
removed **before** reading it; `<style>` blobs appear inside section HTML; the `[edit]` affordance is
part of the heading; `action=parse&section=N` **includes child subsections**.

### Ground in English, render in the reader's language

en coverage is 82% against uk's 64%, and uk has an actively dangerous failure: `Там, де співають раки`
resolves to **the film**, whose 3253-character plot is a summary of the wrong work. `Кайдашева сім'я`
resolves to the miniseries. So the grounding text is always the English article; the AI writes the acts
in the reader's locale. Source language and interface language are separate concerns.

### Etiquette

Browsers cannot set `User-Agent` (forbidden header), so we send **`Api-User-Agent`**, which is what the
Wikimedia policy asks browser apps for. 2026 gateway limits: 200 req/min for a browser client, max 3
concurrent, honour `Retry-After`. Nothing this app does approaches that.

---

## 2. The narrative model — why three acts, cut where they are cut

The acts are divided by **dramatic function**, not by cutting the plot text into three equal pieces. The
standard beat positions:

| Beat | Position | Act boundary |
|---|---|---|
| inciting incident | 10–15% | inside act I |
| **first plot point / point of no return** | **20–25%** | **end of act I** |
| midpoint reversal — the goal changes meaning | 50% | middle of act II |
| **"all is lost" / third plot point** | **75%** | **end of act II** |
| climax | ~88% | inside act III |
| resolution | 100% | end |

Act I is 20–25% of a novel, act II ~50%, act III 25–30%. Freytag's five-part pyramid was considered and
rejected: it puts the climax in the *middle*, which is a model of tragedy, not the shape most novels have.

**The craft split, and why it makes the spoiler lock coherent.** A blurb and a synopsis are different
things: a blurb establishes situation → problem → obstacle → **stakes** and deliberately withholds the
ending; a synopsis tells everything. So acts [1] and [2] are written as jacket copy — which is exactly
what makes someone want to read the book — and act [3] is written as a synopsis. That is *why* the app can
keep act [3] hidden and still show a complete, honest, non-spoiling two-thirds: the first two acts were
never supposed to contain the ending anyway.

---

## 3. The AI call — measured behaviour, and the two traps

`POST /feed/ai` with `mode: "acts"` and `level: 1|2|3`. **The level joins the cache key** — otherwise the
first level a book is opened at would be served for all three.

Output contract: three blocks, each starting with a bare `[1]` / `[2]` / `[3]` marker on its own line.
Parsing and validation live in `packages/runtime/acts.js`, unit-tested — never in the app.

### Trap 1: the final act is a dumping ground

Asked for *"exactly 9 sentences per act"*, Gemini returned **7 + 7 + 21 sentences** (1105 / 1000 / 2498
chars) and ran into the token ceiling **mid-word**. The last act has no downstream pressure, so a
chronological source drains into it.

Fixed by stating the budget **twice** (sentences *and* characters) and requiring the acts to be balanced
explicitly. After the fix: **12 / 12 / 12 sentences**, 1583 / 1522 / 1323 chars, no truncation.

### Trap 2: the stated budget is not the delivered budget

Gemini over-delivers by a consistent **~1.6x**. The budgets in the prompt are therefore the targets
*divided by the measured factor*. Sentence counts are **not** scaled the same way — 4 is the owner's hard
floor and has to stay stated as 4.

Measured after calibration (Dune, uk), chars per act and total:

| level | act 1 | act 2 | act 3 | total | sentences |
|---|---|---|---|---|---|
| 1 "Стисло" | 649 | 506 | 567 | **1722** | 4 / 4 / 5 |
| 2 "Звичайно" | 764 | 739 | 740 | **2243** | 5 / 6 / 8 |
| 3 "Детально" | 1110 | 1107 | 1678 | **3895** | 8 / 8 / 16 |

The ≥4-sentence floor holds at every level. Act 3 still drifts at level 3 — see OPEN below.

### Trap 3: two diagnostics that lied (both fixed in `microspec-edge`)

- `readBody` capped bodies at **8000 chars** and threw, and every caller reports that as `"bad json"`. An
  8137-char Dune plot was rejected as malformed. The cap is now 32 000 on the AI route and the error is a
  named `TooLarge` that says the actual size. The `slice(0, 24000)` I had added was unreachable until this
  was fixed — a limit behind a limit.
- `finish_reason: "length"` was being discarded, so a reply cut mid-word looked identical to a short one.
  It is now returned as `truncated: true`, and a truncated reply is **not cached**.

**Latency: 4.9 s / 5.8 s / 8.8 s** by level (cold, `gemini-2.5-flash`). A skeleton is mandatory — never a
spinner — and results cache permanently in `localStorage` per (book, level, locale).

---

## 4. How the requirement is enforced, not just intended

"Maximum three phone screens" is the owner's requirement, and a requirement nobody measures drifts. So it
is a **gate**, in `e2e.spec.mjs`, measured off the live document in the only real browser this project has:

```js
const screens = (await h.prop("html", "scrollHeight")) / (await h.prop("html", "clientHeight"));
h.expect(screens <= 3.05, `переказ займає ${screens.toFixed(2)} екрана …`);
```

It runs against the **fixture**, which is a real captured level-3 reply — the longest state the app can
produce — so the bound is on the worst case rather than a typical one. The failure message carries the
actual ratio and both raw pixel numbers, so one CI round returns the number to calibrate with rather than
a bare pass/fail. **If it fails, the fix is `ACT_BUDGET` in the edge prompt, never a smaller font.**

The ≥4-sentence floor is gated the same way, per act, including the revealed ending.

## OPEN / UNVERIFIED — the build must not lean on these
- Act 3 at level 3 drifts to ~2x its siblings (16 sentences vs 8). Balanced at levels 1–2. Revisit only
  after the render measurement, so the fix is calibrated against a real number.
- uk plot coverage (64%) was measured by Codex and **not re-verified by me**; it does not matter, because
  grounding is always English.
- Cover fallback quality is unjudged — the eye has not seen a populated screen yet.
