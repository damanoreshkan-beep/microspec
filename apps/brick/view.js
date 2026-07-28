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
import { useTouchDeck, useKeyboardPad, PAD } from "/_rt/dpad.js";
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

  /* One touch surface for the whole deck. `act` is what a momentary key does when the finger
     lifts over it; the held keys need nothing here — the loop reads `mask` directly. */
  const act = useCallback((name) => {
    if (name === "sound") {
      const next = $sound.get() !== "1";
      $sound.set(next ? "1" : "0");
      if (sound.current) sound.current.enabled = next;
      sound.current?.arm();
    } else if (name === "start") restartRef.current?.();
    else if (name === "records") A.screen.set("records");
  }, [A]);
  const restartRef = useRef(null);
  const { mask, deckProps, pulse } = useTouchDeck({ onAct: act });
  useKeyboardPad(mask, null);

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
  restartRef.current = restart;

  /* The audio context is created and resumed inside a real press, and nothing waits on it: a
     suspended context with no user activation leaves resume() pending forever rather than
     rejecting, so anything sequenced behind it never runs at all. */
  const arm = useCallback(() => { sound.current?.arm(); }, []);

  /* Two things about the records sheet, both learned from the gate rather than from a stylesheet:
     ── A CLOSED sheet is not an absent one. DaisyUI keeps `.modal` in the layout (hidden, not
        removed), so a dialog nobody opened still has a box. And the watch-200px check only measures
        `#view` at all when the screen carries no `.card` — which is true of a console and of almost
        nothing else in the farm, so this app is the first place that branch has ever really run.
        Hence: mount the sheet when it opens, not before.
     ── Every cell inside it needs `min-w-0`. A `1fr` grid column carries a floor of its own
        min-content, and one uppercase letter-spaced word (ВІДСТАНЬ) is wider than a third of a
        200px screen, so the column refuses to shrink and the sheet pushes 24px past the view. The
        farm has paid for this exact shape once already, with `flex-1` in the dock.
     No comments about either inside the template below: an htm template IS a template literal, so a
     backtick in an HTML comment closes it and the whole view stops parsing. */
  const key = (extra = "") =>
    `sf-raised sf-press active:sf-pressed rounded-2xl grid place-items-center select-none ${extra}`;

  /* onClick is for KEYBOARD and assistive technology only. A real finger is already handled by
     the deck (pointerdown holds the key, pointerup releases it), and letting the browser's click
     fire as well would toggle sound twice per tap. `event.detail` is the discrimination: a click
     synthesised by .click() or by Enter carries 0, one a pointer caused carries at least 1.
     It also keeps the gate honest — its synthetic pointerdown has no coordinates, so
     elementFromPoint never resolves a key and the click is the only thing that runs. */
  const kb = (fn) => (e) => { if (!e.detail) fn(); };

  const dpadKey = (bit, icon, label) => html`
    <button class=${key("bg-base-100 w-full h-full")} data-bit=${bit} data-haptic="bump"
      aria-label=${T(t, label)} data-pad=${label} onClick=${kb(() => pulse(bit))}>
      ${Icon(icon, "text-[var(--ms-icon)] opacity-80")}
    </button>`;

  return html`<${Fragment}>
    <!-- THE CONSOLE ITSELF. Without this the app is a screen and some keys lying on a page, which
         is exactly how the first live shot read: the whole premise of the design — the console is
         the page EXTRUDED, the screen is a recess cut into the console — was simply not on screen.
         It is sized to its contents and centred rather than stretched, so it reads as an object you
         are holding instead of as a layout that filled the window. -->
    <div class="h-full min-h-0 flex flex-col justify-center items-center">
    <div class="ms-side sf-raised bg-base-100 rounded-[calc(var(--ms-r)*1.5)] w-full max-w-[26rem]
                min-h-0 shrink flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">

      <!-- the screen: a recess in the console, with the game inside it -->
      <!-- flex-1 min-h-0 is not decoration: it gives the canvas a parent with a DEFINITE height,
           and max-h-full has nothing to resolve against without one. Removing it to kill a dead
           band left the canvas holding all 270px at every size, and the deck slid under the dock —
           21px of overflow at 360x340 and 38px hidden behind the bar. The band stays gone for the
           other reason: the console body is sized to its contents now, so flex-1 only distributes
           space that exists when the screen is genuinely short. -->
      <div data-stage-box class="flex-1 min-h-0 grid place-items-center">
        <!-- The canvas carries its own intrinsic 288×270 and is allowed to SHRINK, never to be
             stretched: a fixed-ratio wrapper at height:100% derives its width from a parent that
             has none to give, and on a 200px screen that came out 366px wide. Letting the replaced
             element do the fitting also keeps the scale integral wherever there is room for it,
             which for a pixel display is the difference between crisp and shimmering. -->
        <div class="sf-inset rounded-[var(--ms-r)] p-2 max-w-full max-h-full min-w-0 min-h-0 grid place-items-center">
          <div class="relative max-w-full max-h-full min-w-0 min-h-0" ref=${hud} data-live-screen>
            <canvas ref=${cv} width=${SCRW} height=${SCRH}
              class="block max-w-full max-h-full w-auto h-auto rounded-[calc(var(--ms-r)-0.4rem)]"
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

      <!-- The deck is ONE touch surface. You rest a thumb on it and slide; whatever is under the
           thumb is what is pressed, and every key you cross answers. Per-key handlers cannot do
           that — the first to see pointerdown captures the pointer and the rest go deaf. -->
      <div class="ms-side-main shrink-0 grid items-center gap-[var(--ms-gap)] min-w-0"
           style="grid-template-columns:auto minmax(0,1fr) auto"
           ...${deckProps} onPointerDown=${(e) => { arm(); deckProps.onPointerDown(e); }}>

        <div class="relative sf-inset rounded-[var(--ms-r)] p-1" role="group" aria-label=${T(t, "padLabel")}
             style="width:calc(var(--ms-ctl)*3);aspect-ratio:1" data-pad-root>
          <div class="grid h-full w-full" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)">
            <div></div>${dpadKey(PAD.JUMP, "lucide:chevron-up", "padUp")}<div></div>
            ${dpadKey(PAD.LEFT, "lucide:chevron-left", "padLeft")}
            <div class="grid place-items-center"><div class="sf-inset rounded-full" style="width:38%;height:38%"></div></div>
            ${dpadKey(PAD.RIGHT, "lucide:chevron-right", "padRight")}
            <div></div>${dpadKey(PAD.DOWN, "lucide:chevron-down", "padDown")}<div></div>
          </div>
        </div>

        <!-- the middle keys: small, labelled, the way a brick game labels them. These are moments,
             not holds, so they fire when the finger LIFTS over them. -->
        <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0 w-full">
          <button class=${key("bg-base-100 px-3 py-1")} data-act="sound" data-haptic="bump"
            onClick=${kb(() => act("sound"))}
            aria-pressed=${soundOn} aria-label=${T(t, "sound")} data-sound=${soundOn ? "1" : "0"}>
            ${Icon(soundOn ? "lucide:volume-2" : "lucide:volume-x", "text-[var(--ms-icon)] opacity-80")}
          </button>
          <button class=${key("bg-base-100 px-2 py-1 w-full max-w-[7rem] font-mono uppercase tracking-wide text-[var(--ms-label)] truncate")}
            data-act="start" data-haptic="bump" onClick=${kb(() => act("start"))} data-start>${T(t, "start")}</button>
          <button class=${key("bg-base-100 px-2 py-1 w-full max-w-[7rem] font-mono uppercase tracking-wide text-[var(--ms-label)] truncate")}
            data-act="records" data-haptic="bump" onClick=${kb(() => act("records"))}
            id="b-records" data-records>${digits(best?.dist ?? 0, 4)}</button>
        </div>

        <!-- action keys, offset like the real thing: B sits low-left of A -->
        <div class="relative shrink-0" style="width:calc(var(--ms-ctl)*2.4);aspect-ratio:2.4/1.7">
          <button class=${key("bg-base-100 absolute right-0 top-0 rounded-full")}
            style="width:52%;aspect-ratio:1" data-bit=${PAD.JUMP} data-haptic="bump"
            aria-label=${T(t, "keyJump")} data-key="a" onClick=${kb(() => pulse(PAD.JUMP))}>
            <span class="font-mono text-[var(--ms-label)] opacity-80">A</span>
          </button>
          <button class=${key("bg-base-100 absolute left-0 bottom-0 rounded-full")}
            style="width:52%;aspect-ratio:1" data-bit=${PAD.RUN} data-haptic="bump" data-latch
            aria-label=${T(t, "keyRun")} aria-pressed="false" data-key="b" onClick=${kb(() => pulse(PAD.RUN))}>
            <span class="font-mono text-[var(--ms-label)] opacity-80">B</span>
          </button>
        </div>
      </div>
    </div>
    </div>

    ${screen === "records" ? html`<${Sheet} id="records" open=${true} onClose=${() => A.screen.set(null)}
      title=${T(t, "records")} icon="lucide:trophy" locale=${loc}>
      <div class="grid grid-cols-3 gap-[var(--ms-gap)] text-center">
        ${[["distance", best?.dist ?? 0], ["coins", best?.coins ?? 0], ["runs", +runs || 0]].map(([k, v]) => html`
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
