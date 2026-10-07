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
 * - {@link takeShared} — `takeShared(fn)`: `fn({ title, text, url, files })` for the share that opened the page (if
 *   any), and for every share the APK shell hands in later. Returns nothing; safe to call at module load.
 * - {@link firstLink} — `firstLink({ title, text, url })` → the first http(s) address in the three fields, or `""`.
 * - {@link takeFiles} — `takeFiles(caches, scope, n)` → the File[] a file share parked; exported for the unit test.
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
 * - FILES (`spec.share.files`): the worker parks them in the `ms-share` cache under the scope and lands the page on
 *   `./?sh_files=<n>`; they are collected here, delivered as `files: [File]`, and the cache entries are deleted —
 *   a share is read once. The APK shell still hands in text only.
 * @module
 */
import { shell } from "./shell.js";

const KEYS = ["sh_title", "sh_text", "sh_url", "sh_files"];
const SHARE_CACHE = "ms-share";   // mirrored in sw-core.js shareIn()

/**
 * Collect the files a file share parked in the share cache: `${scope}share-target/<i>` for i < n.
 * @param cacheStorage the CacheStorage to read (`caches`)
 * @param scope the app scope href the worker keyed them under
 * @param n how many the worker parked
 * @returns File[] in share order; entries that are missing are skipped, the rest are deleted after reading
 */
export async function takeFiles(cacheStorage, scope, n) {
  const out = [];
  try {
    const cache = await cacheStorage.open(SHARE_CACHE);
    for (let i = 0; i < Math.min(Number(n) || 0, 20); i++) {
      const key = `${scope}share-target/${i}`;
      const res = await cache.match(key);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get("x-ms-name") || `shared-${i}`);
      out.push(new File([await res.blob()], name, { type: res.headers.get("content-type") || "" }));
      await cache.delete(key);
    }
  } catch { /* no cache, no files */ }
  return out;
}
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
    const s = { title: u.searchParams.get("sh_title") || "", text: u.searchParams.get("sh_text") || "", url: u.searchParams.get("sh_url") || "", files: [] };
    const n = Number(u.searchParams.get("sh_files") || 0);
    for (const k of KEYS) u.searchParams.delete(k);
    const q = u.searchParams.toString();
    try { history.replaceState(null, "", u.pathname + (q ? `?${q}` : "") + u.hash); } catch { }
    if (n > 0 && typeof caches !== "undefined") takeFiles(caches, new URL("./", location.href).href, n).then((files) => deliver({ ...s, files }));
    else deliver(s);
  }
  if (shell.has("share.target")) {
    shell.call("share.target", { kinds: ["text"] }).catch(() => { });
    shell.subscribe("share.incoming", {}, (f) => { if (f?.text) deliver({ title: "", text: String(f.text), url: "" }); });
  }
}
