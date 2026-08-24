// AX56 Wi-Fi monitor. Headless has no adapter, so the view seeds a demo (gate): access points with clients
// and a driver log. These cases exercise the points list, expanding an AP to its clients, the log tab with
// copy/clear, i18n and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-aps]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "точки: список AP, лічильник, розкриття клієнтів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-aps]")) === 1, "немає списку точок");
      h.expect((await h.count("[data-graph]")) === 1, "немає графіка каналів");
      h.expect((await h.count("[data-sort]")) >= 3, "немає сортування (3 режими)");
      h.expect((await h.count("[data-chpick]")) === 1, "немає вибору каналу");
      h.expect((await h.count("[data-ch]")) === 1, "немає повзунка каналу");
      h.expect((await h.prop("[data-ch]", "max")) === "38", "повзунок не покриває всі 39 каналів");
      h.expect((await h.count("[data-ap]")) >= 4, "немає карток точок доступу");
      h.expect((await h.count("[data-clients]")) >= 3, "немає лічильника клієнтів");
      h.expect(/Pioneers|Monako|ZTE|c4:6e:1f/i.test(await h.bodyText()), "немає SSID/BSSID");
      await h.tap('[data-ap="c4:6e:1f:af:de:9c"] button'); await h.wait(200);
      h.expect((await h.count("[data-client-list]")) === 1, "клієнти не розкрились");
      h.expect(/a4:83:e7|3c:22:fb/i.test(await h.bodyText()), "немає MAC клієнтів");
    },
  },
  {
    name: "лог: рядки, копіювати, очистити", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="log"]'); await h.wait(200);
      h.expect((await h.count("[data-log]")) === 1, "немає панелі логу");
      h.expect((await h.count("[data-copy]")) === 1, "немає кнопки копіювати");
      h.expect(/0b05:1997|SYS_CFG1|eject|bridge/i.test(await h.bodyText()), "лог порожній");
      await h.tap("[data-clear]"); await h.wait(200);
      h.expect(/Nothing logged|Ще нічого/i.test(await h.bodyText()), "clear не очистив лог");
      await h.click('[data-tab="points"]'); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="points"]'); await h.wait(200);
      h.expect(/Scanning|Points|Idle|ch/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      await h.click('[data-tab="points"]'); await h.wait(200);
      h.expect(/Сканування|Точки|кан/.test(await h.bodyText()), "не UA");
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
