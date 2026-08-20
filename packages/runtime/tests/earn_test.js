// microspec runtime — earn unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import {
  CURRENCIES, MODES, DEFAULTS, normRate, perSecond, earned, hoardFill, lifetimeDepth,
  rateDp, fmtAmount, fmtSpan, vaultTotals,
} from "../earn.js";

const NBSP = "\u00A0";

// ---- rate normalisation ------------------------------------------------------

Deno.test("normRate: unknown mode and blank fields fall back to the mode default", () => {
  assertEquals(normRate({ mode: "weekly" }).mode, "month");
  assertEquals(normRate({ mode: "month", pay: "" }).pay, DEFAULTS.month.pay);
  assertEquals(normRate({ mode: "shift", hours: 0 }).hours, DEFAULTS.shift.hours);
  assertEquals(normRate({ mode: "day", currency: "EUR" }).currency, "UAH");   // farm carries two here
  assertEquals(normRate(null).mode, "month");
});

Deno.test("normRate: only `month` keeps a day count — a shift is one block by definition", () => {
  assertEquals(normRate({ mode: "shift", days: 30, hours: 12 }).days, 1);
  assertEquals(normRate({ mode: "day", days: 21, hours: 8 }).days, 1);
  assertEquals(normRate({ mode: "month", days: 22 }).days, 22);
});

Deno.test("normRate: a comma decimal is a real keyboard on a uk phone", () => {
  assertEquals(normRate({ mode: "day", pay: "1200,50", hours: "7,5" }).pay, 1200.5);
  assertEquals(normRate({ mode: "day", hours: "7,5" }).hours, 7.5);
});

// ---- the per-second rate -----------------------------------------------------

Deno.test("perSecond: the work clock, not the calendar", () => {
  // 30 000 / month over 21 days x 8 h = 604 800 s of work
  assertAlmostEquals(perSecond({ mode: "month", pay: 30000, days: 21, hours: 8 }), 30000 / 604800, 1e-12);
  // a calendar month would be ~2.6M s — an order of magnitude apart, which is the whole point
  assertEquals(perSecond({ mode: "month", pay: 30000, days: 21, hours: 8 }) > 30000 / 2592000, true);
  assertAlmostEquals(perSecond({ mode: "shift", pay: 1600, hours: 12 }), 1600 / 43200, 1e-12);
  assertAlmostEquals(perSecond({ mode: "day", pay: 1400, hours: 8 }), 1400 / 28800, 1e-12);
});

Deno.test("perSecond: shift and day are the same formula at different block lengths", () => {
  assertEquals(
    perSecond({ mode: "shift", pay: 1200, hours: 8 }),
    perSecond({ mode: "day", pay: 1200, hours: 8 }),
  );
});

Deno.test("earned: elapsed milliseconds, clamped at zero", () => {
  assertAlmostEquals(earned(0.05, 60000), 3, 1e-12);
  assertEquals(earned(0.05, -5000), 0);     // a clock skewed backwards must not owe money
  assertEquals(earned(-1, 60000), 0);
});

// ---- the shader channels -----------------------------------------------------

Deno.test("hoardFill: saturating on the WORK, so any salary fills in the same day", () => {
  const ps = 0.05;
  const at = (h) => hoardFill(earned(ps, h * 3600 * 1000), ps);
  assertAlmostEquals(at(4), 0.632, 0.002);
  assertAlmostEquals(at(8), 0.865, 0.002);
  assertAlmostEquals(at(12), 0.950, 0.002);
  // a salary 100x larger reaches the same height in the same time — the scale is hours, not money
  const rich = 5;
  assertAlmostEquals(hoardFill(earned(rich, 8 * 3600 * 1000), rich), at(8), 1e-9);
  assertEquals(hoardFill(0, ps), 0);
  assertEquals(hoardFill(1e12, ps) <= 1, true);
});

Deno.test("hoardFill / lifetimeDepth: a zero rate never divides by zero", () => {
  assertEquals(Number.isFinite(hoardFill(10, 0)), true);
  assertEquals(Number.isFinite(lifetimeDepth(10, 0)), true);
});

Deno.test("lifetimeDepth: one month of work ≈ 0.63, not one day", () => {
  const ps = 0.05;
  const month = earned(ps, 21 * 8 * 3600 * 1000);
  assertAlmostEquals(lifetimeDepth(month, ps), 0.632, 0.002);
  assertEquals(lifetimeDepth(earned(ps, 8 * 3600 * 1000), ps) < 0.06, true);
});

// ---- formatting --------------------------------------------------------------

Deno.test("rateDp: a small per-second rate keeps its information", () => {
  assertEquals(rateDp(2.5), 2);
  assertEquals(rateDp(0.05), 3);
  assertEquals(rateDp(0.0049), 4);
});

Deno.test("fmtAmount: NBSP thousands, comma decimal, symbol side per currency", () => {
  assertEquals(fmtAmount(12480.25, "UAH"), `12${NBSP}480,25${NBSP}₴`);
  assertEquals(fmtAmount(12480.25, "USD"), `$12${NBSP}480,25`);
  assertEquals(fmtAmount(0.0231, "UAH", 4), `0,0231${NBSP}₴`);
  assertEquals(fmtAmount(-5, "USD"), "$-5,00");
});

Deno.test("fmtAmount: decimals are FIXED — a ticker that changes width jitters", () => {
  assertEquals(fmtAmount(12, "UAH"), `12,00${NBSP}₴`);
  assertEquals(fmtAmount(12.5, "UAH"), `12,50${NBSP}₴`);
  assertEquals(fmtAmount(12.05, "UAH"), `12,05${NBSP}₴`);
});

Deno.test("fmtAmount: rounding up carries into the integer part", () => {
  assertEquals(fmtAmount(1.999, "USD"), "$2,00");
  assertEquals(fmtAmount(0.9999, "USD"), "$1,00");
  assertEquals(fmtAmount(NaN, "USD"), "$0,00");
});

Deno.test("fmtSpan: hours appear only once there are hours", () => {
  assertEquals(fmtSpan(0), "00:00");
  assertEquals(fmtSpan(59_000), "00:59");
  assertEquals(fmtSpan(12 * 60_000 + 4000), "12:04");
  assertEquals(fmtSpan(3 * 3600_000 + 12 * 60_000 + 4000), "3:12:04");
  assertEquals(fmtSpan(9 * 3600_000), "9:00:00");     // player.js clock() would print "540:00"
  assertEquals(fmtSpan(-1), "00:00");
});

// ---- the vault ---------------------------------------------------------------

Deno.test("vaultTotals: grouped per currency, in CURRENCIES order", () => {
  const t = vaultTotals([
    { currency: "USD", amount: 40, ms: 3600_000 },
    { currency: "UAH", amount: 1200, ms: 28800_000 },
    { currency: "UAH", amount: 300.5, ms: 7200_000 },
    { currency: "PLN", amount: 99, ms: 1000 },        // unknown → folded into the first currency
  ]);
  assertEquals(t.map((x) => x.currency), CURRENCIES);
  assertEquals(t[0], { currency: "UAH", sum: 1599.5, ms: 36001_000, count: 3 });
  assertEquals(t[1], { currency: "USD", sum: 40, ms: 3600_000, count: 1 });
  assertEquals(vaultTotals([]), []);
  assertEquals(vaultTotals(null), []);
});

Deno.test("MODES / CURRENCIES: every mode carries a default the form can fall back to", () => {
  for (const m of MODES) assertEquals(typeof DEFAULTS[m].pay, "number");
  assertEquals(CURRENCIES, ["UAH", "USD"]);
});
