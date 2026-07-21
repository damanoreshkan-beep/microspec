// Retouch (Онови) — instruction image editing, FREE and keyless. You give it a photo (upload · camera · the
// last image you made in Уяви) and a few words — "add snow", "remove the wires", "as an oil painting" — and
// the image is rewritten. The instruction + image go to our VPS proxy's /feed/image/edit, which cascades
// across anonymous public HF Gradio Spaces (FLUX.1-Kontext, Qwen-Image-Edit, Step1X, …) and streams the
// edited image back — no API key, no credits, ever. Editing is iterative BY CHOICE: after a result you can
// "keep editing" (the result becomes the new base) or go back to the "original", so a chain of edits or a
// fresh pass off the source are both one tap. Sibling to Уяви (apps/imagine).
//
// The headless gate has no camera and no network and must stay deterministic, so under `gate` it seeds a
// local mesh-gradient "photo" as the source and, on edit, a differently-seeded one as the result — the whole
// flow (source → instruction → edit → result → save / keep / revert) runs without a single call out.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { CameraPrime } from "/_rt/camprime.js";
import { readLastGen } from "/_rt/lastgen.js";
import { toEnglish } from "/_rt/translate.js";
import { suggest } from "/_rt/ai.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const randSeed = () => Math.floor(Math.random() * 1e9);
// Random seed phrases for the "surprise me" button — the AI expands one into a short, localized edit
// instruction. Only a spark for variety (never shown); the model writes the actual instruction in the locale.
const SPARKS = ["turn it into an oil painting", "cinematic golden-hour lighting", "vintage film photograph", "soft watercolour illustration", "add dramatic shadows", "make it a snowy winter scene", "cyberpunk neon aesthetic", "dreamy pastel tones", "black-and-white film noir", "warm autumn colours", "add a glowing sunset sky", "studio portrait lighting", "misty morning atmosphere", "retro 80s synthwave look", "add gentle falling rain", "turn day into night", "pencil sketch style", "vibrant pop-art colours", "soft cinematic bloom", "add a shallow depth of field"];
const gateDream = "перетвори на олійний живопис";                                  // gate: deterministic, no network
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;    // seconds → m:ss
const EST = 40;                                                                   // rough edit wall-clock (steps-heavy models run slower than text→image)
const MAX_SIDE = 1024;                                                            // cap the uploaded image (payload + the Spaces clamp beyond this)

// A stand-in "photo" for the gate/screenshot: overlapping soft colour blobs on ink → an abstract scene,
// varied by seed so the "after" visibly differs from the "before". Deterministic, self-contained, no network.
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

// Draw any same-origin image (objectURL / dataURL / svg) onto a capped canvas and return a JPEG data URL — the
// shape the proxy forwards to the Spaces (their FileData.url accepts a base64 data URL). Downscaled so the POST
// body stays small. Same-origin only, so the canvas never taints.
function toEditableDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return reject(new Error("empty image"));
        const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.85));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

