// temu — real product data. Each category is a live AliExpress search (through our /feed/shop proxy). No
// dev-mode toggle: the whole app IS the curated hacker/dev marketplace — every category is the version an
// engineer would actually buy (mechanical keyboards, ThinkPads, Flipper Zero…). Real products, images,
// prices and discounts.
import { letterTile } from "/_rt/tile.js";

export const CATS = [
  { id: "keebs",   icon: "lucide:keyboard",    q: "mechanical keyboard hotswap" },
  { id: "rigs",    icon: "lucide:laptop",      q: "thinkpad laptop" },
  { id: "pocket",  icon: "lucide:smartphone",  q: "google pixel phone" },
  { id: "redteam", icon: "lucide:radio-tower", q: "flipper zero" },
  { id: "homelab", icon: "lucide:server",      q: "raspberry pi" },
  { id: "deskops", icon: "lucide:lamp-desk",   q: "monitor arm single" },
  { id: "apparel", icon: "lucide:shirt",       q: "plain black hoodie men" },
  { id: "fuel",    icon: "lucide:coffee",      q: "yerba mate gourd" },
  { id: "carry",   icon: "lucide:backpack",    q: "tech backpack laptop" },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

// Headless gate/mock has no network → a deterministic fixture derived from the query, so the shot + e2e are
// stable and still change when the category does. Images are offline letter-tiles (shared /_rt/tile.js).
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
