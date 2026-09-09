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
  applyInsets(w);
  routeStartApp(w);
}

/**
 * Fullscreen [8.0+] makes Telegram's header transparent and floats the close/⋯ controls OVER the app, so the
 * top of our chrome must clear them. Telegram measures that band as `contentSafeAreaInset` (the room Telegram's
 * own UI takes) on top of `safeAreaInset` (the device notch). Recent clients publish both as the CSS variables
 * `--tg-{safe,content-safe}-area-inset-*` on their own, but older ones only expose the JS objects — so we mirror
 * them onto :root under the SAME names and keep them fresh as the client fires its change events. theme.css's
 * `--ms-safe-top` then reads them; outside Telegram they are absent (→ 0) and the chrome falls back to `env()`.
 */
function applyInsets(w) {
  try {
    const root = document.documentElement;
    const set = (name, v) => { try { root.style.setProperty(name, (Number(v) || 0) + "px"); } catch { /* */ } };
    const push = () => {
      const s = w.safeAreaInset || {}, c = w.contentSafeAreaInset || {};
      for (const side of ["top", "right", "bottom", "left"]) {
        set(`--tg-safe-area-inset-${side}`, s[side]);
        set(`--tg-content-safe-area-inset-${side}`, c[side]);
      }
    };
    push();
    if (w.onEvent) for (const ev of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"]) {
      try { w.onEvent(ev, push); } catch { /* an unknown event on an old SDK is harmless */ }
    }
    // In fullscreen the header is transparent; give Telegram a solid tone so the clock/battery stay legible.
    try { w.setHeaderColor && w.setHeaderColor("bg_color"); } catch { /* keyword unsupported on old SDK */ }
  } catch { /* insets are an enhancement — never break boot */ }
}

/**
 * The orchestrator's routing: one bot, one Main Mini App (the store launcher), every app reachable at
 * `t.me/<bot>?startapp=<appid>`. That deep link opens the launcher with a start param; from the ROOT we send
 * the viewer on to that app's own page. A slug guard keeps a bad link from redirecting anywhere odd, and we
 * only redirect from the root, so the target app (and every non-root page) never loops.
 */
export function startParam(w) {
  try {
    const tgw = w || tg();
    let p = (tgw && tgw.initDataUnsafe && tgw.initDataUnsafe.start_param) || "";
    if (!p) { const m = /[?&#]tgWebAppStartParam=([^&]+)/.exec((location.hash || "") + (location.search || "")); if (m) p = decodeURIComponent(m[1]); }
    return /^[a-z0-9_-]{1,64}$/.test(p) ? p : "";
  } catch { return ""; }
}

function routeStartApp(w) {
  try {
    const sp = startParam(w);
    const atRoot = location.pathname === "/" || location.pathname === "/index.html";
    if (sp && atRoot) location.replace("/" + sp + "/");
  } catch { /* a failed route must not break boot */ }
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

/**
 * A little Stars salute — a confetti burst on a throwaway top-layer canvas, for the moment a tip lands. Self
 * contained (no dependency), auto-removes after ~1.3 s, and stays silent under `prefers-reduced-motion`.
 */
export function celebrate() {
  try {
    if (typeof document === "undefined") return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none";
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    document.body.appendChild(c);
    const colors = ["#FFD54A", "#FF6B6B", "#4ECDC4", "#A78BFA", "#FFB81C", "#66E0A3"];
    const cx = innerWidth / 2, cy = innerHeight * 0.6;
    const parts = Array.from({ length: 110 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1, v = 5 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: colors[(Math.random() * colors.length) | 0], s: 4 + Math.random() * 5, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4 };
    });
    let t = 0;
    const tick = () => {
      t++; ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.99; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 80); ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62);
        ctx.restore();
      }
      if (t < 80) requestAnimationFrame(tick); else c.remove();
    };
    requestAnimationFrame(tick);
  } catch { /* a celebration must never throw */ }
}