export function retouch({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  // phase: empty (source chooser) · camera (viewfinder) · ready (image + instruction) · editing · done · error
  const [phase, setPhase] = useState(gate ? "ready" : "empty");
  const [srcUrl, setSrcUrl] = useState(gate ? mockArt(3) : null);                 // the image currently being edited (display)
  const [original, setOriginal] = useState(gate ? mockArt(3) : null);            // the first source loaded (for "revert")
  const [result, setResult] = useState(null);                                     // { url } of the last edit
  const [prompt, setPrompt] = useState(gate ? "add falling snow, cinematic" : "");
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [enabled, setEnabled] = useState(false);                                  // camera stream opened
  const [camErr, setCamErr] = useState(null);
  const [hasLast, setHasLast] = useState(false);                                  // an image from Уяви is available
  const [suggesting, setSuggesting] = useState(false);                            // "surprise me" instruction is being written by the AI

  const fileRef = useRef(), videoRef = useRef(), streamRef = useRef(null), runRef = useRef(0), blobs = useRef([]);

  // Track object URLs we mint so they can be revoked on unmount (avoid leaks across many edits).
  const own = (url) => { if (url?.startsWith?.("blob:")) blobs.current.push(url); return url; };
  useEffect(() => () => { blobs.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* */ } }); }, []);

  // Is there a last-generated image from Уяви to offer as a source? (same-origin shared store; see /_rt/lastgen.js)
  useEffect(() => { if (!gate) readLastGen().then((v) => setHasLast(!!v)).catch(() => {}); }, []);

  // ── camera: open the back stream while the camera phase is active + primed; mirror apps/cam's lifecycle ──
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

  // load a source image and go to the ready state (revoke the previous run's result blob first)
  const loadSource = (url) => {
    if (result?.url) own(result.url);
    setResult(null); setError(null); setElapsed(0);
    setSrcUrl(url); setOriginal(url); setPhase("ready");
  };

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    loadSource(own(URL.createObjectURL(f)));
    e.target.value = "";                                                          // allow re-picking the same file
  };

  const fromLast = async () => {
    try { const v = await readLastGen(); if (v?.url) { loadSource(v.url); if (v.prompt) setPrompt(""); } else setHasLast(false); }
    catch { setHasLast(false); }
  };

  const capture = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try {
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      const url = c.toDataURL("image/jpeg", 0.92);
      buzz(14); stopCam(); setEnabled(false); loadSource(url);
    } catch { /* capture blocked */ }
  };

  const backToChooser = () => { stopCam(); setEnabled(false); setCamErr(null); setPhase("empty"); if (!gate) readLastGen().then((v) => setHasLast(!!v)).catch(() => {}); };

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  // "Surprise me" — the AI writes a fresh edit instruction (in the active locale) from a random spark; toEnglish
  // converts it for the model at edit() time. Fail-open: a miss leaves the field as-is. The gate uses a fixed line.
  const dream = async () => {
    if (suggesting || phase === "editing") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const out = await suggest("edit", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (out) setPrompt(out); }
    finally { setSuggesting(false); }
  };

  const edit = async () => {
    const p = prompt.trim();
    if (!p || !srcUrl || phase === "editing") return;
    const seed = randSeed(), run = ++runRef.current;
    buzz(); setError(null); setElapsed(0);
    if (result?.url) own(result.url);
    setResult(null); setPhase("editing");
    if (gate) { await sleep(120); if (run === runRef.current) { setResult({ url: mockArt(seed) }); setPhase("done"); } return; }
    let image;
    try { image = await toEditableDataURL(srcUrl); } catch { return fail(run, "eFailed"); }
    if (run !== runRef.current) return;
    if (image.length > 9_000_000) return fail(run, "eBig");                       // ~6.7 MB decoded — over the proxy's body cap
    let pEn = p; try { pEn = await toEnglish(p); } catch { /* fail-open: send the original — the edit models prefer English but a native instruction still runs */ }
    if (run !== runRef.current) return;
    try {
      // Async job + poll, exactly like Уяви: POST starts the cascade, short polls never trip the proxy's 60s cap.
      const cr = await fetch(`${VPS_PROXY}/image/edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, prompt: pEn, seed }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : cr.status === 413 ? "eBig" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      const t0 = Date.now();
      for (let i = 0; i < 100; i++) {                                             // ~150s of 1.5s polls
        await sleep(1500);
        if (run !== runRef.current) return;
        setElapsed(Math.round((Date.now() - t0) / 1000));
        let pr; try { pr = await fetch(`${VPS_PROXY}/image/edit/get?job=${job}`); } catch { continue; }
        if (run !== runRef.current) return;
        if ((pr.headers.get("content-type") || "").startsWith("image/")) {
          const blob = await pr.blob();
          if (run !== runRef.current) return;
          setResult({ url: own(URL.createObjectURL(blob)) }); setPhase("done"); buzz(12); return;
        }
        let j; try { j = await pr.json(); } catch { continue; }
        if (j.status === "error") return fail(run, "eFailed");
      }
      fail(run, "eTimeout");
    } catch { fail(run, "eNetwork"); }
  };

  // keep editing: the result becomes the new base (iterative). revert: back to the untouched original.
  const keep = () => { if (!result?.url) return; buzz(); setSrcUrl(result.url); setResult(null); setPrompt(""); setError(null); setPhase("ready"); };
  const revert = () => { buzz(); if (result?.url) own(result.url); setResult(null); setSrcUrl(original); setError(null); setPhase("ready"); };

  const save = () => {
    const url = result?.url; if (!url) return;
    try {
      const a = document.createElement("a"); a.href = url; a.download = `retouch-${Date.now()}.jpg`;
      document.body.appendChild(a); a.click(); a.remove(); toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); edit(); } };

  const stageImg = result?.url || srcUrl;                                         // the image shown in the stage right now
  const isDone = phase === "done" && result;

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <input ref=${fileRef} type="file" accept="image/*" class="hidden" aria-hidden="true" onChange=${onFile} />

    <!-- ── the image stage (contain, so an editor never crops what you're working on) ── -->
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black flex items-center justify-center">
      ${phase === "empty" ? html`<div data-source class="flex flex-col items-center gap-6 px-8 w-full max-w-xs">
        <div class="text-base-content/30">${Icon("lucide:image-plus", "text-5xl")}</div>
        <div class="text-base font-semibold text-base-content/85">${T(t, "pick")}</div>
        <div class="flex flex-col gap-2.5 w-full">
          <button data-src-upload class="btn btn-primary rounded-2xl gap-2.5 justify-start px-5" onClick=${() => { buzz(); fileRef.current?.click(); }}>${Icon("lucide:upload", "text-lg")}${T(t, "srcUpload")}</button>
          <button data-src-camera class="btn btn-outline rounded-2xl gap-2.5 justify-start px-5" onClick=${() => { buzz(); setCamErr(null); setPhase("camera"); }}>${Icon("lucide:camera", "text-lg")}${T(t, "srcCamera")}</button>
          ${hasLast ? html`<button data-src-last class="btn btn-ghost rounded-2xl gap-2.5 justify-start px-5 border border-base-content/10" onClick=${() => { buzz(); fromLast(); }}>${Icon("lucide:sparkles", "text-lg text-secondary")}${T(t, "srcLast")}</button>` : null}
        </div>
      </div>` : null}

      ${phase === "camera" ? html`<${Fragment}>
        <video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover ${enabled && !camErr ? "" : "opacity-0"}`}></video>
        ${enabled && !camErr ? html`<${Fragment}>
          <button data-cam-back aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 border-white/15 text-white" onClick=${backToChooser}>${Icon("lucide:x", "text-base")}</button>
          <button data-shutter aria-label=${T(t, "capture")} onClick=${capture} class="absolute left-1/2 -translate-x-1/2 bottom-6 w-[4.6rem] h-[4.6rem] rounded-full bg-white/10 border border-white/25 flex items-center justify-center active:scale-95 transition">
            <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
          </button>
        </${Fragment}>` : null}
      </${Fragment}>` : null}

      ${(phase === "ready" || phase === "editing" || phase === "done" || phase === "error") && stageImg ? html`<${Fragment}>
        <img data-result src=${stageImg} alt=${isDone ? prompt : ""} class=${`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${phase === "editing" ? "opacity-30" : "opacity-100"}`} />
        ${isDone ? html`<button data-new aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 border-white/15 text-white" onClick=${() => { revert(); setPhase("empty"); }}>${Icon("lucide:x", "text-base")}</button>` : null}
      </${Fragment}>` : null}

      ${phase === "editing" ? html`<div class="relative z-10 flex flex-col items-center gap-3 w-56 max-w-[70%]">
        <div data-gen class="font-mono text-sm uppercase tracking-wide text-white/90 tabular-nums drop-shadow">${T(t, "eEditing")} ${fmt(elapsed)}<span class="text-white/50"> / ~${fmt(EST)}</span></div>
        <div class="w-full h-1 rounded-full bg-white/20 overflow-hidden"><div class="h-full bg-primary rounded-full transition-all duration-700 ease-out" style=${`width:${Math.min(96, Math.round(elapsed / EST * 100))}%`}></div></div>
      </div>` : null}

      ${phase === "error" ? html`<div class="absolute inset-x-0 bottom-3 flex justify-center px-4"><div data-error class="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-error/15 text-error border border-error/25">${Icon("lucide:alert-triangle", "text-base shrink-0")}${T(t, error || "eFailed")}</div></div>` : null}
    </div>

    <!-- ── composer / actions ── -->
    ${phase === "ready" || phase === "editing" || phase === "error" ? html`<div class="shrink-0 bg-base-100 border-t border-base-300 px-3 pt-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <div class="relative">
        <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug pr-12" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey} disabled=${phase === "editing"}></textarea>
        <button data-dream aria-label=${T(t, "dream")} disabled=${suggesting || phase === "editing"} onClick=${() => { buzz(); dream(); }} class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-1.5 text-secondary">${Icon("lucide:dices", `text-lg ${suggesting ? "animate-pulse" : ""}`)}</button>
      </div>
      <div class="flex gap-2">
        <button data-new class="btn btn-ghost rounded-2xl gap-2 shrink-0 border border-base-content/10" aria-label=${T(t, "newImg")} disabled=${phase === "editing"} onClick=${backToChooser}>${Icon("lucide:image", "text-lg")}</button>
        <button data-edit class="btn btn-primary flex-1 rounded-2xl gap-2" disabled=${phase === "editing" || !prompt.trim()} onClick=${edit}>${Icon("lucide:wand-sparkles", "text-lg")}${T(t, phase === "error" ? "again" : "editBtn")}</button>
      </div>
    </div>` : null}

    ${isDone ? html`<div class="shrink-0 bg-base-100 border-t border-base-300 px-3 py-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <div class="flex gap-2">
        <button data-keep class="btn btn-primary flex-1 rounded-2xl gap-2" onClick=${keep}>${Icon("lucide:wand-sparkles", "text-lg")}${T(t, "keep")}</button>
        <button data-save class="btn btn-outline rounded-2xl gap-2 shrink-0" onClick=${save}>${Icon("lucide:download", "text-lg")}${T(t, "save")}</button>
      </div>
      <button data-revert class="btn btn-ghost btn-sm rounded-2xl gap-2 self-center text-base-content/70" onClick=${revert}>${Icon("lucide:undo-2", "text-base")}${T(t, "revert")}</button>
    </div>` : null}

    ${phase === "camera" && (!enabled || camErr) ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} privacy=${T(t, "primePrivacy")} privacyIcon="lucide:cloud-upload" onEnable=${() => { buzz(); setCamErr(null); setEnabled(true); }} onSettings=${() => S.screen.set("perms")} denied=${camErr === "denied"} unavailable=${camErr === "unavailable"} />` : null}
  </div>`;
}
