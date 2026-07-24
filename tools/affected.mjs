
import { buildClosure, classifyAffected, RT } from "./graph.mjs";

const read = (f) => {
  try {
    return Deno.readTextFileSync(f);
  } catch {
    return null;
  }
};

function allApps() {
  const ids = [];
  try {
    for (const e of Deno.readDirSync("apps")) {
      if (!e.isDirectory) continue;
      if (
        read(`apps/${e.name}/spec.json`) != null &&
        read(`apps/${e.name}/e2e.spec.mjs`) != null
      ) ids.push(e.name);
    }
  } catch {  }
  return ids.sort();
}
const appEntry = (id) =>
  ["view.js", "data.js"].map((c) => `apps/${id}/${c}`).find((p) =>
    read(p) != null
  ) || null;

function changedFromArgs() {
  const args = Deno.args;
  if (args.includes("--all")) return null; 
  const ri = args.indexOf("--range");
  if (ri >= 0 && args[ri + 1]) {
    const out = new Deno.Command("git", {
      args: ["diff", "--name-only", args[ri + 1]],
    }).outputSync();
    return new TextDecoder().decode(out.stdout).split("\n").filter(Boolean);
  }
  return null; 
}

async function readStdin() {
  const buf = await new Response(Deno.stdin.readable).text();
  return buf.split("\n").map((s) => s.trim()).filter(Boolean);
}

const ids = allApps();
let changed = changedFromArgs();
if (changed === null && !Deno.args.includes("--all")) {
  changed = await readStdin();
}

let affected;
if (Deno.args.includes("--all") || changed === null) {
  affected = ids;
} else {
  const core = buildClosure(`${RT}index.js`, read);
  const apps = ids.map((id) => {
    const e = appEntry(id);
    return {
      id,
      closure: e ? buildClosure(e, read) : new Set([`apps/${id}/`]),
    };
  });
  affected = classifyAffected(changed, apps, core);
}
console.log(JSON.stringify(affected));
