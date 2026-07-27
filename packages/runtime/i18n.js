
export const T = (dict, key, params) => {
  let s = dict?.[key] ?? key;
  if (params) for (const k in params) s = String(s).replaceAll("{" + k + "}", params[k]);
  return s;
};

export const dictFor = (i18n, locale) => i18n?.[locale] || i18n?.en || {};

export const SYS = {
  exit: { en: "Press Back again to exit", uk: "Натисніть «Назад» ще раз, щоб вийти" },
  deleted: { en: "Deleted", uk: "Видалено" },
  undo: { en: "Undo", uk: "Скасувати" },
  cancel: { en: "Cancel", uk: "Скасувати" },
  close: { en: "Close", uk: "Закрити" },
  share: { en: "Share app", uk: "Поділитися" },
  shareCopied: { en: "Link copied", uk: "Посилання скопійовано" },
  updateReady: { en: "New version ready", uk: "Нова версія готова" },
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
  apkRow: { en: "Download APK", uk: "Завантажити APK" },
  apkTitle: { en: "Download as APK", uk: "Завантажити як APK" },
  apkGenerate: { en: "Generate APK", uk: "Згенерувати APK" },
  apkGenerating: { en: "Signing…", uk: "Підписую…" },
  apkDone: { en: "APK ready", uk: "APK готовий" },
  apkErr: { en: "Couldn't build the APK", uk: "Не вдалося зібрати APK" },
  apkNote: {
    en: "Sideload only. On Samsung, turn Auto Blocker off (Settings → Security & privacy) or install over adb, then allow unknown sources.",
    uk: "Лише sideload. На Samsung вимкни Auto Blocker (Налаштування → Безпека і приватність) або встанови через adb, тоді дозволь невідомі джерела.",
  },
};
export const sys = (key, locale) => SYS[key]?.[locale] || SYS[key]?.en || "";

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

export function sinceLabel(dict, ts, locale) {
  const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
  if (isNaN(s)) return "";
  if (s < 5) return T(dict, "sinceNow");
  if (s < 60) return T(dict, "sinceSec", { n: s });
  if (s < 3600) return T(dict, "sinceMin", { n: Math.floor(s / 60) });
  if (s < 86400) return T(dict, "sinceHour", { n: Math.floor(s / 3600) });
  return T(dict, "sinceDay", { n: Math.floor(s / 86400) });
}

export function ago(dict, ts, locale) {
  const ms = Date.now() - Number(ts);
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return T(dict, "agoToday");
  if (days === 1) return T(dict, "agoYesterday");
  if (days < 7) return T(dict, "agoDays", { n: days });
  if (days < 31) return T(dict, "agoWeeks", { n: Math.floor(days / 7) });
  return new Date(Number(ts)).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}
