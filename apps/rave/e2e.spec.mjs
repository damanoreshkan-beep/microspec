const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-cell]")) > 0) break; await h.wait(500); } };
// FX + presets + generate now live in the settings sheet (opened from the transport island), so open it
// before touching them. Idempotent — a no-op if the sheet is already up.
const openFx = async (h) => { if ((await h.count("#fxsheet[open]")) === 0) { await h.click("[data-settings]"); await h.wait(250); } };

export default [
  {
    name: "секвенсер: 256 клітин, транспорт-острівець, пресети в аркуші", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-cell]")) === 256, "немає 256 клітин (16 доріжок × 16)");
      h.expect((await h.count("#play")) === 1, "немає кнопки play/stop на острівці");
      h.expect((await h.count("[data-settings]")) === 1, "немає кнопки налаштувань на острівці");
      await openFx(h);
      h.expect((await h.count("[data-preset]")) === 25, "немає 25 пресетів (24 + clear) в аркуші");
      h.expect((await h.count("[data-gen]")) === 1, "немає кнопки генерації в аркуші");
    },
  },
  {
    // The fixed control panel is now a floating island + a history-backed settings sheet — ONE page scroll,
    // no nested scroll. System Back closes the sheet (routing invariant).
    name: "налаштування: острівець → аркуш, Back закриває", run: async (h) => {
      await ready(h);
      if ((await h.count("#fxsheet[open]")) > 0) { await h.back(); await h.wait(200); }   // clean start (a prior case may have left it open)
      await h.click("[data-settings]"); await h.wait(250);
      h.expect((await h.prop("#fxsheet", "open")) === true, "аркуш налаштувань не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#fxsheet", "open")) !== true, "Back не закрив аркуш");
    },
  },
  {
    // The generator is the app's thesis: a scored search over Euclidean rhythms, not a dice roll. The maths
    // is unit-tested in packages/runtime/runtime_test.js; here we only assert it reaches the UI — the sweep
    // writes a real pattern, always with a downbeat kick, and never leaves the grid empty or mid-animation.
    name: "генератор: пише патерн у сітку, кік на долю", run: async (h) => {
      await ready(h); await openFx(h);
      await h.click('[data-preset="clear"]'); await h.wait(120);
      h.expect((await h.attr('[data-cell="kick-0"]', "aria-pressed")) === "false", "clear не очистив перед генерацією");
      await h.click("[data-gen]");
      await h.wait(900);                                                     // 16 columns × 28ms sweep + slack
      h.expect((await h.attr("[data-gen]", "aria-busy")) === "false", "кнопка лишилась у стані генерації");
      // Which low voice carries the pulse depends on the archetype (techno → kick, hard techno → hardkick),
      // so assert the BAND, not one track: some low voice must land the downbeat and fill the bar.
      const pressed = async (id, s) => (await h.attr(`[data-cell="${id}-${s}"]`, "aria-pressed")) === "true";
      h.expect((await pressed("kick", 0)) || (await pressed("hardkick", 0)), "генератор не поставив кік на долю");
      let on = 0;
      for (let s = 0; s < 16; s++) if ((await pressed("kick", s)) || (await pressed("hardkick", s))) on++;
      h.expect(on >= 4, "кік-доріжка майже порожня — світч не дописав патерн");
    },
  },
  {
    // next/prev generate a fresh beat at the ends of the session playlist and step back through the ones
    // already made — so prev must return the SAME track it remembered, not a new random one.
    name: "транспорт: next/prev — автогенерація з памʼяттю", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-next]")) === 1 && (await h.count("[data-prev]")) === 1, "немає кнопок next/prev");
      await h.click("[data-next]"); await h.wait(650);
      const n1 = await h.text("[data-track]");
      h.expect(/\S/.test(n1), "next не встановив назву треку");
      await h.click("[data-next]"); await h.wait(650);
      await h.click("[data-prev]"); await h.wait(650);
      h.expect((await h.text("[data-track]")) === n1, "prev не повернув запамʼятований попередній трек");
    },
  },
  {
    name: "клік по клітині перемикає крок", run: async (h) => {
      await ready(h);
      h.expect((await h.attr('[data-cell="kick-1"]', "aria-pressed")) === "false", "kick-1 мав бути вимкнений");
      await h.click('[data-cell="kick-1"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-1"]', "aria-pressed")) === "true", "крок не увімкнувся");
    },
  },
  {
    name: "clear очищає, пресет заповнює", run: async (h) => {
      await ready(h); await openFx(h);
      await h.click('[data-preset="clear"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-0"]', "aria-pressed")) === "false", "clear не очистив");
      await h.click('[data-preset="techno"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-0"]', "aria-pressed")) === "true", "пресет не завантажився");
    },
  },
  {
    name: "play перемикає стан", run: async (h) => {
      await ready(h);
      const a0 = await h.attr("#play", "aria-label");
      await h.click("#play"); await h.wait(120);
      h.expect(a0 !== (await h.attr("#play", "aria-label")), "play не перемкнув стан");
      await h.click("#play"); await h.wait(120);
      h.expect(a0 === (await h.attr("#play", "aria-label")), "stop не повернув стан");
    },
  },
  {
    // The three tabs are separate tool views, so a tab switch unmounts the Beat view. The engine lives at
    // module scope precisely so playback outlives that unmount — start, cross to Saved and back, and #play
    // must still read as playing (a torn-down engine would have reset it to idle).
    name: "музика не зупиняється при переході по табах", run: async (h) => {
      await ready(h);
      const idle = await h.attr("#play", "aria-label");
      await h.click("#play"); await h.wait(150);
      const live = await h.attr("#play", "aria-label");
      h.expect(live !== idle, "play не запустився");
      await h.click('[data-tab="saved"]'); await h.wait(300);
      await h.click('[data-tab="beat"]'); await h.wait(300);
      await ready(h);
      h.expect((await h.attr("#play", "aria-label")) === live, "музика зупинилась при переході по табах");
      await h.click("#play"); await h.wait(120);                  // stop — leave clean for the next case
    },
  },
  {
    name: "зберегти патерн → зʼявляється у «Збережені» → завантажується", run: async (h) => {
      await ready(h); await openFx(h);
      await h.click('[data-preset="rave"]'); await h.wait(120);
      await h.click("[data-save]"); await h.wait(400);
      await h.click('[data-tab="saved"]'); await h.wait(400);
      let n = 0; for (let i = 0; i < 15; i++) { n = await h.count("[data-saved]"); if (n > 0) break; await h.wait(300); }
      h.expect(n > 0, "збережений біт не зʼявився у вкладці");
      await h.click("[data-load]");
      let cells = 0; for (let i = 0; i < 12; i++) { await h.wait(250); cells = await h.count("[data-cell]"); if (cells === 256) break; }
      h.expect(cells === 256, "після завантаження не повернулись у секвенсер");
      await h.click('[data-tab="saved"]'); await h.wait(300);
      await h.click("[data-del]"); await h.wait(300);
    },
  },
  {
    // Each saved item carries a Play button (audition without leaving the list) and a minimalist spectrum
    // drawn from the beat's per-step voice density. Verify both exist per item and that Play toggles state.
    name: "збережені: кнопка плей + спектр у кожному айтемі", run: async (h) => {
      await h.click('[data-tab="beat"]'); await h.wait(200); await ready(h); await openFx(h);
      await h.click('[data-preset="acid"]'); await h.wait(120);
      await h.click("[data-save]"); await h.wait(400);
      await h.click('[data-tab="saved"]'); await h.wait(400);
      let n = 0; for (let i = 0; i < 15; i++) { n = await h.count("[data-saved]"); if (n > 0) break; await h.wait(300); }
      h.expect(n > 0, "збережений біт не зʼявився");
      h.expect((await h.count("[data-play]")) === n, "не в кожного айтема є кнопка плей");
      h.expect((await h.count("[data-spectrum]")) === n, "не в кожного айтема є спектр");
      const a0 = await h.attr("[data-play]", "aria-label");
      await h.click("[data-play]"); await h.wait(200);
      h.expect((await h.attr("[data-play]", "aria-label")) !== a0, "плей у списку не запустив відтворення");
      await h.click("[data-play]"); await h.wait(150);            // stop
      await h.click("[data-del]"); await h.wait(300);             // clean up
    },
  },
  {
    // Regression guard: playing a SECOND saved beat while one is already playing calls start() again. Before
    // the fix, start() orphaned the running scheduler and stacked a second tick loop (the audio froze after a
    // few). Now start() is idempotent. Headless can't hear it, but the path must stay throw-free and leave
    // exactly ONE item marked playing (the loaded one) — never two — with the whole run under error watch.
    name: "збережені: грати другий біт поверх першого — один активний, без збоїв", run: async (h) => {
      await h.click('[data-tab="beat"]'); await h.wait(180); await ready(h); await openFx(h);
      await h.click('[data-preset="techno"]'); await h.wait(120); await h.click("[data-save]"); await h.wait(350);
      await h.click('[data-preset="gabber"]'); await h.wait(120); await h.click("[data-save]"); await h.wait(350);
      await h.click('[data-tab="saved"]'); await h.wait(350);
      let n = 0; for (let i = 0; i < 12; i++) { n = await h.count("[data-saved]"); if (n === 2) break; await h.wait(250); }
      h.expect(n === 2, `очікував 2 збережені біти, маю ${n}`);
      await h.click('[data-saved]:nth-of-type(1) [data-play]'); await h.wait(200);
      h.expect((await h.count("[data-play].btn-secondary")) === 1, "перший біт не позначився активним");
      await h.click('[data-saved]:nth-of-type(2) [data-play]'); await h.wait(200);   // start() while already playing
      h.expect((await h.count("[data-play].btn-secondary")) === 1, "після другого play активні ДВА айтеми — рестарт не витіснив перший");
      await h.click("[data-play].btn-secondary"); await h.wait(150);
      h.expect((await h.count("[data-play].btn-secondary")) === 0, "stop не зупинив відтворення");
      for (const _ of [0, 1]) { await h.click("[data-del]"); await h.wait(300); }
    },
  },
  {
    // Save was keyed by Date.now(), so a double-tap stored the same beat twice under two different names.
    // The name is now read off the sound (genre + texture + tempo), so a duplicate is refused rather than
    // filed as "Beat 2" next to an identical "Beat 1".
    name: "ідентичний біт не зберігається двічі", run: async (h) => {
      // The previous case ends on the Saved tab; the transport and presets only exist on the Beat tab, and
      // a click on a missing selector is a silent no-op — so without this the test would "run" and assert
      // against a screen it never reached.
      await h.click('[data-tab="beat"]'); await h.wait(200);
      await ready(h); await openFx(h);
      await h.click('[data-preset="techno"]'); await h.wait(150);
      await h.click("[data-save]"); await h.wait(500);
      await h.click("[data-save]"); await h.wait(500);            // той самий стан — має відмовити
      h.expect(/вже збережено|already saved/i.test(await h.text("[data-toast]")), "друге збереження не попередило про дубль");
      await h.click('[data-tab="saved"]'); await h.wait(400);
      let n = 0; for (let i = 0; i < 12; i++) { n = await h.count("[data-saved]"); if (n > 0) break; await h.wait(250); }
      h.expect(n === 1, `ідентичний біт збережено ${n} разів замість 1`);
      // …а змінений — зберігається (інший темп = інший біт, не дубль)
      await h.click('[data-tab="beat"]'); await h.wait(200); await openFx(h);
      await h.click('[data-preset="gabber"]'); await h.wait(150);
      await h.click("[data-save]"); await h.wait(500);
      await h.click('[data-tab="saved"]'); await h.wait(400);
      h.expect((await h.count("[data-saved]")) === 2, "змінений біт не зберігся — дубль-перевірка занадто сувора");
      // назва читається зі звуку, а не «Біт N»
      h.expect(/\d{2,3}\s*$/.test(await h.text("[data-saved] .font-semibold")), "у назві немає темпу — вона не виведена зі звуку");
      for (const _ of [0, 1]) { await h.click("[data-del]"); await h.wait(350); }
    },
  },
  {
    // Reversible delete → optimistic remove + a 5s "Undo" snackbar; tapping it re-inserts the beat. No confirm.
    name: "збережені: видалення можна скасувати (undo)", run: async (h) => {
      await h.click('[data-tab="beat"]'); await h.wait(180); await ready(h); await openFx(h);
      await h.click('[data-preset="detroit"]'); await h.wait(120); await h.click("[data-save]"); await h.wait(400);
      await h.click('[data-tab="saved"]'); await h.wait(350);
      let n = 0; for (let i = 0; i < 12; i++) { n = await h.count("[data-saved]"); if (n > 0) break; await h.wait(250); }
      h.expect(n > 0, "немає збереженого біта");
      await h.click("[data-del]"); await h.wait(250);
      h.expect((await h.count("[data-saved]")) === n - 1, "біт не зник одразу (оптимістичне видалення)");
      h.expect((await h.count("[data-undo]")) === 1, "немає снекбару «Скасувати»");
      await h.click("[data-undo]"); await h.wait(350);
      h.expect((await h.count("[data-saved]")) === n, "«Скасувати» не повернуло біт");
      await h.click("[data-del]"); await h.wait(300);   // clean up (no undo tap → commits)
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Beat|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Біт|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="beat"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
  {
    name: "версія: профіль показує версію апки й ядра", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      h.expect((await h.count("[data-version]")) === 1, "немає футера версії у профілі");
      h.expect(/v\d.*core/i.test(await h.text("[data-version]")), "футер не містить версії апки й ядра");
    },
  },
  {
    name: "подвійний Back: перший Back попереджає й не виходить", run: async (h) => {
      await h.click('[data-tab="beat"]'); await h.wait(150);
      await h.back(); await h.wait(250);
      h.expect(/вийти|exit/i.test(await h.text("[data-toast]")), "немає попередження про вихід на перший Back");
      h.expect((await h.count("#play")) === 1, "апка вийшла з першого Back");
    },
  },
];
