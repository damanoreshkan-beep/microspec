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
