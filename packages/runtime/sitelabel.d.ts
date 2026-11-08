/**
 * # runtime/sitelabel.js — what a page is called, derived from its URL, never fetched
 *
 * A subscriptions list is N rows, and N round-trips through the proxy to read each page's `<title>` would
 * make the tab slow, flaky and useless offline — while the URL already carries the answer on almost every
 * site that lists videos (`/free-stock-video/space/`, `/wiki/Category:Underwater_videos`, `/search?q=cats`).
 * This module turns a URL into the name a human reads in a list row and groups pages by the site they belong
 * to. It is pure, DOM-free and network-free, so it is unit-tested, deterministic in the gate and correct
 * offline. Its lesson is where decoding happens: every producer hands over machine text (a percent-encoded
 * path, an entity-laden scraped title, a filename that is both), and one literal `%` used to throw URIError
 * for the whole string and take the row down with it. {@link humanText} is the one answer, applied where the
 * text ENTERS a label — never at render, which is how two screens end up disagreeing about the same page.
 *
 * ![sitelabel — URL in, site name, page label and domain groups out](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sitelabel.svg)
 *
 * ## Import
 * ```js
 * import { sourceTitle, groupByDomain, siteName } from "/_rt/sitelabel.js";                    // an app's page: the import map resolves /_rt/
 * import { sourceTitle, groupByDomain, siteName } from "@microspec/core/runtime/sitelabel.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Text**
 * - {@link humanText} — machine text (percent-encoded, entity-laden, or both) to the text a person reads; never throws.
 *
 * **Site**
 * - {@link hostOf} — the hostname without a leading `www.`; a non-URL comes back as itself.
 * - {@link registrableDomain} — the site: `commons.wikimedia.org` → `wikimedia.org`, `bbc.co.uk` stays `bbc.co.uk`.
 * - {@link siteName} — the capitalised label before the public suffix (`mixkit.co` → `Mixkit`).
 *
 * **Page**
 * - {@link pageLabelInfo} — `{ label, weak }` from the URL; `weak: true` means only a shape was found and the page should be asked for its own title.
 * - {@link pageLabel} — the label half of pageLabelInfo.
 * - {@link isWeakLabel} — true when every token is a medium word, an id, or an id wearing a word's clothes ("View video", "Video81234567").
 * - {@link cleanPageTitle} — a page's OWN title with the site chrome cut off its ends; "" when nothing worth showing is left.
 * - {@link sourceTitle} — THE answer: a URL that names the page wins, then `pageTitle`, then `hint`, then the shape.
 *
 * **Groups**
 * - {@link groupByDomain} — `[{ domain, name, items }]` in first-appearance order; `items` keep their input order.
 *
 * ## In practice
 * ```js
 * import { sourceTitle, groupByDomain } from "/_rt/sitelabel.js";                       // reel
 *
 * // The ONE place a source's name is decided, so the island and the sources list cannot drift apart.
 * function setSrcTitle(url, opts) {
 *   const title = sourceTitle(url, opts);             // opts: { pageTitle, hint, max }
 *   $srcTitle.set(title);
 *   renameSub(url, title);
 *   return title;
 * }
 *
 * // A list row has room to wrap: one cap for BOTH producers, so a name never ends in "…" with lines spare.
 * const rowName = sourceTitle(s.url, { pageTitle: s.name, max: ROW_MAX });
 *
 * // The sources screen: mine, then presets I have not subscribed to, each grouped by site.
 * const mine = groupByDomain(subs);
 * const discover = groupByDomain(PRESETS.filter((p) => !subbedUrls.has(p.url)));
 * ```
 *
 * ## How it fits
 * The only runtime import is `resolveSearch` from `urlquery.js`, which lets a search results page be titled
 * by its term. Nothing else in the runtime imports it; `tests/sitelabel_test.js` pins the derivations and
 * `sitelabel.local_test.js` runs the real-host cases that stay out of the public repo. Two farm apps import
 * it — reel (every place a source is named: the list row, the island, the drag-reveal) and apkforge
 * (`siteName` only).
 *
 * ## Invariants and pitfalls
 * - Decode where text enters a label, never at render: `humanText` is the single decoder, and it never
 *   throws — a malformed `%zz` costs only its own run, because `decodeURIComponent` on the whole string
 *   would throw for one literal percent anywhere.
 * - Percent-decoding runs twice at most (`%2520` → `%20` → " "); a third pass starts eating text that
 *   legitimately contains a percent sign.
 * - Path segments are decoded PER SEGMENT after the split: decoding the whole path first lets an encoded
 *   `%2F` invent a path separator.
 * - An unknown named entity stays as it came; numeric entities (decimal and hex) decode generically — that
 *   is exactly where the extractor's own short list ran out.
 * - The public-suffix set is the two-label suffixes the farm actually meets, not a full PSL (200 kB): the
 *   point is only that `wikimedia.org` and `bbc.co.uk` group correctly.
 * - A weak label is a signal, not a name: "View video" and "Video81234567" are the URL shapes video pages
 *   use, and that is where deriving stops working and the page has to be asked.
 * - A bare root is honestly the site (its `<title>` is a marketing line); a path that exists and still named
 *   nothing (`/12345678`) is a page we failed to read, and is weak.
 * - `cleanPageTitle` cuts only a leading or trailing chunk that names the SITE — never an inner one — so a
 *   real title containing a dash survives whole.
 * - `max` in `sourceTitle` is the caller's room and overrides BOTH producers with one number; omitted, each
 *   keeps its own cap (42 from a URL, 64 from a page title).
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/sitelabel.js — edit the JSDoc there, never this file.
/**
 * Turn machine text (percent-encoded, entity-laden, or both) into the text a person reads. Never throws.
 * @param raw a URL segment, a scraped title, a filename-derived title
 * @returns the decoded, unmarked-up, single-spaced string
 */
