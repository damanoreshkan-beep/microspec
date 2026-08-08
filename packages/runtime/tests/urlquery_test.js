// microspec runtime — urlquery unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolveSearch, buildSearchUrl } from "../urlquery.js";

// ---- urlquery: search-param resolver (recognise the search key across popular sites) ---------------------

Deno.test("urlquery resolveSearch: recognises the search key across popular engines/sites", () => {
  const cases = [
    ["https://www.google.com/search?q=cats", "q", "cats"],
    ["https://duckduckgo.com/?q=cats&ia=web", "q", "cats"],
    ["https://www.youtube.com/results?search_query=lofi", "search_query", "lofi"],
    ["https://www.amazon.com/s?k=usb+c&ref=nb", "k", "usb c"],
    ["https://www.ebay.com/sch/i.html?_nkw=vintage+lens", "_nkw", "vintage lens"],
    ["https://www.baidu.com/s?wd=天气", "wd", "天气"],
    ["https://yandex.com/search/?text=погода", "text", "погода"],
    ["https://search.yahoo.com/search?p=news", "p", "news"],
    ["https://www.aliexpress.com/wholesale?SearchText=drone", "SearchText", "drone"],   // original casing preserved
    ["https://example.com/?s=hello", "s", "hello"],                                      // WordPress
    ["https://site.dev/find?keyword=shoes&sort=price", "keyword", "shoes"],
  ];
  for (const [url, key, term] of cases) {
    const r = resolveSearch(url);
    assert(r.searchable, `${url} → should be searchable`);
    assertEquals(r.key, key, `${url} → key`);
    assertEquals(r.term, term, `${url} → term`);
  }
});

Deno.test("urlquery resolveSearch: case-insensitive match, priority order, and non-search params", () => {
  assertEquals(resolveSearch("https://x.com/?Q=Cats").key, "Q", "uppercase key matches, original casing kept");
  assertEquals(resolveSearch("https://x.com/?SEARCH=hi").key, "SEARCH", "SEARCH matches case-insensitively");
  assertEquals(resolveSearch("https://x.com/?s=5&q=cats").key, "q", "q outranks s when both present");
  assert(!resolveSearch("https://x.com/page").searchable, "no query params → not searchable");
  assert(!resolveSearch("https://x.com/?page=2&sort=new").searchable, "query params but no known key → not searchable (never guess)");
  assert(!resolveSearch("not a url").searchable, "unparseable → not searchable");
  assertEquals(resolveSearch("https://x.com/?q=").term, "", "empty value → term '' but still searchable");
  assert(resolveSearch("https://x.com/?q=").searchable, "empty q is still searchable");
});

Deno.test("urlquery buildSearchUrl: swaps the term, preserves path + other params, leaves non-search URLs alone", () => {
  assertEquals(buildSearchUrl("https://g.com/search?q=old&hl=en", "new"), "https://g.com/search?q=new&hl=en");
  assertEquals(buildSearchUrl("https://a.com/s?k=phone&ref=nb", "usb c"), "https://a.com/s?k=usb+c&ref=nb", "space → +");
  assertEquals(buildSearchUrl("https://x.com/?SearchText=a", "b"), "https://x.com/?SearchText=b", "original key casing preserved");
  assertEquals(buildSearchUrl("https://x.com/page", "cats"), "https://x.com/page", "no search key → unchanged");
  assertEquals(buildSearchUrl("nope", "x"), "nope", "unparseable → unchanged");
});
