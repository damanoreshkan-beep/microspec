// The chart is pure math (ephemeris + trigonometry, no GPS, no network), and under the gate the birth
// record AND the transit instant are both pinned, so every assertion below is deterministic offline.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-mark]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "біколесо: транзитні планети зовні, натальні всередині, куспіди домів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-mark]")) >= 6, "замало транзитних планет на колесі");
      h.expect((await h.count("[data-natal]")) >= 6, "немає натального кола");
      h.expect((await h.count('[data-angle="asc"]')) === 1, "немає позначки ASC на колесі");
      h.expect((await h.count('[data-angle="mc"]')) === 1, "немає позначки MC на колесі");
      h.expect((await h.count("[data-date]")) === 1, "немає дати транзиту");
      h.expect((await h.count("[data-contact]")) >= 1, "немає жодного контакту транзит→натал");
    },
  },
  {
    name: "натальна карта: планети з домами, кути, 12 куспідів", run: async (h) => {
      await h.click('[data-tab="chart"]'); await h.wait(300);
      h.expect((await h.count("[data-row]")) >= 6, "немає натальних позицій");
      h.expect((await h.count("[data-cusp]")) === 12, "немає 12 куспідів домів");
      h.expect((await h.count('[data-angle-row="angAsc"]')) === 1, "немає рядка ASC");
      h.expect((await h.count('[data-angle-row="angMc"]')) === 1, "немає рядка MC");
      h.expect((await h.count('[data-angle-row="angVertex"]')) === 1, "немає рядка вертекса");
      h.expect(/Овен|Телець|Близнюки|Рак|Лев|Діва|Терези|Скорпіон|Стрілець|Козоріг|Водолій|Риби/.test(await h.bodyText()), "немає знаків зодіаку");
      h.expect(/Плацидус/i.test(await h.text("[data-house-system]")), "не показано систему домів");
      // Kyiv is far from the polar circle, so Placidus must NOT fall back
      h.expect((await h.count("[data-house-fallback]")) === 0, "несподіваний відкат системи домів");
    },
  },
  {
    name: "моменти: точний час, коли аспект стає точним", run: async (h) => {
      await h.click('[data-tab="hits"]'); await h.wait(300);
      h.expect((await h.count("[data-hit]")) >= 1, "немає жодного транзиту");
      // the root-find is chunked across tasks (one contact per turn), so poll rather than guess a duration
      for (let i = 0; i < 30; i++) { if ((await h.count("[data-hit-time]")) > 0) break; await h.wait(300); }
      h.expect((await h.count("[data-hit-time]")) >= 1, "немає жодного точного моменту");
      const txt = await h.text("[data-hit-time]");
      h.expect(/\d{4}/.test(txt), `момент без року: ${txt}`);
    },
  },
  {
    name: "система домів перемикається фільтром (Плацидус → Цілий знак)", run: async (h) => {
      // NB: #f-apply always returns to the FIRST tab (render.js), so navigate back before asserting.
      await h.click("#filter-btn"); await h.wait(250);
      await h.click('#f-houseSystem [data-val="whole"]'); await h.wait(150);
      await h.click("#f-apply"); await h.wait(300);
      await h.click('[data-tab="chart"]'); await h.wait(400);
      h.expect(/Цілий знак/i.test(await h.text("[data-house-system]")), "система домів не змінилась");
      // whole-sign cusps always start at 0 of a sign
      h.expect(/0°00'/.test(await h.text('[data-cusp="1"]')), "куспід цілого знака не на 0°");
      await h.click("#filter-btn"); await h.wait(250);
      await h.click('#f-houseSystem [data-val="placidus"]'); await h.wait(150);
      await h.click("#f-apply"); await h.wait(300);
      await h.click('[data-tab="chart"]'); await h.wait(400);
      h.expect(/Плацидус/i.test(await h.text("[data-house-system]")), "не повернулось на Плацидус");
    },
  },
  {
    name: "аркуш даних народження: історія-backed (Back закриває), показує точну мить", run: async (h) => {
      await h.click('[data-tab="wheel"]'); await h.wait(250);
      await h.click("[data-birth-row]"); await h.wait(300);
      h.expect((await h.prop("#birthsheet", "open")) === true, "аркуш народження не відкрився");
      h.expect((await h.count("[data-birth-date]")) === 1, "немає поля дати");
      h.expect((await h.count("[data-birth-time]")) === 1, "немає поля часу");
      h.expect((await h.count("[data-birth-chosen]")) === 1, "не показано обране місце");
      h.expect(/Z$/.test((await h.text("[data-birth-resolved]")).trim()) || /UTC/.test(await h.text("[data-birth-resolved]")), "не показано розвʼязану мить");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#birthsheet", "open")) !== true, "Back не закрив аркуш народження");
    },
  },
  {
    name: "режим зсуву часу перемикається (пояс → сонячний час)", run: async (h) => {
      await h.click("[data-birth-row]"); await h.wait(300);
      const before = await h.text("[data-birth-resolved]");
      await h.click('[data-zone-mode="lmt"]'); await h.wait(250);
      h.expect((await h.attr('[data-zone-mode="lmt"]', "aria-pressed")) === "true", "режим не вибрався");
      h.expect(before !== (await h.text("[data-birth-resolved]")), "сонячний час не змінив мить");
      await h.click('[data-zone-mode="place"]'); await h.wait(200);
      await h.back(); await h.wait(300);
    },
  },
  {
    name: "скрабер дати змінює транзит", run: async (h) => {
      await ready(h);
      const d0 = await h.text("[data-date]");
      await h.type("#scrub", "150"); await h.wait(300);
      h.expect(d0 !== (await h.text("[data-date]")), "дата не змінилась");
      await h.click('[data-chip="today"]'); await h.wait(250);
      h.expect(d0 === (await h.text("[data-date]")), "чип «сьогодні» не повернув на сьогодні");
      // the chosen preset lifts out of the row (material), so its selection reads as STATE, not a border colour
      h.expect((await h.attr('[data-chip="today"]', "aria-pressed")) === "true", "чип «сьогодні» не позначений вибраним");
      h.expect((await h.attr('[data-chip="pWeek"]', "aria-pressed")) === "false", "невибраний чип позначений вибраним");
    },
  },
  {
    name: "системний multi-фільтр планет", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#filter-btn")) === 1, "немає кнопки фільтра");
      await h.click("#filter-btn"); await h.wait(250);
      h.expect((await h.count("#f-bodies [data-val]")) === 10, "немає 10 тіл у фільтрі");
      await h.click('#f-bodies [data-val="pluto"]'); await h.wait(150);
      h.expect((await h.attr('#f-bodies [data-val="pluto"]', "aria-pressed")) === "false", "Плутон не вимкнувся");
      await h.click("#f-apply"); await h.wait(300);
      h.expect((await h.count('[data-mark="pluto"]')) === 0, "Плутон не зник з колеса");
      await h.click("#filter-btn"); await h.wait(250);
      await h.click('#f-bodies [data-val="pluto"]'); await h.wait(150);
      await h.click("#f-apply"); await h.wait(300);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Wheel|Transits|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Колесо|Транзити|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="wheel"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click("#p-install"); await h.wait(200);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
  {
    name: "AI-трактовка транзитів: аркуш історія-backed, рендерить текст", run: async (h) => {
      await h.click('[data-tab="wheel"]'); await h.wait(200);
      await ready(h);
      h.expect((await h.count("[data-interp]")) === 1, "немає кнопки трактовки");
      await h.click("[data-interp]"); await h.wait(300);
      h.expect((await h.prop("#interpsheet", "open")) === true, "аркуш трактовки не відкрився");
      h.expect((await h.text("[data-reading]")).trim().length > 40, "порожня трактовка");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#interpsheet", "open")) !== true, "Back не закрив аркуш трактовки");
    },
  },
  {
    // The whole point of the three sheets below: the AI paragraph is the TOP layer, and the two under it —
    // the computed facts and the sourced significations — are local data that must be there whether the
    // model answered or not. So each test asserts all three, not just that a sheet opened.
    name: "трактовка одного транзиту: факти + значення + текст, Back закриває", run: async (h) => {
      await h.click('[data-tab="hits"]'); await h.wait(400);
      h.expect((await h.count("[data-hit]")) >= 1, "немає жодного транзиту");
      await h.tap("[data-hit]"); await h.wait(500);
      h.expect((await h.prop("#transitsheet", "open")) === true, "аркуш транзиту не відкрився");
      h.expect((await h.text("[data-reading]")).trim().length > 80, "порожня трактовка транзиту");
      // the computed layer — these come from the ephemeris, not the model
      h.expect((await h.text('[data-fact="orb"]')).includes("°"), "немає орба");
      const tempo = await h.text('[data-fact="tempo"]');
      h.expect(tempo.trim().length > 10, `немає темпу тіла: ${tempo}`);
      // the sourced layer — the corpus entries the model was handed, so the text can be checked against them
      h.expect((await h.count("[data-mean]")) >= 4, "замало значень із корпусу");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#transitsheet", "open")) !== true, "Back не закрив аркуш транзиту");
    },
  },
  {
    name: "трактовка натального положення: гідність, дім, значення", run: async (h) => {
      await h.click('[data-tab="chart"]'); await h.wait(400);
      await h.tap('[data-row="mars"]'); await h.wait(450);
      h.expect((await h.prop("#placementsheet", "open")) === true, "аркуш положення не відкрився");
      h.expect((await h.text("[data-reading]")).trim().length > 80, "порожня трактовка положення");
      h.expect(/\d/.test(await h.text('[data-fact="house"]')), "немає дому з системою");
      // Mars is one of the seven classical bodies, so essential dignity APPLIES and must be stated
      h.expect((await h.text('[data-fact="dignity"]')).trim().length > 0, "немає есенційної гідності");
      h.expect((await h.count("[data-mean]")) >= 3, "замало значень із корпусу");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#placementsheet", "open")) !== true, "Back не закрив аркуш положення");
      // an ANGLE is not a body: the dignity doctrine must not be applied to it
      await h.tap('[data-place="asc"]'); await h.wait(450);
      h.expect((await h.prop("#placementsheet", "open")) === true, "аркуш ASC не відкрився");
      h.expect((await h.count('[data-fact="dignity"]')) === 0, "куту приписано есенційну гідність");
      h.expect((await h.count('[data-fact="house"]')) === 0, "куту приписано дім");
      await h.back(); await h.wait(350);
    },
  },
  {
    name: "портрет карти в цілому: управитель карти + баланс", run: async (h) => {
      await h.click('[data-tab="chart"]'); await h.wait(400);
      await h.tap("[data-portrait]"); await h.wait(500);
      h.expect((await h.prop("#portraitsheet", "open")) === true, "аркуш портрета не відкрився");
      h.expect((await h.text("[data-reading]")).trim().length > 200, "портрет закороткий");
      h.expect((await h.text("[data-chart-ruler]")).trim().length > 0, "немає управителя карти");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#portraitsheet", "open")) !== true, "Back не закрив аркуш портрета");
    },
  },
  {
    // `?tab=`/`?screen=` is what makes the two tabs behind the dock reviewable at all — by the screenshot
    // service and by preflight. If it silently stops routing, the eye goes blind again and nothing else
    // fails, so it is asserted here rather than trusted.
    name: "?tab= і ?screen= відкривають потрібний екран одразу", run: async (h) => {
      await h.goto("?tab=chart&screen=portrait", 1600);
      h.expect((await h.prop("#portraitsheet", "open")) === true, "?screen= не відкрив портрет");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#portraitsheet", "open")) !== true, "Back не закрив портрет, відкритий з URL");
      await h.goto("", 1200);
    },
  },
];
