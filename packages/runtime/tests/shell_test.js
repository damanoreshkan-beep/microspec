import { assert, assertEquals } from "jsr:@std/assert@1";
import { shell, ERR } from "../shell.js";

Deno.test("shell: a browser has no bridge, and says so in one closed vocabulary", async () => {
  delete globalThis.window;
  assertEquals(shell.present, false);
  assertEquals(shell.version, 0);
  assertEquals(shell.has("system.info"), false);
  assertEquals(shell.why("system.info"), ERR.unsupported);
  assertEquals(shell.why("nope.nope"), ERR.unsupported);
  const e = await shell.call("system.info").catch((x) => x);
  assertEquals(e.code, ERR.unsupported);
  assertEquals(shell.subscribe("system.info", {}, () => {})(), undefined);
});

Deno.test("shell: a shell older than the action is staleBridge, not a silent failure", async () => {
  globalThis.window = globalThis;
  globalThis.__msShell = { call: () => {}, subscribe: () => {}, cancel: () => {} };
  try {
    assertEquals(shell.present, true);
    assertEquals(shell.version, 0);
    assertEquals(shell.has("system.info"), false);
    assertEquals(shell.why("system.info"), ERR.staleBridge);
    const e = await shell.call("system.info").catch((x) => x);
    assertEquals(e.code, ERR.staleBridge);
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("shell: a current bridge round-trips a call, and errors keep their code", async () => {
  globalThis.window = globalThis;
  const sent = [];
  globalThis.__msShell = {
    version: 1,
    call: (id, action, args) => { sent.push({ id, action, args }); },
    subscribe: () => {}, cancel: () => {},
  };
  try {
    assertEquals(shell.has("system.info"), true);
    assertEquals(shell.why("system.info"), "");
    const p = shell.call("system.info", { a: 1 });
    assertEquals(sent.length, 1);
    assertEquals(sent[0].action, "system.info");
    assertEquals(sent[0].args, '{"a":1}');
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[0].id, ok: true, value: { bridge: 1 } } }));
    assertEquals((await p).bridge, 1);

    const q = shell.call("system.info");
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[1].id, ok: false, code: ERR.denied, detail: "user said no" } }));
    const e = await q.catch((x) => x);
    assertEquals(e.code, ERR.denied);
    assertEquals(e.detail, "user said no");
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});

Deno.test("shell: the catalogue is the surface, and an action carries what a screen needs", () => {
  assert(shell.actions.includes("system.info"));
  const a = shell.action("system.info");
  assertEquals(a.capability, "system");
  assertEquals(a.kind, "call");
  assertEquals(a.android, []);
  assertEquals(shell.action("nope.nope"), null);
});

Deno.test("shell: a subscription that fails tells the caller, instead of looking empty", async () => {
  globalThis.window = globalThis;
  const sent = [];
  globalThis.__msShell = {
    version: () => 99,
    call: () => {}, cancel: () => {},
    subscribe: (id, action) => { sent.push({ id, action }); },
  };
  try {
    let events = 0, failed = null;
    shell.subscribe("ble.scan", {}, () => events++, (e) => { failed = e; });
    globalThis.dispatchEvent(new CustomEvent("msShell:reply", { detail: { id: sent[0].id, ok: false, code: ERR.denied } }));
    assertEquals(events, 0);
    assertEquals(failed?.code, ERR.denied, "a refused stream must reach onError, not vanish");

    globalThis.__msShell.version = () => 1;
    let stale = null;
    shell.subscribe("ble.scan", {}, () => {}, (e) => { stale = e; });
    assertEquals(stale?.code, ERR.staleBridge);
  } finally { delete globalThis.__msShell; delete globalThis.window; }
});
