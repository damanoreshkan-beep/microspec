import { extOf } from "./bitmap.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLLS = 135, EVERY = 1500;   
const json = { "content-type": "application/json" };

export async function startJob(base, body) {
  let r;
  try { r = await fetch(base, { method: "POST", headers: json, body: JSON.stringify(body) }); }
  catch { throw { code: "eNetwork" }; }
  if (!r.ok) throw { code: r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : "eFailed" };
  const { job } = await r.json().catch(() => ({}));
  if (!job) throw { code: "eFailed" };
  return job;
}

export async function follow({ base, job, alive, onLive, onSlide }) {
  let got = 0;
  try {
    for (let i = 0; i < POLLS; i++) {
      await sleep(EVERY);
      if (!alive()) return "stale";
      let j; try { j = await (await fetch(`${base}/get?job=${job}`)).json(); } catch { continue; }
      if (!alive() || !j) return "stale";
      onLive?.({ stage: j.stage, phase: j.phase, step: j.step, steps: j.steps, eta: j.eta, pct: j.pct, got: j.got || 0 });
      for (let n = got; n < (j.got || 0); n++) {
        try {
          const pr = await fetch(`${base}/get?job=${job}&n=${n}`);
          if (!alive()) return "stale";
          if ((pr.headers.get("content-type") || "").startsWith("image/")) {
            const blob = await pr.blob(), meta = (j.slides || [])[n] || {};
            onSlide({ url: URL.createObjectURL(blob), w: meta.w, h: meta.h, by: meta.by, ext: extOf(blob), n });
          }
        } catch {  }
        got = n + 1;
      }
      if (j.status === "done" || j.status === "error") return j.status === "error" && j.error === "busy" ? "busy" : j.status;   
    }
    cancelJob(base, job);   
    return "timeout";
  } catch { return "error"; }
}

export function cancelJob(base, job) {
  if (job) fetch(`${base}/cancel`, { method: "POST", headers: json, body: JSON.stringify({ job }) }).catch(() => {});
}
