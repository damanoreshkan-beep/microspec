import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, createEngine, midiToFreq } from "/_rt/audio.js";
import { blow, fingeredSemitone, handCovered } from "/_rt/wind.js";
import { haptic } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const TONIC = 72;
const SCALE = [11, 9, 7, 5, 4, 2, 0];
const HOLES = 6;
const TOP = 28, GAP = 11.4;                         
const HIT = 0.052;                                  
const NAMES = ["До", "До♯", "Ре", "Ре♯", "Мі", "Фа", "Фа♯", "Соль", "Соль♯", "Ля", "Ля♯", "Сі"];
const LAT = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const BORE = "rgba(0,0,0,.72)";        
const PAD = "#F2EDE4";                 
const WINDOW = "rgba(0,0,0,.45)";

const semitoneFor = (covered) => fingeredSemitone(covered, SCALE);

export function sopilka({ S }) {
  const t = useStore(S.t);
  const [covered, setCovered] = useState(() => new Set());
  const [blowing, setBlowing] = useState(false);
  const [over, setOver] = useState(false);
  const eng = useRef(null), voice = useRef(null), pipe = useRef(null);
  const ptrs = useRef(new Map());                   
  const overRef = useRef(false); overRef.current = over;

  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) eng.current = createEngine({ master: 0.8 });
    eng.current.resume();
    return eng.current;
  };
  const freqOf = (set) => midiToFreq(TONIC + semitoneFor(set) + (overRef.current ? 12 : 0));

  useEffect(() => () => { try { voice.current?.stop(); } catch {  } if (eng.current) eng.current.close(); }, []);
  useEffect(() => { if (voice.current) voice.current.setFreq(freqOf(covered)); }, [over]);

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
  const sync = () => {
    const set = handCovered([...ptrs.current.values()].filter((v) => v != null));
    setCovered(set);
    if (voice.current) voice.current.setFreq(freqOf(set));   
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
    if (ptrs.current.size === 0) {                  
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
      <div class="text-[0.62rem] font-mono uppercase text-muted">${T(t, "note")}</div>
      <div class="text-4xl font-bold leading-none tabular-nums" style="color:light-dark(#7a5c1f,#e8c874)">
        ${semi == null ? "—" : NAMES[semi]}
      </div>
      <div class="text-xs text-muted mt-1 font-mono h-4">${semi == null ? "" : `${LAT[semi]}${oct}`}</div>
    </div>

    <div ref=${pipe} data-pipe
      class="relative w-24 rounded-[3rem] sf-e3 touch-none select-none cursor-pointer"
      style="height:min(60svh,29rem);background:linear-gradient(100deg,#6b4a24,#a9793d 42%,#7d5729)"
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
      <div class="absolute inset-x-0 flex justify-center" style="top:9%">
        <div class="w-8 h-1.5 rounded-full" style=${`background:${WINDOW}`}></div>
      </div>
      ${Array.from({ length: HOLES }, (_, i) => html`<div key=${i} data-hole=${i} aria-hidden="true"
        class="absolute left-1/2 -translate-x-1/2 w-7 h-7 rounded-full transition-colors"
        style=${`top:calc(${TOP + i * GAP}% - 0.875rem);background:${covered.has(i) ? PAD : BORE}`}></div>`)}
    </div>

    <button id="over" data-over aria-pressed=${over} class=${`btn btn-sm rounded-2xl gap-2 ${over ? "btn-primary" : "btn-outline"}`}
      data-haptic="bump" onClick=${() => setOver((v) => !v)}>${Icon("lucide:wind", "text-base")}${T(t, "overblow")}</button>
    ${!audioSupported ? html`<div class="text-xs text-base-content/70 text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
