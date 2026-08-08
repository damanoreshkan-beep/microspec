// microspec runtime — birth unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolve, isComplete, parseDate, parseTime, EMPTY } from "../birth.js";

Deno.test("birth/parseDate+parseTime: reject what a Date would silently roll over", () => {
  assertEquals(parseDate("1990-07-15"), { y: 1990, mo: 7, d: 15 });
  assertEquals(parseDate("1879-03-14"), { y: 1879, mo: 3, d: 14 });
  assertEquals(parseDate("1990-02-30"), null, "30 February never happened");
  assertEquals(parseDate("1990-04-31"), null, "April has 30 days");
  assertEquals(parseDate("1900-02-29"), null, "1900 was not a leap year");
  assertEquals(parseDate("2000-02-29"), { y: 2000, mo: 2, d: 29 }, "2000 was");
  assertEquals(parseDate("1990-13-01"), null);
  assertEquals(parseDate(""), null);
  assertEquals(parseTime("14:32"), { h: 14, mi: 32, s: 0, ms: 0 });
  assertEquals(parseTime("14:32:07"), { h: 14, mi: 32, s: 7, ms: 0 });
  assertEquals(parseTime("14:32:07.25"), { h: 14, mi: 32, s: 7, ms: 250 }, "a known fraction is not thrown away");
  assertEquals(parseTime("24:00"), null);
  assertEquals(parseTime("14:60"), null);
});

Deno.test("birth/resolve: the three zone modes, and the one thing that is missing", () => {
  const ulm = { name: "Ulm", lat: 48.4, lng: 10, zone: "Europe/Berlin", country: "Germany" };
  const rec = { date: "1879-03-14", time: "11:30", zoneMode: "place", place: ulm };

  // the place's zone — tzdata knows 1879 Ulm ran on Berlin's Local Mean Time
  const byZone = resolve(rec);
  assert(byZone.ok);
  assertEquals(byZone.offsetLabel, "+00:53:28");
  assertEquals(byZone.ms, Date.parse("1879-03-14T10:36:32Z"));

  // true LMT from the longitude — 10 E is exactly 40 minutes of sun ahead, which is how the published
  // reference chart for this birth is calculated
  const byLmt = resolve({ ...rec, zoneMode: "lmt" });
  assertEquals(byLmt.offsetLabel, "+00:40");
  assertEquals(byLmt.ms, Date.parse("1879-03-14T10:50:00Z"));

  // a birth certificate beats every database
  const byHand = resolve({ ...rec, zoneMode: "manual", offset: "+01:00" });
  assertEquals(byHand.ms, Date.parse("1879-03-14T10:30:00Z"));
  assertEquals(resolve({ ...rec, zoneMode: "manual", offset: "nonsense" }).reason, "offset");

  // each missing piece is named, so the form can point at it instead of failing vaguely
  assertEquals(resolve({}).reason, "date");
  assertEquals(resolve({ date: "1990-07-15" }).reason, "time");
  assertEquals(resolve({ date: "1990-07-15", time: "12:00" }).reason, "place");
  assertEquals(resolve({ ...rec, place: { ...ulm, zone: "Europe/Atlantis" } }).reason, "zone");
  assert(!isComplete({ date: "1990-07-15", time: "12:00" }));
  assert(isComplete(rec));

  // the DST flags survive the whole pipeline, so the form can warn instead of quietly picking one
  const amb = resolve({ date: "2021-10-31", time: "03:30", zoneMode: "place",
    place: { lat: 50.45, lng: 30.52, zone: "Europe/Kyiv" } });
  assert(amb.ambiguous, "that hour ran twice in Kyiv");
  const gap = resolve({ date: "2021-03-28", time: "03:30", zoneMode: "place",
    place: { lat: 50.45, lng: 30.52, zone: "Europe/Kyiv" } });
  assert(gap.nonexistent, "that hour never ran at all");
});
