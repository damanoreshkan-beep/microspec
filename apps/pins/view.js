// apps/pins — get a DIRECT image link out of Pinterest, which is otherwise a four-step archaeology dig.
//
// The whole app exists because a pin page is not a document, it is an app: fetching it yields a shell with
// the board name and nothing else. What answers is Pinterest's own key-less widget API, and — measured —
// it sends `access-control-allow-origin: *`, so the browser calls it directly and this app is backend-less
// apart from ONE hop. See docs/research/pinterest-extraction.md; the parsing lives in /_rt/pinterest.js
// with unit tests, because "which of these four shapes did the user paste" is logic, not markup.
//
// The one hop: a `pin.it` short link resolves through a 302 whose `location` header carries no CORS, so no
// browser may read it. `/feed/pin?code=` on our own edge reads that one header and returns the id.
//
// The direct-link ladder is the product. `/originals/` frequently does not exist and answers with a small
// XML error rather than a 404, so a status code proves nothing — each rung is confirmed by actually
// decoding it (`Image().naturalWidth`). Displaying and downloading i.pinimg needs no CORS; reading its
// pixels would, so nothing here reads pixels.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel, Island } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { parseInput, pinInfoURL, boardPinsURL, readPins, ladder, ratio } from "/_rt/pinterest.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const SAVED = collection("pinsSaved");

const $q = atom("");
const $busy = atom(false);
const $err = atom("");
const $items = atom([]);          // resolved pins (one for a pin, many for a board)
const $kind = atom("");           // "pin" | "board"
const $full = atom({});           // pin id → the confirmed full-size URL
const $owned = atom(new Set());

// A deterministic fixture: the gate has no network, and the shot must show a resolved pin rather than an
// empty field. Same shape the API returns, trimmed by readPins.
const FIXTURE = [{
  id: "1096274734320084795",
  text: "Ground your system in the full guide on UI kit foundations — durations, easing and distance tokens.",
  color: "#e2dfd8",
  src: "https://i.pinimg.com/564x/2c/2d/a6/2c2da69b3a54335fa22daf40833a7f96.jpg",
  w: 564, h: 1010, board: "Clean UX Design", boardUrl: "/u/clean-ux-design/", author: "Nexora",
  link: "", page: "https://www.pinterest.com/pin/1096274734320084795/",
}];

// ── resolving ────────────────────────────────────────────────────────────────────────────────────────
async function resolveShort(code) {
  const r = await fetch(`${VPS_PROXY}/pin?code=${encodeURIComponent(code)}`);
  if (!r.ok) throw new Error("short");
  const j = await r.json();
  if (!j.id) throw new Error("short");
  return j.id;
}

