// apps/brick — a brick-game handheld with an original platformer inside its screen.
//
// Three nested volumes, one light. The page is a lit enclosure (theme.css); the console is that
// page EXTRUDED (`sf-raised`); the screen is a recess cut into the console (`sf-inset`); and the
// blocks inside the game are extruded again under the same 45° upper-left source (atlas.js).
// That is the whole idea — the game is not a picture pasted onto a device, it is lit by the same
// lamp as the device.
//
// The simulation is wasm and knows nothing about any of it (tools/wasm/brick/game.c). This file
// is the enclosure, the pad and the bookkeeping.

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
import { useGamePad, useKeyboardPad, PAD } from "/_rt/dpad.js";
import { SCRW, SCRH, S, digits, betterRun } from "/_rt/brick.js";
import { renderFrame } from "./render.js";
import { loadEngine, canvasPainter, makeClock, makeSound, GATE_SEED } from "./engine.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/* ── persisted ────────────────────────────────────────────────────────────────────────── */
const NS = "brick:";
const $best = persistentAtom(`${NS}best`, null, { encode: JSON.stringify, decode: JSON.parse });
const $runs = persistentAtom(`${NS}runs`, "0");
const $sound = persistentAtom(`${NS}sound`, "1");
/** Live readouts. Kept out of the store on purpose: they change sixty times a second and nothing
    that renders should depend on them — the DOM mirrors below are updated by hand, once a frame. */
const $over = atom(false);

