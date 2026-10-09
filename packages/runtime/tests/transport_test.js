import { assert, assertEquals } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
import { APPS } from "../../../tools/graph.mjs";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("Transport compacts on its CONTAINER, never on the viewport", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  assert(/@container/.test(tp), "the transport must establish a container — it is sized by the space IT has");
  assert(/@max-\[\d+px\]:/.test(tp), "no container-query compaction: the row will overflow where it is narrow");
  assert(!/\bmin-\[\d+px\]:|\bmax-\[\d+px\]:/.test(tp.replace(/@(max|min)-\[\d+px\]:/g, "")),
    "viewport width variants in the transport — use @container variants instead");
});

Deno.test("Transport compacts by DEMOTION — a hidden action is still reachable, with its word", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  const sheet = tp.slice(tp.indexOf("data-tp-sheet"));
  assert(/\.\.\.actions,/.test(sheet), "the sheet must spread every action, not a demoted subset");
  for (const k of ["aPrev", "aNext", "aShuffle", "aRepeat"])
    assert(sheet.includes(k), `the sheet does not carry ${k} — a key hidden at 230px would be unreachable`);
  assert(!/overflow\.map\(/.test(sheet), "the sheet lists a different set depending on width — unlearnable");
  assert(/overflow\.map\(.{0,60}@max-\[\d+px\]:hidden/.test(tp.replace(/\n\s*/g, " ")),
    "demoted actions must be hidden by a container query, not dropped from the tree");
  const row = sheet.slice(0, sheet.indexOf("</button>"));
  assert(!/\bid=\$\{a\.id/.test(row) && !/\.\.\.\$\{a\.attr/.test(row), "sheet row duplicates the inline hooks");
});

Deno.test("no app passes the Transport a prop it does not accept (a silent prop is a lost button)", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const sig = ui.slice(ui.indexOf("export function Transport("), ui.indexOf("}) {", ui.indexOf("export function Transport(")));
  const bare = sig.replace(/\/\/[^\n]*/g, "").replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "0");
  const accepted = new Set([...bare.matchAll(/(?:^|[,{])\s*([a-zA-Z][a-zA-Z0-9]*)\s*(?=[,=}]|$)/gm)].map((m) => m[1]));
  accepted.add("children"); accepted.add("key");
  assert(accepted.has("actions") && accepted.has("onToggle"), "could not read the Transport signature");

  const appsDir = new URL(`file://${Deno.cwd()}/${APPS}/`);
  const offenders = [];
  for await (const e of Deno.readDir(appsDir)) {
    if (!e.isDirectory) continue;
    let src = "";
    try { src = await Deno.readTextFile(new URL(`${e.name}/view.js`, appsDir)); } catch { continue; }
    for (const call of src.matchAll(/<\$\{Transport\}/g)) {
      const from = call.index + call[0].length;
      const region = src.slice(from, from + 4000);
      let depth = 0;
      for (let k = 0; k < region.length; k++) {
        if (region[k] === "`") { depth += region.slice(k - 4, k) === "html" ? 1 : -1; continue; }
        if (depth > 0) continue;
        if (region[k] === "/" && region[k + 1] === ">") break;
        const m = /^([a-zA-Z][a-zA-Z0-9]*)=/.exec(region.slice(k, k + 40));
        if (m && /[\s{]/.test(region[k - 1] || " ")) { if (!accepted.has(m[1])) offenders.push(`${e.name}: ${m[1]}`); k += m[1].length; }
      }
    }
  }
  assertEquals(offenders, [], "Transport props that the kit ignores — the control they carry does not render");
});

Deno.test("Transport — every control is opt-in, and the mode toggles frame the transport keys", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  for (const [h, id] of [["onShuffle", "shuffle"], ["onRepeat", "repeat"], ["onPrev", "prev"], ["onNext", "next"]])
    assert(new RegExp(`\\$\\{\\s*${h}\\s*\\?`).test(tp) || new RegExp(`${h}\\s*\\?`).test(tp),
      `${id} is not gated on ${h} — an app that never passes it still gets the button`);
  const at = (needle) => tp.indexOf(needle);
  const [sh, pv, pl, nx, rp] = ['id="shuffle"', 'id="prev"', 'id="play"', 'id="next"', 'id="repeat"'].map(at);
  assert(sh > 0 && pv > 0 && pl > 0 && nx > 0 && rp > 0, "a transport key went missing");
  assert(sh < pv && pv < pl && pl < nx && nx < rp, "control order must be shuffle · prev · play · next · repeat");
});

Deno.test("Transport cannot leave its container — the cap is the widget's, not the caller's", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const root = /<div data-transport class=\$\{`([^`]*)`/.exec(ui)?.[1] ?? "";
  assert(root.includes("@container"), "the transport must query its OWN width — a viewport query reads the window, and .ms-side / the watch rail both narrow the box while the window stays wide");
  assert(root.includes("max-w-full"), `the transport must be capped by whatever holds it (its classes: ${root}) — its keys are shrink-0 and its row is justify-center, so an uncapped box spills out of BOTH sides of its island instead of demoting into the overflow sheet`);
  assert(root.includes("min-w-0"), "…and it must be allowed to shrink inside a flex row, or the cap never binds");
});

Deno.test("Transport form — the shapes load only on demand, the filament keeps the native range, both forms are organic", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  assert(!/^import[^\n]*shape\.js/m.test(ui), "ui.js is on every page — shape.js (50 KB of geometry) must be a dynamic import");
  assert(/import\("\.\/shape\.js"\)/.test(tp), "the form transport must load the geometry itself");
  const at = tp.indexOf("data-tp-filament"), fil = tp.slice(at, tp.indexOf("</div>", at));
  for (const k of ['type="range"', "aria-label=", "data-tp-seek", "onChange=", "onInput="]) assert(fil.includes(k), `the filament lost ${k} — the native range is the control`);
  const { ORGANIC } = await import("../shape.js");
  const [, off, on] = /FORM_OFF = "(\w+)", FORM_ON = "(\w+)"/.exec(ui) ?? [];
  assert(ORGANIC.includes(off) && ORGANIC.includes(on) && off !== on, `the play button's forms (${off}, ${on}) must be two different organic shapes`);
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  for (const c of [".tp-form", ".tp-filament", ".tp-fl-lit", ".tp-fl-node"]) assert(css.includes(c), `runtime.css lost ${c}`);
});
