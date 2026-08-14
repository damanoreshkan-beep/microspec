// wall — one phrase, filling every screen in the room.
//
// The phone becomes a station on the Wi-Fi (capability "server") and hands out ONE page: a black poster
// that shows the phrase at the largest size that still fits, and re-polls a tiny /feed as the owner types.
// The owner's screen IS that poster, so what you type is what the room already sees.
//
// Two facts from apps/wall/RESEARCH.md decide the shape of this file:
//   · The station serves one connection at a time with a 5s socket timeout, so the room polls (no SSE, no
//     long-poll) and every served resource stays small.
//   · `hits` counts REQUESTS. At a 700ms poll one viewer makes ~86 a minute, so the head count is derived
//     from the request RATE (/_rt/audience.js), never printed raw.
import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Sheet, Island } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { qrDataUri } from "/_rt/qrcode.js";
import { fitText, fitTextSource, FIT_CSS } from "/_rt/fittext.js";
import { makeAudience } from "/_rt/audience.js";
import { wakeLock } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const PORT = 8080;          // memorable enough to type by hand; port 0 is the fallback when it is taken
const FEED = "/feed";
const POLL_MS = 700;        // the room's poll period — the constant the audience estimate is derived from
const STATUS_MS = 4000;
const PUBLISH_MS = 200;

// The page the room receives. Self-contained by necessity: it is served off a socket on a phone, with no
// network behind it, so no font, no CDN, no import. It inlines fitText's own source (the one algorithm,
// shared with the preview below) rather than keeping a second copy that could drift.
const VIEWER_PAGE = (title) => `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
  + `<title>${title}</title><style>`
  + `html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden;-webkit-text-size-adjust:none}`
  + `#s{position:fixed;inset:4vmin;display:flex;align-items:center;justify-content:center}`
  + `#t{width:100%;text-align:center;font-family:system-ui,-apple-system,sans-serif;font-weight:700;`
  + `letter-spacing:-0.02em;${FIT_CSS}}</style></head>`
  + `<body><div id="s"><div id="t"></div></div><script>${fitTextSource()}`
  + `var s=document.getElementById("s"),t=document.getElementById("t"),last=null,q=0;`
  + `function fit(){if(q)return;q=1;requestAnimationFrame(function(){q=0;fitText(t,s)})}`
  + `function paint(v){if(v===last)return;last=v;t.textContent=v;fit()}`
  + `function tick(){fetch(${JSON.stringify(FEED)},{cache:"no-store"})`
  + `.then(function(r){return r.text()}).then(paint).catch(function(){})}`
  + `setInterval(tick,${POLL_MS});tick();addEventListener("resize",fit);`
  // Wake Lock is [SecureContext] and this page is plain http on a private IP, so the screen will sleep on
  // the room's own timeout and nothing here can stop it. Fullscreen carries no such annotation: one tap
  // drops the URL bar and gives the poster the whole panel, which is the only lever that survives.
  + `addEventListener("click",function(){var e=document.documentElement;`
  + `if(!document.fullscreenElement&&e.requestFullscreen)e.requestFullscreen().catch(function(){})});`
  + `</script></body></html>`;

// btoa takes a binary string: Cyrillic must be UTF-8 bytes first. Measured in V8: a single spread of
// 130,000 bytes throws RangeError, so the fallback chunks. toBase64() is the standard path where it exists.
const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const $on = atom(false);
const $url = atom("");
const $text = atom("");
const $viewers = atom(null);
const $busy = atom(false);
const $err = atom(null);

const audience = makeAudience(POLL_MS);

function noteError(e) {
  $err.set(e?.code === ERR.unavailable ? "noWifi" : "failed");
}

async function publishNow() {
  if (gate || !$on.get()) return;
  await shell.call("server.put", {
    path: FEED, contentType: "text/plain; charset=utf-8", base64: b64($text.get()),
  }).catch(noteError);
}

let pubTimer = null;
function publish() {
  clearTimeout(pubTimer);
  pubTimer = setTimeout(publishNow, PUBLISH_MS);
}

async function start(t) {
  if ($busy.get()) return;
  $busy.set(true); $err.set(null);
  if (gate) { $on.set(true); $url.set("http://192.168.1.42:8080/"); $viewers.set(3); $busy.set(false); return; }
  try {
    let st;
    // A busy 8080 throws BindException out of `new ServerSocket(want)` — the schema's "0 lets the OS
    // choose" is the retry, and the address goes into the QR anyway so the number never has to be typed.
    try { st = await shell.call("server.start", { port: PORT }); }
    catch { st = await shell.call("server.start", { port: 0 }); }
    await shell.call("server.put", {
      path: "/", contentType: "text/html; charset=utf-8", base64: b64(VIEWER_PAGE(T(t, "title"))),
    });
    $on.set(!!st.running);
    $url.set(st.url || "");
    audience.reset();
    $viewers.set(null);
    await publishNow();
    if (!st.url) $err.set("noWifi");
    wakeLock.acquire?.();
  } catch (e) { noteError(e); }
  $busy.set(false);
}

async function stop() {
  if ($busy.get()) return;
  $busy.set(true);
  if (!gate) { try { await shell.call("server.stop", {}); } catch (e) { noteError(e); } }
  $on.set(false); $viewers.set(null); audience.reset();
  wakeLock.release?.();
  $busy.set(false);
}

