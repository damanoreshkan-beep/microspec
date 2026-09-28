import { assert, assertEquals } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
const P = (rel) => new URL(rel, pkgRoot(import.meta.url, 3));

Deno.test("design tokens: theme.css defines the whole --ms-* contract the UI kit consumes", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const declared = new Set([...css.matchAll(/(--(?:ms|app|dock|hdr)-[a-z-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...ui.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]));
  for (const v of used) assert(declared.has(v), `ui.js reads ${v} but theme.css never declares it`);
  for (const v of ["--ms-gap", "--ms-pad", "--ms-r", "--ms-ctl", "--ms-icon", "--ms-title", "--ms-label", "--ms-hero", "--app-accent", "--app-tint"]) {
    assert(declared.has(v), `theme.css lost the ${v} token — every component sizes off these`);
  }
});

Deno.test("design tokens: --ms-hero STEPS with the height ladder", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const vals = [...css.matchAll(/--ms-hero:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
  assert(vals.length >= 4, `--ms-hero is declared ${vals.length} time(s); the height ladder has more steps`);
  const base = vals[0];
  assert(vals.some((v) => v < base * 0.7), `--ms-hero never drops below 70% of its ${base}rem base — it is not compacting`);
  assert(vals.every((v) => v >= 2.5), "a hero below 2.5rem is no longer the screen's one big reading");

  const render = await Deno.readTextFile(P("packages/runtime/render.js"));
  const heroLine = render.split("\n").find((l) => l.includes("--ms-hero"));
  assert(heroLine, "render.js no longer reads --ms-hero for the dashboard hero value");
});

Deno.test("design tokens: --ms-r-in is DERIVED from the pair it reconciles, and stays sane at every step", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));

  const decl = /--ms-r-in:\s*([^;]+);/.exec(css);
  assert(decl, "theme.css lost --ms-r-in — the concentric radius every nested surface reads");
  for (const dep of ["--ms-r", "--ms-pad", "--r-1"]) {
    assert(decl[1].includes(dep), `--ms-r-in must be derived from ${dep}, not written as a constant — a hand-written inner radius is right until the ladder moves and silently wrong after (got: ${decl[1].trim()})`);
  }
  assert(/--r-1:\s*4px/.test(css), "--ms-r-in floors on --r-1; theme.css must still declare it");

  const at = (idx) => {
    const before = css.slice(0, idx);
    const m = [...before.matchAll(/@media\s*\(([^{]*)\)\s*\{/g)].pop();
    if (!m) return "base";
    const between = before.slice(m.index + m[0].length);
    return (between.split("}").length - 1) > (between.split("{").length - 1) ? "base" : `@media (${m[1].trim()})`;
  };
  const steps = [...css.matchAll(/:root\s*\{([^}]*)\}/g)]
    .map((m) => ({ at: at(m.index), body: m[1] }))
    .filter((b) => /--ms-(?:r|pad):/.test(b.body));
  assert(steps.length >= 6, `expected the base :root plus the density steps, found ${steps.length}`);
  assert(steps.some((s) => /max-width/.test(s.at)), "the narrow-width step must be in the walk — it carries the tightest --ms-r/--ms-pad pair in the ladder");

  const rem = (v) => Number(v) * 16;
  let r = null, pad = null, checked = [];
  for (const b of steps) {
    const nr = /--ms-r:\s*([\d.]+)rem/.exec(b.body);
    const np = /--ms-pad:\s*([\d.]+)rem/.exec(b.body);
    if (nr) r = rem(nr[1]);
    if (np) pad = rem(np[1]);
    if (r == null || pad == null) continue;
    const inner = Math.max(4, r - pad);
    assert(r > pad, `${b.at}: --ms-pad (${pad}px) has caught up with --ms-r (${r}px), so every nested surface's concentric radius clamps to the 4px floor at once. Compact the two together.`);
    assert(inner < r, `${b.at}: derived inner radius ${inner}px is not smaller than the outer ${r}px (pad ${pad}px)`);
    checked.push(`${b.at} r=${r} pad=${pad} in=${inner}`);
  }
  assert(checked.length >= 6, `only ${checked.length} steps carried both --ms-r and --ms-pad; the ladder has more. Walked: ${checked.join(" | ")}`);

  const screen = /\.ms-screen\s*\{[^}]*border-radius:\s*([^;]+);/.exec(css);
  assert(screen, "theme.css lost .ms-screen's border-radius");
  assert(
    /--sh-r-in|--ms-r-in/.test(screen[1]),
    `.ms-screen must take the concentric radius (--sh-r-in), not restate a radius beside its shell — got "${screen[1].trim()}"`,
  );
  assert(/--sh-r-in:\s*[^;]*--sh-r[^;]*--ms-pad/.test(css), "--sh-r-in must be --sh-r minus --ms-pad — the shell's OWN outer radius, not --ms-r, since the shell scales its own by 1.2");
});

