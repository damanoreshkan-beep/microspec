// microspec runtime — ax56 (RTL8852AU) decode + bring-up stage unit tests. Browser-free: the register
// semantics and the demo bring-up are pure data, so they verify with no WebUSB.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cutName, decodeCut, isUnmapped, DEADBEEF, DEMO_LOW_PAGE, REG, STAGES, stageState, demoFrames,
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
  // 0x00F0 is the last-row-first cell (index 60) and decodes to cut C
  assertEquals(decodeCut(DEMO_LOW_PAGE[0x3c]), 2);
  // a known unmapped cell (0x0018 -> index 6) is deadbeef
  assert(isUnmapped(DEMO_LOW_PAGE[6]));
});

Deno.test("demo frames light the five stages in order", () => {
  const frames = demoFrames();
  assertEquals(frames.length, 5);
  const doneCounts = frames.map((r) => stageState(r).filter((s) => s.done).length);
  // strictly increasing: each frame satisfies one more stage
  for (let i = 1; i < doneCounts.length; i++) assert(doneCounts[i] > doneCounts[i - 1], `frame ${i} advanced`);
  assertEquals(doneCounts[0], 1); // power only
  assertEquals(doneCounts[4], 5); // all five predicates satisfied
});

Deno.test("the H2C wall never arms in the demo — the honest ending", () => {
  const last = stageState(demoFrames()[4]);
  const cpu = last.find((s) => s.id === "cpu");
  assert(cpu.done, "FWDL_EN is set");
  assertEquals(cpu.wall, false); // H2C_PATH_RDY stays 0 — the real on-chip wall
});

Deno.test("stages cover the five bring-up registers we read", () => {
  assertEquals(STAGES.map((s) => s.reg), [
    REG.PLATFORM_ENABLE, REG.DMAC_FUNC_EN, REG.WDE_INI, REG.HCI_FUNC_EN, REG.WCPU_FW_CTRL,
  ]);
});