export function humanText(raw: any): any;
/**
 * The hostname of a URL without a leading `www.`; a string that is not a URL comes back as itself.
 * @param url a page URL
 * @returns the bare hostname
 */
export function hostOf(url: any): any;
/**
 * The registrable domain of a host — the site, so subdomains group together (commons.wikimedia.org → wikimedia.org).
 * @param host a hostname
 * @returns the registrable domain, two-label public suffixes respected (bbc.co.uk stays bbc.co.uk)
 */
export function registrableDomain(host: any): string;
/**
 * The site's display name: the capitalised label before the public suffix (mixkit.co → Mixkit).
 * @param url a page URL
 * @returns the site name, or the registrable domain when there is no label to show
 */
export function siteName(url: any): any;
/**
 * Is this label only a URL shape ("View video", "Video81234567") rather than a name? True when every token is weak.
 * @param label a derived label
 * @returns true when the label tells the reader nothing and the page should be asked for its own title
 */
export function isWeakLabel(label: any): boolean;
/**
 * Derive a page's readable title from its URL and say whether the derivation found a name or only a shape.
 * @param url the page URL (a search results page is titled by its term)
 * @param opts `max` — the label's character cap (default 42)
 * @returns `{ label, weak }` — `weak: true` means the caller should ask the page for its own title
 */
export function pageLabelInfo(url: any, { max }?: {
    max?: number;
}): {
    label: any;
    weak: boolean;
};
/**
 * The readable title of THAT page (not the site), derived from its URL.
 * @param url the page URL
 * @param opts `max` — the label's character cap (default 42)
 * @returns the label; the site name for a bare root, the raw string for a non-URL
 */
export function pageLabel(url: any, opts: any): any;
/**
 * A page's OWN title with the site chrome stripped off its ends ("Slow river - TUBE.EXAMPLE" → "Slow river").
 * @param raw the <title>/og:title or extracted clip title
 * @param url the page URL, used to recognise the site's name in the title
 * @param opts `max` — the character cap (default 64)
 * @returns the cleaned title, or "" when nothing worth showing is left
 */
export function cleanPageTitle(raw: any, url: any, { max }?: {
    max?: number;
}): any;
/**
 * THE one answer to "what is this page called": a URL that names the page wins, then the page's own title,
 * then the caller's hint, and only then the shape the URL could manage.
 * @param url the page URL
 * @param opts `pageTitle` (the page's own title), `hint` (the title of the clip dived from), `max` (the caller's room; 0 = each producer's own cap)
 * @returns the name to show
 */
export function sourceTitle(url: any, { pageTitle, hint, max }?: {
    pageTitle?: string;
    hint?: string;
    max?: number;
}): any;
/**
 * Group pages by the site they belong to, in first-appearance order.
 * @param list URL strings or objects with a `url`
 * @returns [{ domain, name, items }] — `items` keep their input order
 */
export function groupByDomain(list: any): any[];
