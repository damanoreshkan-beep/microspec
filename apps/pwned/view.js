// pwned — k-anonymity password-breach check. The pure pipeline (SHA-1, split, parse, lookup) is systemic +
// unit-tested (/_rt/pwned.js); this view owns the transport + the taste. Transparency IS the feature: the
// full SHA-1 is shown split-coloured (the 5-char prefix that's SENT vs the 35 chars that STAY), and a 4-step
// explainer makes the protection self-evident. The password is never stored, never logged.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { sha1hex, splitHash, lookup } from "/_rt/pwned.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const RANGE = "https://api.pwnedpasswords.com/range/";
const SAMPLE_HEX = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";   // SHA-1("password") — the gate fixture
const SAMPLE_COUNT = 3861493;
const STEPS = [["lucide:fingerprint", "step1"], ["lucide:scissors", "step2"], ["lucide:cloud-upload", "step3"], ["lucide:list-checks", "step4"]];

export function check({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const seed = gate ? { pw: "password", hex: SAMPLE_HEX, res: { count: SAMPLE_COUNT, pwned: true }, status: "done" } : {};
  const [pw, setPw] = useState(seed.pw || "");
  const [reveal, setReveal] = useState(false);
  const [hex, setHex] = useState(seed.hex || "");
  const [res, setRes] = useState(seed.res || null);
  const [status, setStatus] = useState(seed.status || "idle");

  // live, on-device hash as you type — nothing leaves here
  useEffect(() => {
    let alive = true;
    if (!pw) { setHex(""); setRes(null); setStatus("idle"); return; }
    if (gate && pw === "password") { setHex(SAMPLE_HEX); return; }
    sha1hex(pw).then((h) => { if (alive) { setHex(h); setRes(null); setStatus("idle"); } });
    return () => { alive = false; };
  }, [pw]);

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

  return html`<div class="px-4 py-4 flex flex-col gap-4 max-w-md mx-auto">
    <div class="rounded-3xl bg-base-100/80 backdrop-blur-xl border border-base-content/10 p-2 pl-4 flex items-center gap-2">
      <input data-pw type=${reveal ? "text" : "password"} value=${pw} onInput=${(e) => setPw(e.currentTarget.value)}
        aria-label=${T(t, "pwLabel")} placeholder=${T(t, "pwPlaceholder")} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        class="flex-1 bg-transparent text-base focus:outline-none" />
      <button data-reveal aria-label=${T(t, reveal ? "hide" : "show")} onClick=${() => setReveal((v) => !v)} class="btn btn-ghost btn-circle btn-sm text-base-content/70">${Icon(reveal ? "lucide:eye-off" : "lucide:eye", "text-lg")}</button>
    </div>

    ${hex ? html`<div class="rounded-3xl bg-base-100/60 border border-base-content/10 p-4 flex flex-col gap-3">
      <div data-hash class="font-mono text-sm break-all leading-relaxed tracking-tight">
        <span class="text-primary font-semibold">${prefix}</span><span class="text-base-content/45">${suffix}</span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-primary shrink-0"></span><span class="text-base-content/70">${T(t, "sentLabel")}</span></div>
        <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-base-content/40 shrink-0"></span><span class="text-base-content/70">${T(t, "localLabel")}</span></div>
      </div>
    </div>` : null}

    <button data-check onClick=${run} disabled=${!hex || status === "checking"} class="btn btn-primary rounded-2xl gap-2">
      ${Icon("lucide:shield-search", "text-lg")}${T(t, status === "checking" ? "checking" : "checkBtn")}
    </button>

    ${res && status === "done" ? html`<div data-verdict data-pwned=${String(res.pwned)} class=${`rounded-3xl p-5 flex flex-col items-center gap-2 border ${res.pwned ? "bg-error/10 border-error/30" : "bg-success/10 border-success/30"}`}>
      ${Icon(res.pwned ? "lucide:shield-alert" : "lucide:shield-check", `text-4xl ${res.pwned ? "text-error" : "text-success"}`)}
      <div class="text-lg font-semibold">${T(t, res.pwned ? "vPwned" : "vClean")}</div>
      ${res.pwned
      ? html`<div class="text-center mt-1"><div class="text-3xl font-bold tabular-nums">${fmt(res.count)}</div><div class="text-xs text-base-content/70 mt-0.5">${T(t, "vPwnedSub")}</div></div>`
      : html`<div class="text-sm text-base-content/80 text-center max-w-[16rem]">${T(t, "vCleanSub")}</div>`}
    </div>` : null}
    ${status === "error" ? html`<div data-error class="text-sm text-error text-center py-2">${T(t, "errMsg")}</div>` : null}

    <div class="rounded-3xl bg-base-100/60 border border-base-content/10 divide-y divide-base-content/10 mt-1">
      ${STEPS.map(([ic, k], i) => html`<div class="flex items-center gap-3 p-3.5" key=${k}>
        <span class="w-7 h-7 rounded-full bg-base-200 text-base-content/70 flex items-center justify-center shrink-0 font-mono text-xs">${i + 1}</span>
        ${Icon(ic, "text-lg text-base-content/60 shrink-0")}
        <div class="text-sm text-base-content/80">${T(t, k)}</div>
      </div>`)}
    </div>
  </div>`;
}
