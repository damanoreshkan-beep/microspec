// The gate/mock uses a static sample (strongest = M6.2), so the globe + list render deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-quake]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "землетруси: глобус + список рендеряться", run: async (h) => {
      await ready(h);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса");
      h.expect((await h.count("[data-quake]")) >= 5, "замало поштовхів у списку");
      h.expect(/M6\.2/.test(await h.bodyText()), "немає найсильнішого (M6.2)");
      h.expect(/Японія|Japan/i.test(await h.bodyText()), "немає місця найсильнішого");
    },
  },
  {
    name: "клік по рядку → фокус на цьому землетрусі", run: async (h) => {
      await ready(h);
      h.expect(/M6\.2/.test(await h.text("[data-mag]")), "дефолт не найсильніший (M6.2)");
      await h.click('[data-quake]:nth-child(3)'); await h.wait(250); // 3-й рядок = M4.8 Аляска
      h.expect(/M4\.8/.test(await h.text("[data-mag]")), "заголовок не оновився на обраний рядок");
      h.expect((await h.attr('[data-quake]:nth-child(3)', "class")).includes("bg-primary"), "обраний рядок не підсвітився");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Earthquake|Map|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Землетрус|Карта|Мова/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="map"]'); await h.wait(120);
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
