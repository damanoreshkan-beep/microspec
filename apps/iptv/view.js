// IPTV — browse and watch public live-TV channels from the iptv-org index. This app owns only the
// IPTV-specific parts: the per-country M3U playlist (name + logo + category + stream URL), a country
// picker, a channel grid, search and category filters. Everything about actually PLAYING a stream —
// HLS vs progressive, hls.js, buffering, errors, a11y — lives in the runtime (/_rt/video.js Player), so
// the next video app reuses it. Data source: iptv-org.github.io (CORS *, MIT).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Player } from "/_rt/video.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Curated countries with the most / most-watchable channels (iptv-org country codes, lowercase).
// Country names carry the identity — no flag emoji (banned farm-wide, and unrenderable as a vector in <option>).
const COUNTRIES = [
  ["us", "United States"], ["uk", "United Kingdom"], ["ca", "Canada"], ["ua", "Ukraine"],
  ["pl", "Poland"], ["de", "Germany"], ["fr", "France"], ["es", "Spain"], ["it", "Italy"],
  ["nl", "Netherlands"], ["br", "Brazil"], ["mx", "Mexico"], ["ar", "Argentina"],
  ["in", "India"], ["tr", "Türkiye"], ["jp", "Japan"], ["kr", "South Korea"],
  ["au", "Australia"], ["ae", "UAE"], ["sa", "Saudi Arabia"],
];
const CAP = 120;   // render at most this many tiles; search/filter narrows to reach the rest

const $country = atom("us"), $channels = atom([]), $loading = atom(true), $err = atom(false);
const $cat = atom(""), $query = atom(""), $sel = atom(null);
const cache = new Map();

function parseM3U(text) {
  const lines = text.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim(); if (!l.startsWith("#EXTINF")) continue;
    const logo = (l.match(/tvg-logo="([^"]*)"/) || [])[1] || "";
    const group = ((l.match(/group-title="([^"]*)"/) || [])[1] || "Other").split(";")[0].trim() || "Other";
    const name = l.slice(l.lastIndexOf(",") + 1).replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    let url = ""; for (let j = i + 1; j < lines.length; j++) { const u = lines[j].trim(); if (u && !u.startsWith("#")) { url = u; break; } }
    if (name && url) out.push({ id: String(out.length) + "|" + name, name, logo, group, url });
  }
  return out;
}

async function loadCountry(code) {
  $err.set(false); $cat.set(""); $query.set("");
  if (cache.has(code)) { $channels.set(cache.get(code)); $loading.set(false); return; }
  $loading.set(true);
  try {
    const text = await (await fetch(`https://iptv-org.github.io/iptv/countries/${code}.m3u`)).text();
    const ch = parseM3U(text); cache.set(code, ch); $channels.set(ch);
  } catch { $channels.set([]); $err.set(true); }
  $loading.set(false);
}

const Tile = ({ ch, onPlay }) => html`<button data-ch class="flex flex-col gap-1 min-w-0 active:scale-95 transition-transform" aria-label=${ch.name} onClick=${() => onPlay(ch)}>
  <div class="aspect-video rounded-lg bg-base-300 overflow-hidden relative flex items-center justify-center border border-base-content/10">
    ${Icon("lucide:tv", "text-2xl text-base-content/25 absolute")}
    ${ch.logo ? html`<img src=${ch.logo} alt="" loading="lazy" class="relative w-full h-full object-contain p-1" onError=${(e) => e.currentTarget.remove()} />` : null}
    <span class="absolute bottom-0 right-0 m-1 badge badge-xs bg-base-100/70 border-0">${Icon("lucide:play", "text-[0.6rem]")}</span>
  </div>
  <div class="text-[0.7rem] leading-tight line-clamp-2 text-base-content/90">${ch.name}</div>
</button>`;

export function iptv({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const channels = useStore($channels), loading = useStore($loading), err = useStore($err);
  const cat = useStore($cat), query = useStore($query), sel = useStore($sel), country = useStore($country);
  useEffect(() => { loadCountry(country); }, [country]);

  const cats = [...new Set(channels.map((c) => c.group))].sort();
  const q = query.trim().toLowerCase();
  const filtered = channels.filter((c) => (!cat || c.group === cat) && (!q || c.name.toLowerCase().includes(q)));
  const shown = filtered.slice(0, CAP);
  const play = (ch) => { $sel.set(ch); S.screen.set("play"); };

  return html`<${Fragment}>
    <div class="flex flex-col gap-2.5">
      <div class="@container"><div class="flex items-center gap-2 @max-[300px]:flex-col @max-[300px]:items-stretch">
        <select id="country" aria-label=${T(t, "country")} class="select select-bordered select-sm rounded-2xl w-full @min-[300px]:w-auto @min-[300px]:shrink-0" value=${country} onChange=${(e) => $country.set(e.target.value)}>
          ${COUNTRIES.map(([c, n]) => html`<option value=${c} key=${c}>${n}</option>`)}
        </select>
        <label class="input input-bordered input-sm flex items-center gap-2 rounded-2xl flex-1 min-w-0 w-full">
          ${Icon("lucide:search", "opacity-50")}<input id="ch-search" type="search" aria-label=${T(t, "search")} class="grow min-w-0" placeholder=${T(t, "search")} value=${query} onInput=${(e) => $query.set(e.target.value)} />
        </label>
      </div></div>

      ${cats.length > 1 ? html`<div class="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
        <button class=${`btn btn-xs rounded-full shrink-0 ${cat === "" ? "btn-primary" : "btn-ghost border border-base-300"}`} onClick=${() => $cat.set("")}>${T(t, "allCats")}</button>
        ${cats.map((c) => html`<button key=${c} class=${`btn btn-xs rounded-full shrink-0 ${cat === c ? "btn-primary" : "btn-ghost border border-base-300"}`} onClick=${() => $cat.set(cat === c ? "" : c)}>${c}</button>`)}
      </div>` : null}

      ${loading ? html`<div class="grid grid-cols-3 gap-2.5">${Array.from({ length: 12 }).map((_, i) => html`<div key=${i} class="flex flex-col gap-1"><div class="aspect-video rounded-lg overflow-hidden"><${Pixels} cls="w-full h-full" /></div></div>`)}</div>`
        : err ? html`<div class="flex flex-col items-center gap-2 py-16 text-base-content/60">${Icon("lucide:cloud-off", "text-4xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline rounded-2xl" onClick=${() => loadCountry(country)}>${T(t, "retry")}</button></div>`
        : !filtered.length ? html`<div class="flex flex-col items-center gap-2 py-16 text-base-content/60">${Icon("lucide:tv-minimal", "text-4xl")}<div>${T(t, "noChannels")}</div></div>`
        : html`<${Fragment}>
          <div class="text-xs text-base-content/70 px-0.5">${T(t, "count", { n: filtered.length })}</div>
          <div class="grid grid-cols-3 gap-2.5 @max-[260px]:grid-cols-2">${shown.map((ch) => html`<${Tile} ch=${ch} onPlay=${play} key=${ch.id} />`)}</div>
          ${filtered.length > CAP ? html`<div class="text-center text-xs text-base-content/70 py-2">${T(t, "more", { n: filtered.length - CAP })}</div>` : null}
        </${Fragment}>`}
    </div>

    ${screen === "play" && sel ? html`<${Player} url=${sel.url} title=${sel.name} locale=${loc} onClose=${() => S.screen.set(null)} />` : null}
  </${Fragment}>`;
}
