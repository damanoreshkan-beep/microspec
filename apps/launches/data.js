// Space launches adapter (Launch Library 2 by The Space Devs). CORS * → direct, no backend; the
// 15 req/hour limit is PER IP, so each user has their own budget (a shared proxy would be worse here).
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const MON = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];
const pad2 = (n) => String(n).padStart(2, "0");

function when(net, full) {
  const d = new Date(net);
  const date = `${d.getDate()} ${MON[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const ms = d - Date.now(), min = Math.round(ms / 60000);
  let rel;
  if (ms < 0) rel = "щойно";
  else if (min < 60) rel = `за ${min} хв`;
  else if (min < 1440) rel = `за ${Math.round(min / 60)} год`;
  else rel = `за ${Math.round(min / 1440)} дн`;
  return full ? `${date} · ${rel}` : `${date} · ${rel}`;
}

export async function load() {
  const url = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15&hide_recent_previous=true";
  const data = JSON.parse(await viaProxy(url, isJsonObject));
  if (!Array.isArray(data.results)) throw new Error("unavailable"); // e.g. 429 throttle → error state, not empty
  const items = data.results.map((r) => ({
    id: r.id,
    title: r.name,
    provider: r.launch_service_provider?.name || "",
    status: r.status?.abbrev || "",
    when: when(r.net),
    whenFull: when(r.net, true),
    thumb: r.image || "",
    rocket: r.rocket?.configuration?.full_name || r.rocket?.configuration?.name || "",
    pad: [r.pad?.name, r.pad?.location?.name].filter(Boolean).join(", "),
    mission: r.mission?.description || "",
    url: r.vidURLs?.[0]?.url || "",
  }));
  return { items, meta: {} };
}
