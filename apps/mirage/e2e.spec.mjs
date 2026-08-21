// The gate has no network, no camera and no GPU minute to spend: state.js seeds Make as DONE with four local
// pictures, Edit and Read with a local source, and every run re-seeds locally. The whole pipeline — prompt →
// race → variants → hand-off between modes → words — is exercised without a single call out.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-result]")) > 0) break; await h.wait(300); } };
const mode = async (h, m) => { await h.click(`[data-mode="${m}"]`); await h.wait(250); };
const changed = async (h, before, n = 15) => { for (let i = 0; i < n; i++) { const now = await h.attr("[data-result]", "src"); if (now && now !== before) return true; await h.wait(250); } return false; };

export default [
  {
    name: "сцена: чотири варіанти, поле, дія, збереження", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-slide]")) === 4, "має бути 4 слайди");
      h.expect((await h.count("[data-dots] span")) === 4, "немає крапок слайдів");
      h.expect((await h.count("#prompt")) === 1, "немає поля опису");
      h.expect((await h.count("[data-go]")) === 1, "немає кнопки дії");
      h.expect((await h.count("[data-act=save]")) === 1, "немає збереження");
      h.expect((await h.count("[data-act=share]")) === 1, "немає поділитися");
      h.expect(await h.attr('[data-mode="make"]', "aria-pressed") === "true", "режим Твори не активний");
    },
  },
  {
    // The picture is the subject: the stage must take the larger share of the view, the composer what is left.
    name: "сцена отримує більшу частку екрана, ніж композер", run: async (h) => {
      await ready(h);
      const stage = await h.css("[data-stage-box]", "height"), island = await h.css("[data-island]", "height");
      h.expect(parseFloat(stage) > parseFloat(island), `сцена ${stage} не більша за композер ${island}`);
    },
  },
  {
    name: "проявити створює нові картинки (гейт: без мережі)", run: async (h) => {
      await ready(h);
      const before = await h.attr("[data-result]", "src");
      await h.type("#prompt", "a quiet neon city in the rain");
      await h.click("[data-go]");
      h.expect(await changed(h, before), "нові картинки не проявились");
      h.expect((await h.count("[data-slide]")) === 4, "має бути 4 нові слайди");
    },
  },
  {
    name: "порожній опис не запускає проявлення", run: async (h) => {
      await ready(h);
      await h.type("#prompt", ""); await h.wait(120);
      h.expect((await h.count("[data-go]:disabled")) === 1, "кнопка не вимкнена на порожньому описі");
      await h.type("#prompt", "a lighthouse in a storm"); await h.wait(80);
    },
  },
  {
    name: "тап по картинці відкриває повний розмір; Back закриває", run: async (h) => {
      await ready(h);
      await h.click('[data-slide="0"]'); await h.wait(250);
      h.expect((await h.count("[data-lightbox]")) === 1, "повноекранний перегляд не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-lightbox]")) === 0, "Back не закрив повноекранний перегляд");
    },
  },
  {
    name: "параметри: sheet, якість і форма перемикаються, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-opts]"); await h.wait(250);
      h.expect((await h.prop("#opts", "open")) === true, "sheet параметрів не відкрився");
      h.expect(await h.attr('[data-q="2k"]', "aria-pressed") === "true", "2K не стандарт");
      await h.click('[data-q="fast"]'); await h.wait(150);
      h.expect(await h.attr('[data-q="fast"]', "aria-pressed") === "true", "швидко не увімкнулось");
      await h.click('[data-aspect="square"]'); await h.wait(150);
      h.expect(await h.attr('[data-aspect="square"]', "aria-pressed") === "true", "квадрат не увімкнувся");
      await h.click('[data-q="2k"]'); await h.click('[data-aspect="screen"]'); await h.wait(100);
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#opts", "open")) !== true, "Back не закрив sheet параметрів");
    },
  },
  {
    // The gate seeds a fixed catalogue: Auto + the alive/unknown Spaces; a pick sticks per mode and shows on
    // the options button; Rework and Read carry the same control with their own lists.
    name: "модель: Авто + живі Spaces, вибір тримається по режимах", run: async (h) => {
      await ready(h);
      await h.click("[data-opts]"); await h.wait(300);
      h.expect(await h.attr('[data-model="auto"]', "aria-pressed") === "true", "Авто не стандарт");
      h.expect((await h.count("[data-model]")) >= 3, "немає списку моделей");
      h.expect((await h.count("[data-models-check]")) === 1, "немає кнопки перевірки");
      await h.click('[data-model="black-forest-labs/FLUX.1-schnell"]'); await h.wait(150);
      h.expect(await h.attr('[data-model="black-forest-labs/FLUX.1-schnell"]', "aria-pressed") === "true", "модель не вибралась");
      await h.back(); await h.wait(300);
      h.expect(/schnell/i.test(await h.text("[data-opts]")), "вибрана модель не показана на кнопці параметрів");
      await mode(h, "edit");
      await h.click("[data-opts]"); await h.wait(300);
      h.expect(await h.attr('[data-model="auto"]', "aria-pressed") === "true", "вибір Твори протік в Онови");
      h.expect((await h.count("[data-q]")) === 0, "якість показана поза режимом Твори");
      await h.back(); await h.wait(300);
      await mode(h, "make");
      await h.click("[data-opts]"); await h.wait(200); await h.click('[data-model="auto"]'); await h.wait(100); await h.back(); await h.wait(300);
    },
  },
  {
    name: "«Здивуй мене» заповнює поле (гейт: без мережі)", run: async (h) => {
      await ready(h);
      await h.type("#prompt", ""); await h.wait(80);
      await h.click("[data-dream]"); await h.wait(150);
      h.expect((await h.prop("#prompt", "value")).trim().length > 0, "поле лишилось порожнім");
    },
  },
  {
    // The history sheet is a kit Sheet (children stay mounted while closed): assert the dialog's own `open`.
    name: "історія: sheet, тап підставляє, Back закриває", run: async (h) => {
      await ready(h);
      await h.type("#prompt", "a lighthouse in a storm"); await h.click("[data-go]"); await h.wait(500);
      await h.type("#prompt", ""); await h.wait(80);
      await h.click("[data-history]"); await h.wait(250);
      h.expect((await h.prop("#hist-mirage", "open")) === true, "sheet історії не відкрився");
      h.expect((await h.count("#hist-mirage [data-hist-item]")) >= 1, "історія порожня після проявлення");
      await h.click('#hist-mirage [data-hist-item="0"]'); await h.wait(250);
      h.expect(/lighthouse/.test(await h.prop("#prompt", "value")), "вибраний рядок не потрапив у поле");
      await h.click("[data-history]"); await h.wait(250);
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#hist-mirage", "open")) !== true, "Back не закрив sheet історії");
    },
  },
  {
    // Make → Edit hand-off: the picture in view becomes the source, and the mode follows it.
    name: "«Оновити це» передає картинку в Онови як джерело", run: async (h) => {
      await ready(h);
      const pic = await h.attr("[data-result]", "src");
      await h.click("[data-act=to-edit]"); await h.wait(400);
      h.expect(await h.attr('[data-mode="edit"]', "aria-pressed") === "true", "режим не перемкнувся на Онови");
      h.expect((await h.attr("[data-result]", "src")) === pic, "картинка не стала джерелом");
      h.expect((await h.count("[data-new]")) === 1, "немає «нове фото»");
    },
  },
  {
    name: "онови: інструкція → 4 варіанти, оригінал на утримання, далі з цим", run: async (h) => {
      await mode(h, "edit");
      const before = await h.attr("[data-result]", "src");
      await h.type("#prompt", "додай сніг");
      await h.click("[data-go]");
      h.expect(await changed(h, before), "оновлення не змінило картинку");
      h.expect((await h.count("[data-slide]")) === 4, "має бути 4 варіанти оновлення");
      h.expect((await h.count("[data-compare]")) === 1, "немає кнопки оригіналу");
      h.expect((await h.count("[data-act=keep]")) === 1, "немає «далі з цим»");
      const kept = await h.attr('[data-slide="0"]', "src");
      await h.click("[data-act=keep]"); await h.wait(300);
      h.expect((await h.count("[data-slide]")) === 0, "варіанти не зникли після «далі з цим»");
      h.expect((await h.attr("[data-result]", "src")) === kept, "результат не став новим джерелом");
    },
  },
  {
    name: "онови: нове фото повертає вибір джерела", run: async (h) => {
      await mode(h, "edit");
      await h.click("[data-new]"); await h.wait(250);
      h.expect((await h.count("[data-source]")) === 1, "вибір джерела не з'явився");
      h.expect((await h.count("[data-src-upload]")) === 1 && (await h.count("[data-src-camera]")) === 1, "немає кнопок джерела");
      h.expect((await h.count("[data-go]:disabled")) === 1, "дія не вимкнена без джерела");
    },
  },
  {
    name: "опиши: фото → слова у sheet, теги, копіювати, Back закриває", run: async (h) => {
      await mode(h, "read");
      h.expect((await h.count("[data-result]")) === 1, "немає фото на сцені");
      await h.click("[data-go]");
      let ok = false;
      for (let i = 0; i < 15; i++) { if ((await h.prop("#read", "open")) === true) { ok = true; break; } await h.wait(200); }
      h.expect(ok, "sheet з описом не відкрився");
      h.expect(/Гірське озеро/.test(await h.text("#read [data-text]")), "немає прочитаного тексту");
      h.expect((await h.count("#read [data-tags] .badge")) >= 3, "немає тегів");
      h.expect((await h.count("#read [data-copy]")) === 1, "немає копіювання");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#read", "open")) !== true, "Back не закрив sheet опису");
      h.expect((await h.count("[data-read-open]")) === 1, "немає кнопки повторного відкриття опису");
    },
  },
  {
    name: "опиши: питання → відповідь; «спитати ще» повертає поле", run: async (h) => {
      await mode(h, "read");
      await h.click("[data-read-open]"); await h.wait(250);
      await h.click("#read [data-ask]"); await h.wait(250);
      h.expect((await h.prop("#read", "open")) !== true, "sheet не закрився після «спитати ще»");
      await h.type("#prompt", "яка пора доби?");
      await h.click("[data-go]");
      let ok = false;
      for (let i = 0; i < 15; i++) { if ((await h.prop("#read", "open")) === true) { ok = true; break; } await h.wait(200); }
      h.expect(ok, "відповідь не з'явилась");
      await h.back(); await h.wait(300);
    },
  },
  {
    name: "«Проявити з цього» переносить опис у Твори як промпт", run: async (h) => {
      await mode(h, "read");
      await h.click("[data-read-open]"); await h.wait(250);
      await h.click("#read [data-to-make]"); await h.wait(400);
      h.expect(await h.attr('[data-mode="make"]', "aria-pressed") === "true", "не перейшло у Твори");
      h.expect(/Гірське озеро/.test(await h.prop("#prompt", "value")), "опис не став промптом");
    },
  },
  {
    name: "«Оновити це» з опису переносить фото й слова в Онови", run: async (h) => {
      await mode(h, "read");
      const photo = await h.attr("[data-result]", "src");
      await h.click("[data-read-open]"); await h.wait(250);
      await h.click("#read [data-to-edit]"); await h.wait(400);
      h.expect(await h.attr('[data-mode="edit"]', "aria-pressed") === "true", "не перейшло в Онови");
      h.expect((await h.attr("[data-result]", "src")) === photo, "фото не стало джерелом");
      h.expect(/Гірське озеро/.test(await h.prop("#prompt", "value")), "опис не став інструкцією");
      await mode(h, "make");
    },
  },
  {
    // The gate seeds both slots and a fixed "last picture": clearing a slot brings its compact chooser back and
    // disables the action; the chooser refills it; a blend re-seeds four variants with the hand-off to Rework.
    name: "поєднай: прибрати слот → вибір, заповнити знову, інструкція → 4 варіанти", run: async (h) => {
      await mode(h, "blend");
      h.expect((await h.count("[data-slot=a] img")) === 1 && (await h.count("[data-slot=b] img")) === 1, "обидва слоти мають бути заповнені");
      await h.click("[data-slot-clear=b]"); await h.wait(250);
      h.expect((await h.count("[data-slot=b] [data-src-upload]")) === 1, "вибір джерела для слота B не повернувся");
      await h.type("#prompt", "постав друге фото на перше"); await h.wait(100);
      h.expect((await h.count("[data-go]:disabled")) === 1, "дія не вимкнена без другого фото");
      await h.click("[data-slot=b] [data-src-last]"); await h.wait(250);
      h.expect((await h.count("[data-slot=b] img")) === 1, "слот B не заповнився з останнього образу");
      await h.click("[data-go]");
      let ok = false;
      for (let i = 0; i < 15; i++) { if ((await h.count("[data-slide]")) === 4) { ok = true; break; } await h.wait(250); }
      h.expect(ok, "поєднання не дало 4 варіантів");
      h.expect((await h.count("[data-act=to-edit]")) === 1, "немає «оновити це» після поєднання");
      await mode(h, "make");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Stage/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Сцена/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="stage"]'); await h.wait(120);
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
];
