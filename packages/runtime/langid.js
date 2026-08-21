
export const LANGS = ["uk", "ru", "en"];

const UK_ONLY = "іїєґ";
const RU_ONLY = "ыъэё";
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[a-z]/;

function counts(text) {
  const s = (text || "").toLowerCase();
  let latin = 0, cyr = 0, ukOnly = 0, ruOnly = 0, letters = 0;
  for (const ch of s) {
    if (LATIN.test(ch)) { latin++; letters++; }
    else if (CYRILLIC.test(ch)) {
      cyr++; letters++;
      if (UK_ONLY.includes(ch)) ukOnly++;
      else if (RU_ONLY.includes(ch)) ruOnly++;
    }
  }
  return { latin, cyr, ukOnly, ruOnly, letters };
}

export function scoreAs(text, lang) {
  const c = counts(text);
  if (c.letters === 0) return 0;
  if (lang === "en") return c.latin / c.letters;                       // script alone decides en
  if (c.cyr === 0) return 0;                                           
  const scriptFit = c.cyr / c.letters;                                 
  const own = lang === "uk" ? c.ukOnly : c.ruOnly;
  const foe = lang === "uk" ? c.ruOnly : c.ukOnly;
  const distinct = Math.max(-1, Math.min(1, (own - foe) / Math.max(3, c.cyr * 0.15)));
  return Math.max(0, Math.min(1, scriptFit * (0.6 + 0.4 * distinct)));
}

export const MIN_GAP = 0.15;

export function detect(candidates) {
  let latin = 0, cyr = 0;
  for (const lang of LANGS) { const c = counts(candidates?.[lang]); latin += c.latin; cyr += c.cyr; }
  const total = latin + cyr;

  const scores = { uk: 0, ru: 0, en: 0 };
  if (total === 0) return { lang: "uk", scores, confidence: 0, ambiguous: true };  

  if (latin >= cyr) {
    scores.en = latin / total;
  } else {
    scores.uk = scoreAs(candidates?.uk, "uk");
    scores.ru = scoreAs(candidates?.ru, "ru");
    scores.en = latin / total;
  }

  const ranked = LANGS.slice().sort((a, b) => scores[b] - scores[a]);
  const lang = ranked[0];
  const confidence = scores[ranked[0]] - scores[ranked[1]];
  const ambiguous = scores[lang] === 0 || confidence < MIN_GAP;
  return { lang, scores, confidence, ambiguous };
}
