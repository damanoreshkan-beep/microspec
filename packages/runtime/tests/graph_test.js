// microspec runtime — graph + affected-app orchestrator unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
// ===================== affected-app orchestrator (tools/graph.mjs) =====================
import { importSpecs, resolveSpec, buildClosure, classifyAffected, isGlobal, RT as RTX, RT_OVERLAY } from "../../../tools/graph.mjs";
import { staticSpecs, htmlAssets, importMapOf } from "../../../tools/graph.mjs";

Deno.test("graph: importSpecs finds static, re-export, dynamic and side-effect imports; ignores non-imports", () => {
  const src = `import { T } from "/_rt/i18n.js";\nimport X from "./x.js";\nexport { y } from "./y.js";\nconst p = import("./lazy.js");\nimport "./side.js";\nconst s = "not from \\"nope.js\\"";`;
  const got = new Set(importSpecs(src));
  for (const s of ["/_rt/i18n.js", "./x.js", "./y.js", "./lazy.js", "./side.js"]) assert(got.has(s), `missing ${s}`);
  assert(!got.has("nope.js"), "matched a non-import string");
});

Deno.test("graph: resolveSpec maps /_rt/ to the runtime dir, resolves relative, treats bare/esm as external", () => {
  // overlay-aware on purpose: in a product tree ambient.js IS a domain module and routes to rt/
  assertEquals(resolveSpec("/_rt/ambient.js", "apps/drift/view.js"), RT_OVERLAY.has("ambient.js") ? "rt/ambient.js" : RTX + "ambient.js");
  assertEquals(resolveSpec("./synth.js", "apps/drift/view.js"), "apps/drift/synth.js");
  assertEquals(resolveSpec("../runtime/x.js", "packages/gates/y.js"), "packages/runtime/x.js"); // plain path math, not RT
  assertEquals(resolveSpec("htm/preact", "apps/drift/view.js"), null);
  assertEquals(resolveSpec("jsr:@std/assert", "x.js"), null);
});

Deno.test("graph: buildClosure walks the transitive local graph, ignoring externals and dangling leaves", () => {
  // fixture keys go through RTX: RT is tree-dependent since the split (rt/ in the product, packages/runtime
  // in the framework), and this test runs in both trees.
  const files = {
    "apps/a/view.js": `import "/_rt/rt.js";\nimport "./child.js";\nimport "htm/preact";`,
    "apps/a/child.js": `import "/_rt/shared.js";`,
    [RTX + "rt.js"]: `import "./shared.js";`,
    [RTX + "shared.js"]: `export const x = 1;`,
  };
  const cl = buildClosure("apps/a/view.js", (f) => files[f] ?? null);
  for (const f of ["apps/a/view.js", "apps/a/child.js", RTX + "rt.js", RTX + "shared.js"]) assert(cl.has(f), `closure missing ${f}`);
  assertEquals(cl.has("htm/preact"), false, "external leaked into closure");
});

Deno.test("affected: a runtime module re-verifies ONLY the apps that import it (the whole point)", () => {
  const apps = [
    { id: "drift", closure: new Set(["apps/drift/view.js", RTX + "ambient.js", RTX + "spectrum.js"]) },
    { id: "rave", closure: new Set(["apps/rave/view.js", RTX + "groove.js", RTX + "spectrum.js"]) },
  ];
  const core = new Set([RTX + "index.js", RTX + "render.js"]);
  // ambient.js is drift-only → just drift (NOT the whole farm — this is what killed the 17-min run)
  assertEquals(classifyAffected([RTX + "ambient.js"], apps, core), ["drift"]);
  // spectrum.js is shared by both → both
  assertEquals(classifyAffected([RTX + "spectrum.js"], apps, core), ["drift", "rave"]);
  // a runtime module nobody imports → nobody
  assertEquals(classifyAffected([RTX + "orphan.js"], apps, core), []);
});

Deno.test("affected: app-dir changes scope to that app; tests/docs affect nothing", () => {
  const apps = [{ id: "drift", closure: new Set(["apps/drift/view.js"]) }, { id: "rave", closure: new Set(["apps/rave/view.js"]) }];
  const core = new Set();
  assertEquals(classifyAffected(["apps/drift/synth.js", "apps/drift/i18n/uk.json"], apps, core), ["drift"]);
  assertEquals(classifyAffected([RTX + "ambient_test.js", "README.md", "docs/x.md"], apps, core), []);
});

Deno.test("affected: shared/uncertain changes widen to the whole farm (safe direction)", () => {
  const apps = [{ id: "drift", closure: new Set() }, { id: "rave", closure: new Set() }];
  const core = new Set([RTX + "index.js", RTX + "render.js"]);
  assertEquals(classifyAffected([RTX + "render.js"], apps, core).length, 2, "core bootstrap change → whole farm");
  assertEquals(classifyAffected(["packages/gates/verify.mjs"], apps, core).length, 2, "harness change → whole farm");
  assertEquals(classifyAffected([RTX + "theme.css"], apps, core).length, 2, "runtime asset → whole farm");
  assertEquals(classifyAffected(["deno.json"], apps, core).length, 2, "root config → whole farm");
  assert(isGlobal("tools/graph.mjs", core), "orchestrator change → whole farm");
});

Deno.test("graph: staticSpecs excludes dynamic import() — lazy heavy deps must stay out of the precache", () => {
  const src = `import { html } from "htm/preact";\nimport "./side.js";\nexport * from "./re.js";\nconst T = await import("three");`;
  const s = staticSpecs(src);
  assert(s.includes("htm/preact") && s.includes("./side.js") && s.includes("./re.js"));
  assert(!s.includes("three"), "import(\"three\") is guarded + has a DOM fallback — precaching it would cost 600KB at install");
});

Deno.test("graph: htmlAssets takes real loads, not connection hints", () => {
  const html = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5">
    <link href="/_rt/theme.css" rel="stylesheet" type="text/css" />
    <link rel="icon" href="icon.svg">
    <script src="https://code.iconify.design/x.js"></script>`;
  const a = htmlAssets(html);
  assert(!a.includes("https://fonts.gstatic.com"), "preconnect is an origin hint, not a fetch");
  assert(a.includes("https://cdn.jsdelivr.net/npm/daisyui@5") && a.includes("/_rt/theme.css") && a.includes("icon.svg") && a.includes("https://code.iconify.design/x.js"));
});

Deno.test("graph: importMapOf reads the page's bare-specifier map (and survives no/broken map)", () => {
  assertEquals(importMapOf(`<script type="importmap">{"imports":{"preact":"https://esm.sh/preact@10.27.1"}}</script>`).preact, "https://esm.sh/preact@10.27.1");
  assertEquals(importMapOf("<html></html>"), {});
  assertEquals(importMapOf(`<script type="importmap">{ nope </script>`), {});
});
