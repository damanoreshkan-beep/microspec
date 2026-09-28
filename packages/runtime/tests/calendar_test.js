import { assert, assertEquals } from "jsr:@std/assert@1";
import { addMonths, dayKey, markMap, monthGrid, monthKey } from "../calendar.js";
import { whenLabel } from "../i18n.js";

Deno.test("dayKey is LOCAL, never the ISO string's first ten characters", () => {
  const d = new Date(2026, 8, 23, 23, 30);
  assertEquals(dayKey(d), "2026-09-23");
  assertEquals(monthKey(d), "2026-09");
  assertEquals(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assertEquals(dayKey("not a date"), "");
});

Deno.test("addMonths crosses the year in both directions", () => {
  assertEquals(addMonths("2026-12", 1), "2027-01");
  assertEquals(addMonths("2026-01", -1), "2025-12");
  assertEquals(addMonths("2026-09", 0), "2026-09");
  assertEquals(addMonths("2026-09", -13), "2025-08");
  assertEquals(addMonths("nonsense", 1), "");
});

Deno.test("monthGrid lays the month out in whole weeks and pads only the last row", () => {
  const g = monthGrid("2026-09");
  assertEquals(g.year, 2026);
  assertEquals(g.month, 9);
  assert(g.weeks.every((w) => w.length === 7), "every row is a week");
  assertEquals(g.weeks[0][0], null);
  assertEquals(g.weeks[0][1].key, "2026-09-01");
  const days = g.weeks.flat().filter(Boolean);
  assertEquals(days.length, 30);
  assertEquals(days.at(-1).key, "2026-09-30");
  assertEquals(g.weeks.length, 5);
});

Deno.test("monthGrid: a 28-day February starting on the week's first day is exactly four rows", () => {
  const g = monthGrid("2026-02");
  assertEquals(g.weeks.length, 5);
  assertEquals(monthGrid("2021-02").weeks.length, 4);
  assertEquals(monthGrid("bad").weeks.length, 0);
});

Deno.test("monthGrid respects weekStart", () => {
  assertEquals(monthGrid("2026-09", 0).weeks[0][2].key, "2026-09-01");
  assertEquals(monthGrid("2026-09", 1).weeks[0][1].key, "2026-09-01");
});

Deno.test("markMap normalises an array, an object and a Map into counts", () => {
  assertEquals([...markMap(["2026-09-23", "2026-09-23", "2026-09-24"])], [["2026-09-23", 2], ["2026-09-24", 1]]);
  assertEquals(markMap({ "2026-09-23": 3 }).get("2026-09-23"), 3);
  assertEquals(markMap(new Map([["2026-09-23", 5]])).get("2026-09-23"), 5);
  assertEquals(markMap(null).size, 0);
});

Deno.test("whenLabel stops where the timestamp stops being true", () => {
  const d = { whenPast: "now", whenMin: "in {n}m", whenHours: "in {n}h", whenDays: "in {n}d", whenQuarter: "Q{n} {y}" };
  const t = new Date(2026, 11, 31, 0, 0);
  assertEquals(whenLabel(d, t, "en", true, "quarter"), "Q4 2026");
  assertEquals(whenLabel(d, t, "en", true, "year"), "2026");
  assert(/2026/.test(whenLabel(d, t, "en", true, "month")));
  assert(!/00:00/.test(whenLabel(d, t, "en", true, "month")), "a month-precision date never prints a clock");
  assert(/·/.test(whenLabel(d, t, "en", true, "day")), "a day-precision date still counts down");
  assert(!/00:00/.test(whenLabel(d, t, "en", true, "day")), "…but does not invent a time of day");
  assert(/00:00|12:00 AM/.test(whenLabel(d, t, "en")), "no precision → the exact reading, unchanged");
  assertEquals(whenLabel(d, "rubbish", "en", true, "quarter"), "");
});
