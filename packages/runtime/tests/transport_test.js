// microspec runtime — transport (UI kit) unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("Transport compacts on its CONTAINER, never on the viewport", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  assert(/@container/.test(tp), "the transport must establish a container — it is sized by the space IT has");
  assert(/@max-\[\d+px\]:/.test(tp), "no container-query compaction: the row will overflow where it is narrow");
  // The trap this test exists for: the watch gate narrows #view to 200px while the WINDOW stays 384px, and
  // .ms-side puts the transport in a narrow column on a wide phone. A viewport media query is blind to both.
  assert(!/\bmin-\[\d+px\]:|\bmax-\[\d+px\]:/.test(tp.replace(/@(max|min)-\[\d+px\]:/g, "")),
    "viewport width variants in the transport — use @container variants instead");
});

Deno.test("Transport compacts by DEMOTION — a hidden action is still reachable, with its word", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const tp = ui.slice(ui.indexOf("export function Transport("));
  // The failure this guards: an action row that simply hides what does not fit. A control the narrow window
  // cannot show must still be REACHABLE — the overflow sheet lists `actions` (all of them), never `overflow`.
  const sheet = tp.slice(tp.indexOf("data-tp-sheet"));
  // The sheet now carries the transport KEYS as well as the actions — at the narrowest the row keeps only
  // PLAY, so prev/next/shuffle/repeat have to be reachable there too. Assert it spreads the full action
  // list rather than a slice, and that the keys are in it.
  assert(/\.\.\.actions,/.test(sheet), "the sheet must spread every action, not a demoted subset");
  for (const k of ["aPrev", "aNext", "aShuffle", "aRepeat"])
    assert(sheet.includes(k), `the sheet does not carry ${k} — a key hidden at 230px would be unreachable`);
  assert(!/overflow\.map\(/.test(sheet), "the sheet lists a different set depending on width — unlearnable");
  // …and the demoted icons are hidden by the CONTAINER, so `keep` is a floor on what stays inline, not a cap.
  assert(/overflow\.map\(.{0,60}@max-\[\d+px\]:hidden/.test(tp.replace(/\n\s*/g, " ")),
    "demoted actions must be hidden by a container query, not dropped from the tree");
  // The sheet row must not restate the inline button's id/hook: two matches for one selector, one duplicate id.
  const row = sheet.slice(0, sheet.indexOf("</button>"));
  assert(!/\bid=\$\{a\.id/.test(row) && !/\.\.\.\$\{a\.attr/.test(row), "sheet row duplicates the inline hooks");
});

Deno.test("no app passes the Transport a prop it does not accept (a silent prop is a lost button)", async () => {
  // How rave lost its generate button: the widget's single `extra` slot became the `actions` array, rave's
  // pads tab was migrated and its BEAT tab was not — so it kept passing `extra=`, JSX-style props being
  // silently ignored when unknown. Every gate stayed green and the control simply stopped existing. Nothing
  // but the eye caught it, on a screenshot, two commits later. This makes it mechanical.
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const sig = ui.slice(ui.indexOf("export function Transport("), ui.indexOf("}) {", ui.indexOf("export function Transport(")));
  // the destructured names, read off the signature with comments and default values removed first
  const bare = sig.replace(/\/\/[^\n]*/g, "").replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "0");
  const accepted = new Set([...bare.matchAll(/(?:^|[,{])\s*([a-zA-Z][a-zA-Z0-9]*)\s*(?=[,=}]|$)/gm)].map((m) => m[1]));
  accepted.add("children"); accepted.add("key");
  assert(accepted.has("actions") && accepted.has("onToggle"), "could not read the Transport signature");

  const appsDir = new URL(`file://${Deno.cwd()}/apps/`); // the CONSUMER's apps, never the package's
  const offenders = [];
  for await (const e of Deno.readDir(appsDir)) {
    if (!e.isDirectory) continue;
    let src = "";
    try { src = await Deno.readTextFile(new URL(`${e.name}/view.js`, appsDir)); } catch { continue; }
    // Each `<${Transport} … />` call site. A prop may itself hold markup (drift's subtitle is an html`…`
    // containing another html`…`), so depth is tracked properly rather than by backtick parity: an opening
    // backtick is the one that follows `html`, any other closes. Only props at depth 0 are the Transport's.
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
  // Opt-in by handler is the whole reason one component serves a one-button ambient player and a full queue
  // player: pass the handler and the control appears. A control rendered unconditionally would force every
  // app to own a dead button.
  for (const [h, id] of [["onShuffle", "shuffle"], ["onRepeat", "repeat"], ["onPrev", "prev"], ["onNext", "next"]])
    assert(new RegExp(`\\$\\{\\s*${h}\\s*\\?`).test(tp) || new RegExp(`${h}\\s*\\?`).test(tp),
      `${id} is not gated on ${h} — an app that never passes it still gets the button`);
  // Canonical order — the one every phone player has taught the thumb. Source order IS render order here.
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
