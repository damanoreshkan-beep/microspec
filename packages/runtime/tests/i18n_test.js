// microspec runtime — i18n unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)


import { assert, assertEquals } from "jsr:@std/assert@1";
import { T, dictFor, ago, whenLabel } from "../i18n.js";

const i18n = { en: { hi: "hi" }, uk: { hi: "привіт" } };

Deno.test("T interpolates and falls back to the raw key", () => {
  assertEquals(T({ greet: "hi {name}" }, "greet", { name: "Dan" }), "hi Dan");
  assertEquals(T({}, "missing"), "missing");
  assertEquals(T({ n: "{a}+{b}={c}" }, "n", { a: 1, b: 2, c: 3 }), "1+2=3");
});

Deno.test("dictFor picks locale then falls back to en", () => {
  assertEquals(dictFor(i18n, "uk").hi, "привіт");
  assertEquals(dictFor(i18n, "de").hi, "hi"); // no de → en fallback
  assertEquals(dictFor(null, "en"), {});
});

Deno.test("ago is relative and locale-aware", () => {
  const d = { agoToday: "today", agoYesterday: "yesterday", agoDays: "{n}d", agoWeeks: "{n}w" };
  const day = 86400000;
  assertEquals(ago(d, Date.now() - day * 0.1, "en"), "today");
  assertEquals(ago(d, Date.now() - day, "en"), "yesterday");
  assertEquals(ago(d, Date.now() - day * 3, "en"), "3d");
  assertEquals(ago(d, Date.now() - day * 14, "en"), "2w");
  assert(/\d{4}/.test(ago(d, Date.now() - day * 400, "en"))); // old → full date with year
});

Deno.test("whenLabel: locale-aware absolute + future countdown", () => {
  const d = { whenPast: "now", whenMin: "in {n}m", whenHours: "in {n}h", whenDays: "in {n}d" };
  const uk = { whenPast: "щойно", whenMin: "за {n} хв", whenHours: "за {n} год", whenDays: "за {n} дн" };
  const min = 60000;
  assert(/in 30m$/.test(whenLabel(d, Date.now() + 30 * min, "en")), "en minutes");
  assert(/in 3h$/.test(whenLabel(d, Date.now() + 180 * min, "en")), "en hours");
  assert(/за 3 дн$/.test(whenLabel(uk, Date.now() + 3 * 1440 * min, "uk")), "uk days");
  assertEquals(whenLabel(d, Date.now() - min, "en").split(" · ").pop(), "now"); // past → now
  assert(!/·/.test(whenLabel(d, Date.now() + 30 * min, "en", false)), "full=false omits relative");
  assertEquals(whenLabel(d, undefined, "en"), ""); // bad ts → empty, never throws
});
