// trail — a day recorded by the phone itself, a month printed as one sheet.
//
// Three facts settled in apps/trail/RESEARCH.md decide every screen here and are not up for re-litigation:
//   · `location.watch` emits nothing on its own. `bg.start({location:true})` is what attaches the listener,
//     and the cadence is the service's own 10 s / 10 m — the catalogue declares no way for an app to set it.
//   · The service keeps NO backlog. `sink` is one callback, so every fix taken while this page was gone is
//     lost. `bg.status().fixes` is the ground truth count, and the difference is drawn as a GAP.
//   · ACCESS_BACKGROUND_LOCATION cannot be granted from the runtime dialog on Android 11+, and a permission
//     refused twice never prompts again. `system.settings` with page "location" is the only route.
//
// The geometry lives in packages/runtime/trace.js with unit tests; this file is wiring, layout and taste.
// Screen and export share that geometry on purpose: the SVG is drawn for the eye, the PNG is drawn with
// Canvas2D for print, and if they ever disagree it is because someone bypassed trace.js.
import { html } from "htm/preact";
import { useEffect, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel, Sheet } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate, MOCK } from "/_rt/gate.js";
import { collection } from "/_rt/db.js";
import { downloadBlob } from "/_rt/apk.js";
import { mulberry32 } from "/_rt/groove.js";
import { bbox, centre, spanM, boxAround, segments, simplify, project, length, stops } from "/_rt/trace.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const DAYS = collection("trail");
const pad2 = (n) => String(n).padStart(2, "0");
const dayIdOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const monthIdOf = (id) => id.slice(0, 7);

// A day that never left a 120 m circle is a day at home — a dot, not a scribble. Measured against the
// stationary noise of a consumer GPS: a phone on a desk wanders ~40 m over an afternoon.
const HOME_M = 120;
const MIN_SPAN_M = 300;   // the floor for the shared scale, so one quiet month is not magnified into drama

// State outlives a tab switch. A subscription restarted on every render would churn the service, and the
// recorder must keep running while the user reads the month.
const $days = atom(new Map());
const $rec = atom(false);
const $err = atom(null);
const $loaded = atom(false);
const $perm = atom("unknown");      // unknown | ok | needsSettings | noApp | stale
const $month = atom(monthIdOf(dayIdOf(Date.now())));

let cancelWatch = null;

// ── the recorded day ──────────────────────────────────────────────────────────────────────────────────

const dayOf = (id) => $days.get().get(id) || { id, points: [], lost: 0 };

async function putDay(day) {
  const next = new Map($days.get());
  next.set(day.id, day);
  $days.set(next);
  try { await DAYS.put(day.id, { points: day.points, lost: day.lost }); } catch { /* no IndexedDB: the session still draws */ }
}

// Every fix is written as it arrives, never batched on stop. A recorder that loses the day when the process
// dies is the exact failure this app exists to not have.
async function onFix(fix) {
  if (!fix || typeof fix.lat !== "number" || typeof fix.lon !== "number") return;
  const at = fix.at || Date.now();
  const day = dayOf(dayIdOf(at));
  await putDay({ ...day, points: [...day.points, { lat: fix.lat, lon: fix.lon, acc: fix.acc || 0, at }] });
}

/* The service counts every fix it took; we count the ones that reached us. The difference is not an
   estimate — it is exactly how many positions exist that we will never see, and the day is drawn with a
   break there rather than a straight line across ground nobody walked. */
async function reconcile() {
  if (!shell.has("bg.status")) return;
  try {
    const st = await shell.call("bg.status", {});
    if (!st?.running) { $rec.set(false); return; }
    $rec.set(true);
    const day = dayOf(dayIdOf(Date.now()));
    const lost = Math.max(0, (st.fixes || 0) - day.points.length);
    if (lost !== day.lost) await putDay({ ...day, lost });
  } catch { /* the shell went away mid-call; the next tick asks again */ }
}

async function checkPermission() {
  /* The catalogue mock reports ACCESS_BACKGROUND_LOCATION false — deliberately, it models the state a real
     user starts in. Honouring it under the gate would mean every shot, every axe pass and the whole
     breakpoint matrix only ever saw the permission panel, and the recorder's live layout was measured by
     nobody. So the gate gets the granted branch by default and `?mock=grant` aims at the other one. */
  if (gate) { $perm.set(MOCK === "grant" ? "needsSettings" : "ok"); return; }
  if (!shell.has("bg.start") || !shell.has("location.watch")) {
    $perm.set(shell.why("bg.start") === ERR.staleBridge ? "stale" : "noApp");
    return;
  }
  try {
    const info = await shell.call("system.info", {});
    const perms = info?.perms || {};
    // Absent means this build never declared it, which is the same dead end as refused.
    $perm.set(perms.ACCESS_BACKGROUND_LOCATION === true ? "ok" : "needsSettings");
  } catch { $perm.set("needsSettings"); }
}

