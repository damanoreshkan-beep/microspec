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
import { GameConsole } from "/_rt/console.js";
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
          h.dataset.coins = st[S.COINS]; h.dataset.frame = st[S.FRAME]; h.dataset.camx = st[S.CAMX];
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
  return html`<${Fragment}>
    <!-- THE CONSOLE ITSELF. Without this the app is a screen and some keys lying on a page, which
         is exactly how the first live shot read: the whole premise of the design — the console is
         the page EXTRUDED, the screen is a recess cut into the console — was simply not on screen.
         It is sized to its contents and centred rather than stretched, so it reads as an object you
         are holding instead of as a layout that filled the window. -->
    <${GameConsole}
      layout="handheld"
      deck=${deckProps}
      onPointerDown=${arm}
      t=${t}
      onKeyboard=${(k) => (k.bit ? pulse(k.bit) : act(k.act))}
      pad=${[
        { id: "padUp", pad: "up", bit: PAD.JUMP, icon: "lucide:chevron-up", label: "padUp" },
        { id: "padLeft", pad: "left", bit: PAD.LEFT, icon: "lucide:chevron-left", label: "padLeft" },
        { id: "padRight", pad: "right", bit: PAD.RIGHT, icon: "lucide:chevron-right", label: "padRight" },
        { id: "padDown", pad: "down", bit: PAD.DOWN, icon: "lucide:chevron-down", label: "padDown" },
      ]}
      actions=${[
        { id: "a", bit: PAD.JUMP, text: "A", label: "keyJump" },
        { id: "b", bit: PAD.RUN, text: "B", label: "keyRun", latch: true },
      ]}
      menu=${[{ id: "sound", act: "sound", icon: soundOn ? "lucide:volume-2" : "lucide:volume-x", label: "sound", pressed: soundOn }]}
      centre=${[
        { id: "start", act: "start", text: T(t, "start"), label: "start" },
        { id: "records", act: "records", text: digits(best?.dist ?? 0, 4), label: "records" },
      ]}
      overlay=${over ? html`
        <div class="absolute inset-0 grid place-items-center" data-over>
          <button class="sf-raised sf-press active:sf-pressed bg-base-100 rounded-2xl px-4 py-3 gap-1 flex flex-col items-center"
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
