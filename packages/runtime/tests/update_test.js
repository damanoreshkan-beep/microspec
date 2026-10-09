import { assert, assertEquals } from "jsr:@std/assert@1";
import { pickNote, markFor } from "../update.js";
import { pkgRoot } from "../pkgroot.js";

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
  assertEquals(takeNow({ ...ok, playing: true }), false, "a song is playing: a reload would cut it");
});

Deno.test("update: a return after AWAY_MS is a launch — minutes, not the hour that let an installed app sit on one build for 28h", async () => {
  const { AWAY_MS } = await import("../update.js");
  assert(AWAY_MS >= 5 * 60000 && AWAY_MS <= 30 * 60000, `AWAY_MS ${AWAY_MS}`);
  const src = await Deno.readTextFile(new URL("packages/runtime/update.js", pkgRoot(import.meta.url, 3)));
  assert(/hiddenAt && Date\.now\(\) - hiddenAt >= AWAY_MS/.test(src), "the resume path must treat a long absence as a launch");
  assert(/stale = true/.test(src), "a page left on the old shell by another window's swap must mark itself stale and reload");
});

Deno.test("update: refreshNow — offline it touches nothing; online it drops ONLY this app's shell caches, unregisters and navigates", async () => {
  const { refreshNow } = await import("../update.js");
  const g = globalThis, saved = { fetch: g.fetch, caches: Object.getOwnPropertyDescriptor(g, "caches"), location: Object.getOwnPropertyDescriptor(g, "location") };
  const deleted = [], fetched = [];
  let unregistered = 0, went = "";
  Object.defineProperty(g, "caches", { configurable: true, value: { keys: async () => ["ms-fonoteka-abc", "ms-fonoteka-old", "ms-cdn-v1", "fonoteka-songs", "ms-share", "ms-store-abc"], delete: async (k) => deleted.push(k) } });
  Object.defineProperty(g, "location", { configurable: true, value: { pathname: "/fonoteka/", replace: (u) => { went = u; } } });
  const nav = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ unregister: async () => { unregistered++; return true; } }) } });
  try {
    g.fetch = () => Promise.reject(new TypeError("offline"));
    assertEquals(await refreshNow("fonoteka"), "offline");
    assertEquals(deleted.length + unregistered, 0, "offline: nothing deleted, nothing unregistered");
    g.fetch = async (u, o) => { fetched.push([String(u), o?.cache]); return new Response(u === "sw.js" ? 'self.MS = { precache: ["./", "./app.js", "../_rt/runtime.css", "https://cdn.example/x.js"] };' : "ok"); };
    assertEquals(await refreshNow("fonoteka"), "reloading");
    assertEquals(deleted.sort(), ["ms-fonoteka-abc", "ms-fonoteka-old"], "the songs, the parked share, the shared CDN cache and other apps stay");
    assertEquals(unregistered, 1);
    assertEquals(went, "/fonoteka/");
    for (const u of ["./", "./app.js", "../_rt/runtime.css"]) assert(fetched.some(([f, c]) => f === u && c === "reload"), `${u} not refreshed past the HTTP cache`);
    assert(!fetched.some(([f]) => f.startsWith("https://")), "pinned CDN files are not refetched");
  } finally {
    g.fetch = saved.fetch;
    if (saved.caches) Object.defineProperty(g, "caches", saved.caches); else delete g.caches;
    if (saved.location) Object.defineProperty(g, "location", saved.location); else delete g.location;
    if (nav) Object.defineProperty(navigator, "serviceWorker", nav); else delete navigator.serviceWorker;
  }
});
