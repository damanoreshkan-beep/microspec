import { assert, assertEquals } from "jsr:@std/assert@1";
import { LOCALES, DETECT } from "../locales.js";
import { appLocales, firstLocale, intlLocale, telegramLanguage, LOCALE_LABEL, SYS, MEDIA } from "../i18n.js";

const three = { en: { hi: "hi" }, uk: { hi: "привіт" }, ru: { hi: "привет" } };
const two = { en: { hi: "hi" }, uk: { hi: "привіт" } };
// A Telegram launch hash as the client builds it: tgWebAppData is itself a query string whose `user` is JSON.
const tgHash = (code) => "#tgWebAppData=" + encodeURIComponent(new URLSearchParams({ user: JSON.stringify({ id: 1, language_code: code }), auth_date: "1" }).toString()) + "&tgWebAppVersion=8.0";

Deno.test("locales: the core's default is the behaviour products had before — uk then en, no detection", () => {
  assertEquals(LOCALES, ["uk", "en"]);
  assertEquals(DETECT, false);
  assertEquals(firstLocale(two), "uk");
  assertEquals(firstLocale(two, { telegram: "en", browser: ["en-GB"] }), "uk", "without DETECT nothing is detected");
});

Deno.test("locales: an app offers the product's locales it has a dictionary for, in the product's order", () => {
  assertEquals(appLocales(three, ["en", "uk", "ru"]), ["en", "uk", "ru"]);
  assertEquals(appLocales(two, ["en", "uk", "ru"]), ["en", "uk"]);
  assertEquals(appLocales({ de: {} }, ["en"]), ["de"], "an app with none of them still has one");
});

Deno.test("locales: with DETECT a first visit follows Telegram, then the browser, then the fallback", () => {
  const env = { offered: ["en", "uk", "ru"], detect: true };
  assertEquals(firstLocale(three, { ...env, telegram: "ru", browser: ["uk-UA"] }), "ru", "Telegram wins");
  assertEquals(firstLocale(three, { ...env, telegram: "de", browser: ["de-DE", "uk-UA", "en"] }), "uk", "the first offered browser language");
  assertEquals(firstLocale(three, { ...env, telegram: "", browser: ["fr-FR"] }), "en", "the fallback");
  assertEquals(firstLocale(two, { ...env, telegram: "ru", browser: [] }), "en", "an app without ru does not open in ru");
});

Deno.test("locales: the Telegram client's language is read from the launch URL; outside Telegram it is empty", () => {
  assertEquals(telegramLanguage(tgHash("ru")), "ru");
  assertEquals(telegramLanguage(tgHash("pt-br")), "pt");
  assertEquals(telegramLanguage("#section"), "");
  assertEquals(telegramLanguage("#tgWebAppData=garbage%7B"), "");
});

Deno.test("locales: Intl locales and switcher labels for every offered code", () => {
  assertEquals([intlLocale("uk"), intlLocale("en"), intlLocale("ru"), intlLocale("xx")], ["uk-UA", "en-US", "ru-RU", "en-US"]);
  assertEquals([LOCALE_LABEL.uk, LOCALE_LABEL.en, LOCALE_LABEL.ru], ["UA", "EN", "RU"]);
});

Deno.test("locales: every runtime chrome string exists in en, uk and ru", () => {
  for (const [name, table] of [["SYS", SYS], ["MEDIA", MEDIA]]) {
    for (const [k, v] of Object.entries(table)) for (const l of ["en", "uk", "ru"]) assert(v[l], `${name}.${k} has no ${l}`);
  }
});
