// Сопілка — a playable Ukrainian folk fipple flute. Diatonic prima: SIX holes, C major, the instrument
// as it was before Demínchuk's chromatic ten-hole redesign of 1970. Every note is synthesised through the
// runtime's blown-pipe voice (/_rt/wind.js) — no samples.
//
// The interface is the instrument's own logic, not a keyboard. On any six-hole fipple flute the fingering
// is a STAIRCASE: cover all six for the tonic, then lift one finger at a time from the bottom. So the
// whole state is ONE number — how many holes are covered from the top — which is why this can be played
// with one thumb and still be true: touching hole 3 covers 1-3, exactly as three fingers would.
//
// Dragging along the pipe glides between notes without re-attacking, because that is what a flute does:
// the breath never stops, only the bore length changes. That gesture is the reason wind.js exists.
//
// Передування (overblowing) is a toggle here, not breath pressure — a phone has no breath sensor. Honest
// simplification: the fingering and the pitch relationship are real, the way you ask for the octave is not.
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, createEngine, midiToFreq } from "/_rt/audio.js";
import { blow } from "/_rt/wind.js";
import { haptic } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Prima sopilka in C: sounding C5 with all six covered. (The instrument is notated an octave below what it
// sounds — a transposing instrument — so this is C5 sounding, written C4.)
const TONIC = 72;                       // C5
// covered → semitones above the tonic. Six covered = tonic; lifting from the bottom walks the C major
// scale up; nothing covered = the seventh. Same chart as a tin whistle — the mechanism is identical.
const SCALE = [11, 9, 7, 5, 4, 2, 0];   // index = holes covered (0…6) → C D E F G A B read right-to-left
const NAMES = ["Сі", "Ля", "Соль", "Фа", "Мі", "Ре", "До"];
const LAT = ["B", "A", "G", "F", "E", "D", "C"];

export function sopilka({ S }) {
  const t = useStore(S.t);
  const [covered, setCovered] = useState(null);   // null = not playing; 0…6 = holes covered from the top
  const [over, setOver] = useState(false);        // передування → octave up
  const eng = useRef(null), voice = useRef(null), pipe = useRef(null);
  const overRef = useRef(false); overRef.current = over;

  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) eng.current = createEngine({ master: 0.8 });
    eng.current.resume();
    return eng.current;
  };
  const freqFor = (n) => midiToFreq(TONIC + SCALE[n] + (overRef.current ? 12 : 0));

  useEffect(() => () => { try { voice.current?.stop(); } catch { /* */ } if (eng.current) eng.current.close(); }, []);
  // Re-pitch a held note when передування flips — the breath does not stop for an octave change.
  useEffect(() => { if (voice.current && covered != null) voice.current.setFreq(freqFor(covered)); }, [over]);

  // Which hole a pointer is over. The zones are the holes themselves plus the stretch ABOVE the top hole,
  // which is the "nothing covered" fingering — it is a real position on the instrument, not a spare button.
  const zoneAt = (clientY) => {
    const el = pipe.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const rel = (clientY - r.top) / r.height;
    if (rel < 0 || rel > 1) return null;
    return Math.max(0, Math.min(6, Math.round((rel - 0.085) / 0.145)));
  };

  const start = (e) => {
    const n = zoneAt(e.clientY); if (n == null) return;
    const en = ensure(); setCovered(n); haptic.tick();
    if (!en) return;
    voice.current?.stop();
    voice.current = blow(en.ctx, en.master, freqFor(n));
    pipe.current?.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (covered == null) return;
    const n = zoneAt(e.clientY);
    if (n == null || n === covered) return;
    setCovered(n); haptic.tick();
    voice.current?.setFreq(freqFor(n));     // legato: the pipe re-lengthens, the breath carries on
  };
  const end = () => { voice.current?.stop(); voice.current = null; setCovered(null); };

  const note = covered == null ? null : covered;
  const oct = over ? "²" : "";

  return html`<div class="flex flex-col items-center gap-4">
    <div class="text-center min-h-16">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${T(t, "note")}</div>
      <div class="text-4xl font-bold leading-none tabular-nums" style="color:light-dark(#7a5c1f,#e8c874)">
        ${note == null ? "—" : `${NAMES[note]}${oct}`}
      </div>
      <div class="text-xs text-base-content/60 mt-1 font-mono h-4">${note == null ? "" : `${LAT[note]}${over ? 6 : 5}`}</div>
    </div>

    <div ref=${pipe} data-pipe
      class="relative w-24 rounded-[3rem] border border-base-content/15 touch-none select-none cursor-pointer"
      style="height:min(56svh,26rem);background:linear-gradient(100deg,#6b4a24,#a9793d 42%,#7d5729)"
      onPointerDown=${start} onPointerMove=${move} onPointerUp=${end} onPointerCancel=${end} onPointerLeave=${end}>
      <div class="absolute inset-x-0 flex justify-center" style="top:3.5%">
        <div class="w-8 h-1.5 rounded-full bg-black/45"></div>
      </div>
      ${[0, 1, 2, 3, 4, 5].map((i) => {
        // hole i is covered when the touch sits at or below it — the staircase, drawn
        const on = note != null && note >= 6 - i;
        return html`<div key=${i} data-hole=${i} aria-hidden="true"
          class=${`absolute left-1/2 -translate-x-1/2 w-7 h-7 rounded-full border transition-colors ${on ? "bg-base-content border-base-content/40" : "bg-black/70 border-black/50"}`}
          style=${`top:calc(${23 + i * 14.5}% - 0.875rem)`}></div>`;
      })}
    </div>

    <div class="flex items-center gap-2">
      <button id="over" data-over aria-pressed=${over} class=${`btn btn-sm rounded-2xl gap-2 ${over ? "btn-primary" : "btn-outline"}`}
        onClick=${() => { setOver((v) => !v); haptic.bump(); }}>${Icon("lucide:wind", "text-base")}${T(t, "overblow")}</button>
    </div>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
