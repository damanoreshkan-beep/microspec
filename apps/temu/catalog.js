// temu — real product data. Each category maps to a search QUERY run live against AliExpress through our
// proxy (GET /feed/shop). `dev mode` ON uses the hacker/dev query (the joke: every category quietly becomes
// the black-hoodie / ThinkPad / Flipper-Zero starter pack); OFF uses the loud mainstream query. No static
// catalog — the products, images and prices are real and current.
import { letterTile } from "/_rt/tile.js";

export const CATS = [
  { id: "apparel", icon: "lucide:shirt",       dev: "plain black hoodie",          main: "rgb gaming hoodie led" },
  { id: "keebs",   icon: "lucide:keyboard",    dev: "mechanical keyboard hotswap", main: "rgb gaming keyboard mouse combo" },
  { id: "rigs",    icon: "lucide:laptop",      dev: "thinkpad laptop",             main: "cheap 2 in 1 laptop windows" },
  { id: "pocket",  icon: "lucide:smartphone",  dev: "google pixel phone",          main: "phone cooler rgb clip" },
  { id: "redteam", icon: "lucide:radio-tower", dev: "flipper zero",                main: "fake security camera dummy" },
  { id: "homelab", icon: "lucide:server",      dev: "raspberry pi 5",              main: "wifi signal booster sticker" },
  { id: "deskops", icon: "lucide:lamp-desk",   dev: "monitor arm gas spring",      main: "rgb desk mat led" },
  { id: "fuel",    icon: "lucide:coffee",      dev: "yerba mate gourd bombilla",   main: "pre workout energy blue" },
  { id: "carry",   icon: "lucide:backpack",    dev: "tech backpack ballistic nylon", main: "anti theft backpack usb" },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

// Headless gate/mock has no network → a deterministic fixture derived from the query, so the shot + e2e are
// stable AND still change when the query changes (dev-mode toggle / category switch). Images are offline
// letter-tiles (the shared /_rt/tile.js helper).
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
