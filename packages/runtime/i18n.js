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
  exit: { en: "Press Back again to exit", uk: "Натисніть «Назад» ще раз, щоб вийти", ru: "Нажмите «Назад» ещё раз, чтобы выйти", de: "Zum Beenden erneut „Zurück“ drücken", pl: "Naciśnij Wstecz ponownie, aby wyjść" },
};
export const sys = (key, locale) => SYS[key]?.[locale] || SYS[key]?.en || "";

// Built-in chrome for the video player (/_rt/video.js) — shared by every video app, so no app duplicates it.
export const MEDIA = {
  player: { en: "Player", uk: "Плеєр", ru: "Плеер", de: "Player", pl: "Odtwarzacz" },
  back: { en: "Back", uk: "Назад", ru: "Назад", de: "Zurück", pl: "Wstecz" },
  loading: { en: "Connecting…", uk: "Підключення…", ru: "Подключение…", de: "Verbinde…", pl: "Łączenie…" },
  unavailable: { en: "Stream unavailable", uk: "Потік недоступний", ru: "Поток недоступен", de: "Stream nicht verfügbar", pl: "Strumień niedostępny" },
  openExternal: { en: "Open in player", uk: "Відкрити у плеєрі", ru: "Открыть в плеере", de: "Im Player öffnen", pl: "Otwórz w odtwarzaczu" },
  pip: { en: "Picture in picture", uk: "Картинка в картинці", ru: "Картинка в картинке", de: "Bild-in-Bild", pl: "Obraz w obrazie" },
  fullscreen: { en: "Fullscreen", uk: "На весь екран", ru: "На весь экран", de: "Vollbild", pl: "Pełny ekran" },
  exitFullscreen: { en: "Exit fullscreen", uk: "Вийти з повного екрана", ru: "Выйти из полного экрана", de: "Vollbild beenden", pl: "Zamknij pełny ekran" },
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
