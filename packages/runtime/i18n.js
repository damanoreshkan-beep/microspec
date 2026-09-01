/* @ts-self-types="./i18n.d.ts" */
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
 * **Runtime chrome strings** (`{ key: { en, uk } }`, owned here so no app dict repeats them)
 * - {@link SYS} — the shell: back-to-exit, undo, close, clean screen, share, update, account, APK.
 * - {@link sys} — `sys(key, locale)`: a `SYS` string for a locale, falling back to English, then `""`.
 * - {@link MEDIA} — the video player: loading, unavailable, PiP, fullscreen.
 * - {@link media} — `media(key, locale)`: a `MEDIA` string for a locale, same fallback as `sys`.
 *
 * **Time labels** (each takes the app dict, a timestamp and the locale; `uk` formats as `uk-UA`, everything else as `en-US`)
 * - {@link whenLabel} — `whenLabel(dict, ts, locale, full = true)`: absolute month + HH:MM plus a relative countdown for a future event (`format: "when"`); `""` for an invalid date.
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
 * Imports nothing. Inside the runtime, `store.js` builds `S.t` from {@link dictFor}, `render.js` renders card
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
 * - {@link whenLabel} needs the app keys `whenPast` / `whenMin` / `whenHours` / `whenDays`; {@link sinceLabel}
 *   needs `sinceNow` / `sinceSec` / `sinceMin` / `sinceHour` / `sinceDay`; {@link ago} needs `agoToday` / `agoYesterday`
 *   / `agoDays` / `agoWeeks` — each with `{n}`. Without them the label renders the bare key.
 * - Interpolation is `replaceAll` on `{name}`; the value is stringified. There is no pluralisation — the `{n}` keys carry the number.
 * - Absolute dates are Intl output for `uk-UA` or `en-US` only; other locales share the English date shape.
 * @module
 */
// microspec runtime — tiny i18n (pure, zero-dependency).
//
// The whole UI is translated through T(): no static English in the render layer. A locale dict is a
// flat { key: string } map; T() interpolates {param} tokens and falls back to the raw key on a miss
// (so a missing translation shows as a visible key, never a crash or blank).

// T(dict, key, params?) — e.g. T(dict, "saved {n}", { n: 3 }) → "saved 3"
/**
 * Translate a key through a locale dict, interpolating `{param}` tokens; a missing key returns the key itself.
 * @param dict flat `{ key: string }` locale map (may be undefined)
 * @param key the string key
 * @param params optional `{ name: value }` substitutions for `{name}` tokens
 * @returns the translated, interpolated string
 */
export const T = (dict, key, params) => {
  let s = dict?.[key] ?? key;
  if (params) for (const k in params) s = String(s).replaceAll("{" + k + "}", params[k]);
  return s;
};

// Pick the active dict for a locale, falling back to en (the required fallback locale).
/**
 * Pick the dict for a locale from an app's i18n table, falling back to `en`, then to an empty dict.
 * @param i18n `{ [locale]: dict }`
 * @param locale the active locale code
 * @returns the flat dict to hand to `T`
 */
export const dictFor = (i18n, locale) => i18n?.[locale] || i18n?.en || {};