/* ── the console ──────────────────────────────────────────────────────────────────────── */
export function brick(props) {
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

  const { mask, padProps, buttonProps, set } = useGamePad();
  useKeyboardPad(mask, null);

  /* A tap or a key press from an assistive technology has no pointer lifecycle, so give it a
     short pulse instead — otherwise the pad is unusable without a finger. */
  const pulse = useCallback((bit) => {
    set(-1, (mask.current & bit) ? 0 : bit);
    setTimeout(() => set(-1, 0), 130);
  }, [set, mask]);

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

      const ctx = cv.current?.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      painter.current = canvasPainter(ctx);
      setReady(true);

      const clock = makeClock(() => {
        E.step(mask.current);
        const st = E.state();
        if (st[S.SFX]) sound.current?.play(st[S.SFX]);
      });

      /* The gate has no finger and no patience: seed a fixed track and run it forward so every
         check below — a11y, overflow, the screenshots, the taste pass — measures a POPULATED
         screen instead of an empty one. Sensor apps in this farm shipped broken twice for
         exactly the missing version of this. */
      if (gate) for (let i = 0; i < 140; i++) E.step(PAD.RIGHT | PAD.RUN | ((i % 46) < 16 ? PAD.JUMP : 0));

      const paint = () => {
        const st = E.state(), { dl, n } = E.list();
        painter.current.keep();
        renderFrame(painter.current, dl, n, st);
        const h = hud.current;
        if (h) {
          h.dataset.dist = st[S.DIST]; h.dataset.score = st[S.SCORE];
          h.dataset.coins = st[S.COINS]; h.dataset.frame = st[S.FRAME];
          h.dataset.dead = st[S.DEAD] ? "1" : "0";
        }
        if (st[S.DEAD] && !$over.get()) {
          $over.set(true);
          $runs.set(String((+$runs.get() || 0) + 1));
          $best.set(betterRun($best.get(), { dist: st[S.DIST], score: st[S.SCORE], coins: st[S.COINS] }));
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

      // A backgrounded game must stop, and it must not bank the time it was away for.
      const vis = () => { if (document.hidden) clock.reset(); };
      document.addEventListener("visibilitychange", vis);
      return () => document.removeEventListener("visibilitychange", vis);
    })();
    return () => { live = false; cancelAnimationFrame(raf); };
  }, []);

  const restart = useCallback(() => {
    seed.current = gate ? GATE_SEED : (Math.random() * 0xffffffff) >>> 0;
    eng.current?.init(seed.current);
    $over.set(false);
  }, []);

  /* The audio context is created and resumed inside a real press, and nothing waits on it: a
     suspended context with no user activation leaves resume() pending forever rather than
     rejecting, so anything sequenced behind it never runs at all. */
  const arm = useCallback(() => { sound.current?.arm(); }, []);

  const key = (extra = "") =>
    `sf-raised sf-press active:sf-pressed rounded-2xl grid place-items-center select-none ${extra}`;

  const dpadKey = (bit, icon, label, pos) => html`
    <button class=${`${key("bg-base-100")} ${pos}`} style="width:var(--ms-ctl);height:var(--ms-ctl)"
      aria-label=${T(t, label)} data-pad=${label} onClick=${() => pulse(bit)}>
      ${Icon(icon, "text-[var(--ms-icon)] opacity-80")}
    </button>`;

  return html`<${Fragment}>
    <div class="ms-side h-full min-h-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">

      <!-- the screen: a recess in the console, with the game inside it -->
      <div data-stage-box class="flex-1 min-h-0 grid place-items-center">
        <div class="sf-inset rounded-[var(--ms-r)] p-2 max-w-full max-h-full grid place-items-center"
             style="aspect-ratio:${SCRW}/${SCRH};height:100%;width:auto">
          <div class="relative w-full h-full" ref=${hud} data-live-screen>
            <canvas ref=${cv} width=${SCRW} height=${SCRH}
              class="block w-full h-full rounded-[calc(var(--ms-r)-0.4rem)]"
              style="image-rendering:pixelated"
              role="img" aria-label=${T(t, "screenAlt")}></canvas>
            ${!ready && !err ? html`<div class="absolute inset-0 grid place-items-center"><${Pixels} cls="w-full h-full" /></div>` : null}
            ${err ? html`<div class="absolute inset-0 grid place-items-center text-center text-[var(--ms-label)] px-3 text-base-content/70" data-err>${T(t, "noEngine")}</div>` : null}
            ${over ? html`
              <div class="absolute inset-0 grid place-items-center bg-base-100/0" data-over>
                <button class=${key("bg-base-100 px-4 py-3 gap-1 flex flex-col")} onClick=${restart} data-restart>
                  <span class="font-mono uppercase tracking-widest text-[var(--ms-label)] opacity-80">${T(t, "gameOver")}</span>
                  <span class="font-mono text-[var(--ms-title)]">${digits(best?.dist ?? 0, 4)}</span>
                </button>
              </div>` : null}
          </div>
        </div>
      </div>

      <!-- the deck -->
      <div class="ms-side-main shrink-0 flex items-center justify-between gap-[var(--ms-gap)]" onPointerDown=${arm}>

        <!-- D-pad: the direction comes from where the finger IS, so sliding between keys works -->
        <div class="relative sf-inset rounded-[var(--ms-r)] p-1" role="group" aria-label=${T(t, "padLabel")}
             style="width:calc(var(--ms-ctl)*3);height:calc(var(--ms-ctl)*3)" ...${padProps} data-pad-root>
          <div class="grid h-full w-full" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)">
            <div></div>${dpadKey(PAD.JUMP, "lucide:chevron-up", "padUp", "")}<div></div>
            ${dpadKey(PAD.LEFT, "lucide:chevron-left", "padLeft", "")}
            <div class="grid place-items-center"><div class="sf-inset rounded-full" style="width:38%;height:38%"></div></div>
            ${dpadKey(PAD.RIGHT, "lucide:chevron-right", "padRight", "")}
            <div></div>${dpadKey(PAD.DOWN, "lucide:chevron-down", "padDown", "")}<div></div>
          </div>
        </div>

        <!-- the middle keys: small, labelled, the way a brick game labels them -->
        <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0">
          <button class=${key("bg-base-100 px-3 py-1")} onClick=${() => { arm(); $sound.set(soundOn ? "0" : "1"); if (sound.current) sound.current.enabled = !soundOn; }}
            aria-pressed=${soundOn} aria-label=${T(t, "sound")} data-sound=${soundOn ? "1" : "0"}>
            ${Icon(soundOn ? "lucide:volume-2" : "lucide:volume-x", "text-[var(--ms-icon)] opacity-80")}
          </button>
          <button class=${key("bg-base-100 px-3 py-1 font-mono uppercase tracking-widest text-[var(--ms-label)]")}
            onClick=${restart} data-start>${T(t, "start")}</button>
          <button class=${key("bg-base-100 px-3 py-1 font-mono uppercase tracking-widest text-[var(--ms-label)]")}
            onClick=${() => A.screen.set("records")} id="b-records" data-records>${digits(best?.dist ?? 0, 4)}</button>
        </div>

        <!-- action keys, offset like the real thing: B sits low-left of A -->
        <div class="relative" style="width:calc(var(--ms-ctl)*2.6);height:calc(var(--ms-ctl)*2.2)">
          <button class=${key("bg-base-100 absolute right-0 top-0 rounded-full")}
            style="width:calc(var(--ms-ctl)*1.25);height:calc(var(--ms-ctl)*1.25)"
            aria-label=${T(t, "keyJump")} data-key="a" ...${buttonProps(PAD.JUMP)}>
            <span class="font-mono text-[var(--ms-label)] opacity-80">A</span>
          </button>
          <button class=${key("bg-base-100 absolute left-0 bottom-0 rounded-full")}
            style="width:calc(var(--ms-ctl)*1.25);height:calc(var(--ms-ctl)*1.25)"
            aria-label=${T(t, "keyRun")} data-key="b" ...${buttonProps(PAD.RUN)}>
            <span class="font-mono text-[var(--ms-label)] opacity-80">B</span>
          </button>
        </div>
      </div>
    </div>

    <${Sheet} id="records" open=${screen === "records"} onClose=${() => A.screen.set(null)}
      title=${T(t, "records")} icon="lucide:trophy" locale=${loc}>
      <div class="grid grid-cols-3 gap-[var(--ms-gap)] text-center">
        ${[["distance", best?.dist ?? 0], ["coins", best?.coins ?? 0], ["runs", +runs || 0]].map(([k, v]) => html`
          <div class="sf-inset rounded-2xl p-3">
            <div class="font-mono text-[var(--ms-title)]" data-stat=${k}>${v}</div>
            <div class="text-[var(--ms-label)] uppercase tracking-widest opacity-70 mt-1">${T(t, k)}</div>
          </div>`)}
      </div>
      <button class="btn btn-ghost rounded-2xl w-full" data-haptic="bump" id="records-reset"
        onClick=${() => props.confirm?.({
          title: T(t, "resetTitle"), body: T(t, "resetBody"), verb: T(t, "resetVerb"),
          onConfirm: () => { $best.set(null); $runs.set("0"); A.screen.set(null); },
        })}>${T(t, "resetTitle")}</button>
    </${Sheet}>
  </${Fragment}>`;
}
