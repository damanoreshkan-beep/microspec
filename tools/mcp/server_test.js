// microspec — MCP server contract test. Spawns tools/mcp/server.mjs as a real subprocess and drives it
// over stdio exactly as a client does, because that is the only path production traffic takes: an in-process
// call to a handler would pass while the framing, the notification rule or the stdout discipline was broken.
//
//   deno test -A tools/mcp/server_test.js
import { assert, assertEquals } from "jsr:@std/assert@1";

const ROOT = new URL("../../", import.meta.url).pathname;

// A tiny MCP client: writes newline-delimited JSON-RPC, matches responses by id.
async function withServer(fn) {
  const child = new Deno.Command("deno", {
    args: ["run", "-A", "tools/mcp/server.mjs"],
    cwd: ROOT,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const w = child.stdin.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = child.stdout.getReader();
  let buf = "";
  const pending = [];

  const nextLine = async () => {
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl >= 0) { const l = buf.slice(0, nl); buf = buf.slice(nl + 1); if (l.trim()) return JSON.parse(l); continue; }
      const { value, done } = await reader.read();
      if (done) throw new Error("server closed stdout before answering");
      buf += dec.decode(value, { stream: true });
    }
  };

  let id = 0;
  const call = async (method, params) => {
    const myId = ++id;
    await w.write(enc.encode(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n"));
    for (;;) {
      const hit = pending.findIndex((m) => m.id === myId);
      if (hit >= 0) return pending.splice(hit, 1)[0];
      pending.push(await nextLine());
    }
  };
  const notify = (method, params) => w.write(enc.encode(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"));

  try {
    await fn({ call, notify });
  } finally {
    await w.close();
    reader.releaseLock();
    await child.stdout.cancel().catch(() => {});
    await child.stderr.cancel().catch(() => {});
    await child.status;
  }
}

Deno.test("initialize negotiates a protocol version and declares its capabilities", async () => {
  await withServer(async ({ call, notify }) => {
    const res = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    assertEquals(res.result.protocolVersion, "2025-06-18");
    assert(res.result.capabilities.tools, "tools capability must be declared");
    assert(res.result.capabilities.resources, "resources capability must be declared");
    assert(res.result.capabilities.prompts, "prompts capability must be declared");
    assertEquals(res.result.serverInfo.name, "microspec");
    await notify("notifications/initialized");
  });
});

Deno.test("an unknown protocol version still gets an answer, at the version we speak", async () => {
  await withServer(async ({ call }) => {
    const res = await call("initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    assertEquals(res.result.protocolVersion, "2025-06-18");
  });
});

Deno.test("tools/list advertises every tool with an object inputSchema", async () => {
  await withServer(async ({ call }) => {
    const { result } = await call("tools/list", {});
    const names = result.tools.map((t) => t.name).sort();
    assertEquals(names, ["get_doc", "list_components", "lookup_component", "scaffold_app"]);
    for (const t of result.tools) {
      assertEquals(t.inputSchema.type, "object", `${t.name} needs an object inputSchema`);
      assert(t.description.length > 20, `${t.name} needs a real description`);
    }
  });
});

Deno.test("list_components returns the whole kit, and lookup_component its full contract", async () => {
  await withServer(async ({ call }) => {
    const list = await call("tools/call", { name: "list_components", arguments: {} });
    assertEquals(list.result.isError, false);
    const text = list.result.content[0].text;
    for (const n of ["Sheet", "Segmented", "Island", "Panel", "Slider", "Row", "Transport", "Stage", "SHEET_BOX"]) {
      assert(text.includes(n), `list_components must mention ${n}`);
    }

    const one = await call("tools/call", { name: "lookup_component", arguments: { name: "Transport" } });
    const md = one.result.content[0].text;
    assert(md.includes("onScrubEnd"), "the full prop table must be present");
    // The prop note must arrive on the prop it describes — the attribution bug this manifest exists to avoid.
    const seekRow = md.split("\n").find((l) => l.startsWith("| `onSeek`"));
    assert(seekRow?.includes("seek bar appears"), `onSeek's note is misattributed: ${seekRow}`);
  });
});

Deno.test("a bad component name is a tool error carrying the valid names, not a protocol error", async () => {
  await withServer(async ({ call }) => {
    const res = await call("tools/call", { name: "lookup_component", arguments: { name: "Carousel" } });
    assertEquals(res.error, undefined, "must not be a JSON-RPC error");
    assertEquals(res.result.isError, true);
    assert(res.result.content[0].text.includes("Segmented"), "the error must list what does exist");
  });
});

Deno.test("scaffold_app refuses a path outside apps/", async () => {
  await withServer(async ({ call }) => {
    for (const dir of ["../etc", "/etc/passwd", "packages/runtime", "apps/x/../../etc"]) {
      const res = await call("tools/call", { name: "scaffold_app", arguments: { dir } });
      assertEquals(res.result.isError, true, `${dir} must be refused`);
      assert(res.result.content[0].text.includes("apps/<id>"), `${dir} must be refused by the path rule`);
    }
  });
});

Deno.test("resources list and read, including one component and one doc", async () => {
  await withServer(async ({ call }) => {
    const { result } = await call("resources/list", {});
    const uris = result.resources.map((r) => r.uri);
    assert(uris.includes("microspec://kit"));
    assert(uris.includes("microspec://kit/Sheet"));
    assert(uris.includes("microspec://docs/authoring"));

    const sheet = await call("resources/read", { uri: "microspec://kit/Sheet" });
    assertEquals(sheet.result.contents[0].mimeType, "text/markdown");
    assert(sheet.result.contents[0].text.includes("history-backed"), "Sheet's doctrine must come through");

    const doc = await call("resources/read", { uri: "microspec://docs/spec-schema" });
    assert(doc.result.contents[0].text.length > 1000);
  });
});

Deno.test("an unknown resource is -32002, an unknown method is -32601", async () => {
  await withServer(async ({ call }) => {
    const miss = await call("resources/read", { uri: "microspec://kit/Nope" });
    assertEquals(miss.error.code, -32002);
    const bad = await call("does/not/exist", {});
    assertEquals(bad.error.code, -32601);
  });
});

Deno.test("prompts list and get, with the argument interpolated", async () => {
  await withServer(async ({ call }) => {
    const { result } = await call("prompts/list", {});
    assertEquals(result.prompts.map((p) => p.name).sort(), ["new_app", "review_screen"]);

    const got = await call("prompts/get", { name: "new_app", arguments: { idea: "a tide clock" } });
    const text = got.result.messages[0].content.text;
    assertEquals(got.result.messages[0].role, "user");
    assert(text.includes("a tide clock"));
    assert(text.includes("Transport("), "the prompt must carry the real kit signatures");
  });
});

Deno.test("a notification gets no reply at all", async () => {
  await withServer(async ({ call, notify }) => {
    await notify("notifications/initialized");
    await notify("notifications/cancelled", { requestId: 1 });
    // If either produced a response, it would sit in the stream and be mistaken for this call's reply.
    const res = await call("ping", {});
    assertEquals(res.id, 1, "ping must be the first message on the wire");
    assertEquals(res.result, {});
  });
});