// Built-in runtime strings — chrome shared by EVERY app, so they live here (not each app's i18n dict).
/** Built-in runtime chrome strings, `{ key: { en, uk } }` — the shell, sheets, share, update, account and APK flows. */
export const SYS = {
  exit: { en: "Press Back again to exit", uk: "Натисніть «Назад» ще раз, щоб вийти" },
  deleted: { en: "Deleted", uk: "Видалено" },
  undo: { en: "Undo", uk: "Скасувати" },
  cancel: { en: "Cancel", uk: "Скасувати" },
  signInTitle: { en: "Sign in", uk: "Увійти" },
  pairBody: { en: "Sign in here to sign in the app on your phone.", uk: "Увійди тут — і застосунок на телефоні увійде разом з тобою." },
  pairDone: { en: "Signed in — go back to the app.", uk: "Готово — повернись у застосунок." },
  pairFail: { en: "The app did not receive the sign-in — try again from the app.", uk: "Застосунок не отримав вхід — спробуй ще раз із застосунку." },
  signInBody: { en: "AI generation is for signed-in users — so the free quota goes to people, not bots.", uk: "AI-генерація доступна після входу — так безкоштовна квота дістається людям, а не ботам." },
  // The UI kit's own chrome (a Sheet's close button). Systemic strings live HERE, never in an app dict —
  // a shared component that demands an i18n key from every app that mounts it is a component that ships
  // the raw key the first time someone forgets (which is how "profTheme" reached a real screen).
  close: { en: "Close", uk: "Закрити" },
  material: { en: "Theme", uk: "Тема" },
  modeDay: { en: "Day", uk: "День" },
  modeNight: { en: "Night", uk: "Ніч" },
  // Clean screen (S.clean): the runtime's chrome steps off a full-bleed surface. Both halves live here for
  // the same reason `close` does — the runtime paints the door, so the runtime owns its name; an app that
  // merely asks for the mode must not have to restate it in two locales.
  clean: { en: "Clean screen", uk: "Чистий екран" },
  cleanExit: { en: "Show controls", uk: "Показати керування" },
  share: { en: "Share app", uk: "Поділитися" },
  shareCopied: { en: "Link copied", uk: "Посилання скопійовано" },
  updateReady: { en: "New version ready", uk: "Нова версія готова" },
  updateHint: { en: "Already on your device — a restart applies it", uk: "Вже на пристрої — перезапуск застосує її" },
  updateNow: { en: "Update", uk: "Оновити" },
  later: { en: "Later", uk: "Пізніше" },
  restart: { en: "Restart", uk: "Перезапустити" },
  // The transport widget's chrome (/_rt/player.js). Same rule as `close`: the component that renders these
  // labels owns them, so no music app has to restate the word "Play" in two locales to mount a play button.
  aPlay: { en: "Play", uk: "Грати" },
  aPause: { en: "Pause", uk: "Пауза" },
  aStop: { en: "Stop", uk: "Стоп" },
  aPrev: { en: "Previous track", uk: "Попередній трек" },
  aNext: { en: "Next track", uk: "Наступний трек" },
  aSeek: { en: "Seek", uk: "Перемотати" },
  aRepeat: { en: "Repeat", uk: "Повтор" },
  aShuffle: { en: "Shuffle", uk: "Перемішати" },
  more: { en: "More", uk: "Ще" },
  back: { en: "Back", uk: "Назад" },
  // Systemic "Download APK" — every app can emit itself as a sideloadable Android APK (edge-signed).
  apkRow: { en: "Download APK", uk: "Завантажити APK" },
  signOut: { en: "Sign out", uk: "Вийти" },
  signedOut: { en: "Not signed in", uk: "Ви не увійшли" },
  accountVia: { en: "via", uk: "через" },
  apkTitle: { en: "Download as APK", uk: "Завантажити як APK" },
  apkGenerate: { en: "Generate APK", uk: "Згенерувати APK" },
  apkGenerating: { en: "Signing…", uk: "Підписую…" },
  apkDone: { en: "APK ready", uk: "APK готовий" },
  apkErr: { en: "Couldn't build the APK", uk: "Не вдалося зібрати APK" },
  apkRate: { en: "Too many builds — wait a minute and try once.", uk: "Забагато збірок — зачекай хвилину і спробуй раз." },
  apkNote: {
    en: "Sideload only. On Samsung, turn Auto Blocker off (Settings → Security & privacy) or install over adb, then allow unknown sources.",
    uk: "Лише sideload. На Samsung вимкни Auto Blocker (Налаштування → Безпека і приватність) або встанови через adb, тоді дозволь невідомі джерела.",
  },
};
/**
 * Read a `SYS` string for a locale, falling back to English, then to "".
 * @param key a `SYS` key
 * @param locale the active locale code
 * @returns the localised string
 */
export const sys = (key, locale) => SYS[key]?.[locale] || SYS[key]?.en || "";

