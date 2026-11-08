/**
 * # runtime/i18n.js — tiny i18n: every string goes through `T()`, a miss shows the key
 *
 * Pure, zero-dependency translation over flat `{ key: string }` dicts. The render layer holds no static
 * English: `T(dict, key, params)` looks the key up, interpolates `{param}` tokens and falls back to the raw
 * key, so a missing translation is a visible key on the screen rather than a crash or a blank. The module
 * also owns the strings the runtime's own chrome paints — `SYS`/`sys` (shell, sheets, share, update, account,
 * APK) and `MEDIA`/`media` (the video player) — so no app restates "Close" or "Play" in two locales to mount a
 * shared component; and the locale-aware time labels (`whenLabel`, `sinceLabel`, `ago`) so a data.js never
 * bakes a language into a date string.
 *
 * ![The i18n module map: spec.i18n → dictFor → T, plus the runtime's SYS/MEDIA chrome and time labels](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-i18n.svg)
 *
 * ## Import
 * ```js
 * import { T, dictFor, SYS, sys, MEDIA, media, whenLabel, sinceLabel, ago } from "/_rt/i18n.js";                    // an app's page: the import map resolves /_rt/
 * import { T, dictFor, SYS, sys, MEDIA, media, whenLabel, sinceLabel, ago } from "@microspec/core/runtime/i18n.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Translation**
 * - {@link T} — `T(dict, key, params?)`: translate a key, interpolate `{param}` tokens, fall back to the key itself.
 * - {@link dictFor} — `dictFor(i18n, locale)`: the dict for a locale from an app's `{ [locale]: dict }` table, then `en`, then `{}`.
 *
 * **Locales** (the product's list and detection rule live in `locales.js`, which a product shadows with `rt/locales.js`)
 * - {@link appLocales} — `appLocales(i18n)`: the product's locales this app has a dictionary for, in the product's order.
 * - {@link firstLocale} — `firstLocale(i18n, env?)`: the locale a first visit opens in (Telegram client → browser → fallback, or the fallback alone).
 * - {@link telegramLanguage} — the Telegram client's language from the launch URL, before the SDK loads; `""` outside Telegram.
 * - {@link intlLocale} · {@link INTL} — a code's Intl locale (`uk` → `uk-UA`, `ru` → `ru-RU`, else `en-US`) for dates and numbers.
 * - {@link LOCALE_LABEL} — the switcher's short label per code (`UA`, `EN`, `RU`).
 *
 * **Runtime chrome strings** (`{ key: { en, uk, ru } }`, owned here so no app dict repeats them)
 * - {@link SYS} — the shell: back-to-exit, undo, close, clean screen, share, update, account, APK.
 * - {@link sys} — `sys(key, locale)`: a `SYS` string for a locale, falling back to English, then `""`.
 * - {@link MEDIA} — the video player: loading, unavailable, PiP, fullscreen.
 * - {@link media} — `media(key, locale)`: a `MEDIA` string for a locale, same fallback as `sys`.
 *
 * **Time labels** (each takes the app dict, a timestamp and the locale; dates format through {@link intlLocale})
 * - {@link whenLabel} — `whenLabel(dict, ts, locale, full = true, precision)`: absolute month + HH:MM plus a relative countdown for a future event (`format: "when"`); `""` for an invalid date. `precision` ("day" | "month" | "quarter" | "year") stops the label where the timestamp stops being true.
 * - {@link sinceLabel} — `sinceLabel(dict, ts, locale)`: fine-grained "x ago" at seconds/minutes granularity for live feeds (`format: "since"`).
 * - {@link ago} — `ago(dict, ts, locale)`: today / yesterday / days / weeks, then a locale date past ~a month (`format: "ago"`).
 *
 * ## In practice
 * ```js
 * import { T } from "/_rt/i18n.js";
 * import { useStore } from "@nanostores/preact";
 *
 * function Screen() {
 *   const t = useStore(S.t);                                  // S.t = computed(S.locale, l => dictFor(spec.i18n, l))
 *   const stateLine = state === "connecting" ? T(t, "connecting")
 *     : state === "live" ? T(t, "live") : null;
 *   return html`<${Segmented} label=${T(t, "tabListen")} ...
 *     <${Sheet} title=${T(t, "aSound")} ...`;
 * }                                                            // apps/tide/view.js
 * ```
 *
 * ## How it fits
 * Imports only `locales.js` (data the product shadows). Inside the runtime, `store.js` builds `S.t` from {@link dictFor}, `render.js` renders card
 * meta through {@link T}, {@link ago}, {@link whenLabel}, {@link sinceLabel} and {@link sys}, `ui.js` and
 * `account.js` read their chrome via {@link sys}, `video.js` via {@link media}, and `console.js` uses {@link T}.
 * All 74 farm apps import it (tide, rave, v2m, imagine, mirage, hoard, persona…), and the product's `rt/timescale.js`
 * reaches it as `@microspec/core/runtime/i18n.js` — it is the one runtime module every app page touches.
 *
 * ## Invariants and pitfalls
 * - No static English in the render layer: every user-visible string is `T(dict, key)`; a raw key on screen is the
 *   intended failure mode of a missing translation, not a crash.
 * - `en` is the required fallback locale: {@link dictFor} falls to `i18n.en`, then to an empty dict.
 * - Systemic strings live in `SYS`/`MEDIA`, never in an app dict — a shared component that demands an i18n key from
 *   every app that mounts it ships the raw key the first time someone forgets (how "profTheme" reached a real screen).
 * - The runtime paints the door, so the runtime owns its name: both halves of the clean-screen pair (`clean`,
 *   `cleanExit`) and the transport labels (`aPlay`…`aShuffle`) belong here.
 * - {@link whenLabel} needs the app keys `whenPast` / `whenMin` / `whenHours` / `whenDays` (plus `whenQuarter` when a caller passes `precision: "quarter"`); {@link sinceLabel}
 *   needs `sinceNow` / `sinceSec` / `sinceMin` / `sinceHour` / `sinceDay`; {@link ago} needs `agoToday` / `agoYesterday`
 *   / `agoDays` / `agoWeeks` — each with `{n}`. Without them the label renders the bare key.
 * - Interpolation is `replaceAll` on `{name}`; the value is stringified. There is no pluralisation — the `{n}` keys carry the number.
 * - Absolute dates are Intl output for the code's {@link intlLocale}; a code outside {@link INTL} shares the English date shape.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/i18n.js — edit the JSDoc there, never this file.
/**
 * The locales an app offers: the product's {@link LOCALES} it has a dictionary for, in the product's order.
 * @param i18n the app's `{ [locale]: dict }` @param offered the product's list (default: locales.js)
 * @returns at least one code — the app's first dictionary when none of the offered ones exists
 */
