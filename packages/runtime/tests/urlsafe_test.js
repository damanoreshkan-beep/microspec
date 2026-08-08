// microspec runtime — urlsafe unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { analyzeQR } from "../urlsafe.js";

Deno.test("urlsafe: a plain https link is safe; host is extracted", () => {
  const r = analyzeQR("https://example.com/path?q=1");
  assertEquals(r.kind, "url");
  assertEquals(r.host, "example.com");
  assertEquals(r.verdict, "safe");
  assertEquals(r.flags.length, 0);
});

Deno.test("urlsafe: http is a caution (insecure), not a verdict on the host", () => {
  const r = analyzeQR("http://example.com");
  assertEquals(r.verdict, "caution");
  assert(r.flags.some((f) => f.code === "insecure"));
});

Deno.test("urlsafe: shorteners flag as caution (destination hidden)", () => {
  assert(analyzeQR("https://bit.ly/abc").flags.some((f) => f.code === "shortener"));
  assertEquals(analyzeQR("https://bit.ly/abc").verdict, "caution");
});

Deno.test("urlsafe: Cyrillic homograph host is DANGER (mixed-script)", () => {
  // "аpple.com" — the first а is Cyrillic U+0430, the rest Latin: identical to the eye, points elsewhere.
  const r = analyzeQR("https://аpple.com/login");
  assertEquals(r.verdict, "danger");
  assert(r.flags.some((f) => f.code === "mixed-script"));
});

Deno.test("urlsafe: userinfo spoof (trusted@evil) is DANGER; the real host is evil.com", () => {
  const r = analyzeQR("https://apple.com@evil.example/login");
  assertEquals(r.host, "evil.example");
  assertEquals(r.verdict, "danger");
  assert(r.flags.some((f) => f.code === "userinfo"));
});

Deno.test("urlsafe: script/code schemes are DANGER and never 'open'", () => {
  const r = analyzeQR("javascript:alert(1)");
  assertEquals(r.kind, "code");
  assertEquals(r.verdict, "danger");
});

Deno.test("urlsafe: raw IP host is a caution", () => {
  assert(analyzeQR("http://192.168.1.1/admin").flags.some((f) => f.code === "ip-host"));
});

Deno.test("urlsafe: non-URL payloads are typed, never openable web links", () => {
  assertEquals(analyzeQR("WIFI:S:MyNet;T:WPA;P:secret;;").kind, "wifi");
  assertEquals(analyzeQR("WIFI:S:MyNet;T:WPA;P:secret;;").ssid, "MyNet");
  assertEquals(analyzeQR("tel:+380501234567").kind, "tel");
  assertEquals(analyzeQR("mailto:a@b.com").kind, "mailto");
  assertEquals(analyzeQR("just a note").kind, "text");
});

Deno.test("urlsafe: a bare host with no scheme parses as a link but flags the assumption", () => {
  const r = analyzeQR("example.com/x");
  assertEquals(r.kind, "url");
  assertEquals(r.host, "example.com");
  assert(r.flags.some((f) => f.code === "no-scheme"));
});
