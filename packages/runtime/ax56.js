// microspec runtime — RTL8852AU (ASUS USB-AX56) register decode + bring-up stages + demo data.
// PURE logic: no WebUSB here, so it unit-tests browser-free (packages/runtime/tests/ax56_test.js).
// The thin control-transfer wrapper (dev.controlTransferIn) lives in the app view. Register semantics
// come from the driver project github.com/damanoreshkan-beep/rtl8852au-userspace (docs/RESEARCH.md).

// Wi-Fi mode only. Storage mode 0bda:1a2b is deliberately NOT offered — WebUSB cannot mode-switch it.
export const VID = 0x0b05;
export const PID = 0x1997;
export const USB_FILTERS = [{ vendorId: VID, productId: PID }];

export const REG = {
  SYS_CFG1: 0x00f0,       // chip cut in bits [15:12]
  PLATFORM_ENABLE: 0x0088, // PLATFORM_EN bit0 / WCPU_EN bit1
  WCPU_FW_CTRL: 0x01e0,    // FWDL_EN bit0, H2C_PATH_RDY bit1, FWDL_STS [7:5]
  DMAC_FUNC_EN: 0x8400,    // DMAC_FUNC_EN bit29
  HCI_FUNC_EN: 0x8380,     // TXDMA bit0, RXDMA bit1
  WDE_INI: 0x8d00,         // init-ready 0x3
  PLE_INI: 0x9100,         // init-ready 0x3
};

export const DEADBEEF = 0xdeadbeef;
export const isUnmapped = (v) => (v >>> 0) === DEADBEEF;
export const decodeCut = (sysCfg1) => (sysCfg1 >>> 12) & 0xf;
export const CUT_NAME = ["A", "B", "C", "D", "E", "F"];
export const cutName = (sysCfg1) => CUT_NAME[decodeCut(sysCfg1)] ?? "?";

// Five bring-up stages. Each predicate reads a { addr: value } snapshot and returns whether it is satisfied.
// The last stage's `wall` never passes on real 8852AU (H2C_PATH_RDY does not arm) — the app shows it as the
// honest end of the story, not a fake success.
export const STAGES = [
  { id: "power", key: "stagePower", reg: REG.PLATFORM_ENABLE,
    done: (r) => r[REG.PLATFORM_ENABLE] != null && !isUnmapped(r[REG.PLATFORM_ENABLE]) && (r[REG.PLATFORM_ENABLE] & 1) !== 0 },
  { id: "dmac", key: "stageDmac", reg: REG.DMAC_FUNC_EN,
    done: (r) => r[REG.DMAC_FUNC_EN] != null && (r[REG.DMAC_FUNC_EN] & (1 << 29)) !== 0 },
  { id: "dle", key: "stageDle", reg: REG.WDE_INI,
    done: (r) => (r[REG.WDE_INI] & 3) === 3 && (r[REG.PLE_INI] & 3) === 3 },
  { id: "hci", key: "stageHci", reg: REG.HCI_FUNC_EN,
    done: (r) => (r[REG.HCI_FUNC_EN] & 3) === 3 },
  { id: "cpu", key: "stageCpu", reg: REG.WCPU_FW_CTRL,
    done: (r) => r[REG.WCPU_FW_CTRL] != null && (r[REG.WCPU_FW_CTRL] & 1) !== 0,
    wall: (r) => (r[REG.WCPU_FW_CTRL] & 2) !== 0 }, // H2C_PATH_RDY — the wall
];

// Per-stage state from a reads snapshot: { id, done, wall? }.
export function stageState(reads) {
  return STAGES.map((s) => ({ id: s.id, key: s.key, reg: s.reg, done: !!s.done(reads), wall: s.wall ? !!s.wall(reads) : undefined }));
}

// The real low register page measured on the C-cut AX56 (0x0000..0x00FC, 64 u32, LE). 0xdeadbeef = unmapped.
// Used as the register-lattice demo so the app is fully alive without hardware, with true values.
export const DEMO_LOW_PAGE = [
  0xd81c0e98, 0x50030082, 0x0020ec21, 0x00000000, 0x00000004, 0x030f2206, 0xdeadbeef, 0x00f38040,
  0x1f3c07df, 0x0000ff00, 0x00400100, 0x00400100, 0x00000000, 0x00000000, 0x31600000, 0xdeadbeef,
  0x00080000, 0x000000c0, 0x00000000, 0x00628282, 0x00777000, 0x000000a0, 0x00f200f2, 0x0f0fffff,
  0x0000006f, 0x06240000, 0x80406804, 0x00000700, 0x02008024, 0x000004e5, 0x0028c009, 0x089008d0,
  0x80000823, 0xdeadbeef, 0x0000054f, 0xdeadbeef, 0x0001a1b0, 0x00000020, 0x00000000, 0xdeadbeef,
  0x00000620, 0xdeadbeef, 0x00000000, 0x00000000, 0xdeadbeef, 0xdeadbeef, 0xdeadbeef, 0xdeadbeef,
  0xb8907aff, 0x00100010, 0xeaeaeaea, 0x00000029, 0x00000000, 0x00000000, 0x00000000, 0xdeadbeef,
  0x29820d00, 0x00000000, 0x00000000, 0xdeadbeef, 0x0c492537, 0x20012648, 0x00058129, 0x80000050,
];

// Demo bring-up: successive reads snapshots that light stages 1→5 in order, then stop at the wall
// (WCPU_FW_CTRL = FWDL_EN set, H2C_PATH_RDY never). Mirrors the real on-chip result.
export function demoFrames() {
  const base = { [REG.SYS_CFG1]: 0x0c492537, [REG.PLATFORM_ENABLE]: 0x0000054f };
  const f = [];
  f.push({ ...base }); // chip present, cut readable
  f.push({ ...base, [REG.DMAC_FUNC_EN]: 0x64c40000 }); // DMAC up
  f.push({ ...f[1], [REG.WDE_INI]: 0x3, [REG.PLE_INI]: 0x3 }); // DLE init-ready
  f.push({ ...f[2], [REG.HCI_FUNC_EN]: 0x3 }); // HCI DMA
  f.push({ ...f[3], [REG.WCPU_FW_CTRL]: 0x1 }); // FWDL_EN set — but H2C_PATH_RDY (bit1) stays 0: the wall
  return f;
}
