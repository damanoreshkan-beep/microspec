/* @ts-self-types="./store-shots.d.mts" */
/**
 * # store-shots — the store's screenshots, taken from the working tree in one command
 *
 * A store card shows one picture per screen in both themes (`apps/store/assets/shot-<id>--<tab>.webp` and
 * `…--light.webp`). They used to be made by hand from whatever eye was nearby, so a new app shipped without
 * them and the card stayed a glyph until someone asked. This opens each non-profile tab of an app at the
 * reference phone (384×832, DPR 2) under the gate's fixtures, in dark and light, writes the pictures at 1×
 * and regenerates the catalog — the `listing` gate then has nothing left to say. A script with no exports.
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/store-shots <app> [<app> …]
 * ```
 * Run it from the product root (the product's dispatcher: `deno run -A .microspec/core.mjs store-shots moto`).
 * Chromium comes from `CHROMIUM_PATH` (default `/usr/sbin/chromium`). Shoot AFTER the screen is final: the
 * card shows exactly what the fixtures render.
 *
 * ## Exit codes
 * - `0` — every tab of every named app was shot and the catalog rewritten.
 * - `1` — a page did not render (`#app` empty) or the import failed; nothing is half-written into the catalog.
 * - `2` — no app named, or an app directory is missing.
 * @module
 */

import { serveLocal, bootBrowser, makeHelpers, gotoAndSettle } from "./browser-lib.mjs";
import { APPS } from "../../tools/graph.mjs";

const DEV = { width: 384, height: 832, dpr: 2, mobile: true };
const ids = Deno.args.filter((a) => !a.startsWith("--"));
if (!ids.length) { console.error("usage: store-shots <app> [<app> …]"); Deno.exit(2); }
for (const id of ids) { try { await Deno.stat(`${APPS}/${id}/spec.json`); } catch { console.error(`store-shots: no app ${APPS}/${id}`); Deno.exit(2); } }

const tmp = await Deno.makeTempDir({ prefix: "store-shots-" });
const browser = await bootBrowser(DEV);
let failed = 0;
try {
  for (const id of ids) {
    const dir = await Deno.realPath(`${APPS}/${id}`);
    const tabs = (JSON.parse(await Deno.readTextFile(`${dir}/spec.json`)).tabs ?? []).filter((t) => t.type !== "profile");
    const srv = serveLocal(dir);
    const page = await browser.newPage();
    await page.setViewportSize({ width: DEV.width, height: DEV.height });
    const { h, ev } = makeHelpers(page);
    for (const tab of tabs) for (const light of [false, true]) {
      await gotoAndSettle(page, `${srv.url}?tab=${tab.id}${light ? "&theme=light" : ""}`, 2500);
      for (let i = 0; i < 30; i++) { if ((await h.count(".skeleton, [data-skel]")) === 0 && (await h.bodyText()).trim()) break; await h.wait(500); }
      await h.wait(1200);
      if (!(await ev(() => document.getElementById("app")?.children.length))) { console.error(`  ✗ ${id} ${tab.id}: did not render`); failed++; continue; }
      await Deno.writeFile(`${tmp}/${id}--${tab.id}${light ? "--light" : ""}.png`, await page.screenshot());
      console.log(`  ✓ ${id} ${tab.id}${light ? " (light)" : ""}`);
    }
    await page.close();
    await srv.stop();
  }
} finally { await browser.close(); }
if (failed) Deno.exit(1);

const run = async (rel, ...args) => (await new Deno.Command("deno", { args: ["run", "-A", new URL(rel, import.meta.url).href, ...args], stdout: "inherit", stderr: "inherit" }).output()).success;
if (!(await run("../../tools/art/shots-import.mjs", tmp, `--out=${Deno.cwd()}/${APPS}/store/assets`))) Deno.exit(1);
if (!(await run("../../deploy/manifest.mjs"))) Deno.exit(1);
await Deno.remove(tmp, { recursive: true });
