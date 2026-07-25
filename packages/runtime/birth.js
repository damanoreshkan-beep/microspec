import { zonedToUTC, parseOffset, formatOffset, lmtOffset, knownZone } from "./natal.js";

export const EMPTY = { date: "", time: "", zoneMode: "place", offset: "", place: null };
export const BIRTH_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s) || null; } catch { return null; } } };

export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(String(str || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = +(m[3] || 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return { h, mi, s, ms: +((m[4] || "0").padEnd(3, "0")) };
}

export function parseDate(str) {
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(2000, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1) return null;              
  if (mo === 2 && d === 29) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) return null;
  }
  return { y, mo, d };
}

export const isComplete = (rec) => !!(rec && parseDate(rec.date) && parseTime(rec.time) && rec.place &&
  Number.isFinite(rec.place.lat) && Number.isFinite(rec.place.lng));

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