async function grab(raw) {
  if ($busy.get()) return;
  const parsed = parseInput(raw);
  if (parsed.kind === "empty") return;
  if (parsed.kind === "unknown") { $err.set("errUnknown"); return; }

  $busy.set(true); $err.set(""); $items.set([]);
  try {
    if (gate) { $kind.set("pin"); $items.set(FIXTURE); return; }
    let url;
    if (parsed.kind === "board") { $kind.set("board"); url = boardPinsURL(parsed.user, parsed.slug); }
    else {
      const id = parsed.kind === "short" ? await resolveShort(parsed.code) : parsed.id;
      $kind.set("pin"); url = pinInfoURL(id);
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error("fetch");
    const pins = readPins(await r.json());
    if (!pins.length) { $err.set("errEmpty"); return; }
    $items.set(pins);
  } catch (e) {
    $err.set(e && e.message === "short" ? "errShort" : "errFetch");
  } finally { $busy.set(false); }
}

// Walk the ladder and keep the first rung that DECODES. A status code is not evidence here: i.pinimg
// answers a missing /originals/ with a small XML document, which an <img> rejects and a 200 would not.
function confirmFull(pin) {
  if (!pin?.src || gate) return;
  const rungs = ladder(pin.src);
  let i = 0;
  const tryNext = () => {
    if (i >= rungs.length) return;
    const url = rungs[i++];
    const img = new Image();
    img.onload = () => { if (img.naturalWidth > 0) $full.set({ ...$full.get(), [pin.id]: url }); else tryNext(); };
    img.onerror = tryNext;
    img.src = url;
  };
  tryNext();
}

const fullOf = (pin, full) => full[pin.id] || pin.src;

async function loadOwned() {
  try { const all = await SAVED.all(); $owned.set(new Set(all.map((x) => x.id))); } catch { /* */ }
}

// ── the pin card ─────────────────────────────────────────────────────────────────────────────────────
const PinCard = ({ pin, t, full, owned, onSave, onCopy, compact }) => {
  const url = fullOf(pin, full);
  const isFull = !!full[pin.id];
  return html`<${Panel} className="gap-2" data-pin=${pin.id}>
    ${/* The tile reserves its aspect ratio and paints the API's own dominant colour while the image
         decodes — a better skeleton than a shimmer, because it is the average colour of the very image
         being waited for. */""}
    <a href=${url} target="_blank" rel="noopener" data-open-image
      class="block w-full overflow-hidden rounded-[var(--ms-r)]"
      style=${`aspect-ratio:1/${ratio(pin)};background:${pin.color}`}>
      <img src=${pin.src} alt=${pin.text || ""} loading="lazy" class="block w-full h-full object-cover" />
    </a>
    ${pin.text && !compact ? html`<p class="text-sm text-base-content/70 line-clamp-3">${pin.text}</p>` : null}
    ${pin.board && !compact ? html`<div class="font-mono text-[var(--ms-label)] text-base-content/70 truncate">
      ${pin.board}${pin.author ? ` · ${T(t, "byAuthor", { n: pin.author })}` : ""}</div>` : null}
    <div class="flex items-center gap-2">
      <button data-copy class="btn btn-primary btn-sm flex-1 gap-1.5 rounded-2xl" onClick=${() => onCopy(url)}>
        ${Icon("lucide:link", "text-base")}<span class="truncate">${T(t, "copyLink")}</span>
      </button>
      <a data-download href=${url} download target="_blank" rel="noopener"
        class="btn btn-sm btn-circle" aria-label=${T(t, "download")}>${Icon("lucide:download", "text-base")}</a>
      <button data-save aria-pressed=${owned.has(pin.id) ? "true" : "false"} data-haptic=${owned.has(pin.id) ? "bump" : null}
        class=${`btn btn-sm btn-circle ${owned.has(pin.id) ? "btn-primary" : ""}`}
        aria-label=${T(t, owned.has(pin.id) ? "unsave" : "save")} onClick=${() => onSave(pin, url)}>
        ${Icon(owned.has(pin.id) ? "lucide:bookmark-check" : "lucide:bookmark", "text-base")}
      </button>
      <a data-open-pin href=${pin.page} target="_blank" rel="noopener"
        class="btn btn-sm btn-circle btn-ghost" aria-label=${T(t, "openPin")}>${Icon("lucide:external-link", "text-base")}</a>
    </div>
    <div class="font-mono text-[var(--ms-label)] text-base-content/70 truncate" data-fullstate>
      ${isFull ? T(t, "resolution") : T(t, "onlyPreview")}
    </div>
  <//>`;
};

// ── grab ─────────────────────────────────────────────────────────────────────────────────────────────
export function pins({ S, toast }) {
  const t = useStore(S.t);
  const q = useStore($q);
  const busy = useStore($busy);
  const err = useStore($err);
  const items = useStore($items);
  const kind = useStore($kind);
  const full = useStore($full);
  const owned = useStore($owned);

  useEffect(() => {
    loadOwned();
    // A link shared into the app arrives as ?url= — resolve it without the user retyping anything.
    try {
      const u = new URLSearchParams(location.search).get("url");
      if (u) { $q.set(u); grab(u); }
      else if (gate) grab("https://pin.it/4TgG4yGpF");
    } catch { /* */ }
  }, []);

  useEffect(() => { items.forEach(confirmFull); }, [items]);

  const onCopy = async (url) => {
    try { await navigator.clipboard.writeText(url); toast?.(T(t, "copied")); }
    catch { toast?.(url); }
  };
  const onSave = async (pin, url) => {
    const has = owned.has(pin.id);
    try {
      if (has) { await SAVED.del(pin.id); toast?.(T(t, "removed")); }
      else { await SAVED.put(pin.id, { ...pin, full: url, _ts: Date.now() }); toast?.(T(t, "saved")); }
      await loadOwned();
    } catch { /* */ }
  };

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Island} className="flex flex-col gap-2">
      <form class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); grab(q); }}>
        <input id="q" data-q type="url" inputmode="url" autocomplete="off" value=${q}
          aria-label=${T(t, "inputLabel")} placeholder=${T(t, "inputPlaceholder")}
          onInput=${(e) => $q.set(e.target.value)}
          class="input input-bordered flex-1 min-w-0 rounded-2xl" />
        <button id="grab" type="submit" disabled=${busy} class="btn btn-primary rounded-2xl gap-1.5">
          ${Icon(busy ? "lucide:loader" : "lucide:arrow-down-to-line", `text-base ${busy ? "animate-spin" : ""}`)}
          <span class="truncate">${T(t, busy ? "grabbing" : "grab")}</span>
        </button>
      </form>
      ${err ? html`<p role="alert" data-err class="text-error text-sm">${T(t, err)}</p>` : null}
    <//>

    ${items.length === 0 && !err
      ? null
      : kind === "board"
        ? html`<div data-board class="columns-2 gap-[var(--ms-gap)] [&>*]:mb-[var(--ms-gap)] [&>*]:break-inside-avoid">
            ${items.map((p) => html`<${PinCard} key=${p.id} pin=${p} t=${t} full=${full} owned=${owned}
              onSave=${onSave} onCopy=${onCopy} compact />`)}
          </div>`
        : html`<div class="flex flex-col gap-[var(--ms-gap)]">
            ${items.map((p) => html`<${PinCard} key=${p.id} pin=${p} t=${t} full=${full} owned=${owned}
              onSave=${onSave} onCopy=${onCopy} />`)}
          </div>`}
  </div>`;
}

// ── saved ────────────────────────────────────────────────────────────────────────────────────────────
export function pinsSaved({ S, toast }) {
  const t = useStore(S.t);
  const owned = useStore($owned);
  const [list, setList] = useState(null);

  const reload = async () => { try { const all = await SAVED.all(); setList(all.sort((a, b) => (b._ts || 0) - (a._ts || 0))); } catch { setList([]); } };
  useEffect(() => { reload(); loadOwned(); }, []);

  const onCopy = async (url) => { try { await navigator.clipboard.writeText(url); toast?.(T(t, "copied")); } catch { toast?.(url); } };
  const onSave = async (pin) => { try { await SAVED.del(pin.id); toast?.(T(t, "removed")); await reload(); await loadOwned(); } catch { /* */ } };

  if (list && list.length === 0) {
    return html`<${Panel}><span class="text-base-content/70">${T(t, "savedEmpty")}</span><//>`;
  }
  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    ${list ? html`<div class="font-mono text-[var(--ms-label)] text-base-content/70 px-1">${T(t, "savedCount", { n: list.length })}</div>` : null}
    <div data-saved class="columns-2 gap-[var(--ms-gap)] [&>*]:mb-[var(--ms-gap)] [&>*]:break-inside-avoid">
      ${(list || []).map((p) => html`<${PinCard} key=${p.id} pin=${p} t=${t} full=${{ [p.id]: p.full }} owned=${owned}
        onSave=${onSave} onCopy=${onCopy} compact />`)}
    </div>
  </div>`;
}
