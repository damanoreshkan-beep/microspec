
import { assertEquals } from "jsr:@std/assert@1";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";
import { hapticFor } from "../sensors.js";

const el = (h, sel) => new DOMParser().parseFromString(`<body>${h}</body>`, "text/html").querySelector(sel);

Deno.test("hapticFor — every tappable answers, by default and without the app asking", () => {
  for (const [h, sel] of [
    ["<button id=x>go</button>", "#x"],
    ['<a id=x href="/y">go</a>', "#x"],
    ['<div id=x role="button">go</div>', "#x"],
    ['<button data-tab="me" id=x>me</button>', "#x"],
    ['<div id=x class="btn">go</div>', "#x"],
    ['<input id=x type="checkbox">', "#x"],
    ["<select id=x><option>a</option></select>", "#x"],
    ["<summary id=x>more</summary>", "#x"],
  ]) assertEquals(hapticFor(el(h, sel)), "tick", `${h} should tick`);
  assertEquals(hapticFor(el('<button><span id=i>go</span></button>', "#i")), "tick");
});

Deno.test("hapticFor — silence where a buzz would be a fault, not feedback", () => {
  assertEquals(hapticFor(el("<div id=x>text</div>", "#x")), null, "plain text is not tappable");
  assertEquals(hapticFor(el('<input id=x type="text">', "#x")), null, "a buzz per keystroke is a broken phone");
  assertEquals(hapticFor(el("<textarea id=x></textarea>", "#x")), null);
  assertEquals(hapticFor(el('<input id=x type="search">', "#x")), null);
  assertEquals(hapticFor(el("<button id=x disabled>go</button>", "#x")), null);
  assertEquals(hapticFor(el('<button id=x aria-disabled="true">go</button>', "#x")), null);
  assertEquals(hapticFor(null), null);
});

Deno.test("hapticFor — destructive hits harder; apps can opt out or up", () => {
  assertEquals(hapticFor(el('<button id=x class="btn btn-error">delete</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="bump">clear</button>', "#x")), "bump");
  assertEquals(hapticFor(el('<button id=x data-haptic="off">silent</button>', "#x")), null, "an element that fires its own must be able to stay silent");
  assertEquals(hapticFor(el('<button id=x data-haptic="ok">saved</button>', "#x")), "ok");
});
