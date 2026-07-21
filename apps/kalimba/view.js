// Kalimba — a playable thumb piano (mbira). A full-screen instrument (fixed layer between the app bar and
// the dock) so it fills the viewport in BOTH orientations — turn the phone landscape and the 17 tines
// spread wide under your fingers. Standard centre-out layout (lowest tine in the middle, scale alternating
// outward). A tonality switch retunes every tine (major/minor/pentatonic/…); the demos are written as
// scale-relative offsets so they play in any tuning. Every note is SYNTHESISED via /_rt/audio.js strike()
// with a research-based bar-mode timbre (JASA "The tones of the kalimba") — no audio files, offline.
import { html } from "htm/preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, midiToFreq, createEngine } from "/_rt/audio.js";
import { generateMelody } from "/_rt/melody.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const TONIC = 60;                                                   // C4 in the centre, for every tuning
const PC = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const label = (m) => PC[m % 12] + (Math.floor(m / 12) - 1);
// physical position of the k-th ascending note in the 17-tine centre-out layout (centre=8, alternating out)
const POS = (k) => (k === 0 ? 8 : k % 2 ? 7 - (k - 1) / 2 : 8 + k / 2);

// tonalities — interval steps (semitones) of one octave; the tuning repeats up the 17 tines
const SCALES = [
  { id: "major", name: "sMajor", steps: [2, 2, 1, 2, 2, 2, 1] },
  { id: "minor", name: "sMinor", steps: [2, 1, 2, 2, 1, 2, 2] },
  { id: "penta", name: "sPenta", steps: [2, 2, 3, 2, 3] },
  { id: "minPenta", name: "sMinPenta", steps: [3, 2, 2, 3, 2] },
  { id: "hira", name: "sHira", steps: [2, 1, 4, 1, 4] },
  { id: "arabic", name: "sArabic", steps: [1, 3, 1, 2, 1, 2, 2] },
];
const STEPS = Object.fromEntries(SCALES.map((s) => [s.id, s.steps]));

function buildTines(steps) {
  const asc = [TONIC];
  for (let k = 1; k < 17; k++) asc.push(asc[k - 1] + steps[(k - 1) % steps.length]);
  const lo = asc[0], hi = asc[16];
  const out = new Array(17);
  asc.forEach((m, k) => { out[POS(k)] = { pos: POS(k), asc: k, midi: m, freq: midiToFreq(m), h: Math.round(100 - ((m - lo) / (hi - lo)) * 46), letter: PC[m % 12], tonic: m % 12 === TONIC % 12 }; });
  return out;
}

// the warm, music-box-ish timbre from the FIRST version (harmonic partials 2x/3x/…). The physically-
// accurate bar model (inharmonic ~5x/~14x) was more authentic but the user preferred this one — it just
// sounds nicer, so taste wins over the research here. Long even ring on every tine.
const TIMBRE = { type: "sine", dur: 2.1, attack: 0.002, peak: 0.45, partials: [[1, 1], [2.01, 0.55], [3.0, 0.22], [4.3, 0.1], [5.9, 0.05]] };

// demos as scale-STEP offsets from a mid base → they play in whatever tuning is selected. Songs that carry a
// `scale` are REAL tunes (they only sound right in one key), so tapping them retunes the board to match; the
// scale-less demos stay tuning-relative. Avatar's melodies are pure C-major degrees 0..4 (C D E F G), which
// is why they map straight onto the major tuning's scale degrees (kalimbatabs.net letter/number tabs).
const BASE = 7;
const SONGS = [
  { id: "gliss", name: "sGliss", step: 95, seq: Array.from({ length: 17 }, (_, k) => k - BASE) },
  { id: "avatarLeaves", name: "sAvatarLeaves", step: 360, scale: "major", seq: [4, 4, 3, 2, null, 4, 4, 3, 2, null, 0, 2, 2, 2, 1, 0, null, 4, 4, 3, 2, null, 0, 4, 4, 4, 3, 2, null, 0, 2, 2, 2, 1, 0, null, 2, 2, 1, 0] },
  { id: "avatarTheme", name: "sAvatarTheme", step: 300, scale: "major", seq: [4, 4, 3, 2, null, 4, 4, 3, 2, null, 1, 2, 2, 2, 1, 0, null, 2, 2, 2, 1, 0, null, 4, 4, 4, 3, 2, null, 4, 4, 3, 2, null, 2, 2, 2, 1, 0, null, 2, 2, 1, 0] },
  { id: "twinkle", name: "sTwinkle", step: 340, scale: "major", seq: [0, 0, 4, 4, 5, 5, 4, null, 3, 3, 2, 2, 1, 1, 0] },
  { id: "ode", name: "sOde", step: 320, scale: "major", seq: [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 2, 1, 1] },
];

