// The pipeline, as state + actions that OUTLIVE the view. The runtime mounts one tab at a time, so a
// picture that cost 30s and a GPU minute must not live in useState; and a race that is half-way when the
// tab goes away must keep landing its variants into the same atoms the view will read when it comes back.
// Everything here is module-level; view.js subscribes and renders.
import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { toEnglish } from "/_rt/translate.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { mockArt, toDataURL } from "./bitmap.js";
import { startJob, follow, cancelJob } from "./race.js";

export const MODES = ["make", "edit", "read"];
export const GATE_PROMPT = "northern lights over a frozen lake, cinematic, ultra detailed";
export const GATE_TEXT = "Гірське озеро на світанку: дзеркальна вода віддзеркалює рожеві піки, над берегом стелиться легкий туман. Тиша, прохолода і золоте світло перших променів.\n\nгори, озеро, світанок, туман, тиша";
const K = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const JOB_KEY = (mode) => `ms:mirage:job:${mode}`;
const OPTS_KEY = "ms:mirage:opts";
const BASE = { make: `${VPS_PROXY}/image`, edit: `${VPS_PROXY}/image/edit` };

// ── atoms ────────────────────────────────────────────────────────────────────────────────────────────
export const $mode = atom("make");
// make: idle | working | done | error
export const $make = atom({ prompt: gate ? GATE_PROMPT : "", phase: gate ? "done" : "idle",
  slides: gate ? [7, 8, 9, 10].map((s) => ({ url: mockArt(s), seed: s })) : [], idx: 0, more: false, error: null, live: null, t0: 0 });
// edit: empty | camera | ready | working | done | error   (src = the picture being reworked, original = the first one loaded)
export const $edit = atom({ prompt: "", phase: gate ? "ready" : "empty", src: gate ? mockArt(3) : null, original: gate ? mockArt(3) : null,
  slides: [], idx: 0, more: false, error: null, live: null, t0: 0 });
// read: empty | camera | ready | working | done | error
export const $read = atom({ question: "", phase: gate ? "ready" : "empty", src: gate ? mockArt(5) : null, text: "", error: null });
const DEFAULT_OPTS = { quality: "2k", aspect: "screen", model: { make: "auto", edit: "auto", read: "auto" } };
const loadOpts = () => { try { const v = JSON.parse(localStorage.getItem(OPTS_KEY) || "null"); if (v?.quality && v?.aspect) return { ...DEFAULT_OPTS, ...v, model: { ...DEFAULT_OPTS.model, ...(v.model || {}) } }; } catch { /* */ } return DEFAULT_OPTS; };
export const $opts = atom(loadOpts());
export const setOpts = (p) => { const v = { ...$opts.get(), ...p }; $opts.set(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)); } catch { /* */ } };
export const setModel = (mode, id) => setOpts({ model: { ...$opts.get().model, [mode]: id || "auto" } });
const modelFor = (mode) => { const m = $opts.get().model[mode]; return m && m !== "auto" ? m : null; };

// ── the catalogue: what the edge can run right now, with HF's word on whether each Space is alive ─────────
// Fetched when the options sheet opens, kept 5 min; `fresh` re-probes. Under the gate a fixed list.
const KIND = { make: "gen", edit: "edit", read: "read" };
const GATE_MODELS = { gen: [{ id: "black-forest-labs/FLUX.1-schnell", tier: "2k", alive: true }, { id: "mrfakename/Z-Image-Turbo", tier: "fast", alive: true }, { id: "krea/Krea-2", tier: "fast", alive: null }],
  edit: [{ id: "LPX55/Qwen-Image-Edit-2511-Turbo-Lightning", tier: "edit", alive: true }, { id: "JitRoy2024/Qwen_Img_Space", tier: "edit", alive: true }], read: [{ id: "ovh/Qwen2.5-VL-72B", tier: "vision", alive: null }] };
