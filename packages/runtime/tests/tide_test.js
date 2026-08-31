// microspec runtime — tide unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  CATEGORIES as tCATEGORIES, STATIONS as tSTATIONS, stationsIn as tStationsIn, stationById as tStationById,
  somaNow as tSomaNow, somaChannels as tSomaChannels, settle as tSettle, idleBands as tIdleBands,
  phaseStep as tPhaseStep, hslRgb as tHslRgb, FIXTURE_LISTENERS as tFIXTURE_LISTENERS,
} from "../tide.js";

Deno.test("tide registry — every station is https, unique, in a real category, with a genre key", () => {
  const ids = new Set(), cats = new Set(tCATEGORIES.map((c) => c.id));
  for (const s of tSTATIONS) {
    assert(s.url.startsWith("https://"), `${s.id}: mixed content — ${s.url}`);
    assert(!ids.has(s.id), `${s.id}: duplicate id`); ids.add(s.id);
    assert(cats.has(s.cat), `${s.id}: unknown category ${s.cat}`);
    assert(/^g[A-Z]/.test(s.genre), `${s.id}: genre must be an i18n key`);
    assert(typeof s.cors === "boolean", `${s.id}: cors flag must be measured, not implied`);
    if (s.soma) assert(s.logo.startsWith("https://api.somafm.com/logos/"), `${s.id}: soma logo url`);
  }
  for (const c of tCATEGORIES) assert(tStationsIn(c.id).length >= 6, `${c.id}: fewer than 6 stations`);
  assertEquals(tStationById("nope"), null);
});

// The i18n parity half needs the PRODUCT app's dictionaries — absent in the public framework tree (the
// dreamstudio split); the product repo's CI runs it in full.
const TIDE_I18N = new URL("../../../apps/tide/i18n/en.json", import.meta.url);
const HAVE_TIDE = await Deno.stat(TIDE_I18N).then(() => true).catch(() => false);
Deno.test({ name: "tide i18n — every category + genre key exists in BOTH locales", ignore: !HAVE_TIDE, fn: async () => {
  const read = async (l) => JSON.parse(await Deno.readTextFile(new URL(`../../../apps/tide/i18n/${l}.json`, import.meta.url)));
  const en = await read("en"), uk = await read("uk");
  for (const c of tCATEGORIES) { assert(en[c.key], `en missing ${c.key}`); assert(uk[c.key], `uk missing ${c.key}`); }
  for (const s of tSTATIONS) { assert(en[s.genre], `en missing ${s.genre}`); assert(uk[s.genre], `uk missing ${s.genre}`); }
} });

Deno.test("tide somaNow — the measured shape, empty and broken inputs", () => {
  assertEquals(tSomaNow({ id: "groovesalad", songs: [{ title: " A ", artist: "B", album: "C", date: "1" }, { title: "old" }] }), { title: "A", artist: "B" });
  assertEquals(tSomaNow({ songs: [] }), null);
  assertEquals(tSomaNow({ songs: [{ title: "", artist: "" }] }), null);
  assertEquals(tSomaNow(null), null);
  assertEquals(tSomaNow("<html>"), null);
});

Deno.test("tide somaChannels — listeners are strings, lastPlaying splits on the SPACED hyphen only", () => {
  const m = tSomaChannels({ channels: [
    { id: "dronezone", listeners: "777", lastPlaying: "Steve Roach - Structures From Silence" },
    { id: "u80s", listeners: "231", lastPlaying: "Soft Cell - Tainted Love" },
    { id: "x", listeners: "n/a", lastPlaying: "Jean-Michel Jarre" },
    { id: "y", listeners: "3", lastPlaying: "" },
    { listeners: "1" },
  ] });
  assertEquals(m.dronezone, { listeners: 777, now: { artist: "Steve Roach", title: "Structures From Silence" } });
  assertEquals(m.u80s.now.artist, "Soft Cell");
  assertEquals(m.x, { listeners: null, now: { artist: "", title: "Jean-Michel Jarre" } });
  assertEquals(m.y, { listeners: 3, now: null });
  assertEquals(Object.keys(m).length, 4);
  assertEquals(tSomaChannels({}), {});
  for (const k of Object.keys(tFIXTURE_LISTENERS)) assert(tStationById(k), `fixture names an unknown station ${k}`);
});

