// Demo helper (see docs/DEMO.md, Act A): simulate an agent shipping a feature but forgetting one
// translation — drop a single i18n key so the `preflight` gate catches it.
// Restore with:  git checkout apps/hf/i18n/uk.json
const p = "apps/hf/i18n/uk.json";
const d = JSON.parse(Deno.readTextFileSync(p));
delete d.tabSaved;
Deno.writeTextFileSync(p, JSON.stringify(d, null, 2) + "\n");
console.log('agent change applied — dropped i18n key "tabSaved"');
