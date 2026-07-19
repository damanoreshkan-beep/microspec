// temu — categories are CONCEPTS, not single products. Each concept means something a dev/hacker cares about
// (privacy, homelab, ergonomics…) and pulls SEVERAL relevant AliExpress searches (via /feed/shop), which the
// view interleaves into one feed. So the app is driven by meaning, not by one hardcoded product query.
import { letterTile } from "/_rt/tile.js";

export const CATS = [
  { id: "keebs",   icon: "lucide:keyboard",    queries: ["mechanical keyboard hotswap", "keyboard keycaps pbt", "keyboard switches tactile"] },
  { id: "rigs",    icon: "lucide:laptop",      queries: ["thinkpad laptop", "framework laptop", "usb c docking station"] },
  { id: "stealth", icon: "lucide:shield-off",  queries: ["graphene pixel phone", "faraday signal blocking bag", "usb data blocker"] },
  { id: "redteam", icon: "lucide:radio-tower", queries: ["flipper zero", "proxmark rfid", "usb rubber ducky"] },
  { id: "homelab", icon: "lucide:server",      queries: ["raspberry pi", "mini pc n100", "nas enclosure hotswap"] },
  { id: "ergo",    icon: "lucide:activity",    queries: ["split ergonomic keyboard", "trackball mouse", "monitor arm single"] },
  { id: "uniform", icon: "lucide:shirt",       queries: ["plain black hoodie men", "techwear cargo pants", "merino beanie"] },
  { id: "fuel",    icon: "lucide:coffee",      queries: ["yerba mate gourd", "aeropress coffee maker", "electrolyte tablets"] },
  { id: "carry",   icon: "lucide:backpack",    queries: ["tech backpack laptop", "cable organizer pouch", "titanium multitool keychain"] },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

// Headless gate/mock has no network → a deterministic fixture derived from the concept's first query, so the
// shot + e2e are stable and change with the category. Images are offline letter-tiles (shared /_rt/tile.js).
export function gateFixture(q) {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `gate-${q}-${i}`.replace(/\s+/g, "-"),
    title: `${q} · sample ${i + 1}`,
    img: letterTile(q + " " + i, { w: 350, h: 350, sat: 28, light: 26 }),
    price: `US $${(9.9 + i * 7).toFixed(2)}`,
    orig: i % 2 ? `US $${(19.9 + i * 9).toFixed(2)}` : null,
    discount: i % 2 ? 40 + i : null,
    url: "https://www.aliexpress.com/",
  }));
}
