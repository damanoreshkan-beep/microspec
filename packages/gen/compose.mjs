export async function readLocales(dir) {
  const i18n = {};
  try {
    for await (const f of Deno.readDir(`${dir}/i18n`)) {
      const m = f.isFile && f.name.match(/^(.+)\.json$/);
      if (m) i18n[m[1]] = JSON.parse(await Deno.readTextFile(`${dir}/i18n/${f.name}`));
    }
  } catch { }
  return i18n;
}

export async function composeSpec(dir) {
  const spec = JSON.parse(await Deno.readTextFile(`${dir}/spec.json`));
  spec.i18n = await readLocales(dir);
  return spec;
}

export function localeList(i18n) {
  return Object.keys(i18n).sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}
