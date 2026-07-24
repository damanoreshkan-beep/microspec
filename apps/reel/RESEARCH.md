# reel — dive navigation, grouped sources, in-tab liked feed (research note)

The recipe the build follows. Numbers/idioms here are the contract; the code points back at this file.

## 1. The dive (swipe a reel → its page becomes the next source)

**Ground truth (owner-verified in production):** pasting a *reel's own page URL* into the source box makes the
VPS extractor return **similar videos from that page** (`feed-core.mjs` `parseVideos` in microspec-edge → nearest-anchor
`item.page`). So the dive target is exactly `item.page` — never `item.video` (a raw mp4 is `not an html page`
and returns `{items:[]}`), never `item.orig`.

Dive is therefore *not* a new capability — it is `openSource(item.page)` plus **navigation state**.

### Frame stack (the "don't lose my place" requirement)
A dive must be reversible **without refetching**: back returns the exact `items` array and the exact slide.
So each dive pushes a **frame** = `{src, items, next, active, eph, owner, loading, err, label}`; back pops it
and restores the atoms wholesale. Scroll is restored as `active × clientHeight` — exact, because every slide
is `h-[100dvh]` under `snap-mandatory` (no measurement needed, no layout race).

Guard: an in-flight *append* (`loadSource(next, true)`) from the previous source must never land in the new
feed → a module `gen` counter invalidates a stale append.

### Back must be systemic, not app-local
The farm invariant is "every dismissable state is history-backed, routed through a runtime atom". A dive
stack is N *sibling* levels, and the runtime's overlay list was strictly one-entry-per-atom, so a stack could
not be expressed. Fix (additive, in the runtime): **`S.stack`** — an array atom whose **length is its history
depth** (`store.overlayDepth`). `index.js` now sums `overlayDepth` per overlay instead of counting booleans,
so Back pops **one** level. Placed **bottom-most** in the overlay order: any sheet/detail/confirm opened on
top closes before a dive level pops. Existing apps never set it → depth 0 → zero behaviour change.

The app never calls `history.*`: pop = `S.stack.set(stack.slice(0,-1))`, and a single `S.stack` listener
restores frames whenever `stack.length < frames.length` — so the swipe, the on-screen back button and the
system Back all take **one** path.

### The drag (feel)
`usePanX` (runtime) already does finger-following with 1:1 tracking to 130px then a 0.35 rubber-band, axis
lock at 6px, and it swallows the click a drag would otherwise fire (so a drag never also likes/pauses).
Reused as-is on the scroller with `touch-pan-y` (browser keeps vertical scroll, we get horizontal).
- drag **left** (`onNext`) → dive (forward/deeper). drag **right** (`onPrev`) → back. iOS convention.
- `threshold: 64` (up from 52) — a full-screen action deserves a firmer commit than a card flick.
- Added `onDrag(dx)` to `usePanX` (optional, additive): lets a caller paint the destination *under* the pane
  as it moves. Here: an underlay revealed at `opacity = min(1, |dx|/110)` showing the destination's identity
  (favicon + `pageLabel`) on the side the drag reveals — right half for the dive, left half for back.
- Commit haptic `vibrate(10)` (a gesture is not a tap → the systemic delegated haptic doesn't cover it).

### Gesture must not be the only way (a11y + gate)
There is no drag helper in the e2e surface (`browser-lib.mjs`: tap/click/back/type/…), and a gesture-only
navigation is inaccessible anyway. Every dive/back is therefore also a **button**: `[data-dive]` (chip on the
slide) and `[data-feed-back]` (in the source island) — which is what the gate exercises.

## 2. Source titles + domain grouping

`packages/runtime/sitelabel.js` (pure, unit-tested — no network, no page fetch):
- `registrableDomain(host)` — public-suffix heuristic with a small multi-label set (`co.uk`, `com.ua`, …) so
  `commons.wikimedia.org` and `wikimedia.org` group together as **one** domain.
- `siteName(url)` → `Mixkit`, `Wikimedia`, `Dareful` (first label of the registrable domain, capitalised).
- `pageLabel(url)` → the readable page title **derived from the URL**, in priority order:
  1. a resolvable search term (`…/search?q=cats` → `cats`) via `urlquery.resolveSearch`;
  2. else the last meaningful path segment, skipping numeric/id/noise segments (`page`, `index`, `2`, …),
     stripping a file extension, a `Category:`/`Tag:` prefix (Wikimedia) and a leading numeric id;
  3. else `siteName`.
  Then `-_+` → spaces, collapse, sentence-case, cap **42 chars** on a word boundary + `…`.
  `…/free-stock-video/space/` → `Space`; `…/wiki/Category:Underwater_videos` → `Underwater videos`.
- Deriving beats fetching: no `<title>` round-trip per row, works offline, deterministic in the gate.

**Layout.** Sources are grouped into **domain cards** (`groupByDomain`), because a domain now accumulates
pages as you dive+subscribe. A group of **1** renders as a single compact row (a header + one child would be
a duplicated line); **2+** renders a header (logo · site name · domain · count · open-site) over hairline-
separated page rows carrying only `pageLabel` + a state dot (primary = currently playing). The raw URL is
gone from the row — that is what "everything fits" means.

## 3. Subscribe from the reel
Diving lands on a source you may not have. The island (top, glass, only when `depth > 0` **or** the current
source is unsubscribed) carries: back chevron · favicon · `pageLabel` · host · **`+`**. Subscribing makes the
`+` disappear (state is the feedback — no toast, no caption).

## 4. Liked tab opens the feed *in place*
`playAt` pushes a frame labelled "Liked" and sets `$owner = "liked"`; the liked view renders the **same**
`FeedSurface` instead of the grid. Back (system or button) pops the frame → `$owner` returns to `"reel"` →
the grid is back, and the source feed underneath is restored untouched. Diving *inside* the liked feed keeps
`$owner === "liked"`, so the drill-down stays in the Liked tab. One engine, one stack, no tab switch.

## 5. Gate fixtures
The gate never touches the network, so `loadSource` under `gate` serves a deterministic batch **per URL**:
`MOCK` (6 seeded → 3 after dedupe/black/flat filters) for the default source, `MOCK_DEEP` (2, titles
`Deeper …`) for anything else — which is what makes dive/back provable in CI. `$likes` is seeded with 2
records under the gate so the Liked tab is measured **populated** (and the in-tab feed is testable without a
double-tap, which the e2e surface cannot dispatch inside the 260 ms `useTap` window).
