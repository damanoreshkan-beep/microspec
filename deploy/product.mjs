// What the PRODUCT declares about itself, for the core's tools that need it — the build's link previews and the
// `shot` tool's default site. The core names no product: everything here is read from the product's own tree.
//
// - the site: the first of ORIGINS in the product's rt/backend.js (the module that shadows the core's
//   runtime/backend.js). That file is the product's code, and these tools run from the registry, which may not
//   import a local file — so a local `deno eval` child reads it. No file, or no origin: "" (no site).
// - the name, the accent and the ground: the store's title and brand.json.

/** The product's canonical site (`https://…`, no trailing slash), or "" when it declares none. */
export async function productSite(root = Deno.cwd()) {
  try { await Deno.stat(`${root}/rt/backend.js`); } catch { return ""; }
  const href = new URL(`file://${root}/rt/backend.js`).href;
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["eval", "--no-lock", `const m = await import(${JSON.stringify(href)}); console.log(JSON.stringify((m.ORIGINS || [])[0] || ""))`],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code) throw new Error(`rt/backend.js could not be read: ${new TextDecoder().decode(stderr).trim()}`);
  return JSON.parse(new TextDecoder().decode(stdout).trim());
}

/** `{ site, name, accent, ground }` — the product's identity for link previews. */
export async function productIdentity(apps = "apps", root = Deno.cwd()) {
  const read = async (p) => { try { return JSON.parse(await Deno.readTextFile(`${root}/${p}`)); } catch { return {}; } };
  const storeEn = await read(`${apps}/store/i18n/en.json`), brand = await read(`${apps}/store/brand.json`);
  return { site: await productSite(root), name: storeEn.title || "", accent: brand.fg || "#A39E94", ground: brand.bg || "#000000" };
}
