// microspec — the registry docs' diagrams, GENERATED (docs/research/jsr-docs.md). jsr.io strips every
// animated or styled SVG out of a module doc, but renders an external SVG through <img> with its SMIL/CSS
// animation intact — so the diagrams are files, in the icons' material (black ground, amber + cyan
// filaments, bloom, mono labels), and they are DATA: the pipeline pages draw the real 8n8 registry, the
// verify page draws the real breakpoint table. A drawing cannot go stale against the code it explains.
//   deno run -A tools/art/docart.mjs            # (re)write docs/art/*.svg
//   deno run -A tools/art/docart.mjs --check    # the 8n8 node: fail if any is stale
//   deno run -A tools/art/docart.mjs --png      # also rasterise a static preview per file (scratch) — the eye
// Runs only in the core's tree (like dts); a consumer has no registry docs.
const check = Deno.args.includes("--check");
const wantPng = Deno.args.includes("--png");
const manifest = JSON.parse(await Deno.readTextFile("deno.json"));
if (manifest.name !== "@microspec/core") {
  if (check) console.log("  ✓ not the core — no doc art to generate");
  Deno.exit(0);
}
// Imported only past the guard: browser-lib pulls the Chromium driver, which a consumer's npm-realm copy
// of this file cannot resolve — and a consumer never draws the core's docs anyway.
const { NODES } = await import("../8n8/nodes.mjs");
const { BREAKPOINTS } = await import("../../packages/gates/browser-lib.mjs");
const OUT = "docs/art";

// ── the material ─────────────────────────────────────────────────────────────────────────────────────
const C = { amber: "#F2B84B", cyan: "#5CE4DC", ink: "#F2EEE6", muted: "#A39E94", rim: "rgba(255,232,196,.14)", edge: "rgba(255,238,208,.22)" };
const FONT = `'Geist Mono', ui-monospace, 'Liberation Mono', Menlo, monospace`;

