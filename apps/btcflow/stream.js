// Потік біткоїна — a live feed of every unconfirmed Bitcoin transaction, over the Blockchain.com
// WebSocket (`op:unconfirmed_sub`). Real WS, no auth. This is a plain `list` + `detail` app: it declares
// search + sort + the drill-down in spec.json and gets them for free; this module is just the live data
// source — it builds each tx row (how much, from/to, fee, size) and pushes the recent set to the runtime.
//
// All strings here are language-neutral (BTC, $, sat/vB, →, addresses) — the runtime supplies the
// localized labels. USD is best-effort from a CORS-friendly price ticker (omitted if it fails).
//
// CI/dev: on localhost we synthesize a live tx stream (a raw WS from a CI IP is nondeterministic), so the
// gate reviews a real, moving feed. Same env-double idea as pulse/crypto.
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const PRICE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const WHALE_BTC = 5;
const CAP = 1000; // retain a deep history so the chart has a stable window (doesn't jump)
const trunc = (a) => (a ? a.slice(0, 10) + "…" + a.slice(-6) : "—");

export function stream(push) {
  let price = isLocal ? 62000 : 0;
  if (!isLocal) {
    const loadPrice = async () => { try { price = +(await (await fetch(PRICE_URL)).json()).price || price; } catch { /* keep last */ } };
    loadPrice(); setInterval(loadPrice, 60000);
  }
  const usd = (btc) => (price ? "$" + Math.round(btc * price).toLocaleString("en-US") : "");
  const rows = [];
  const emit = () => push(rows.slice(0, CAP));

  const add = (x) => {
    const outV = x.out.reduce((s, o) => s + (o.value || 0), 0);
    const inV = x.inputs.reduce((s, i) => s + (i.prev_out?.value || 0), 0);
    const btc = outV / 1e8, feeSat = Math.max(0, inV - outV), size = x.size || 0;
    const feeRate = size ? Math.round(feeSat / size) : 0;
    const to = x.out.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0] || {};
    const from = x.inputs.map((i) => i.prev_out).filter(Boolean).sort((a, b) => (b.value || 0) - (a.value || 0))[0] || {};
    const ins = x.vin_sz ?? x.inputs.length, outs = x.vout_sz ?? x.out.length;
    const u = usd(btc);
    rows.unshift({
      id: x.hash, hash: x.hash, hashShort: trunc(x.hash),
      value: btc, valueStr: btc.toFixed(4) + " BTC", usd: u,
      sub: (u ? u + "  " : "") + "→ " + trunc(to.addr),
      toShort: "→ " + trunc(to.addr),
      fee: feeRate, feeStr: feeRate + " sat/vB", feeFull: (feeSat / 1e8).toFixed(6) + " BTC · " + feeRate + " sat/vB",
      size: size + " B", ins, outs, io: ins + " → " + outs,
      topOut: trunc(to.addr) + " · " + ((to.value || 0) / 1e8).toFixed(4) + " BTC",
      topIn: trunc(from.addr) + " · " + ((from.value || 0) / 1e8).toFixed(4) + " BTC",
      ts: (x.time || Math.floor(Date.now() / 1000)) * 1000,
      whale: btc >= WHALE_BTC, explorerUrl: "https://www.blockchain.com/btc/tx/" + x.hash,
    });
    if (rows.length > CAP + 20) rows.length = CAP + 20;
  };

  if (isLocal) {
    const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");
    const addr = () => "bc1q" + hex(30);
    setInterval(() => {
      const n = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const whale = Math.random() < 0.06;
        const val = Math.round((whale ? 5 + Math.random() * 40 : Math.random() * 0.5) * 1e8);
        const fee = Math.round(Math.random() * 5000);
        const outs = 1 + ((Math.random() * 3) | 0);
        add({ hash: hex(64), time: Math.floor(Date.now() / 1000), size: 200 + ((Math.random() * 400) | 0),
          vin_sz: 1 + ((Math.random() * 4) | 0), vout_sz: outs,
          inputs: [{ prev_out: { addr: addr(), value: val + fee } }],
          out: Array.from({ length: outs }, (_, j) => ({ addr: addr(), value: j === 0 ? val : Math.round(Math.random() * 1e6) })) });
      }
      emit();
    }, 600);
    return;
  }

  let ws, retry, alive = true;
  const connect = () => {
    if (!alive) return;
    ws = new WebSocket("wss://ws.blockchain.info/inv");
    ws.onopen = () => ws.send(JSON.stringify({ op: "unconfirmed_sub" }));
    ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.op === "utx" && d.x) add(d.x); } catch { /* skip */ } };
    ws.onclose = () => { if (alive) retry = setTimeout(connect, 2000); }; // WS has no auto-reconnect
    ws.onerror = () => ws.close();
  };
  connect();
  setInterval(emit, 500);
  addEventListener("pagehide", () => { alive = false; clearTimeout(retry); ws?.close(); });
}
