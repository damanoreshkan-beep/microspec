import { pkgRoot } from "../../packages/runtime/pkgroot.js";
const ROOT = pkgRoot(import.meta.url, 2);
const PROTOCOL = "2025-06-18";
const SUPPORTED = new Set([PROTOCOL, "2025-03-26", "2024-11-05"]);

const enc = new TextEncoder();
const log = (...a) => console.error("[microspec-mcp]", ...a);
const read = (rel) => Deno.readTextFile(new URL(rel, ROOT));

const DOCS = {
  authoring: { path: "docs/AUTHORING.md", title: "Authoring a microspec app", desc: "The authoring loop, tool apps vs data apps, systemic capabilities, sensor apps. Read before creating an app." },
  "spec-schema": { path: "packages/schema/SCHEMA.md", title: "spec.json contract", desc: "Every field of spec.json — the contract the ajv gate enforces. Read before writing or editing a spec." },
  "design-rubric": { path: "docs/DESIGN_RUBRIC.md", title: "Design rubric (the taste gate)", desc: "How to judge a rendered screenshot as a demanding designer. A green gate is a floor, not a verdict." },
  "gate-blindspots": { path: "docs/GATE_BLINDSPOTS.md", title: "What the gates cannot see", desc: "Read before claiming a green gate means the app works." },
  testing: { path: "docs/TESTING.md", title: "Gate internals & e2e helpers", desc: "How the gates run and what the e2e helper surface offers." },
};

const kit = async () => JSON.parse(await read("tools/mcp/kit.json"));

const renderComponent = (e) => {
  const title = e.headline ? (e.headline.startsWith(e.name) ? e.headline : `${e.name} — ${e.headline}`) : e.name;
  const out = [`## ${title}`, ``, `import { ${e.name} } from "/_rt/ui.js";   // ${e.kind}, ${e.source ?? "packages/runtime/ui.js"}:${e.line}`, ``];
  if (e.kind === "constant") out.push("```js", `${e.name} = ${JSON.stringify(e.value)}`, "```", "");
  else out.push("```js", e.signature, "```", "");
  if (e.props?.length) {
    out.push("| prop | default | note |", "| --- | --- | --- |");
    for (const p of e.props) out.push(`| \`${p.name}\` | ${p.default !== undefined ? `\`${p.default}\`` : "—"} | ${(p.note || "").replace(/\|/g, "\\|")} |`);
    out.push("");
  }
  if (e.doc) out.push("### Why it is shaped this way", "", e.doc);
  return out.join("\n");
};

const TOOLS = [
  {
    name: "list_components",
    title: "List the microspec UI kit",
    description: "Every export of the farm's UI kit (/_rt/ui.js) with its signature and one-line purpose. Call this before hand-rolling any sheet, tab strip, panel, slider, transport or visualiser box — the farm's rule is that an app uses the kit and never its own copy.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lookup_component",
    title: "Look up one kit component",
    description: "Full contract for one kit export: signature, every prop with its default and the author's note, and the design reasoning behind the component. Use it instead of reading packages/runtime/ui.js.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Export name, e.g. Transport, Sheet, Segmented" } }, required: ["name"] },
  },
  {
    name: "get_doc",
    title: "Read a microspec authoring doc",
    description: "Read one of the farm's authoring documents in full.",
    inputSchema: { type: "object", properties: { doc: { type: "string", enum: Object.keys(DOCS), description: "Which document" } }, required: ["doc"] },
  },
  {
    name: "scaffold_app",
    title: "Scaffold an app's boilerplate",
    description: "Run packages/gen/scaffold.mjs over an app directory: generates index.html, manifest.json, sw.js and icon.svg from the authored spec.json + i18n/*.json. IMPORTANT: it does not create an app from nothing — spec.json and i18n/ must already exist, and view.js or stream.js must already exist if the app is a tool or stream app, because scaffold picks the mode from which files are present.",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "App directory, e.g. apps/breathe" },
        force: { type: "boolean", description: "Overwrite authored files too (default false)" },
      },
      required: ["dir"],
    },
  },
];

async function callTool(name, args) {
  if (name === "list_components") {
    const m = await kit();
    const rows = m.exports.map((e) => `- **${e.name}** (${e.kind}) — ${e.headline || (e.doc || "").split("\n")[0]}\n  \`${e.signature ?? `${e.name} = ${JSON.stringify(e.value)?.slice(0, 60)}…`}\``);
    return `The microspec UI kit — \`import { … } from "/_rt/ui.js"\` (${m.count} exports, generated from ${m.source}):\n\n${rows.join("\n")}`;
  }

  if (name === "lookup_component") {
    const m = await kit();
    const e = m.exports.find((x) => x.name === args?.name) ||
      m.exports.find((x) => x.name.toLowerCase() === String(args?.name ?? "").toLowerCase());
    if (!e) throw new Error(`No kit export named ${JSON.stringify(args?.name)}. Available: ${m.exports.map((x) => x.name).join(", ")}`);
    return renderComponent({ ...e, source: m.source });
  }

  if (name === "get_doc") {
    const d = DOCS[args?.doc];
    if (!d) throw new Error(`Unknown doc ${JSON.stringify(args?.doc)}. Available: ${Object.keys(DOCS).join(", ")}`);
    return `# ${d.title}\n<!-- ${d.path} -->\n\n${await read(d.path)}`;
  }

  if (name === "scaffold_app") {
    const dir = String(args?.dir ?? "").replace(/\/+$/, "");
    if (!/^apps\/[a-z0-9-]+$/.test(dir)) throw new Error(`dir must look like apps/<id> (lowercase, digits, hyphens) — got ${JSON.stringify(args?.dir)}`);
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", "packages/gen/scaffold.mjs", dir, ...(args?.force ? ["--force"] : [])],
      cwd: new URL(".", ROOT).pathname,
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    const out = new TextDecoder().decode(stdout).trim();
    const err = new TextDecoder().decode(stderr).trim();
    if (code !== 0) throw new Error(`scaffold.mjs exited ${code}\n${err || out}`);
    return `${out}${err ? `\n${err}` : ""}\n\nNext: run the local gates before committing —\n  deno task gates`;
  }

  throw new Error(`Unknown tool: ${name}`);
}

