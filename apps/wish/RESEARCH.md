# wish — research note

A local-first **wishlist** — multiple named lists (Birthday / Home / Books…), each holding items you
*want*, organised by **desire + cost**, not completion. No backend: lists + items live in the device
IndexedDB (`/_rt/db.js`), fully offline, the data is the user's (export/import JSON).

## Decision log (closed — do not re-litigate)

- **Local-first**, IndexedDB, no backend. Template: `apps/habits` (the one existing CRUD tool app).
- **Multiple named lists** (owner choice). One `wishlists` collection + one `wishes` collection keyed by
  `listId`. A horizontal chip switcher picks the active list; each list keeps its own running total.
- **Manual entry + optional link prefill** (owner choice). Prefill reuses the farm's existing metadata
  path — **Jina Reader** (`r.jina.ai`, CORS-direct, keyless, cached, fail-open) exactly as `enrich.js`
  does — so **no new VPS proxy endpoint**. Paste a product URL → best-effort `{title, image, price}` fills
  only the *empty* draft fields. Degrades silently on any failure; the gate never fetches.
- **Theme** `signal` (the farm ships one pair, `signal`/`signal-light`).
- **Category** `lifestyle`.

## What the runtime already gives (compose, don't rebuild)

- **Routing** — `S.sheet` (bool, add/edit wish) + `S.screen` (string: `wish:<id>`, `list`, `lists`) are
  history-backed by `index.js`; system Back closes the top overlay. Every overlay needs an `h.back()` e2e.
- **Delete safety** — `undo(restoreFn, name)` shows the interactive snackbar («name» видалено · Undo) for a
  single wish/grant removal (reversible); `confirm({title,body,verb,onConfirm})` is the history-backed
  danger sheet for deleting a whole **list** (severe, drops its items).
- **Skeletons, i18n (en+uk), install, haptics, boot shell** — systemic. Haptics: declare
  `data-haptic="bump"` on destructive controls; never call `haptic.*` for a plain tap.
- **IndexedDB** — `collection("wishlists")`, `collection("wishes")`; async CRUD, newest-first.

## Data model

- `wishlists`: `{ id, name, icon, color, createdAt }`
- `wishes`: `{ id, listId, name, price:Number|null, currency, url, image, want:1|2|3, note, granted:Boolean, createdAt }`

`want` (1–3) drives default sort (most-wanted first) and a 3-pip accent meter (colour = meaning, primary
DaisyUI class so it flips with theme — never a JS-baked hex). Granted items drop to a muted, struck
"Здійснені" section (grant is a *celebrated* state, distinct from delete).

## Pure logic → `packages/runtime/wish.js` (+ unit tests) — NOT in the app

- `parsePrice(text)` → `{ price, currency } | null`. Scans for a currency token (symbol `$ € £ ₴ zł` or code
  `USD EUR GBP UAH PLN` / `грн`) adjacent to a number; `toNumber` normalises `1 299,00` / `1,299.00` /
  `14 200`. First currency-anchored amount wins; bare numbers are ignored (avoids matching model numbers).
- `parseWishMeta(data, url)` → `{ title, image, price, currency }` from a Jina `data` object (title +
  description + content; image = Jina `images` or first markdown image in content).
- `fetchWishMeta(url)` — thin Jina wrapper (10s abort), returns the parsed meta or throws → caller fail-open.
  **Never called in the gate** (view guards on `isGate`).
- `wishTotals(wishes)` → per-currency `[{currency, sum, count}]` over **non-granted** items (can't sum mixed
  currencies, so group them). `sortWishes` (want desc, then newest). `fmtMoney(n, currency)` → grouped
  string (`14 200 ₴`, `$1 299`).

## Pitfalls

- Currency mixing: never auto-convert; group totals per currency (rates.js conversion is out of scope).
- `image`/`price` from arbitrary pages are best-effort — always fail-open, never block the manual form.
- Seed the **widest** state for the gate (long name + large price) so overflow@384 is actually measured.
