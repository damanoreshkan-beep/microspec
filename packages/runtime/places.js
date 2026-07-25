// microspec runtime — place lookup for birth data (SYSTEMIC).
//
// A natal chart needs a place, and it needs it as three things at once: latitude (for the Ascendant),
// longitude (for the local sidereal time) and an IANA time zone (to turn the wall clock in the birth room
// into a UTC instant, honouring whatever rule was in force that year). Open-Meteo's geocoder returns all
// three from one keyless, CORS-open request, so no proxy and no key are involved.
//
// The pure parts (transliteration, result shaping, labels) unit-test offline; only `searchPlaces` touches
// the network, and it never runs under the gate.
import { gate } from "./gate.js";

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

// The geocoder's index is per-language and holds no Ukrainian, so "Київ" finds nothing while "Kyiv" is a
// direct hit. Rather than send a Ukrainian user to an English keyboard (or worse, query the Russian index
// and hand back "Киев"), Cyrillic input is transliterated with the official Ukrainian romanisation
// (KMU 1996/2010) — the same scheme that produced the English names in the index, so Львів → Lviv,
// Одеса → Odesa, Чернівці → Chernivtsi all land. Verified against the live index.
const DIGRAPHS = [["зг", "zgh"], ["ЗГ", "ZGh"], ["Зг", "Zgh"]];
const MAP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i",
  ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ъ: "", ы: "y", э: "e", ё: "e",
};
// Word-initial letters romanise differently in the official scheme (є→ye, ї→yi, й→y, ю→yu, я→ya).
const INITIAL = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };

export const isCyrillic = (s) => /[Ѐ-ӿ]/.test(String(s || ""));

export function translit(input) {
  let s = String(input || "");
  for (const [from, to] of DIGRAPHS) s = s.split(from).join(to);
  let out = "", atWordStart = true;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const table = atWordStart && INITIAL[lower] ? INITIAL : MAP;
    const mapped = table[lower];
    if (mapped == null) { out += ch; atWordStart = !/[\p{L}\p{N}']/u.test(ch); continue; }
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    atWordStart = false;
  }
  return out;
}

// One geocoder row → the shape the chart actually consumes. Rows without a zone are dropped: a place we
// cannot time is useless here, and guessing a zone from longitude would silently corrupt the chart.
export function toPlace(r) {
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || !r.timezone) return null;
  return {
    id: r.id, name: r.name, country: r.country || "", countryCode: r.country_code || "",
    region: r.admin1 || "",
    lat: r.latitude, lng: r.longitude, zone: r.timezone,
  };
}

// "Ulm · Baden-Wurttemberg, Germany". The region is dropped when it merely repeats the city (a capital is
// usually its own oblast/state) — done HERE rather than at parse time, so the rule holds for any place
// object, including one restored from an older stored shape.
export function placeLabel(p) {
  if (!p) return "";
  const region = p.region && p.region !== p.name ? p.region : "";
  return [p.name, [region, p.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

// Latitude/longitude as an astrologer writes them: 48°24'N 10°00'E.
export function formatCoords(lat, lng) {
  const one = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
    const carry = m === 60;
    return `${d + (carry ? 1 : 0)}°${String(carry ? 0 : m).padStart(2, "0")}'${v < 0 ? neg : pos}`;
  };
  return `${one(lat, "N", "S")} ${one(lng, "E", "W")}`;
}

// Search the geocoder. Cyrillic input is sent both verbatim and transliterated, and the two result sets are
// merged (dedup by id) so a user may type in either script. Returns [] on any failure — a dead geocoder
// must degrade to "type coordinates yourself", never to a thrown view.
export async function searchPlaces(query, { count = 8, signal } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2 || gate) return [];
  const queries = isCyrillic(q) ? [translit(q), q] : [q];
  const runs = await Promise.all(queries.map(async (name) => {
    try {
      const url = `${ENDPOINT}?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`;
      const res = await fetch(url, { signal });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.results) ? json.results : [];
    } catch { return []; }
  }));
  const seen = new Set(), out = [];
  for (const row of runs.flat()) {
    const p = toPlace(row);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.slice(0, count);
}
