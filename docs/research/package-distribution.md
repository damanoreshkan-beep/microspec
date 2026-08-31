# @microspec/core — how the core ships as a real package (research + the measured traps, 2026-08-31)

The owner's mandate: a PACKAGE, not symlink glue. The shape that survived contact with reality — every
claim below was hit, not guessed (deno 2.9.0; the primary-source survey lives in the session's research
note; this file records what the build actually depends on).

## The two channels, and why both exist

1. **Files** (for `/_rt` serving, the build's copy pass, fs reads): JSR's **npm-compat layer** —
   `package.json` `{"@microspec/core": "npm:@jsr/microspec__core@<v>"}` + `.npmrc`
   `@jsr:registry=https://npm.jsr.io` + `"nodeModulesDir": "auto"` → `deno install` materializes the FULL
   tarball (js, css, webp, json — publish does not graph-prune) under `node_modules/@jsr/microspec__core`.
   Plain `jsr:` deps NEVER materialize (hashed cache only).
2. **Execution** (gates, generators, build): the **jsr: pin** — tasks run
   `deno run -A jsr:@microspec/core@<v>/<export>`. NEVER execute package code from node_modules: code
   under node_modules runs in the **npm realm**, where `jsr:`/`https:` imports are refused and preact
   splits into two instances.

## The realm laws (each one cost a red round)

- **A remote (jsr/https) importer may neither `import()` a `file://` nor resolve through the import map.**
  Gate harnesses that dynamically import CONSUMER files (preflight → views, verify → e2e specs) take their
  `import()` from `globalThis.__msImport`, planted by a generated LOCAL shim (`.microspec/preflight.mjs`,
  `.microspec/verify.mjs`) before loading the remote script.
- **`deno test` refuses a remote URL as a test module — silently, when a local file rides along.** A unit
  node once passed on half its suites. Generated local shims (`.microspec/tests/*_test.js`) hold one-line
  https imports at the pin; the test nodes prefer them.
- **A CLI argument is never import-mapped**, and a bare `@scope/pkg/x` argument byonm-resolves into
  node_modules (the npm realm). Tasks therefore carry explicit `jsr:@microspec/core@<v>/…` specifiers.
- **Package-internal fs reads** go through `pkgRoot(import.meta.url, up)` (packages/runtime/pkgroot.js):
  file realm → itself; jsr realm → the materialized tarball at the consumer's cwd. Never bake an absolute
  URL into a generated artifact (kit.json once carried `file:///root/…` and drifted per machine).
- **JSR rejects `https:` imports and wildcard exports** at publish: bare specifiers with `npm:` pins in
  deno.json (the browser resolves the same names via each page's import map — esm.sh, unchanged), and
  `tools/exports-gen.mjs` enumerates the exports map (gated like kit.json).
- **The registry quarantines fresh versions** (~24 h "minimum dependency age"): consuming your own
  minutes-old publish needs `--minimum-dependency-age 0` on the first resolution (baked into the
  consumer's tasks; harmless after the window).
- **The npm-compat layer lags a publish by ~1 min** — poll `https://npm.jsr.io/@jsr%2fmicrospec__core`
  before `deno install` right after publishing.

## The generated artifacts (tools/rtmap.mjs, the `rtmap` gate node)

`preflight.map.json` (COMMITTED, drift-gated): exact `/_rt/<name>` keys → `./rt/…` for the domain overlay,
prefix `/_rt/` + `@microspec/core/runtime/` → `https://jsr.io/@microspec/core/<pin>/packages/runtime/`,
esm.sh CDN pins — one realm, one preact for everything preflight mounts. `.microspec/` (GITIGNORED): the
test shims + the local-importer shims.

## The bump ritual

core: edit version in deno.json → gates → commit → publish (OIDC workflow on main, repo linked on jsr.io)
→ push. product: replace the version in deno.json (imports + tasks) and package.json → `deno task install`
→ `deno task rtmap` → gates → push; its CI proves the pair.