export function kalimba({ S }) {
  const t = useStore(S.t);
  const [scale, setScale] = useState("major");
  const [lit, setLit] = useState(() => new Set());
  const [playing, setPlaying] = useState(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });                   // play-region size → the rotated board swaps it
  const eng = useRef(null), flashes = useRef([]), song = useRef([]), region = useRef(), ptr = useRef(new Map()), usingPtr = useRef(false), switching = useRef(false);

  const tines = useMemo(() => buildTines(STEPS[scale]), [scale]);
  const byAsc = useMemo(() => { const a = []; tines.forEach((tn) => { a[tn.asc] = tn; }); return a; }, [tines]);

  const ensure = () => { if (!audioSupported) return null; if (!eng.current) eng.current = createEngine({ master: 0.7, noise: false }); eng.current.resume(); return eng.current; };
  const flash = (pos) => { setLit((s) => { const n = new Set(s); n.add(pos); return n; }); flashes.current.push(setTimeout(() => setLit((s) => { const n = new Set(s); n.delete(pos); return n; }), 260)); };
  const hit = (e, tn) => { if (e && tn) e.strike(tn.freq, TIMBRE); };
  const pluck = (pos) => { const tn = tines[pos]; hit(ensure(), tn); flash(pos); };

  // Play on POINTER DOWN (no click-on-release lag), and hit-test each tine the finger slides over via
  // elementFromPoint → glissando by dragging + true multi-touch (per-pointer last-tine), + fast repeats.
  const tineAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest && el.closest("[data-tine]"); return b ? Number(b.getAttribute("data-tine")) : null; };
  const onDown = (e) => { const pos = tineAt(e.clientX, e.clientY); if (pos == null) return; usingPtr.current = true; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } ptr.current.set(e.pointerId, pos); pluck(pos); };
  const onMove = (e) => { if (!ptr.current.has(e.pointerId)) return; const pos = tineAt(e.clientX, e.clientY); if (pos == null) return; if (ptr.current.get(e.pointerId) !== pos) { ptr.current.set(e.pointerId, pos); pluck(pos); } };
  const onLift = (e) => { ptr.current.delete(e.pointerId); };
  // fallback for environments that don't emit pointer events (the headless gate's .click()); real devices
  // fire pointerdown first → usingPtr guards against a double-trigger.
  const onClickBoard = (e) => { if (usingPtr.current) return; const b = e.target.closest && e.target.closest("[data-tine]"); if (b) pluck(Number(b.getAttribute("data-tine"))); };

  const stop = () => { song.current.forEach(clearTimeout); song.current = []; setPlaying(null); };
  // ascending tine lookup for ANY tuning (a real song may retune the board out from under the memoised one)
  const baFor = (sc) => { const a = []; buildTines(STEPS[sc]).forEach((tn) => { a[tn.asc] = tn; }); return a; };
  const play = (s) => {
    stop(); const e = ensure(); setPlaying(s.id);
    const sc = s.scale || scale;
    if (s.scale && s.scale !== scale) { switching.current = true; setScale(s.scale); }   // retune to the song's key
    const ba = sc === scale ? byAsc : baFor(sc);
    s.seq.forEach((off, step) => song.current.push(setTimeout(() => {
      if (off != null) { const tn = ba[BASE + off]; if (tn) { hit(e, tn); flash(tn.pos); } }
      if (step === s.seq.length - 1) song.current.push(setTimeout(() => setPlaying(null), s.step + 200));
    }, step * s.step)));
  };
  // Flow — auto-generate a sweet phrase over the CURRENT tuning via the unit-tested /_rt/melody.js search
  // (consonance · voice-leading · resolution). The scale as ~1.4 octaves of degree offsets; generated
  // indices ARE scale degrees, so they play straight through the same path as a song.
  const flow = () => {
    const steps = STEPS[scale]; const offs = [0]; let acc = 0;
    for (let k = 0; k < 9; k++) { acc += steps[k % steps.length]; offs.push(acc); }
    const g = generateMelody(offs, { seed: (Math.random() * 0xffffffff) >>> 0, len: 14, restP: 0.16, tries: 220 });
    play({ id: "flow", step: 300, seq: g.notes.map((n) => (n.rest ? null : n.i)) });
  };

  useEffect(() => { if (switching.current) { switching.current = false; return; } stop(); }, [scale]);   // manual retune stops a demo; a song's own retune does not
  useEffect(() => { const el = region.current; if (!el) return; const apply = () => setDim({ w: el.clientWidth, h: el.clientHeight }); apply(); const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => () => { flashes.current.forEach(clearTimeout); song.current.forEach(clearTimeout); if (eng.current) eng.current.close(); }, []);

  return html`<div class="fixed left-0 right-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="shrink-0 flex items-center gap-1.5 overflow-x-auto px-2 py-2 border-b border-base-300">
      ${SCALES.map((s) => html`<button data-scale=${s.id} aria-pressed=${scale === s.id} class=${`btn btn-xs shrink-0 ${scale === s.id ? "btn-primary" : "btn-ghost"}`} onClick=${() => setScale(s.id)} key=${s.id}>${T(t, s.name)}</button>`)}
      <span class="w-px self-stretch bg-base-300 mx-0.5 shrink-0"></span>
      <button data-flow aria-pressed=${playing === "flow"} class=${`btn btn-xs shrink-0 gap-1 ${playing === "flow" ? "btn-secondary" : "btn-outline btn-secondary"}`} onClick=${() => (playing === "flow" ? stop() : flow())}>${Icon(playing === "flow" ? "lucide:square" : "lucide:sparkles")}${T(t, "sFlow")}</button>
      ${SONGS.map((s) => html`<button data-song=${s.id} class=${`btn btn-xs shrink-0 gap-1 ${playing === s.id ? "btn-primary" : "btn-outline"}`} onClick=${() => (playing === s.id ? stop() : play(s))} key=${s.id}>${Icon(playing === s.id ? "lucide:square" : "lucide:play")}${T(t, s.name)}</button>`)}
    </div>

    <div ref=${region} class="flex-1 min-h-0 relative overflow-hidden">
      <!-- keys rotated 90°: keep the APP portrait but turn the phone to landscape and play on wide tines -->
      <div class="absolute top-1/2 left-1/2 flex flex-col p-2" style=${`width:${dim.h}px;height:${dim.w}px;transform:translate(-50%,-50%) rotate(90deg)`}>
        <div class="h-2 rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 shrink-0 mb-1.5 mx-1"></div>
        <div class="flex-1 min-h-0 flex items-start justify-center gap-[3px] select-none" style="touch-action:none"
          onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onLift} onPointerCancel=${onLift} onClick=${onClickBoard}>
          ${tines.map((tn) => html`<button data-tine=${tn.pos} data-note=${tn.letter} aria-label=${label(tn.midi)}
            class=${`relative flex-1 min-w-0 rounded-b-md bg-gradient-to-b from-zinc-100 to-zinc-400 shadow-sm transition-transform duration-100 ${lit.has(tn.pos) ? "ring-2 ring-primary translate-y-1.5 z-10 brightness-110" : ""}`}
            style=${`height:${tn.h}%`} key=${tn.pos}>
            ${tn.tonic ? html`<span class="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 rounded-b-md bg-amber-400"></span>` : null}
            <span class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-bold text-zinc-800">${tn.letter}</span>
          </button>`)}
        </div>
      </div>
    </div>
    ${!audioSupported ? html`<div class="shrink-0 text-center text-xs text-base-content/70 pb-1">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
