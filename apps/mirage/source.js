// Where a picture comes from, for the two modes that start with one: the chooser (upload · camera · the
// last picture made) and the viewfinder. Shared on purpose — `imagine` carried two copies of each.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Island } from "/_rt/ui.js";
import { CameraPrime } from "/_rt/camprime.js";
import { readLastGen } from "/_rt/lastgen.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// The chooser floats on the field as a frost island — a solid panel would punch a hole in the stage.
export function Chooser({ t, onPick, onCamera }) {
  const fileRef = useRef();
  const [last, setLast] = useState(null);
  useEffect(() => { if (!gate) readLastGen().then((v) => setLast(v?.url || null)).catch(() => {}); }, []);
  const onFile = (e) => { const f = e.target.files?.[0]; if (f) onPick(URL.createObjectURL(f)); e.target.value = ""; };
  return html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-pad)]">
    <input ref=${fileRef} type="file" accept="image/*" class="hidden" aria-hidden="true" onChange=${onFile} />
    <${Island} tone="frost" data-source className="w-full max-w-[17rem] flex flex-col gap-[var(--ms-gap)]">
      <div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${T(t, "pick")}</div>
      <button data-src-upload class="btn btn-primary rounded-full justify-start gap-2.5" onClick=${() => fileRef.current?.click()}>${Icon("lucide:upload", "text-lg")}${T(t, "srcUpload")}</button>
      <button data-src-camera class="btn rounded-full justify-start gap-2.5" onClick=${onCamera}>${Icon("lucide:camera", "text-lg")}${T(t, "srcCamera")}</button>
      ${last ? html`<button data-src-last class="btn btn-ghost rounded-full justify-start gap-2.5" onClick=${() => onPick(last)}>${Icon("lucide:sparkles", "text-lg")}${T(t, "srcLast")}</button>` : null}
    <//>
  </div>`;
}

// The viewfinder: primed before it opens (never a cold camera), the back stream while enabled, one shutter.
export function Camera({ t, loc, reason, onCapture, onClose, S }) {
  const videoRef = useRef(), streamRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (gate || !enabled) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setErr("unavailable"); return; }
    let live = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (!live) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current; if (v) { v.srcObject = stream; v.setAttribute?.("playsinline", ""); try { await v.play?.(); } catch { /* */ } }
      } catch (e) { if (live) setErr(e && e.name === "NotAllowedError" ? "denied" : "unavailable"); }
    })();
    return () => { live = false; try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* */ } streamRef.current = null; const v = videoRef.current; try { if (v) v.srcObject = null; } catch { /* */ } };
  }, [enabled]);
  const capture = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); onCapture(c.toDataURL("image/jpeg", 0.92)); } catch { /* capture blocked */ }
  };
  const on = enabled && !err;
  return html`<${Fragment}>
    <div class="absolute inset-0 rounded-[var(--ms-r)] overflow-hidden bg-black">
      <video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover ${on ? "" : "opacity-0"}`}></video>
      ${on ? html`<${Fragment}>
        <button data-cam-back aria-label=${T(t, "newPhoto")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white border-0" onClick=${onClose}>${Icon("lucide:x", "text-base")}</button>
        <button data-shutter aria-label=${T(t, "capture")} onClick=${capture} class="absolute left-1/2 -translate-x-1/2 bottom-5 w-[4.6rem] h-[4.6rem] rounded-full bg-white/10 sf-e3 flex items-center justify-center active:scale-95 transition-transform">
          <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
        </button>
      </${Fragment}>` : null}
    </div>
    ${on ? null : html`<${CameraPrime} loc=${loc} reason=${reason} privacy=${T(t, "primePrivacy")} privacyIcon="lucide:cloud-upload"
      onEnable=${() => { setErr(null); setEnabled(true); }} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable"} />`}
  </${Fragment}>`;
}
