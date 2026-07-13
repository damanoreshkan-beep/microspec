// Глобус — the explore consumer of the systemic /_rt/globe.js component: spin the Earth, tap or search a
// country, read its facts (bundled facts.json, offline). The globe itself (drag/spin/tap/geo) is runtime,
// so the same component powers the sun compass's "pick a location" screen.
import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import facts from "./facts.json" with { type: "json" };

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LIST = Object.entries(facts).map(([id, f]) => ({ id, ...f }));

export function globe({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [sel, setSel] = useState(null);      // selected ccn3
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(null);  // {lat,lon} to fly to
  const f = sel ? facts[sel] : null;
  const ql = q.trim().toLowerCase();
  const matches = ql ? LIST.filter((c) => c.n.toLowerCase().includes(ql) || (c.nUk || "").toLowerCase().includes(ql)).slice(0, 6) : [];

  const pick = ({ id }) => { if (id && facts[id]) { setSel(id); setQ(""); } };                 // tap on the globe
  const choose = (c) => { setSel(c.id); setQ(""); setFocus({ lat: c.ll[0], lon: c.ll[1] }); };  // pick from search → fly

  const num = (n) => n == null ? "—" : Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const row = (icon, label, val) => val ? html`<div class="flex items-start gap-2.5 py-2 border-b border-base-300/40 last:border-0"><span class="text-base-content/45 shrink-0 w-5 text-center mt-0.5">${Icon(icon)}</span><div class="min-w-0"><div class="text-[0.68rem] uppercase tracking-wide text-base-content/45">${T(t, label)}</div><div class="font-medium break-words">${val}</div></div></div>` : null;

  return html`<div class="flex flex-col gap-3">
    <${Globe} selected=${sel} focus=${focus} onPick=${pick} spin=${!sel} />

    <label class="input input-bordered flex items-center gap-2 h-11 rounded-2xl">${Icon("lucide:search", "text-lg opacity-50")}<input id="country-search" type="search" class="grow" placeholder=${T(t, "search")} autocomplete="off" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
    ${matches.length ? html`<div class="flex flex-col gap-1" id="matches">${matches.map((c) => html`<button class="btn btn-ghost btn-sm justify-start gap-2 rounded-2xl" data-id=${c.id} key=${c.id} onClick=${() => choose(c)}><span class="text-lg">${c.flag}</span>${c.n}</button>`)}</div>` : null}

    ${f
      ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 gap-1">
          <div class="flex items-center gap-3"><span class="text-4xl leading-none">${f.flag}</span><div class="min-w-0"><div class="font-bold text-lg leading-tight break-words">${f.n}</div><div class="text-sm text-base-content/60">${f.reg}${f.sub ? " · " + f.sub : ""}</div></div></div>
          <div class="mt-1">
            ${row("lucide:landmark", "fCapital", f.cap)}
            ${row("lucide:users", "fPopulation", num(f.pop))}
            ${row("lucide:ruler", "fArea", f.area ? num(f.area) + " km²" : null)}
            ${row("lucide:languages", "fLang", f.langs)}
            ${row("lucide:coins", "fCurrency", f.cur)}
          </div>
        </div></div>`
      : html`<div class="text-center text-base-content/50 py-4 text-sm flex flex-col items-center gap-2">${Icon("lucide:hand", "text-2xl opacity-40")}${T(t, "hint")}</div>`}
  </div>`;
}