export const $models = atom({ gen: [], edit: [], read: [], at: 0, loading: false, error: false });
export async function loadModels(fresh = false) {
  const cur = $models.get();
  if (gate) { if (!cur.at) $models.set({ ...GATE_MODELS, at: Date.now(), loading: false, error: false }); return; }
  if (cur.loading || (!fresh && cur.at && Date.now() - cur.at < 5 * 60_000)) return;
  $models.set({ ...cur, loading: true, error: false });
  try {
    const r = await fetch(VPS_PROXY + "/image/models" + (fresh ? "?fresh=1" : ""));
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    $models.set({ gen: j.gen || [], edit: j.edit || [], read: j.read || [], at: Date.now(), loading: false, error: false });
  } catch { $models.set({ ...$models.get(), loading: false, error: true }); }
}
// the models a mode may pick from: alive or unknown — a Space HF calls dead is never offered
export const modelsFor = (mode) => ($models.get()[KIND[mode]] || []).filter((m) => m.alive !== false);

const ATOM = { make: $make, edit: $edit, read: $read };
export const patch = (mode, p) => { const a = ATOM[mode]; a.set({ ...a.get(), ...(typeof p === "function" ? p(a.get()) : p) }); };

// one run counter, one job, one background hold per racing mode — a superseded run can never land
const runs = { make: 0, edit: 0, read: 0 }, jobs = { make: null, edit: null }, holds = { make: null, edit: null };

const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { /* */ } } };
// free a set of slides, except any URL that moved on to live somewhere else (a hand-off, a keep)
const freeSlides = (list, keep = []) => list.forEach((s) => { if (!keep.includes(s.url)) revoke(s.url); });
const stillHeld = (url) => [$edit.get().src, $edit.get().original, $read.get().src, ...$make.get().slides.map((s) => s.url), ...$edit.get().slides.map((s) => s.url)].includes(url);

// ── the race (make + edit share it; only the route and the body differ) ──────────────────────────────
// ctx = { t } — the dictionary at the moment the run starts, for the notification and the hold's words.
async function race(mode, body, run, ctx, seed) {
  const base = BASE[mode];
  const alive = () => run === runs[mode];
  let job;
  try { job = await startJob(base, body); } catch (e) { return fail(mode, run, e.code || "eNetwork"); }
  if (!alive()) { cancelJob(base, job); return; }
  jobs[mode] = job;
  const t0 = Date.now();
  try { localStorage.setItem(JOB_KEY(mode), JSON.stringify({ job, prompt: body.prompt, seed, ts: t0, quality: body.quality })); } catch { /* */ }
  patch(mode, { t0 });
  await followJob(mode, job, run, ctx, seed);
}

async function followJob(mode, job, run, ctx, seed) {
  const base = BASE[mode], alive = () => run === runs[mode];
  const release = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, mode === "edit" ? "reworking" : "working") });
  holds[mode] = release;
  const mine = [];
  const status = await follow({
    base, job, alive,
    onLive: (live) => patch(mode, { live }),
    onSlide: (s) => {
      mine.push({ ...s, seed: seed + s.n });
      patch(mode, { slides: [...mine], more: true, ...(mine.length === 1 ? { idx: 0, phase: "done" } : {}) });
      if (mine.length === 1) {
        if (mode === "make") writeLastGen(s.url, $make.get().prompt).catch(() => {});
        if (document.visibilityState === "hidden") notify({ id: `mirage-${mode}`, title: T(ctx.t, "title"), body: T(ctx.t, "notifDone"), url: "./" });
      }
    },
  });
  if (status === "stale") return;
  release(); holds[mode] = null; jobs[mode] = null;
  try { localStorage.removeItem(JOB_KEY(mode)); } catch { /* */ }
  patch(mode, { more: false, live: null });
  if (!mine.length) fail(mode, run, status === "timeout" ? "eTimeout" : status === "busy" ? "eBusy" : "eFailed");
}

function fail(mode, run, code) {
  if (run !== runs[mode]) return;
  holds[mode]?.(); holds[mode] = null; jobs[mode] = null;
  patch(mode, { error: code, phase: "error", more: false, live: null });
}

