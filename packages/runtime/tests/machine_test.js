import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { ABI, loadMachine, MachineStage } from "../machine.js";
import { assemble } from "../../../tools/wat.mjs";

const MINIMAL = `(module
  (memory (export "memory") 1)
  (global $w (mut i32) (i32.const 0)) (global $h (mut i32) (i32.const 0)) (global $n (mut i32) (i32.const 0))
  (func (export "abi") (result i32) (i32.const ${ABI}))
  (func (export "out_ptr") (result i32) (i32.const 0))
  (func (export "hud_ptr") (result i32) (i32.const 256))
  (func (export "buf_ptr") (result i32) (i32.const 4096))
  (func (export "buf_w") (result i32) (global.get $w))
  (func (export "buf_h") (result i32) (global.get $h))
  (func (export "buf_ch") (result i32) (i32.const 1))
  (func (export "init") (param $w i32) (param $h i32) (param $seed i32) (result i32) (local $i i32) (local $x i32) (local $y i32)
    (if (i32.gt_u (i32.mul (local.get $w) (local.get $h)) (i32.const 61440)) (then (return (i32.const 0))))
    (global.set $w (local.get $w)) (global.set $h (local.get $h))
    (loop $L
      (local.set $x (i32.rem_u (local.get $i) (local.get $w))) (local.set $y (i32.div_u (local.get $i) (local.get $w)))
      (i32.store8 (i32.add (i32.const 4096) (local.get $i)) (i32.xor (local.get $x) (local.get $y)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $L (i32.lt_u (local.get $i) (i32.mul (local.get $w) (local.get $h)))))
    (f32.store (i32.const 0) (f32.const 0.5)) (f32.store (i32.const 4) (f32.const 0.5))
    (i32.store (i32.const 256) (local.get $seed))
    (i32.const 1))
  (func (export "step") (param $dt f32) (param $t f32) (result i32)
    (global.set $n (i32.add (global.get $n) (i32.const 1)))
    (i32.store (i32.const 260) (global.get $n))
    (i32.store8 (i32.const 4096) (i32.add (i32.load8_u (i32.const 4096)) (i32.const 1)))
    (i32.const 1))
  (func (export "touch") (param $id i32) (param $phase i32) (param $x f32) (param $y f32) (local $cx i32) (local $cy i32)
    (local.set $cx (i32.trunc_f32_s (f32.mul (local.get $x) (f32.convert_i32_s (global.get $w)))))
    (local.set $cy (i32.trunc_f32_s (f32.mul (local.get $y) (f32.convert_i32_s (global.get $h)))))
    (i32.store8 (i32.add (i32.const 4096) (i32.add (i32.mul (local.get $cy) (global.get $w)) (local.get $cx))) (i32.const 255))
    (f32.store (i32.const 0) (local.get $x)) (f32.store (i32.const 4) (local.get $y))
    (f32.store (i32.const 8) (f32.convert_i32_s (i32.eq (local.get $phase) (i32.const 0)))))
  (func (export "set") (param $i i32) (param $v f32)
    (f32.store (i32.add (i32.const 16) (i32.mul (local.get $i) (i32.const 4))) (local.get $v))))`;

const bytes = await assemble(MINIMAL, "minimal.wat");

Deno.test("the minimal machine assembles, speaks ABI 1 and initialises its grid", async () => {
  assert(bytes instanceof Uint8Array && bytes.length > 100);
  const api = await loadMachine(bytes, { w: 8, h: 4, seed: 7 });
  assertEquals(api.exports.abi(), ABI);
  assertEquals([api.bufW, api.bufH, api.bufCh, api.buf.length], [8, 4, 1, 32]);
  assertEquals(api.buf[3 * 8 + 5], 5 ^ 3, "init writes x ^ y into the grid");
  assertEquals(api.hud[0], 7, "the seed reached the HUD block");
  assertEquals([api.out[0], api.out[1]], [0.5, 0.5], "the out block carries the cursor at rest");
});

Deno.test("step advances the machine and reports a dirty byte region; touch lands in the right cell", async () => {
  const api = await loadMachine(bytes, { w: 10, h: 10, seed: 0 });
  const before = api.buf[0];
  assertEquals(api.exports.step(16, 16), 1);
  assertEquals(api.buf[0], (before + 1) & 255);
  assertEquals(api.hud[1], 1, "the step counter is in the HUD block");
  api.exports.touch(1, 0, 0.55, 0.25);           
  assertEquals(api.buf[2 * 10 + 5], 255);
  assertEquals([api.out[0], api.out[1], api.out[2]], [0.55000001192092896, 0.25, 1]);
  api.exports.set(1, 2.5);
  assertEquals(api.out[5], 2.5, "set(i, v) lands in vary");
});

Deno.test("the host refuses a module that does not speak the ABI, and an init that refuses", async () => {
  const wrong = await assemble(MINIMAL.replace(`(i32.const ${ABI}))`, "(i32.const 9))"), "wrong.wat");
  await assertRejects(() => loadMachine(wrong, { w: 4, h: 4 }), Error, "abi 9");
  await assertRejects(() => loadMachine(bytes, { w: 1000, h: 1000 }), Error, "init refused");
  const bare = await assemble(`(module (memory (export "memory") 1))`, "bare.wat");
  await assertRejects(() => loadMachine(bare, { w: 4, h: 4 }), Error, 'no export "abi"');
});

Deno.test("MachineStage is a component", () => { assertEquals(typeof MachineStage, "function"); });
