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

// demos as scale-STEP offsets from a mid base → they play in whatever tuning is selected
const BASE = 7;
const SONGS = [
  { id: "gliss", name: "sGliss", step: 95, seq: Array.from({ length: 17 }, (_, k) => k - BASE) },
  { id: "twinkle", name: "sTwinkle", step: 340, seq: [0, 0, 4, 4, 5, 5, 4, null, 3, 3, 2, 2, 1, 1, 0] },
  { id: "ode", name: "sOde", step: 320, seq: [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 2, 1, 1] },
];

export function kalimba({ S }) {
  const t = useStore(S.t);
  const [scale, setScale] = useState("major");
  const [lit, setLit] = useState(() => new Set());
  const [playing, setPlaying] = useState(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });                   // play-region size → the rotated board swaps it
  const eng = useRef(null), flashes = useRef([]), song = useRef([]), region = useRef();

  const tines = useMemo(() => buildTines(STEPS[scale]), [scale]);
  const byAsc = useMemo(() => { const a = []; tines.forEach((tn) => { a[tn.asc] = tn; }); return a; }, [tines]);

  const ensure = () => { if (!audioSupported) return null; if (!eng.current) eng.current = createEngine({ master: 0.7, noise: false }); eng.current.resume(); return eng.current; };
  const flash = (pos) => { setLit((s) => { const n = new Set(s); n.add(pos); return n; }); flashes.current.push(setTimeout(() => setLit((s) => { const n = new Set(s); n.delete(pos); return n; }), 280)); };
  const hit = (e, tn) => { if (e && tn) e.strike(tn.freq, TIMBRE); };
  const pluck = (pos) => { const tn = tines[pos]; hit(ensure(), tn); flash(pos); };

  const stop = () => { song.current.forEach(clearTimeout); song.current = []; setPlaying(null); };
  const play = (s) => {
    stop(); const e = ensure(); setPlaying(s.id);
    s.seq.forEach((off, step) => song.current.push(setTimeout(() => {
      if (off != null) { const tn = byAsc[BASE + off]; if (tn) { hit(e, tn); flash(tn.pos); } }
      if (step === s.seq.length - 1) song.current.push(setTimeout(() => setPlaying(null), s.step + 200));
    }, step * s.step)));
  };

  useEffect(() => stop, [scale]);                                   // stop a demo if the tuning changes
  useEffect(() => { const el = region.current; if (!el) return; const apply = () => setDim({ w: el.clientWidth, h: el.clientHeight }); apply(); const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => () => { flashes.current.forEach(clearTimeout); song.current.forEach(clearTimeout); if (eng.current) eng.current.close(); }, []);

  return html`<div class="fixed left-0 right-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(4rem + env(safe-area-inset-bottom))">
    <div class="shrink-0 flex items-center gap-1.5 overflow-x-auto px-2 py-2 border-b border-base-300">
      ${SCALES.map((s) => html`<button data-scale=${s.id} aria-pressed=${scale === s.id} class=${`btn btn-xs shrink-0 ${scale === s.id ? "btn-primary" : "btn-ghost"}`} onClick=${() => setScale(s.id)} key=${s.id}>${T(t, s.name)}</button>`)}
      <span class="w-px self-stretch bg-base-300 mx-0.5 shrink-0"></span>
      ${SONGS.map((s) => html`<button data-song=${s.id} class=${`btn btn-xs shrink-0 gap-1 ${playing === s.id ? "btn-primary" : "btn-outline"}`} onClick=${() => (playing === s.id ? stop() : play(s))} key=${s.id}>${Icon(playing === s.id ? "lucide:square" : "lucide:play")}${T(t, s.name)}</button>`)}
    </div>

    <div ref=${region} class="flex-1 min-h-0 relative overflow-hidden">
      <!-- keys rotated 90°: keep the APP portrait but turn the phone to landscape and play on wide tines -->
      <div class="absolute top-1/2 left-1/2 flex flex-col p-2" style=${`width:${dim.h}px;height:${dim.w}px;transform:translate(-50%,-50%) rotate(90deg)`}>
        <div class="h-2 rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 shrink-0 mb-1.5 mx-1"></div>
        <div class="flex-1 min-h-0 flex items-start justify-center gap-[3px]">
          ${tines.map((tn) => html`<button data-tine=${tn.pos} data-note=${tn.letter} aria-label=${label(tn.midi)}
            onClick=${() => pluck(tn.pos)}
            class=${`relative flex-1 min-w-0 rounded-b-md bg-gradient-to-b from-zinc-100 to-zinc-400 shadow-sm touch-manipulation transition-all duration-100 ${lit.has(tn.pos) ? "ring-2 ring-primary translate-y-1.5 z-10 brightness-110" : ""}`}
            style=${`height:${tn.h}%`} key=${tn.pos}>
            ${tn.tonic ? html`<span class="absolute inset-x-0 bottom-0 h-1.5 rounded-b-md bg-amber-400"></span>` : null}
            <span class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-bold text-zinc-800">${tn.letter}</span>
          </button>`)}
        </div>
      </div>
    </div>
    ${!audioSupported ? html`<div class="shrink-0 text-center text-xs text-base-content/70 pb-1">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
