import { assert, assertEquals } from "jsr:@std/assert@1";
import { oneLine, fitHeight, installGrow } from "../grow.js";

Deno.test("grow — a one-line field turns every line break into one space", () => {
  assertEquals(oneLine("https://a.example/x\n"), "https://a.example/x ");
  assertEquals(oneLine("two\r\nlines  \n  pasted"), "two lines pasted");
  assertEquals(oneLine("plain"), "plain");
});

Deno.test("grow — fitHeight sizes to the content plus the borders (border-box)", () => {
  const el = { style: { height: "" }, scrollHeight: 72, offsetHeight: 46, clientHeight: 44 };
  fitHeight(el);
  assertEquals(el.style.height, "74px");
});

// a tiny event target standing in for the document
function fakeDoc() {
  const ls = {};
  return {
    ls, documentElement: {},
    addEventListener: (k, f) => { (ls[k] ||= []).push(f); },
    fire(k, e) { for (const f of ls[k] || []) f(e); },
  };
}
const area = (value, attrs = {}) => ({
  tagName: "TEXTAREA", value, selectionStart: value.length, style: { height: "" }, scrollHeight: 40, offsetHeight: 40, clientHeight: 40,
  hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] ?? null, setSelectionRange() {}, form: attrs.form,
});

Deno.test("grow — a one-line decimal field holds a dot, whatever the keyboard typed", () => {
  const doc = fakeDoc();
  installGrow(doc);
  const el = area("1,5", { "data-line": 1, inputmode: "decimal" });
  doc.fire("input", { target: el });
  assertEquals(el.value, "1.5");
  assertEquals(Number(el.value), 1.5);
  const text = area("Київ, центр", { "data-line": 1 });
  doc.fire("input", { target: text });
  assertEquals(text.value, "Київ, центр", "a text field keeps its commas");
});

Deno.test("grow — Enter in a one-line field submits its form; Shift+Enter, IME and multi-line fields are left alone", () => {
  const doc = fakeDoc();
  installGrow(doc);
  let submitted = 0;
  const form = { requestSubmit: () => submitted++ };
  const key = (target, extra = {}) => { let prevented = false; doc.fire("keydown", { target, key: "Enter", preventDefault: () => { prevented = true; }, ...extra }); return prevented; };
  assert(key(area("q", { "data-line": 1, form })), "Enter is not a newline in a one-line field");
  assertEquals(submitted, 1);
  assert(!key(area("q", { "data-line": 1, form }), { shiftKey: true }), "Shift+Enter is the person's choice");
  assert(!key(area("q", { "data-line": 1, form }), { isComposing: true }), "Enter that confirms an IME word must not submit");
  assert(!key(area("a message")), "a multi-line field breaks the line");
  assertEquals(submitted, 1);
});

Deno.test("grow — a pasted newline in a one-line field becomes a space before the app reads the value", () => {
  const doc = fakeDoc();
  installGrow(doc);
  const el = area("https://x.example/\npath", { "data-line": 1 });
  doc.fire("input", { target: el });
  assertEquals(el.value, "https://x.example/ path");
  const msg = area("line one\nline two");
  doc.fire("input", { target: msg });
  assertEquals(msg.value, "line one\nline two", "a multi-line field keeps its lines");
});

Deno.test("grow — installGrow is idempotent per document", () => {
  const doc = fakeDoc();
  installGrow(doc); installGrow(doc);
  assertEquals(doc.ls.keydown.length, 1);
});

Deno.test("grow — runtime.css grows every textarea from one line, capped, and unpins daisy's fixed heights", async () => {
  const { pkgRoot } = await import("../pkgroot.js");
  const css = await Deno.readTextFile(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));
  assert(/textarea\s*\{[^}]*field-sizing:\s*content/.test(css), "textarea must grow with field-sizing: content");
  assert(/textarea\s*\{[^}]*max-block-size/.test(css), "a ceiling, then it scrolls");
  assert(/textarea\.(input|textarea)/.test(css), "daisy's .input/.textarea fixed heights must not pin a growing field");
});