const PROMPTS = [
  {
    name: "new_app",
    title: "Author a new microspec app",
    description: "The farm's authoring loop for a new app, wired to the kit and the invariants.",
    arguments: [{ name: "idea", description: "What the app should do", required: true }],
  },
  {
    name: "review_screen",
    title: "Review a rendered screen as a designer",
    description: "The taste gate: judge a populated screen in both themes, not the empty state.",
    arguments: [{ name: "app", description: "App id, e.g. handpan", required: true }],
  },
];

async function getPrompt(name, args) {
  if (name === "new_app") {
    const m = await kit();
    return {
      description: "Author a microspec app",
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `Author a new microspec app: ${args?.idea ?? "(idea not given — ask first)"}`,
            ``,
            `Follow the farm's loop: research → plan → build → verify. Before writing any UI, read the`,
            `resource microspec://docs/authoring and microspec://docs/spec-schema.`,
            ``,
            `Use the kit — never hand-roll a sheet, tab strip, panel, slider or transport. Available:`,
            m.exports.map((e) => `  ${e.signature ?? e.name}`).join("\n"),
            ``,
            `Order matters: author spec.json + i18n/{en,uk}.json + view.js (or data.js / stream.js) FIRST,`,
            `then run scaffold_app — scaffold picks the app's mode from which of those files exist, so`,
            `scaffolding early produces a data-mode shell with an empty view and a green preflight.`,
            ``,
            `Then: deno task gates`,
          ].join("\n"),
        },
      }],
    };
  }
  if (name === "review_screen") {
    return {
      description: "Taste-gate a rendered screen",
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `Shoot and review the app "${args?.app ?? "(app not given — ask first)"}" as a demanding designer.`,
            ``,
            `  deno run -A packages/gates/shoot.mjs ${args?.app ?? "<app>"} --seed`,
            ``,
            `Judge the POPULATED screen, in both themes, at the reference device — not the empty state.`,
            `Read the shot by coordinates, not impressions: alignment, balance, rim-hugging, whether two`,
            `glass surfaces sit close enough to read as one welded block.`,
            ``,
            `A green gate is a floor, not a verdict — read microspec://docs/gate-blindspots and`,
            `microspec://docs/design-rubric. Where the eye and a gate disagree, the eye wins and the gate`,
            `gets fixed.`,
          ].join("\n"),
        },
      }],
    };
  }
  throw new Error(`Unknown prompt: ${name}`);
}

