export const TRANSLATE = {
  gtx: "https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={q}",
  timeout: 8000,
  concurrency: 6,
  english: { from: "auto", mode: "english", bucket: "_en", error: "no English for the prompt", code: "eTranslate" },
};
