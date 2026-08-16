// sse.js — the SSE event parser: chunk boundaries, event names, comments, CRLF, the unterminated tail.
import { assertEquals } from "jsr:@std/assert@1";
import { parseSse } from "../sse.js";

const feed = (chunks) => { const p = parseSse(); const out = []; for (const c of chunks) out.push(...p.push(c)); out.push(...p.end()); return out; };

Deno.test("parseSse: named events and default messages, JSON parsed", () => {
  const got = feed(['event: meta\ndata: {"chatId":7}\n\ndata: {"d":"Hel"}\n\ndata: {"d":"lo"}\n\nevent: done\ndata: {"by":"x","complete":true}\n\n']);
  assertEquals(got.map((e) => e.event), ["meta", "message", "message", "done"]);
  assertEquals(got[0].data.chatId, 7);
  assertEquals(got[1].data.d + got[2].data.d, "Hello");
  assertEquals(got[3].data.complete, true);
});

Deno.test("parseSse: a frame split anywhere across reads is reassembled", () => {
  const one = 'event: meta\ndata: {"chatId":1}\n\ndata: {"d":"Привіт, "}\n\ndata: {"d":"світе"}\n\n';
  for (let cut = 1; cut < one.length; cut += 3) {
    const got = feed([one.slice(0, cut), one.slice(cut)]);
    assertEquals(got.length, 3, "cut at " + cut);
    assertEquals(got[1].data.d + got[2].data.d, "Привіт, світе", "cut at " + cut);
  }
});

Deno.test("parseSse: comments ignored, CRLF accepted, non-JSON data kept as string, unterminated tail flushed on end()", () => {
  const got = feed([":ping\r\ndata: plain\r\n\r\n", "data: {\"d\":\"tail\"}\n"]);
  assertEquals(got[0], { event: "message", data: "plain" });
  assertEquals(got[1].data.d, "tail");
});