// Seeded, so a file is byte-stable between runs and the check can diff it (mulberry32 on the diagram id).
const seeded = (id) => {
  let h = 1779033703 ^ id.length;
  for (let i = 0; i < id.length; i++) { h = Math.imul(h ^ id.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const head = (id, w, h, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t">
<title id="t">${esc(title)}</title>
<style>
  text { font-family: ${FONT}; fill: ${C.ink}; }
  .m { fill: ${C.muted}; font-size: 11px; letter-spacing: .08em; }
  .l { font-size: 11.5px; }
  .h { font-size: 12px; fill: ${C.cyan}; letter-spacing: .06em; }
  .flow { stroke-dasharray: 5 11; animation: flow 3s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -32; } }
  .breathe { animation: breathe 4.2s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: .38; } }
  .beat { animation: beat 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes beat { 50% { opacity: .55; transform: scale(1.35); } }
  .spin { transform-box: fill-box; transform-origin: center; animation: spin 48s linear infinite; }
  .spin-r { transform-box: fill-box; transform-origin: center; animation: spin 64s linear infinite reverse; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <filter id="bloom" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4.5"/></filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <radialGradient id="key" cx="50%" cy="-10%" r="80%"><stop offset="0" stop-color="${C.amber}" stop-opacity=".09"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
  <linearGradient id="pair" x1="0" x2="1"><stop offset="0" stop-color="${C.amber}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" rx="22" fill="#000"/>
<rect width="${w}" height="${h}" rx="22" fill="url(#key)"/>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="21.5" fill="none" stroke="${C.rim}"/>
<path d="M 24 1 H ${w - 24}" stroke="${C.edge}" stroke-width="1"/>
`;
const tail = `</svg>\n`;

// The support plane is scattered light, not a floor (the icons' rule 5).
const fireflies = (id, w, h, n = 34) => {
  const rnd = seeded(id);
  let s = `<g>`;
  for (let i = 0; i < n; i++) {
    const cyan = rnd() < 0.18, r = r2(0.7 + rnd() * 1.1);
    s += `<circle cx="${r2(rnd() * w)}" cy="${r2(rnd() * h)}" r="${r}" fill="${cyan ? C.cyan : C.amber}" opacity="${r2(0.25 + rnd() * 0.5)}" class="breathe" style="animation-delay:-${r2(rnd() * 4.2)}s"/>`;
  }
  return s + `</g>\n`;
};
// A lit point: a blurred copy under a crisp one — volume by bloom, never by shadow.
const node = (x, y, { lit = false, agent = false, delay = 0 } = {}) => {
  const col = lit ? C.cyan : C.amber, r = lit ? 5 : 3.2;
  const core = agent && !lit ? `<circle cx="${x}" cy="${y}" r="3.8" fill="none" stroke="${col}" stroke-width="1.3"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
  return `<g><circle cx="${x}" cy="${y}" r="${lit ? 15 : 9}" fill="${col}" opacity="${lit ? .85 : .5}" filter="url(#bloom)" class="${lit ? "beat" : "breathe"}" style="animation-delay:-${delay}s"/>${core}</g>`;
};
// A filament between two points — a thin lit stroke with a flowing dash on top.
const filament = (x1, y1, x2, y2, { lit = false, w = 1.1, bend = 0.5 } = {}) => {
  const dx = (x2 - x1) * bend;
  const d = `M ${x1} ${y1} C ${r2(x1 + dx)} ${y1}, ${r2(x2 - dx)} ${y2}, ${x2} ${y2}`;
  const col = lit ? C.cyan : C.amber, base = lit ? .55 : .22, flow = lit ? .95 : .55;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${base}" stroke-width="${w}"/><path d="${d}" fill="none" stroke="${col}" stroke-opacity="${flow}" stroke-width="${w}" class="flow"/>`;
};
const text = (x, y, s, cls = "l", extra = "") => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${esc(s)}</text>`;
const label = (x, y, s, { lit = false, anchor = "middle" } = {}) => `<text x="${x}" y="${y}" class="l" text-anchor="${anchor}" fill="${lit ? C.cyan : C.ink}" ${lit ? 'font-weight="700"' : 'fill-opacity=".82"'}>${esc(s)}</text>`;
const micro = (x, y, s, anchor = "start") => `<text x="${x}" y="${y}" class="m" text-anchor="${anchor}">${esc(s.toUpperCase())}</text>`;

// ── pipeline-<node>: the 8n8 registry, this page's node lit ───────────────────────────────────────────
const LANES = [
  { phase: "author", title: "author · the generative half", x0: 60, cols: [110, 215], y0: 96, dy: 68 },
  { phase: "gate", title: "gate · every node names its failure", x0: 320, cols: [350, 445, 540, 635], y0: 96, dy: 68 },
  { phase: "ship", title: "ship", x0: 740, cols: [790, 885], y0: 96, dy: 68 },
];
const positions = () => {
  const pos = new Map();
  for (const lane of LANES) {
    const ns = NODES.filter((n) => n.phase === lane.phase);
    ns.forEach((n, i) => pos.set(n.id, { x: lane.cols[i % lane.cols.length], y: lane.y0 + Math.floor(i / lane.cols.length) * lane.dy, n }));
  }
  return pos;
};
const pipeline = (id) => {
  const w = 960, h = 420, pos = positions(), me = NODES.find((n) => n.id === id);
  const rnd = seeded("pipeline-" + id);
  let s = head("pipeline-" + id, w, h, `8n8 pipeline — ${id} (${me.phase}, ${me.kind})`);
  s += fireflies("pipeline-" + id, w, h, 26);
  s += micro(40, 42, "8n8 · the farm's pipeline registry");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">${esc(`${id} · ${me.phase} · ${me.kind}`)}</text>`;
  for (const lane of LANES) s += micro(lane.x0, 70, lane.title);
  // edges first, under the points; the lit node's edges in cyan
  for (const n of NODES) for (const dep of n.needs) {
    const a = pos.get(dep), b = pos.get(n.id);
    if (!a || !b) continue;
    s += filament(a.x, a.y, b.x, b.y, { lit: n.id === id || dep === id, w: n.id === id || dep === id ? 1.4 : 1 });
  }
  for (const [nid, p] of pos) {
    s += node(p.x, p.y, { lit: nid === id, agent: p.n.kind === "agent", delay: r2(rnd() * 4) });
    s += label(p.x, p.y + 18, nid, { lit: nid === id });
  }
  s += micro(40, h - 24, "● script node  ·  ○ agent node  ·  filament = needs  ·  the lit node is this page");
  return s + tail;
};

// ── hero: the portal, on the index ────────────────────────────────────────────────────────────────────
const hero = () => {
  const w = 960, h = 360, cx = 210, cy = 180, rnd = seeded("hero");
  const runtime = Object.keys(manifest.exports).filter((k) => k.startsWith("./runtime/")).length;
  const tools = Object.keys(manifest.exports).filter((k) => !k.startsWith("./runtime/") && k !== ".").length;
  let s = head("hero", w, h, "@microspec/core — the appless core of DreamStudio");
  s += fireflies("hero", w, h, 44);
  // the ring: woven from arcs, two directions, amber and cyan
  for (let i = 0; i < 6; i++) {
    const r = 72 + i * 12, col = i % 3 === 2 ? C.cyan : C.amber, cls = i % 2 ? "spin-r" : "spin";
    const dash = `${r2(6 + rnd() * 40)} ${r2(8 + rnd() * 26)}`;
    s += `<g class="${cls}" style="animation-duration:${r2(36 + rnd() * 40)}s"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-opacity=".7" stroke-width="${r2(0.8 + rnd() * 0.8)}" stroke-dasharray="${dash}" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="${dash}" filter="url(#soft)"/></g>`;
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 72 + Math.floor(rnd() * 6) * 12;
    s += node(r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r), { lit: rnd() < 0.3, delay: r2(rnd() * 4) });
  }
  s += `<circle cx="${cx}" cy="${cy}" r="30" fill="${C.amber}" opacity=".14" filter="url(#bloom)" class="breathe"/>`;
  s += `<text x="420" y="150" font-size="30" font-weight="700" letter-spacing="-.01em">@microspec/core</text>`;
  s += `<path d="M 420 168 H 760" stroke="url(#pair)" stroke-width="1.2" stroke-opacity=".9"/>`;
  s += `<text x="420" y="196" class="m" font-size="12">${esc("THE APPLESS CORE OF DREAMSTUDIO")}</text>`;
  const rows = [`runtime · ${runtime} systemic modules, zero-build, served as /_rt`, "schema · the spec contract, machine-checked (ajv)", "gates · Deno first, then a real Chromium + axe", `gen + tools · ${tools} entrypoints, one pipeline registry (8n8)`];
  rows.forEach((t, i) => { s += node(428, 226 + i * 26, { lit: i === 0, delay: i }); s += label(446, 230 + i * 26, t, { anchor: "start" }); });
  return s + tail;
};

// ── realms: where code runs, and the laws that cost a red round each ─────────────────────────────────
const realms = () => {
  const w = 960, h = 300;
  let s = head("realms", w, h, "The three realms a microspec tree runs in");
  s += fireflies("realms", w, h, 20);
  const panels = [
    { x: 40, title: "file realm", sub: "a checkout · node_modules", lines: ["/_rt/*.js served from FILES", "the build copies from here", "code under node_modules = npm realm:", "jsr: / https imports refused"] },
    { x: 350, title: "registry realm", sub: "jsr:@microspec/core@<v>", lines: ["tools and gates EXECUTE here", "a remote importer has no import map", "and cannot import file://", "→ .microspec/ shims plant a local one"] },
    { x: 660, title: "browser", sub: "the page's import map", lines: ["bare deps → one preact, one pin set", "@microspec/core/ → jsr (https)", "rt/ overlay → ./rt/<name>.js", "rtmap keeps the map honest"] },
  ];
  for (const p of panels) {
    s += `<rect x="${p.x}" y="70" width="260" height="190" rx="16" fill="none" stroke="${C.rim}"/><path d="M ${p.x + 16} 70.5 H ${p.x + 244}" stroke="${C.edge}"/>`;
    s += `<text x="${p.x + 20}" y="98" class="h" font-size="13">${esc(p.title.toUpperCase())}</text>`;
    s += `<text x="${p.x + 20}" y="116" class="m">${esc(p.sub)}</text>`;
    p.lines.forEach((t, i) => { s += label(p.x + 20, 146 + i * 22, t, { anchor: "start" }); });
  }
  // the links run BELOW the text rows (146 + 3·22 ≈ 216), never across them
  s += filament(300, 240, 350, 240, { lit: true, w: 1.4, bend: 0.4 }) + filament(610, 240, 660, 240, { lit: true, w: 1.4, bend: 0.4 });
  s += node(300, 240, { lit: true }) + node(350, 240) + node(610, 240, { lit: true }) + node(660, 240);
  s += micro(40, 42, "realm laws · docs/research/package-distribution.md");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">rtmap · realmlint · preflight</text>`;
  return s + tail;
};

// ── build: from apps + /_rt to the live URL ───────────────────────────────────────────────────────────
const build = () => {
  const w = 960, h = 250;
  let s = head("build", w, h, "The build: apps and the runtime become a static site, judged in a real browser before it ships");
  s += fireflies("build", w, h, 18);
  const st = [
    ["apps/<id>", "spec · view · i18n"], ["/_rt", "the runtime files"], ["build", "bundle · tailwind scan · sw precache"],
    ["dist/", "one static tree"], ["dist-eye", "real Chromium, every app"], ["rsync", "sudo rsync over ssh"], ["live", "dreamstudio.mooo.com"],
  ];
  const xs = st.map((_, i) => 80 + i * 133), y = 130;
  for (let i = 1; i < st.length; i++) s += filament(xs[i - 1], y, xs[i], y, { lit: i === 3 || i === 5, w: 1.3, bend: 0.3 });
  st.forEach(([t, sub], i) => {
    s += node(xs[i], y, { lit: i === 2 || i === 4, delay: i * 0.6 });
    s += label(xs[i], i % 2 ? y - 22 : y + 30, t, { lit: i === 2 || i === 4 });
    s += `<text x="${xs[i]}" y="${i % 2 ? y - 40 : y + 46}" class="m" text-anchor="middle" font-size="10">${esc(sub)}</text>`;
  });
  s += micro(40, 42, "deploy.yml · workflow_run on a green verify");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">a red main never deploys</text>`;
  return s + tail;
};

// ── see: the working tree, served for the eye BEFORE the push ─────────────────────────────────────────
const see = () => {
  const w = 960, h = 250;
  let s = head("see", w, h, "see: the working tree is served and shot before anything is pushed");
  s += fireflies("see", w, h, 18);
  const st = [
    ["the tree", "edits, gates green"], ["rsync", "over the existing ssh"], ["see", "the gate handler on :8790"],
    ["/_rt overlay", "rt/ first, then the runtime"], ["shot.mjs", "the eye's Chromium"], ["PNG", "back on the phone"], ["push", "only when it is right"],
  ];
  const xs = st.map((_, i) => 80 + i * 133), y = 130;
  for (let i = 1; i < st.length; i++) s += filament(xs[i - 1], y, xs[i], y, { lit: i === 2 || i === 4, w: 1.3, bend: 0.3 });
  st.forEach(([t, sub], i) => {
    s += node(xs[i], y, { lit: i === 2 || i === 4, delay: i * 0.6 });
    s += label(xs[i], i % 2 ? y - 22 : y + 30, t, { lit: i === 2 || i === 4 });
    s += `<text x="${xs[i]}" y="${i % 2 ? y - 40 : y + 46}" class="m" text-anchor="middle" font-size="10">${esc(sub)}</text>`;
  });
  s += micro(40, 42, "vps/see.sh <app> [--w --h --light --tap] · no commit, no branch, no deploy");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">seen before it is pushed</text>`;
  return s + tail;
};

// ── verify: the breakpoint matrix, to scale ───────────────────────────────────────────────────────────
const verify = () => {
  const w = 960, h = 360, k = 0.1;
  let s = head("verify", w, h, "verify: every app at every shape, in a real Chromium");
  s += fireflies("verify", w, h, 18);
  let x = 46;
  const base = 206;
  // labels are wider than the narrow shapes, so they step: even shapes label on the first row, odd on a
  // second one — nothing overlaps, and the eye still reads each pair under its rectangle
  BREAKPOINTS.forEach((bp, i) => {
    const bw = r2(bp.w * k), bh = r2(bp.h * k), lit = bp.id === "phone", ly = base + (i % 2 ? 44 : 16);
    s += `<rect x="${x}" y="${r2(base - bh)}" width="${bw}" height="${bh}" rx="3" fill="${lit ? C.cyan : C.amber}" fill-opacity="${lit ? .16 : .07}" stroke="${lit ? C.cyan : C.amber}" stroke-opacity="${lit ? .9 : .5}" stroke-width="1"/>`;
    s += `<rect x="${x}" y="${r2(base - bh)}" width="${bw}" height="2" fill="${lit ? C.cyan : C.amber}" opacity=".6"/>`;
    if (i % 2) s += `<path d="M ${r2(x + bw / 2)} ${base + 4} V ${ly - 22}" stroke="${C.rim}"/>`;
    s += `<text x="${r2(x + bw / 2)}" y="${ly}" class="l" text-anchor="middle" fill="${lit ? C.cyan : C.ink}" fill-opacity=".9" font-size="10.5">${esc(bp.id)}</text>`;
    s += `<text x="${r2(x + bw / 2)}" y="${ly + 13}" class="m" text-anchor="middle" font-size="9.5">${esc(`${bp.w}×${bp.h}`)}</text>`;
    x += bw + 14;
  });
  const checks = ["a11y · axe, both themes", "overflow · zero, every shape", "chrome decor · no sideways shift", "haptic", "PWA · installable + offline", "e2e · the app's own", "i18n · en + uk parity"];
  let cx = 46, cy = 288;
  for (const c of checks) {
    const cw = r2(c.length * 6.6 + 24);
    if (cx + cw > w - 40) { cx = 46; cy += 32; }
    s += `<rect x="${cx}" y="${cy - 12}" width="${cw}" height="24" rx="12" fill="none" stroke="${C.rim}"/><circle cx="${cx + 12}" cy="${cy}" r="2.6" fill="${C.amber}" class="breathe"/>`;
    s += `<text x="${cx + 21}" y="${cy + 4}" class="l" font-size="10.5" fill-opacity=".85">${esc(c)}</text>`;
    cx += cw + 10;
  }
  s += micro(40, 42, "BREAKPOINTS · packages/gates/browser-lib.mjs · drawn to scale");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">per tab · per app · affected matrix</text>`;
  return s + tail;
};

// ── module-<name>: a runtime module's place in the graph — what it imports, what it exports, who imports it
// Read from the sources, so the map is the import graph as it is, not as a doc remembers it.
const RT = "packages/runtime";
const runtimeNames = [...Deno.readDirSync(RT)].filter((e) => e.isFile && e.name.endsWith(".js") && !e.name.endsWith("_test.js")).map((e) => e.name.slice(0, -3)).sort();
// Comments stripped before scanning: the module docs quote import lines and export names in prose and
// code samples, and a map drawn from those would show the doc, not the module.
const uncommented = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const rtSrc = Object.fromEntries(runtimeNames.map((n) => [n, uncommented(Deno.readTextFileSync(`${RT}/${n}.js`))]));
const importsOf = (n) => [...new Set([...rtSrc[n].matchAll(/from\s+"\.\/([\w-]+)\.js"/g)].map((m) => m[1]).filter((d) => d !== n && rtSrc[d]))].sort();
const exportsOf = (n) => {
  const src = rtSrc[n];
  const named = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const braces = [...src.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  const stars = [...src.matchAll(/^export\s*\*\s*as\s+([\w$]+)/gm)].map((m) => m[1]);
  return [...new Set([...named, ...braces, ...stars])];
};
const dependantsOf = (n) => runtimeNames.filter((m) => m !== n && importsOf(m).includes(n));
const moduleMap = (name) => {
  const deps = importsOf(name), users = dependantsOf(name), exps = exportsOf(name);
  const CAP = 9, EXP_CAP = 14, step = 26;
  const col = (list) => list.length > CAP ? [...list.slice(0, CAP - 1), `+${list.length - CAP + 1} more`] : list;
  const L = col(deps), R = col(users);
  const E = exps.length > EXP_CAP ? [...exps.slice(0, EXP_CAP - 1), `+${exps.length - EXP_CAP + 1} more`] : exps;
  const rows = Math.max(L.length, R.length, Math.ceil(E.length / 2), 3);
  const w = 960, h = 120 + rows * step + 40, y0 = 112, cy = y0 + ((rows - 1) * step) / 2;
  const rnd = seeded("module-" + name);
  let s = head("module-" + name, w, h, `runtime/${name}.js — imports, exports, dependants`);
  s += fireflies("module-" + name, w, h, 22);
  s += micro(40, 42, "runtime module map · drawn from the import graph");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">${esc(`runtime/${name}.js`)}</text>`;
  s += micro(40, 78, `imports · ${deps.length} runtime modules`) + micro(430, 78, `exports · ${exps.length}`) + micro(w - 40, 78, `imported by · ${users.length} runtime modules`, "end");
  const cx = 300;
  L.forEach((d, i) => {
    const y = y0 + i * step, more = d.startsWith("+");
    if (!more) s += filament(150, y, cx, cy, { w: 1, bend: 0.55 });
    s += node(150, y, { delay: r2(rnd() * 4) });
    s += label(136, y + 4, d, { anchor: "end" });
  });
  R.forEach((d, i) => {
    const y = y0 + i * step, more = d.startsWith("+");
    if (!more) s += filament(cx, cy, 810, y, { w: 1, bend: 0.55 });
    s += node(810, y, { delay: r2(rnd() * 4) });
    s += label(824, y + 4, d, { anchor: "start" });
  });
  // the module itself, lit, with its export rail hanging off it
  s += `<circle cx="${cx}" cy="${cy}" r="26" fill="${C.cyan}" opacity=".35" filter="url(#bloom)" class="beat"/>`;
  s += node(cx, cy, { lit: true });
  s += `<text x="${cx}" y="${cy + 30}" class="l" text-anchor="middle" fill="${C.cyan}" font-weight="700" font-size="13">${esc(name)}</text>`;
  s += filament(cx, cy, 430, y0, { lit: true, w: 1.2, bend: 0.5 });
  E.forEach((e, i) => {
    const x = 450 + (i % 2) * 165, y = y0 + Math.floor(i / 2) * step;
    s += node(x, y, { lit: false, delay: r2(rnd() * 4) });
    s += label(x + 12, y + 4, e, { anchor: "start" });
  });
  if (!E.length) s += label(450, y0 + 4, "no exports — a script", { anchor: "start" });
  return s + tail;
};

// ── theme-split: structure in the core, the brand in the product, one <link> on the page ──────────────
const themeSplit = () => {
  const w = 960, h = 300;
  let s = head("theme-split", w, h, "The theme split: runtime.css (structure, neutral) → a product's rt/theme.css (the brand) → the page's one link");
  s += fireflies("theme-split", w, h, 18);
  const box = (x, y, bw, bh, title, sub, lines, lit) => {
    let o = `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="16" fill="${lit ? C.cyan : C.amber}" fill-opacity="${lit ? .06 : .03}" stroke="${lit ? C.cyan : C.rim}" stroke-opacity="${lit ? .8 : 1}"/><path d="M ${x + 16} ${y + .5} H ${x + bw - 16}" stroke="${C.edge}"/>`;
    o += `<text x="${x + 18}" y="${y + 28}" class="h" font-size="13" fill="${lit ? C.cyan : C.amber}">${esc(title.toUpperCase())}</text>`;
    o += `<text x="${x + 18}" y="${y + 46}" class="m">${esc(sub)}</text>`;
    lines.forEach((t, i) => { o += label(x + 18, y + 74 + i * 20, t, { anchor: "start" }); });
    return o;
  };
  s += box(40, 70, 270, 190, "the core · runtime.css", "structure + a neutral default", ["--ms-* ladder, chrome contract", "fit · split · watch rules", "sf-* surface SYSTEM (what a class means)", "hooks: lip, garland, empty, theme-art", "every token has a plain value"], false);
  s += box(345, 70, 270, 190, "the product · rt/theme.css", "@import \"./runtime.css\" + the brand", ["the pair of light, two palettes", "material token VALUES (rim · bloom)", "sprites in rt/ds-*.webp", "portal chrome geometry, enclosure", "tests in rt/tests/theme_test.js"], true);
  s += box(650, 70, 270, 190, "the page", "<link href=\"/_rt/theme.css\">", ["no brand → the core's theme.css", "  (one line: @import runtime.css)", "a brand → the overlay REPLACES it", "  by name: gate server + build alike", "sw precache follows the @import"], false);
  // the links run BELOW the text rows (74 + 4·20 ≈ 154 from the box top → y 224), never across them
  s += filament(310, 246, 345, 246, { lit: true, w: 1.4, bend: 0.4 }) + filament(615, 246, 650, 246, { lit: true, w: 1.4, bend: 0.4 });
  s += node(310, 246, { lit: true }) + node(345, 246) + node(615, 246, { lit: true }) + node(650, 246);
  s += micro(40, 42, "theme split · docs/research/theme-split.md");
  s += `<text x="${w - 40}" y="42" class="h" text-anchor="end">a brand change is a product commit, not a core release</text>`;
  return s + tail;
};

// ── emit ─────────────────────────────────────────────────────────────────────────────────────────────
const files = { "hero.svg": hero(), "realms.svg": realms(), "build.svg": build(), "see.svg": see(), "verify.svg": verify(), "theme-split.svg": themeSplit() };
for (const n of NODES) if (n.kind === "script") files[`pipeline-${n.id}.svg`] = pipeline(n.id);
for (const k of Object.keys(manifest.exports)) if (k.startsWith("./runtime/")) files[`module-${k.slice(10, -3)}.svg`] = moduleMap(k.slice(10, -3));

await Deno.mkdir(OUT, { recursive: true });
let stale = 0, written = 0;
for (const [name, svg] of Object.entries(files)) {
  const path = `${OUT}/${name}`;
  let current = null;
  try { current = await Deno.readTextFile(path); } catch { /* missing */ }
  if (current === svg) continue;
  if (check) { console.error(`  ✗ ${path} is ${current == null ? "missing" : "stale"} — run \`deno task docart\``); stale++; continue; }
  await Deno.writeTextFile(path, svg);
  written++;
}
if (check) {
  if (stale) Deno.exit(1);
  console.log(`  ✓ ${Object.keys(files).length} doc diagrams current`);
} else {
  console.log(`docart: ${Object.keys(files).length} diagrams, ${written} written`);
}

// The eye: a static frame per diagram, rasterised through resvg with the box's mono font, into the
// session scratchpad — composition is judged here, motion on jsr.io itself.
if (wantPng) {
  const { initWasm, Resvg } = await import("npm:@resvg/resvg-wasm@2.6.2");
  await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  const dir = Deno.env.get("DOCART_PNG_DIR") ?? "/tmp/docart";
  await Deno.mkdir(dir, { recursive: true });
  const fonts = [];
  for (const f of ["/usr/share/fonts/liberation/LiberationMono-Regular.ttf", "/usr/share/fonts/liberation/LiberationMono-Bold.ttf"]) {
    try { fonts.push(await Deno.readFile(f)); } catch { /* not on this box */ }
  }
  const only = Deno.args.find((a) => a.startsWith("--only="))?.slice(7);
  for (const [name, svg] of Object.entries(files)) {
    if (only && !name.includes(only)) continue;
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1440 }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: "Liberation Mono", monospaceFamily: "Liberation Mono" } }).render().asPng();
    await Deno.writeFile(`${dir}/${name.replace(/\.svg$/, ".png")}`, png);
  }
  console.log(`docart: previews in ${dir}`);
}