Deno.test("tide settle — rises fast, falls slow, converges", () => {
  let v = 0;
  v = tSettle(v, 1); assertEquals(v, 0.25);
  v = tSettle(v, 1); assert(v > 0.43 && v < 0.44);
  let d = 1;
  d = tSettle(d, 0); assertEquals(d, 0.95);
  for (let i = 0; i < 200; i++) d = tSettle(d, 0);
  assert(d < 0.001);
});

Deno.test("tide idleBands — deterministic, inside 0..1, never flat", () => {
  const a = tIdleBands(3.2), b = tIdleBands(3.2), c = tIdleBands(9.9);
  assertEquals(a, b);
  for (const k of ["bass", "mid", "treble"]) { assert(a[k] > 0.05 && a[k] < 0.5, `${k} out of budget: ${a[k]}`); }
  assert(a.bass !== c.bass || a.mid !== c.mid, "the breath must move");
});

Deno.test("tide phaseStep — silence still drifts, full energy is 6× faster, never negative", () => {
  assertEquals(tPhaseStep(1, 0), 0.05);
  assertEquals(tPhaseStep(1, 1), 0.3);
  assertEquals(tPhaseStep(1, 7), 0.3);
  assertEquals(tPhaseStep(-1, 1), 0);
});

Deno.test("tide hslRgb — primaries and grey", () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const r = tHslRgb(0, 100, 50); assert(near(r[0], 1) && near(r[1], 0) && near(r[2], 0));
  const g = tHslRgb(120, 100, 50); assert(near(g[1], 1) && near(g[0], 0));
  const grey = tHslRgb(214, 0, 50); assert(near(grey[0], 0.5) && near(grey[1], 0.5) && near(grey[2], 0.5));
});

Deno.test("tide reconnect — backoff caps at 15s; a drop holds the station, only a dead station skips", async () => {
  const { retryDelay, onLoss } = await import("../tide.js");
  assertEquals([0, 1, 2, 3, 4, 9].map(retryDelay), [1000, 2000, 4000, 8000, 15000, 15000]);
  assertEquals(onLoss({ hadAudio: false, online: true, attempt: 0 }), "skip");
  assertEquals(onLoss({ hadAudio: true, online: true }), "reconnect");
  assertEquals(onLoss({ hadAudio: false, online: false }), "reconnect");
  assertEquals(onLoss({ hadAudio: false, online: true, attempt: 1 }), "reconnect");
  assertEquals(onLoss(), "skip");
});

Deno.test("tide progressCheck: currentTime is the liveness signal, on timestamps not ticks", async () => {
  const { progressCheck } = await import("../tide.js");
  // first look just plants the marker — nothing is dead before there is something to compare with
  const a = progressCheck({ time: 3, mark: null, now: 1000 });
  assertEquals(a.dead, false);
  assertEquals(a.mark, { time: 3, at: 1000 });

  // it advanced: the marker MOVES, so the budget restarts from the moment sound was last proven
  const b = progressCheck({ time: 9, mark: a.mark, now: 5000 });
  assertEquals(b.dead, false);
  assertEquals(b.mark, { time: 9, at: 5000 });

  // frozen position, still inside the budget — a buffer hiccup is not a dead stream
  const c = progressCheck({ time: 9, mark: b.mark, now: 11000 });
  assertEquals(c.dead, false);
  assertEquals(c.mark, b.mark, "a stalled check must not move the marker forward");

  // frozen past the budget: dead, whatever the events said (a handover raises none of them)
  assertEquals(progressCheck({ time: 9, mark: b.mark, now: 13000 }).dead, true);
  assertEquals(progressCheck({ time: 9, mark: b.mark, now: 13001 }).dead, true);

  // a renderer that was FROZEN comes back with a mark minutes old — that reconnects, it is not forgiven
  assertEquals(progressCheck({ time: 9, mark: b.mark, now: 605000 }).dead, true);

  // a rewind (a fresh element reusing the marker) counts as no progress, never as negative time
  assertEquals(progressCheck({ time: 0, mark: b.mark, now: 5500 }).dead, false);
});
