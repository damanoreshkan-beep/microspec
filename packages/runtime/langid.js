// microspec runtime — spoken-language pick for tgvoice, over CANDIDATE TRANSCRIPTS, not audio.
//
// tgvoice runs one CTC model per language (uk/ru/en), each producing a transcript for the same clip. A CTC
// decoder gives no comparable cross-model likelihood (sherpa's greedy path never stores the chosen
// log-prob, and `lang` is empty for CTC — see apps/tgvoice/RESEARCH.md), so the honest discriminator is the
// ORTHOGRAPHY of what each model wrote: a model fed the wrong language emits few of ITS own distinctive
// letters. This is deterministic and needs no extra model — the whole reason three separate models are
// tractable for "auto language".
//
// The trap that shaped this: scoring each transcript in isolation is WRONG for en. The English model, fed
// Ukrainian audio, emits fluent-looking Latin gibberish that scores as perfect English — so its own
// transcript is no evidence of the language. The signal is JOINT: on Cyrillic speech the uk AND ru models
// both emit Cyrillic and outvote the en model 2:1. So detect() decides SCRIPT from all three transcripts
// pooled, then, if Cyrillic, splits uk vs ru by the letters exactly one language uses:
//   uk-only: і ї є ґ      ru-only: ы ъ э ё   (и exists in both, commoner in ru — too weak to rely on)
//
// Pure + unit-tested. The caller supplies { uk, ru, en } transcripts of the SAME window; detect() returns
// the winning lang, per-language scores, and a confidence gap so the UI can fall back to a manual pick when
// two languages tie (a very short or noisy clip).

export const LANGS = ["uk", "ru", "en"];

// Letters that belong to exactly one of our three languages. Lowercased; the caller need not normalise case.
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

// How well one transcript READS as a given language, in [0, 1]. The score rewards writing in the right
// script and, within Cyrillic, using the language's own distinctive letters; it punishes the other
// language's exclusive letters. An empty transcript scores 0 for every language — a model that recognised
// nothing must not win by default.
export function scoreAs(text, lang) {
  const c = counts(text);
  if (c.letters === 0) return 0;
  if (lang === "en") return c.latin / c.letters;                       // script alone decides en
  if (c.cyr === 0) return 0;                                           // a Cyrillic language, no Cyrillic
  const scriptFit = c.cyr / c.letters;                                 // mostly-Cyrillic is table stakes
  const own = lang === "uk" ? c.ukOnly : c.ruOnly;
  const foe = lang === "uk" ? c.ruOnly : c.ukOnly;
  // Per-letter evidence, capped so one distinctive letter is strong but a longer clip is not required. The
  // net can go negative (foreign-only letters) — clamped into [0,1] with scriptFit as the base.
  const distinct = Math.max(-1, Math.min(1, (own - foe) / Math.max(3, c.cyr * 0.15)));
  return Math.max(0, Math.min(1, scriptFit * (0.6 + 0.4 * distinct)));
}

// detect({uk, ru, en}) → { lang, scores, confidence, ambiguous }
//   lang        the winning language
//   scores      { uk, ru, en } each in [0,1] — en is the pooled Latin fraction; uk/ru are scoreAs of their
//               own transcripts, zeroed when the joint vote says the clip is Latin (so a transliteration
//               cannot masquerade as Cyrillic content)
//   confidence  winner minus runner-up (0 = a tie the UI should not trust)
//   ambiguous   confidence < MIN_GAP or nothing recognised — offer the manual picker instead
export const MIN_GAP = 0.15;

export function detect(candidates) {
  // SCRIPT first, pooled across all three transcripts. Each model is biased to its own script, so the
  // majority script of the pooled letters is the audio's script: two Cyrillic models outvote one Latin.
  let latin = 0, cyr = 0;
  for (const lang of LANGS) { const c = counts(candidates?.[lang]); latin += c.latin; cyr += c.cyr; }
  const total = latin + cyr;

  const scores = { uk: 0, ru: 0, en: 0 };
  if (total === 0) return { lang: "uk", scores, confidence: 0, ambiguous: true };  // nothing recognised

  if (latin >= cyr) {
    // Latin clip → English. uk/ru stay 0: their own Latin transliteration is not Cyrillic content.
    scores.en = latin / total;
  } else {
    // Cyrillic clip → the pair, decided by distinctive letters in the uk and ru transcripts. en is scored
    // as the Latin minority, so it can still win only if the clip is genuinely Latin (handled above).
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
