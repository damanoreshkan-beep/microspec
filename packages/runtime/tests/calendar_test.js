// microspec runtime — calendar unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { addMonths, dayKey, markMap, monthGrid, monthKey } from "../calendar.js";
import { whenLabel } from "../i18n.js";

Deno.test("dayKey is LOCAL, never the ISO string's first ten characters", () => {
  // The bug this guards: a launch at 23:30Z is tomorrow east of Greenwich, and slicing the ISO text
  // silently puts it on the wrong square for half the planet.
  const d = new Date(2026, 8, 23, 23, 30);           // local 23 Sep, whatever the zone
  assertEquals(dayKey(d), "2026-09-23");
  assertEquals(monthKey(d), "2026-09");
  assertEquals(dayKey(new Date(2026, 0, 5)), "2026-01-05");   // zero-padded
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
  const g = monthGrid("2026-09");                     // Sep 2026 starts on a Tuesday, 30 days
  assertEquals(g.year, 2026);
  assertEquals(g.month, 9);
  assert(g.weeks.every((w) => w.length === 7), "every row is a week");
  assertEquals(g.weeks[0][0], null);                  // Monday blank — the 1st is a Tuesday
  assertEquals(g.weeks[0][1].key, "2026-09-01");
  const days = g.weeks.flat().filter(Boolean);
  assertEquals(days.length, 30);
  assertEquals(days.at(-1).key, "2026-09-30");
  // no trailing all-blank row: 1 lead + 30 days = 31 cells → 5 rows, not the usual fixed 6
  assertEquals(g.weeks.length, 5);
});

Deno.test("monthGrid: a 28-day February starting on the week's first day is exactly four rows", () => {
  const g = monthGrid("2026-02");                     // 1 Feb 2026 is a Sunday
  assertEquals(g.weeks.length, 5);
  assertEquals(monthGrid("2021-02").weeks.length, 4); // 1 Feb 2021 was a Monday — the clean case
  assertEquals(monthGrid("bad").weeks.length, 0);
});

Deno.test("monthGrid respects weekStart", () => {
  assertEquals(monthGrid("2026-09", 0).weeks[0][2].key, "2026-09-01"); // Sun-first → Tue is the 3rd cell
  assertEquals(monthGrid("2026-09", 1).weeks[0][1].key, "2026-09-01"); // Mon-first → the 2nd
});

Deno.test("markMap normalises an array, an object and a Map into counts", () => {
  assertEquals([...markMap(["2026-09-23", "2026-09-23", "2026-09-24"])], [["2026-09-23", 2], ["2026-09-24", 1]]);
  assertEquals(markMap({ "2026-09-23": 3 }).get("2026-09-23"), 3);
  assertEquals(markMap(new Map([["2026-09-23", 5]])).get("2026-09-23"), 5);
  assertEquals(markMap(null).size, 0);
});

Deno.test("whenLabel stops where the timestamp stops being true", () => {
  const d = { whenPast: "now", whenMin: "in {n}m", whenHours: "in {n}h", whenDays: "in {n}d", whenQuarter: "Q{n} {y}" };
  const t = new Date(2026, 11, 31, 0, 0);            // Launch Library's stand-in for "sometime in Q4 2026"
  assertEquals(whenLabel(d, t, "en", true, "quarter"), "Q4 2026");
  assertEquals(whenLabel(d, t, "en", true, "year"), "2026");
  assert(/2026/.test(whenLabel(d, t, "en", true, "month")));
  assert(!/00:00/.test(whenLabel(d, t, "en", true, "month")), "a month-precision date never prints a clock");
  assert(/·/.test(whenLabel(d, t, "en", true, "day")), "a day-precision date still counts down");
  assert(!/00:00/.test(whenLabel(d, t, "en", true, "day")), "…but does not invent a time of day");
  assert(/00:00|12:00 AM/.test(whenLabel(d, t, "en")), "no precision → the exact reading, unchanged");
  assertEquals(whenLabel(d, "rubbish", "en", true, "quarter"), "");
});
