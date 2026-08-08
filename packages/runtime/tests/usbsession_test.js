// microspec runtime — usbsession unit tests. The whole point of injecting `spawn`/`requestDevice` is that
// this lifecycle is testable with no browser, no WebUSB and no Worker — on a device that may never run one.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createUsbSession, TERMINATE_GRACE_MS } from "../usbsession.js";

// A minimal atom, so the test also proves the module needs no nanostores at all.
const testAtom = (v) => { let cur = v; return { get: () => cur, set: (n) => { cur = n; } }; };

// A Worker stand-in that records everything done to it.
function fakeWorker() {
  const w = {
    posted: [], terminated: false, onmessage: null,
    postMessage: (m) => w.posted.push(m),
    terminate: () => { w.terminated = true; },
  };
  return w;
}

// Deterministic timers: the 400ms grace is a real delay in a browser and must never be one in a test.
function fakeClock() {
  const q = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { q.set(++id, { fn, ms }); return id; },
    clearTimer: (t) => q.delete(t),
    run: () => { for (const [k, v] of [...q]) { q.delete(k); v.fn(); } },
    pending: () => q.size,
  };
}

const harness = (opts = {}) => {
  const clock = fakeClock();
  const workers = [];
  const s = createUsbSession({
    atom: testAtom,
    spawn: () => { const w = fakeWorker(); workers.push(w); return w; },
    supported: () => true,
    requestDevice: () => Promise.resolve({ name: "hackrf" }),
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    ...opts,
  });
  return { s, workers, clock };
};

Deno.test("connect: no WebUSB → usbOk false, no worker", async () => {
  const { s, workers } = harness({ supported: () => false });
  assertEquals(await s.connect(), false);
  assertEquals(s.$usbOk.get(), false);
  assertEquals(s.$connected.get(), false);
  assertEquals(workers.length, 0);
});

Deno.test("connect: a DISMISSED picker is not a fault", async () => {
  // The distinction that matters: a rejected requestDevice means "not now", not "your browser cannot do
  // this". Flipping usbOk here would show an unsupported-browser message for a dialog the user dismissed.
  const { s, workers } = harness({ requestDevice: () => Promise.reject(new Error("cancelled")) });
  assertEquals(await s.connect(), false);
  assertEquals(s.$usbOk.get(), true, "a dismissed picker must not claim the browser is unsupported");
  assertEquals(s.$connected.get(), false);
  assertEquals(workers.length, 0);
});

Deno.test("connect: a null device is refused too", async () => {
  const { s, workers } = harness({ requestDevice: () => Promise.resolve(null) });
  assertEquals(await s.connect(), false);
  assertEquals(s.$connected.get(), false);
  assertEquals(workers.length, 0);
});

Deno.test("connect: spawns the worker and posts the app's start message", async () => {
  const { s, workers } = harness({ start: () => ({ type: "start", band: "gsm900" }) });
  assertEquals(await s.connect(), true);
  assertEquals(s.$connected.get(), true);
  assertEquals(s.$usbOk.get(), true);
  assertEquals(workers.length, 1);
  assertEquals(workers[0].posted, [{ type: "start", band: "gsm900" }]);
  assert(s.running());
});

Deno.test("onOpen runs after the grant and BEFORE the worker exists", async () => {
  const order = [];
  const { s } = harness({
    requestDevice: async () => { order.push("granted"); return { name: "hackrf" }; },
    onOpen: () => order.push("open"),
    spawn: () => { order.push("spawn"); return fakeWorker(); },
  });
  await s.connect();
  assertEquals(order, ["granted", "open", "spawn"]);
});

Deno.test("onOpen does NOT run when the picker is dismissed", async () => {
  let opened = 0;
  const { s } = harness({ requestDevice: () => Promise.reject(new Error("x")), onOpen: () => opened++ });
  await s.connect();
  assertEquals(opened, 0, "building an AudioContext for a cancelled picker is waste the user can hear");
});

