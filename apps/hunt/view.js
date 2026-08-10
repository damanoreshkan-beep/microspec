
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { Pixels } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { useTouchDeck, useKeyboardPad, PAD } from "/_rt/dpad.js";
import { GameConsole } from "/_rt/console.js";
import { SCRW, SCRH, S, IN, WORLD, SFX as SFXBITS, digits, betterRun } from "/_rt/hunt.js";
import { renderFrame } from "./render.js";
import { loadEngine, canvasPainter, makeClock, makeSound, GATE_SEED } from "./engine.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const DECK_PAD = [
  { id: "padUp", pad: "up", bit: PAD.JUMP, icon: "lucide:chevron-up", label: "padUp" },
  { id: "padLeft", pad: "left", bit: PAD.LEFT, icon: "lucide:chevron-left", label: "padLeft" },
  { id: "padRight", pad: "right", bit: PAD.RIGHT, icon: "lucide:chevron-right", label: "padRight" },
  { id: "padDown", pad: "down", bit: PAD.DOWN, icon: "lucide:chevron-down", label: "padDown" },
];


const DECK_ACTIONS = [
  { id: "jump", bit: PAD.JUMP, icon: "lucide:chevrons-up", label: "keyJump" },
  { id: "throw", bit: IN.SHOOT, icon: "lucide:send", iconCls: "-rotate-45", label: "keyThrow" },
  { id: "run", bit: PAD.RUN, icon: "lucide:wind", label: "keyRun", latch: true },
];
const DEATH_ARC = 45;
const NS = "hunt:";
const $best = persistentAtom(`${NS}best`, null, { encode: JSON.stringify, decode: JSON.parse });
const $runs = persistentAtom(`${NS}runs`, "0");
const $sound = persistentAtom(`${NS}sound`, "1");
const $over = atom(false);

