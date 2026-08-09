// The screen is a full-bleed 3D stage plus one floating island. Under the gate the cast is FIXED
// (GATE_LINES), so the populated screen renders with no interaction and no randomness.
//
// The stage is a canvas: in CI's headless Chrome it is the real three.js figure, under preflight's linkedom
// it is the Canvas2D fallback. Neither can be asserted on pixel content from here, so these check the
// things that ARE addressable — the stage exists, the island reports the hexagram, and the six lines are
// where they now live: the detail sheet.
const ready = async (h) => { for (let i = 0; i < 15; i++) { if ((await h.count("[data-number]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "сцена і острів: гексаграма названа", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає сцени");
      const n = (await h.text("[data-number]")).trim();
      h.expect(/^\d{1,2}$/.test(n) && +n >= 1 && +n <= 64, `номер гексаграми поза 1..64: ${n}`);
      h.expect((await h.count("[data-cast]")) === 1, "немає кнопки кидання");
    },
  },
  {
    // The fixed cast has two moving lines (9 at the bottom, 6 in the middle), so the island must name the
    // hexagram it changes into.
    name: "рухомі лінії дають другу гексаграму", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-change]")) === 1, "острів не показує переходу");
    },
  },
  {
    // The odds are the app's whole reason to exist: the two methods are different distributions, so the
    // displayed ratio MUST change when the method does.
    name: "зміна методу змінює показані шанси", run: async (h) => {
      await ready(h);
      const before = await h.text("[data-odds]");
      await h.tap('[data-method="coins"]'); await h.wait(250);
      const after = await h.text("[data-odds]");
      h.expect(before !== after, "шанси не змінились при перемиканні методу");
      h.expect((await h.attr('[data-method="coins"]', "aria-pressed")) === "true", "обраний метод без aria-pressed");
      await h.tap('[data-method="yarrow"]'); await h.wait(200);
      h.expect((await h.text("[data-odds]")) === before, "шанси не повернулись до стебел");
    },
  },
  {
    name: "розбір: шість ліній, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-detail]"); await h.wait(300);
      h.expect((await h.prop("#detailsheet", "open")) === true, "не відкрився розбір");
      h.expect((await h.count("[data-line]")) === 6, "у розборі не шість ліній");
      h.expect((await h.count('[data-moving="1"]')) === 2, "очікувалось дві рухомі лінії у фіксованому киданні");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#detailsheet", "open")) !== true, "Back не закрив розбір");
    },
  },
  {
    name: "тлумачення: шитик відкривається, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-read]"); await h.wait(300);
      h.expect((await h.prop("#readsheet", "open")) === true, "не відкрився шитик тлумачення");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#readsheet", "open")) !== true, "Back не закрив шитик");
    },
  },
  {
    name: "повторне кидання лишає гексаграму названою", run: async (h) => {
      await ready(h);
      await h.click("[data-cast]"); await h.wait(400);
      const n = (await h.text("[data-number]")).trim();
      h.expect(/^\d{1,2}$/.test(n), "після повторного кидання немає номера гексаграми");
    },
  },
  {
    name: "журнал: записи з гексаграмами", run: async (h) => {
      await h.click('[data-tab="log"]'); await h.wait(400);
      h.expect((await h.count("[data-entry]")) >= 2, "у журналі немає записів");
      h.expect((await h.count("[data-clear]")) === 1, "немає очищення журналу");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      // Assert on strings the test is actually STANDING in front of — the profile's own labels.
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Language|Theme|Install/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="cast"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
