// "Nearby" — points of interest around you via Overpass (OpenStreetMap). CORS-friendly mirror (the main
// overpass-api.de 406s bot-like requests; kumi works). Geo is read here: real location, else Kyiv fallback
// (so it renders everywhere incl. the headless gate). Category comes from filters.category (refetch).
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const KYIV = { lat: 50.45, lng: 30.52 };
const CATS = {
  pharmacy: { l: "Аптеки", tag: '["amenity"="pharmacy"]' },
  atm: { l: "Банкомати", tag: '["amenity"="atm"]' },
  cafe: { l: "Кав’ярні", tag: '["amenity"="cafe"]' },
  fuel: { l: "АЗС", tag: '["amenity"="fuel"]' },
  drinking_water: { l: "Питна вода", tag: '["amenity"="drinking_water"]' },
  shelter: { l: "Укриття", tag: '["emergency"="shelter"]' },
  supermarket: { l: "Супермаркети", tag: '["shop"="supermarket"]' },
};

function pos() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({ ...KYIV, approx: true });
    let done = false;
    const settle = (v) => { if (!done) { done = true; res(v); } };
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => settle({ ...KYIV, approx: true }),
      { timeout: 6000, maximumAge: 60000 },
    );
    setTimeout(() => settle({ ...KYIV, approx: true }), 7000); // headless / hung geo
  });
}

const R = 6371000;
const rad = (d) => d * Math.PI / 180;
function distM(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtDist = (m) => m < 950 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1)} км`;

export async function load(filters) {
  const key = CATS[filters.category] ? filters.category : "pharmacy";
  const c = CATS[key];
  const p = await pos();
  const q = `[out:json][timeout:20];(nwr${c.tag}(around:2500,${p.lat},${p.lng}););out center 50;`;
  const url = "https://overpass.kumi.systems/api/interpreter?data=" + encodeURIComponent(q);
  const data = JSON.parse(await viaProxy(url, isJsonObject));

  const items = (data.elements || []).map((e) => {
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    if (lat == null) return null;
    const d = distM(p, { lat, lng });
    const addr = [e.tags?.["addr:street"], e.tags?.["addr:housenumber"]].filter(Boolean).join(" ");
    return {
      id: `${e.type}/${e.id}`,
      name: e.tags?.name || e.tags?.["operator"] || c.l.replace(/и$|і$/, ""),
      addr,
      dist: d,
      distStr: fmtDist(d),
      maps: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    };
  }).filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 40);

  return {
    items,
    meta: {
      count: items.length,
      where: p.approx ? " · Київ (дозволь геолокацію)" : "",
      categories: Object.entries(CATS).map(([v, c]) => ({ v, l: c.l })),
    },
  };
}
