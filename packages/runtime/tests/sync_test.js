// microspec runtime — sync unit tests. The wire protocol is the contract both the client and the edge relay
// hold (the edge keeps a mirror copy of these shapes — microspec-edge/edge/sync.js).
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { clampVol as syClampVol, packState as syPack, openState as syOpen, parseServer as syParse, syncDelay as syDelay, SYNC_URL as syUrl } from "../sync.js";

Deno.test("sync clampVol — clamps to 0..1, garbage is full volume (never silence by accident)", () => {
  assertEquals(syClampVol(0.5), 0.5);
  assertEquals(syClampVol(-2), 0);
  assertEquals(syClampVol(7), 1);
  assertEquals(syClampVol("0.25"), 0.25);
  assertEquals(syClampVol(NaN), 1);
  assertEquals(syClampVol(undefined), 1);
});

Deno.test("sync packState/openState — round-trip, clamped, garbage rejected", () => {
  const wire = syPack({ playing: true, station: "dronezone", vol: 1.7 });
  assertEquals(wire, { p: 1, st: "dronezone", v: 1 });
  assertEquals(syOpen(wire), { playing: true, station: "dronezone", vol: 1 });
  assertEquals(syPack(null), null);
  assertEquals(syOpen(null), null);
  assertEquals(syOpen({ p: 1 }), null, "a state without a station id is not a state");
  assertEquals(syOpen({ st: "x".repeat(65) }), null, "an oversized station id is dropped");
  assertEquals(syOpen({ st: "kool" }), { playing: false, station: "kool", vol: 1 });
});

Deno.test("sync parseServer — the four frame types; anything else (or non-JSON) is null, never a throw", () => {
  assertEquals(syParse(JSON.stringify({ t: "ok", peers: 2, s: { p: 1, st: "kool", v: 0.5 } })), { t: "ok", peers: 2, state: { playing: true, station: "kool", vol: 0.5 } });
  assertEquals(syParse(JSON.stringify({ t: "ok", peers: -3, s: null })), { t: "ok", peers: 0, state: null });
  assertEquals(syParse(JSON.stringify({ t: "peers", n: 3 })), { t: "peers", n: 3 });
  assertEquals(syParse(JSON.stringify({ t: "state", s: { p: 0, st: "asp-h", v: 0.2 } })), { t: "state", state: { playing: false, station: "asp-h", vol: 0.2 } });
  assertEquals(syParse(JSON.stringify({ t: "state", s: { p: 1 } })), null, "a state frame with no valid state is dropped whole");
  assertEquals(syParse(JSON.stringify({ t: "cmd", c: "pause" })), { t: "cmd", c: "pause" });
  assertEquals(syParse(JSON.stringify({ t: "cmd", c: "vol", v: 9 })), { t: "cmd", c: "vol", v: 1 });
  assertEquals(syParse(JSON.stringify({ t: "cmd", c: "rm -rf" })), null, "unknown commands never pass");
  assertEquals(syParse("not json"), null);
  assertEquals(syParse(JSON.stringify(["t"])), null);
});

Deno.test("sync syncDelay — capped backoff: quick first retries, 30 s floor for a dead edge", () => {
  assertEquals(syDelay(0), 1000);
  assertEquals(syDelay(1), 2000);
  assertEquals(syDelay(3), 10000);
  assertEquals(syDelay(4), 30000);
  assertEquals(syDelay(100), 30000);
});

Deno.test("sync SYNC_URL — derived from VPS_PROXY (one host, one source of truth), wss scheme", () => {
  assert(syUrl.startsWith("wss://"), syUrl);
  assert(syUrl.endsWith("/feed/sync"), syUrl);
});
