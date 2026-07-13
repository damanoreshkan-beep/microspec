// Пульс Вікіпедії — a live view over Wikimedia EventStreams (every edit to every Wikimedia wiki, in
// real time). SSE (server-push) over CORS, no auth. The runtime is request/response; this tool view owns
// the whole streaming lifecycle: open the stream, buffer high-frequency events, and flush stats + feed on
// a steady cadence (never re-render per event — it's hundreds/sec). Auto-reconnect is EventSource's job.
//
// CI/dev: the real stream is nondeterministic (and may be blocked from a CI IP), so on localhost we feed
// a synthetic stream — the gate sees a live, populated view. Same env-double idea as nearby.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const STREAM = "https://stream.wikimedia.org/v2/stream/recentchange";
const WINDOW_MS = 60000; // rolling window for the per-minute rate + ratios

// server_name → short, human wiki code (language for the sister projects; wd/commons/meta for the rest)
function wikiCode(ev) {
  const s = ev.server_name || "";
  if (s === "www.wikidata.org") return "wd";
  if (s === "commons.wikimedia.org") return "commons";
  if (s === "meta.wikimedia.org") return "meta";
  const m = s.match(/^([a-z-]+)\.(wikipedia|wiktionary|wikisource|wikivoyage|wikinews|wikiquote|wikibooks)\.org$/);
  return m ? m[1] : (ev.wiki || s).replace(/wiki$/, "");
}

