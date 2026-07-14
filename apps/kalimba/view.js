// Kalimba — a playable thumb piano (mbira). 17 metal tines in the standard C-major, centre-out layout
// (lowest tine in the middle, notes alternating outward); tap a tine to pluck it. Every note is
// SYNTHESISED via the systemic /_rt/audio.js strike() (fundamental + inharmonic partials, exp decay) —
// no audio files. A few one-tap demos (glissando + two melodies) play the tines with a light sweep.
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, noteFreq, noteToMidi, createEngine } from "/_rt/audio.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// standard 17-key kalimba, physical left→right (tonic C4 in the centre, scale alternating outward)
const NOTES = ["D6", "B5", "G5", "E5", "C5", "A4", "F4", "D4", "C4", "E4", "G4", "B4", "D5", "F5", "A5", "C6", "E6"];
const MID = NOTES.map(noteToMidi);
const LO = Math.min(...MID), HI = Math.max(...MID);
const TINES = NOTES.map((note, i) => ({ note, i, freq: noteFreq(note), midi: MID[i], h: Math.round(100 - ((MID[i] - LO) / (HI - LO)) * 46), letter: note.replace(/-?\d/, ""), tonic: note[0] === "C" }));
const NOTE_IDX = Object.fromEntries(NOTES.map((n, i) => [n, i]));

// authentic kalimba timbre — a tine is a clamped-supported-free bar: a near-pure fundamental plus two
// INHARMONIC overtones at ~5x and ~14x that are strong in the attack and die fast (decayScale 0.12/0.05),
// leaving an almost pure tone (JASA "The tones of the kalimba", Grill 2012). Low tines ring longer.
const TIMBRE = { type: "sine", attack: 0.003, peak: 0.5, partials: [[1, 1, 1], [4.98, 0.32, 0.12], [13.7, 0.11, 0.05]] };
const durFor = (freq) => Math.min(2.8, Math.max(1.0, 2.8 * Math.pow(261.6 / freq, 0.45)));
const strikeTine = (e, i) => { if (e) e.strike(TINES[i].freq, { ...TIMBRE, dur: durFor(TINES[i].freq) }); };

const SONGS = [
  { id: "gliss", name: "sGliss", step: 105, seq: [...TINES].sort((a, b) => a.midi - b.midi).map((x) => x.note) },
  { id: "twinkle", name: "sTwinkle", step: 360, seq: ["C5", "C5", "G5", "G5", "A5", "A5", "G5", null, "F5", "F5", "E5", "E5", "D5", "D5", "C5"] },
  { id: "ode", name: "sOde", step: 340, seq: ["E5", "E5", "F5", "G5", "G5", "F5", "E5", "D5", "C5", "C5", "D5", "E5", "E5", "D5", "D5"] },
];

export function kalimba({ S }) {
  const t = useStore(S.t);
  const [lit, setLit] = useState(() => new Set());
  const [playing, setPlaying] = useState(null);
  const eng = useRef(null), flashes = useRef([]), song = useRef([]);

  const ensure = () => { if (!audioSupported) return null; if (!eng.current) eng.current = createEngine({ master: 0.7, noise: false }); eng.current.resume(); return eng.current; };
  const flash = (i) => { setLit((s) => { const n = new Set(s); n.add(i); return n; }); flashes.current.push(setTimeout(() => setLit((s) => { const n = new Set(s); n.delete(i); return n; }), 280)); };
  const pluck = (i) => { strikeTine(ensure(), i); flash(i); };

  const stop = () => { song.current.forEach(clearTimeout); song.current = []; setPlaying(null); };
  const play = (s) => {
    stop(); const e = ensure(); setPlaying(s.id);
    s.seq.forEach((note, step) => song.current.push(setTimeout(() => {
      if (note != null) { const i = NOTE_IDX[note]; strikeTine(e, i); flash(i); }
      if (step === s.seq.length - 1) song.current.push(setTimeout(() => setPlaying(null), s.step + 200));
    }, step * s.step)));
  };

  useEffect(() => () => { flashes.current.forEach(clearTimeout); song.current.forEach(clearTimeout); if (eng.current) eng.current.close(); }, []);

  return html`<div class="flex flex-col items-center gap-5 pt-1">
    <div class="w-full max-w-[440px] rounded-3xl bg-base-300 border border-base-content/10 p-3 pt-2 shadow-inner">
      <div class="h-2.5 rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 shadow-sm mb-1.5 mx-1"></div>
      <div class="flex items-start justify-center gap-[3px] h-[280px]">
        ${TINES.map(({ i, note, letter, tonic, h }) => html`<button data-tine=${i} data-note=${note} aria-label=${note}
          onClick=${() => pluck(i)}
          class=${`tine relative flex-1 min-w-0 rounded-b-md bg-gradient-to-b from-zinc-100 to-zinc-400 shadow-sm touch-manipulation transition-all duration-100 active:translate-y-0.5 ${lit.has(i) ? "ring-2 ring-primary translate-y-1.5 z-10 brightness-110" : ""}`}
          style=${`height:${h}%`} key=${i}>
          ${tonic ? html`<span class="absolute inset-x-0 bottom-0 h-1.5 rounded-b-md bg-amber-400"></span>` : null}
          <span class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-bold text-zinc-800">${letter}</span>
        </button>`)}
      </div>
    </div>

    <div class="flex items-center gap-2 flex-wrap justify-center">
      ${SONGS.map((s) => html`<button data-song=${s.id} onClick=${() => (playing === s.id ? stop() : play(s))}
        class=${`btn btn-sm gap-1.5 ${playing === s.id ? "btn-primary" : "btn-outline"}`} key=${s.id}>
        ${Icon(playing === s.id ? "lucide:square" : "lucide:play", "text-base")}${T(t, s.name)}</button>`)}
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
