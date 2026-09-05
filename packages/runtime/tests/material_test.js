import { assert, assertEquals } from "jsr:@std/assert@1";
import { applyMaterial, loadMaterials, materialHref, MATERIAL_KEY } from "../material.js";

// a document is two things to this module: a list of stylesheet links, and a root to stamp
const fakeDoc = (href) => {
  const attrs = { rel: "stylesheet", href };
  const link = { getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; } };
  const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  return { querySelectorAll: () => [link], documentElement: root, link, root };
};
const REG = [{ id: "lum", name: { en: "Glow", uk: "Сяйво" }, css: "theme-lum.css" }, { id: "plain", name: { en: "Plain", uk: "Просто" }, css: "theme-plain.css" }];

Deno.test("material · the link swap keeps the path and changes only the file, for a built and a source page", () => {
  assertEquals(materialHref("../_rt/theme.css", "theme-smoke.css"), "../_rt/theme-smoke.css");
  assertEquals(materialHref("/_rt/theme.css", "theme-smoke.css"), "/_rt/theme-smoke.css");
  assertEquals(materialHref("/_rt/theme-lum.css?v=3", "theme-plain.css"), "/_rt/theme-plain.css", "a query string is dropped with the file it belonged to");
  assertEquals(materialHref("/_rt/app.css", "theme-plain.css"), "/_rt/app.css", "a link that is not the theme is left alone");
  // daisyui's `themes.css` is linked FIRST on every page; the old `theme[\w-]*\.css` matched it and the swap went
  // to the wrong link (2026-09-05) — the file name is `theme.css` or `theme-<id>.css`, nothing else
  assertEquals(materialHref("https://cdn.jsdelivr.net/npm/daisyui@5/themes.css", "theme-lum.css"), "https://cdn.jsdelivr.net/npm/daisyui@5/themes.css", "daisyui's themes.css is not the theme link");
});

Deno.test("material · applyMaterial rewrites the theme link, stamps the root, and falls back to the default for an unknown id", () => {
  const d = fakeDoc("../_rt/theme.css");
  assertEquals(applyMaterial("plain", REG, d), "plain");
  assertEquals(d.link.getAttribute("href"), "../_rt/theme-plain.css");
  assertEquals(d.root.attrs["data-material"], "plain");
  assertEquals(applyMaterial("gone", REG, d), "lum", "an unknown id (a theme removed after being chosen) is the default, silently");
  assertEquals(d.link.getAttribute("href"), "../_rt/theme-lum.css");
  assertEquals(applyMaterial("lum", [], d), null, "no registry — nothing to apply, nothing touched");
});

Deno.test("material · the registry is optional: a missing or malformed themes.json is an empty list, never a throw", async () => {
  assertEquals(await loadMaterials(async () => ({ ok: false })), []);
  assertEquals(await loadMaterials(async () => { throw new Error("offline"); }), []);
  assertEquals(await loadMaterials(async () => ({ ok: true, json: async () => ({ not: "a list" }) })), []);
  const list = await loadMaterials(async () => ({ ok: true, json: async () => [...REG, { id: "broken" }] }));
  assertEquals(list.map((m) => m.id), ["lum", "plain"], "an entry without a css file is dropped");
  assert(MATERIAL_KEY === "ms:material", "the key is farm-wide — a material is the person's, not the app's");
});