async function startDay(t) {
  $err.set(null);
  try {
    await shell.call("bg.start", { title: T(t, "title"), body: T(t, "recording"), location: true });
    cancelWatch?.();
    cancelWatch = shell.subscribe("location.watch", {}, onFix, (e) => $err.set(e?.code || ERR.failed));
    $rec.set(true);
  } catch (e) { $err.set(e?.code || ERR.failed); }
}

async function stopDay() {
  cancelWatch?.();
  cancelWatch = null;
  try { await shell.call("bg.stop", {}); } catch { /* already gone */ }
  $rec.set(false);
}

// ── the gate's month ──────────────────────────────────────────────────────────────────────────────────
// The bridge mock emits ONE fix in Kyiv and settles, so left alone every screen here would be empty and the
// only layout axe, the overflow matrix and the shots ever measure would be the empty one. Seed the WIDEST
// state instead: a full month, a day with a gap in it, a day at home, and the longest readout.

function sampleMonth() {
  const rnd = mulberry32(0x7241_1c);
  const now = new Date();
  const days = new Map();
  const lastDay = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  for (let d = 1; d <= lastDay; d++) {
    if (rnd() < 0.22) continue;                                   // a day nobody recorded stays blank
    const id = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(d)}`;
    const base = new Date(now.getFullYear(), now.getMonth(), d, 8, 30).getTime();
    const home = rnd() < 0.18;
    const n = home ? 40 : 90 + Math.floor(rnd() * 60);
    const reach = home ? 0.0002 : 0.004 + rnd() * 0.016;
    let lat = 50.4501 + (rnd() - 0.5) * 0.01, lon = 30.5234 + (rnd() - 0.5) * 0.01;
    let hx = (rnd() - 0.5), hy = (rnd() - 0.5);
    const points = [];
    const gapAt = d % 9 === 4 ? Math.floor(n / 2) : -1;            // one day a month loses its middle
    for (let i = 0; i < n; i++) {
      hx += (rnd() - 0.5) * 0.6; hy += (rnd() - 0.5) * 0.6;
      lat += hy * reach / n * 3; lon += hx * reach / n * 5;
      const skip = gapAt >= 0 && i > gapAt && i < gapAt + 12;
      if (!skip) points.push({ lat, lon, acc: 8 + rnd() * 14, at: base + i * 300_000 });
    }
    days.set(id, { id, points, lost: gapAt >= 0 ? 11 : 0 });
  }
  return days;
}

async function loadDays() {
  if ($loaded.get()) return;
  $loaded.set(true);
  if (gate) { $days.set(sampleMonth()); return; }
  try {
    const rows = await DAYS.all();
    $days.set(new Map(rows.map((r) => [r.id, { id: r.id, points: r.points || [], lost: r.lost || 0 }])));
  } catch { /* no IndexedDB — the app still records into memory for this session */ }
}

// ── geometry helpers shared by the screen and the export ──────────────────────────────────────────────

const walked = (points) => segments(points).reduce((m, s) => m + length(s), 0);
const isHome = (points) => { const b = bbox(points); if (!b) return true; const s = spanM(b); return Math.max(s.w, s.h) < HOME_M; };

/** One scale for the whole month: each day keeps its own centre, every day shares the span. A 2 km day
 *  drawing the same size as a 40 km one would be the prettiest lie this app could tell. */
function sharedSpan(days) {
  let span = MIN_SPAN_M;
  for (const d of days) { const b = bbox(d.points); if (!b) continue; const s = spanM(b); span = Math.max(span, s.w, s.h); }
  return span;
}

function strokesFor(points, span, size, pad = 0) {
  const b = bbox(points);
  if (!b) return [];
  const box = boxAround(centre(b), span, span);
  return segments(points)
    .map((seg) => project(simplify(seg, 8), { box, width: size, height: size, pad }))
    .filter((pts) => pts.length > 1)
    .map((pts) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));
}

const km = (m) => (m >= 10_000 ? Math.round(m / 1000) : Math.round(m / 100) / 10);
const hhmm = (ms) => `${Math.floor(ms / 3_600_000)}:${pad2(Math.round(ms % 3_600_000 / 60_000))}`;
const movingMs = (points) => segments(points).reduce((m, s) => m + (s.length > 1 ? s[s.length - 1].at - s[0].at : 0), 0);

// ── today ─────────────────────────────────────────────────────────────────────────────────────────────

export function trailToday({ t, S }) {
  const days = useStore($days), rec = useStore($rec), perm = useStore($perm), err = useStore($err);
  useStore(S.locale);

  useEffect(() => {
    loadDays();
    checkPermission();
    reconcile();
    const id = setInterval(reconcile, 20_000);
    return () => clearInterval(id);
  }, []);

  const today = days.get(dayIdOf(Date.now())) || { id: dayIdOf(Date.now()), points: [], lost: 0 };
  const dist = walked(today.points);

  if (perm === "noApp") return Gate(t, "needAppTitle", "needAppBody", null, null);
  if (perm === "stale") return Gate(t, "oldAppTitle", "oldAppBody", null, null);
  if (perm === "needsSettings") {
    return Gate(t, "needGrantTitle", "needGrantBody", "needGrantCta",
      () => shell.call("system.settings", { page: "location" }).catch(() => {}));
  }

  const span = Math.max(MIN_SPAN_M, ...(bbox(today.points) ? [spanM(bbox(today.points)).w, spanM(bbox(today.points)).h] : [0]));
  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
    <div class="shrink-0 grid grid-cols-3 gap-[var(--ms-gap)]" data-live>
      ${Stat(T(t, "statDistance"), `${km(dist)}`, "km")}
      ${Stat(T(t, "statMoving"), hhmm(movingMs(today.points)), "")}
      ${Stat(T(t, "statFixes"), String(today.points.length), today.lost ? `−${today.lost}` : "")}
    </div>

    <div class="flex-1 min-h-0 relative rounded-[var(--ms-r)] overflow-hidden bg-base-200/40">
      ${today.points.length > 1
        ? DayCanvas(today, span, "absolute inset-0 w-full h-full")
        : html`<div class="absolute inset-0 grid place-items-center text-base-content/70 text-[var(--ms-label)]">${T(t, "nothingYet")}</div>`}
    </div>

    ${today.lost ? html`<p class="shrink-0 text-[var(--ms-label)] text-base-content/70">${T(t, "lostBody")}</p>` : null}
    ${err ? html`<p class="shrink-0 text-[var(--ms-label)] text-error">${err}</p>` : null}

    <button
      data-rec=${rec ? "on" : "off"}
      data-haptic=${rec ? "bump" : null}
      class=${`shrink-0 btn rounded-2xl w-full gap-2 ${rec ? "btn-outline" : "btn-primary"}`}
      onClick=${() => (rec ? stopDay() : startDay(t))}>
      ${Icon(rec ? "lucide:square" : "lucide:circle-dot")}${T(t, rec ? "stop" : "start")}
    </button>
  </div>`;
}

