const SRC = "https://standards-oui.ieee.org/oui/oui.csv";
const OUT = new URL("../../apps/hive/assets/oui.txt", import.meta.url);

function row(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const TIDY = /[,.]?\s*(Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|GmbH|S\.A|SA|AG|B\.V|BV|N\.V|NV|Pty|PLC|LP|KG|SAS|SRL|A\/S|AB|Oy|s\.r\.o|Technologies|Technology|Tech)\b\.?/gi;
const tidy = (s) => s.replace(TIDY, "").replace(/\s*\([^)]*\)/g, "").replace(/[\s,.\-]+$/, "").replace(/\s{2,}/g, " ").trim();

const csv = await (await fetch(SRC)).text();
const map = new Map();
for (const line of csv.split(/\r?\n/).slice(1)) {
  if (!line) continue;
  const r = row(line);
  if (r[0] !== "MA-L") continue;
  const pref = (r[1] || "").trim().toUpperCase();
  const org = tidy((r[2] || "").trim()).slice(0, 28);
  if (!/^[0-9A-F]{6}$/.test(pref) || !org) continue;
  map.set(pref, org);
}

const prefixes = [...map.keys()].sort();
const vendors = [...new Set(map.values())];
const vi = new Map(vendors.map((v, i) => [v, i]));

let prev = 0;
const deltas = prefixes.map((p) => { const v = parseInt(p, 16); const d = v - prev; prev = v; return d.toString(36); });
const idx = prefixes.map((p) => vi.get(map.get(p)).toString(36));

const blob = `${deltas.join(",")}\n${idx.join(",")}\n${vendors.join("\n")}`;
await Deno.mkdir(new URL("./", OUT), { recursive: true });
await Deno.writeTextFile(OUT, blob);
console.log(`oui: ${prefixes.length} prefixes, ${vendors.length} vendors -> ${(blob.length / 1024).toFixed(0)} KB`);