Deno.test("a start() returning null posts nothing", async () => {
  const { s, workers } = harness({ start: () => null });
  await s.connect();
  assertEquals(workers[0].posted, []);
});

Deno.test("app messages route to onMessage; {type:'error'} does not", async () => {
  const seen = [];
  const { s, workers } = harness({ onMessage: (m) => seen.push(m) });
  await s.connect();
  workers[0].onmessage({ data: { type: "sweep", frac: 1 } });
  assertEquals(seen, [{ type: "sweep", frac: 1 }]);

  workers[0].onmessage({ data: { type: "error" } });
  assertEquals(seen.length, 1, "the error message is the runtime's, not the app's");
  assertEquals(s.$usbOk.get(), false);
  assertEquals(s.$connected.get(), false, "a worker fault disconnects");
});

Deno.test("a message with no data is ignored rather than thrown on", async () => {
  const { s, workers } = harness();
  await s.connect();
  workers[0].onmessage({});
  workers[0].onmessage({ data: null });
  assert(s.running());
});

Deno.test("disconnect: stops, resets, and terminates only after the grace period", async () => {
  let resets = 0;
  const { s, workers, clock } = harness({ reset: () => resets++ });
  await s.connect();
  const w = workers[0];

  s.disconnect();
  assertEquals(w.posted.at(-1), { type: "stop" }, "the worker is asked to close the interface itself");
  assertEquals(w.terminated, false, "terminating immediately leaves the device claimed");
  assertEquals(s.$connected.get(), false);
  assertEquals(resets, 1);
  assertEquals(s.running(), false);

  clock.run();
  assertEquals(w.terminated, true);
});

Deno.test("the worker handle is cleared BEFORE terminate, so a late message cannot re-enter", async () => {
  const seen = [];
  const { s, workers } = harness({ onMessage: (m) => seen.push(m) });
  await s.connect();
  const w = workers[0];
  s.disconnect();
  // the worker is still alive during the grace window and may still post
  w.onmessage({ data: { type: "sweep" } });
  assertEquals(s.running(), false);
  assertEquals(seen, [{ type: "sweep" }], "routing still works, but the session is not 'running'");
});

Deno.test("post: no-op on a dead worker instead of throwing", async () => {
  const { s, workers } = harness();
  assertEquals(s.post({ type: "gain" }), false, "before connect");
  await s.connect();
  assertEquals(s.post({ type: "gain", lna: 24 }), true);
  assertEquals(workers[0].posted.at(-1), { type: "gain", lna: 24 });
  s.disconnect();
  assertEquals(s.post({ type: "gain" }), false, "after disconnect");
});

Deno.test("restart is gated on the WORKER, not on the connected atom", async () => {
  // The regression this pins: a headless gate seeds $connected true so the populated screen renders. If
  // restart() trusted that, a preset change would spawn a real Worker under the gate, which reaches for
  // USB, errors, and disconnects the session — taking the seeded fixture off screen. CI found it; this
  // keeps it found.
  const { s, workers } = harness();
  s.$connected.set(true);                       // exactly what an app's gate fixture does
  assertEquals(s.restart(), false, "restart must not spawn a worker just because the atom says connected");
  assertEquals(workers.length, 0);
});

Deno.test("restart: new worker, same session; refused when not connected", async () => {
  let band = "gsm900";
  const { s, workers } = harness({ start: () => ({ type: "start", band }) });
  assertEquals(s.restart(), false, "nothing to restart before connect");
  await s.connect();
  band = "dcs1800";
  assertEquals(s.restart(), true);
  assertEquals(workers.length, 2);
  assertEquals(workers[1].posted, [{ type: "start", band: "dcs1800" }]);
  assertEquals(workers[0].posted.at(-1), { type: "stop" }, "the previous worker is stopped, not leaked");
  assertEquals(s.$connected.get(), true, "restart keeps the USB session");
});

Deno.test("the grace period is the farm-wide 400ms, not re-guessed per app", () => {
  assertEquals(TERMINATE_GRACE_MS, 400);
});