const Stat = (label, value, unit) => html`<div class="rounded-[var(--ms-r)] bg-base-200/50 px-3 py-2 min-w-0">
  <div class="text-[var(--ms-label)] text-base-content/70 truncate">${label}</div>
  <div class="font-mono text-[var(--ms-title)] leading-tight truncate">${value}${unit ? html`<span class="text-base-content/70 text-[var(--ms-label)] ml-1">${unit}</span>` : null}</div>
</div>`;

const Gate = (t, titleKey, bodyKey, ctaKey, onCta) => html`<div class="h-full min-h-0 flex flex-col justify-center">
  <${Panel} title=${T(t, titleKey)}>
    <p class="text-base-content/70 text-[var(--ms-label)]">${T(t, bodyKey)}</p>
    ${ctaKey ? html`<button class="btn btn-primary rounded-2xl mt-3 gap-2 w-full" onClick=${onCta}>
      ${Icon("lucide:settings")}${T(t, ctaKey)}</button>` : null}
  <//>
</div>`;

/** The day as one stroke per segment. `viewBox` is a square in trace.js's own coordinates, so the SVG
 *  scales with its box and the geometry never has to know how many pixels it got. */
function DayCanvas(day, span, cls) {
  const S = 100;
  const strokes = strokesFor(day.points, span, S, 6);
  return html`<svg viewBox="0 0 ${S} ${S}" preserveAspectRatio="xMidYMid meet" class=${cls} role="img" aria-hidden="true">
    ${strokes.map((d, i) => html`<path key=${i} d=${d} fill="none" stroke="var(--app-accent)" stroke-width="1.4"
      stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`)}
  </svg>`;
}

// ── month ─────────────────────────────────────────────────────────────────────────────────────────────