// ── make ─────────────────────────────────────────────────────────────────────────────────────────────
export async function conjure(ctx) {
  const st = $make.get(), p = st.prompt.trim();
  if (!p || st.phase === "working") return;
  const seed = randSeed(), run = ++runs.make;
  holds.make?.(); holds.make = null;
  freeSlides(st.slides, [$edit.get().src, $edit.get().original, $read.get().src]);
  patch("make", { slides: [], idx: 0, more: false, error: null, live: null, phase: "working", t0: Date.now() });
  if (gate) { await sleep(90); if (run === runs.make) patch("make", { slides: [seed, seed + 1, seed + 2, seed + 3].map((s) => ({ url: mockArt(s), seed: s })), phase: "done" }); return; }
  notifyAsk();
  patch("make", { live: { stage: "translate" } });
  let pEn = p; try { pEn = await toEnglish(p); } catch { /* the Spaces prefer English; the original still runs */ }
  if (run !== runs.make) return;
  const { quality, aspect } = $opts.get();
  const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
  await race("make", { prompt: pEn, quality, aspect, ratio, seed, k: K, model: modelFor("make") }, run, ctx, seed);
}

// ── edit ─────────────────────────────────────────────────────────────────────────────────────────────
export async function rework(ctx) {
  const st = $edit.get(), p = st.prompt.trim();
  if (!p || !st.src || st.phase === "working") return;
  const seed = randSeed(), run = ++runs.edit;
  holds.edit?.(); holds.edit = null;
  freeSlides(st.slides, [st.src, st.original, $read.get().src]);
  patch("edit", { slides: [], idx: 0, more: false, error: null, live: null, phase: "working", t0: Date.now() });
  if (gate) { await sleep(120); if (run === runs.edit) patch("edit", { slides: [0, 1, 2, 3].map((n) => ({ url: mockArt(seed + n), seed: seed + n })), phase: "done" }); return; }
  notifyAsk();
  let image;
  try { image = await toDataURL(st.src); } catch { return fail("edit", run, "eFailed"); }
  if (run !== runs.edit) return;
  if (image.length > 9_000_000) return fail("edit", run, "eBig");
  patch("edit", { live: { stage: "translate" } });
  let pEn = p; try { pEn = await toEnglish(p); } catch { /* */ }
  if (run !== runs.edit) return;
  await race("edit", { image, prompt: pEn, seed, k: K, model: modelFor("edit") }, run, ctx, seed);
}

// the result becomes the new base — a chain of reworks is one tap per link
export function keepEditing() {
  const st = $edit.get(), cur = st.slides[st.idx] || st.slides[0];
  if (!cur) return;
  freeSlides(st.slides, [cur.url, st.original]);
  patch("edit", { src: cur.url, slides: [], idx: 0, more: false, prompt: "", error: null, phase: "ready" });
}

