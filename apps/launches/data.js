// Space launches adapter (Launch Library 2 by The Space Devs). CORS * → direct, no backend; the
// 15 req/hour limit is PER IP, so each user has their own budget (a shared proxy would be worse here).
import { viaProxy, isJsonObject } from "/_rt/feed.js";

export async function load(filters = {}) {
  // Infinite scroll: LL2 returns a `next` URL (offset-paged); use it verbatim as the cursor.
  const url = filters.cursor || "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15&hide_recent_previous=true";
  const data = JSON.parse(await viaProxy(url, isJsonObject));
  if (!Array.isArray(data.results)) throw new Error("unavailable"); // e.g. 429 throttle → error state, not empty
  const items = data.results.map((r) => ({
    id: r.id,
    title: r.name,
    provider: r.launch_service_provider?.name || "",
    status: r.status?.abbrev || "",
    net: r.net,
    thumb: r.image || "",
    rocket: r.rocket?.configuration?.full_name || r.rocket?.configuration?.name || "",
    pad: [r.pad?.name, r.pad?.location?.name].filter(Boolean).join(", "),
    mission: r.mission?.description || "",
    url: r.vidURLs?.[0]?.url || "",
  }));
  return { items, meta: {}, next: data.next || null };
}
