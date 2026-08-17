# Link previews (Telegram first) — research note, 2026-08-17

Owner's ask: «максимально збагатити мета тегами html, щоб превью підтягувались в телеграм як мінімум».

## What a preview bot actually does (validated)

- **No JavaScript.** Telegram's fetcher reads the RAW HTML of the URL; tags rendered by the app at runtime do
  not exist for it. Every tag below is therefore written into the BUILT `dist/<app>/index.html` (and the
  site root), never set from JS. Source: opengraphplus.com/consumers/telegram/images ("No JavaScript-dependent
  redirects"), sociallinkpreview.com/platforms/telegram ("All meta tags must be present in the raw HTML").
- **Open Graph is the vocabulary**: `og:title`, `og:description`, `og:image` (ABSOLUTE URL), `og:url`,
  `og:site_name`, `og:type`; `twitter:card=summary_large_image` is what makes Telegram lay the image out
  full-width instead of as a small square thumbnail to the right of the text (opengraphplus, same page:
  "Even properly sized images become compressed thumbnails without this tag").
- **Image**: JPEG / PNG / WebP (GIF becomes a looping video); **SVG is not in the supported list** — our
  `icon.svg`/`brand.svg` cannot be the preview. Recommended **1200×630 (1.91:1)**; below ~600×315 the
  large layout is not used; below 200×200 the image may be rejected; keep under 5 MB, ideally < 500 KB.
  Sources: og-image.org/sizes/telegram-preview, opengraphplus.com/consumers/telegram/images.
- **Cache**: Telegram caches a URL's preview with no documented expiry; after a change, send the URL to
  **@WebpageBot** in Telegram to force a re-fetch (tryunfurl.com/telegram-link-preview.html,
  sociallinkpreview.com). Adding `?v=` to a shared link also sidesteps the old entry.
- Same tags feed WhatsApp / Signal / Slack / Discord / iMessage / X previews; `<meta name="description">` and
  `<link rel="canonical">` are the plain-SEO twins and cost nothing.

## Producing the image without a browser (measured on this box)

- `@resvg/resvg-wasm@2.6.2` — already the build's PWA-icon renderer (`deploy/icons.mjs`) — renders a
  1200×630 SVG with TEXT when handed font buffers: `new Resvg(svg, { font: { loadSystemFonts: false,
  fontBuffers, defaultFontFamily: "Geist" } })`. Google Fonts serves **TTF** (resvg needs TTF/OTF, not
  woff2) when asked with an old user-agent: `curl -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?
  family=Geist:wght@700&family=Geist+Mono:wght@500"` → `.ttf` URLs (verified 2026-08-17). Cyrillic renders
  (the returned TTF is the full face). Prototype: 31 KB PNG in ~1 s.
- The card is generated from what every app already has — `brand.json` (bg/fg), `brand.svg` (the glyph),
  `i18n/uk.json` (`title`, `profTagline`) — so no app grows a new file; the farm-wide pass is one build.

## Shape of the build

`deploy/og.mjs` renders `dist/<app>/og.png`; `deploy/build.mjs` injects the tag block after `<title>` in
`dist/<app>/index.html` (and the site root points at the store's card): description, canonical, og:*, image
width/height/alt, `og:locale uk_UA` + `og:locale:alternate en_US`, `twitter:card summary_large_image` +
twitter:title/description/image. `dist-eye`/`assertInstallable` are untouched; a missing card is a build
error, not a silent skip (the same rule as the icons).

## Sources

- https://og-image.org/sizes/telegram-preview
- https://opengraphplus.com/consumers/telegram/images
- https://www.tryunfurl.com/telegram-link-preview.html
- https://www.sociallinkpreview.com/platforms/telegram/
- https://ogp.me/ (the vocabulary)
