// The Book of Changes casts under the gate from a FIXED line set (GATE_LINES), so the populated screen —
// hexagram, trigrams, moving lines, the hexagram it changes into — renders with no interaction and no
// randomness. The AI reading is never requested here: the gate has no network.
const ready = async (h) => { for (let i = 0; i < 15; i++) { if ((await h.count("[data-reading]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "кидання: гексаграма, триграми, номер", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-reading]")) === 1, "немає кинутої гексаграми");
      h.expect((await h.count("[data-line]")) === 6, "гексаграма має рівно шість ліній");
      const n = (await h.text("[data-number]")).trim();
      h.expect(/^\d{1,2}$/.test(n) && +n >= 1 && +n <= 64, `номер гексаграми поза 1..64: ${n}`);
      h.expect((await h.count("#question")) === 1, "немає поля питання");
    },
  },
  {
    // The fixed cast has two moving lines (9 at the bottom, 6 in the middle), so the change block must
    // show a second hexagram. A cast with no moving lines must NOT — that is asserted in the unit tests,
    // where a fixture can be chosen freely.
    name: "рухомі лінії дають другу гексаграму", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-change]")) === 1, "немає блоку зміни");
      h.expect((await h.count('[data-moving="1"]')) === 2, "очікувалось дві рухомі лінії у фіксованому киданні");
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
    name: "повторне кидання лишає екран заповненим", run: async (h) => {
      await ready(h);
      await h.click("[data-cast]"); await h.wait(300);
      h.expect((await h.count("[data-line]")) === 6, "після повторного кидання немає шести ліній");
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
    name: "журнал: записи з гексаграмами", run: async (h) => {
      await h.click('[data-tab="log"]'); await h.wait(400);
      h.expect((await h.count("[data-entry]")) >= 2, "у журналі немає записів");
      h.expect((await h.count("[data-clear]")) === 1, "немає очищення журналу");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Cast|Journal|Method/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Кидання|Журнал|Метод/.test(await h.bodyText()), "не UA");
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
