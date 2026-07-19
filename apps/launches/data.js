import { fetchJson } from "/_rt/feed.js";

export async function load(filters = {}) {
  const url = filters.cursor || "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15&hide_recent_previous=true";
  const data = await fetchJson(url);
  if (!Array.isArray(data.results)) throw new Error("unavailable"); 
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
