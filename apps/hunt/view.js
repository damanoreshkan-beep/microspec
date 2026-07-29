// apps/hunt — a huntress, a finite quiver and a forest that keeps coming.
//
// The opposite shape to `brick` on purpose. brick is a device you hold: a console body, a screen
// recessed into it, controls below. hunt is the screen — the game fills the view and the controls
// float over it, because a phone game that spends half its height on a bezel is a phone game with
// half a screen. Same engine lineage, same light, opposite frame.
//
// The simulation is wasm (tools/wasm/hunt/game.c) and knows none of this.

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
import { GameConsole, ShellPicker, SHELL_IDS } from "/_rt/console.js";
import { SCRW, SCRH, S, IN, digits, betterRun } from "/_rt/hunt.js";
import { renderFrame } from "./render.js";
import { loadEngine, canvasPainter, makeClock, makeSound, GATE_SEED } from "./engine.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

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

      /* The gate has no finger. Seed a fixed track and run it forward so a11y, overflow, the
         screenshots and the taste pass all measure a POPULATED screen — with a spear in the air,
         because a game photographed at rest is a photograph of a background. */
      if (gate) for (let i = 0; i < 150; i++)
        E.step(IN.RIGHT | ((i % 60) < 16 ? IN.JUMP : 0) | ((i % 30) === 0 ? IN.SHOOT : 0));

      const paint = () => {
        const st = E.state(), { dl, n } = E.list();
        renderFrame(painter.current, dl, n, st, { box: E.box });
        const h = hud.current;
        if (h) {
          h.dataset.dist = st[S.DIST]; h.dataset.score = st[S.SCORE];
          h.dataset.frame = st[S.FRAME]; h.dataset.dead = st[S.DEAD] ? "1" : "0";
          h.dataset.ammo = st[S.AMMO]; h.dataset.hp = st[S.HP]; h.dataset.kills = st[S.KILLS];
          h.dataset.camx = st[S.CAMX];
          /* The live input mask. A test about INPUT should measure input: asserting that a held key
             survives a tap by watching the player's distance lets the terrain veto the answer — she
             can be alive, still holding right, and simply pressed against a step. */
          h.dataset.mask = mask.current;
        }
        if (st[S.DEAD] && !$over.get()) {
          $over.set(true);
          $runs.set(String((+$runs.get() || 0) + 1));
          $best.set(betterRun($best.get(), { dist: st[S.DIST], score: st[S.SCORE], kills: st[S.KILLS] }));
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
    $over.set(false);
  }, []);
  restartRef.current = restart;
  const arm = useCallback(() => { sound.current?.arm(); }, []);

  return html`<${Fragment}>
    <${GameConsole}
      deck=${deckProps}
      onPointerDown=${arm}
      t=${t}
      onKeyboard=${(k) => (k.bit ? pulse(k.bit) : act(k.act))}
      pad=${[
        { id: "padUp", pad: "up", bit: PAD.JUMP, icon: "lucide:chevron-up", label: "padUp" },
        { id: "padLeft", pad: "left", bit: PAD.LEFT, icon: "lucide:chevron-left", label: "padLeft" },
        { id: "padRight", pad: "right", bit: PAD.RIGHT, icon: "lucide:chevron-right", label: "padRight" },
        /* Crouch is its OWN key, not the pad's south slot. On a phone the thumb that steers cannot
           also duck without letting go of a direction, which is exactly the moment you need both. */
        { id: "padDown", pad: "down", bit: PAD.DOWN, icon: "lucide:chevrons-down", label: "keyCrouch" },
      ]}
      actions=${[
        { id: "throw", bit: IN.SHOOT, icon: "lucide:send", iconCls: "-rotate-45", label: "keyThrow" },
        { id: "run", bit: PAD.RUN, icon: "lucide:wind", label: "keyRun", latch: true },
      ]}
      menu=${[
        { id: "sound", act: "sound", icon: soundOn ? "lucide:volume-2" : "lucide:volume-x", label: "sound", pressed: soundOn },
        { id: "records", act: "records", icon: "lucide:trophy", label: "records" },
      ]}
      overlay=${over ? html`
        <div class="absolute inset-0 grid place-items-center" data-over>
          <button class="sf-raised sf-press active:sf-pressed bg-base-100 rounded-[var(--ms-r)] px-5 py-4 gap-1 flex flex-col items-center"
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

/**
 * The console picker, as its own tab.
 *
 * It lives in the game rather than in the profile because it is a thing you SEE change: pick a
 * shell, go back one tab, and the same game is in a different device. And the preference is stored
 * without an app prefix, so the shell chosen here is the shell brick wears too — one console, many
 * games, which is the whole reason the catalogue is in the runtime and not in this file.
 */
export function huntShell(props) {
  const { t } = props;
  return html`
    <div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]" data-shell-tab>
      <${ShellPicker} t=${t} />
      <div class="sf-inset rounded-[var(--ms-r)] p-[var(--ms-pad)] flex-1 min-h-0 grid place-items-center">
        <div class="text-center">
          <div class="font-mono text-[var(--ms-title)]" data-shell-count>${SHELL_IDS.length}</div>
          <div class="text-[var(--ms-label)] uppercase tracking-wide opacity-70 mt-1">${T(t, "shellPick")}</div>
        </div>
      </div>
    </div>`;
}
