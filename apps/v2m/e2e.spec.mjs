// V2 Player: an AudioWorklet drives a hand-built WebAssembly V2 synth (0-import v2synth.wasm,
// instantiated glue-free on the audio thread). Player tab = now-playing disc + seekable transport;
// Library = IndexedDB saved tracks with undo-delete. Playing state is optimistic so the button
// reacts instantly (and headless can assert it without real audio output).
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-track]")) > 0) break; await h.wait(250); } };

export default [
  {
    name: "плеєр: диск, транспорт, seek", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-track]")) === 1, "плеєр не змонтувався");
      h.expect((await h.count("#play")) === 1, "немає кнопки play");
      h.expect((await h.count("[data-time]")) === 1, "немає індикатора часу");
      h.expect((await h.count('input[type="range"]')) === 1, "немає seek-повзунка");
    },
  },
  {
    name: "play/pause перемикається", run: async (h) => {
      await ready(h);
      await h.tap("#play"); await h.wait(200);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не почав грати");
      await h.tap("#play"); await h.wait(200);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не поставив на паузу");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не відновив відтворення");
    },
  },
  {
    name: "бібліотека: порожній стан", run: async (h) => {
      await h.click('[data-tab="library"]'); await h.wait(300);
      h.expect((await h.count("[data-track-row]")) === 0, "бібліотека мала б бути порожня");
      h.expect(/saved|треків/i.test(await h.bodyText()), "немає порожнього стану");
      await h.click('[data-tab="play"]'); await h.wait(150);
      h.expect((await h.count("[data-track]")) === 1, "не повернувся на плеєр");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
