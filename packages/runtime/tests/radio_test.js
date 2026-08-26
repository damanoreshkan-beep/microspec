import { assertEquals, assert } from "jsr:@std/assert@1";
import { createRadio, carrierFromRadio } from "../radio.js";

const fakeTimer = (fn, ms) => { if (!ms) queueMicrotask(fn); return 0; };   
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };   
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
  const [a, b] = await Promise.all([radio.attach(), radio.attach()]);
  assertEquals(a, true); assertEquals(b, true);
  assertEquals(radio.state, "on");
  assertEquals(shell.count("rf.attach"), 1);
  assertEquals(shell.count("usb.open"), 1);
  radio.stop();
});

Deno.test("createRadio: USB ops never overlap on the one connection", async () => {
  let inflight = 0, peak = 0;
  const shell = { has: () => true, call: (n) => {
    inflight++; peak = Math.max(peak, inflight);
    return new Promise((res) => queueMicrotask(() => { inflight--; res(n === "usb.control" ? { data: "01000000" } : { opened: true }); }));
  } };
  const radio = createRadio({ shell, setTimer: fakeTimer });
  await radio.attach();
  await Promise.all([radio.readReg(0x1e0), radio.readReg(0xf0), radio.readReg(0x88), radio.readReg(0xf0)]);
  radio.send("abcd");
  await flush();
  assertEquals(peak, 1);                                          
  radio.stop();
});

Deno.test("createRadio: a tab switch (subscribers leave) does NOT detach the adapter", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const offA = radio.onUnits(() => {});
  const offB = radio.onFrames(() => {});
  await radio.attach();
  offA(); offB();                                                
  assertEquals(radio.state, "on");                               
  assertEquals(shell.count("rf.detach"), 0);
  radio.stop();                                                  
  assertEquals(radio.state, "off");
});

Deno.test("carrierFromRadio.send defaults to ONE inject — the mesh session owns repeats, not the carrier", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const carrier = carrierFromRadio(radio, { src: 0x1234abcd });   
  await carrier.start();
  carrier.send(new Uint8Array([0x6d, 0x63, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]));
  await flush();
  const batch = shell.calls.filter((c) => c.n === "usb.batch");
  assertEquals(batch.length, 1);                                 
  assertEquals(batch[0].a.ops.length, 1);                        
  assertEquals(shell.calls.filter((c) => c.n === "usb.bulk" && c.a.ep === 5).length, 0);   
  carrier.stop(); radio.stop();
});

Deno.test("carrierFromRadio.send coalesces a burst into one usb.batch of EP5 bulk-OUT ops", async () => {
  const shell = stubShell();
  const radio = createRadio({ shell, setTimer: fakeTimer });
  const carrier = carrierFromRadio(radio, { src: 0x1234abcd, repeats: 2 });
  await carrier.start();
  carrier.send(new Uint8Array([0x6d, 0x63, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]));
  await flush();
  const batch = shell.calls.filter((c) => c.n === "usb.batch");
  assertEquals(batch.length, 1);                                 
  assertEquals(batch[0].a.ops.length, 2);
  assert(batch[0].a.ops.every((o) => o.t === "b" && o.ep === 5));  
  carrier.stop();
  assertEquals(radio.state, "on");                               
  radio.stop();
});
