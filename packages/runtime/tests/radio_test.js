// radio tests — the shared adapter's distinctive contracts: ONE bring-up for concurrent callers, auto-detach
// when the last subscriber leaves, and send routing. The frame/unit parse is covered by rf/meshscan tests.
import { assertEquals, assert } from "jsr:@std/assert@1";
import { createRadio, carrierFromRadio } from "../radio.js";

const fakeTimer = (fn, ms) => { if (!ms) queueMicrotask(fn); return 0; };   // fire delays; capture the 30ms poll
function stubShell() {
  const calls = [];
  return {
    calls,
    has: () => true,
    call: (n, a) => { calls.push({ n, a }); return Promise.resolve(n === "usb.bulk" && (a.ep & 0x80) ? {} : { opened: true }); },
    count: (n) => calls.filter((c) => c.n === n).length,
  };
}

Deno.test("createRadio.attach: concurrent callers share ONE cold bring-up", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const [a, b] = await Promise.all([radio.attach(), radio.attach()]);   // two surfaces attach at once
  assertEquals(a, true); assertEquals(b, true);
  assertEquals(radio.state, "on");
  assertEquals(shell.count("rf.attach"), 1);                            // bring-up ran exactly once
  assertEquals(shell.count("usb.open"), 1);
  radio.stop();
});

Deno.test("createRadio: auto-detaches when the last subscriber leaves", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const offA = radio.onUnits(() => {});
  const offB = radio.onFrames(() => {});
  await radio.attach();
  assertEquals(radio.state, "on");
  offA();
  assertEquals(radio.state, "on");                                      // one subscriber remains
  offB();
  assertEquals(radio.state, "off");                                     // last one gone -> detached
  assertEquals(shell.count("rf.detach"), 1);
});

Deno.test("carrierFromRadio.send injects the beacon on EP5 through the radio", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const carrier = carrierFromRadio(radio, { src: 0x1234abcd, repeats: 2 });
  await carrier.start();
  carrier.send(new Uint8Array([0x6d, 0x63, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]));   // a 14-byte chunk header
  assertEquals(shell.calls.filter((c) => c.n === "usb.bulk" && c.a.ep === 5).length, 2);
  carrier.stop();
  assertEquals(radio.state, "off");                                     // carrier was the only subscriber
});
