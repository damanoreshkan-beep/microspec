// apps/swarm — the room is the arena. The rear camera is a viewfinder, the ring of hostiles
// lives at real-world azimuths, and aiming is physically turning the phone (compass heading +
// tilt). The simulation is wasm (tools/wasm/swarm/game.c) and knows none of this; projection and
// every pixel live in render.js.
//
// Chrome over the viewfinder is deliberately FIXED-colour (solid ink chips, white text): the
// backdrop is foreign content — a camera frame — not a themed surface, so theme-aware classes
// would flip against pixels they cannot know. Same stance as cam's bezel internals.

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
import { camera, compass, tilt, wakeLock, haptic } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { S, SFX, packInput, decodeEntry, wrapT, lockOn, betterRun } from "/_rt/swarm.js";
import { renderFrame } from "./render.js";
import { loadEngine, makeClock, makeSound, GATE_SEED } from "./engine.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/* Frames between DEAD and the over-card, so the last sting is actually seen (hunt's lesson:
   raising the card on the flag's own frame animates a death nobody ever saw). */
const DEATH_ARC = 40;

const NS = "swarm:";
const $best = persistentAtom(`${NS}best`, null, { encode: JSON.stringify, decode: JSON.parse });
const $runs = persistentAtom(`${NS}runs`, "0");
const $sound = persistentAtom(`${NS}sound`, "1");
const $over = atom(false);

/* the shared bot: aim straight at the nearest entry, fire on a free trigger. The gate fixture
   and its survivability search both use it, so the two can never disagree about "playable". */
function botInput(E) {
  const st = E.state(), { dl, n } = E.list();
  let az = st[S.NAZ] >= 0 ? st[S.NAZ] : 0, el = 0;
  for (let i = 0; i < n; i++) {
    const e = decodeEntry(dl, i);
    if (e.distCm === st[S.NDIST]) { az = e.azT; el = e.elT; break; }
  }
  return packInput(az, Math.round(el / 10), st[S.COOLDOWN] === 0);
}

