
export const T = (dict, key, params) => {
  let s = dict?.[key] ?? key;
  if (params) for (const k in params) s = String(s).replaceAll("{" + k + "}", params[k]);
  return s;
};

export const dictFor = (i18n, locale) => i18n?.[locale] || i18n?.en || {};

export function ago(dict, ts, locale) {
  const ms = Date.now() - Number(ts);
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return T(dict, "agoToday");
  if (days === 1) return T(dict, "agoYesterday");
  if (days < 7) return T(dict, "agoDays", { n: days });
  if (days < 31) return T(dict, "agoWeeks", { n: Math.floor(days / 7) });
  return new Date(Number(ts)).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}
