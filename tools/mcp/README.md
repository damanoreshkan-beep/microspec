# microspec MCP server

Serves the farm's UI kit and its authoring doctrine to any MCP client (Claude Code, Codex) over stdio.

```bash
deno run -A tools/mcp/server.mjs        # normally launched by the client, not by hand
deno task kit                           # regenerate tools/mcp/kit.json from packages/runtime/ui.js
deno test -A tools/mcp/server_test.js   # contract test, driven over real stdio
```

Registered project-scoped in `.mcp.json`, so a client started **inside this repo** picks it up (the command
path is repo-relative on purpose — an absolute path would be wrong for every other clone). First use asks
for approval.

## Why it exists

An agent authoring an app needs two things the kit already contains: the **signature** of each component,
and the **reasoning** behind it — when Island rather than Panel, why a Sheet is deliberately not
history-backed by itself, why `Segmented` is monochrome by construction. Both live in
`packages/runtime/ui.js`; the manifest derives them instead of restating them.

That derivation is the whole design. A hand-written component doc is a second copy of a contract, and a
second copy drifts the first time a prop is added — silently, because nothing fails. So:

`packages/runtime/ui.js` → `tools/kit-manifest.mjs` → `tools/mcp/kit.json` → this server

and `deno run -A tools/kit-manifest.mjs --check` runs in `deno task gates` **and** in CI's unit job, which
makes drift a red build rather than a plausible answer.

The generator is deliberately loud: it crashes rather than emit a partial result, because a manifest that
silently missed a prop is one the `--check` gate would then bless forever. It asserts that every export
carries documentation, that the export count it produced matches the export count in the file, and that
every component parsed to a non-empty prop list.

> Comment attribution is the subtle part. `splitTop` cuts the parameter list at commas, so a trailing
> `// seek bar appears when onSeek is given` lands at the *head* of the next parameter. Attaching it there
> shifted every note in `Transport` by one prop — a manifest that read perfectly and documented the wrong
> thing. The rule that separates the two cases is physical: a comment on the entry's first line trailed the
> previous parameter; a comment on its own line documents the next one. Both directions are covered by the
> contract test.

## Surface

**Resources**

| URI | What |
|---|---|
| `microspec://kit` | the whole generated manifest (JSON) |
| `microspec://kit/{Name}` | one component as markdown — signature, prop table, design reasoning |
| `microspec://docs/authoring` | `docs/AUTHORING.md` |
| `microspec://docs/spec-schema` | `packages/schema/SCHEMA.md` |
| `microspec://docs/design-rubric` | `docs/DESIGN_RUBRIC.md` |
| `microspec://docs/gate-blindspots` | `docs/GATE_BLINDSPOTS.md` |
| `microspec://docs/testing` | `docs/TESTING.md` |

Docs are read from disk per request, never cached, so an edit is live in the next call.

**Tools** — `list_components`, `lookup_component(name)`, `get_doc(doc)`, `scaffold_app(dir, force?)`.

`scaffold_app` is the only one that writes. Its `dir` is constrained to `apps/<id>` rather than trusted,
and it is a *post*-authoring step: `scaffold.mjs` picks the app's mode from which files already exist, so
`spec.json`, `i18n/` and `view.js`/`stream.js` must be authored **first**. Scaffolding early yields a
data-mode shell with an empty view and a green preflight.

**Prompts** — `new_app(idea)`, `review_screen(app)`.

## No SDK

The official MCP SDK is an npm package; this farm has no npm and no `node_modules`. MCP over stdio is
newline-delimited JSON-RPC 2.0, and the surface here is nine methods, so the server is ~200 lines of Deno
with zero dependencies. Two rules from the spec are load-bearing and easy to break by accident: messages
must not contain embedded newlines (`JSON.stringify` escapes them, so this holds by construction), and
**stdout must carry nothing but MCP messages** — every log in the server goes to stderr.