export function pulse({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [s, setS] = useState({ feed: [], perMin: 0, humanPct: 100, top: [], total: 0, big: null, live: false });
  const [humansOnly, setHumansOnly] = useState(false);
  const buf = useRef([]);        // events since the last flush (arrival order)
  const win = useRef([]);        // { t, bot, code } inside the rolling window (drives the stats)
  const total = useRef(0);       // session counter
  const flag = useRef(false); flag.current = humansOnly; // read latest toggle inside the stream closure

  // stream lifecycle — opened once; the toggle is read via `flag` so we never re-open the connection
  useEffect(() => {
    const onEvent = (ev) => {
      if (ev.type !== "edit" && ev.type !== "new") return;        // content changes only (skip logs)
      if (flag.current && ev.bot) return;
      const code = wikiCode(ev), now = Date.now();
      const delta = (ev.length?.new ?? 0) - (ev.length?.old ?? 0);
      buf.current.push({ id: `${ev.id}-${now}-${buf.current.length}`, title: ev.title || "?", url: ev.title_url || "#", code, user: ev.user || "", bot: !!ev.bot, delta });
      win.current.push({ t: now, bot: !!ev.bot, code });
      total.current++;
    };

    let src, mock;
    if (isLocal) {
      const CODES = ["en", "de", "uk", "fr", "es", "ja", "wd", "commons"];
      const TITLES = ["Kyiv", "Berlin", "Tokyo", "Photosynthesis", "Ukraine", "Music theory", "Q42", "2026"];
      const pick = (a) => a[(Math.random() * a.length) | 0];
      mock = setInterval(() => {
        for (let i = 0; i < 3; i++) {
          const code = pick(CODES);
          onEvent({ type: "edit", title: pick(TITLES), user: "User" + ((Math.random() * 99) | 0), bot: Math.random() < 0.3,
            server_name: code + ".wikipedia.org", title_url: `https://${code}.wikipedia.org/wiki/X`, id: Date.now() + i,
            length: { old: 100, new: 100 + ((Math.random() * 900 - 250) | 0) } });
        }
      }, 250);
    } else {
      src = new EventSource(STREAM);
      src.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* skip malformed */ } };
      src.onopen = () => setS((p) => ({ ...p, live: true }));
      src.onerror = () => setS((p) => ({ ...p, live: false })); // EventSource auto-reconnects
    }

    // steady flush — recompute the rolling stats and prepend buffered edits (never per-event)
    const flush = setInterval(() => {
      const now = Date.now();
      win.current = win.current.filter((e) => now - e.t < WINDOW_MS);
      const w = win.current, bots = w.filter((e) => e.bot).length;
      const freq = {};
      for (const e of w) freq[e.code] = (freq[e.code] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
      const fresh = buf.current.splice(0);
      let big = null;
      for (const it of fresh) if (!big || Math.abs(it.delta) > Math.abs(big.delta)) big = it;
      setS((p) => ({
        feed: [...fresh.reverse(), ...p.feed].slice(0, 30),
        perMin: w.length,
        humanPct: w.length ? Math.round((1 - bots / w.length) * 100) : 100,
        top, total: total.current,
        big: big && (!p.big || Math.abs(big.delta) > Math.abs(p.big.delta)) ? big : p.big,
        live: isLocal ? true : p.live,
      }));
    }, 700);

    return () => { src?.close(); clearInterval(mock); clearInterval(flush); };
  }, []);

  // toggling humans-only clears the accumulated view so the filter reads instantly (session total kept)
  useEffect(() => { buf.current = []; win.current = []; setS((p) => ({ ...p, feed: [], perMin: 0, humanPct: 100, top: [], big: null })); }, [humansOnly]);

  const num = (n) => Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const signed = (d) => (d >= 0 ? "+" : "") + num(d);

  return html`<div class="flex flex-col gap-3">
    <div class="card bg-gradient-to-b from-primary/15 to-base-100 border border-base-300 rounded-2xl"><div class="card-body p-5 items-center text-center gap-1">
      <div class="flex items-center gap-1.5 text-xs text-base-content/70">
        <span class=${`inline-block w-2 h-2 rounded-full ${s.live ? "bg-success animate-pulse" : "bg-base-content/30"}`}></span>${s.live ? T(t, "live") : T(t, "connecting")}
      </div>
      <div id="rate" class="text-6xl font-bold tabular-nums leading-none mt-1 @max-[240px]:text-5xl">${num(s.perMin)}</div>
      <div class="text-sm text-base-content/80">${T(t, "perMin")}</div>
      <div class="w-full mt-3">
        <div class="flex justify-between text-xs mb-1"><span class="flex items-center gap-1">${Icon("lucide:user", "text-primary")}${T(t, "humans")} ${s.humanPct}%</span><span class="flex items-center gap-1 text-base-content/60">${T(t, "bots")} ${100 - s.humanPct}% ${Icon("lucide:bot")}</span></div>
        <div class="h-2 rounded-full bg-base-300 overflow-hidden"><div class="h-full bg-primary transition-all duration-500" style=${`width:${s.humanPct}%`}></div></div>
      </div>
      ${s.top.length ? html`<div class="flex flex-wrap gap-1 justify-center mt-3">${s.top.map((c) => html`<span class="badge badge-ghost gap-1" key=${c}>${Icon("lucide:globe", "text-[0.85em] opacity-70")}${c}</span>`)}</div>` : null}
      <div class="text-xs text-base-content/60 mt-2">${T(t, "total", { n: num(s.total) })}</div>
    </div></div>

    <label class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition"><div class="card-body p-3 px-4 flex-row items-center gap-3">
      ${Icon("lucide:user-round", "text-xl")}<span class="flex-1 font-medium text-sm">${T(t, "humansOnly")}</span>
      <input id="humans-only" type="checkbox" class="toggle toggle-primary toggle-sm" checked=${humansOnly} onChange=${(e) => setHumansOnly(e.target.checked)} />
    </div></label>

    ${s.big ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 px-4 gap-0.5">
      <div class="text-xs text-base-content/60 flex items-center gap-1">${Icon("lucide:flame", "text-primary")}${T(t, "biggest")}</div>
      <div class="flex items-center gap-2"><span class="font-semibold truncate flex-1">${s.big.title}</span><span class=${`font-bold tabular-nums shrink-0 ${s.big.delta >= 0 ? "text-success" : "text-error"}`}>${signed(s.big.delta)}</span></div>
    </div></div>` : null}

    <div class="flex flex-col gap-2" data-feed>
      ${s.feed.length === 0
        ? html`<div class="text-center text-base-content/50 py-10 text-sm flex flex-col items-center gap-2">${Icon("lucide:radio", "text-3xl opacity-40")}${T(t, "waiting")}</div>`
        : s.feed.map((it) => html`<a href=${it.url} target="_blank" rel="noopener" class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition" key=${it.id}><div class="card-body p-3 px-4 flex-row items-center gap-3">
            ${Icon(it.bot ? "lucide:bot" : "lucide:user", "text-lg shrink-0 " + (it.bot ? "text-base-content/40" : "text-primary"))}
            <div class="flex-1 min-w-0"><div class="font-medium truncate">${it.title}</div><div class="text-xs text-base-content/60 truncate">${it.code}${it.user ? " · " + it.user : ""}</div></div>
            <span class=${`text-xs font-semibold tabular-nums shrink-0 ${it.delta >= 0 ? "text-success" : "text-error"}`}>${signed(it.delta)}</span>
          </div></a>`)}
    </div>
  </div>`;
}
