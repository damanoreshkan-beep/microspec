// pwned — k-anonymity password-breach check. Pure pipeline is systemic + unit-tested (/_rt/pwned.js); this
// view owns the transport + the taste. Hero screen (2027, motion): the check plays as an animated
// k-anonymity PIPELINE — the SHA-1 is shown split (the 5 chars that leave vs the 35 that stay), a beam
// travels the timeline, nodes activate in sequence, and the verdict springs in with a counting odometer.
// The password is never stored, never logged. (Other tabs untouched — profile is runtime-rendered.)
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate, stagger } from "motion";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { sha1hex, splitHash, lookup } from "/_rt/pwned.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const RANGE = "https://api.pwnedpasswords.com/range/";
const SAMPLE_HEX = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";   // SHA-1("password") — the gate fixture
const SAMPLE_COUNT = 3861493;
const NODES = [["lucide:fingerprint", "step1"], ["lucide:scissors", "step2"], ["lucide:cloud-upload", "step3"], ["lucide:list-checks", "step4"]];

export function check({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const seed = gate ? { pw: "password", hex: SAMPLE_HEX, res: { count: SAMPLE_COUNT, pwned: true }, status: "done" } : {};
  const [pw, setPw] = useState(seed.pw || "");
  const [reveal, setReveal] = useState(false);
  const [hex, setHex] = useState(seed.hex || "");
  const [res, setRes] = useState(seed.res || null);
  const [status, setStatus] = useState(seed.status || "idle");
  const [display, setDisplay] = useState(seed.res ? SAMPLE_COUNT : 0);

  const beamRef = useRef(), glowRef = useRef(), pipeRef = useRef(), verdictRef = useRef();

  // live, on-device hash as you type — nothing leaves here
  useEffect(() => {
    let alive = true;
    if (!pw) { setHex(""); setRes(null); setStatus("idle"); return; }
    if (gate && pw === "password") { setHex(SAMPLE_HEX); return; }
    sha1hex(pw).then((h) => { if (alive) { setHex(h); setRes(null); setStatus("idle"); } });
    return () => { alive = false; };
  }, [pw]);

  // ambient motion: a beam travels the timeline; the verdict aura breathes
  useEffect(() => {
    const stops = [];
    if (beamRef.current) stops.push(animate(beamRef.current, { top: ["4%", "96%"], opacity: [0, 1, 1, 0] }, { duration: 2.6, repeat: Infinity, ease: "easeInOut" }));
    return () => stops.forEach((a) => a.stop());
  }, [hex ? 1 : 0]);
  useEffect(() => {
    if (!glowRef.current || !res) return;
    const a = animate(glowRef.current, { opacity: [0.25, 0.5, 0.25], scale: [0.92, 1.06, 0.92] }, { duration: 3.6, repeat: Infinity, ease: "easeInOut" });
    return () => a.stop();
  }, [res && res.pwned]);

  // pipeline nodes stagger in when the hash appears
  useEffect(() => {
    if (!pipeRef.current) return;
    const nodes = pipeRef.current.querySelectorAll("[data-node]");
    if (nodes.length) animate(nodes, { opacity: [0, 1], x: [-10, 0] }, { delay: stagger(0.09), duration: 0.45, ease: "easeOut" });
  }, [hex ? 1 : 0]);

  // verdict springs in + the count odometer runs
  useEffect(() => {
    if (status !== "done" || !res) return;
    if (verdictRef.current) animate(verdictRef.current, { opacity: [0, 1], scale: [0.88, 1], y: [14, 0] }, { duration: 0.55, ease: [0.2, 0.9, 0.2, 1] });
    if (res.pwned) { setDisplay(0); const a = animate(0, res.count, { duration: 1.3, ease: "easeOut", onUpdate: (v) => setDisplay(Math.floor(v)) }); return () => a.stop(); }
  }, [status, res]);

  const { prefix, suffix } = hex ? splitHash(hex) : { prefix: "", suffix: "" };
  const fmt = (n) => n.toLocaleString(locale === "en" ? "en-US" : "uk-UA");

  const run = async () => {
    if (!hex || status === "checking") return;
    setStatus("checking");
    try {
      const text = gate ? `${suffix}:${SAMPLE_COUNT}\nAAAA:1` : await fetch(RANGE + prefix).then((r) => { if (!r.ok) throw new Error("net"); return r.text(); });
      const count = lookup(suffix, text);
      setRes({ count, pwned: count > 0 }); setStatus("done");
    } catch { setStatus("error"); }
  };

  return html`<div class="w-full min-w-0 py-5 flex flex-col gap-5 max-w-md mx-auto">

    <!-- input -->
    <div class="group rounded-3xl bg-base-100/70 backdrop-blur-xl border border-base-content/10 focus-within:border-primary/50 transition-colors p-1.5 pl-4 flex items-center gap-2 shadow-lg shadow-black/5">
      ${Icon("lucide:key-round", "text-lg text-base-content/40 shrink-0")}
      <input data-pw type=${reveal ? "text" : "password"} value=${pw} onInput=${(e) => setPw(e.currentTarget.value)}
        aria-label=${T(t, "pwLabel")} placeholder=${T(t, "pwPlaceholder")} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        class="input input-ghost flex-1 min-w-0 bg-transparent px-1 text-base focus:outline-none" />
      <button data-reveal aria-label=${T(t, reveal ? "hide" : "show")} onClick=${() => setReveal((v) => !v)} class="btn btn-ghost btn-circle btn-sm text-base-content/60">${Icon(reveal ? "lucide:eye-off" : "lucide:eye", "text-lg")}</button>
    </div>

    <!-- the hash, split: the 5 that leave vs the 35 that stay -->
    ${hex ? html`<div class="rounded-3xl bg-base-100/50 border border-base-content/10 p-4 flex flex-col gap-3 min-w-0">
      <div class="flex items-center gap-2 text-[11px] uppercase tracking-widest text-base-content/40 font-mono">${Icon("lucide:hash", "text-sm")}SHA-1</div>
      <div data-hash class="font-mono text-sm break-all leading-relaxed min-w-0">
        <span class="inline-flex items-center rounded-md bg-primary/15 text-primary font-bold px-1.5 py-0.5 mr-0.5 ring-1 ring-primary/30">${prefix}</span><span class="text-base-content/45 tracking-tight">${suffix}</span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs min-w-0">
        <div class="flex items-center gap-1.5 min-w-0"><span class="w-2 h-2 rounded-full bg-primary shrink-0"></span><span class="text-base-content/70 truncate">${T(t, "sentLabel")}</span></div>
        <div class="flex items-center gap-1.5 min-w-0"><span class="w-2 h-2 rounded-full bg-base-content/40 shrink-0"></span><span class="text-base-content/70 truncate">${T(t, "localLabel")}</span></div>
      </div>
    </div>` : null}

    <button data-check onClick=${run} disabled=${!hex || status === "checking"} class="btn btn-primary rounded-2xl h-12 gap-2 shadow-lg shadow-primary/20 disabled:shadow-none">
      ${Icon("lucide:shield-search", "text-lg")}${T(t, status === "checking" ? "checking" : "checkBtn")}
    </button>

    <!-- the k-anonymity pipeline (the motion hero) -->
    <div ref=${pipeRef} class="relative rounded-3xl bg-base-100/40 border border-base-content/10 p-4 pl-3 min-w-0 overflow-hidden">
      <div class="absolute left-[1.85rem] top-6 bottom-6 w-px bg-base-content/12"></div>
      <div ref=${beamRef} class="absolute left-[1.85rem] -translate-x-1/2 w-1 h-10 rounded-full bg-gradient-to-b from-transparent via-primary to-transparent blur-[1px] pointer-events-none" style="top:4%"></div>
      <div class="flex flex-col gap-3.5 relative">
        ${NODES.map(([ic, k], i) => html`<div data-node class="flex items-center gap-3 min-w-0" key=${k}>
          <span class="w-9 h-9 rounded-full bg-base-200 border border-base-content/10 text-base-content/70 flex items-center justify-center shrink-0 shadow-sm">${Icon(ic, "text-base")}</span>
          <div class="text-sm text-base-content/80 min-w-0">${T(t, k)}</div>
        </div>`)}
      </div>
    </div>

    <!-- verdict -->
    ${res && status === "done" ? html`<div ref=${verdictRef} data-verdict data-pwned=${String(res.pwned)} class="relative rounded-3xl p-6 flex flex-col items-center gap-1.5 min-w-0 overflow-hidden border ${res.pwned ? "border-error/25" : "border-success/25"}">
      <div ref=${glowRef} class=${`absolute -z-0 w-40 h-40 rounded-full blur-3xl ${res.pwned ? "bg-error/25" : "bg-success/25"}`} style="opacity:.35"></div>
      <div class="relative z-10 flex flex-col items-center gap-1.5 min-w-0">
        <div class=${`w-16 h-16 rounded-2xl flex items-center justify-center ${res.pwned ? "bg-error/15" : "bg-success/15"}`}>
          ${Icon(res.pwned ? "lucide:shield-alert" : "lucide:shield-check", `text-4xl ${res.pwned ? "text-error" : "text-success"}`)}
        </div>
        <div class=${`text-lg font-semibold mt-1 ${res.pwned ? "text-error" : "text-success"}`}>${T(t, res.pwned ? "vPwned" : "vClean")}</div>
        ${res.pwned
      ? html`<div class="text-center"><div data-count class="text-3xl font-bold tabular-nums tracking-tight break-all">${fmt(display)}</div><div class="text-xs text-base-content/60 mt-0.5">${T(t, "vPwnedSub")}</div></div>`
      : html`<div class="text-sm text-base-content/75 text-center max-w-[15rem]">${T(t, "vCleanSub")}</div>`}
      </div>
    </div>` : null}
    ${status === "error" ? html`<div data-error class="text-sm text-error text-center py-2">${T(t, "errMsg")}</div>` : null}
  </div>`;
}
