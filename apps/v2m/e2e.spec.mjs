// V2 Player: an AudioWorklet drives a hand-built WebAssembly V2 synth (0-import v2synth.wasm, instantiated
// glue-free on the audio thread). Player tab = a three.js hero that draws the loaded tune's OWN bytes as a
// point cloud + transport island; Store = the modland V2 archive read live (headless uses a fixture and the
// bundled demo, so nothing here touches the network); Library = IndexedDB downloads with undo-delete.
// Playing state is optimistic so the button reacts instantly and headless can assert it without real audio.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-track]")) > 0) break; await h.wait(250); } };

export default [
  {
    name: "плеєр: сцена, транспорт, seek", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-track]")) === 1, "плеєр не змонтувався");
      h.expect((await h.count("#play")) === 1, "немає кнопки play");
      h.expect((await h.count("[data-time]")) === 1, "немає індикатора часу");
      h.expect((await h.count('input[type="range"]')) === 1, "немає seek-повзунка");
      h.expect((await h.count("[data-stage]")) === 1, "немає 3D-сцени");
    },
  },
  {
    name: "hero: якщо є WebGL — рендериться WebGL, не запасний 2D", run: async (h) => {
      await ready(h);
      await h.wait(600);
      const has = await h.attr("[data-stage]", "data-haswebgl");
      const mode = await h.attr("[data-stage]", "data-render");
      h.expect(mode === "webgl" || mode === "2d", "сцена не ініціалізувалась: " + mode);
      if (has === "yes") {
        h.expect(mode === "webgl",
          "WebGL доступний, але сцена мовчки впала у 2D (data-err=" + (await h.attr("[data-stage]", "data-err")) + ")");
      }
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
    name: "магазин: плитки з розміром, пошук, сортування", run: async (h) => {
      await h.click('[data-tab="store"]'); await h.wait(400);
      const n = await h.count("[data-tune]");
      h.expect(n > 1, "магазин порожній");
      h.expect(/KB|MB/.test(await h.bodyText()), "на плитках немає розміру — головної цифри застосунку");
      h.expect((await h.count("[data-sort]")) >= 3, "немає перемикача сортування");
      await h.type('input[type="search"]', "zzzznomatch"); await h.wait(300);
      h.expect((await h.count("[data-tune]")) === 0, "пошук не фільтрує");
      await h.type('input[type="search"]', ""); await h.wait(300);
      h.expect((await h.count("[data-tune]")) === n, "список не відновився після очищення пошуку");
    },
  },
  {
    name: "магазин → трек грає й лягає в бібліотеку", run: async (h) => {
      await h.click('[data-tab="store"]'); await h.wait(400);
      const id = await h.attr("[data-tune]", "data-tune");
      await h.tap("[data-tune]");
      // assert the STATE atom mirrored into the DOM, never real audio output (headless has no device that
      // a synthetic tap can unlock — that is an environment limit, not the app's behaviour)
      let cur = "";
      for (let i = 0; i < 20; i++) { cur = await h.attr("[data-track]", "data-track"); if (cur === id) break; await h.wait(250); }
      h.expect((await h.count("[data-track]")) === 1, "не повернувся на плеєр");
      h.expect(cur === id, "плеєр не перемкнувся на обраний трек: " + cur + " ≠ " + id);
      // the offline copy runs in the background — wait for its outcome ON THE PLAYER, where the breadcrumb
      // lives, before leaving for the library (and report it if it went wrong)
      let saved = "";
      for (let i = 0; i < 24; i++) { saved = await h.attr("[data-track]", "data-saved"); if (saved === "ok" || saved.startsWith("err")) break; await h.wait(250); }
      h.expect(saved === "ok", "копія в бібліотеку не зробилась: data-saved=" + (saved || "(порожньо)"));
      await h.click('[data-tab="library"]');
      let rows = 0;
      for (let i = 0; i < 20; i++) { rows = await h.count("[data-track-row]"); if (rows > 0) break; await h.wait(250); }
      h.expect(rows === 1, "завантажений трек не з'явився в бібліотеці (" + rows + ")");
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
