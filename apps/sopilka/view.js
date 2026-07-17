// Сопілка — a playable Ukrainian folk fipple flute. Diatonic prima: SIX holes, C major — the folk
// instrument, not Demínchuk's chromatic ten-hole redesign of 1970. Synthesised through the runtime's
// blown-pipe voice (/_rt/wind.js); no samples.
//
// Every hole is INDEPENDENT and the pipe takes as many fingers as you can put on it. That is not a feature
// bolted on for its own sake — it is what makes "вилки" (cross/fork fingerings) possible, and forks are how
// a six-hole diatonic pipe reaches the notes between its scale steps. A one-touch abstraction cannot express
// them, so it cannot express the instrument.
//
// The pitch is NOT a lookup table. It is the physics:
//   the air column effectively ends at the FIRST OPEN hole from the top — that sets the note;
//   holes covered BELOW that opening lengthen the column slightly and flatten it about a semitone.
// That second line is the fork. Checked against the canonical case: on a D whistle, C natural is fingered
// ○●●○○○ — top hole open (so the base is C♯, the seventh), two holes covered below it → flattened to C
// natural. The rule reproduces the real chart rather than imitating it.
// Refs: whistle cross-fingering practice · fipple-flute acoustics (see /_rt/wind.js).
//
// Touching the pipe ANYWHERE is the breath: your fingers are on the pipe when you play it, and a finger
// resting between holes covers nothing — exactly as here. That is also what makes the all-open note (Сі)
// reachable without inventing a button for it.
//
// Передування (overblowing) is a toggle: a phone has no breath sensor. The fingering and the octave
// relationship are real; the way you ask for the octave is an admitted simplification.
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, createEngine, midiToFreq } from "/_rt/audio.js";
import { blow, fingeredSemitone, handCovered } from "/_rt/wind.js";
import { haptic } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Prima sopilka in C: all six covered sounds C5. (A transposing instrument — notated an octave below.)
const TONIC = 72;
// index = holes covered CONSECUTIVELY from the top → semitones above the tonic. The diatonic staircase.
const SCALE = [11, 9, 7, 5, 4, 2, 0];
const HOLES = 6;
const TOP = 28, GAP = 11.4;                         // hole centres, % of pipe height — shared by render + hit-test
const HIT = 0.052;                                  // half-height of a hole's touch zone, as a fraction of the pipe
const NAMES = ["До", "До♯", "Ре", "Ре♯", "Мі", "Фа", "Фа♯", "Соль", "Соль♯", "Ля", "Ля♯", "Сі"];
const LAT = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// The app owns the TUNING; the runtime owns the acoustics (fingeredSemitone in /_rt/wind.js). Same split
// as groove.js: a rule true of every fipple flute does not belong to one of them.
const semitoneFor = (covered) => fingeredSemitone(covered, SCALE);