Deno.test("motion: no `transition-all` — a transition names the properties it animates", async () => {
  const root = pkgRoot(import.meta.url, 3);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        const src = await Deno.readTextFile(p);
        if (/(?:^|[\s"'`])transition-all\b/.test(src)) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  await walk(new URL("packages/", root));
  for (const d of ["apps/", "rt/"]) { try { await walk(new URL(`file://${Deno.cwd()}/${d}`)); } catch { } }
  assertEquals(
    offenders,
    [],
    `\`transition-all\` animates the material (sf-* are box-shadow pairs) and layout properties off the ` +
      `compositor. Name them: transition-colors / -opacity / -shadow / -transform, or transition-[width], ` +
      `transition-[box-shadow,background-color,scale]. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("icons: the farm draws from ONE set (lucide) — a second library is a visible seam", async () => {
  const root = pkgRoot(import.meta.url, 3);
  const FOREIGN = /["'](mdi|ph|tabler|carbon|ri|material-symbols|simple-icons|logos|bi|heroicons|solar|iconoir|fluent|octicon|codicon|fa6-[a-z]+|ic|majesticons|mingcute|hugeicons|akar-icons):[a-z0-9-]+["']/;
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|json|html)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        const m = FOREIGN.exec(await Deno.readTextFile(p));
        if (m) offenders.push(`${p.pathname.replace(root.pathname, "")} (${m[1]})`);
      }
    }
  };
  await walk(new URL("packages/", root));
  for (const d of ["apps/", "rt/"]) { try { await walk(new URL(`file://${Deno.cwd()}/${d}`)); } catch { } }
  assertEquals(
    offenders,
    [],
    `every glyph in the farm is \`lucide:*\`. If lucide genuinely lacks the shape, draw a runtime SVG (the ` +
      `/_rt/zodiac.js \`Sign\` precedent) so it is ours and matches the set. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("a11y: MUTED text (an alpha over a surface) clears 4.5:1 — the pair axe actually measures", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const tokens = (theme) => {
    const i = css.indexOf(`[data-theme="${theme}"] {`);
    const out = {};
    for (const m of css.slice(i, css.indexOf("}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
    return out;
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);

  for (const theme of ["signal", "signal-light"]) {
    const t = tokens(theme);
    const bed = {
      "base-100": rgb(t["--color-base-100"]),
      "base-200": rgb(t["--color-base-200"]),
      "base-300": rgb(t["--color-base-300"]),
    };
    bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
    bed["primary/10 on base-200"] = over(rgb(t["--color-primary"]), 0.10, bed["base-200"]);
    const ink = rgb(t["--color-base-content"]);
    const binding = [
      ["base-100", 0.60], ["base-200", 0.60], ["base-100", 0.70], ["base-200", 0.70],
      ["base-300", 0.70], ["base-300", 0.80], ["primary/10 on base-100", 0.70], ["primary/10 on base-200", 0.70],
    ];
    for (const [surface, alpha] of binding) {
      const r = ratio(over(ink, alpha, bed[surface]), bed[surface]);
      assert(
        r >= 4.5,
        `${theme}: base-content at ${alpha * 100}% over ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor — ` +
          `this is what axe reports as color-contrast on .text-base-content\\/${alpha * 100}, in EVERY app at once. ` +
          `Darkening a surface to make it "look like clay" is the move that spends this margin.`,
      );
    }

    const muted = rgb(t["--color-base-muted"]);
    for (const [surface, px] of Object.entries(bed)) {
      const r = ratio(muted, px);
      assert(
        r >= 4.5,
        `${theme}: --color-base-muted on ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor. ` +
          `This token is the farm's secondary text colour in 66 files — it is a DESIGNED colour precisely ` +
          `so its contrast is checked once here instead of being an accident of whatever it lands on.`,
      );
    }
  }
});

Deno.test("a11y: muted text is the TOKEN, never an alpha — .text-base-content/60 may not return", async () => {
  const root = pkgRoot(import.meta.url, 3);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name)) {
        const src = await Deno.readTextFile(p);
        if (src.includes("text-base-content/60")) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  await walk(new URL("packages/", root));
  for (const d of ["apps/", "rt/"]) { try { await walk(new URL(`file://${Deno.cwd()}/${d}`)); } catch { } }
  assertEquals(
    offenders,
    [],
    `muted text must use .text-muted (--color-base-muted), not a 60% alpha. At 60% the contrast is whatever ` +
      `the palette happens to composite to — it measured 3.72:1 after the clay repaint and failed axe in all ` +
      `58 apps at once. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("design tokens: density steps DOWN as the viewport gets shorter (landscape must compact)", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => ({ h: Number(m[1]), gap: /--ms-gap:\s*([\d.]+)rem/.exec(m[2])?.[1] }))
    .filter((s) => s.gap != null)
    .sort((a, b) => b.h - a.h);
  assert(steps.length >= 3, "the height scale needs at least three steps (tall phone → short phone → landscape)");
  const base = Number(/:root\s*\{[^}]*--ms-gap:\s*([\d.]+)rem/.exec(css)[1]);
  let prev = base;
  for (const s of steps) {
    assert(Number(s.gap) < prev, `@media (max-height:${s.h}px) must be TIGHTER than the step above it (${s.gap}rem vs ${prev}rem)`);
    prev = Number(s.gap);
  }
  for (const m of css.matchAll(/--ms-ctl:\s*([\d.]+)rem/g)) assert(Number(m[1]) * 16 >= 36, `--ms-ctl: ${m[1]}rem is below the 36px tap floor`);
});

Deno.test("design system: the fit contract disables page scroll on BOTH html and body", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const rule = /html\.ms-fit,\s*html\.ms-fit body\s*\{([^}]*)\}/.exec(css);
  assert(rule, "html.ms-fit + body rule is gone — a fit screen would scroll again");
  assert(/overflow:\s*hidden/.test(rule[1]), "a fit page must not scroll");
  const view = /html\.ms-fit main#view\s*\{([^}]*)\}/.exec(css);
  assert(view, "html.ms-fit main#view sizing rule is gone");
  assert(view[1].includes("var(--hdr-h)") && view[1].includes("var(--dock-h)"), "fit height must derive from --hdr-h/--dock-h, not a hardcoded rem");
});

Deno.test("design system: the UI kit imports relatively and owns its own chrome strings", async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const code = ui.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert(!/from\s+["']\/_rt\//.test(code), "runtime-internal imports must be relative (./gesture.js), never /_rt/");
  assert(/sys\(\s*["']close["']/.test(ui), "the Sheet's close button must read a SYS string, not demand an i18n key from every app");
  const i18n = await Deno.readTextFile(P("packages/runtime/i18n.js"));
  const sys = /export const SYS = \{([\s\S]*?)\n\};/.exec(i18n)[1];
  for (const k of ["close"]) {
    const line = new RegExp(`\\b${k}:\\s*\\{[^}]*\\ben:[^}]*\\buk:`).test(sys);
    assert(line, `SYS.${k} must carry BOTH locales — a systemic string with no uk ships English into a Ukrainian UI`);
  }
});

Deno.test("responsive matrix: the gate sweeps both orientations and the small-phone floor", async () => {
  const lib = await Deno.readTextFile(P("packages/gates/browser-lib.mjs"));
  const block = /export const BREAKPOINTS = \[([\s\S]*?)\n\];/.exec(lib);
  assert(block, "BREAKPOINTS is gone — verify would stop measuring anything but the reference device");
  const bps = [...block[1].matchAll(/w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({ w: +m[1], h: +m[2] }));
  assert(bps.some((b) => b.w <= 320), "no small-phone width in the matrix (320px is still the market floor)");
  assert(bps.some((b) => b.w > b.h), "no LANDSCAPE breakpoint — the short-viewport case is the one that breaks fit screens");
  assert(bps.some((b) => b.h >= 900), "no tall breakpoint");
  assert(bps.some((b) => b.w >= 1024), "no desktop/tablet-landscape breakpoint");
});

Deno.test("dock height is MEASURED, not a constant — nothing may sit under the dock", async () => {
  const render = await Deno.readTextFile(P("packages/runtime/render.js"));
  assert(/ResizeObserver/.test(render) && /setProperty\("--dock-h"/.test(render),
    "the runtime must measure the dock and publish --dock-h; a hand-written constant is wrong the moment the dock's metrics move (and it fails by COVERING content, which no overflow check can see)");
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  assertEquals([...css.matchAll(/--dock-h:/g)].length, 1, "--dock-h must be declared once (the :root fallback); the live value comes from the measurement");
  const lib = await Deno.readTextFile(P("packages/gates/browser-lib.mjs"));
  assert(/nav\[data-dock\]/.test(lib) && /pointerEvents/.test(lib),
    "the matrix must check dock/content collision (excluding pointer-events:none decoration) — overlap is not overflow");
});

Deno.test("the chrome contract: a measured number may never be overwritten by a declared one", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const render = await Deno.readTextFile(P("packages/runtime/render.js"));

  for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
    assert(render.includes(`setProperty("${v}"`), `${v} is not measured — render.js never publishes it`);
  }
  assert(/function usePublishedChrome/.test(render), "the two chrome measurements have drifted into two mechanisms");
  assert((render.match(/usePublishedChrome\(/g) || []).length >= 3, "a chrome element is not wired to the measurement");
  assert(/<header ref=\$\{/.test(render), "the header is not measured — its height is a guess again");

  for (const m of css.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/g)) {
    for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
      assert(!new RegExp(`${v}\\s*:`).test(m[1]),
        `a media query sets ${v} — that overwrites a MEASURED number with a guess. Compact the element instead.`);
    }
  }
});

Deno.test("clean screen: the chrome that unmounts takes its measurements with it, and leaves a door", async () => {
  const render = await Deno.readTextFile(P("packages/runtime/render.js"));
  const index = await Deno.readTextFile(P("packages/runtime/index.js"));
  const store = await Deno.readTextFile(P("packages/runtime/store.js"));
  const i18n = await Deno.readTextFile(P("packages/runtime/i18n.js"));

  assert(/\bclean:\s*atom\(false\)/.test(store), "S.clean is gone — the mode has no state");

  for (const el of ["AppBar", "DockFade", "Dock"]) {
    assert(new RegExp(`clean \\? null : html\`<\\$\\{${el}\\}|clean \\? html\`<\\$\\{CleanExit\\}[^\`]*\` : html\`<\\$\\{${el}\\}`).test(render),
      `${el} still renders in clean screen — the surface is not clean`);
  }

  const zeroed = /if \(!clean\) return;[\s\S]{0,400}?setProperty\("--hdr-h", "0px"\)[\s\S]{0,200}?setProperty\("--dock-h", "0px"\)/;
  assert(zeroed.test(render), "clean screen unmounts the chrome without zeroing --hdr-h/--dock-h — every consumer still lays out around chrome that is not on screen");

  assert(/function CleanExit/.test(render) && /data-clean-exit/.test(render), "no door out of clean screen");
  const door = /data-clean-exit class="([^"]+)"/.exec(render);
  assert(door && /\bbtn-ghost\b/.test(door[1]) && /\bsf-frost\b/.test(door[1]),
    `the clean-screen door is extruded (${door?.[1]}) — it needs btn-ghost + sf-frost, or it wears a white halo on the screen it just cleared`);
  assert(/\[S\.clean, \(\) => S\.clean\.set\(false\), \(v\) => v === true\]/.test(index),
    "S.clean is not registered as an overlay — Back would leave the app instead of giving the chrome back");
  const overlays = /const overlays = \[([\s\S]*?)\n  \];/.exec(index)[1];
  assert(overlays.trimStart().split("\n").filter((l) => l.trim().startsWith("[S.")).shift().includes("S.clean"),
    "S.clean must be the BOTTOM-most overlay — a dive taken with the chrome hidden has to unwind before the chrome comes back");

  const sys = /export const SYS = \{([\s\S]*?)\n\};/.exec(i18n)[1];
  for (const k of ["clean", "cleanExit"]) {
    assert(new RegExp(`\\b${k}:\\s*\\{[^}]*\\ben:[^}]*\\buk:`).test(sys), `SYS.${k} must carry BOTH locales`);
  }
});

