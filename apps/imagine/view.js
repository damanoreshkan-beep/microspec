// Imagine — text → image via FLUX.2 [pro]. The wow is the DEFAULT: every result is generated at this
// screen's exact proportions and the highest resolution FLUX.2 allows (fitResolution → up to 4 MP), so what
// comes back is a wallpaper made for this device. The API key never touches the client — the app POSTs to
// our own VPS proxy (/_rt/feed.js VPS_PROXY), which injects the key server-side and returns the async job;
// polling + the signed delivery image go back through the same host-allowlisted proxy. The headless gate has
// no key and must never spend credits, so there it seeds a local mesh-gradient "image" and never calls out.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { fitResolution } from "/_rt/imgsize.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
const gate = isGate || MOCK != null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);

// A stand-in "generated image" for the gate/screenshot: overlapping soft colour blobs on ink → an abstract
// mesh-gradient wallpaper, varied by seed so "Again" visibly changes it. Deterministic, self-contained.
function mockArt(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const defs = [], rects = [];
  for (let i = 0; i < 4; i++) {
    const h = Math.floor(r() * 360), x = Math.floor(r() * 100), y = Math.floor(r() * 100), rad = 42 + Math.floor(r() * 38);
    defs.push(`<radialGradient id="g${i}" cx="${x}%" cy="${y}%" r="${rad}%"><stop offset="0%" stop-color="hsl(${h} 82% 62%)" stop-opacity=".85"/><stop offset="100%" stop-color="hsl(${h} 82% 62%)" stop-opacity="0"/></radialGradient>`);
    rects.push(`<rect width="720" height="1280" fill="url(#g${i})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="#0A0A0F"/><defs>${defs.join("")}</defs>${rects.join("")}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export function imagine({ S, toast }) {
  const t = useStore(S.t);
  const dim = fitResolution(typeof innerWidth !== "undefined" ? innerWidth : 390, typeof innerHeight !== "undefined" ? innerHeight : 844, typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 2, 4);
  const [prompt, setPrompt] = useState(gate ? "northern lights over a frozen lake, cinematic, ultra detailed" : "");
  const [phase, setPhase] = useState(gate ? "done" : "idle");                    // idle | generating | done | error
  const [result, setResult] = useState(gate ? { url: mockArt(7), w: dim.width, h: dim.height, seed: 7 } : null);
  const [error, setError] = useState(null);
  const runRef = useRef(0);                                                       // guards against a stale poll landing after a new run

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), { width, height } = dim, run = ++runRef.current;
    setError(null); setResult(null); setPhase("generating");
    if (gate) { await sleep(90); if (run === runRef.current) { setResult({ url: mockArt(seed), w: width, h: height, seed }); setPhase("done"); } return; }
    try {
      const cr = await fetch(`${VPS_PROXY}/flux`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p, width, height, seed, output_format: "jpeg" }) });
      if (cr.status === 402) return fail(run, "eCredits");
      if (cr.status === 429) return fail(run, "eRate");
      if (!cr.ok) return fail(run, "eFailed");
      const j = await cr.json();
      if (!j.polling_url) return fail(run, "eFailed");
      for (let i = 0; i < 80; i++) {                                             // ~2 min of 1.5s polls
        await sleep(1500);
        if (run !== runRef.current) return;
        let pj; try { pj = await (await fetch(`${VPS_PROXY}/flux/get?url=${encodeURIComponent(j.polling_url)}`)).json(); } catch { continue; }
        if (pj.status === "Ready" && pj.result?.sample) { if (run === runRef.current) { setResult({ url: pj.result.sample, w: width, h: height, seed }); setPhase("done"); } return; }
        if (pj.status === "Error" || pj.status === "Failed") return fail(run, "eFailed");
      }
      fail(run, "eTimeout");
    } catch { fail(run, "eNetwork"); }
  };

  // Save fetches the bytes through the proxy (cross-origin delivery URL → a plain <img> shows it, but a blob
  // download needs CORS, which the proxy adds), then triggers a download.
  const save = async () => {
    if (!result?.url) return;
    try {
      const src = gate ? result.url : `${VPS_PROXY}/flux/get?url=${encodeURIComponent(result.url)}`;
      const blob = await (await fetch(src)).blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `imagine-${result.seed}.jpg`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black flex items-center justify-center">
      ${phase === "done" && result ? html`<${Fragment}>
        <img data-result src=${result.url} alt=${prompt} class="absolute inset-0 w-full h-full object-cover" />
        <span class="absolute top-2 right-2 font-mono text-[0.65rem] px-2 py-1 rounded-lg bg-black/55 text-white/90">${result.w}×${result.h}</span>
      </${Fragment}>` : null}
      ${phase === "generating" ? html`<${Fragment}>
        <div class="absolute inset-0 animate-pulse" style="background:linear-gradient(120deg,#141416,#241f36,#141416)"></div>
        <div data-gen class="relative z-10 font-mono text-sm uppercase tracking-wide text-base-content/70">${T(t, "eGenerating")}</div>
      </${Fragment}>` : null}
      ${phase === "idle" ? html`<div class="text-base-content/20">${Icon("lucide:sparkles", "text-5xl")}</div>` : null}
      ${phase === "error" ? html`<div class="flex flex-col items-center gap-2 text-center px-8">${Icon("lucide:alert-triangle", "text-3xl text-error")}<div data-error class="text-sm text-base-content/70">${T(t, error || "eFailed")}</div></div>` : null}
    </div>

    <div class="shrink-0 bg-base-100 border-t border-base-300 px-3 pt-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
      <div class="flex gap-2">
        <button id="go" data-go class="btn btn-primary flex-1 rounded-2xl gap-2" disabled=${phase === "generating" || !prompt.trim()} onClick=${generate}>${Icon("lucide:sparkles", "text-lg")}${T(t, phase === "done" || phase === "error" ? "again" : "generate")}</button>
        ${phase === "done" && result ? html`<button data-save class="btn btn-outline rounded-2xl gap-2 shrink-0" onClick=${save}>${Icon("lucide:download", "text-lg")}${T(t, "save")}</button>` : null}
      </div>
    </div>
  </div>`;
}