export function appLocales(i18n: any, offered?: any): any;
/**
 * The Telegram client's language for a page launched from Telegram, read from the launch URL itself
 * (`#tgWebAppData=…user={…"language_code":"ru"}…`) so it is known before the SDK script loads; `""` otherwise.
 * @param hash the page's `location.hash` (default: the live one)
 */
export function telegramLanguage(hash?: any): string;
/**
 * The locale a first visit opens in: with {@link DETECT}, the Telegram client's language if offered, else the
 * first of the browser's languages that is offered, else the fallback (the first offered); without it, always
 * the fallback. A stored choice and `?locale=` are applied by the caller (store.js) before this.
 * @param i18n the app's `{ [locale]: dict }`
 * @param env `{ offered, detect, telegram, browser }` — defaults read locales.js, the launch URL and `navigator`
 */
export function firstLocale(i18n: any, env?: {}): any;
/**
 * Locale-aware absolute + relative label for a future timestamp (`format: "when"`).
 * @param dict the app dict carrying whenPast / whenMin / whenHours / whenDays
 * @param ts a Date-parseable timestamp
 * @param locale the active locale code
 * @param full include the relative countdown tail (default true)
 * @param precision how far the timestamp is to be believed — "day" | "month" | "quarter" | "year"; anything else reads it to the minute
 * @returns e.g. "12 Sep, 14:30 · in 3 h", "October 2026" at month precision, or "" for an invalid date
 */
