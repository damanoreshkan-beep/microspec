const p = "apps/hf/i18n/uk.json";
const d = JSON.parse(Deno.readTextFileSync(p));
delete d.tabSaved;
Deno.writeTextFileSync(p, JSON.stringify(d, null, 2) + "\n");
console.log('agent change applied — dropped i18n key "tabSaved"');
