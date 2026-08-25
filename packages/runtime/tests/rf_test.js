// microspec runtime — rf carrier tests. Pure builders/parsers + a stub-shell carrier. No browser, no shell.
import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildTxPacket, extractChunk, parseRxFrames, bssidFor, createRfCarrier } from "../rf.js";
import { encodeChunk, decodeChunk, textBytes, bytesText, roomId } from "../meshchat.js";

const fromHex = (h) => { const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };
// wrap an 802.11 frame in a minimal RX descriptor (rxd_short 16B, drvsize 0, shift 0, rt 0)
const rxdWrap = (frame) => { const d0 = frame.length; const o = new Uint8Array(16 + frame.length); o[0] = d0 & 0xff; o[1] = (d0 >> 8) & 0xff; o[2] = (d0 >> 16) & 0xff; o[3] = (d0 >> 24) & 0xff; o.set(frame, 16); return o; };
const chunkOf = (text) => encodeChunk({ room: roomId("air"), src: 0xa1b2c3d4, msgId: 1, frag: 0, total: 1, flags: 0, payload: textBytes(text) });

Deno.test("buildTxPacket: txdesc pktsize matches the frame, and the frame carries a decodable chunk", () => {
  const chunk = chunkOf("hello over the air");
  const pkt = buildTxPacket(chunk, 0x00c0ffee);
  const frame = pkt.subarray(48);
  assertEquals(pkt[8] | (pkt[9] << 8), frame.length);        // txdesc word2 low16 == frame length
  assertEquals([...frame.subarray(0, 2)], [0x80, 0x00]);      // beacon fc
  assertEquals([...frame.subarray(10, 16)], bssidFor(0x00c0ffee)); // SA = derived BSSID
  const got = extractChunk(frame);
  assert(got);
  const d = decodeChunk(got);
  assertEquals(bytesText(d.payload), "hello over the air");
});

Deno.test("parseRxFrames strips the rxd and returns the WIFI frame", () => {
  const frame = buildTxPacket(chunkOf("x".repeat(40)), 0x11).subarray(48);
  const frames = parseRxFrames(rxdWrap(frame));
  assertEquals(frames.length, 1);
  assertEquals([...frames[0]], [...frame]);
});

Deno.test("full RX path: rxd -> frame -> vendor IE -> chunk -> message", () => {
  const msg = "trail forks at the saddle — going north 🧭";
  const frame = buildTxPacket(chunkOf(msg), 0x77).subarray(48);
  const [f] = parseRxFrames(rxdWrap(frame));
  const chunk = extractChunk(f);
  assert(chunk);
  assertEquals(bytesText(decodeChunk(chunk).payload), msg);
});

Deno.test("parseRxFrames ignores non-WIFI (rt!=0) units", () => {
  const csi = new Uint8Array(28); csi[0] = 0x0c; csi[3] = 0x0a;   // d0 -> rt=0xA (CSI), pktsize=0x0c
  assertEquals(parseRxFrames(csi).length, 0);
});

// fire only the delay() (ms=0) as a microtask; capture the loop's 30ms poll so no real timer leaks the test.
const fakeTimer = (fn, ms) => { if (!ms) queueMicrotask(fn); return 0; };

Deno.test("createRfCarrier.start: cold storage adapter -> switch -> wifi -> attach, in order", async () => {
  const calls = [];
  let wifiUp = false;                                          // wifi personality appears only after the switch
  const shell = { has: () => true, call: (n, a) => {
    calls.push(n + (a && a.pid ? ":" + a.pid.toString(16) : ""));
    if (n === "usb.open") return (a.pid === 0x1997 && !wifiUp) ? Promise.reject(new Error("unavailable")) : Promise.resolve({ opened: true });
    if (n === "usb.switch") { wifiUp = true; return Promise.resolve({ switched: true }); }
    return Promise.resolve({});                                // rf.attach / usb.bulk
  } };
  const c = createRfCarrier({ shell, switchWaitMs: 0, setTimer: fakeTimer });
  await c.start(); c.stop();
  const flow = calls.filter((x) => x.startsWith("usb.open") || x.startsWith("usb.switch") || x === "rf.attach");
  assertEquals(flow.slice(0, 4), ["usb.open:1997", "usb.open:1a2b", "usb.switch:1a2b", "usb.open:1997"]);
  assert(calls.includes("rf.attach"));                         // brings up only after the wifi device is open
});

Deno.test("createRfCarrier.start: adapter already in Wi-Fi mode -> attach without a switch", async () => {
  const calls = [];
  const shell = { has: () => true, call: (n) => { calls.push(n); return Promise.resolve({ opened: true }); } };
  const c = createRfCarrier({ shell, setTimer: fakeTimer });
  await c.start(); c.stop();
  assertEquals(calls.filter((x) => x === "usb.switch").length, 0);
  assert(calls.indexOf("rf.attach") > calls.indexOf("usb.open"));
});

Deno.test("createRfCarrier: send injects the beacon on EP5, repeated", () => {
  const calls = [];
  const shell = { call: (n, a) => { calls.push({ n, a }); return Promise.resolve({}); }, has: () => true };
  const c = createRfCarrier({ shell, src: 0x1234abcd, repeats: 2 });
  c.send(chunkOf("copy that"));
  const ep5 = calls.filter((x) => x.n === "usb.bulk" && x.a.ep === 5);
  assertEquals(ep5.length, 2);                                 // repeated for the ACK-less medium
  const frame = fromHex(ep5[0].a.data).subarray(48);
  assertEquals(bytesText(decodeChunk(extractChunk(frame)).payload), "copy that");
});
