import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { tr, warm, trTick, isTranslated, CONTENT_LANG } from "./translate.js";
import { polish, warmPolish, aiTick, isPolished } from "./ai-text.js";
import { gate } from "./gate.js";

export function useLocalized(text, locale, { timeout = 6000 } = {}) {
  useStore(trTick);                                              
  useStore(aiTick);                                             
  const src = typeof text === "string" ? text.trim() : "";
  const translated = tr(src, locale);
  const finalText = polish(translated, locale);
  const done = !src || locale === CONTENT_LANG || gate || (isTranslated(src, locale) && isPolished(translated, locale));

  const [revealed, setRevealed] = useState(done);
  useEffect(() => {
    if (done) { setRevealed(true); return; }
    setRevealed(false);
    warm([src], locale);
    const timer = setTimeout(() => setRevealed(true), timeout);
    return () => clearTimeout(timer);
  }, [src, locale, done]);
  useEffect(() => {
    if (!gate && translated && translated !== src) warmPolish([translated], locale);
  }, [translated, locale]);

  const ready = done || revealed;
  return { text: ready ? finalText : "", pending: !ready };
}
