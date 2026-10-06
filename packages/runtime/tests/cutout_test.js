import { assertEquals } from "jsr:@std/assert@1";
import { wantsCutoutArm } from "../cutout.js";

const SI = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36";
const CHROME = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36";
const installed = (q) => ({ matches: /standalone|fullscreen/.test(q) });
const tab = () => ({ matches: false });

Deno.test("cutout: armed only for an installed app in Samsung Internet with the Fullscreen API", () => {
  assertEquals(wantsCutoutArm({ userAgent: SI }, { fullscreenEnabled: true }, installed), true);
  assertEquals(wantsCutoutArm({ userAgent: SI }, { fullscreenEnabled: true }, tab), false, "a browser tab keeps its chrome");
  assertEquals(wantsCutoutArm({ userAgent: SI }, { fullscreenEnabled: false }, installed), false, "no API, no ask");
  assertEquals(wantsCutoutArm({ userAgent: CHROME }, { fullscreenEnabled: true }, installed), false, "Chrome is edge-to-edge already");
  assertEquals(wantsCutoutArm(null, null, installed), false);
});
