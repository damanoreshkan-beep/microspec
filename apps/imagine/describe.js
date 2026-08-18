// Describe (Опиши) — image → text, FREE and keyless for the user. You give it a photo (upload · camera · the
// last image you made in Уяви) and, optionally, a question — "what breed is this", "translate the sign" — and
// the picture is READ: a few sentences on what is in it, then a line of tags; or the answer to your question.
// The image + prompt go to our VPS proxy's /feed/vision (a cascade of vision LLMs behind our key; the client
// never sees one) and the text comes back in the active locale. Third sibling to Уяви (view.js) and Онови
// (edit.js): same source chooser, same stage, but the result is WORDS, so it lands in a raised sheet with the
// actions words want — copy it, ask something else about the same picture, start over with a new one.
//
// The headless gate has no camera and no network and must stay deterministic, so under `gate` it seeds a
// local mesh-gradient "photo" as the source and answers with a fixed description — the whole flow (source →
// question → read → text → copy / ask again / new photo) runs without a single call out.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { CameraPrime } from "/_rt/camprime.js";
import { readLastGen } from "/_rt/lastgen.js";
import { Scramble } from "/_rt/skeleton.js";
import { toEditableDataURL } from "./edit.js";
import { promptHandoff } from "./handoff.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
// The reading instruction, per locale: the model writes in the user's language, a short read then tags. A typed
// question replaces the read but keeps the language. Both are one string, never assembled from fragments.
const ASK = {
  uk: { read: "Опиши це зображення українською: 2–3 речення про те, що на ньому і який настрій, потім окремим рядком до 5 ключових тегів через кому.", q: "Відповідай українською, коротко і по суті, спираючись лише на це зображення. Питання: " },
  en: { read: "Describe this image in English: 2–3 sentences on what is in it and its mood, then, on a separate line, up to 5 key tags separated by commas.", q: "Answer in English, briefly and to the point, from this image alone. Question: " },
};
const gateText = "Гірське озеро на світанку: дзеркальна вода віддзеркалює рожеві піки, над берегом стелиться легкий туман. Тиша, прохолода і золоте світло перших променів.\n\nгори, озеро, світанок, туман, тиша";