// ── read ─────────────────────────────────────────────────────────────────────────────────────────────
const ASK = {
  uk: { read: "Опиши це зображення українською: 2–3 речення про те, що на ньому і який настрій, потім окремим рядком до 5 ключових тегів через кому.", q: "Відповідай українською, коротко і по суті, спираючись лише на це зображення. Питання: " },
  en: { read: "Describe this image in English: 2–3 sentences on what is in it and its mood, then, on a separate line, up to 5 key tags separated by commas.", q: "Answer in English, briefly and to the point, from this image alone. Question: " },
};
export async function readPhoto(ctx) {
  const st = $read.get();
  if (!st.src || st.phase === "working") return;
  const run = ++runs.read, q = st.question.trim();
  patch("read", { error: null, text: "", phase: "working" });
  if (gate) { await sleep(120); if (run === runs.read) patch("read", { text: q ? GATE_TEXT.split("\n")[0] : GATE_TEXT, phase: "done" }); return true; }
  let image;
  try { image = await toDataURL(st.src); } catch { return fail("read", run, "eRead"); }
  if (run !== runs.read) return;
  if (image.length > 9_000_000) return fail("read", run, "eBig");
  const ask = ASK[ctx.loc] || ASK.en;
  try {
    const r = await fetch(`${VPS_PROXY}/vision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, prompt: q ? ask.q + q : ask.read, maxTokens: 400, model: modelFor("read") }) });
    if (run !== runs.read) return;
    if (!r.ok) return fail("read", run, r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : "eRead");
    const j = await r.json().catch(() => null);
    if (run !== runs.read) return;
    const out = String(j?.text || "").trim();
    if (!out) return fail("read", run, "eRead");
    patch("read", { text: out, phase: "done" });
    return true;
  } catch { fail("read", run, "eNetwork"); }
}

// ── cancel / sources / hand-offs ─────────────────────────────────────────────────────────────────────
export function cancel(mode) {
  const st = ATOM[mode].get();
  if (st.phase !== "working") return;
  runs[mode]++;
  if (mode !== "read") {
    const job = jobs[mode]; jobs[mode] = null;
    holds[mode]?.(); holds[mode] = null;
    if (job && !gate) cancelJob(BASE[mode], job);
    try { localStorage.removeItem(JOB_KEY(mode)); } catch { /* */ }
    patch(mode, { more: false, live: null, phase: st.slides.length ? "done" : mode === "make" ? "idle" : "ready" });
  } else patch("read", { phase: "ready" });
}

// a new source for edit/read; the previous set is freed unless another mode still shows it
export function setSource(mode, url) {
  const st = ATOM[mode].get();
  if (mode === "edit") {
    freeSlides(st.slides, [url]);
    [st.src, st.original].forEach((u) => { if (u && u !== url && !stillHeld(u)) revoke(u); });
    patch("edit", { src: url, original: url, slides: [], idx: 0, more: false, error: null, prompt: "", phase: "ready" });
  } else {
    if (st.src && st.src !== url && !stillHeld(st.src)) revoke(st.src);
    patch("read", { src: url, text: "", error: null, question: "", phase: "ready" });
  }
}
export function clearSource(mode) {
  runs[mode]++;
  const st = ATOM[mode].get();
  if (mode === "edit") { freeSlides(st.slides); patch("edit", { src: null, original: null, slides: [], idx: 0, more: false, error: null, phase: "empty" }); [st.src, st.original].forEach((u) => { if (u && !stillHeld(u)) revoke(u); }); }
  else { patch("read", { src: null, text: "", error: null, phase: "empty" }); if (st.src && !stillHeld(st.src)) revoke(st.src); }
}
export const toRead = (url) => { setSource("read", url); $mode.set("read"); };
export const toEdit = (url, prompt = "") => { setSource("edit", url); if (prompt) patch("edit", { prompt }); $mode.set("edit"); };
const oneLine = (s) => s.replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").trim();
export const readToMake = () => { patch("make", { prompt: oneLine($read.get().text) }); $mode.set("make"); };
export const readToEdit = () => { const r = $read.get(); toEdit(r.src, oneLine(r.text)); };

// ── resume: the edge keeps a job for five minutes, so a tab Android discarded mid-race is picked up ──
export function resume(ctx) {
  if (gate) return;
  for (const mode of ["make", "edit"]) {
    if (runs[mode]) continue;                                   // a live run already owns this mode
    let j = null; try { j = JSON.parse(localStorage.getItem(JOB_KEY(mode)) || "null"); } catch { /* */ }
    if (!j?.job || Date.now() - j.ts > 240000) { try { localStorage.removeItem(JOB_KEY(mode)); } catch { /* */ } continue; }
    if (mode === "edit" && !$edit.get().src) { try { localStorage.removeItem(JOB_KEY(mode)); } catch { /* */ } continue; }   // the source blob died with the page
    const run = ++runs[mode]; jobs[mode] = j.job;
    patch(mode, { phase: "working", prompt: j.prompt || "", t0: j.ts, error: null });
    followJob(mode, j.job, run, ctx, j.seed || 0);
  }
}

// a derived view of the working line, shared by the caption and the dust: what the worker last said
export function liveOf(live) {
  if (!live) return { key: "queued", step: null, pct: null };
  if (live.stage === "translate") return { key: "translating", step: null, pct: 0.02 };
  if (live.step != null && live.steps) return { key: "painting", step: `${live.step}/${live.steps}`, pct: live.pct != null ? live.pct / 100 : live.step / live.steps };
  if (live.got > 0) return { key: "painting", step: `${live.got}/${K}`, pct: 0.5 + 0.5 * (live.got / K) };
  return { key: live.pct != null ? "painting" : "queued", step: null, pct: live.pct != null ? live.pct / 100 : null };
}
