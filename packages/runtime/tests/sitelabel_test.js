// microspec runtime — sitelabel unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { registrableDomain, siteName, pageLabel, pageLabelInfo, cleanPageTitle, sourceTitle, groupByDomain, hostOf, humanText } from "../sitelabel.js";

// ── sitelabel: readable page titles + domain grouping (derived from the URL, never fetched) ─────────────
Deno.test("registrableDomain: subdomains fold into one site, multi-label suffixes survive", () => {
  assertEquals(registrableDomain("commons.wikimedia.org"), "wikimedia.org");
  assertEquals(registrableDomain("www.mixkit.co"), "mixkit.co");
  assertEquals(registrableDomain("mixkit.co"), "mixkit.co");
  assertEquals(registrableDomain("news.bbc.co.uk"), "bbc.co.uk", "co.uk is a suffix, not a site");
  assertEquals(registrableDomain("shop.rozetka.com.ua"), "rozetka.com.ua");
  assertEquals(registrableDomain("localhost"), "localhost");
});

Deno.test("siteName: the label before the public suffix, capitalised", () => {
  assertEquals(siteName("https://mixkit.co/free-stock-video/"), "Mixkit");
  assertEquals(siteName("https://commons.wikimedia.org/wiki/Category:Animations"), "Wikimedia");
  assertEquals(siteName("https://www.dareful.com/"), "Dareful");
});

Deno.test("pageLabel: the page's own title, derived from its URL", () => {
  assertEquals(pageLabel("https://mixkit.co/free-stock-video/"), "Free stock video");
  assertEquals(pageLabel("https://mixkit.co/free-stock-video/space/"), "Space");
  assertEquals(pageLabel("https://commons.wikimedia.org/wiki/Category:Underwater_videos"), "Underwater videos", "the Category: prefix is chrome, not title");
  assertEquals(pageLabel("https://dareful.com/"), "Dareful", "a bare root falls back to the site name");
  assertEquals(pageLabel("https://site.com/search?q=sunset+timelapse"), "Sunset timelapse", "a results page is titled by its term");
  assertEquals(pageLabel("https://site.com/videos/page/2"), "Site", "ids and paging noise are not titles");
  assertEquals(pageLabel("https://site.com/clips/12345-a-slow-river.html"), "A slow river");
  assertEquals(pageLabel("not a url at all"), "Not a url at all", "never throws on junk");
  assertEquals(pageLabel(""), "");
});

Deno.test("pageLabel: caps length on a word boundary so a row can't be blown out", () => {
  const long = pageLabel("https://site.com/a-very-long-page-name-that-keeps-going-and-going-forever");
  assert(long.length <= 43, `label too long: ${long.length}`);
  assert(long.endsWith("…"), "a truncated label must say so");
  assert(!/\s…$/.test(long), "no dangling space before the ellipsis");
});

// A video PAGE is where URL-derived titling runs out: its path is a shape, not a name. These are the URL
// SHAPES a reel dives into (hosts kept generic on purpose) — `/view_video.php` is what the owner saw as
// "View video" in the source island.
Deno.test("pageLabelInfo: a label that only describes the medium is weak, and says so", () => {
  const weak = (u) => pageLabelInfo(u).weak;
  assert(weak("https://tube.example/view_video.php?viewkey=k5f2a1b"), "view_video.php is a shape, not a title");
  assert(weak("https://tube.example/video81234567/"), "an id with a `video` prefix names nothing");
  assert(weak("https://tube.example/12345678"), "a path that exists and still names nothing is a page we failed to read");
  assert(!weak("https://dareful.com/"), "a bare root IS the site — its own <title> is a marketing line, not a name");
  assert(!weak("https://mixkit.co/free-stock-video/space/"), "Space is a name");
  assert(!weak("https://tube.example/video.abc123/hot_summer_day"), "the slug names the page");
  assert(!weak("https://site.com/search?q=sunset+timelapse"), "a search term names the page");
  assertEquals(pageLabelInfo("https://tube.example/view_video.php?viewkey=x").label, "View video", "the label itself is unchanged — only the confidence is new");
});