export function whenLabel(dict: any, ts: any, locale: any, full: boolean, precision: any): any;
/**
 * Fine-grained "x ago" label for live feeds (`format: "since"`), at seconds/minutes granularity.
 * @param dict the app dict carrying sinceNow / sinceSec / sinceMin / sinceHour / sinceDay
 * @param ts a millisecond timestamp
 * @param locale the active locale code
 * @returns the translated relative label
 */
export function sinceLabel(dict: any, ts: any, locale: any): any;
/**
 * Coarse relative date for card meta (`format: "ago"`): today / yesterday / days / weeks, then a locale date.
 * @param dict the app dict carrying agoToday / agoYesterday / agoDays / agoWeeks
 * @param ts a millisecond timestamp
 * @param locale the active locale code
 * @returns the translated relative label or a formatted date
 */
export function ago(dict: any, ts: any, locale: any): any;
/**
 * Translate a key through a locale dict, interpolating `{param}` tokens; a missing key returns the key itself.
 * @param dict flat `{ key: string }` locale map (may be undefined)
 * @param key the string key
 * @param params optional `{ name: value }` substitutions for `{name}` tokens
 * @returns the translated, interpolated string
 */
export function T(dict: any, key: any, params: any): any;
/**
 * Pick the dict for a locale from an app's i18n table, falling back to `en`, then to an empty dict.
 * @param i18n `{ [locale]: dict }`
 * @param locale the active locale code
 * @returns the flat dict to hand to `T`
 */
export function dictFor(i18n: any, locale: any): any;
/** The Intl locale each offered code formats dates and numbers with; an unknown code formats as English. */
export const INTL: {};
/** @param locale a locale code @returns its Intl locale (`"uk"` → `"uk-UA"`), `"en-US"` when unknown */
export function intlLocale(locale: any): any;
/** The short label the profile's language switcher shows for each code. */
export const LOCALE_LABEL: {
    uk: string;
    en: string;
    ru: string;
};
/** Built-in runtime chrome strings, `{ key: { en, uk, ru } }` — the shell, sheets, share, update, account and APK flows. */
export const SYS: {};
/**
 * Read a `SYS` string for a locale, falling back to English, then to "".
 * @param key a `SYS` key
 * @param locale the active locale code
 * @returns the localised string
 */
export function sys(key: any, locale: any): any;
/** Built-in video-player chrome strings, `{ key: { en, uk, ru } }`. */
export const MEDIA: {
    player: {
        en: string;
        uk: string;
        ru: string;
    };
    back_1: {
        en: string;
        uk: string;
        ru: string;
    };
    back: {
        en: string;
        uk: string;
        ru: string;
    };
    loading: {
        en: string;
        uk: string;
        ru: string;
    };
    unavailable: {
        en: string;
        uk: string;
        ru: string;
    };
    openExternal: {
        en: string;
        uk: string;
        ru: string;
    };
    retry: {
        en: string;
        uk: string;
        ru: string;
    };
    play: {
        en: string;
        uk: string;
        ru: string;
    };
    pause: {
        en: string;
        uk: string;
        ru: string;
    };
    mute: {
        en: string;
        uk: string;
        ru: string;
    };
    unmute: {
        en: string;
        uk: string;
        ru: string;
    };
    fill: {
        en: string;
        uk: string;
        ru: string;
    };
    fit: {
        en: string;
        uk: string;
        ru: string;
    };
    seek: {
        en: string;
        uk: string;
        ru: string;
    };
    live: {
        en: string;
        uk: string;
        ru: string;
    };
    pip: {
        en: string;
        uk: string;
        ru: string;
    };
    fullscreen: {
        en: string;
        uk: string;
        ru: string;
    };
    exitFullscreen: {
        en: string;
        uk: string;
        ru: string;
    };
};
/**
 * Read a `MEDIA` string for a locale, falling back to English, then to "".
 * @param key a `MEDIA` key
 * @param locale the active locale code
 * @returns the localised string
 */
export function media(key: any, locale: any): any;
