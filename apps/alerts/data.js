// Air-raid alerts adapter (alerts.in.ua). The API is token-gated (Bearer) AND rate-limited, so it MUST
// go through our proxy: the proxy injects the secret server-side (never in this client) and caches ~15s
// so many users = one upstream call. On any failure we THROW → the runtime shows an error state, never a
// false "all clear" (critical for an alert app). ?mock=1 renders sample data for the gate / UX review.
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const VPS_PROXY = "https://jobs-map.mooo.com/feed";
const proxied = (u) => (isLocal ? "/feed" : VPS_PROXY) + "?url=" + encodeURIComponent(u);

const TYPE = {
  air_raid: "Повітряна тривога",
  artillery_shelling: "Загроза артобстрілу",
  urban_fights: "Вуличні бої",
  chemical: "Хімічна загроза",
  nuclear: "Ядерна загроза",
};

const MOCK = [
  { id: 1, location_title: "Київська область", alert_type: "air_raid", started_at: new Date(Date.now() - 12 * 60000).toISOString(), finished_at: null, location_oblast: "Київська область" },
  { id: 2, location_title: "Харківська область", alert_type: "air_raid", started_at: new Date(Date.now() - 47 * 60000).toISOString(), finished_at: null, location_oblast: "Харківська область" },
  { id: 3, location_title: "Сумська область", alert_type: "artillery_shelling", started_at: new Date(Date.now() - 90 * 60000).toISOString(), finished_at: null, location_oblast: "Сумська область" },
];

function build(alerts) {
  const active = alerts.filter((a) => !a.finished_at);
  active.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const items = active.map((a) => {
    const hhmm = new Date(a.started_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    return {
      id: String(a.id),
      title: a.location_title,
      typeLabel: TYPE[a.alert_type] || "Тривога",
      since: "з " + hhmm,
      oblast: a.location_oblast || "",
    };
  });
  return { items, meta: { count: items.length } };
}

export async function load() {
  if (new URLSearchParams(location.search).get("mock")) return build(MOCK);
  const r = await fetch(proxied("https://api.alerts.in.ua/v1/alerts/active.json"));
  const data = JSON.parse(await r.text());
  if (!Array.isArray(data.alerts)) throw new Error("alerts unavailable"); // 401 / error → error state, not false calm
  return build(data.alerts);
}
