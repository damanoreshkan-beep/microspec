// meshscan tests — pure rxd/802.11 parse + neighbourhood aggregation, no browser, no adapter. rxd units are
// hand-built the way the RTL8852AU RX path aggregates them (rt=1 PPDU-status carrying RSSI, then rt=0 WIFI frames).
import { assertEquals, assert } from "jsr:@std/assert@1";
import { parseRxUnits, createNeighbourhood } from "../meshscan.js";

const align8 = (n) => (n + 7) & ~7;
// one rxd unit: 16-byte short descriptor (d0 = pktsize | rt<<24) + payload, padded to 8.
function unit(rt, payload) {
  const pkt = payload.length, d0 = (pkt & 0x3fff) | ((rt & 0xf) << 24);   // drvsize 0, shift 0, rxdlen short (bit31=0)
  const size = align8(16 + pkt), u = new Uint8Array(size);
  u[0] = d0 & 0xff; u[1] = (d0 >> 8) & 0xff; u[2] = (d0 >> 16) & 0xff; u[3] = (d0 >>> 24) & 0xff;
  u.set(payload, 16);
  return u;
}
// PPDU-status payload giving a max-path raw of `raw` (usr=0, rxcnt=0, plcp=0 -> phy header at +8, valid bit set).
function ppdu(raw) {
  const p = new Uint8Array(16);            // iw0,iw1 = 0; hw0 bit7=valid; hw1 low byte = raw (path A)
  p[8] = 0x80; p[12] = raw & 0xff;
  return unit(1, p);
}
const MAC = (h) => h.split(":").map((x) => parseInt(x, 16));
// an 802.11 frame: fc, addr2 (transmitter), addr3, optional beacon SSID+channel.
function frame(fc, a2 = "02:00:00:00:00:01", a3 = "02:00:00:00:00:01", ssid = null, channel = null) {
  const hdr = [fc & 0xff, (fc >> 8) & 0xff, 0, 0, ...MAC("ff:ff:ff:ff:ff:ff"), ...MAC(a2), ...MAC(a3), 0, 0];
  let body = [];
  if (ssid != null) {
    body = [...Array(12).fill(0)];                                  // timestamp8 + interval2 + cap2
    const s = [...new TextEncoder().encode(ssid)];
    body.push(0, s.length, ...s);                                   // SSID IE
    if (channel != null) body.push(3, 1, channel);                  // DS param
  }
  return new Uint8Array([...hdr, ...body]);
}
const cat = (...us) => { const t = us.reduce((n, u) => n + u.length, 0), o = new Uint8Array(t); let k = 0; for (const u of us) { o.set(u, k); k += u.length; } return o; };

Deno.test("parseRxUnits: PPDU-status RSSI is applied to the beacon, with SSID and DS channel", () => {
  const beacon = frame(0x0080, "aa:bb:cc:dd:ee:ff", "aa:bb:cc:dd:ee:ff", "HomeRouter", 6);
  const units = parseRxUnits(cat(ppdu(0xa0), unit(0, beacon)));    // raw 0xa0=160 -> (160>>1)-110 = -30 dBm
  assertEquals(units.length, 1);
  const u = units[0];
  assertEquals(u.type, 0); assertEquals(u.subtype, 8);
  assertEquals(u.ssid, "HomeRouter"); assertEquals(u.channel, 6);
  assertEquals(u.a2, "aa:bb:cc:dd:ee:ff");
  assertEquals(u.rssi, -30);
});

Deno.test("parseRxUnits: RSSI persists across frames until the next PPDU-status", () => {
  const units = parseRxUnits(cat(ppdu(0xb4), unit(0, frame(0x0080, "aa:bb:cc:dd:ee:01", "aa:bb:cc:dd:ee:01", "AP", 1)),
                                              unit(0, frame(0x0088, "aa:bb:cc:dd:ee:02"))));   // data frame, same PPDU window
  assertEquals(units.length, 2);
  assertEquals(units[0].rssi, (0xb4 >> 1) - 110);
  assertEquals(units[1].rssi, (0xb4 >> 1) - 110);                   // carried, not reset
});

Deno.test("createNeighbourhood: beacon -> AP; to-DS data -> client; from-DS + broadcast ignored", () => {
  const n = createNeighbourhood();
  const beacon = unit(0, frame(0x0080, "aa:00:00:00:00:01", "aa:00:00:00:00:01", "Net", 11));
  const toDS = unit(0, frame(0x0108, "c0:00:00:00:00:02"));         // data, ToDS=1 -> a2 is a client
  const fromDS = unit(0, frame(0x0208, "aa:00:00:00:00:01"));       // data, FromDS=1 -> a2 is the AP, not a new client
  const probeReq = unit(0, frame(0x0040, "c2:00:00:00:00:03"));     // probe-request -> a2 is a client
  const bcast = unit(0, frame(0x0108, "ff:ff:ff:ff:ff:ff"));        // group address -> not a device
  n.add(parseRxUnits(cat(ppdu(0xa0), beacon, toDS, fromDS, probeReq, bcast)), 1000);
  const list = n.list(1000);
  const ap = list.find((d) => d.mac === "aa:00:00:00:00:01");
  assertEquals(ap.kind, "ap"); assertEquals(ap.ssid, "Net"); assertEquals(ap.channel, 11);
  assertEquals(list.find((d) => d.mac === "c0:00:00:00:00:02").kind, "client");
  assertEquals(list.find((d) => d.mac === "c2:00:00:00:00:03").kind, "client");
  assert(!list.some((d) => d.mac === "ff:ff:ff:ff:ff:ff"));         // broadcast never listed
  assertEquals(list.length, 3);                                     // AP + 2 clients (from-DS added nothing new)
});

Deno.test("createNeighbourhood: RSSI is smoothed, the list is signal-ranked, stale entries prune", () => {
  const n = createNeighbourhood({ ttlMs: 5000, ema: 0.5 });
  const near = unit(0, frame(0x0080, "aa:00:00:00:00:aa", "aa:00:00:00:00:aa", "Near", 6));
  const far = unit(0, frame(0x0080, "ba:00:00:00:00:ba", "ba:00:00:00:00:ba", "Far", 6));
  n.add(parseRxUnits(cat(ppdu(0xa0), near)), 1000);                 // near -30
  n.add(parseRxUnits(cat(ppdu(0x50), far)), 1000);                  // far  -70
  n.add(parseRxUnits(cat(ppdu(0x80), near)), 2000);                 // near again -46 -> EMA(-30,-46,.5) = -38
  let list = n.list(2000);
  assertEquals(list[0].mac, "aa:00:00:00:00:aa");                   // stronger first
  assertEquals(list[0].rssi, -38);
  assertEquals(list[1].mac, "ba:00:00:00:00:ba");
  list = n.list(9000);                                              // far last seen 1000 -> pruned at ttl 5000; near seen 2000 -> pruned too
  assertEquals(list.length, 0);
});
