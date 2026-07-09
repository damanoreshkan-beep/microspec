# SCHEMA.md — `spec.json` authoring reference

A micro-app = `spec.json` (declarative UI) + `data.js` (`export async function load(filters) => { items, meta }`). The runtime renders ONLY what the spec describes, using an allow-listed component catalog. Field names in the spec that point at *data* (e.g. `card.title`, `badge.field`, predicates) must be **keys on the item objects** your `data.js` returns. Field names that are *text* (e.g. `label`, `titleKey`, `more`) are **i18n keys**.

> Failure modes are loud-ish but not fatal: a missing i18n key renders as the **raw key string** (visible typo, no crash); a field referencing a non-existent item key renders empty. There is no schema validator — match this document exactly.

---

## 1. Top-level shape

```json
{
  "id": "dou",                 // storage namespace prefix; required
  "theme": "dim",              // default theme; toggle flips "dim"|"light"
  "fav": { "key": "link" },    // OPTIONAL. enables save/star on cards; key = unique item field
  "filters": { ... },          // OPTIONAL. enables AppBar filter button + bottom sheet
  "detail": { ... },           // OPTIONAL. tapping a list card opens a full-screen in-app detail page
  "profile": { ... },          // OPTIONAL but expected; powers the profile tab rows
  "tabs": [ ... ],             // required; first tab is the initial tab
  "i18n": { "uk": {...}, "en": {...} }   // required; flat dict per locale
}
```

- `fav` is required for: a `source:"fav"` tab, and any `fav` / `!fav` predicate. Omit it and cards show no star.
- Default locale is `uk`; the profile language switch is hardcoded to **uk / en**, so always supply both.

---

## 2. Tab types

Every tab has: `id`, `type`, `icon` (lucide, for dock), `label` (i18n key, dock text). Optional `titleKey` (i18n key for the AppBar title when this tab is active; falls back to `"title"`).

| `type` | View | Extra fields |
|---|---|---|
| `list` | scrollable cards | `card` (req), `search`, `searchKey`, `statusKey`, `source`, `sections`, `clientFilters`, `banner`, `empty` |
| `converter` | currency converter | `codeField`, `rateField`, `base` |
| `dashboard` | hero + strip + daily list | `hero` (req), `strip`, `days` |
| `tool` | a custom app-supplied view (sensor/instrument apps) | `view` (req), `needs` |
| `profile` | settings rows | (none beyond common; driven by top-level `profile`) |

---

## 3. `list` tab fields

```json
{
  "id": "feed", "type": "list", "icon": "lucide:newspaper", "label": "dockFeed",
  "search": true,            // render search box + status line
  "searchFetch": true,       // OPTIONAL (search family): search box drives a real refetch (query → data.js as filters.q)
  "prompt": { "icon": "lucide:search", "text": "searchPrompt", "hint": "searchPromptHint" }, // searchFetch pre-query empty-state
  "searchKey": "search",     // i18n key for placeholder (default "search")
  "statusKey": "statusCounts", // i18n key for status line (default "status")
  "source": "fav",           // OPTIONAL: items come from saved store, not data.items
  "banner": { "icon": "lucide:shield-check", "titleKey": "infoTitle", "bodyKey": "infoBody" },
  "empty": { "icon": "lucide:bookmark", "text": "emptySaved", "hint": "emptySavedHint" },
  "clientFilters": [{ "key": "fbron", "when": "bron" }],
  "sections": [ ... ],       // OPTIONAL: partition items; omit for a flat list
  "card": { ... }            // required
}
```

- `statusKey` is interpolated with **all of `meta`** plus `{date}`. So `"statusCounts": "{bron} of {rest}"` requires `meta.bron`/`meta.rest`; `"status": "Rate · {date}"` requires `meta.date`.
- `source:"fav"` tabs ignore `statusKey` and show `savedCount` (`{n}`) instead; search uses `searchKey`. Search matches all stringified item values.
- `empty` overrides the default empty state (`noResults`/`noResultsHint`).
- **`searchFetch`** (search family): the search box debounce-drives `load()` (350ms), passing the **trimmed query** to `data.js` as `filters.q`. Client-side value filtering is skipped (the server did the search). While `q` is empty, `load()` still runs with `q:""` — your `load()` should return `{ items: [] }` for empty `q`, and the runtime shows the `prompt` empty-state (default keys `searchPrompt`/`searchPromptHint`) instead of "no results". A non-empty query with 0 hits falls through to the normal `empty`/`noResults` state. Pairs naturally with top-level `detail` (tap a result → in-app article page). Powers `wiki`.