export function wallView({ t, S, openScreen, closeScreen }) {
  const on = useStore($on);
  const url = useStore($url);
  const text = useStore($text);
  const viewers = useStore($viewers);
  const busy = useStore($busy);
  const err = useStore($err);
  const screen = useStore(S.screen);
  const boxRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    // The gate has no socket, so seed the LIVE screen — an address, an audience and a phrase on the wall.
    // A reviewer must never be handed the off-state; the populated screen is the one that can be wrong.
    if (gate && !$on.get()) {
      $on.set(true); $url.set("http://192.168.1.42:8080/"); $viewers.set(3);
      $text.set("Починаємо за 5 хвилин");
    }
    let timer = null;
    if (!gate) {
      timer = setInterval(async () => {
        if (!$on.get()) return;
        try {
          const st = await shell.call("server.status", {});
          $on.set(!!st.running);
          if (st.url) $url.set(st.url);
          $viewers.set(audience.push(st.hits ?? 0, Date.now()));
        } catch { /* a transient bridge failure is not a state change */ }
      }, STATUS_MS);
    }
    return () => { clearInterval(timer); clearTimeout(pubTimer); };
  }, []);

  // The preview is the poster: same algorithm, same wrap contract, so the owner is looking at the room's
  // screen rather than at an approximation of it.
  useLayoutEffect(() => {
    const el = textRef.current, box = boxRef.current;
    if (!el || !box) return;
    fitText(el, box);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fitText(el, box));
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  const missing = !gate && !shell.has("server.start");
  const why = missing ? (shell.why("server.start") === ERR.staleBridge ? "needsUpdate" : "needsApp") : null;

  return html`<div class="flex flex-col h-full min-h-0 gap-[var(--ms-gap)] px-[var(--ms-pad)] pb-[var(--ms-pad)]">
    <${Island} className="shrink-0 flex items-center gap-2 px-3 py-2">
      <span class=${`w-2 h-2 rounded-full shrink-0 ${on ? "bg-[var(--app-accent)] animate-pulse" : "bg-base-content/30"}`}></span>
      ${on
        ? html`<button data-url onClick=${() => openScreen("qr")}
              class="min-w-0 flex-1 text-left font-mono text-[var(--ms-label)] text-base-content/80 truncate">
              ${url || T(t, "live")}
            </button>
            ${viewers != null
              ? html`<span data-viewers title=${T(t, "viewers")}
                  class="shrink-0 flex items-center gap-1 font-mono text-[var(--ms-label)] text-base-content/70">
                  ${Icon("lucide:eye", "text-[1em]")}${viewers}
                </span>`
              : null}
            <button data-qr class="shrink-0 btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "showQr")}
              onClick=${() => openScreen("qr")}>${Icon("lucide:qr-code", "text-[1.15em]")}</button>
            <button data-stop class="shrink-0 btn btn-sm" onClick=${stop} disabled=${busy}>${T(t, "stop")}</button>`
        : html`<span class="min-w-0 flex-1 truncate text-[var(--ms-label)] text-base-content/70">
              ${missing ? T(t, why) : err ? T(t, err) : ""}
            </span>
            <button data-start class="shrink-0 btn btn-primary btn-sm gap-1.5" onClick=${() => start(t)}
              disabled=${busy || missing}>
              ${Icon("lucide:megaphone", "text-[1.1em]")}<span>${T(t, "start")}</span>
            </button>`}
    <//>

    <!-- The room's screen, at desk size. Fixed black on purpose: this is a window onto other people's
         displays, not a farm surface, and it must read the same whatever theme the owner runs. -->
    <div class="flex-1 min-h-0 rounded-[var(--ms-r)] bg-[#0A0A0B] border border-base-content/10
                overflow-hidden p-[var(--ms-pad)]">
      <div ref=${boxRef} class="w-full h-full flex items-center justify-center">
        <span data-poster ref=${textRef} aria-label=${T(t, "posterLabel")}
          class="w-full text-center font-bold text-white" style=${FIT_CSS}>${text}</span>
      </div>
    </div>

    <textarea data-phrase rows="2" value=${text} spellcheck="false"
      aria-label=${T(t, "phraseLabel")} placeholder=${T(t, "phrasePlaceholder")}
      onInput=${(e) => { $text.set(e.currentTarget.value); publish(); }}
      class="shrink-0 w-full resize-none rounded-[var(--ms-r)] p-3 sf-inset bg-base-100 text-base-content
             text-[0.95rem] leading-snug focus:outline-none placeholder:text-base-content/50"></textarea>

    <${Sheet} id="wall-qr" open=${screen === "qr"} onClose=${closeScreen}
      title=${T(t, "joinTitle")} icon="lucide:qr-code">
      ${screen === "qr"
        ? html`<div class="flex flex-col items-center gap-[var(--ms-gap)] pb-2">
            ${url
              ? html`<img data-qrimg src=${qrDataUri(url, { margin: 3 })} alt=${T(t, "joinTitle")}
                    class="w-56 h-56 max-w-full rounded-[var(--ms-r-in)] bg-white p-3" />
                  <code class="block w-full text-center break-all font-mono text-[var(--ms-label)]
                    text-base-content/80 sf-inset rounded-[var(--ms-r-in)] p-2">${url}</code>`
              : html`<span class="text-base-content/70">${T(t, "noWifi")}</span>`}
          </div>`
        : null}
    <//>
  </div>`;
}
