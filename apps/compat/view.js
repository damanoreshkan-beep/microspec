// Compatibility — real astrological synastry between two people. Each person's Sun/Moon/Mercury/Venus/Mars
// signs are computed from their birth date via the SYSTEMIC ephemeris (/_rt/astro eclipticPositions,
// astronomy-engine — the same engine the transit wheel runs on), then scored across five axes by the pure,
// unit-tested /_rt/synastry. Nothing is fetched or invented: the positions are real and the maths is
// deterministic and offline. Sign glyphs are the hand-drawn SVGs from /_rt/zodiac (never emoji). The two
// birth dates persist locally, so the last pair is instant on reopen. Colour = the band a score falls in.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { eclipticPositions } from "/_rt/astro.js";
import { signOf, compat, band } from "/_rt/synastry.js";
import { gate } from "/_rt/gate.js";

const PL = ["sun", "moon", "mercury", "venus", "mars"];
const $a = persistentAtom("compat.a", gate ? "1990-07-15" : "");
const $b = persistentAtom("compat.b", gate ? "1992-03-22" : "");
const BAND_COLOR = ["var(--color-error)", "var(--color-warning)", "var(--color-secondary)", "var(--color-success)"];

// birth date → each planet's sign (computed at noon UTC to centre the Moon's day-of-motion error).
const planetsFor = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(+d)) return null;
  const pos = eclipticPositions(d, PL);
  if (pos.length < PL.length) return null;                 // ephemeris unavailable → no fake result
  const m = {};
  for (const { key, lon } of pos) m[key] = signOf(lon);
  return m;
};

export function match({ S }) {
  const t = useStore(S.t);
  const a = useStore($a), b = useStore($b);
  const A = planetsFor(a), B = planetsFor(b);
  const r = A && B ? compat(A, B) : null;

  const dateField = (val, set, label) => html`<label class="flex flex-col gap-1 min-w-0">
    <span class="text-[0.62rem] font-mono uppercase tracking-[0.12em] text-base-content/55">${label}</span>
    <input type="date" value=${val} max="2035-12-31" onInput=${(e) => set(e.target.value)} class="input input-bordered rounded-2xl h-11 w-full text-sm" />
  </label>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-6">
      <div class="grid grid-cols-2 gap-3">
        ${dateField(a, (v) => $a.set(v), T(t, "youLabel"))}
        ${dateField(b, (v) => $b.set(v), T(t, "partnerLabel"))}
      </div>

      ${r ? html`
        <${Ring} score=${r.overall} t=${t} />
        <div class="grid grid-cols-2 gap-3">
          <${Person} label=${T(t, "youLabel")} P=${A} t=${t} />
          <${Person} label=${T(t, "partnerLabel")} P=${B} t=${t} />
        </div>
        <${Bars} r=${r} t=${t} />
      ` : null}
    </div>
  </${Fragment}>`;
}

function Ring({ score, t }) {
  const bi = band(score), col = BAND_COLOR[bi];
  return html`<div data-result class="flex flex-col items-center gap-1.5 py-1">
    <div class="relative" style="width:9rem;height:9rem">
      <svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-base-content)" stroke-opacity="0.1" stroke-width="4" />
        <circle cx="50" cy="50" r="46" fill="none" stroke=${col} stroke-width="4" stroke-linecap="round" stroke-dasharray=${`${(score / 100 * 289).toFixed(1)} 289`} />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <div data-overall class="text-[2.6rem] font-bold tabular-nums leading-none" style=${`color:${col}`}>${score}</div>
        <div class="text-[0.55rem] font-mono uppercase tracking-widest text-base-content/55 mt-0.5">${T(t, "overall")}</div>
      </div>
    </div>
    <div class="text-sm font-semibold" style=${`color:${col}`}>${T(t, "band" + bi)}</div>
  </div>`;
}

function Person({ label, P, t }) {
  return html`<div class="rounded-2xl border border-base-300 bg-base-100 p-3 flex flex-col items-center gap-2">
    <div class="text-[0.6rem] font-mono uppercase tracking-[0.12em] text-base-content/50">${label}</div>
    <${Sign} i=${P.sun} cls="w-9 h-9 text-secondary" />
    <div class="text-sm font-semibold leading-tight">${T(t, "sign" + P.sun)}</div>
    <div class="flex gap-3.5 mt-1">
      ${["moon", "venus", "mars"].map((pl) => html`<div class="flex flex-col items-center gap-1" key=${pl}>
        <${Sign} i=${P[pl]} cls="w-4 h-4 text-base-content/65" />
        <span class="text-[0.5rem] font-mono uppercase tracking-wide text-base-content/45">${T(t, "pl_" + pl)}</span>
      </div>`)}
    </div>
  </div>`;
}

function Bars({ r, t }) {
  const axes = [["axCore", r.core], ["axLove", r.love], ["axEmotion", r.emotion], ["axMind", r.mind], ["axPassion", r.passion]];
  return html`<div class="flex flex-col gap-2.5">
    ${axes.map(([key, v]) => html`<div class="flex items-center gap-3" key=${key}>
      <div class="w-20 shrink-0 text-xs font-medium truncate">${T(t, key)}</div>
      <div class="flex-1 h-2 rounded-full bg-base-300 overflow-hidden"><div class="h-full rounded-full" style=${`width:${v}%;background:${BAND_COLOR[band(v)]}`}></div></div>
      <div class="w-8 shrink-0 text-right text-xs font-mono tabular-nums text-base-content/70">${v}</div>
    </div>`)}
  </div>`;
}
