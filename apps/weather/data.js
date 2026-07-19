// Weather adapter (Open-Meteo — no key, CORS *, rock-solid). Fixed location: Kyiv.
import { fetchJson } from "/_rt/feed.js";

// WMO weather_code → lucide icon
const wicon = (c) =>
  c === 0 ? "lucide:sun" :
  c <= 2 ? "lucide:cloud-sun" :
  c === 3 ? "lucide:cloud" :
  c <= 48 ? "lucide:cloud-fog" :
  c <= 57 ? "lucide:cloud-drizzle" :
  c <= 67 ? "lucide:cloud-rain" :
  c <= 77 ? "lucide:snowflake" :
  c <= 82 ? "lucide:cloud-rain-wind" :
  c <= 86 ? "lucide:cloud-snow" :
  "lucide:cloud-lightning";

export async function load() {
  const u = "https://api.open-meteo.com/v1/forecast?latitude=50.45&longitude=30.52" +
    "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature" +
    "&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code" +
    "&timezone=auto&forecast_days=5";
  const d = await fetchJson(u);
  const now = d.current;

  const start = Math.max(0, d.hourly.time.findIndex((t) => t >= now.time));
  const hourly = d.hourly.time.slice(start, start + 12).map((t, i) => ({
    time: t.slice(11, 16),
    temp: Math.round(d.hourly.temperature_2m[start + i]),
    wicon: wicon(d.hourly.weather_code[start + i]),
  }));

  const items = d.daily.time.map((t, i) => ({
    day: t, // raw ISO — the dashboard renders the weekday locale-aware (days.weekday); never bake it here
    hi: Math.round(d.daily.temperature_2m_max[i]),
    lo: Math.round(d.daily.temperature_2m_min[i]),
    wicon: wicon(d.daily.weather_code[i]),
  }));

  return {
    items,
    meta: {
      place: "place", // i18n key — the dashboard localises it via T()
      temp: Math.round(now.temperature_2m),
      wicon: wicon(now.weather_code),
      feels: Math.round(now.apparent_temperature),
      humidity: now.relative_humidity_2m,
      wind: Math.round(now.wind_speed_10m),
      hourly,
    },
  };
}
