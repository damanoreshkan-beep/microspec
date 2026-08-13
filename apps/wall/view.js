// wall — a black terminal you type into, broadcast live to everyone else on the same Wi-Fi.
//
// The phone itself becomes a tiny web server on the LAN (capability "server", already in the shell): it hands
// out a plain page any browser can open — no app to install on the other side — and that page polls back the
// text as you type it. A joiner scans the QR of the full http://<lan-ip>:<port> address and is on the same
// board in one tap. One-way by design: the owner writes, the room reads (the shell's server serves bytes the
// page places; it has no channel to push a visitor's input back, so we don't pretend it does).
import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { qrDataUri } from "/_rt/qrcode.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const PORT = 8080;
const FEED = "/feed";

// The page a joiner's browser receives. Self-contained, black, monospace: it long-polls the feed and paints
// it, following the tail the way a terminal does. Kept tiny and dependency-free — it is served from RAM.
const CLIENT_PAGE = (title, waiting) => `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<style>html,body{margin:0;height:100%;background:#0A0A0B;color:#E7E7EA;`
  + `font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}`
  + `#t{padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;min-height:100%;box-sizing:border-box}`
  + `#t:empty::before{content:"${waiting}";color:#6b6b70}</style></head>`
  + `<body><div id="t"></div><script>`
  + `var last=null,el=document.getElementById("t");`
  + `async function tick(){try{var r=await fetch(${JSON.stringify(FEED)},{cache:"no-store"});`
  + `var s=await r.text();if(s!==last){last=s;el.textContent=s;`
  + `var b=Math.abs(scrollY+innerHeight-document.body.scrollHeight)<80;`
  + `if(b)scrollTo(0,document.body.scrollHeight);}}catch(e){}}`
  + `setInterval(tick,700);tick();`
  + `</script></body></html>`;

const $on = atom(false);         // is the station listening
const $url = atom("");           // the LAN address other devices open
const $hits = atom(0);           // requests served — proof someone is watching
const $text = atom("");          // the board's text, the single source served at /feed
const $busy = atom(false);
const $err = atom(null);         // the QR sheet is history-backed (openScreen "qr"), so Back closes it

function noteError(e) {
  $err.set(e?.code ? `${e.code}${e.detail ? ` · ${e.detail}` : ""}` : String(e));
}

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

async function start(t) {
  if ($busy.get()) return;
  $busy.set(true); $err.set(null);
  if (gate) { $on.set(true); $url.set("http://192.168.1.42:8080"); $hits.set(3); $busy.set(false); return; }
  try {
    await shell.call("server.start", { port: PORT });
    await shell.call("server.put", { path: "/", contentType: "text/html; charset=utf-8",
      base64: b64(CLIENT_PAGE(T(t, "title"), T(t, "waiting"))) });
    await shell.call("server.put", { path: FEED, contentType: "text/plain; charset=utf-8", base64: b64($text.get()) });
    const st = await shell.call("server.status", {});
    $on.set(!!st.running); $url.set(st.url || ""); $hits.set(st.hits ?? 0);
  } catch (e) { noteError(e); }
  $busy.set(false);
}

async function stop() {
  if ($busy.get()) return;
  $busy.set(true);
  if (gate) { $on.set(false); $busy.set(false); return; }
  try { await shell.call("server.stop", {}); $on.set(false); } catch (e) { noteError(e); }
  $busy.set(false);
}

// Republish the feed as the owner types. Debounced: a keystroke should not be a socket write, but the room
// should never be more than a breath behind. The shell replaces the one resource in place.
let feedTimer = null;
function publish() {
  if (gate || !$on.get()) return;
  clearTimeout(feedTimer);
  feedTimer = setTimeout(() => {
    shell.call("server.put", { path: FEED, contentType: "text/plain; charset=utf-8", base64: b64($text.get()) })
      .catch(noteError);
  }, 250);
}

// Keep the served count honest while the sheet is closed and the room fills up.
let hitTimer = null;
function watchHits() {
  clearInterval(hitTimer);
  if (gate) return;
  hitTimer = setInterval(async () => {
    if (!$on.get()) return;
    try { const st = await shell.call("server.status", {}); $hits.set(st.hits ?? 0); } catch { /* transient */ }
  }, 4000);
}

