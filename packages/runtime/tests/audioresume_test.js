import { assert } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";

Deno.test("engine.resume swallows the rejection of a resume the context closed under", async () => {
  const src = await Deno.readTextFile(new URL("packages/runtime/audio.js", pkgRoot(import.meta.url, 3)));
  const line = src.split("\n").find((l) => l.trim().startsWith("resume: () =>"));
  assert(line, "the engine has a resume");
  assert(line.includes("ctx.resume()") && line.includes(".catch("), line);
});
