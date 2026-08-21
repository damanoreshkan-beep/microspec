import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { aiTick } from "/_rt/ai-astro.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

export function Reading({ sig, input, loc, api, gateText, lines, t, wait = false }) {
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const run = () => { setFailed(false); api.warm(sig, input, loc); return setTimeout(() => setFailed(!api.has(sig, loc)), 12000); };
  useEffect(() => {
    if (wait || gate || api.has(sig, loc)) return;
    const timer = run();
    return () => clearTimeout(timer);
  }, [sig, loc, wait]);
  const done = !wait && (gate || api.has(sig, loc));
  const text = gate ? gateText : api.get(sig, loc);
  if (done) return html`<p data-reading class="text-[0.95rem] leading-relaxed text-base-content/90 whitespace-pre-line">${text}</p>`;
  if (failed && !wait) {
    return html`<button data-reading-retry class="btn btn-sm gap-2 rounded-xl" onClick=${run}>
      ${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "interpRetry")}</span></button>`;
  }
  return html`<div class="flex flex-col gap-2 text-base-content/70">${lines.map((n, i) => html`<div class="text-[0.95rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`;
}