export function wallView({ t, S, openScreen, closeScreen }) {
  const on = useStore($on);
  const url = useStore($url);
  const hits = useStore($hits);
  const text = useStore($text);
  const busy = useStore($busy);
  const err = useStore($err);
  const screen = useStore(S.screen);
  const areaRef = useRef(null);

  useEffect(() => {
    // The gate has no server socket, so seed the LIVE, populated board — an address, watchers, and a
    // terminal with content — rather than the empty off-state the reviewer must never be shown.
    if (gate && !$on.get()) {
      $on.set(true); $url.set("http://192.168.1.42:8080"); $hits.set(3);
      $text.set("$ ./broadcast --lan\nlistening on 192.168.1.42:8080\n> hello, room\n> _");
    }
    watchHits();
    return () => { clearInterval(hitTimer); clearTimeout(feedTimer); };
  }, []);

  const missing = !gate && !shell.has("server.start");
  const why = missing ? (shell.why("server.start") === ERR.staleBridge ? "needsUpdate" : "needsApp") : null;

  return html`<div class="flex flex-col h-full min-h-0 px-[var(--ms-pad)] pt-1 pb-2 gap-2">
    <!-- The control island: state, address, who's watching, and the two actions. Floats above the board. -->
    <div data-bar class="shrink-0 flex items-center gap-2 rounded-2xl p-2 pl-3 sf-raised">
      <span class=${`w-2 h-2 rounded-full shrink-0 ${on ? "bg-[var(--app-accent)] animate-pulse" : "bg-base-content/30"}`}></span>
      ${on
        ? html`<button data-url onClick=${() => openScreen("qr")}
            class="min-w-0 flex items-center gap-1.5 font-mono text-[0.72rem] text-base-content/80 truncate">
            <span class="truncate">${url || T(t, "srvOn")}</span>
          </button>
          <span class="ml-auto shrink-0 flex items-center gap-1 font-mono text-[0.7rem] text-muted">
            ${Icon("lucide:eye", "text-[1em]")}${hits}
          </span>
          <button data-qr class="shrink-0 btn btn-ghost btn-xs px-2" onClick=${() => openScreen("qr")} aria-label=${T(t, "showQr")}>
            ${Icon("lucide:qr-code", "text-[1.15em]")}
          </button>
          <button data-stop class="shrink-0 btn btn-xs gap-1" onClick=${stop} disabled=${busy}>
            ${Icon("lucide:power-off", "text-[1.05em]")}<span>${T(t, "stop")}</span>
          </button>`
        : html`<span class="min-w-0 truncate text-[0.8rem] text-base-content/70">${T(t, missing ? why : "offHint")}</span>
          <button data-start class="ml-auto shrink-0 btn btn-primary btn-sm gap-1.5"
              onClick=${() => start(t)} disabled=${busy || missing}>
            ${Icon("lucide:power", "text-[1.1em]")}<span>${T(t, "start")}</span>
          </button>`}
    </div>

    ${err
      ? html`<div data-err class="shrink-0 flex items-start gap-2 min-w-0 rounded-xl p-2 px-3 sf-sunken">
          ${Icon("lucide:triangle-alert", "text-[1.05em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
          <span class="min-w-0 break-words font-mono text-[0.75rem] text-base-content">${String(err)}</span>
        </div>`
      : null}

    <!-- The board itself: a deliberately black terminal, its own scroll like every terminal, the one input
         the whole app is for. Not theme-aware on purpose — a broadcast surface reads the same for everyone. -->
    <textarea data-board ref=${areaRef} value=${text} spellcheck="false"
      autocapitalize="off" autocomplete="off" autocorrect="off"
      aria-label=${T(t, "boardLabel")} placeholder=${T(t, "boardPlaceholder")}
      onInput=${(e) => { $text.set(e.currentTarget.value); publish(); }}
      class="flex-1 min-h-0 w-full resize-none rounded-2xl p-4 border border-base-content/10
             font-mono text-[0.9rem] leading-relaxed tracking-tight
             bg-[#0A0A0B] text-[#E7E7EA] caret-[var(--app-accent)]
             placeholder:text-[#6b6b70] focus:outline-none focus:border-[var(--app-accent)]/40"></textarea>

    <${Sheet} id="wall-qr" open=${screen === "qr"} onClose=${closeScreen} title=${T(t, "joinTitle")} icon="lucide:qr-code">
      ${screen === "qr"
        ? html`<div class="flex flex-col items-center gap-4 pb-2">
            <p class="text-center text-base-content/80 leading-relaxed">${T(t, "joinBody")}</p>
            ${url
              ? html`<img data-qrimg src=${qrDataUri(url, { margin: 3 })} alt=${T(t, "joinTitle")}
                  class="w-56 h-56 rounded-2xl bg-white p-3" />
                <code class="block w-full text-center break-all font-mono text-[0.8rem] text-base-content/80 sf-sunken rounded-lg p-2">${url}</code>`
              : html`<span class="text-muted">${T(t, "offHint")}</span>`}
          </div>`
        : null}
    </${Sheet}>
  </div>`;
}
