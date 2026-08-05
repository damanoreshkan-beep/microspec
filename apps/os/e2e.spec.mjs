// The bridge does not exist in Chromium, so the gate mocks it from the same catalogue the app renders
// from. That is the point: without it every row would read "needs the app", the screen would be empty of
// anything meaningful, and a broken row would be invisible in the shot as well as in the test.
//
// Every test starts by naming the tab it needs. They share one page, and a test that inherits wherever the
// last one stopped fails for a reason that has nothing to do with what it is checking — which cost a round.
export default [
  {
    name: "home: the device reads itself, and every fact has a line", run: async (h) => {
      await h.click('[data-tab="home"]'); await h.wait(400);
      const state = await h.text("[data-state]");
      // The panel is the front door now, so an empty one is a broken app rather than a missing probe.
      for (const want of [/gate device/i, /android/i, /%/, /bridge \d+/]) {
        h.expect(want.test(state), `панель пристрою без ${want}: ${state.slice(0, 200)}`);
      }
      h.expect((await h.count("[data-tiles] [data-go]")) === 5, "очікував п’ять плиток входу");
      h.expect((await h.count("[data-go][data-store]")) === 1, "немає плитки магазину");
    },
  },
  {
    name: "console: one level down, and one press walks the whole checklist", run: async (h) => {
      await h.click('[data-tab="home"]'); await h.wait(200);
      await h.click('[data-go="console"]'); await h.wait(300);
      h.expect((await h.count("[data-tiles]")) === 0, "консоль не зайняла екран");
      const rows = await h.count("[data-action]");
      h.expect(rows >= 6, `очікував рядок на кожну дію каталогу, знайшов ${rows}`);
      h.expect(/bridge \d+/i.test(await h.text("[data-bridge]")), "панель мосту не показує версію");

      await h.click("#run-all"); await h.wait(1200);
      h.expect(/\d+\s*\/\s*\d+/.test(await h.text("[data-tally]")), "лічильник не показує прогін");
      h.expect((await h.count("[data-result]")) >= 6, "результати не записались");
      // The report reads the same bridge those rows just exercised — it lives here, not in a tab.
      const rep = await h.text("[data-report]");
      h.expect(/sdk/i.test(rep) && /model/i.test(rep), "звіт без sdk/model");

      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-tiles]")) === 1, "Back не повернув до панелі пристрою");
    },
  },
  {
    name: "station: the capability that had no home now has an address", run: async (h) => {
      await h.click('[data-tab="home"]'); await h.wait(200);
      await h.click('[data-go="station"]'); await h.wait(300);
      h.expect((await h.count("[data-station]")) === 1, "екран станції не відкрився");
      await h.click("#srv-toggle"); await h.wait(400);
      // Under the gate server.status answers running with a URL, so a started station must show it.
      h.expect(/http:\/\//.test(await h.text("[data-station]")), "станція не показала адресу");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-tiles]")) === 1, "Back не повернув до панелі пристрою");
    },
  },
  {
    name: "permissions: every capability is a tile, and a tile carries its state", run: async (h) => {
      await h.click('[data-tab="home"]'); await h.wait(200);
      await h.click('[data-go="perms"]'); await h.wait(300);
      const tiles = await h.count("[data-perm]");
      h.expect(tiles >= 6, `очікував плитку на кожен дозвіл реєстру, знайшов ${tiles}`);
      // The state lives on the tile, not in a caption. Assert the attribute EXISTS rather than reading
      // dataset: a DOMStringMap does not survive serialisation, so that tested the browser, not the app.
      h.expect((await h.count("[data-perm][data-state]")) === tiles, "є плитки без стану");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-tiles]")) === 1, "Back не повернув до панелі пристрою");
    },
  },
  {
    name: "radar: three radios on one circle, and the counters filter it", run: async (h) => {
      await h.click('[data-tab="radar"]'); await h.wait(400);
      h.expect((await h.count("[data-radar]")) === 1, "радар не намальовано");
      h.expect((await h.count("[data-dev]")) >= 5, "поле пристроїв порожнє під гейтом");
      // Wi-Fi and cells are CALLS where BLE is a subscribe, so a screen showing the advertisements can
      // still be silently missing either — assert all three halves separately.
      h.expect((await h.count('[data-dev][data-kind="wifi"]')) >= 2, "мереж на радарі немає");
      h.expect((await h.count('[data-dev][data-kind="cell"]')) >= 2, "сот на радарі немає");
      h.expect((await h.count('[data-dev][data-kind="ble"]')) >= 5, "BLE зник зі спільного списку");
      h.expect((await h.count("[data-host]")) >= 1, "у мережі нічого не знайдено");
      h.expect((await h.count('[data-dev][data-kind="lan"]')) === 0, "хости протекли у список радара");

      h.expect((await h.count("[data-kind-toggle]")) === 4, "фільтр не показує всі чотири види");
      const before = await h.count('[data-dev][data-kind="wifi"]');
      await h.click('[data-kind-toggle="wifi"]'); await h.wait(200);
      h.expect((await h.count('[data-dev][data-kind="wifi"]')) === 0, `фільтр не сховав Wi-Fi (було ${before})`);
      h.expect((await h.count('[data-dev][data-kind="ble"]')) >= 5, "фільтр Wi-Fi зачепив BLE");
      await h.click('[data-kind-toggle="wifi"]'); await h.wait(200);
      h.expect((await h.count('[data-dev][data-kind="wifi"]')) === before, "повторний тап не повернув Wi-Fi");
      h.expect((await h.count("#radar-toggle")) === 1, "немає кнопки сканування");
    },
  },
  {
    name: "files: a tab of its own, and a file opens its preview", run: async (h) => {
      await h.click('[data-tab="files"]'); await h.wait(500);
      h.expect((await h.count("[data-fs-list]")) === 1, "провідник не відкрився на своїй вкладці");
      h.expect((await h.count("[data-fs-entry]")) >= 2, "тека порожня під гейтом");
      // A folder is a level, so the trail must name where you are — a file manager without a path is a
      // list you cannot navigate by.
      await h.click('[data-fs-entry="notes"]'); await h.wait(300);
      h.expect((await h.text("[data-fs-trail]")).includes("notes"), "шлях не показує вкладену теку");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-fs-list]")) === 1, "Back вийшов із провідника замість теки вгору");
      // Reading is the half of the capability a listing cannot prove.
      await h.click('[data-fs-entry="readme.txt"]'); await h.wait(300);
      h.expect((await h.count("[data-fs-preview]")) === 1, "файл не відкрив перегляд");
      h.expect((await h.text("[data-fs-preview]")).includes("gate sample"), "перегляд не показав вміст");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-fs-preview]")) === 0, "Back не закрив перегляд");
    },
  },
  {
    name: "alarms: the shell owns the list, and scheduling reads it back", run: async (h) => {
      await h.click('[data-tab="alarms"]'); await h.wait(300);
      h.expect((await h.count("[data-alarm]")) >= 1, "список запланованого порожній під гейтом");
      h.expect((await h.count("[data-alarm-empty]")) === 0, "показано порожній стан попри наявний будильник");
      await h.click('[data-min="15"]'); await h.wait(120);
      h.expect((await h.prop('[data-min="15"]', "ariaPressed")) === "true", "вибір інтервалу не тримається");
      await h.click("#al-set"); await h.wait(300);
      h.expect((await h.count("[data-alarm]")) >= 1, "після постановки список зник");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Device|Files|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Пристрій|Файли|Мова/.test(await h.bodyText()), "не UA");
      // No dock label may be truncated: five tabs share the bar, and an ellipsis there is a name that was
      // too long to begin with, not a layout to fix. Case-insensitive — the dock uppercases in CSS and the
      // helper reads innerText, which applies text-transform.
      const body = (await h.bodyText()).toLowerCase();
      for (const label of ["пристрій", "радар", "файли", "сигнали", "профіль"]) {
        h.expect(body.includes(label), `підпис вкладки обрізано або зник: ${label}`);
      }
    },
  },
  {
    name: "ports: a claim carries the evidence that earned it", run: async (h) => {
      await h.click('[data-tab="home"]'); await h.wait(200);
      await h.click('[data-go="ports"]'); await h.wait(400);
      const rows = await h.count("[data-port]");
      h.expect(rows >= 5, `очікував заповнений список портів під гейтом, знайшов ${rows}`);
      // The catalogue mock arrives through the real subscribe path — its absence would mean the stream is
      // dead while the seeded fixture still photographed perfectly.
      h.expect((await h.count('[data-port="8080"]')) === 1, "кадр із каталогу не дійшов через subscribe");

      const tally = (await h.text("[data-ports-tally]")).trim();
      h.expect(String(rows) === tally, `лічильник ${tally} не збігається з ${rows} рядками`);
      // The scope panel is what makes an empty list readable: it says how many ports were asked, and on
      // which addresses. Without it "nothing answered" could mean ten ports or all 65535.
      const scope = await h.text("[data-ports-scope]");
      h.expect(/127\.0\.0\.1/.test(scope) && /\d{4,}/.test(scope), `панель обсягу без адрес і числа: ${scope}`);
      const text = await h.bodyText();
      // The two halves of the screen's job, both asserted: something identified itself by its banner, and
      // something else is admitted to be a guess rather than dressed up as an answer.
      h.expect(/OpenSSH_9\.6/.test(text), "банер SSH не показано як доказ");
      // A port number is never an identification: 5432 answered and said nothing, so it stays a guess.
      h.expect((await h.count('[data-port="5432"][data-conf="conventional"]')) === 1,
        "мовчазний порт подано не як здогад");
      h.expect((await h.count('[data-port="22"][data-conf="product"]')) === 1, "банер не дав найвищої певності");
      // 220 is SMTP and FTP at once. A screen that resolves it to one is lying with a straight face.
      h.expect((await h.count('[data-port="21"][data-conf="ambiguous"]')) === 1, "спільний банер розв’язано на один протокол");
      h.expect(/SMTP \/ FTP/.test(text), "неоднозначність не названо обома іменами");

      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-tiles]")) === 1, "Back не повернув до панелі пристрою");
    },
  },
  {
    name: "routing: permissions screen opens and Back closes it", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count('[role="dialog"]')) === 1, "екран дозволів не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив екран дозволів");
      await h.click('[data-tab="home"]'); await h.wait(150);
    },
  },
];
