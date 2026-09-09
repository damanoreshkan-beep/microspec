/**
 * # runtime/tma.js — the farm as a Telegram Mini App
 *
 * Run the app natively inside Telegram (expand to full height) and take a Stars tip ("support the maker") —
 * the farm's own native billing, no Gumroad/Stripe. Inert outside Telegram: the official SDK is injected only
 * when the page was launched as a Mini App (the `#tgWebAppData` marker). The server (edge/stars.js) validates
 * the caller's initData and mints the XTR invoice; nothing here trusts the client. `start()` calls
 * {@link initTelegram}; the profile tab (render.js) shows a Support card gated on {@link inTelegram}.
 *
 * @module
 */

/** True when this page was opened as a Telegram Mini App (the launch marker is in the URL, available at once). */
export function inTelegram(): boolean;

/** The live Telegram WebApp SDK object, or null when not present. */
export function tg(): any;

/** Install the Mini App behaviour once (expand, fullscreen). A no-op unless launched from Telegram. */
export function initTelegram(): Promise<void>;

/**
 * Pay a Stars tip. Resolves to Telegram's callback status — `"paid" | "cancelled" | "failed" | "pending"` —
 * or `"unsupported"` (not in Telegram / SDK too old) / `"error"`. `"paid"` is confirmed server-side too.
 * @param stars whole number of Telegram Stars
 */
export function payStars(stars: number): Promise<string>;
