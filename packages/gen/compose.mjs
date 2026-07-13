// microspec — spec composition. Translations live in per-locale files (apps/<id>/i18n/<locale>.json),
// NOT inline in spec.json, so each language is an isolated, reviewable file. spec.json holds only the
// app's structure. The runtime composes them in index.html (import each locale → start({...spec, i18n}));
// the Deno-side tools (validate/scaffold/manifest) compose via the helpers here.

// readLocales(dir) → { <locale>: dict }, one entry per apps/<id>/i18n/*.json (locale = file basename).
export async function readLocales(dir) {
  const i18n = {};
  try {
    for await (const f of Deno.readDir(`${dir}/i18n`)) {
      const m = f.isFile && f.name.match(/^(.+)\.json$/);
      if (m) i18n[m[1]] = JSON.parse(await Deno.readTextFile(`${dir}/i18n/${f.name}`));
    }
  } catch { /* no i18n dir → empty (validateSpec will flag the missing en) */ }
  return i18n;
}

// composeSpec(dir) → the full spec object (structure + composed i18n), as the runtime sees it.
export async function composeSpec(dir) {
  const spec = JSON.parse(await Deno.readTextFile(`${dir}/spec.json`));
  spec.i18n = await readLocales(dir);
  return spec;
}

// Stable, sorted locale list (en first — the required fallback — then the rest alphabetically).
export function localeList(i18n) {
  return Object.keys(i18n).sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}
