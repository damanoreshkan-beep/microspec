// The race, client side — ONE shape for text→image and image→image. POST starts it, short polls carry it:
// a cold Space can take well over a minute and nginx caps a single /feed request at 60s, so the wait lives
// in polls that each return in milliseconds. Every poll says how many variants exist; each variant's bytes
// are one more GET, pulled the moment it lands rather than at the end.
import { extOf } from "./bitmap.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLLS = 135, EVERY = 1500;   // ~200s: it must OUTLAST the edge's own race budget (measured 2026-08-20 —
                                   // a client that gave up at 150s threw away a picture that landed at 160s)
const json = { "content-type": "application/json" };

// → job id. Throws { code } with the i18n key the view should show.
export async function startJob(base, body) {
  let r;
  try { r = await fetch(base, { method: "POST", headers: json, body: JSON.stringify(body) }); }
  catch { throw { code: "eNetwork" }; }
  if (!r.ok) throw { code: r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : "eFailed" };
  const { job } = await r.json().catch(() => ({}));
  if (!job) throw { code: "eFailed" };
  return job;
}

// Follow a job to its end. `alive()` is the caller's staleness guard; `onLive(meta)` mirrors the worker's
// progress; `onSlide(slide)` fires per picture as it lands. Resolves "done" | "error" | "timeout" | "stale".
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
        } catch { /* a variant that failed to transfer is skipped; the rest still land */ }
        got = n + 1;
      }
      if (j.status === "done" || j.status === "error") return j.status;
    }
    cancelJob(base, job);   // out of polls: stop the worker, or it spends the day's quota on pictures nobody reads
    return "timeout";
  } catch { return "error"; }
}

export function cancelJob(base, job) {
  if (job) fetch(`${base}/cancel`, { method: "POST", headers: json, body: JSON.stringify({ job }) }).catch(() => {});
}