---

## 4. Card layouts: `row` vs `feed`

`card.layout` selects the template. Each slot value is an **item field name** unless noted.

**`row`** — compact one-liner (rates, glanceable lists). Slots:

```json
"card": { "layout": "row", "lead": "cc", "title": "name", "trailing": "rate", "unit": "₴" }
```
| slot | meaning |
|---|---|
| `lead` | bold left cell (e.g. code) |
| `title` | middle label (truncates; hidden on watch width) |
| `trailing` | right value |
| `unit` | OPTIONAL literal suffix; if set, `trailing` is number-formatted + `" "+unit` |
| `trend` | OPTIONAL item field with a signed % change; shown green (up) / red (down) under `trailing` |

Row has **no badges/subtitle/body/more**. Star (if `fav`) is automatic.

**`feed`** — rich card (jobs, articles). Slots:

```json
"card": {
  "layout": "feed",
  "image": "thumb",      // OPTIONAL item field — image URL; renders a 16:9 figure atop the card (gallery)
  "imageFit": "contain", // OPTIONAL "cover" (default, fill+crop) | "contain" (whole image matted — art/posters)
  "href": "link",        // OPTIONAL item field; makes whole card an <a target=_blank>
  "title": "position",   // required: heading
  "subtitle": "company", // OPTIONAL field
  "body": "desc",        // OPTIONAL field (clamped 2 lines)
  "meta": {"field":"ts","format":"ago"}, // OPTIONAL: a field name, OR {field,format:"ago"} → locale-aware relative date

  "more": "more",        // OPTIONAL i18n key for the "Details ↗" link (bottom-right)
  "badges": [ ... ]      // OPTIONAL
}
```
Empty/falsy fields are dropped automatically.

---

## 5. Badges (feed cards only)

Two mutually-exclusive forms in the `badges` array:

```json
"badges": [
  { "when": "bron", "label": "badgeBron", "icon": "lucide:shield-check", "variant": "primary", "key": "bron" },
  { "field": "salary", "variant": "success" },
  { "field": "score", "icon": "lucide:chevron-up", "variant": "success" },
  { "field": "tech",   "variant": "ghost" }
]
```

- **Conditional badge** `{ when, label, icon?, variant? }` — shown only if predicate `when` (see §6) is true. Text = i18n `label`. `variant`: `"primary"` → filled, anything else → ghost.
- **Value badge** `{ field, icon?, variant? }` — renders `item[field]` as text (optional `icon` prepended); if the field is an **array**, one badge per element (no icon); hidden when null/empty. `variant`: `"primary"` | `"success"` (outlined) | else ghost.
- `key` (optional) only exists so a section can suppress this badge via `hideBadge` (§7). It does not affect rendering otherwise.

---

## 6. Predicates (`when` / `filter` strings)

Used by `sections[].filter`, `clientFilters[].when`, and `badge.when`. Exactly these forms:

| value | true when |
|---|---|
| `"fav"` | item is saved |
| `"!fav"` | item is not saved |
| `"field"` | `item.field` is truthy |
| `"!field"` | `item.field` is falsy |
| omitted | always true |

`fav`/`!fav` require top-level `fav`. `field` must be a real item key.

---

## 7. Sections

Partition items into labeled groups; order matters; empty groups are hidden.

