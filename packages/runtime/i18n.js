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
 * - {@link whenLabel} needs the app keys `whenPast` / `whenMin` / `whenHours` / `whenDays` (plus `whenQuarter` when a caller passes `precision: "quarter"`); {@link sinceLabel}
 *   needs `sinceNow` / `sinceSec` / `sinceMin` / `sinceHour` / `sinceDay`; {@link ago} needs `agoToday` / `agoYesterday`
 *   / `agoDays` / `agoWeeks` — each with `{n}`. Without them the label renders the bare key.
 * - Interpolation is `replaceAll` on `{name}`; the value is stringified. There is no pluralisation — the `{n}` keys carry the number.
 * - Absolute dates are Intl output for `uk-UA` or `en-US` only; other locales share the English date shape.
 * @module
 */

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

/**
 * Pick the dict for a locale from an app's i18n table, falling back to `en`, then to an empty dict.
 * @param i18n `{ [locale]: dict }`
 * @param locale the active locale code
 * @returns the flat dict to hand to `T`
 */
export const dictFor = (i18n, locale) => i18n?.[locale] || i18n?.en || {};

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
  close: { en: "Close", uk: "Закрити" },
  material: { en: "Theme", uk: "Тема" },
  battery: { en: "Battery", uk: "Батарея" },
  modeDay: { en: "Day", uk: "День" },
  modeNight: { en: "Night", uk: "Ніч" },
  clean: { en: "Clean screen", uk: "Чистий екран" },
  cleanExit: { en: "Show controls", uk: "Показати керування" },
  share: { en: "Share app", uk: "Поділитися" },
  shareCopied: { en: "Link copied", uk: "Посилання скопійовано" },
  openTelegram: { en: "Open in Telegram", uk: "Відкрити в Telegram" },
  support: { en: "Support the maker", uk: "Підтримати автора" },
  supportSub: { en: "with Telegram Stars", uk: "зірками в Телеграмі" },
  supportThanks: { en: "Thank you 💛", uk: "Дякую 💛" },
  supportFailed: { en: "Payment didn't go through", uk: "Оплата не пройшла" },
  whatsNew: { en: "What's new", uk: "Що нового" },
  refresh: { en: "Get the newest version and clear this app's cache", uk: "Оновити до найновішої версії й скинути кеш застосунку" },
  refreshOffline: { en: "No network — nothing was changed", uk: "Немає мережі — нічого не змінено" },
  privacy: { en: "Privacy", uk: "Приватність" },
  terms: { en: "Terms", uk: "Умови" },
  refreshed: { en: "Newest version loaded", uk: "Завантажено найновішу версію" },
  tone: { en: "Screen", uk: "Екран" },
  toneNormal: { en: "Normal", uk: "Звичайний" },
  toneNoir: { en: "Noir", uk: "Нуар" },
  toneGreen: { en: "Green", uk: "Зелений" },
  toneAmber: { en: "Amber", uk: "Жовтий" },
  restart: { en: "Restart", uk: "Перезапустити" },
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
  calPrev: { en: "Previous month", uk: "Попередній місяць" },
  calNext: { en: "Next month", uk: "Наступний місяць" },
  watchRow: { en: "Tell me when", uk: "Сповісти мене" },
  watchNeedTg: { en: "Alerts arrive in Telegram", uk: "Сповіщення приходять у Telegram" },
  watchSignIn: { en: "Sign in with Telegram", uk: "Увійти через Telegram" },
  watchCost: { en: "1 coin per alert", uk: "1 монета за сповіщення" },
  watchFree: { en: "free for you", uk: "тобі безкоштовно" },
  watchBalance: { en: "balance", uk: "баланс" },
  watchAbove: { en: "above", uk: "вище" },
  watchBelow: { en: "below", uk: "нижче" },
  watchNow: { en: "now", uk: "зараз" },
  watchQuiet: { en: "out of coins", uk: "немає монет" },
  watchSave: { en: "Save this alert", uk: "Зберегти сповіщення" },
  watchOff: { en: "Remove this alert", uk: "Прибрати сповіщення" },
  watchNoPlace: { en: "Couldn't get your location", uk: "Не вдалося визначити місце" },
  watchTooMany: { en: "That is as many alerts as one account keeps", uk: "Більше сповіщень на один акаунт не можна" },
  watchFailed: { en: "Couldn't save the alert", uk: "Не вдалося зберегти сповіщення" },
  apkRow: { en: "Download APK", uk: "Завантажити APK" },
  adminRow: { en: "Farm admin", uk: "Адмінка ферми" },
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

/** Built-in video-player chrome strings, `{ key: { en, uk } }`. */
export const MEDIA = {
  player: { en: "Player", uk: "Плеєр" },
  back: { en: "Back", uk: "Назад" },
  loading: { en: "Connecting…", uk: "Підключення…" },
  unavailable: { en: "Stream unavailable", uk: "Потік недоступний" },
  openExternal: { en: "Open in player", uk: "Відкрити у плеєрі" },
  retry: { en: "Try again", uk: "Спробувати ще" },
  play: { en: "Play", uk: "Відтворити" },
  pause: { en: "Pause", uk: "Пауза" },
  mute: { en: "Mute", uk: "Без звуку" },
  unmute: { en: "Sound on", uk: "Увімкнути звук" },
  fill: { en: "Fill the screen", uk: "На весь екран" },
  fit: { en: "Fit the picture", uk: "Вмістити кадр" },
  seek: { en: "Position", uk: "Позиція" },
  live: { en: "LIVE", uk: "НАЖИВО" },
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

/**
 * Locale-aware absolute + relative label for a future timestamp (`format: "when"`).
 * @param dict the app dict carrying whenPast / whenMin / whenHours / whenDays
 * @param ts a Date-parseable timestamp
 * @param locale the active locale code
 * @param full include the relative countdown tail (default true)
 * @param precision how far the timestamp is to be believed — "day" | "month" | "quarter" | "year"; anything else reads it to the minute
 * @returns e.g. "12 Sep, 14:30 · in 3 h", "October 2026" at month precision, or "" for an invalid date
 */
export function whenLabel(dict, ts, locale, full = true, precision) {
  const d = new Date(ts);
  if (isNaN(d)) return "";
  const loc = locale === "uk" ? "uk-UA" : "en-US";
  if (precision === "year") return String(d.getFullYear());
  if (precision === "quarter") return T(dict, "whenQuarter", { n: Math.floor(d.getMonth() / 3) + 1, y: d.getFullYear() });
  if (precision === "month") return d.toLocaleDateString(loc, { month: "long", year: "numeric" });
  const abs = precision === "day"
    ? d.toLocaleDateString(loc, { day: "numeric", month: "short" })
    : d.toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (!full) return abs;
  const min = Math.round((d - Date.now()) / 60000);
  const rel = min < 0 ? T(dict, "whenPast")
    : min < 60 ? T(dict, "whenMin", { n: min })
    : min < 1440 ? T(dict, "whenHours", { n: Math.round(min / 60) })
    : T(dict, "whenDays", { n: Math.round(min / 1440) });
  return `${abs} · ${rel}`;
}

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
