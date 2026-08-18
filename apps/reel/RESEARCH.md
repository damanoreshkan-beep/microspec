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

## 2b. Naming the page you dived INTO (the "View video" defect)

Deriving a title from the URL (§2) is right for a *list* page and useless for a *video* page — which is
exactly what a dive lands on. Measured shapes: `/view_video.php?viewkey=…` → **"View video"**,
`/video81234567/` → "Video81234567", `/12345678` → the site name. The island, the dive chip, the drag-reveal
and the saved subscription all wore one of those.

Three producers, and none of them is right on its own:

| producer | good at | useless at |
|---|---|---|
| `pageLabel(url)` — the URL | category/tag/search pages (`/space/` → "Space"), offline, free | video pages: their path is a shape |
| the page's own `<title>`/`og:title` (new: `/feed/videos` returns `title`) | video pages | front pages — an SEO sentence ("Free Stock Video & Footage \| No Watermark") |
| the clip you dived FROM (`item.title`) | instant, no fetch, exactly the destination's name | tube grids, where extraction often only has the humanised filename ("preview 1080p") |

So the runtime got **one** resolver, `sitelabel.sourceTitle(url, {pageTitle, hint})`, and the app has no
titling logic of its own:

1. `pageLabelInfo(url)` now reports **`weak`** as well as `label`. Weak = the path exists and still named
   nothing: every token is a medium-word (`view`, `video`, `watch`, `preview`, `clip`…), a bare number, or a
   letters+digits blob (`abC123`, `ph5f2a1b`). A **bare root is NOT weak** — a front page really is its site,
   and that is what keeps the SEO sentence off the island.
2. Not weak → the URL wins. Nothing overrules it.
3. Weak → `cleanPageTitle(pageTitle, url)`, which strips only a **leading/trailing** chunk that names the
   site ("… - TUBE.EXAMPLE", "Mixkit · …") — never an inner one, so "A day - and a night - in Kyiv" survives —
   and returns `""` if what's left is itself weak.
4. Then the hint (same cleaning, so a filename-title is rejected too), then the weak label, so the island
   never goes blank or shows a placeholder while the new feed loads.

The hint is what makes the dive feel instant: `diveTo(S, url, item.title)` names the destination *before* the
fetch, and the page's own title replaces it when `/videos` answers. The title is part of the frame snapshot,
so Back restores the name with the list.

Server side (`microspec-edge`, `core.js`): `pageTitle(html)` = og:title → twitter:title → `<title>`, returned
**raw** — stripping site chrome needs the site's name, and that judgement belongs in the unit-tested runtime,
not in the extractor.

Verified against the private repo's saved page fixtures; the real hosts/titles live in a **gitignored**
`packages/runtime/sitelabel.local_test.js`, and the committed suite carries the same shapes on neutral hosts.

## 2c. The same name on every screen — decode, then room (the sources-list defect)

The island was right and the sources list was wrong about the *same page*, in three separate ways. All three
were measured browser-free against the shipped code before anything was changed:

| symptom in the sources list | cause | measurement |
|---|---|---|
| `Big%20Buck%20Bunny`, `Rock &amp; Roll` | a page name arrives as **machine text** — a path is percent-encoded, a scraped `<title>` still carries entities. The extractor decodes one short named list (`&amp;`, `&quot;`, `&#39;`…) and nothing numeric; nothing decoded the URL path except one bare `decodeURIComponent` | `sourceTitle("…/clip/%2520double%2520encoded/")` → `"%20double%20encoded"` |
| a row **vanished**, or the whole tab went blank | `decodeURIComponent` throws `URIError` for the **entire string** over one bad escape — and a literal `%` in a path is a bad escape | `sourceTitle("https://tube.example/a-100%-sure-thing/")` → *throws* |
| the row's name ≠ the island's name | a subscription's name is **frozen** at subscribe time. Subscribe from the add-URL sheet and the row keeps a guess made from the URL alone, forever — while the island, handed the page's own `<title>` a second later, shows the real name | `subscribe({name: sourceTitle(url)})` vs `$srcTitle` after `/videos` answers |
| a name ending in `…` with half a line spare | the caps are the **producers'** (42 from a URL, 64 from a page title) and no caller could state its own room | `sourceTitle(vid, {pageTitle: <88 chars>})` → 39 chars + `…` |

Fixes, in the layer each belongs to:

