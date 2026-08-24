
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cutName, decodeCut, isUnmapped, DEADBEEF, DEMO_LOW_PAGE, REG, STAGES, stageState, demoFrames,
  fwSts, h2cReady, booted,
} from "../ax56.js";

Deno.test("decodeCut reads the real measured value as C-cut", () => {
  assertEquals(decodeCut(0x0c492537), 2);
  assertEquals(cutName(0x0c492537), "C");
});

Deno.test("isUnmapped flags the deadbeef marker only", () => {
  assert(isUnmapped(DEADBEEF));
  assert(isUnmapped(0xdeadbeef));
  assert(!isUnmapped(0x00000000));
  assert(!isUnmapped(0x0c492537));
});

Deno.test("the real low page has the expected shape", () => {
  assertEquals(DEMO_LOW_PAGE.length, 64);
  assertEquals(decodeCut(DEMO_LOW_PAGE[0x3c]), 2);
  assert(isUnmapped(DEMO_LOW_PAGE[6]));
});

Deno.test("WCPU_FW_CTRL field decode matches the on-chip progression", () => {
  assert(!h2cReady(0x1) && fwSts(0x1) !== 7); 
  assert(h2cReady(0x23) && fwSts(0x23) !== 7); 
  assert(h2cReady(0xe2) && fwSts(0xe2) === 7 && booted(0xe2)); 
  assert(!booted(DEADBEEF)); 
});

Deno.test("demo frames light the six stages in order, cold chip to booted", () => {
  const frames = demoFrames();
  assertEquals(frames.length, 6);
  const doneCounts = frames.map((r) => stageState(r).filter((s) => s.done).length);
  for (let i = 1; i < doneCounts.length; i++) assert(doneCounts[i] > doneCounts[i - 1], `frame ${i} advanced`);
  assertEquals(doneCounts[0], 1); 
  assertEquals(doneCounts[5], 6); 
  const last = stageState(frames[5]);
  assert(last.find((s) => s.id === "boot").done, "boot stage reached STS == 7");
});

Deno.test("stages cover the six bring-up registers we read", () => {
  assertEquals(STAGES.map((s) => s.reg), [
    REG.PLATFORM_ENABLE, REG.DMAC_FUNC_EN, REG.WDE_INI, REG.HCI_FUNC_EN, REG.WCPU_FW_CTRL, REG.WCPU_FW_CTRL,
  ]);
});