Deno.test("cleanPageTitle: the page's own title minus the site chrome stapled to it", () => {
  const c = cleanPageTitle;
  assertEquals(c("Slow river in the forest - TUBE.EXAMPLE", "https://tube.example/x"), "Slow river in the forest", "the site shouts its own name in caps; that is chrome");
  assertEquals(c("Category:Animations - Wikimedia Commons", "https://commons.wikimedia.org/wiki/x"), "Category:Animations");
  assertEquals(c("Sunset over the pier | Coverr", "https://coverr.co/videos/x"), "Sunset over the pier");
  assertEquals(c("Mixkit · Slow river in the forest", "https://mixkit.co/x"), "Slow river in the forest", "the chrome can lead as well as trail");
  assertEquals(c("A day - and a night - in Kyiv – Site", "https://site.com/x"), "A day – and a night – in Kyiv", "only the SITE chunk is cut; an inner dash is part of the title");
  assertEquals(c("Mixkit", "https://mixkit.co/x"), "", "a title that is only the site name says nothing");
  assertEquals(c("video", "https://site.com/x"), "", "so does the extractor's own fallback");
  assertEquals(c("Preview 1080p", "https://site.com/x"), "", "…and a humanised filename");
  assertEquals(c("", "https://site.com/x"), "");
  const long = c("A very long page title that simply keeps going and going and going past every sane limit", "https://site.com/x");
  assert(long.length <= 65 && long.endsWith("…"), `title not capped: ${long}`);
});

Deno.test("sourceTitle: the URL names the page when it can, the page names itself when it can't", () => {
  const vid = "https://tube.example/view_video.php?viewkey=k5f2a1b";
  assertEquals(sourceTitle("https://mixkit.co/free-stock-video/space/", { pageTitle: "Free Space Stock Video Footage - Mixkit" }), "Space", "a URL that names the page is not overruled");
  assertEquals(sourceTitle(vid, { pageTitle: "Sunrise on the roof - Tube.example" }), "Sunrise on the roof");
  assertEquals(sourceTitle(vid, { hint: "Sunrise on the roof" }), "Sunrise on the roof", "no page title yet → the clip you dived from names it");
  assertEquals(sourceTitle(vid, { pageTitle: "Free Online Videos - Tube", hint: "Sunrise on the roof" }), "Sunrise on the roof", "an SEO title made only of medium-words is not a title");
  assertEquals(sourceTitle(vid, { hint: "video" }), "View video", "nothing usable anywhere → the URL's shape, unchanged");
  assertEquals(sourceTitle(""), "");
});

/* A page's name arrives as MACHINE TEXT and has to stop being machine text before it is shown. Every case
   below was measured against the shipped code first, and every one of them reached the sources list: the
   percent-escapes as `%20`, the entities as `&amp;` — and the literal-percent URL not as bad text but as a
   THROWN URIError, because decodeURIComponent rejects the whole string over one bad escape. */
Deno.test("humanText: percent-escapes, entities and invisible characters, and never a throw", () => {
  assertEquals(humanText("%D0%9A%D0%B8%D1%97%D0%B2%20%D0%B2%D0%BD%D0%BE%D1%87%D1%96"), "Київ вночі");
  assertEquals(humanText("a-100%-sure-thing"), "a-100%-sure-thing", "a literal percent is text, not a broken escape");
  assertEquals(humanText("%zz %D0 %E0%A4%A"), "%zz %D0 %E0%A4%A", "malformed escapes cost only themselves");
  assertEquals(humanText("100%25 %2520pure"), "100% pure", "double-encoded — decoded twice, and no further");
  assertEquals(humanText("Rock &amp; Roll &#039;77 &#8217;s &mdash; live &hellip;"), "Rock & Roll '77 ’s — live …");
  assertEquals(humanText("&#x41;&#x2014;&#X42;"), "A—B", "hex entities, either case");
  assertEquals(humanText("Bad &unknown; &amp entity"), "Bad &unknown; &amp entity", "an entity we don't know stays as it came");
  assertEquals(humanText("A\u00a0title\u200b with\tgaps\n"), "A title with gaps", "nbsp, zero-width and control characters are not typography");
  assertEquals(humanText(null), "");
});

