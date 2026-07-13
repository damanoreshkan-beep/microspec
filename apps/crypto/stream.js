const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const PAIRS = [
  ["BTCUSDT", "BTC", "Bitcoin", 62000], ["ETHUSDT", "ETH", "Ethereum", 1770], ["SOLUSDT", "SOL", "Solana", 76],
  ["XRPUSDT", "XRP", "XRP", 1.08], ["BNBUSDT", "BNB", "BNB", 560], ["DOGEUSDT", "DOGE", "Dogecoin", 0.07],
  ["ADAUSDT", "ADA", "Cardano", 0.35], ["AVAXUSDT", "AVAX", "Avalanche", 22], ["LINKUSDT", "LINK", "Chainlink", 11],
  ["DOTUSDT", "DOT", "Polkadot", 4], ["TRXUSDT", "TRX", "TRON", 0.24], ["LTCUSDT", "LTC", "Litecoin", 65],
  ["TONUSDT", "TON", "Toncoin", 3.2], ["NEARUSDT", "NEAR", "NEAR", 2.5], ["ATOMUSDT", "ATOM", "Cosmos", 4.2],
  ["UNIUSDT", "UNI", "Uniswap", 7], ["XLMUSDT", "XLM", "Stellar", 0.1], ["ARBUSDT", "ARB", "Arbitrum", 0.35],
];
const META = Object.fromEntries(PAIRS.map(([s, b, n]) => [s, { base: b, name: n }]));

const price = (p) => { p = +p; const d = p >= 1 ? 2 : p >= 0.01 ? 4 : 6; return "$" + p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const row = (s, p, chg, vol) => ({ id: s, base: META[s].base, name: META[s].name, price: price(p), chg: Math.round(chg * 100) / 100, vol: Math.round(vol / 1e6) });

export function stream(push) {
  const rows = {};
  const emit = () => push(Object.values(rows));

  if (isLocal) {
    const st = {};
    PAIRS.forEach(([s, , , seed]) => (st[s] = { p: seed, chg: Math.random() * 8 - 4 }));
    setInterval(() => {
      for (const [s] of PAIRS) { const o = st[s]; o.p *= 1 + (Math.random() * 0.006 - 0.003); o.chg += Math.random() * 0.4 - 0.2; rows[s] = row(s, o.p, o.chg, Math.random() * 2e9); }
      emit();
    }, 500);
    return;
  }

  let ws, retry, alive = true;
  const url = "wss://stream.binance.com:9443/stream?streams=" + PAIRS.map(([s]) => s.toLowerCase() + "@ticker").join("/");
  const connect = () => {
    if (!alive) return;
    ws = new WebSocket(url);
    ws.onmessage = (e) => { try { const d = JSON.parse(e.data).data; if (d?.s && META[d.s]) rows[d.s] = row(d.s, d.c, d.P, d.q); } catch {  } };
    ws.onclose = () => { if (alive) retry = setTimeout(connect, 2000); }; 
    ws.onerror = () => ws.close();
  };
  connect();
  setInterval(emit, 400); 
  addEventListener("pagehide", () => { alive = false; clearTimeout(retry); ws?.close(); });
}
