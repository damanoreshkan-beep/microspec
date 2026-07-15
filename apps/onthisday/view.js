// On This Day — what happened on today's date: highlights, events, births, deaths and holidays from
// Wikipedia (rest_v1 onthisday feed, CORS *, keyless). Content follows the UI locale (uk→uk.wikipedia,
// en→en.wikipedia). Cards link to the article; the list staggers in with the systemic `motion`.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { animate, stagger } from "motion";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LANGS = { uk: "uk", en: "en", de: "de", pl: "pl" };
const CATS = ["selected", "events", "births", "deaths", "holidays"];
const LABEL = { selected: "cSelected", events: "cEvents", births: "cBirths", deaths: "cDeaths", holidays: "cHolidays" };
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
const pick = (e) => ({ year: e.year, text: e.text, url: e.pages?.[0]?.content_urls?.desktop?.page || e.pages?.[0]?.content_urls?.mobile?.page || null, thumb: e.pages?.[0]?.thumbnail?.source || null });

function sample() {
  const nil = { url: null, thumb: null };
  return {
    selected: [
      { year: 2015, text: "Міжпланетна станція «Нью-Горайзонс» здійснила проліт повз Плутон — перше близьке дослідження карликової планети.", ...nil },
      { year: 1965, text: "Апарат «Марінер-4» передав перші знімки поверхні Марса зблизька.", ...nil },
      { year: 1867, text: "Альфред Нобель уперше публічно продемонстрував динаміт.", ...nil },
      { year: 1789, text: "Штурм Бастилії — початок Великої французької революції.", ...nil },
    ],
    events: [
      { year: 1958, text: "Революція в Іраку повалила монархію.", ...nil },
      { year: 1933, text: "У Німеччині всі політичні партії, крім НСДАП, оголошено поза законом.", ...nil },
    ],
    births: [
      { year: 1918, text: "Інгмар Бергман, шведський кінорежисер.", ...nil },
      { year: 1912, text: "Вуді Гатрі, американський фолк-музикант.", ...nil },
    ],
    deaths: [{ year: 1827, text: "Оґюстен-Жан Френель, французький фізик.", ...nil }],
    holidays: [{ year: null, text: "День взяття Бастилії — національне свято Франції.", ...nil }],
  };
}

export function onthisday({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const [cat, setCat] = useState("selected");
  const [data, setData] = useState(isGate || MOCK ? sample() : null);
  const [err, setErr] = useState(false);
  const listRef = useRef();

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    (async () => {
      try {
        const n = new Date(), mm = String(n.getMonth() + 1).padStart(2, "0"), dd = String(n.getDate()).padStart(2, "0");
        const wiki = LANGS[locale] || "en";
        const j = await fetch(`https://${wiki}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`).then((r) => { if (!r.ok) throw 0; return r.json(); });
        if (live) { setData(Object.fromEntries(CATS.map((k) => [k, (j[k] || []).map(pick)]))); setErr(false); }
      } catch { if (live) setErr(true); }
    })();
    return () => { live = false; };
  }, [locale]);

  const ready = useReveal(!!data);   // hold the skeleton ≥1s so a fast load doesn't flash
  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll(".otd");
    if (!rows.length) return;
    const a = animate(rows, { y: [10, 0] }, { delay: stagger(0.025), duration: 0.3, ease: "easeOut" });
    return () => { try { a.stop(); } catch { /* */ } };
  }, [cat, ready]);

  // Structure (date + category tabs) renders immediately; the entries are decoding skeleton cards until ready.
  const dateStr = new Date().toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { day: "numeric", month: "long" });
  const items = data ? (data[cat] || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0)) : [];
  const body = (it) => html`<div class="card-body p-3 flex-row items-start gap-3">
    <div class="shrink-0 w-12 text-right pt-0.5"><span class="text-base font-bold tabular-nums text-primary">${it.year ?? "—"}</span></div>
    <div class="flex-1 min-w-0"><p class="text-sm leading-snug break-words">${it.text}</p></div>
    ${it.thumb ? html`<img src=${it.thumb} loading="lazy" alt="" class="w-14 h-14 rounded-lg object-cover shrink-0" />` : null}
  </div>`;
  const skel = (i) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl overflow-hidden" key=${"s" + i}><div class="card-body p-3 flex-row items-start gap-3 text-base-content/70"><div class="shrink-0 w-12 text-right pt-0.5"><span class="text-base font-bold tabular-nums text-primary/50"><${Scramble} len=${4} /></span></div><div class="flex-1 min-w-0 flex flex-col gap-1.5"><div class="truncate text-sm"><${Scramble} len=${34} /></div><div class="truncate text-sm w-2/3"><${Scramble} len=${18} /></div></div></div></div>`;

  return html`<div class="flex flex-col gap-3">
    <div class="text-2xl font-bold text-center">${dateStr}</div>
    <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      ${CATS.map((k) => html`<button data-cat=${k} aria-pressed=${k === cat} class=${`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition ${k === cat ? "border-primary bg-primary/10" : "border-base-300"}`} onClick=${() => setCat(k)} key=${k}>${T(t, LABEL[k])}</button>`)}
    </div>
    <div ref=${listRef} class="flex flex-col gap-2">
      ${err ? html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-2 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span>${T(t, "statusError")}</span></div>`
        : !ready ? Array.from({ length: 5 }, (_, i) => skel(i))
        : items.length ? items.map((it, i) => it.url
          ? html`<a data-otd href=${it.url} target="_blank" rel="noopener" class="otd card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition" key=${i}>${body(it)}</a>`
          : html`<div data-otd class="otd card bg-base-100 border border-base-300 rounded-2xl" key=${i}>${body(it)}</div>`)
        : html`<div class="text-center text-base-content/60 py-10">${T(t, "empty")}</div>`}
    </div>
  </div>`;
}
