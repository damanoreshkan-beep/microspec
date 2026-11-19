import { assert } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";

const src = await Deno.readTextFile(new URL("packages/runtime/list.js", pkgRoot(import.meta.url, 3)));

Deno.test("a sectioned list that paginates ends in the infinite tail", () => {
  const line = src.split("\n").find((l) => l.includes("if (tab.sections) return"));
  assert(line, "the sections branch exists");
  assert(/paginate \? html`<\$\{InfiniteTail\}/.test(line), "the sections branch appends the tail when the tab paginates");
  assert(line.includes("A.loadMore()"), "the tail asks for the next page");
});

Deno.test("a feed card shows its whole body when the spec asks for it", () => {
  const line = src.split("\n").find((l) => l.includes("fieldNode(it, card.body, loc)") && l.includes("<p"));
  assert(line, "the body paragraph exists");
  assert(line.includes('card.bodyFull ? "" : "line-clamp-2 "'), "bodyFull drops the 2-line clamp");
});
