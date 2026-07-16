# What the gates cannot see

microspec claims an AI can't merge a broken app here. That claim is [measured](../README.md#measured-not-claimed),
and it is real — but it has an edge, and this file is where the edge is written down.

**The pattern, in one line:** *a gate verifies that a mechanism exists; it does not ask whether the mechanism
achieves its purpose.*

Every entry below is a real defect that shipped to production **with every gate green**. None was found by
CI. All but one were found by a human opening the app on a phone.

---

## The shape of it

| The gate asks | It does not ask |
|---|---|
| Does a manifest exist? | Can a user actually install this? |
| Does text render? | Is it in the reader's language? |
| Does each state pass contrast? | Can you tell the states apart? |
| Does the adapter return items? | Are they the right items? |
| Did the app call `put()`? | Is the data there when you come back? |
| Does the card have an href? | Should a tap leave the app at all? |

Both columns are checkable. We only ever built the left one.

---

## The catalogue

Each of these is now closed unless marked **OPEN**.

### 1. A manifest is not installability
`books` shipped with a valid `manifest.json`, a service worker, HTTPS, and a rounded-square placeholder for
an icon. It could not be installed by anyone. Chrome requires a real PNG ≥192px; an SVG-only manifest is
not installable. `authorless.mjs` never wrote `brand.svg`, `scaffold.mjs` silently substituted a placeholder
`<rect>`, and `build.mjs` generated icons only `if (brand.svg exists)` — no file, no PNGs, no error.
**Closed:** a missing `brand.svg` is now fatal at build (`deploy/build.mjs`), verified in both directions.

### 2. Text rendering is not localisation
`dou` served English job descriptions into a Ukrainian UI for months. The translation engine had been there
all along and five apps used it; `dou` simply never declared `spec.translate`, and nothing asked.
**Closed:** a feed `card.body` must be in `spec.translate` or the app must declare `spec.localized`
(both validators, kept in lockstep).

### 3. Per-element contrast is not distinguishability
The dock's active tab was invisible for the entire life of the farm. This theme's axiom is "ink is the
brand" — `--color-primary` and `--color-base-content` are the **same hex** — so `text-primary` (active) vs
`text-base-content/80` (inactive) resolves to 100% vs 80% of one colour:

```
active text vs island     16.6:1  ✓
inactive text vs island   10.6:1  ✓
active vs INACTIVE         1.56:1 ✗   (3:1 is the floor for telling two UI states apart)
```

Both states pass axe. The difference between them — the entire point — is half the perceptual threshold.
axe checks text against its **background**, never one state against **another**.
**Closed:** the active tab is a filled ink pill (16.6:1 against the island). The signal is a shape, not a
luminance step on a 9px glyph.

### 4. A 200 is not an answer
`nearby` never worked outside Switzerland. `overpass.osm.ch` sat first in its mirror list because a comment
called it *"fastest/most reliable"* — which it is, precisely because it is a **Switzerland-only extract**
holding almost no data. Outside CH it answers every query with a perfectly valid `200` and `elements: []`,
and the fallback chain took that as the truth. Measured: Zurich 50 · Geneva 50 · Berlin 0 · Kyiv 0 · London 0.
**Closed** (the app was later removed for unrelated reasons): a `200` with zero elements is *unconfirmed*,
not *empty* — the two are indistinguishable from a single source. Ask the next one.

### 5. The gate's environment is not the user's
- `iptv` rendered a grey screen in production while CI was green: `video.js` imported siblings with
  absolute `/_rt/` paths, which 404 at the `/microspec/` subpath. **The gate serves from localhost root**,
  where `/_rt/` resolves fine. *Closed: a CI guard forbids absolute `/_rt/` in runtime files.*
- `h-[52vh]` looked correct everywhere in CI. `vh` is defined as the **large** viewport — the height the
  page would have if the address bar were already retracted — so the canvas overflows on a real phone.
  **Headless Chromium has no address bar to retract.** *Closed: `svh`, and the farm now contains no vh/vw.*
- Server-side probes are not the app. `overpass-api.de` returns `406` to curl and `200` to a browser: it
  requires a `User-Agent` **and** a `Referer`, both of which a browser always sends. Concluding "blocked"
  from a shell nearly cost the app its data source.

### 6. Derived values are not the value
`ruler` measured distance, drew the polyline, reported ±accuracy — and never once told you **where you are**.
Every gate passed because they all checked the *derived* numbers and never the position itself.
**Closed:** coordinates are shown, and an e2e asserts them.

### 7. A test can defend the bug
Four e2e cases asserted `.card` **has** an `href` — i.e. they encoded "a tap throws the user out of the app"
as the expected behaviour. They would have **failed the fix and passed the defect**. One of them,
`/jobs\\.dou\\.ua/`, was a valid regex that can never match — a test incapable of passing.
**Closed:** rewritten to assert the drill-down; the contract now requires `spec.detail` for any card `href`.

### 8. "Saved" and "silently dropped" look identical
The e2e harness had no way to reload, so no gate could distinguish persistence from data loss. `rave`'s
saved patterns had never been verified across a session.
**Closed:** `h.reload()` in `packages/gates/browser-lib.mjs`.

### 9. The runtime misspelled Ukrainian
The dock rendered "ЛІНІИКА" and "НАЙБЛИЖЧІ" as "НАИБЛИЖЧІ". Not a typo — the i18n files are correct.
`theme.css` uppercases dock labels while the class carried `leading-none` + `truncate` (`overflow: hidden`),
so anything reaching above cap height was clipped and **Й lost its breve**. No gate reads rendered text.
Any language with diacritics above the caps (Й, Ї, Ё, Ā, Ő) was affected.
**Closed:** `leading-[1.4]`.

### 10. OPEN — some things no gate can reach
- **Real upstreams.** `btcflow`'s e2e runs against a *synthetic* stream because a raw WebSocket from a CI IP
  is nondeterministic. A green `verify (btcflow)` says nothing about whether the real feed works.
- **Device capabilities.** AR was removed partly for this: headless Chromium has no XR device, so WebXR
  shipped **untested by construction** — the one feature in the farm with no floor under it.
- **The subpath, still.** The guard forbids absolute `/_rt/` imports, but `verify` still serves from the
  root. The *class* of path bugs remains invisible; only that one instance is fenced off. Serving the gate
  under `/microspec/` would close it.

---

## What follows from this

1. **A green gate is a floor, not a verdict.** It proves no *known* class of defect is present. It cannot
   prove the app does what it promises.
2. **Look at the live screen, on the real host.** Not localhost, not the CI shot — the deployed URL. Five of
   the entries above were found in seconds that way, after CI had been green for weeks.
3. **Read the pixels, not your intent.** The dock's active tab was reviewed *by the author* and described as
   "sitting in a soft primary well, with highlighted text" — from the code, not the image. Reviewing your own
   work is where expectation fills in what isn't there.
4. **When you add a gate, ask what it still cannot see** — and write it here. A gate that goes green by
   matching nothing is worse than no gate: it manufactures confidence.
5. **Prefer contracts to conventions.** Every "the mechanism existed, nothing required it" entry above
   (translate, drill-down, icons) was closed by making the contract refuse the bad state — not by fixing the
   app. The apps were symptoms.