// A stand-in "photo" for the gate/screenshot — the same mesh-gradient family as the sibling tabs.
function mockArt(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const defs = [], rects = [];
  for (let i = 0; i < 4; i++) {
    const h = Math.floor(r() * 360), x = Math.floor(r() * 100), y = Math.floor(r() * 100), rad = 42 + Math.floor(r() * 38);
    defs.push(`<radialGradient id="g${i}" cx="${x}%" cy="${y}%" r="${rad}%"><stop offset="0%" stop-color="hsl(${h} 80% 60%)" stop-opacity=".85"/><stop offset="100%" stop-color="hsl(${h} 80% 60%)" stop-opacity="0"/></radialGradient>`);
    rects.push(`<rect width="768" height="1024" fill="url(#g${i})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024"><rect width="768" height="1024" fill="#0A0A0F"/><defs>${defs.join("")}</defs>${rects.join("")}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export function describe({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  // phase: empty (source chooser) · camera (viewfinder) · ready (image + question) · reading · done · error
  const [phase, setPhase] = useState(gate ? "done" : "empty");
  const [srcUrl, setSrcUrl] = useState(gate ? mockArt(5) : null);
  const [question, setQuestion] = useState("");
  const [text, setText] = useState(gate ? gateText : "");
  const [error, setError] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [camErr, setCamErr] = useState(null);
  const [hasLast, setHasLast] = useState(false);
  const fileRef = useRef(), videoRef = useRef(), streamRef = useRef(null), runRef = useRef(0), blobs = useRef([]);

  const own = (url) => { if (url?.startsWith?.("blob:")) blobs.current.push(url); return url; };
  useEffect(() => () => { blobs.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* */ } }); }, []);
  useEffect(() => { if (!gate) readLastGen().then((v) => setHasLast(!!v)).catch(() => {}); }, []);

  // ── camera: same lifecycle as the edit tab (open the back stream while primed + in the camera phase) ──
  useEffect(() => {
    if (gate || phase !== "camera" || !enabled) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setCamErr("unavailable"); return; }
    let live = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (!live) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current; if (v) { v.srcObject = stream; v.setAttribute?.("playsinline", ""); try { await v.play?.(); } catch { /* */ } }
      } catch (e) { if (live) setCamErr(e && e.name === "NotAllowedError" ? "denied" : "unavailable"); }
    })();
    return () => { live = false; try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* */ } streamRef.current = null; const v = videoRef.current; try { if (v) v.srcObject = null; } catch { /* */ } };
  }, [phase, enabled]);
  const stopCam = () => { try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* */ } streamRef.current = null; };

  const loadSource = (url) => { runRef.current++; setText(""); setError(null); setQuestion(""); setSrcUrl(url); setPhase("ready"); };
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; loadSource(own(URL.createObjectURL(f))); e.target.value = ""; };
  const fromLast = async () => { try { const v = await readLastGen(); if (v?.url) loadSource(v.url); else setHasLast(false); } catch { setHasLast(false); } };
  const capture = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); const url = c.toDataURL("image/jpeg", 0.92); buzz(14); stopCam(); setEnabled(false); loadSource(url); } catch { /* */ }
  };
  const backToChooser = () => { runRef.current++; stopCam(); setEnabled(false); setCamErr(null); setText(""); setError(null); setPhase("empty"); if (!gate) readLastGen().then((v) => setHasLast(!!v)).catch(() => {}); };
  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const read = async () => {
    if (!srcUrl || phase === "reading") return;
    const run = ++runRef.current, q = question.trim();
    buzz(); setError(null); setText(""); setPhase("reading");
    if (gate) { await sleep(120); if (run === runRef.current) { setText(q ? `${gateText.split("\n")[0]}` : gateText); setPhase("done"); } return; }
    let image;
    try { image = await toEditableDataURL(srcUrl); } catch { return fail(run, "dsFailed"); }
    if (run !== runRef.current) return;
    if (image.length > 9_000_000) return fail(run, "eBig");
    const ask = ASK[loc] || ASK.en;
    try {
      const r = await fetch(`${VPS_PROXY}/vision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, prompt: q ? ask.q + q : ask.read, maxTokens: 400 }) });
      if (run !== runRef.current) return;
      if (!r.ok) return fail(run, r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : "dsFailed");
      const j = await r.json().catch(() => null);
      if (run !== runRef.current) return;
      const out = String(j?.text || "").trim();
      if (!out) return fail(run, "dsFailed");
      setText(out); setPhase("done"); buzz(12);
    } catch { fail(run, "eNetwork"); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(text); toast?.(T(t, "copied")); } catch { toast?.(T(t, "eNetwork")); } };
  // The read becomes the next prompt in Твори — one line (the model prefers a flowing description), tags folded in.
  const toMake = () => { buzz(); promptHandoff.set(text.replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").trim()); S.tab.set("make"); };
  const askAgain = () => { buzz(); setText(""); setError(null); setPhase("ready"); };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); read(); } };

  const [body, tags] = (() => { const lines = text.trim().split(/\n+/); const last = lines[lines.length - 1] || ""; const isTags = lines.length > 1 && last.split(",").length >= 3 && last.length < 120; return isTags ? [lines.slice(0, -1).join("\n"), last.split(",").map((s) => s.trim()).filter(Boolean)] : [text, []]; })();
  const showStage = phase === "ready" || phase === "reading" || phase === "done" || phase === "error";

  return html`<div class="ms-stage z-20 bg-base-100 flex flex-col">
    <input ref=${fileRef} type="file" accept="image/*" class="hidden" aria-hidden="true" onChange=${onFile} />

    <div class=${`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${phase === "empty" ? "bg-base-100" : "bg-black"}`}>
      ${phase === "empty" ? html`<div data-source class="flex flex-col items-center gap-6 px-8 w-full max-w-xs">
        <div class="text-base-content/30">${Icon("lucide:scan-eye", "text-5xl")}</div>
        <div class="text-base font-semibold text-base-content/85">${T(t, "pick")}</div>
        <div class="flex flex-col gap-2.5 w-full">
          <button data-src-upload class="btn btn-primary rounded-2xl gap-2.5 justify-start px-5" onClick=${() => { buzz(); fileRef.current?.click(); }}>${Icon("lucide:upload", "text-lg")}${T(t, "srcUpload")}</button>
          <button data-src-camera class="btn btn-outline rounded-2xl gap-2.5 justify-start px-5" onClick=${() => { buzz(); setCamErr(null); setPhase("camera"); }}>${Icon("lucide:camera", "text-lg")}${T(t, "srcCamera")}</button>
          ${hasLast ? html`<button data-src-last class="btn btn-ghost rounded-2xl gap-2.5 justify-start px-5" onClick=${() => { buzz(); fromLast(); }}>${Icon("lucide:sparkles", "text-lg text-secondary")}${T(t, "srcLast")}</button>` : null}
        </div>
      </div>` : null}

      ${phase === "camera" ? html`<${Fragment}>
        <video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover ${enabled && !camErr ? "" : "opacity-0"}`}></video>
        ${enabled && !camErr ? html`<${Fragment}>
          <button data-cam-back aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white" onClick=${backToChooser}>${Icon("lucide:x", "text-base")}</button>
          <button data-shutter aria-label=${T(t, "capture")} onClick=${capture} class="absolute left-1/2 -translate-x-1/2 bottom-6 w-[4.6rem] h-[4.6rem] rounded-full bg-white/10 sf-e3 flex items-center justify-center active:scale-95 transition">
            <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
          </button>
        </${Fragment}>` : null}
      </${Fragment}>` : null}

      ${showStage && srcUrl ? html`<${Fragment}>
        <img data-result src=${srcUrl} alt="" class=${`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${phase === "reading" ? "opacity-40" : "opacity-100"}`} />
        <button data-new aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white" onClick=${backToChooser}>${Icon("lucide:x", "text-base")}</button>
      </${Fragment}>` : null}

      ${phase === "error" ? html`<div class="absolute inset-x-0 bottom-3 flex justify-center px-4"><div data-error class="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-base-100 text-error sf-e3">${Icon("lucide:alert-triangle", "text-base shrink-0")}${T(t, error || "dsFailed")}</div></div>` : null}
    </div>

    ${/* The reading and the read: WORDS live in the raised sheet under the picture, decoding in place while
         the model works (no spinner), then holding the text with the actions words want. */""}
    ${phase === "reading" || phase === "done" ? html`<div data-read class="shrink-0 bg-base-100 px-4 pt-4 flex flex-col gap-3 max-w-xl w-full mx-auto max-h-[45%] overflow-y-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      ${phase === "reading"
        ? html`<div role="status" aria-busy="true" class="flex flex-col gap-2 text-sm text-base-content/70">${[26, 30, 22, 14].map((n, i) => html`<div key=${i} class="truncate"><${Scramble} len=${n} /></div>`)}</div>`
        : html`<${Fragment}>
          <p data-text class="text-[0.95rem] leading-relaxed whitespace-pre-line text-base-content/90">${body}</p>
          ${tags.length ? html`<div data-tags class="flex flex-wrap gap-1.5">${tags.map((tg) => html`<span key=${tg} class="badge badge-ghost rounded-lg font-mono text-[0.68rem] uppercase tracking-wide">${tg}</span>`)}</div>` : null}
          <div class="flex gap-2 pt-1">
            <button data-to-make class="btn btn-primary flex-1 rounded-2xl gap-2" onClick=${toMake}>${Icon("lucide:sparkles", "text-lg")}${T(t, "toMake")}</button>
            <button data-copy aria-label=${T(t, "copy")} class="btn btn-outline rounded-2xl gap-2 shrink-0" onClick=${copy}>${Icon("lucide:copy", "text-lg")}</button>
            <button data-ask aria-label=${T(t, "askMore")} class="btn btn-outline rounded-2xl gap-2 shrink-0" onClick=${askAgain}>${Icon("lucide:message-circle-question", "text-lg")}</button>
          </div>
        </${Fragment}>`}
    </div>` : null}

    ${phase === "ready" || phase === "error" ? html`<div class="shrink-0 bg-base-100 px-3 pt-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <textarea id="question" rows="2" aria-label=${T(t, "dsPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug" placeholder=${T(t, "dsPlaceholder")} value=${question} onInput=${(e) => setQuestion(e.target.value)} onKeyDown=${onKey}></textarea>
      <div class="flex gap-2">
        <button data-new class="btn btn-ghost rounded-2xl gap-2 shrink-0" aria-label=${T(t, "newImg")} onClick=${backToChooser}>${Icon("lucide:image", "text-lg")}</button>
        <button data-read-go class="btn btn-primary flex-1 rounded-2xl gap-2" onClick=${read}>${Icon("lucide:scan-eye", "text-lg")}${T(t, question.trim() ? "answer" : phase === "error" ? "dsAgain" : "readBtn")}</button>
      </div>
    </div>` : null}

    ${phase === "camera" && (!enabled || camErr) ? html`<${CameraPrime} loc=${loc} reason=${T(t, "dsPrimeReason")} privacy=${T(t, "primePrivacy")} privacyIcon="lucide:cloud-upload" onEnable=${() => { buzz(); setCamErr(null); setEnabled(true); }} onSettings=${() => S.screen.set("perms")} denied=${camErr === "denied"} unavailable=${camErr === "unavailable"} />` : null}
  </div>`;
}
