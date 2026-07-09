// microspec — assemble the farm into a static site for GitHub Pages. No backend: apps use the
// direct-first CORS chain (feed.js). Output: dist/_rt (shared runtime), dist/<app>/ per app, and a
// portal dist/index.html. Absolute `/_rt/` imports become relative `../_rt/` so the site works at any
// base path (Pages /<repo>/ or a root domain) with zero hardcoding.
//   deno run -A deploy/build.mjs

const OUT = "dist";
const rt = (s) => s.replaceAll("/_rt/", "../_rt/");
const has = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

await Deno.remove(OUT, { recursive: true }).catch(() => {});
await Deno.mkdir(`${OUT}/_rt`, { recursive: true });

// 1) shared runtime → dist/_rt (all .js except unit tests)
for await (const e of Deno.readDir("packages/runtime")) {
  if (e.isFile && e.name.endsWith(".js") && !e.name.endsWith("_test.js")) {
    await Deno.copyFile(`packages/runtime/${e.name}`, `${OUT}/_rt/${e.name}`);
  }
}

// 2) each app → dist/<id> (skip dev-only e2e/states); rewrite /_rt/ imports in html/js/json
const apps = [];
for await (const a of Deno.readDir("apps")) {
  if (!a.isDirectory || !(await has(`apps/${a.name}/spec.json`))) continue;
  const spec = JSON.parse(await Deno.readTextFile(`apps/${a.name}/spec.json`));
  await Deno.mkdir(`${OUT}/${a.name}`, { recursive: true });
  for await (const f of Deno.readDir(`apps/${a.name}`)) {
    if (!f.isFile || f.name === "e2e.spec.mjs") continue;
    if (/\.(html|js|json|svg|png|webmanifest)$/.test(f.name)) {
      if (/\.(html|js|json)$/.test(f.name)) {
        await Deno.writeTextFile(`${OUT}/${a.name}/${f.name}`, rt(await Deno.readTextFile(`apps/${a.name}/${f.name}`)));
      } else {
        await Deno.copyFile(`apps/${a.name}/${f.name}`, `${OUT}/${a.name}/${f.name}`);
      }
    }
  }
  const d = spec.i18n?.uk || spec.i18n?.en || {};
  apps.push({ id: a.name, title: d.title || a.name, tagline: d.profTagline || "", icon: spec.profile?.icon || spec.tabs?.[0]?.icon || "lucide:box", theme: spec.theme || "dim" });
}
apps.sort((a, b) => a.title.localeCompare(b.title));

// 3) portal
const cards = apps.map((a) => `      <a href="${a.id}/" class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition hover:border-primary/40">
        <div class="card-body p-5 items-center text-center gap-2">
          <iconify-icon icon="${a.icon}" class="text-4xl text-primary"></iconify-icon>
          <div class="font-bold">${a.title}</div>
          <div class="text-sm text-base-content/70">${a.tagline}</div>
        </div>
      </a>`).join("\n");

const portal = `<!DOCTYPE html>
<html lang="uk" data-theme="dim">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1c212b">
  <title>microspec — farm</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
  <script src="https://code.iconify.design/iconify-icon/3.0.0/iconify-icon.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',ui-sans-serif,system-ui,sans-serif}</style>
</head>
<body class="bg-base-200 min-h-dvh">
  <main class="max-w-xl mx-auto px-4 py-8 flex flex-col gap-4">
    <header class="text-center flex flex-col gap-1">
      <iconify-icon icon="lucide:layout-grid" class="text-4xl text-primary mx-auto"></iconify-icon>
      <h1 class="text-2xl font-bold">microspec</h1>
      <p class="text-sm text-base-content/70">Installable micro-PWAs — spec-driven, gated, offline.</p>
    </header>
    <div class="grid grid-cols-2 gap-3">
${cards}
    </div>
  </main>
</body>
</html>
`;
await Deno.writeTextFile(`${OUT}/index.html`, portal);
await Deno.writeTextFile(`${OUT}/.nojekyll`, "");

console.log(`built dist/ — ${apps.length} apps: ${apps.map((a) => a.id).join(", ")}`);