export function hunt(props) {
  const { S: A, t } = props;
  const loc = useStore(A.locale);
  const screen = useStore(A.screen);
  const best = useStore($best);
  const runs = useStore($runs);
  const soundOn = useStore($sound) === "1";
  const over = useStore($over);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const cv = useRef(null), hud = useRef(null);
  const eng = useRef(null), sound = useRef(null), painter = useRef(null);
  const seed = useRef(gate ? GATE_SEED : (Math.random() * 0xffffffff) >>> 0);
  const restartRef = useRef(null);
  /** The frame she died on, or null while she is alive — the death arc's clock. */
  const fell = useRef(null);

  const act = useCallback((name) => {
    if (name === "sound") {
      const next = $sound.get() !== "1";
      $sound.set(next ? "1" : "0");
      if (sound.current) sound.current.enabled = next;
      sound.current?.arm();
    } else if (name === "start") restartRef.current?.();
    else if (name === "records") A.screen.set("records");
  }, [A]);
  const { mask, deckProps, pulse, setKeys } = useTouchDeck({ onAct: act });
  useKeyboardPad(setKeys, act);

  useEffect(() => {
    let live = true, raf = 0;
    (async () => {
      let E;
      try { E = await loadEngine(); } catch (e) { if (live) setErr(String(e?.message || e)); return; }
      if (!live) return;
      eng.current = E;
      sound.current = makeSound();
      sound.current.enabled = $sound.get() === "1";
      E.init(seed.current);
      
      fell.current = null;
      $over.set(false);

      const ctx = cv.current?.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      painter.current = canvasPainter(ctx);
      setReady(true);

      
      const shake = { current: 0 };
      const clock = makeClock(() => {
        E.step(mask.current);
        const st = E.state();
        const sfx = st[S.SFX];
        if (sfx) {
          sound.current?.play(sfx);
          if (sfx & SFXBITS.HURT) shake.current = 4;
          else if (sfx & SFXBITS.DEATH) shake.current = 6;
          else if (sfx & (SFXBITS.BRICK | SFXBITS.STOMP)) shake.current = Math.max(shake.current, 2);
        }
      });

      
      if (gate) {
        const track = (i) => IN.RIGHT | ((i % 60) < 16 ? IN.JUMP : 0) | ((i % 30) === 0 ? IN.SHOOT : 0);
        const survives = (n) => {
          E.init(seed.current);
          for (let i = 0; i < n; i++) E.step(track(i));
          for (let i = 0; i < 240; i++) { E.step(0); if (E.state()[S.DEAD]) return false; }
          return true;
        };
        let best = 0;
        for (let n = 150; n >= 20; n -= 10) if (survives(n)) { best = n; break; }
        E.init(seed.current);
        for (let i = 0; i < best; i++) E.step(track(i));
      }

      const paint = () => {
        const st = E.state(), { dl, n } = E.list();
        const s = Math.round(shake.current);
        if (s > 0 && ctx.save) {
          ctx.save();
          ctx.translate((st[S.FRAME] & 1 ? 1 : -1) * s, (st[S.FRAME] & 2 ? 1 : -1) * ((s / 2) | 0));
        }
        renderFrame(painter.current, dl, n, st, { box: E.box });
        if (s > 0 && ctx.save) ctx.restore();
        if (shake.current > 0) shake.current = Math.max(0, shake.current - 0.5);
        const h = hud.current;
        if (h) {
          h.dataset.dist = st[S.DIST]; h.dataset.score = st[S.SCORE];
          h.dataset.frame = st[S.FRAME]; h.dataset.dead = st[S.DEAD] ? "1" : "0";
          h.dataset.ammo = st[S.AMMO]; h.dataset.hp = st[S.HP]; h.dataset.kills = st[S.KILLS];
          h.dataset.camx = st[S.CAMX];
          h.dataset.mask = mask.current;
        }
        
        if (st[S.DEAD]) {
          if (fell.current == null) {
            fell.current = st[S.FRAME];
            $runs.set(String((+$runs.get() || 0) + 1));
            $best.set(betterRun($best.get(), { dist: st[S.DIST], score: st[S.SCORE], kills: st[S.KILLS] }));
          } else if (!$over.get() && st[S.FRAME] - fell.current >= DEATH_ARC) {
            $over.set(true);
          }
        }
      };

      const frame = (now) => {
        if (!live) return;
        if (!$over.get()) clock.tick(now);
        paint();
        raf = requestAnimationFrame(frame);
      };
      paint();
      raf = requestAnimationFrame(frame);
      const vis = () => { if (document.hidden) clock.reset(); };
      document.addEventListener("visibilitychange", vis);
      return () => document.removeEventListener("visibilitychange", vis);
    })();
    return () => { live = false; cancelAnimationFrame(raf); };
  }, []);

  const restart = useCallback(() => {
    seed.current = gate ? GATE_SEED : (Math.random() * 0xffffffff) >>> 0;
    eng.current?.init(seed.current);
    fell.current = null;
    $over.set(false);
  }, []);
  restartRef.current = restart;
  const arm = useCallback(() => { sound.current?.arm(); }, []);
  return html`<${Fragment}>
    <${GameConsole}
      deck=${deckProps}
      onPointerDown=${arm}
      plate=${WORLD.sky[0]}
      t=${t}
      onKeyboard=${(k) => (k.bit ? pulse(k.bit) : act(k.act))}
      pad=${DECK_PAD}
      actions=${DECK_ACTIONS}
      menu=${[
        { id: "sound", act: "sound", icon: soundOn ? "lucide:volume-2" : "lucide:volume-x", label: "sound", pressed: soundOn },
        { id: "records", act: "records", icon: "lucide:trophy", label: "records" },
      ]}
      overlay=${over ? html`
        
        <div class="absolute inset-0 grid place-items-center overflow-hidden" data-over>
          <button class="sf-raised sf-press active:sf-pressed bg-base-100 rounded-[var(--ms-r)] gap-1 flex flex-col items-center max-w-full max-h-full px-[var(--ms-pad)] py-[calc(var(--ms-pad)*0.7)]"
                  onClick=${restart} data-restart>
            <span class="font-mono uppercase tracking-widest text-[var(--ms-label)] opacity-80">${T(t, "gameOver")}</span>
            <span class="font-mono text-[var(--ms-title)]">${digits(best?.dist ?? 0, 4)}</span>
          </button>
        </div>` : null}
    >
      <div class="relative w-full h-full" ref=${hud} data-live-screen>
        <canvas ref=${cv} width=${SCRW} height=${SCRH}
          class="block max-w-full max-h-full w-auto h-auto rounded-[calc(var(--ms-r)-0.4rem)]"
          style="image-rendering:pixelated"
          role="img" aria-label=${T(t, "screenAlt")}></canvas>
        ${!ready && !err ? html`<div class="absolute inset-0 grid place-items-center"><${Pixels} cls="w-full h-full" /></div>` : null}
        ${err ? html`<div class="absolute inset-0 grid place-items-center text-center text-[var(--ms-label)] px-3 text-base-content/70" data-err>${T(t, "noEngine")}</div>` : null}
      </div>
    </${GameConsole}>

    ${screen === "records" ? html`<${Sheet} id="records" open=${true} onClose=${() => A.screen.set(null)}
      title=${T(t, "records")} icon="lucide:trophy" locale=${loc}>
      <div class="grid grid-cols-3 gap-[var(--ms-gap)] text-center">
        ${[["distance", best?.dist ?? 0], ["kills", best?.kills ?? 0], ["runs", +runs || 0]].map(([k, v]) => html`
          <div class="sf-inset rounded-2xl p-3 min-w-0">
            <div class="font-mono text-[var(--ms-title)] truncate" data-stat=${k}>${v}</div>
            <div class="text-[var(--ms-label)] uppercase tracking-wide opacity-70 mt-1 leading-[1.4] break-words">${T(t, k)}</div>
          </div>`)}
      </div>
      <button class="btn btn-ghost rounded-2xl w-full" data-haptic="bump" id="records-reset"
        onClick=${() => props.confirm?.({
          title: T(t, "resetTitle"), body: T(t, "resetBody"), verb: T(t, "resetVerb"),
          onConfirm: () => { $best.set(null); $runs.set("0"); A.screen.set(null); },
        })}>${T(t, "resetTitle")}</button>
    </${Sheet}>` : null}
  </${Fragment}>`;
}