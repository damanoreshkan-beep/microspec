const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-tine]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "калімба: 17 пелюсток + 6 ладів + пісні + Flow", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-tine]")) === 17, "немає 17 пелюсток");
      h.expect((await h.count("[data-scale]")) === 6, "немає 6 ладів");
      h.expect((await h.count("[data-song]")) === 5, "немає 5 пісень");
      h.expect((await h.count("[data-flow]")) === 1, "немає кнопки Flow");
      h.expect((await h.count("[data-voice]")) === 6, "немає 6 голосів");
      h.expect((await h.attr('[data-tine="8"]', "aria-label")) === "C4", "центральна пелюстка не C4 (tonic)");
    },
  },
  {
    name: "перемикач голосу обирається", run: async (h) => {
      await ready(h);
      await h.tap('[data-voice="bell"]'); await h.wait(120);
      h.expect((await h.attr('[data-voice="bell"]', "aria-pressed")) === "true", "голос не обрався");
      await h.tap('[data-voice="classic"]'); await h.wait(90);
      h.expect((await h.attr('[data-voice="classic"]', "aria-pressed")) === "true", "не повернувся класик");
    },
  },
  {
    name: "Flow генерує і грає, потім зупиняється", run: async (h) => {
      await ready(h);
      await h.tap("[data-flow]"); await h.wait(120);
      h.expect((await h.attr("[data-flow]", "class")).includes("btn-secondary"), "Flow не почав грати");
      await h.tap("[data-flow]"); await h.wait(120);
      h.expect(!(await h.attr("[data-flow]", "aria-pressed")) || (await h.attr("[data-flow]", "aria-pressed")) === "false", "Flow не зупинився");
    },
  },
  {
    name: "пісня Аватара перебудовує лад у мажор", run: async (h) => {
      await ready(h);
      await h.click('[data-scale="minor"]'); await h.wait(150);
      h.expect((await h.attr('[data-tine="9"]', "aria-label")) === "Eb4", "не перейшло в мінор");
      await h.tap('[data-song="avatarLeaves"]'); await h.wait(160);
      h.expect((await h.attr('[data-tine="9"]', "aria-label")) === "E4", "пісня не перебудувала лад у мажор");
      await h.tap('[data-song="avatarLeaves"]'); await h.wait(90);
    },
  },
  {
    name: "тап по пелюстці підсвічує її", run: async (h) => {
      await ready(h);
      await h.click('[data-tine="8"]'); await h.wait(70);
      h.expect((await h.attr('[data-tine="8"]', "class")).includes("ring-primary"), "пелюстка не підсвітилась при тапі");
      await h.wait(300);
      h.expect(!(await h.attr('[data-tine="8"]', "class")).includes("ring-primary"), "підсвітка не згасла");
    },
  },
  {
    name: "перемикач ладу перебудовує пелюстки", run: async (h) => {
      await ready(h);
      await h.click('[data-scale="minor"]'); await h.wait(150);
      h.expect((await h.attr('[data-scale="minor"]', "aria-pressed")) === "true", "лад не обрався");
      h.expect((await h.attr('[data-tine="9"]', "aria-label")) === "Eb4", "ноти не перебудувались під мінор");
      await h.click('[data-scale="major"]'); await h.wait(150);
      h.expect((await h.attr('[data-tine="9"]', "aria-label")) === "E4", "не повернувся мажор");
    },
  },
  {
    name: "демо-мелодія вмикається і зупиняється", run: async (h) => {
      await ready(h);
      await h.click('[data-song="twinkle"]'); await h.wait(90);
      h.expect((await h.attr('[data-song="twinkle"]', "class")).includes("btn-primary"), "мелодія не почала грати");
      await h.click('[data-song="twinkle"]'); await h.wait(90);
      h.expect(!(await h.attr('[data-song="twinkle"]', "class")).includes("btn-primary"), "мелодія не зупинилась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Play|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Грати|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
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