// Built-in chrome for the video player (/_rt/video.js) — shared by every video app, so no app duplicates it.
/** Built-in video-player chrome strings, `{ key: { en, uk } }`. */
export const MEDIA = {
  player: { en: "Player", uk: "Плеєр" },
  back: { en: "Back", uk: "Назад" },
  loading: { en: "Connecting…", uk: "Підключення…" },
  unavailable: { en: "Stream unavailable", uk: "Потік недоступний" },
  openExternal: { en: "Open in player", uk: "Відкрити у плеєрі" },
  pip: { en: "Picture in picture", uk: "Картинка в картинці" },
  fullscreen: { en: "Fullscreen", uk: "На весь екран" },
  exitFullscreen: { en: "Exit fullscreen", uk: "Вийти з повного екрана" },
};
/**
 * Read a `MEDIA` string for a locale, falling back to English, then to "".
 * @param key a `MEDIA` key
 * @param locale the active locale code
 * @returns the localised string
 */
export const media = (key, locale) => MEDIA[key]?.[locale] || MEDIA[key]?.en || "";

// Locale-aware absolute+relative timestamp for `format: "when"` (future events — launch countdowns,
// schedules). Absolute part via Intl (locale month + HH:MM); relative countdown uses the i18n keys
// whenPast / whenMin({n}) / whenHours({n}) / whenDays({n}). Kept in the runtime so a data.js never bakes
// a language into a date string. `full:false` omits the relative tail.
/**
 * Locale-aware absolute + relative label for a future timestamp (`format: "when"`).
 * @param dict the app dict carrying whenPast / whenMin / whenHours / whenDays
 * @param ts a Date-parseable timestamp
 * @param locale the active locale code
 * @param full include the relative countdown tail (default true)
 * @returns e.g. "12 Sep, 14:30 · in 3 h", or "" for an invalid date
 */
export function whenLabel(dict, ts, locale, full = true) {
  const d = new Date(ts);
  if (isNaN(d)) return "";
  const abs = d.toLocaleString(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (!full) return abs;
  const min = Math.round((d - Date.now()) / 60000);
  const rel = min < 0 ? T(dict, "whenPast")
    : min < 60 ? T(dict, "whenMin", { n: min })
    : min < 1440 ? T(dict, "whenHours", { n: Math.round(min / 60) })
    : T(dict, "whenDays", { n: Math.round(min / 1440) });
  return `${abs} · ${rel}`;
}

// Fine-grained past-relative for live feeds (`format: "since"`) — seconds/minutes granularity, updates as
// the list re-renders. Needs i18n keys sinceNow / sinceSec({n}) / sinceMin({n}) / sinceHour({n}) / sinceDay({n}).
/**
 * Fine-grained "x ago" label for live feeds (`format: "since"`), at seconds/minutes granularity.
 * @param dict the app dict carrying sinceNow / sinceSec / sinceMin / sinceHour / sinceDay
 * @param ts a millisecond timestamp
 * @param locale the active locale code
 * @returns the translated relative label
 */
export function sinceLabel(dict, ts, locale) {
  const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
  if (isNaN(s)) return "";
  if (s < 5) return T(dict, "sinceNow");
  if (s < 60) return T(dict, "sinceSec", { n: s });
  if (s < 3600) return T(dict, "sinceMin", { n: Math.floor(s / 60) });
  if (s < 86400) return T(dict, "sinceHour", { n: Math.floor(s / 3600) });
  return T(dict, "sinceDay", { n: Math.floor(s / 86400) });
}

// Locale-aware relative date for card `meta: { field, format: "ago" }`. Needs the i18n keys
// agoToday / agoYesterday / agoDays({n}) / agoWeeks({n}); older than ~a month falls back to a date.
/**
 * Coarse relative date for card meta (`format: "ago"`): today / yesterday / days / weeks, then a locale date.
 * @param dict the app dict carrying agoToday / agoYesterday / agoDays / agoWeeks
 * @param ts a millisecond timestamp
 * @param locale the active locale code
 * @returns the translated relative label or a formatted date
 */
export function ago(dict, ts, locale) {
  const ms = Date.now() - Number(ts);
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return T(dict, "agoToday");
  if (days === 1) return T(dict, "agoYesterday");
  if (days < 7) return T(dict, "agoDays", { n: days });
  if (days < 31) return T(dict, "agoWeeks", { n: Math.floor(days / 7) });
  return new Date(Number(ts)).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}
