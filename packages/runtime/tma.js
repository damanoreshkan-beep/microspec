/* @ts-self-types="./tma.d.ts" */
/**
 * # runtime/tma.js — the farm as a Telegram Mini App
 *
 * Two things, both inert outside Telegram: run the app natively INSIDE Telegram (expand to full height), and
 * take a **Stars tip** ("support the maker") — the farm's own native billing, no Gumroad/Stripe. Distribution
 * and payment on one rail: an app shared in a chat is a link, and the tip is paid in the same window.
 *
 * Telegram launches a Mini App with `#tgWebAppData=…` in the URL, so the official SDK
 * (telegram.org/js/telegram-web-app.js) is injected ONLY when that marker is present — a normal web/PWA visit
 * loads nothing and pays nothing. Verified against core.telegram.org/bots/webapps: `openInvoice(url, cb)`
 * [Bot API 6.1+] whose callback status is one of `paid | cancelled | failed | pending`, and
 * `ready()` / `expand()` / `requestFullscreen()` [8.0+]. The server (edge/stars.js) validates the caller's
 * initData and mints the XTR invoice; nothing here trusts the client.
 *
 * `start()` (index.js) calls {@link initTelegram} once; the profile tab (render.js) shows a Support card
 * gated on {@link inTelegram} and pays through {@link payStars}.
 * @module
 */
import { VPS_PROXY } from "./feed.js";

/** True when this page was opened as a Telegram Mini App (the launch marker is in the URL, available at once). */
export function inTelegram() {
  try { return typeof location !== "undefined" && /tgWebApp/.test((location.hash || "") + (location.search || "")); }
  catch { return false; }
}

/** The live SDK object, or null. */
export function tg() { try { return (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) || null; } catch { return null; } }

let sdk = null;
function loadSdk() {
  if (sdk) return sdk;
  sdk = new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const have = tg();
    if (have) return resolve(have);
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = () => resolve(tg());
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return sdk;
}

/**
 * Install the Mini App behaviour once. A no-op unless the page was actually launched from Telegram, so every
 * one of the farm's apps can call it at boot with no cost to a plain web visit.
 */
export async function initTelegram() {
  if (!inTelegram()) return;
  const w = await loadSdk();
  if (!w || !w.initData) return;
  try { w.ready(); } catch { /* SDK too old */ }
  try { w.expand(); } catch { /* */ }
  try { if (w.isVersionAtLeast && w.isVersionAtLeast("8.0")) w.requestFullscreen && w.requestFullscreen(); } catch { /* */ }
}

/**
 * Pay a Stars tip. Returns Telegram's own callback status — `"paid"` is the only success and is still
 * confirmed server-side by the webhook — or `"unsupported"` (not in Telegram / SDK too old) / `"error"`.
 * @param stars whole number of Telegram Stars
 */
export async function payStars(stars) {
  const w = tg();
  if (!w || !w.initData) return "unsupported";
  if (w.isVersionAtLeast && !w.isVersionAtLeast("6.1")) return "unsupported";
  let link;
  try {
    const r = await fetch(`${VPS_PROXY}/stars/invoice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stars, initData: w.initData }),
    });
    const j = await r.json();
    link = j && j.link;
  } catch { return "error"; }
  if (!link) return "error";
  return await new Promise((resolve) => {
    try { w.openInvoice(link, (status) => resolve(status || "failed")); }
    catch { resolve("error"); }
  });
}