export function sopilka({ S }) {
  const t = useStore(S.t);
  const [covered, setCovered] = useState(() => new Set());
  const [blowing, setBlowing] = useState(false);
  const [over, setOver] = useState(false);
  const eng = useRef(null), voice = useRef(null), pipe = useRef(null);
  const ptrs = useRef(new Map());                   // pointerId → hole index | null (null = on the pipe, covering nothing)
  const overRef = useRef(false); overRef.current = over;

  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) eng.current = createEngine({ master: 0.8 });
    eng.current.resume();
    return eng.current;
  };
  const freqOf = (set) => midiToFreq(TONIC + semitoneFor(set) + (overRef.current ? 12 : 0));

  useEffect(() => () => { try { voice.current?.stop(); } catch { /* */ } if (eng.current) eng.current.close(); }, []);
  useEffect(() => { if (voice.current) voice.current.setFreq(freqOf(covered)); }, [over]);

  // Which hole a point sits on — null means the pipe itself: breath, no hole covered.
  const holeAt = (clientY) => {
    const el = pipe.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const rel = (clientY - r.top) / r.height;
    if (rel < 0 || rel > 1) return null;
    for (let i = 0; i < HOLES; i++) {
      const c = (TOP + i * GAP) / 100;
      if (Math.abs(rel - c) <= HIT) return i;
    }
    return null;
  };
  // The hand. A screen has no palm, so the holes ABOVE your highest finger are taken as covered — because
  // on a real pipe they are: the fingers that are not doing anything are still resting on the upper holes.
  // Without this the instrument is unplayable, and provably so: with one finger the covered set is a single
  // hole, which never forms the consecutive run the air column needs, so every hole in the pipe sounds
  // Ля or Ля♯ and nothing else. That is what "всі отвори ля" was — not a mis-tuning, a missing hand.
  //
  // What this buys: ONE finger walks the whole diatonic scale (touch the lowest hole you want stopped),
  // and a SECOND finger below it covers an extra hole — which is exactly a fork. Playable with a thumb,
  // still able to express the cross-fingerings that made independent holes worth having.
  const sync = () => {
    const set = handCovered([...ptrs.current.values()].filter((v) => v != null));
    setCovered(set);
    if (voice.current) voice.current.setFreq(freqOf(set));   // legato: the breath never stops, only the bore
    return set;
  };

  const down = (e) => {
    const el = pipe.current;
    const r = el?.getBoundingClientRect();
    if (!r || e.clientY < r.top || e.clientY > r.bottom) return;
    ptrs.current.set(e.pointerId, holeAt(e.clientY));
    el.setPointerCapture?.(e.pointerId);
    const set = sync();
    haptic.tick();
    if (!voice.current) {
      const en = ensure(); setBlowing(true);
      if (en) voice.current = blow(en.ctx, en.master, freqOf(set));
    }
  };
  const move = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const h = holeAt(e.clientY);
    if (ptrs.current.get(e.pointerId) === h) return;
    ptrs.current.set(e.pointerId, h);
    sync(); haptic.tick();
  };
  const up = (e) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    if (ptrs.current.size === 0) {                  // last finger off the pipe → the breath stops
      voice.current?.stop(); voice.current = null;
      setBlowing(false); setCovered(new Set());
      return;
    }
    sync();
  };

  const semi = blowing ? ((semitoneFor(covered) % 12) + 12) % 12 : null;
  const oct = over ? 6 : 5;

  return html`<div class="flex flex-col items-center gap-4">
    <div class="text-center min-h-16">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${T(t, "note")}</div>
      <div class="text-4xl font-bold leading-none tabular-nums" style="color:light-dark(#7a5c1f,#e8c874)">
        ${semi == null ? "—" : NAMES[semi]}
      </div>
      <div class="text-xs text-base-content/60 mt-1 font-mono h-4">${semi == null ? "" : `${LAT[semi]}${oct}`}</div>
    </div>

    <div ref=${pipe} data-pipe
      class="relative w-24 rounded-[3rem] border border-base-content/15 touch-none select-none cursor-pointer"
      style="height:min(60svh,29rem);background:linear-gradient(100deg,#6b4a24,#a9793d 42%,#7d5729)"
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
      <div class="absolute inset-x-0 flex justify-center" style="top:9%">
        <div class="w-8 h-1.5 rounded-full bg-black/45"></div>
      </div>
      ${Array.from({ length: HOLES }, (_, i) => html`<div key=${i} data-hole=${i} aria-hidden="true"
        class=${`absolute left-1/2 -translate-x-1/2 w-7 h-7 rounded-full border transition-colors ${covered.has(i) ? "bg-base-content border-base-content/40" : "bg-black/70 border-black/50"}`}
        style=${`top:calc(${TOP + i * GAP}% - 0.875rem)`}></div>`)}
    </div>

    <button id="over" data-over aria-pressed=${over} class=${`btn btn-sm rounded-2xl gap-2 ${over ? "btn-primary" : "btn-outline"}`}
      data-haptic="bump" onClick=${() => setOver((v) => !v)}>${Icon("lucide:wind", "text-base")}${T(t, "overblow")}</button>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