```json
"sections": [
  { "filter": "bron", "icon": "lucide:shield-check", "label": "sectionBron", "accent": true, "hideBadge": "bron" },
  { "filter": "!bron", "icon": "lucide:layout-list", "label": "sectionAll", "labelParams": "category" }
]
```
| field | meaning |
|---|---|
| `filter` | predicate (§6) selecting items for this group |
| `icon` | lucide header icon |
| `label` | i18n key for header |
| `labelParams` | OPTIONAL: a **filter key**; its current value is injected as **`{cat}`** (param name is fixed). So the label string must use `{cat}`, e.g. `"All: {cat}"` |
| `accent` | OPTIONAL bool → primary-colored header |
| `hideBadge` | OPTIONAL: matches a `badge.key`; suppresses that badge for cards in this section |

---

## 8. Filters

```json
"filters": {
  "refetch": true,                                  // on Apply, reload data.js
  "defaults": { "category": "Front End", "exp": "" }, // seeds S.filters; set EVERY control key
  "controls": [ ... ]
}
```
- `defaults` must contain a value for every control `key` (selects/segments especially) so the control is initialized.
- The whole filter values object is passed to `load(filters)`.

### Control types

```json
{ "type": "select",  "key": "category", "label": "filterCategory", "icon": "lucide:layers",
  "optionsFrom": "categories" },
{ "type": "toggle",  "key": "fbron", "label": "filterBron", "icon": "lucide:shield-check",
  "iconCls": "text-primary", "chip": true },
{ "type": "segment", "key": "exp", "label": "filterExp", "icon": "lucide:briefcase",
  "options": [["", "expAny"], ["0-1", "0–1"], ["3-5", "3–5"]] }
```
| type | stores | needs |
|---|---|---|
| `select` | option `v` (string) | `optionsFrom` = a `meta` key holding `[{v,l}]` from `data.js` |
| `toggle` | boolean | optional `iconCls` |
| `segment` | chosen value (string) | `options`: array of `[value, labelKey]` (labelKey = i18n key) |

Common: `key`, `label`, `icon`, and `chip` (bool).

### Refetch vs client — the critical distinction

A control only **stores** its value into `filters`. What that value *does* depends on which mechanism you wire:

- **Server / refetch:** your `data.js` `load(filters)` reads `filters[key]` to build the request (e.g. `category`, `exp` → feed URL). Set top-level `filters.refetch: true` so **Apply** triggers a reload. (A per-control `"refetch": true` is documentary only — the runtime reloads based on the top-level flag.)
- **Client:** the value never reaches the network. Add the key to the tab's `clientFilters` with a predicate to filter already-loaded items in place (no reload):
  ```json
  "clientFilters": [{ "key": "fbron", "when": "bron" }]
  ```
  When `filters.fbron` is truthy, items are filtered by predicate `"bron"`.

### `chip`
`chip: true` makes an active filter appear as a removable chip above the list. Tapping it clears the filter (`false` for toggle, `""` for select/segment). Use for filters the user should see is on.

---

## 9. `converter` tab

```json
{ "id": "convert", "type": "converter", "icon": "lucide:arrow-right-left", "label": "tabConvert",
  "titleKey": "tabConvert", "codeField": "cc", "rateField": "rate", "base": "UAH",
  "defaultFrom": "USD", "defaultTo": "UAH", "quick": ["100","500","1000","5000"] }
```
- `codeField`: item field holding the currency code (drives the dropdowns).
- `rateField`: item field holding the per-`base` rate (number).
- `base`: literal code injected as the reference unit (rate 1). Pulls items from the same `data.js`.
- `defaultFrom` / `defaultTo`: OPTIONAL initial pair (default `from="USD"`, `to=base`). Set these whenever the codes aren't USD/base, or the converter shows 0.
- `quick`: OPTIONAL quick-amount chips (default `["100","500","1000","5000"]`; crypto uses `["0.1","1","10","100"]`).
- Requires i18n keys `swap` and `perUnit2` (`{a}`,`{rate}`,`{b}`).

---

## 9a. `dashboard` tab (hero / strip / days — glanceable family)

A single-screen overview: a big **hero** (current conditions), an optional horizontal **strip**
(e.g. hourly), and an optional vertical **days** list. Used by `weather` (Open-Meteo). No search/scroll
list — the whole screen IS the content. Data split: **hero + strip read `data.meta`; days reads `data.items`.**

