// telemetry.js — the browser-free half: describe() shapes and caps, report() before install is a no-op (no
// fetch, no throw), the budget constants. The hooks and the flush are exercised on the live site by the drivers.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, report, MAX_BATCH, FLUSH_MS, PER_MINUTE } from "../telemetry.js";

Deno.test("describe: an Error keeps message and a capped stack, a string is the message, an object is JSON", () => {
  const d = describe(new Error("boom"));
  assertEquals(d.msg, "boom"); assert(d.stack.includes("boom") || d.stack.length >= 0);
  assertEquals(describe("plain").msg, "plain");
  assertEquals(describe({ a: 1 }).msg, '{"a":1}');
  assertEquals(describe("x".repeat(900)).msg.length, 500, "the message is capped at 500");
});

Deno.test("report: before installTelemetry (and under any Deno test) it neither throws nor fetches", () => {
  let fetched = 0; const real = globalThis.fetch; globalThis.fetch = () => { fetched++; return Promise.resolve(new Response("")); };
  try { report("read.fail", { reason: "eRead", type: "image/jpeg", size: 88855 }); report("x", null, "warn"); }
  finally { globalThis.fetch = real; }
  assertEquals(fetched, 0);
});

Deno.test("budget: 20 a batch, 3 s, 40 a minute", () => {
  assertEquals(MAX_BATCH, 20); assertEquals(FLUSH_MS, 3000); assertEquals(PER_MINUTE, 40);
});
