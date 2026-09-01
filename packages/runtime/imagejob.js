/* @ts-self-types="./imagejob.d.ts" */
/**
 * # runtime/imagejob.js — the image race, client side
 *
 * One shape for every generation the edge runs (text→image, image→image, blend, style): a POST starts a
 * job, short polls carry it — a cold Space can take well over a minute and nginx caps a single `/feed`
 * request at 60 s, so the wait lives in polls that each return in milliseconds. Every poll says how many
 * pictures exist; each picture's bytes are one more GET, pulled the moment it lands rather than at the
 * end. Lifted from mirage's `race.js` when a second app (vydyvo, the living screensaver) needed the same
 * protocol — the wire contract belongs to the runtime, not to an app.
 *
 * ![The imagejob module's map: start, follow, cancel, and the edge's slides protocol](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-imagejob.svg)
 *
 * ## Import
 * ```js
 * import { startJob, follow, cancelJob } from "/_rt/imagejob.js";                    // an app's page: the import map resolves /_rt/
 * import { startJob, follow, cancelJob } from "@microspec/core/runtime/imagejob.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link startJob} — `(base, body)` POSTs the job and resolves its id; throws `{ code }` with the i18n key a view should show.
 * - {@link follow} — `({ base, job, alive, onLive, onSlide })` polls until the race ends; resolves `"done" | "error" | "busy" | "timeout" | "stale"`.
 * - {@link cancelJob} — `(base, job)` tells the edge to stop a race nobody will watch; fire-and-forget.
 * - {@link POLLS} · {@link EVERY} — the poll budget (135 × 1500 ms ≈ 200 s), exported so a caller can size its own timers.
 *
 * ## In practice
 * ```js
 * import { startJob, follow } from "/_rt/imagejob.js";                                 // apps/vydyvo/state.js
 * import { VPS_PROXY } from "/_rt/feed.js";
 *
 * const base = `${VPS_PROXY}/image`;
 * const job = await startJob(base, { prompt, quality: "2k", aspect: "screen", ratio, seed, k: 2 });
 * const status = await follow({ base, job, alive: () => run === runs, onSlide: (s) => frames.push(s) });
 * ```
 *
 * ## How it fits
 * Imports nothing from the runtime. `apps/vydyvo/state.js` consumes it; `apps/mirage/race.js` still carries
 * its own copy of the same protocol (the extension `.ext` of a landed blob is the one thing mirage adds).
 *
 * ## Invariants and pitfalls
 * - The poll budget must OUTLAST the edge's own race budget: a client that gave up at 150 s threw away a
 *   picture that landed at 160 s (measured 2026-08-20). 135 × 1.5 s it is.
 * - `alive()` is the caller's staleness guard — a superseded run resolves `"stale"` and lands nothing.
 * - `k > 1` is the SLIDES protocol and the only one that honours `aspect` + `ratio`; `k: 1` returns the
 *   single picture's bytes from the status URL itself, which this follower does not read.
 * - `"busy"` is capacity, not words: every Space queued out or refused. Back off; do not retry at once.
 * - Running out of polls CANCELS the job on the edge, or it spends the day's quota on pictures nobody reads.
 * @module
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll count — 135 × {@link EVERY} ≈ 200 s, past the edge's own race budget. */
export const POLLS = 135;
/** Poll period in milliseconds. */
export const EVERY = 1500;
const json = { "content-type": "application/json" };

/**
 * Start a generation job.
 * @param base the route, e.g. `${VPS_PROXY}/image`
 * @param body the job body (`prompt`, `quality`, `aspect`, `ratio`, `seed`, `k`, `model`, or an edit's `image`/`images`)
 * @returns the job id
 * @throws `{ code }` — `eNetwork` (fetch threw), `eRate` (429), `eBig` (413), `eSignIn` (401), `eFailed` (any other refusal or no id)
 */
export async function startJob(base, body) {
  let r;
  try { r = await fetch(base, { method: "POST", headers: json, body: JSON.stringify(body) }); }
  catch { throw { code: "eNetwork" }; }
  if (!r.ok) throw { code: r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : r.status === 401 ? "eSignIn" : "eFailed" };
  const { job } = await r.json().catch(() => ({}));
  if (!job) throw { code: "eFailed" };
  return job;
}

/**
 * Follow a job to its end.
 * @param opts `base` the route · `job` the id · `alive()` the caller's staleness guard · `onLive(meta)` mirrors the worker's progress · `onSlide(slide)` fires per picture as it lands: `{ url, blob, w, h, by, n }`
 * @returns `"done" | "error" | "busy" | "timeout" | "stale"`
 */
export async function follow({ base, job, alive = () => true, onLive, onSlide }) {
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
            onSlide?.({ url: URL.createObjectURL(blob), blob, w: meta.w, h: meta.h, by: meta.by, n });
          }
        } catch { /* a variant that failed to transfer is skipped; the rest still land */ }
        got = n + 1;
      }
      if (j.status === "done" || j.status === "error") return j.status === "error" && j.error === "busy" ? "busy" : j.status;
    }
    cancelJob(base, job);
    return "timeout";
  } catch { return "error"; }
}

/**
 * Cancel a job on the edge (idempotent, fire-and-forget).
 * @param base the route
 * @param job the id; a falsy id is a no-op
 */
export function cancelJob(base, job) {
  if (job) fetch(`${base}/cancel`, { method: "POST", headers: json, body: JSON.stringify({ job }) }).catch(() => {});
}