```json
{
  "id": "now", "type": "dashboard", "icon": "lucide:sun", "label": "dockNow", "titleKey": "title",
  "hero": {                       // reads data.meta (a single current-conditions object, flattened)
    "place": "place",            // OPTIONAL meta field — small location line above the icon
    "icon": "icon",              // OPTIONAL meta field holding an iconify name (big glyph)
    "value": "temp",             // REQUIRED meta field — the big number
    "unit": "°",                 // OPTIONAL literal suffix on the big value
    "caption": "summary",        // OPTIONAL meta field — text under the value
    "metrics": [                 // OPTIONAL stat chips (hidden at watch width)
      { "icon": "lucide:wind", "field": "wind", "unit": " км/г", "label": "mWind" }
    ]
  },
  "strip": {                      // OPTIONAL horizontal scroller — reads a meta ARRAY
    "from": "hourly",            // REQUIRED meta key holding the array
    "label": "stripHourly",      // OPTIONAL i18n key (section header, gets a clock icon)
    "time": "time",              // REQUIRED item field — top label (e.g. "14:00")
    "icon": "icon",              // OPTIONAL item field — iconify name
    "value": "temp",             // REQUIRED item field — bottom value
    "unit": ""                   // OPTIONAL literal suffix on strip value
  },
  "days": {                       // OPTIONAL vertical list — reads data.items
    "label": "daysTitle",        // OPTIONAL i18n key (section header, calendar icon)
    "day": "day",                // REQUIRED item field — left label (e.g. "Today")
    "icon": "icon",              // OPTIONAL item field — iconify name
    "hi": "hi",                  // REQUIRED item field — primary value
    "lo": "lo",                  // OPTIONAL item field — muted secondary value (hidden at watch)
    "unit": "°"                  // OPTIONAL literal suffix on hi/lo
  }
}
```
- `hero.metric` slots: `{ icon?, field (req, meta key), unit?, label? (i18n, shown as tooltip) }`.
- Strip/metrics collapse at watch width so the hero stays the glance. Empty/null slots are dropped.
- `data.js` shape: `items` = the days array; `meta` = the flattened current object **plus** the strip array.
  Required i18n keys for the error state: `statusError`, `errorHint`.

## 9b. `detail` — in-app drill-down page (top-level, OPTIONAL)

When present, **every list card becomes a tap target that opens a full-screen detail overlay**
(instead of a `card.href` external link — so drop `card.href` and move the external link into
`detail.actions`). The item already carries all fields; the detail page just shows more of them.
Keep `card.more` as the affordance label (e.g. "Докладніше"/"Details"). Powers `countries`.

```json
"detail": {
  "image": "flag",            // OPTIONAL item field — hero image (16:9 figure)
  "imageFit": "contain",      // OPTIONAL "contain" (default) | "cover"
  "title": "name",            // REQUIRED item field — page title (also the app-bar title)
  "subtitle": "official",     // OPTIONAL item field — under the title
  "rows": [                   // OPTIONAL fact rows; a row whose field is empty/null is dropped
    { "icon": "lucide:building-2", "label": "dCapital", "field": "capital" },
    { "icon": "lucide:languages",  "label": "dLanguages", "field": "languages" }
  ],
  "actions": [                // OPTIONAL link buttons (external)
    { "icon": "lucide:map-pin", "label": "mapLink", "href": "map" }
  ]
}
```
- `rows[].label` and `actions[].label` are **i18n keys**; `field`/`href` are **item fields**.
- Needs i18n key **`back`** (overlay back button). Card open is keyboard/SR-accessible (stretched-link)
  and the favorite star still works inside cards and on the detail page.
- `data.js` should pre-join multi-value fields to strings (e.g. `languages.join(", ")`) — rows render text.

## 9c. `tool` tab — sensor / instrument apps (escape hatch)

For apps whose core is an **irreducible interactive visual** (ruler, level, meter…) that can't be
declarativized like cards. The shell stays the runtime's (AppBar, Dock, Profile, theme, install,
**back-routing**, gates, i18n); only the main view is a component the app supplies.

