import { assertEquals } from "jsr:@std/assert@1";
import { pickNote, markFor } from "../update.js";

const LOG = [
  { id: "2026-10-05-moto-night", date: "2026-10-05", app: "moto", uk: "Нічний режим став темнішим.", en: "Night mode is darker." },
  { id: "2026-10-03-tide", date: "2026-10-03", app: "tide", uk: "Нові станції.", en: "New stations." },
  { id: "2026-10-02-moto", date: "2026-10-02", app: "moto", uk: "Новий застосунок.", en: "New app." },
];

Deno.test("update: the note is the newest entry about THIS app, once", () => {
  assertEquals(pickNote(LOG, "moto", "2026-10-01 ")?.id, "2026-10-05-moto-night");
  assertEquals(pickNote(LOG, "moto", markFor(LOG[0])), null, "already shown");
  assertEquals(pickNote(LOG, "tide", "2026-10-01 ")?.id, "2026-10-03-tide");
  assertEquals(pickNote(LOG, "weather", "2026-10-01 "), null, "nothing was said about this app: stay silent");
});

Deno.test("update: history is not replayed to a device that arrived after it", () => {
  assertEquals(pickNote(LOG, "moto", "2026-10-06 "), null, "installed after the entry was written");
  assertEquals(pickNote(LOG, "moto", "2026-10-05 ")?.id, "2026-10-05-moto-night", "same day counts");
  assertEquals(markFor(LOG[0]), "2026-10-05 2026-10-05-moto-night");
});

Deno.test("update: a missing or malformed changelog is silence, not an error", () => {
  assertEquals(pickNote(null, "moto", ""), null);
  assertEquals(pickNote({ not: "a list" }, "moto", ""), null);
  assertEquals(pickNote([null, { app: "moto", id: "x" }], "moto", "2026-10-01 "), null, "an entry with no date is older than any mark");
  assertEquals(pickNote([{ app: "moto", id: "x", date: "2026-10-02" }], "moto", null)?.id, "x", "no mark yet: nothing to be older than");
});

Deno.test("update: a worker that finishes installing during a fresh, untouched launch is taken now — never on a first install, a touched screen, a late install or right after a swap", async () => {
  const { takeNow, FRESH_MS } = await import("../update.js");
  const ok = { had: true, touched: false, sinceBoot: 3000, swapped: false };
  assertEquals(takeNow(ok), true);
  assertEquals(takeNow({ ...ok, had: false }), false, "first install: nothing to update from");
  assertEquals(takeNow({ ...ok, touched: true }), false, "a touched screen is a session — never reload under it");
  assertEquals(takeNow({ ...ok, sinceBoot: FRESH_MS + 1 }), false, "too late: next launch");
  assertEquals(takeNow({ ...ok, swapped: true }), false, "a swap a moment ago: a changing worker must not loop the page");
});