Deno.test('a "dark" island is glass over MEDIA — it casts alone, never the extrusion pair', async () => {
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const dark = /tone === "dark"\s*[\r\n]*\s*\? "([^"]+)"/.exec(ui);
  assert(dark, 'the tone="dark" surface is gone from IslandBox');
  assert(!/\bsf-e[2-5]\b/.test(dark[1]),
    `tone="dark" is extruded ("${dark[1]}") — the pair's light half has nothing to shade against on a media surface and draws a white ring instead`);
  assert(/\bsf-frost\b/.test(dark[1]), 'tone="dark" must cast alone (.sf-frost), like every other glass-over-stage surface');
});

Deno.test(".ms-cols asks its CONTAINER, not the window — and says its counts out loud", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const at = css.indexOf(".ms-cols {");
  assert(at > 0, ".ms-cols rule is gone");

  const region = css.slice(at - 900, at + 700);
  assert(/@container \(min-width/.test(region), ".ms-cols must respond to its container");
  assert(!/@media \([^)]*height[^)]*\)\s*\{[^}]*\.ms-cols/.test(css), ".ms-cols is back on a viewport height query");

  assert(!/grid-template-columns:[^;]*auto-fit/.test(css), "auto-fit is back — the count must be stated, not derived");
  assert(/repeat\(var\(--ms-cols, 3\), minmax\(0, 1fr\)\)/.test(region), "--ms-cols must still name the widest count");

  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const panelCls = /export function Panel\([^)]*\)\s*\{[\s\S]*?class=\$\{`([^`]*)`/.exec(ui)?.[1] ?? "";
  assert(panelCls.includes("@container"), `Panel no longer establishes a container — the queries have nothing to read (its classes: ${panelCls})`);
});

Deno.test("watch mode — the dock turns 90°, the side-by-side becomes a pager, the tap floor holds", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const at = css.indexOf("@media (max-width: 300px)");
  assert(at > 0, "no watch breakpoint — the farm's smallest screen is 208px, not 320px");
  const block = css.slice(at, css.indexOf("\n}\n", css.indexOf(".ms-side >", at)));

  assert(/grid-auto-flow:\s*row/.test(block), "the dock must turn 90° — horizontal it costs 27% of the height");
  assert(/nav\[data-dock\] button > span\s*\{\s*display:\s*none/.test(block), "dock captions must go at watch size");
  const ctl = /--ms-ctl:\s*([\d.]+)rem/.exec(block);
  assert(ctl && parseFloat(ctl[1]) * 16 >= 36, `watch --ms-ctl is ${ctl?.[1]}rem — below the 36px tap floor`);

  assert(/scroll-snap-type:\s*x mandatory/.test(block), ".ms-side must become a horizontal snap pager");
  const page = /flex:\s*0 0 (\d+)%/.exec(block);
  assert(page, "the pager's pages have no width");
  assert(Number(page[1]) < 100 && Number(page[1]) >= 80,
    `a page is ${page[1]}% — at 100% nothing hints the next page exists; below ~80% it stops being a page`);
  assert(/scroll-snap-align/.test(block), "snap targets need an alignment or the pager free-scrolls");
  assert(/\.ms-side > \.ms-side-main\s*\{\s*order:\s*-1/.test(block), "the transport must be the first page");

  const markers = css.indexOf("::scroll-marker");
  assert(markers > 0, "no scroll markers — the pager has no indicator where the browser supports one");
  assert(/@supports selector\(::scroll-marker\)/.test(css), "scroll markers must be @supports-gated");
  assert(css.lastIndexOf("@supports selector(::scroll-marker)", markers) > css.lastIndexOf("scroll-snap-type", markers) - 4000 ||
    css.indexOf("scroll-marker-group") > css.indexOf("@supports selector(::scroll-marker)"),
    "the marker group must live inside the @supports block, not beside it");
});

Deno.test("watch mode — the dock's own position is styleable (no inline style can outrank it)", async () => {
  const render = await Deno.readTextFile(P("packages/runtime/render.js"));
  const nav = render.slice(render.indexOf("<nav data-dock"), render.indexOf("</nav>", render.indexOf("<nav data-dock")));
  assert(!/style="[^"]*bottom:/.test(nav), "the dock's `bottom` is an inline style — watch mode cannot move it");
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  assert(/nav\[data-dock\]\s*\{\s*bottom:/.test(css), "…and nothing in theme.css positions it instead");
  assert(/--dock-w/.test(render) && /--dock-w/.test(css), "the rail's width must be published and consumed");
});

Deno.test("the surface system: every interactive node declares a state, and none draws its own shadow", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const ui = await Deno.readTextFile(P("packages/runtime/ui.js"));
  const render = await Deno.readTextFile(P("packages/runtime/render.js"));

  for (const [name, src] of [["ui.js", ui], ["render.js", render]]) {
    const lits = [...src.matchAll(/shadow-\[[^\]]+\]|shadow-(?:sm|md|lg|xl|2xl)\b/g)].map((m) => m[0]);
    assertEquals(lits, [], `${name} still writes its own shadows instead of declaring a surface`);
  }

  for (const v of ["--sf-rim", "--sf-drop", "--sf-inset-face", "--sf-inset-top", "--sf-press-face", "--sf-press-top"]) {
    const defs = (css.match(new RegExp(v.replace(/-/g, "\\-") + ":", "g")) || []).length;
    assert(defs >= 2, `${v} is defined ${defs}× — a state that exists in one theme only is not a state`);
  }

  const nodes = [
    [".btn:not(.btn-ghost)", "buttons raise at rest"],
    [":not(:disabled):active", "buttons press under a finger"],
    [".input, .textarea", "fields are recessed"],
    [".toggle, .checkbox, .radio", "switches are a slot with something in it"],
    [".progress", "a progress bar is a value in a trough"],
    ['nav[data-dock] button[aria-current="page"]', "the active tab lifts out of the rail"],
    [".card, [data-card]", "cards carry the base ambient drop"],
    [".alert", "an alert sits on content"],
    [".modal-box", "a sheet is L4"],
    ["[data-toast] .alert", "a toast is L5"],
  ];
  for (const [sel, why] of nodes) assert(css.includes(sel), `no surface rule for ${sel} — ${why}`);

  const focus = css.slice(css.indexOf(".input:focus"), css.indexOf("}", css.indexOf(".input:focus")));
  assert(/0 0 0 \d+px var\(--app-accent\)/.test(focus), "focus must be a ring — an arbitrary hue behind text fails contrast in one theme");
  assert(!/background:\s*var\(--app-accent\)/.test(focus), "focus fills the field with the accent");
});

Deno.test("the neutral material: every surface token a brand composes has a value, with a ring and no 45° pair", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const themeBlock = (t) => {
    let out = "", i = -1;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
    return out;
  };
  const value = (b, v) => { const d = b.slice(b.indexOf(v + ":")); return d.slice(0, d.indexOf(";")); };

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlock(theme);

    for (const v of ["--lm-rim", "--lm-rim-hi", "--lm-rim-lo", "--lm-bloom", "--nm-cast"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v} — the rim and the bloom are the material`);
    }

    const ring = /(?:^|,|:)\s*(?:inset\s+)?0 0 0 1px var\(--lm-(?:rim|rim-lo|bloom-hi)\)/;
    for (const v of ["--sf-drop", "--sf-lift2", "--sf-sink", "--sf-sink2", "--sf-press"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v}`);
      assert(ring.test(value(b, v)), `${theme} ${v} has no rim — a surface with no lit edge is invisible on black`);
    }
    assert(value(b, "--sf-drop").includes("--lm-rim-hi"), `${theme} --sf-drop must carry the top edge — a raised surface is the one the light lands on`);
    assert(value(b, "--sf-press").includes("--lm-bloom-hi"), `${theme} --sf-press must turn the rim to accent — pressing something LIGHTS it`);
    assert(/inset 0 \d+px \d+px rgba\(/.test(value(b, "--sf-sink")), `${theme} --sf-sink needs a dark inner top — a well the light does not reach`);

    const tok = (n) => /#[0-9A-Fa-f]{6}/.exec(b.slice(b.indexOf(`--color-${n}:`)))[0].toUpperCase();
    assertEquals(tok("base-100"), tok("base-200"), `${theme}: base-100 and base-200 differ — a raised surface must be the same colour as the page`);

    for (const v of ["--sf-drop", "--sf-lift2", "--sf-sink", "--sf-sink2", "--sf-press"]) {
      assert(!/(\d+)px \1px \d+px/.test(value(b, v)), `${theme} ${v} carries a 45° offset pair — that is the extrusion, not light`);
    }
  }

  for (const v of ["--ds-strand", "--ds-lip", "--ds-scatter", "--ds-corner"]) {
    assert(new RegExp(`${v}:\\s*none`).test(css), `${v} must default to none — the core owns no sprite`);
  }
  assert(!/ds-[nd]-[a-z]+\.webp/.test(css), "runtime.css names a brand sprite — sprites live in the product's rt/");

  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{[^}]*--lm-g:\s*(\d+)px/g)]
    .map((m) => ({ h: +m[1], g: +m[2] })).sort((a, b) => b.h - a.h);
  assert(steps.length >= 2, "the bloom radius does not step with the density ladder");
  for (let i = 1; i < steps.length; i++) {
    assert(steps[i].g < steps[i - 1].g, `--lm-g does not shrink at ${steps[i].h}px — the bloom must compact with everything else`);
  }
  for (const m of css.matchAll(/--lm-gs:\s*(-?\d+)px/g)) assert(Number(m[1]) < 0, `--lm-gs is ${m[1]}px — the raised bloom must have a NEGATIVE spread`);
});

Deno.test("the material: the pair of light is text-safe in BOTH themes — the CI-only trap", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const tokens = (theme) => {
    const i = css.indexOf(`[data-theme="${theme}"] {`);
    const out = {};
    for (const m of css.slice(i, css.indexOf("}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
    return out;
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);

  for (const theme of ["signal", "signal-light"]) {
    const t = tokens(theme);
    const bed = { "base-100": rgb(t["--color-base-100"]), "base-200": rgb(t["--color-base-200"]), "base-300": rgb(t["--color-base-300"]) };
    bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
    for (const pole of ["secondary", "accent", "info"]) {
      const fg = rgb(t[`--color-${pole}`]);
      for (const [surface, px] of Object.entries(bed)) {
        const r = ratio(fg, px);
        assert(r >= 4.5, `${theme}: --color-${pole} as TEXT on ${surface} is ${r.toFixed(2)}:1 — text-${pole} fails axe farm-wide. Tune the pole per theme; the vivid mark stays in --app-accent.`);
      }
      const r = ratio(rgb(t[`--color-${pole}-content`]), fg);
      assert(r >= 4.5, `${theme}: --color-${pole}-content on --color-${pole} is ${r.toFixed(2)}:1 — badge-${pole} fails axe`);
    }
  }

  assert(/:root\s*\{[^}]*--app-accent:\s*#[0-9A-Fa-f]{6}/.test(css), "--app-accent must be a hex on :root");
  assert(/:root\s*\{[^}]*--app-accent-2:\s*#[0-9A-Fa-f]{6}/.test(css), "--app-accent-2 (the cool pole) must be a hex on :root");
});

Deno.test("PWA chrome colours track the theme bases — the surface no screenshot can see", async () => {
  const root = `file://${Deno.cwd()}/`;
  const expand = async (text) => {
    let head = "";
    for (const m of text.matchAll(/@import\s+"\.\/([\w.-]+\.css)";/g)) {
      const local = await Deno.readTextFile(new URL(`rt/${m[1]}`, root)).catch(() => null);
      if (local != null) head += await expand(local) + "\n";
    }
    return head + text;
  };
  const core = await Deno.readTextFile(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));
  const own = await Deno.readTextFile(new URL("rt/theme.css", root)).catch(() => null);
  const css = own == null ? core : core + "\n" + await expand(own);
  const baseOf = (t) => {
    let i = -1, base = null;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) {
      const m = /--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(css.slice(i, css.indexOf("\n}", i)));
      if (m) base = m[1].toUpperCase();
    }
    return base;
  };
  const allowed = new Set([baseOf("signal"), baseOf("signal-light")]);
  const bad = [];
  for await (const e of Deno.readDir(new URL("apps/", root))) {
    if (!e.isDirectory) continue;
    try {
      const m = JSON.parse(await Deno.readTextFile(new URL(`apps/${e.name}/manifest.json`, root)));
      for (const k of ["theme_color", "background_color"]) {
        if (m[k] && !allowed.has(m[k].toUpperCase())) bad.push(`${e.name}/manifest.json ${k}=${m[k]}`);
      }
      const html = await Deno.readTextFile(new URL(`apps/${e.name}/index.html`, root));
      const meta = /<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html)?.[1];
      if (meta && !allowed.has(meta.toUpperCase())) bad.push(`${e.name}/index.html meta theme-color=${meta}`);
    } catch { }
  }
  assertEquals(bad, [], `PWA chrome is off-theme (allowed: ${[...allowed].join(", ")}). An installed app would show a splash and status bar from the previous design: ${bad.join(", ")}`);
});

