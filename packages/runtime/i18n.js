// microspec runtime — tiny i18n (pure, zero-dependency).
//
// The whole UI is translated through T(): no static English in the render layer. A locale dict is a
// flat { key: string } map; T() interpolates {param} tokens and falls back to the raw key on a miss
// (so a missing translation shows as a visible key, never a crash or blank).

// T(dict, key, params?) — e.g. T(dict, "saved {n}", { n: 3 }) → "saved 3"
export const T = (dict, key, params) => {
  let s = dict?.[key] ?? key;
  if (params) for (const k in params) s = String(s).replaceAll("{" + k + "}", params[k]);
  return s;
};

// Pick the active dict for a locale, falling back to en (the required fallback locale).
export const dictFor = (i18n, locale) => i18n?.[locale] || i18n?.en || {};

// Built-in runtime strings — chrome shared by EVERY app, so they live here (not each app's i18n dict).
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
  // Clean screen (S.clean): the runtime's chrome steps off a full-bleed surface. Both halves live here for
  // the same reason `close` does — the runtime paints the door, so the runtime owns its name; an app that
  // merely asks for the mode must not have to restate it in two locales.
  clean: { en: "Clean screen", uk: "Чистий екран" },
  cleanExit: { en: "Show controls", uk: "Показати керування" },
  share: { en: "Share app", uk: "Поділитися" },
  shareCopied: { en: "Link copied", uk: "Посилання скопійовано" },
  updateReady: { en: "New version ready", uk: "Нова версія готова" },
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
export const sys = (key, locale) => SYS[key]?.[locale] || SYS[key]?.en || "";

// Built-in chrome for the video player (/_rt/video.js) — shared by every video app, so no app duplicates it.
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
export const media = (key, locale) => MEDIA[key]?.[locale] || MEDIA[key]?.en || "";

// Locale-aware absolute+relative timestamp for `format: "when"` (future events — launch countdowns,
// schedules). Absolute part via Intl (locale month + HH:MM); relative countdown uses the i18n keys
// whenPast / whenMin({n}) / whenHours({n}) / whenDays({n}). Kept in the runtime so a data.js never bakes
// a language into a date string. `full:false` omits the relative tail.
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
export function ago(dict, ts, locale) {
  const ms = Date.now() - Number(ts);
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return T(dict, "agoToday");
  if (days === 1) return T(dict, "agoYesterday");
  if (days < 7) return T(dict, "agoDays", { n: days });
  if (days < 31) return T(dict, "agoWeeks", { n: Math.floor(days / 7) });
  return new Date(Number(ts)).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}
