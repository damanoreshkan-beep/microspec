// The AI paragraph — shared by every reading surface in this app.
//
// It lived inside view.js until the compatibility tab needed one too, and match.js cannot import view.js:
// view.js re-exports match.js, so that edge would close a cycle. Moved here verbatim rather than copied,
// because the 12-second retry, the fail-open and the `wait` guard are exactly the details that drift when
// there are two of something.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { aiTick } from "/_rt/ai-astro.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Never a spinner — the sheet is already there and only this block is pending, so it carries text-shaped
// skeletons at the length the answer will actually be. 12 s then a retry, fail-open.
// `wait` holds the request back while a fact it depends on is still being computed. It matters more than it
// looks: the exact-hit dates are part of BOTH the grounding block and its cache signature, so warming before
// they land would spend one request on a reading of an incomplete chart and a second on the real one — and
// cache both under different keys forever.
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