async function listResources() {
  const m = await kit();
  return [
    { uri: "microspec://kit", name: "kit", title: "microspec UI kit (all exports)", description: `The whole generated kit manifest — ${m.count} exports from ${m.source}.`, mimeType: "application/json" },
    ...m.exports.map((e) => ({
      uri: `microspec://kit/${e.name}`,
      name: e.name,
      title: `${e.name} — ${e.headline || e.kind}`,
      description: (e.doc || "").split("\n")[0].slice(0, 200),
      mimeType: "text/markdown",
    })),
    ...Object.entries(DOCS).map(([k, d]) => ({ uri: `microspec://docs/${k}`, name: k, title: d.title, description: d.desc, mimeType: "text/markdown" })),
  ];
}

async function readResource(uri) {
  if (uri === "microspec://kit") return { mimeType: "application/json", text: await read("tools/mcp/kit.json") };
  const comp = uri.match(/^microspec:\/\/kit\/(.+)$/);
  if (comp) {
    const m = await kit();
    const e = m.exports.find((x) => x.name === comp[1]);
    if (!e) return null;
    return { mimeType: "text/markdown", text: renderComponent({ ...e, source: m.source }) };
  }
  const doc = uri.match(/^microspec:\/\/docs\/(.+)$/);
  if (doc && DOCS[doc[1]]) return { mimeType: "text/markdown", text: await read(DOCS[doc[1]].path) };
  return null;
}

const send = (msg) => Deno.stdout.write(enc.encode(JSON.stringify(msg) + "\n"));
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const err = (id, code, message, data) => send({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize": {
        const asked = params?.protocolVersion;
        if (asked && !SUPPORTED.has(asked)) log(`client asked for protocol ${asked}; answering ${PROTOCOL}`);
        return ok(id, {
          protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL,
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "microspec", title: "microspec farm", version: "0.1.0" },
          instructions: "The microspec farm's own kit and authoring doctrine. Call list_components before building any UI — the farm's rule is that an app uses /_rt/ui.js and never hand-rolls a sheet, tab strip, panel, slider or transport. lookup_component gives one component's full contract plus the reasoning behind it, so you never need to read packages/runtime/ui.js.",
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return;
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call": {
        try {
          const text = await callTool(params?.name, params?.arguments ?? {});
          return ok(id, { content: [{ type: "text", text }], isError: false });
        } catch (e) {
          return ok(id, { content: [{ type: "text", text: String(e?.message ?? e) }], isError: true });
        }
      }
      case "resources/list":
        return ok(id, { resources: await listResources() });
      case "resources/templates/list":
        return ok(id, {
          resourceTemplates: [{ uriTemplate: "microspec://kit/{name}", name: "kit component", title: "One UI kit component", description: "Signature, props and design reasoning for one export of /_rt/ui.js", mimeType: "text/markdown" }],
        });
      case "resources/read": {
        const found = await readResource(params?.uri);
        if (!found) return err(id, -32002, "Resource not found", { uri: params?.uri });
        return ok(id, { contents: [{ uri: params.uri, ...found }] });
      }
      case "prompts/list":
        return ok(id, { prompts: PROMPTS });
      case "prompts/get":
        return ok(id, await getPrompt(params?.name, params?.arguments ?? {}));
      default:
        if (isNotification) return;
        return err(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    log("handler failed:", e?.stack ?? e);
    if (!isNotification) return err(id, -32603, String(e?.message ?? e));
  }
}

const decoder = new TextDecoder();
let buf = "";
log(`serving ${new URL(".", ROOT).pathname} on stdio (protocol ${PROTOCOL})`);
for await (const chunk of Deno.stdin.readable) {
  buf += decoder.decode(chunk, { stream: true });
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { err(null, -32700, "Parse error"); continue; }
    if (Array.isArray(msg)) { for (const m of msg) await handle(m); continue; }
    await handle(msg);
  }
}
