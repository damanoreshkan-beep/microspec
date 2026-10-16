
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
