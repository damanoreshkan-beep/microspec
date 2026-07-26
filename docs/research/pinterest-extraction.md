# Getting a real image out of Pinterest — the extraction recipe

Research note for: *"it was so hard to get those images — make a microspec app for it. Pinterest, powerful,
with saving and getting DIRECT image links, and account for every problem we hit here."*

Written from a live session that spent four failed attempts getting one pin's picture. Everything below is
measured against `pin.it/4TgG4yGpF` → pin `1096274734320084795`, July 2026.

## 1. What does NOT work (all four were tried, in this order)

| Attempt | Result |
|---|---|
| `GET https://pin.it/<code>` | 308 → `api.pinterest.com/url_shortener/<code>/redirect/` |
| follow that | 302 → `www.pinterest.com/pin/<id>/sent/?invite_code=…` |
| fetch the pin page and read it | body arrives **truncated** — the pin is client-rendered; a scraper gets the shell, the board name, nothing else |
| `www.pinterest.com/oembed.json?url=<pin.it link>` | `{"error":"url should be a Pinterest url"}` — oEmbed refuses short links |

The lesson that generalises: **the pin page is not a document, it is an app.** Anything that reads HTML is
reading a shell. Stop trying to parse the page.

## 2. What works — the pidgets widget API

Pinterest runs a public, key-less JSON API for its embed widgets, and it answers everything:

```
GET https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=<id>
GET https://widgets.pinterest.com/v3/pidgets/boards/<user>/<board-slug>/pins/
```

```jsonc
{ "data": [{
  "id": "1096274734320084795",
  "description": "Ground your system in the full guide on UI kit foundations…",
  "dominant_color": "#e2dfd8",                    // a real skeleton colour, free
  "board":  { "name": "Clean UX Design", "url": "/Federico_biilancor/clean-ux-design/", "pin_count": 1119 },
  "pinner": { "full_name": "Nexora | UX Design", "profile_url": "…" },
  "images": { "236x": {…}, "237x": {…}, "564x": { "url": "https://i.pinimg.com/564x/2c/2d/a6/<hash>.jpg",
                                                  "width": 564, "height": 1010 } }
}]}
```

**Both endpoints send `access-control-allow-origin: *`.** Verified with an `Origin:` header from the farm's
own origin. So the app calls them **straight from the browser** — no proxy, no allowlist, nothing on the VPS.
That is the single most important finding here: this app is genuinely backend-less, like the rest of the farm.

## 3. The direct-link trap (the app's actual product)

`images` only ever offers **236x / 237x / 564x**. The full-resolution file lives at the same path under
`/originals/`, and the naive rewrite is a trap:

```
https://i.pinimg.com/564x/2c/2d/a6/<hash>.jpg      → 70 KB JPEG, 564×1010   ✔ always exists
https://i.pinimg.com/originals/2c/2d/a6/<hash>.jpg → 263-byte XML error     ✘ often does NOT exist
```

`originals/` 404s return **an XML error document with HTTP 200-ish framing** — `file` reports
`XML 1.0 document, ASCII text`, not an image. So a size check is not enough; the app must confirm it is
actually an image. The ladder, in order, first hit wins:

```
originals/<path>.jpg → originals/<path>.png → 1200x/<path>.jpg → 736x/<path>.jpg → 564x/<path>.jpg
```

Cheap client-side validation without CORS: load it in an `Image()` and trust `naturalWidth > 0`. That works
because **displaying** i.pinimg.com needs no CORS at all — only *reading bytes* does. Which splits the
features cleanly:

- **show the image, copy its direct link, open it, `<a download>` it** — no CORS needed, works today;
- **read the pixels** (a colour palette, a canvas thumbnail) — would need CORS and must NOT be built.

## 4. Resolving a `pin.it` short link — the one place a proxy is needed

`api.pinterest.com/url_shortener/<code>/redirect/` returns the `location` header **without** any
`access-control-allow-origin`, so a browser `fetch` cannot read it: `redirect:"manual"` yields an opaque
response by spec, and `redirect:"follow"` lands on `www.pinterest.com`, which also sends no CORS.

So short links resolve through the farm's own allowlisted VPS proxy (`VPS_PROXY` from `/_rt/feed.js` — never
a public one), and the id is recovered with `/pinterest\.com\/pin\/(\d+)/` against whatever comes back. Every
other input shape needs **no network at all**:

| Input | How the id is found |
|---|---|
| `pinterest.com/pin/<id>/…` | regex, offline |
| `pin.it/<code>` | VPS proxy → regex |
| a bare `<id>` | as-is |
| a board URL | `/<user>/<slug>/` → the boards endpoint, direct |

Design consequence: the short-link path is the **only** one that can fail without network, so the app must
degrade honestly — a pasted full pin URL keeps working with the proxy down.

## 5. What the gate must do

The farm's rule is that a data app seeds a deterministic fixture and never touches a live API in e2e. Fixture
= one pin's JSON exactly as measured above (id, description, board, pinner, `dominant_color`, the three image
sizes) plus a `data:` raster for the tile, so the grid, the direct-link ladder and the copy action are all
exercised headless with zero network. `dominant_color` doubles as the skeleton tint — the no-spinner rule
gets a better answer here than usual, because the API hands us the average colour of the image we are waiting
for.

## 6. Bottom line

1. Do not parse the page. The pidgets API is public, key-less, CORS-open, and richer than the HTML.
2. `564x` always exists; `originals/` frequently does not and fails as XML — walk a ladder and verify with
   `Image().naturalWidth`, never with a status code alone.
3. Only the `pin.it` hop needs our proxy; everything else is direct, so the app stays backend-less.
4. Show/copy/download needs no CORS; anything that reads pixels does — so it is out of scope by construction.