```json
{ "id": "ruler", "type": "tool", "view": "ruler", "needs": ["haptic"],
  "icon": "lucide:ruler", "label": "tabRuler", "titleKey": "title" }
```
- `view` (req): a key into the `views` map; `needs` (opt): hardware capabilities used (documents intent).
- The app boots with `start(spec, { views })` (not `start(spec, load)`):
  ```js
  import { start } from "/_rt/index.js";
  import { views } from "./views.js";        // { ruler: RulerView }
  start(spec, { views });                     // a tool app may also pass { load, views }
  ```
- The view component gets props `{ t, loc, tab, toast, S, screen, openScreen, closeScreen }` and imports
  hardware itself from **`/_rt/sensors.js`** (shared capability layer: `haptic`, `geo`, `compass` +
  pure `distanceM`/`bearingDeg` now; `orientation`/`camera`/`mic` added per rule-of-two). Use `T` from
  `/_rt/core.js` for i18n; persist via `@nanostores/persistent`. **Route any sub-screen through
  `screen`/`openScreen`/`closeScreen`** (history-backed — system Back closes it), never local state.
- **Hardware needs a secure context** (https or localhost) and most sensors are **device-only** — the
  headless harness has no camera/GPS/gyro/vibration, so `verify` checks structure/calibration/
  permission-states, not live readings. Feature-detect and degrade gracefully (`sensors.haptic.supported`).

## 10. `profile` tab + top-level `profile`

The profile tab renders rows from the top-level `profile` object:

```json
"profile": {
  "icon": "lucide:user",          // avatar icon
  "theme": true,                  // show dark-mode toggle row (needs "profTheme")
  "lang": true,                   // show uk/en switch row (needs "profLang")
  "install": true,                // show install row + modal (needs install* keys)
  "source": { "label": "profSource", "url": "https://...", "icon": "lucide:database" }
}
```
- A “saved” shortcut row appears automatically if any tab has `source:"fav"`.
- Tab itself only needs `id/type/icon/label` + optional `titleKey`.

---

## 11. i18n contract

- `i18n` is `{ locale: { key: "string" } }` — a **flat** dict per locale (no nesting). Provide at least **`uk` and `en`** (the language switch offers both).
- Interpolation: `{param}` tokens are replaced at render. Param names are fixed by the runtime (you cannot rename them): status line gets every `meta` field + `{date}`; `savedCount` gets `{n}`; section `labelParams` gets `{cat}`; `perUnit2` gets `{a}`/`{rate}`/`{b}`.
- Missing key → the key string is shown verbatim. Missing locale → falls back to `en`.

### Required keys

**Always:**
`title`, `refresh`, `close`, `toastSaved`, `toastRemoved`.

**If `fav`:** `favAria`, `unfavAria`.

**For any `list` tab with `search`:** the resolved `searchKey` and `statusKey` (defaults `search`, `status`), plus `statusLoading`, `statusError`, `errorHint`, and `noResults`/`noResultsHint` (unless overridden by `empty`).

**For a `source:"fav"` tab:** `savedCount`.

**If `filters`:** `ariaFilter`, `filterTitle`, `apply`, plus every control `label` and every segment option label.

**If `converter`:** `swap`, `perUnit2`.

**If `profile.theme`/`lang`/`source`:** `profTheme` / `profLang` / the `source.label`; always `profTagline`.

**If `profile.install`:** `install`, `installTitle`, `installBtn`, `installDesc`, `installIosHint`, `installGenericHint`.

**Plus every spec-referenced key:** each tab `label`/`titleKey`, section `label`, badge `label`, banner `titleKey`/`bodyKey`, card `more`, `empty.text`/`hint`. Define each in **all** locales.

---

## 12. `data.js` contract (what the spec depends on)

```js
export async function load(filters) {
  return {
    items: [ /* plain objects; keys referenced by card/badge/section/predicate */ ],
    meta:  { /* date, status counts, and {v,l} arrays for select optionsFrom */ }
  };
}
```
- Every field name used in `card.*`, `badge.field`, predicates, and `fav.key` must exist on each item.
- `meta` must supply: any `{token}` used by `statusKey`, and one array `[{v,l}]` per `select` control’s `optionsFrom`.
- `fav.key` must be a stable, unique item field.