export function swarm(props) {
  const { S: A, t } = props;
  const loc = useStore(A.locale);
  const screen = useStore(A.screen);
  const best = useStore($best);
  const runs = useStore($runs);
  const soundOn = useStore($sound) === "1";
  const over = useStore($over);

  const [enabled, setEnabled] = useState(gate);
  const [camErr, setCamErr] = useState(null);
  const [ready, setReady] = useState(false);
  const [engErr, setEngErr] = useState("");

  const stage = useRef(null), cv = useRef(null), video = useRef(null), hud = useRef(null);
  const waveEl = useRef(null), scoreEl = useRef(null), comboEl = useRef(null), hearts = useRef(null);
  const eng = useRef(null), sound = useRef(null);
  const seed = useRef(gate ? GATE_SEED : (Math.random() * 0xffffffff) >>> 0);
  const headingT = useRef(2100), pitchT = useRef(0), dragT = useRef(0), fire = useRef(0);
  const fell = useRef(null), restartRef = useRef(null);

  const arm = useCallback(() => { sound.current?.arm(); }, []);
  const onEnable = useCallback(async () => {
    // one tap primes BOTH native prompts: orientation (iOS gesture-gated, shared by tilt) here,
    // the camera inside its own effect once `enabled` flips
    try { await compass.request(); } catch { /* the game still runs magnetic-less via drag */ }
    setCamErr(null); setEnabled(true);
  }, []);

  /* camera: only past the prime tap, never in the gate — the gate renders the training backdrop */
  useEffect(() => {
    if (gate || !enabled) return;
    // the stop fn arrives async; an unmount mid-permission must still release the stream the
    // moment it opens, so the disposal flag outlives the await
    let disposed = false, stop = () => {};
    (async () => { const s = await camera.start(video.current, setCamErr); if (disposed) s(); else stop = s; })();
    return () => { disposed = true; stop(); };
  }, [enabled]);

  /* sensors + wake lock: heading/pitch are refs — a re-render per compass event would fight the
     rAF loop for the main thread */
  useEffect(() => {
    if (gate || !enabled) return;
    const stopC = compass.start((deg) => { headingT.current = deg * 10; }, { trueNorth: false });
    const stopT = tilt.start(({ beta }) => {
      if (beta == null) return;
      // upright-in-hand is beta≈80; that maps to level aim, tuned on the reference device
      pitchT.current = Math.max(-450, Math.min(450, (beta - 80) * 10));
    });
    const lock = wakeLock.acquire();
    return () => { stopC(); stopT(); lock.release(); };
  }, [enabled]);

  /* drag-to-look: the fallback aim (desktop, denied sensors) and a trim on top of the compass.
     Styles/refs only — never state — per pointermove. */
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    let px = 0, down = false;
    const move = (e) => { if (down) { dragT.current -= (e.clientX - px) * (600 / el.clientWidth); px = e.clientX; } };
    const dn = (e) => { down = true; px = e.clientX; };
    const up = () => { down = false; };
    el.addEventListener("pointerdown", dn);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { el.removeEventListener("pointerdown", dn); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  /* keyboard trigger — the one input a gate can actually press */
  useEffect(() => {
    const dn = (e) => { if (e.code === "Space" || e.code === "KeyZ") { fire.current = 1; arm(); } };
    const up = (e) => { if (e.code === "Space" || e.code === "KeyZ") fire.current = 0; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    let live = true, raf = 0, muzzle = 0;
    (async () => {
      let E;
      try { E = await loadEngine(); } catch (e) { if (live) setEngErr(String(e?.message || e)); return; }
      if (!live) return;
      eng.current = E;
      sound.current = makeSound();
      sound.current.enabled = $sound.get() === "1";
      E.init(seed.current);
      fell.current = null;
      $over.set(false);

      const ctx = cv.current?.getContext("2d");
      if (!ctx) return;

      /* the gate has no hands and no compass. Run the aim-bot forward so every check measures a
         POPULATED fight — kills banked, ring mid-approach — and (hunt's lesson) SEARCH the length
         instead of writing it: the largest track whose aftermath survives 600 idle frames. */
      if (gate) {
        const survives = (k) => {
          E.init(seed.current);
          for (let i = 0; i < k; i++) E.step(botInput(E));
          for (let i = 0; i < 600; i++) { E.step(packInput(0, 0, 0)); if (E.state()[S.DEAD]) return false; }
          return true;
        };
        let len = 0;
        for (let k = 240; k >= 60; k -= 30) if (survives(k)) { len = k; break; }
        E.init(seed.current);
        for (let i = 0; i < len; i++) E.step(botInput(E));
      }

      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const fit = () => {
        const el = cv.current, box = stage.current;
        if (!el || !box) return;
        el.width = Math.max(1, Math.round(box.clientWidth * dpr));
        el.height = Math.max(1, Math.round(box.clientHeight * dpr));
      };
      fit();
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
      ro?.observe(stage.current);
      setReady(true);

      const clock = makeClock(() => {
        let h = (((headingT.current + dragT.current) % 3600) + 3600) % 3600;
        if (gate) {
          // the follower camera: drift toward the nearest threat so the 60° window is never
          // photographed empty — a fixed heading against a 360° ring usually would be
          const st = E.state();
          if (st[S.NAZ] >= 0) dragT.current += wrapT(st[S.NAZ] - h) * 0.06;
          h = (((headingT.current + dragT.current) % 3600) + 3600) % 3600;
        }
        E.step(packInput(h, Math.round(pitchT.current / 10), fire.current));
        const sfx = E.state()[S.SFX];
        if (sfx) {
          sound.current?.play(sfx);
          if (sfx & SFX.SHOOT) muzzle = 4;
          if (sfx & SFX.HURT) haptic.bump();
        }
      });

      const paint = () => {
        const st = E.state(), { dl, n } = E.list();
        const w = cv.current.width / dpr, hgt = cv.current.height / dpr;
        const hh = (((headingT.current + dragT.current) % 3600) + 3600) % 3600;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        let accent = "#FACC15";
        try { accent = getComputedStyle(cv.current).getPropertyValue("--app-accent").trim() || accent; } catch { /* preflight stub */ }
        const locked = st[S.DEAD] ? -1 : lockOn(dl, n, hh, pitchT.current);
        renderFrame(ctx, dl, n, st, hh, pitchT.current, w, hgt, { muzzle, lockedIdx: locked, accent });
        if (muzzle > 0) muzzle--;

        // imperative HUD writes — a Preact render per frame would fight the loop it feeds
        if (waveEl.current) waveEl.current.textContent = st[S.WAVE];
        if (scoreEl.current) scoreEl.current.textContent = st[S.SCORE];
        if (comboEl.current) {
          comboEl.current.textContent = st[S.COMBO] >= 2 ? `×${st[S.COMBO]}` : "";
          comboEl.current.style.opacity = st[S.COMBO] >= 2 ? 1 : 0;
        }
        if (hearts.current) {
          [...hearts.current.children].forEach((el, i) => { el.style.opacity = i < st[S.HP] ? 1 : 0.22; });
        }
        const hd = hud.current;
        if (hd) {
          hd.dataset.frame = st[S.FRAME]; hd.dataset.wave = st[S.WAVE]; hd.dataset.score = st[S.SCORE];
          hd.dataset.hp = st[S.HP]; hd.dataset.alive = st[S.ALIVE]; hd.dataset.dead = st[S.DEAD] ? "1" : "0";
          hd.dataset.kills = st[S.KILLS]; hd.dataset.shots = st[S.SHOTS];
          hd.dataset.heading = Math.round(hh / 10);
        }
        /* the run is banked at DEATH; the card waits out the arc so the sting is seen */
        if (st[S.DEAD]) {
          if (fell.current == null) {
            fell.current = st[S.FRAME];
            $runs.set(String((+$runs.get() || 0) + 1));
            $best.set(betterRun($best.get(), { wave: st[S.WAVE], score: st[S.SCORE], kills: st[S.KILLS] }));
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
      return () => { document.removeEventListener("visibilitychange", vis); ro?.disconnect(); };
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

  const chip = "flex items-baseline gap-1.5 rounded-full bg-black px-3 py-1 border border-white/15";
  const chipBtn = "btn btn-circle btn-sm bg-black text-white border border-white/15 pointer-events-auto";

  return html`<${Fragment}>
    <div class="ms-stage z-20 bg-black overflow-hidden select-none" ref=${stage} data-swarm>
      ${gate ? html`<div class="absolute inset-0" aria-hidden="true"
        style="background:radial-gradient(130% 90% at 50% 18%, #232332, #0b0b10 68%)"></div>` : null}
      ${enabled && !camErr && !gate ? html`<video ref=${video} autoplay muted playsinline
        class="absolute inset-0 w-full h-full object-cover" aria-hidden="true"></video>` : null}
      <canvas ref=${cv} class="absolute inset-0 w-full h-full touch-none" role="img"
        aria-label=${T(t, "screenAlt")} onPointerDown=${arm}></canvas>

      <div ref=${hud} data-live class="absolute inset-0 pointer-events-none p-3 text-white font-mono">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class=${chip}>
              <span class="text-[0.58rem] uppercase tracking-[0.22em] text-white/60">${T(t, "wave")}</span>
              <span class="text-sm" ref=${waveEl}>1</span>
            </div>
            <div class=${chip}>
              <span class="text-[0.58rem] uppercase tracking-[0.22em] text-white/60">${T(t, "score")}</span>
              <span class="text-sm" ref=${scoreEl}>0</span>
            </div>
            <span ref=${comboEl} class="text-sm text-[var(--app-accent)] transition-opacity" aria-hidden="true"></span>
          </div>
          <div class="flex items-center gap-2">
            <div ref=${hearts} class="flex items-center gap-1 rounded-full bg-black px-2.5 py-1.5 border border-white/15" aria-hidden="true">
              ${[0, 1, 2].map(() => html`<svg viewBox="0 0 12 12" class="w-3 h-3" fill="var(--app-accent)"><path d="M6 1.5 10.5 6 6 10.5 1.5 6z"/></svg>`)}
            </div>
            <button class=${chipBtn} aria-pressed=${soundOn} aria-label=${T(t, "sound")} data-sound
              onClick=${() => { const nx = $sound.get() !== "1"; $sound.set(nx ? "1" : "0"); if (sound.current) sound.current.enabled = nx; arm(); }}>
              ${Icon(soundOn ? "lucide:volume-2" : "lucide:volume-x", "text-base")}
            </button>
            <button class=${chipBtn} aria-label=${T(t, "records")} data-records
              onClick=${() => A.screen.set("records")}>${Icon("lucide:trophy", "text-base")}</button>
          </div>
        </div>

        <button data-fire aria-label=${T(t, "fire")}
          class="pointer-events-auto absolute bottom-4 right-4 w-[4.4rem] h-[4.4rem] rounded-full bg-black border-2 border-white/25 grid place-items-center active:scale-95 transition-transform"
          onPointerDown=${() => { fire.current = 1; arm(); }}
          onPointerUp=${() => { fire.current = 0; }}
          onPointerLeave=${() => { fire.current = 0; }}
          onClick=${() => { /* a keyboard "click" fires once */ const E = eng.current; if (E) { fire.current = 1; setTimeout(() => { fire.current = 0; }, 40); } }}>
          <span class="w-9 h-9 rounded-full border-2 border-[var(--app-accent)] grid place-items-center">
            <span class="w-3 h-3 rounded-full bg-[var(--app-accent)]"></span>
          </span>
        </button>
      </div>

      ${!ready && !engErr ? html`<div class="absolute inset-0 grid place-items-center"><${Pixels} cls="w-full h-full" /></div>` : null}
      ${engErr ? html`<div class="absolute inset-0 grid place-items-center text-center px-4 text-white/70 text-sm" data-err>${T(t, "noEngine")}</div>` : null}

      ${over ? html`<div class="absolute inset-0 grid place-items-center overflow-hidden bg-black/45" data-over>
        <button class="sf-raised sf-press active:sf-pressed bg-base-100 rounded-[var(--ms-r)] gap-1 flex flex-col items-center max-w-full max-h-full px-[var(--ms-pad)] py-[calc(var(--ms-pad)*0.7)]"
          onClick=${restart} data-restart>
          <span class="font-mono uppercase tracking-widest text-[var(--ms-label)] opacity-80">${T(t, "gameOver")}</span>
          <span class="font-mono text-[var(--ms-title)]">${T(t, "wave")} ${best?.wave ?? 1}</span>
        </button>
      </div>` : null}

      ${(!enabled || camErr) && !gate ? html`<${CameraPrime} loc=${loc} reason=${T(t, "camReason")}
        denied=${camErr === "denied"} unavailable=${camErr === "unavailable" || camErr === "unsupported"}
        onEnable=${onEnable} onSettings=${onEnable} />` : null}
    </div>

    ${screen === "records" ? html`<${Sheet} id="records" open=${true} onClose=${() => A.screen.set(null)}
      title=${T(t, "records")} icon="lucide:trophy" locale=${loc}>
      <div class="grid grid-cols-2 gap-[var(--ms-gap)] text-center">
        ${[["bestWave", best?.wave ?? 0], ["score", best?.score ?? 0], ["kills", best?.kills ?? 0], ["runs", +runs || 0]].map(([k, v]) => html`
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
