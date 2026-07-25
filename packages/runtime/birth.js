// microspec runtime — the birth record: what the user typed, and the exact instant it resolves to.
//
// This is the seam between a form and the chart maths. The record stores what a birth certificate says —
// wall-clock date, wall-clock time, a place — because that is the only thing anyone actually knows. The
// instant is DERIVED, never stored, so a fixed tz database or a corrected longitude improves every old
// record for free.
//
// Three ways to name the offset, in the order a real user needs them:
//   place  — the place's IANA zone. Correct for essentially every modern birth, and correct for historic
//            ones too, because tzdata carries Local Mean Time (Ulm 1879 = +00:53:28).
//   lmt    — true sun time from the longitude alone. What published pre-1880 charts use, and the honest
//            answer when the zone is unknown or the town straddles a border that moved.
//   manual — a literal offset from the birth certificate. A civil record beats any database, so this wins.
//
// Deliberately dependency-free — no nanostores, no DOM — so the whole thing unit-tests offline. The app
// owns the persistent atom (a one-liner with JSON_CODEC); this module owns the meaning.
import { zonedToUTC, parseOffset, formatOffset, lmtOffset, knownZone } from "./natal.js";

export const EMPTY = { date: "", time: "", zoneMode: "place", offset: "", place: null };
// The codec an app's persistentAtom wants for a record of this shape.
export const BIRTH_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s) || null; } catch { return null; } } };

// "14:32" / "14:32:07" / "14:32:07.250" → { h, mi, s, ms }, or null. Seconds are optional because most
// people know the minute; when they DO know the second, it is not thrown away.
export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(String(str || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = +(m[3] || 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return { h, mi, s, ms: +((m[4] || "0").padEnd(3, "0")) };
}

// "1990-07-15" → { y, mo, d }, or null. Rejects the impossible (31 Feb) rather than letting Date roll it over.
export function parseDate(str) {
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(2000, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1) return null;              // 31 Apr / 30 Feb never existed
  if (mo === 2 && d === 29) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) return null;
  }
  return { y, mo, d };
}

// Is the record complete enough to draw a chart?
export const isComplete = (rec) => !!(rec && parseDate(rec.date) && parseTime(rec.time) && rec.place &&
  Number.isFinite(rec.place.lat) && Number.isFinite(rec.place.lng));

// The record → everything the chart needs, or { ok: false, reason }. `reason` names the single missing
// thing so the form can point at it; a half-resolved chart is never returned.
export function resolve(rec) {
  const date = parseDate(rec?.date);
  if (!date) return { ok: false, reason: "date" };
  const time = parseTime(rec?.time);
  if (!time) return { ok: false, reason: "time" };
  const place = rec.place;
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return { ok: false, reason: "place" };

  const wall = { ...date, ...time };
  const mode = rec.zoneMode || "place";
  let zone;
  if (mode === "manual") {
    const off = parseOffset(rec.offset);
    if (off == null) return { ok: false, reason: "offset" };
    zone = { offsetMs: off };
  } else if (mode === "lmt") {
    zone = { offsetMs: lmtOffset(place.lng) };
  } else {
    if (!place.zone || !knownZone(place.zone)) return { ok: false, reason: "zone" };
    zone = place.zone;
  }
  const r = zonedToUTC(wall, zone);
  if (!r) return { ok: false, reason: "zone" };
  return {
    ok: true, ms: r.ms, date: new Date(r.ms), offset: r.offset, offsetLabel: formatOffset(r.offset),
    ambiguous: r.ambiguous, nonexistent: r.nonexistent, mode,
    lat: place.lat, lng: place.lng, place, zone: mode === "place" ? place.zone : null,
  };
}