Deno.test("sitelabel: a malformed escape anywhere never takes the label down with it", () => {
  // The whole chain, on the URL that threw: pageLabelInfo → prettify → sourceTitle. A row that renders a
  // label is a row that a URIError erases, so "does not throw" IS the user-visible behaviour here.
  assertEquals(pageLabel("https://tube.example/clips/a-100%-sure-thing/"), "A 100% sure thing");
  assertEquals(sourceTitle("https://tube.example/%E0%A4%A/watch/1/", { hint: "Nightfall" }), "Nightfall");
  assertEquals(cleanPageTitle("Half %E0%A4%A decoded &amp; fine - Tube.example", "https://tube.example/x"), "Half %E0%A4%A decoded & fine");
});

Deno.test("sitelabel: an encoded path segment is a title once it is decoded", () => {
  assertEquals(pageLabel("https://site.com/video/1234/%D0%9A%D1%80%D0%B0%D1%81%D0%B8%D0%B2%D0%B8%D0%B9%20%D0%B7%D0%B0%D1%85%D1%96%D0%B4/"), "Красивий захід");
  assertEquals(pageLabel("https://site.com/clip/%2520double%2520encoded/"), "Double encoded");
  assertEquals(pageLabel("https://site.com/a%2Fb/"), "A/b", "an encoded slash is a character in ONE segment, never a new segment");
  assertEquals(sourceTitle("https://tube.example/watch/9/", { pageTitle: "Sunrise &amp; the sea &#8212; Tube.example" }), "Sunrise & the sea");
});

/* `max` is the caller's room. The island is a chip beside four controls and takes the short form; a sources
   row wraps and takes the whole name. Before this, both got 42/64 characters and the row's spare line was
   spent on an ellipsis. */
Deno.test("sourceTitle: the caller states how much room it has, and both producers honour it", () => {
  const longUrl = "https://site.com/a-very-long-page-name-that-keeps-going-and-going-forever/";
  const vid = "https://tube.example/view_video.php?viewkey=k5f2a1b";
  const longTitle = "A very long page title that simply keeps going and going and going past every sane limit";
  assert(sourceTitle(longUrl).endsWith("…"), "the default cap is unchanged");
  assert(sourceTitle(vid, { pageTitle: longTitle }).endsWith("…"), "…on the page-title path too");
  assertEquals(sourceTitle(longUrl, { max: 120 }), "A very long page name that keeps going and going forever", "room stated → the whole name");
  assertEquals(sourceTitle(vid, { pageTitle: longTitle, max: 120 }), longTitle);
  assert(sourceTitle(vid, { pageTitle: longTitle, max: 40 }).length <= 41, "a smaller room truncates sooner");
});

Deno.test("groupByDomain: pages of one site group together, first-appearance order kept", () => {
  const g = groupByDomain([
    { url: "https://mixkit.co/free-stock-video/" },
    { url: "https://commons.wikimedia.org/wiki/Category:Animations" },
    { url: "https://mixkit.co/free-stock-video/space/" },
    { url: "https://wikimedia.org/x" },
  ]);
  assertEquals(g.map((x) => x.domain), ["mixkit.co", "wikimedia.org"]);
  assertEquals(g[0].items.length, 2);
  assertEquals(g[1].items.length, 2, "a subdomain and its apex are the same site");
  assertEquals(g[0].name, "Mixkit");
  assertEquals(groupByDomain([]), []);
  assertEquals(groupByDomain([{ name: "no url" }]), [], "an entry without a url is skipped, not crashed on");
});
