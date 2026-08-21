// microspec runtime — langid unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { detect, scoreAs, LANGS, MIN_GAP } from "../langid.js";

// ================= spoken-language pick over transcripts (langid.js) =================

Deno.test("langid: script alone separates English from the two Cyrillic languages", () => {
  assert(scoreAs("hello there how are you", "en") > 0.9);
  assertEquals(scoreAs("привіт як справи", "en"), 0);          // no Latin letters at all
  assertEquals(scoreAs("hello", "uk"), 0);                     // a Cyrillic language needs Cyrillic
});

Deno.test("langid: uk vs ru is decided by the letters exactly one language uses", () => {
  const uk = "це наш кіт і його їжа є смачною";               // і ї є present, no ы/ъ/э
  assert(scoreAs(uk, "uk") > scoreAs(uk, "ru"), "uk-only letters must make uk win its own text");
  const ru = "это мы были рады это большэ";                   // ы э present, no і/ї/є
  assert(scoreAs(ru, "ru") > scoreAs(ru, "uk"), "ru-only letters must make ru win its own text");
});

Deno.test("langid: the English model's Latin gibberish does NOT win a Cyrillic clip", () => {
  // The whole reason detect() pools script: en, fed Ukrainian audio, emits fluent Latin that would score
  // as perfect English if judged in isolation. The uk+ru models emit Cyrillic and outvote it 2:1.
  const candidates = {
    uk: "привіт мої рідні я їду до києва і буду там увечері",
    ru: "привет мои родные я еду до киева и буду там вечером",
    en: "pryvit moyi ridni",                                   // transliteration — pure Latin
  };
  const r = detect(candidates);
  assertEquals(r.lang, "uk");
  assert(!r.ambiguous, "a clear Ukrainian clip must not be flagged ambiguous");
  assertEquals(r.scores.uk === 0, false);
  assert(r.scores.en < r.scores.uk, "Latin minority must not beat the Cyrillic majority");
});

Deno.test("langid: a Russian clip is detected as ru over uk despite shared Cyrillic", () => {
  const r = detect({
    uk: "здрастуйте це були ми дуже раді вас бачити",
    ru: "здравствуйте это были мы очень рады вас видеть",
    en: "zdrastvuyte",
  });
  assertEquals(r.lang, "ru");
  assert(!r.ambiguous);
  assert(r.confidence > 0);
});

Deno.test("langid: a clean English clip is detected as en, with uk/ru zeroed", () => {
  const r = detect({
    uk: "сенк ю вері мач фор",                                 // uk model's transliteration
    ru: "сэнк ю вери мач фор",
    en: "thank you very much for the help today",
  });
  assertEquals(r.lang, "en");
  assert(!r.ambiguous);
  assertEquals(r.scores.uk, 0);
  assertEquals(r.scores.ru, 0);
});

Deno.test("langid: nothing recognised is AMBIGUOUS, never a default winner", () => {
  const r = detect({ uk: "", ru: "", en: "" });
  assertEquals(r.scores.uk, 0);
  assertEquals(r.scores.ru, 0);
  assertEquals(r.scores.en, 0);
  assert(r.ambiguous, "all-empty must ask for a manual pick, not silently commit");
  assert(r.confidence === 0);
});

Deno.test("langid: detect always returns one of the three languages and the ambiguity contract holds", () => {
  const r = detect({ uk: "привіт", ru: "привет", en: "" });
  assert(LANGS.includes(r.lang));
  assert(r.confidence >= 0);
  assert(typeof r.ambiguous === "boolean");
  assert(MIN_GAP > 0);
});
