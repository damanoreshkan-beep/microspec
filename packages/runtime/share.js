/* @ts-self-types="./share.d.ts" */
/**
 * # runtime/share.js — what another app shared with this one
 *
 * An app with `share: true` in its spec is listed in the OS share sheet; the manifest's share target lands
 * the share on `./?sh_title=…&sh_text=…&sh_url=…` (the APK shell delivers it as a `share.incoming` event
 * instead). This is the one place that reads it: once, before the view mounts, with the parameters stripped
 * from the address bar so a reload or a bookmark does not share it again.
 *
 * ## Import
 * ```js
 * import { takeShared, firstLink } from "/_rt/share.js";
 * ```
 *
 * ## What it exports
 * - {@link takeShared} — `takeShared(fn)`: `fn({ title, text, url })` for the share that opened the page (if
 *   any), and for every share the APK shell hands in later. Returns nothing; safe to call at module load.
 * - {@link firstLink} — `firstLink({ title, text, url })` → the first http(s) address in the three fields, or `""`.
 *
 * ## In practice
 * ```js
 * takeShared((s) => { const link = firstLink(s); if (link) { $link.set(link); find(link); } });
 * ```
 *
 * ## Invariants and pitfalls
 * - The parameters are taken from `location` at import time and removed with `replaceState`; a share is
 *   delivered to every `takeShared` caller registered before or after — it is held until the first one.
 * - A share that carries no link is still delivered: the app decides what text means to it.
 * @module
 */
import { shell } from "./shell.js";

const KEYS = ["sh_title", "sh_text", "sh_url"];
const LINK = /https?:\/\/[^\s<>"']+/i;
let held = null;
const takers = [];

/**
 * The first http(s) link inside a share's fields.
 * @param s `{ title, text, url }`
 * @returns the address, trailing punctuation dropped, or `""`
 */
export function firstLink(s) {
  for (const f of [s?.url, s?.text, s?.title]) {
    const m = typeof f === "string" && f.match(LINK);
    if (m) return m[0].replace(/[.,;:!?)\]'"]+$/, "");
  }
  return "";
}

function deliver(s) {
  if (!takers.length) { held = s; return; }
  for (const fn of takers) { try { fn(s); } catch { } }
}

/**
 * Registers the app's handler for shares — the one that opened the page and any the APK shell brings later.
 * @param fn called with `{ title, text, url }`
 */
export function takeShared(fn) {
  takers.push(fn);
  if (held) { const s = held; held = null; try { fn(s); } catch { } }
}

if (typeof location !== "undefined") {
  const u = new URL(location.href);
  if (KEYS.some((k) => u.searchParams.has(k))) {
    const s = { title: u.searchParams.get("sh_title") || "", text: u.searchParams.get("sh_text") || "", url: u.searchParams.get("sh_url") || "" };
    for (const k of KEYS) u.searchParams.delete(k);
    const q = u.searchParams.toString();
    try { history.replaceState(null, "", u.pathname + (q ? `?${q}` : "") + u.hash); } catch { }
    deliver(s);
  }
  if (shell.has("share.target")) {
    shell.call("share.target", { kinds: ["text"] }).catch(() => { });
    shell.subscribe("share.incoming", {}, (f) => { if (f?.text) deliver({ title: "", text: String(f.text), url: "" }); });
  }
}
