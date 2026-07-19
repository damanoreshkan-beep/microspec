// horoscope — the client-side sun-sign lookup. The READING itself is no longer synthesized here: the app
// now shows the real daily horoscope from horoscope.com (professional astrologers), fetched + parsed by our
// VPS proxy (proxy/feed-proxy.mjs, GET /feed/horoscope) and cached per (sign, date) in the browser. All that
// remains on-device is mapping a birthday to its zodiac sign, so a first-launch user defaults to their own.

// Calendar-ordered sign starts: a date belongs to the LAST entry whose start it is ≥ (Jan 1–19 → Capricorn,
// which also opens the list, so the wrap at year-end needs no special case).
const ORDER = [[1, 1, 9], [1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3], [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9]];
export function sunSign(month, day) {   // month 1..12
  let idx = ORDER[0][2];
  for (const [m, d, s] of ORDER) if (month > m || (month === m && day >= d)) idx = s;
  return idx;
}