export function trailMonth({ t, S, screen, openScreen, closeScreen, toast, confirm }) {
  const days = useStore($days), month = useStore($month);
  useStore(S.locale);
  useEffect(() => { loadDays(); }, []);

  const inMonth = useMemo(
    () => [...days.values()].filter((d) => monthIdOf(d.id) === month && d.points.length).sort((a, b) => a.id.localeCompare(b.id)),
    [days, month],
  );
  const span = useMemo(() => sharedSpan(inMonth), [inMonth]);
  const total = useMemo(() => inMonth.reduce((m, d) => m + walked(d.points), 0), [inMonth]);

  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1);
  const lead = (first.getDay() + 6) % 7;                       // Monday-first, like every calendar here
  const count = new Date(y, mo, 0).getDate();
  const label = first.toLocaleDateString(S.locale.get() === "uk" ? "uk-UA" : "en-GB", { month: "long", year: "numeric" });

  const openId = screen && screen.startsWith("day:") ? screen.slice(4) : null;
  const open = openId ? days.get(openId) : null;

  const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); $month.set(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); };

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <div class="flex items-center gap-2">
      <button class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "monthPrev")} onClick=${() => shift(-1)}>${Icon("lucide:chevron-left")}</button>
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate capitalize">${label}</div>
        <div class="text-[var(--ms-label)] text-base-content/70 font-mono">${km(total)} km · ${inMonth.length} ${T(t, "days")}</div>
      </div>
      <button class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "monthNext")} onClick=${() => shift(1)}>${Icon("lucide:chevron-right")}</button>
    </div>

    ${inMonth.length === 0
      ? html`<${Panel} title=${T(t, "emptyTitle")}><p class="text-base-content/70 text-[var(--ms-label)]">${T(t, "emptyBody")}</p><//>`
      : html`<div data-month-grid class="grid grid-cols-7 gap-1.5">
          ${Array.from({ length: lead }, (_, i) => html`<div key=${`p${i}`} aria-hidden="true"></div>`)}
          ${Array.from({ length: count }, (_, i) => {
            const id = `${month}-${pad2(i + 1)}`;
            const d = days.get(id);
            const has = d && d.points.length > 0;
            if (!has) return html`<div key=${id} class="aspect-square rounded-md bg-base-200/30" aria-hidden="true"></div>`;
            return html`<button key=${id} data-day=${id} aria-label=${id}
              class="aspect-square rounded-md bg-base-200/50 active:scale-95 transition p-0.5"
              onClick=${() => openScreen(`day:${id}`)}>
              ${isHome(d.points)
                ? html`<svg viewBox="0 0 100 100" class="w-full h-full" aria-hidden="true"><circle cx="50" cy="50" r="7" fill="var(--app-accent)"/></svg>`
                : DayCanvas(d, span, "w-full h-full")}
            </button>`;
          })}
        </div>`}

    ${inMonth.length ? html`<p class="text-[var(--ms-label)] text-base-content/70">${T(t, "legend")} ${T(t, "oneScale")}.</p>` : null}

    ${inMonth.length ? html`<button class="btn btn-outline rounded-2xl gap-2" onClick=${() => exportMonth(inMonth, span, label, total, t, toast)}>
      ${Icon("lucide:download")}${T(t, "export")}</button>` : null}

    <${Sheet} id="day" open=${!!open} onClose=${closeScreen} title=${openId || ""}
      subtitle=${open ? `${km(walked(open.points))} km` : ""} icon="lucide:route">
      ${open ? DayDetail(open, t, toast, confirm, closeScreen) : null}
    <//>
  </div>`;
}

function DayDetail(day, t, toast, confirm, closeScreen) {
  const home = isHome(day.points);
  const span = Math.max(MIN_SPAN_M, ...(bbox(day.points) ? [spanM(bbox(day.points)).w, spanM(bbox(day.points)).h] : [0]));
  const pause = stops(day.points);
  const breaks = Math.max(0, segments(day.points).length - 1);

  return html`<div data-poster class="flex flex-col gap-[var(--ms-gap)]">
    <div class="aspect-square rounded-[var(--ms-r)] bg-base-200/40 overflow-hidden">
      ${home
        ? html`<div class="w-full h-full grid place-items-center text-center px-6">
            <div><div class="font-medium">${T(t, "atHome")}</div>
            <p class="text-[var(--ms-label)] text-base-content/70 mt-1">${T(t, "atHomeBody")}</p></div></div>`
        : DayCanvas(day, span, "w-full h-full")}
    </div>

    <div class="grid grid-cols-3 gap-[var(--ms-gap)]">
      ${Stat(T(t, "statDistance"), `${km(walked(day.points))}`, "km")}
      ${Stat(T(t, "dayStops"), String(pause.length), "")}
      ${Stat(T(t, "dayGaps"), String(breaks), "")}
    </div>

    ${day.lost ? html`<p class="text-[var(--ms-label)] text-base-content/70">${T(t, "lostBody")}</p>` : null}

    <div class="flex gap-2">
      <button class="btn btn-outline flex-1 rounded-2xl gap-2" onClick=${() => exportDay(day, span, t, toast)}>
        ${Icon("lucide:download")}${T(t, "exportDay")}</button>
      <button class="btn btn-ghost text-error rounded-2xl gap-2" data-haptic="bump"
        onClick=${() => confirm({
          title: T(t, "deleteTitle"), body: T(t, "deleteBody"), verb: T(t, "deleteVerb"),
          onConfirm: async () => { await removeDay(day.id); closeScreen(); toast?.("deleted"); },
        })}>
        ${Icon("lucide:trash-2")}${T(t, "deleteDay")}</button>
    </div>
  </div>`;
}

async function removeDay(id) {
  const next = new Map($days.get());
  next.delete(id);
  $days.set(next);
  try { await DAYS.remove(id); } catch { /* nothing persisted to remove */ }
}

// ── export ────────────────────────────────────────────────────────────────────────────────────────────
// Canvas2D rather than a serialised SVG: an <img> of an SVG data URL renders text with whatever font the
// rasteriser happens to resolve, which is not the one on screen. The geometry is trace.js's either way.

const SHEET = 2048;

function paper(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "#12181c"; x.fillRect(0, 0, w, h);
  x.strokeStyle = "#5E8CA8"; x.lineCap = "round"; x.lineJoin = "round";
  return { c, x };
}

function strokePoints(x, pts) {
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.stroke();
}

function caption(x, text, sub, w, h) {
  x.fillStyle = "#e8eef2";
  x.font = `500 ${Math.round(w / 26)}px ui-sans-serif, system-ui, sans-serif`;
  x.fillText(text, w / 14, h - w / 14 - Math.round(w / 22));
  x.fillStyle = "rgba(232,238,242,0.65)";
  x.font = `${Math.round(w / 38)}px ui-monospace, monospace`;
  x.fillText(sub, w / 14, h - w / 14);
}

function save(c, name, toast) {
  c.toBlob((blob) => { if (blob) { downloadBlob(blob, name); toast?.("saved"); } }, "image/png");
}

function exportDay(day, span, t, toast) {
  const { c, x } = paper(SHEET, Math.round(SHEET * 1.3));
  const size = SHEET - SHEET / 7;
  const strokes = segments(day.points)
    .map((s) => project(simplify(s, 4), { box: boxAround(centre(bbox(day.points)), span, span), width: size, height: size }))
    .filter((p) => p.length > 1);
  x.save();
  x.translate(SHEET / 14, SHEET / 14);
  x.lineWidth = SHEET / 300;
  for (const pts of strokes) strokePoints(x, pts);
  x.restore();
  caption(x, day.id, `${km(walked(day.points))} km · ${hhmm(movingMs(day.points))}`, SHEET, Math.round(SHEET * 1.3));
  save(c, `trail-${day.id}.png`, toast);
}

function exportMonth(daysIn, span, label, total, t, toast) {
  const h = Math.round(SHEET * 1.3);
  const { c, x } = paper(SHEET, h);
  const cols = 7, margin = SHEET / 14;
  const cell = (SHEET - margin * 2) / cols;
  const first = new Date(`${daysIn[0].id.slice(0, 7)}-01T00:00:00`);
  const lead = (first.getDay() + 6) % 7;
  x.lineWidth = SHEET / 640;
  for (const d of daysIn) {
    const idx = lead + Number(d.id.slice(8)) - 1;
    const cx = margin + (idx % cols) * cell, cy = margin + Math.floor(idx / cols) * cell;
    if (isHome(d.points)) {
      x.fillStyle = "#5E8CA8";
      x.beginPath(); x.arc(cx + cell / 2, cy + cell / 2, cell / 14, 0, Math.PI * 2); x.fill();
      continue;
    }
    const box = boxAround(centre(bbox(d.points)), span, span);
    for (const seg of segments(d.points)) {
      const pts = project(simplify(seg, 8), { box, width: cell, height: cell, pad: cell / 10 });
      if (pts.length > 1) strokePoints(x, pts.map((p) => ({ x: cx + p.x, y: cy + p.y })));
    }
  }
  caption(x, label, `${km(total)} km · ${daysIn.length} ${T(t, "days")}`, SHEET, h);
  save(c, `trail-${daysIn[0].id.slice(0, 7)}.png`, toast);
}
