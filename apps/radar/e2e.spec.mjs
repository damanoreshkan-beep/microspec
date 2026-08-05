export default [
  {
    name: "dome: the field is populated, and strength is a band rather than a distance", run: async (h) => {
      await h.click('[data-tab="dome"]'); await h.wait(500);
      h.expect((await h.count("[data-mark]")) === 1, "купол не змонтувався");
      h.expect((await h.count("[data-live]")) >= 1, "немає елемента, який не існує без показань");

      await h.click("[data-seen]"); await h.wait(300);
      h.expect((await h.count("#seen[open]")) === 1, "аркуш зі списком не відкрився");
      const rows = await h.count("[data-dev]");
      h.expect(rows >= 6, `очікував BLE та Wi-Fi у спільному списку, знайшов ${rows}`);

      const list = await h.text("[data-seen-list]");
      h.expect(/dBm/.test(list), "смуга без вимірювання в dBm");
      h.expect(!/\bm\b(?!Bm)|метр|metre|meter/i.test(list.replace(/dBm/g, "")), `екран заявив відстань: ${list.slice(0, 200)}`);

      await h.back(); await h.wait(300);
      h.expect((await h.count("#seen[open]")) === 0, "Back не закрив список");
    },
  },
  {
    name: "hunt: a target earns a lobe, and the readout says how much was swept", run: async (h) => {
      await h.click('[data-tab="hunt"]'); await h.wait(400);
      h.expect((await h.count("[data-petal]")) === 0, "пелюстка з'явилась без обраної цілі");

      await h.click("[data-pick]"); await h.wait(300);
      h.expect((await h.count("#pick[open]")) === 1, "аркуш вибору цілі не відкрився");
      const picks = await h.count("[data-pick-dev]");
      h.expect(picks >= 4, `у виборі цілі немає BLE-пристроїв, знайшов ${picks}`);
      await h.click("[data-pick-dev]"); await h.wait(400);
      h.expect((await h.count("#pick[open]")) === 0, "вибір цілі не закрив аркуш");

      h.expect((await h.count("[data-petal]")) === 1, "обмахування не намалювало пелюстку");
      h.expect((await h.count("[data-bearing]")) === 1, "пелюстка стягнулась, але азимут не показано");
      const read = await h.text("[data-live]");
      h.expect(/\d/.test(read), `показання без числа: ${read}`);
    },
  },
  {
    name: "guard: it flags the separated accessory and names what is missing for the rest", run: async (h) => {
      await h.click('[data-tab="guard"]'); await h.wait(400);
      const watched = await h.count("[data-watch]");
      h.expect(watched >= 4, `список нагляду порожній, знайшов ${watched}`);

      const policy = await h.text("[data-policy]");
      h.expect(/\d/.test(policy), "політика без чисел");

      h.expect((await h.count("[data-flag]")) === 0, "вартовий підняв тривогу без пройденого шляху");
      const reasons = await h.text("[data-watch]");
      h.expect(reasons.length > 0, "жоден рядок не пояснює, чого бракує");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Dome|Hunt|Guard/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Купол|Пошук|Вартовий/i.test(await h.bodyText()), "не UA");
      const body = (await h.bodyText()).toLowerCase();
      for (const label of ["купол", "пошук", "вартовий"]) {
        h.expect(body.includes(label), `підпис вкладки обрізано або зник: ${label}`);
      }
      await h.click('[data-tab="dome"]'); await h.wait(150);
    },
  },
  {
    name: "routing: the permissions screen opens and Back closes it", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 1, "екран дозволів не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив екран дозволів");
      await h.click('[data-tab="dome"]'); await h.wait(150);
    },
  },
];