Deno.test("material: a SURFACE is extruded, never a fill with a line drawn round it", async () => {
  const src = await Deno.readTextFile(P("packages/runtime/render.js"));
  const surfaces = src.match(/card[^"'`]*border border-base-\d+/g) || [];
  assertEquals(surfaces, [], "a card is declaring a border instead of `sf-raised` — depth is the shadow pair, not a line");
  const wells = src.match(/aspect-(video|square)[^"'`]*border border-base-\d+/g) || [];
  assertEquals(wells, [], "a media well is declaring a border instead of `sf-inset` — a picture sits IN the surface");
  for (const m of src.match(/border-base-\d+[^"'`]*/g) || []) {
    const line = src.slice(Math.max(0, src.indexOf(m) - 160), src.indexOf(m) + m.length);
    assert(/border-b|border-t|btn-ghost/.test(line), `a boxed hairline survives: …${m.slice(0, 60)}`);
  }
});

Deno.test(".ms-stage — a fixed stage consumes the chrome contract, and nobody hand-writes it", async () => {
  const css = await Deno.readTextFile(P("packages/runtime/runtime.css"));
  const at = css.indexOf(".ms-stage {");
  assert(at > 0, "no .ms-stage — a fixed stage has nothing to consume but hand-written numbers");
  const rule = css.slice(at, css.indexOf("}", at));

  assert(/top:\s*calc\(var\(--hdr-h\)/.test(rule), "the stage's top must come from --hdr-h, not a literal");
  assert(/bottom:\s*calc\(var\(--dock-h\)/.test(rule), "the stage's bottom must come from --dock-h");
  assert(!/3\.5rem/.test(rule), "the header height is measured, not declared");
  assert(/right:\s*calc\(var\(--dock-w/.test(rule), "the stage must clear the watch rail (--dock-w), not just the bar");
  assert(/min\(var\(--dock-w/.test(rule), "the rail clearance must switch itself off when --dock-w is 0 — else every phone is inset");

  const offenders = [];
  for await (const e of Deno.readDir("apps")) {
    if (!e.isDirectory) continue;
    let src;
    try { src = await Deno.readTextFile(`apps/${e.name}/view.js`); } catch { continue; }
    if (/bottom:\s*calc\(var\(--dock-h\)/.test(src) || /top:\s*calc\(3\.5rem/.test(src)) offenders.push(e.name);
  }
  assertEquals(offenders, [], `these apps hand-write the chrome geometry instead of using .ms-stage: ${offenders.join(", ")}`);
});