1. **`sitelabel.humanText(raw)`** — the one decoder, applied where text *enters* a label (never at render, which
   is how two screens disagree). Percent-decode that never throws: try the whole string, and on `URIError` fall
   back to decoding each **run** of valid escapes on its own (runs, because a multi-byte character is several
   `%XX` together), so a malformed escape costs only itself. Twice at most — `%2520` → `%20` → `" "` — and the
   second pass only if the first left something encoded. Then entities: a named table plus **generic numeric,
   decimal and hex** (that is where the extractor's list ran out), an unknown entity left as it came. Then
   control characters, zero-widths, whitespace collapse.
   Applied in `prettify` (every URL-derived label), per **path segment** after the split (decoding the whole
   path first would let `%2F` invent a separator), and at the top of `cleanPageTitle`.
2. **`renameSub(url, title)`** — the frozen name is corrected the moment the page answers. `setSrcTitle` is the
   single place a source's name is decided: it writes the atom the island reads *and* the subscription row,
   from one string. Costs one IndexedDB write, no round-trip, since a source resolves its title on every load.
3. **`sourceTitle(url, {…, max})`** — room is the **caller's** to state, and overrides both producers with the
   same number so the two truncations cannot disagree. Omitted, each keeps the cap it always had.
4. **The row wraps.** `ROW_MAX = 120` (~2½ lines at 384 px) and no `truncate`: a list row is the one surface with
   room for a whole name, where the island is a chip beside four controls and has to cut. `break-words` only for
   the pathological unbroken token, whose alternative is a horizontal overflow.

Gate: `GATE_TITLES` seeds the mock page title as machine text (`"Big%20Buck%20Bunny in 4K &amp; Friends — Mixkit"`),
so a real browser proves the decode on the path a title actually travels; `GATE_SUBS` seeds two subscriptions,
because everything above "Discover" — the one row shape whose name comes from the *saved title* — had only ever
been measured empty. The e2e compares the row to the island **string for string** (a substring match would have
passed throughout the defect) and then measures `scrollWidth ≤ clientWidth`: `innerText` is identical under
`truncate`, so only geometry can say the name is shown in full.

## 3. Subscribe from the reel
Diving lands on a source you may not have. The island (top, glass, only when `depth > 0` **or** the current
source is unsubscribed) carries: back chevron · favicon · **`sourceTitle`** (§2b) · host · **`+`**.
Subscribing makes the `+` disappear (state is the feedback — no toast, no caption) and **freezes that title**
into the record, so the Sources tab lists the page by the name it had when you saved it.

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

## 6. Playback continuity — why the swipe blinked, and what the platform actually guarantees

**The symptom (owner, 2026-07-30):** a visible flash on every swipe.

**The cause is structural, not cosmetic.** `Slide` mounted `VideoLayer` only when the slide was `active`, so a
swipe *destroyed* one `<video>` and *built* another: new element → new connection → wait for `loadeddata` →
first frame. Between the old element leaving and the new one having a pixel there is genuinely nothing to
display. No styling closes that gap; only removing the teardown does.

**The fix:** a window of `PRELOAD = 1` slides either side keeps a live element, so the next clip has been
buffering while you watched the current one. Attach and play are separate effects — the element is built once
per clip URL and never rebuilt for a change of `active`, which is the entire point.

### What the specs guarantee (researched before building; Codex read, claims re-checked here)

- **`preload` is a HINT, not an instruction.** WHATWG states a UA may ignore the value entirely on user
  preference or connectivity, and may suspend the download at any time
  ([spec](https://html.spec.whatwg.org/multipage/media.html#attr-media-preload)). Chrome's own guidance says
  `auto` is downgraded to `metadata` on cellular and to `none` under Data Saver
  ([web.dev](https://web.dev/articles/fast-playback-with-preload#video_preload_attribute) — note this article
  is old; treat it as evidence the downgrade EXISTS, not as today's exact rule).
  **Therefore `preload="auto"` alone cannot be the mechanism** — on a phone, the one device this is for, it is
  the case most likely to be downgraded. Metadata is not a picture.
- **So the first frame is forced, not requested.** A muted `play()` needs no gesture
  ([WebKit](https://webkit.org/blog/6784/new-video-policies-for-ios/)); a neighbour takes one and gives it
  straight back, then rewinds. That decodes frame 0 — the thing actually needed — regardless of how the hint
  was treated. An interrupted `play()` rejects; that is expected and swallowed.
- **A paused element does show its frame once it has one.** After `loadeddata` (`readyState ≥ 2 =
  HAVE_CURRENT_DATA`) the element renders the frame at the current position; before that it is transparent
  black unless a `poster` is set ([rendering](https://html.spec.whatwg.org/multipage/media.html#the-video-element),
  [ready states](https://html.spec.whatwg.org/multipage/media.html#ready-states)). Hence `poster` on the
  element itself. Caveat, verified: the show-poster flag is cleared by the play() steps, so `poster` covers
  the *load*, not the moment of starting.

### What is UNKNOWN, and what that decided

- **There is no documented cap on concurrent media elements.** Android's `getMaxSupportedInstances()` is
  described by Android itself as a *hint* for an upper bound that real resources may undercut
  ([Android](https://developer.android.com/reference/android/media/MediaCodecInfo.CodecCapabilities#getMaxSupportedInstances())),
  and Chrome documents nothing at the web layer. Worse, **nothing specifies what happens at the limit** — not a
  dropped `src`, not a rejected `play()`, not a `MediaError`.
  → A budget whose failure mode is undefined is one to stay well inside: `PRELOAD = 1`, three elements.
- **Two `<video>`s with the same `src` are not guaranteed to share one transfer.** The HTML fetch model is
  per-element and byte ranges are implementation-defined; HTTP caches are permitted but never obliged to reuse
  a response ([RFC 9111 §2](https://www.rfc-editor.org/rfc/rfc9111.html#section-2)).
  → The ambient backdrop copy (a second element on posterless clips) is **active-slide only** and waits for the
  main video to have data. It used to start in parallel, which made the clip you are actually watching arrive
  later. At three slides it would also have meant six decoders.
- **hls.js keeps `backBufferLength: Infinity` by default** — every played second retained for the instance's
  life. Survivable at one player; not at three. `/_rt/video.js` now caps it at 30s. (`maxBufferLength` is a
  minimum *target* hls.js reaches regardless of `maxBufferSize`, so the duration cap is the one that binds.)

**Not verified here, and only the phone can settle it:** whether three elements is comfortably inside the real
decoder budget on the target device, and how much of the next clip actually buffers on a cellular connection.
Both are device/network-dependent and the specs decline to say.

## 6. A site's SESSION — your front page, not the server's (2026-08-18)

**The defect.** The root of a site you are signed in to, pasted as a source, came back as somebody else's front
page: the VPS is *one anonymous visitor for everyone* — a datacenter IP with one shared `cookieJar` per host
(`microspec-edge` `core.js`) — and a front page's "recommended" is the visitor's account and history. Nothing
in the extractor could fix that; the fetch had to carry the client's session. (There is no iframe on the
client any more — the reverse-proxy view was removed for never rendering through the datacenter IP.)

**Why the cookie goes to the VPS and not around it.** A page fetch straight from the PWA is CORS-blocked (and
`Referer` is a forbidden header anyway); a shell-side WebView with its own cookie jar would be APK-only and a
Java change. The one party that already fetches the page is the proxy, and the tunnel already exists.

**The recipe.**
- **Edge:** `/feed/videos` takes `POST {url, cookie}` beside the keyless `GET ?url=`. `pageHeaders(src, cookie)`
  — the client cookie wins outright, the shared jar is *not consulted* (mixing would hand one visitor another's
  tracking cookies) and is *never written*. `cleanCookie` = one header line, CR/LF stripped, 8 KB cap. Core
  forwards method+body to the `open` process (both inside the tunnel and on the plain route). Unit-tested on
  `tube.example`; the real host lives in gitignored `core.local_test.js`.
- **Wire:** reel's fetch is already wrapped by `installSealedFetch`, so the JSON body rides inside the sealed
  envelope — the cookie is never in a query string, an nginx log line, or TLS metadata. Verified end-to-end
  through the public URL: plain POST and sealed POST both return the same 22 clips from the probe gallery.
- **App:** `$sessions` (IndexedDB `reelSessions`, keyed by **registrable domain** so root, dive pages and
  `www.`/`m.` share one), a key button on *my* site cards only (a preset has no account) → `SessionSheet`
  (S.screen `"session"`, history-backed) with one field. `loadSource` posts when a session exists, GETs
  otherwise. Empty save = forget, through the undo snackbar. Nothing site-specific in the public repo: the
  owner pastes the site's `/recommended`-style page as a source themselves.
- **Not covered:** `/feed/stream` (the full-clip ladder) still fetches anonymously — the ladder is not personal.
