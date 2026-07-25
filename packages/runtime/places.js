import { gate } from "./gate.js";

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

const DIGRAPHS = [["зг", "zgh"], ["ЗГ", "ZGh"], ["Зг", "Zgh"]];
const MAP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i",
  ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ъ: "", ы: "y", э: "e", ё: "e",
};
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

export function toPlace(r) {
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || !r.timezone) return null;
  return {
    id: r.id, name: r.name, country: r.country || "", countryCode: r.country_code || "",
    region: r.admin1 || "",
    lat: r.latitude, lng: r.longitude, zone: r.timezone,
  };
}

export function placeLabel(p) {
  if (!p) return "";
  const region = p.region && p.region !== p.name ? p.region : "";
  return [p.name, [region, p.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

export function formatCoords(lat, lng) {
  const one = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
    const carry = m === 60;
    return `${d + (carry ? 1 : 0)}°${String(carry ? 0 : m).padStart(2, "0")}'${v < 0 ? neg : pos}`;
  };
  return `${one(lat, "N", "S")} ${one(lng, "E", "W")}`;
}

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
