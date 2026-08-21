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
      h.expect((await h.attr('[data-chip="tomorrow"]', "aria-pressed")) === "false", "невибраний чип позначений вибраним");
      await h.click('[data-chip="tomorrow"]'); await h.wait(250);
      h.expect(d0 !== (await h.text("[data-date]")), "чип «завтра» не зрушив дату");
      h.expect((await h.attr('[data-chip="tomorrow"]', "aria-pressed")) === "true", "чип «завтра» не позначився вибраним");
      h.expect((await h.attr('[data-chip="today"]', "aria-pressed")) === "false", "«сьогодні» лишився вибраним разом із «завтра»");
      await h.click('[data-chip="today"]'); await h.wait(250);
    },
  },
  {
    // The arrows are the only control that can name a SINGLE day (one day is under a pixel of slider
    // travel), so ±1 is asserted through the date readout, and the row is asserted by GEOMETRY: three
    // controls on one line means three vertical centres within a couple of pixels. A structural check
    // ("they share a parent") would pass a stack.
    name: "стрілки дня по боках слайдера", run: async (h) => {
      await h.click('[data-tab="wheel"]'); await h.wait(250);
      await ready(h);
      const d0 = await h.text("[data-date]");
      const mid = async (s) => (await h.prop(s, "offsetTop")) + (await h.prop(s, "offsetHeight")) / 2;
      const [prev, scrub, next] = [await mid('[data-step="prev"]'), await mid("#scrub"), await mid('[data-step="next"]')];
      h.expect(Math.abs(prev - scrub) <= 2 && Math.abs(next - scrub) <= 2,
        `стрілки не в одному ряду зі слайдером: prev ${prev}, scrub ${scrub}, next ${next}`);
      const [xPrev, xScrub, xNext] = [await h.prop('[data-step="prev"]', "offsetLeft"), await h.prop("#scrub", "offsetLeft"), await h.prop('[data-step="next"]', "offsetLeft")];
      h.expect(xPrev < xScrub && xScrub < xNext, `порядок у ряду не «‹ слайдер ›»: ${xPrev} / ${xScrub} / ${xNext}`);

      await h.tap('[data-step="next"]'); await h.wait(300);
      const d1 = await h.text("[data-date]");
      h.expect(d0 !== d1, "стрілка вперед не зрушила день");
      h.expect((await h.attr('[data-chip="tomorrow"]', "aria-pressed")) === "true", "крок уперед на день не дорівнює «завтра»");
      await h.tap('[data-step="prev"]'); await h.wait(300);
      h.expect(d0 === (await h.text("[data-date]")), "стрілка назад не повернула на сьогодні");
      h.expect((await h.attr('[data-chip="today"]', "aria-pressed")) === "true", "після кроку назад «сьогодні» не позначене");

      // At the end of the ±365-day window the step has nowhere to go: it must go INERT, not disappear —
      // a control that vanishes moves the two beside it.
      await h.type("#scrub", "365"); await h.wait(300);
      h.expect((await h.prop('[data-step="next"]', "disabled")) === true, "стрілка вперед активна на межі вікна");
      h.expect((await h.prop('[data-step="prev"]', "disabled")) === false, "стрілка назад вимкнена не на межі");
      h.expect((await h.count('[data-step="next"]')) === 1, "стрілка зникла замість того, щоб згаснути");
      await h.click('[data-chip="today"]'); await h.wait(250);
    },
  },
  {
    // The third slot is the whole rest of the year: a native date input, so the day comes from the platform
    // calendar rather than from counting slider steps. Asserted through the input's own value change (which
    // is what a picked day does), not through the OS picker, which no headless browser can open.
    name: "конкретний день з календаря", run: async (h) => {
      await h.click('[data-tab="wheel"]'); await h.wait(250);
      await ready(h);
      const d0 = await h.text("[data-date]");
      h.expect((await h.attr('[data-chip="pick"]', "data-picked")) === "false", "чип дати позначений до вибору");
      // the gate pins «now» to 25 Jul 2026, so this is a fixed 20 days ahead
      await h.type("[data-pick]", "2026-08-14"); await h.wait(350);
      const d1 = await h.text("[data-date]");
      h.expect(d0 !== d1, "обраний день не змінив дату транзиту");
      h.expect(/14/.test(d1), `дата транзиту не 14 число: ${d1}`);
      h.expect((await h.attr('[data-chip="pick"]', "data-picked")) === "true", "чип дати не позначився вибраним");
      h.expect(/14/.test(await h.text('[data-chip="pick"]')), "чип не показує обраний день");
      // and the presets take the row back
      await h.click('[data-chip="today"]'); await h.wait(250);
      h.expect(d0 === (await h.text("[data-date]")), "«сьогодні» не повернуло на сьогодні після вибору дня");
      h.expect((await h.attr('[data-chip="pick"]', "data-picked")) === "false", "чип дати лишився вибраним");
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
    // A cusp reading exists for one reason: the house is delegated to the ruler of the sign on it, and that
    // ruler lives somewhere else. If the ruler line ever stops rendering, the sheet still looks fine and
    // says nothing — so the ruler is asserted by name, not by the sheet merely opening.
    name: "трактовка дому з куспіда: управитель дому і де він стоїть", run: async (h) => {
      await h.click('[data-tab="chart"]'); await h.wait(400);
      h.expect((await h.count("[data-cusp]")) === 12, "немає 12 куспідів");
      await h.tap('[data-cusp="7"]'); await h.wait(450);
      h.expect((await h.prop("#cuspsheet", "open")) === true, "аркуш дому не відкрився");
      h.expect((await h.text("[data-reading]")).trim().length > 80, "порожня трактовка дому");
      h.expect((await h.text('[data-cusp-ruler]')).trim().length > 0, "не показано управителя дому");
      h.expect(/\d/.test(await h.text('[data-fact="houseRuler"]')), "не показано, у якому домі стоїть управитель");
      h.expect((await h.count('[data-fact="tenants"]')) === 1, "немає рядка планет у домі");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#cuspsheet", "open")) !== true, "Back не закрив аркуш дому");
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
    // The catalogue is a chat with no text field: ten questions, tapped. The properties worth pinning are
    // that tapping one appends an answered pair, that the answer survives a reload (it is cached, and a
    // reading you have to pay for twice is a reading you stop asking for), and that a question leaves the
    // catalogue once asked so it cannot be double-billed.
    name: "питання до карти: тап додає відповідь, вона переживає перезавантаження", run: async (h) => {
      await h.click('[data-tab="chart"]'); await h.wait(400);
      await h.tap("[data-ask-open]"); await h.wait(450);
      h.expect((await h.prop("#asksheet", "open")) === true, "аркуш питань не відкрився");
      // the gate seeds two asked questions so the populated state is what CI and the shots see
      const seeded = await h.count("[data-asked]");
      h.expect(seeded === 2, `очікував 2 засіяні питання, а не ${seeded}`);
      h.expect((await h.count("[data-reading]")) === seeded, "не в кожного питання є відповідь");
      h.expect((await h.text("[data-reading]")).trim().length > 100, "порожня відповідь");
      const rest = await h.count("[data-ask]");
      h.expect(rest === 9, `у каталозі має лишитись 9 питань, а не ${rest}`);
      // the catalogue shows TOPICS: a chip is a word, and the whole question lives in the prompt
      const chip = (await h.text('[data-ask="money"]')).trim();
      h.expect(chip.length <= 16 && !/\?/.test(chip), `чип каталогу знову речення: ${chip}`);

      await h.tap('[data-ask="money"]'); await h.wait(400);
      h.expect((await h.count("[data-asked]")) === 3, "питання не додалось у стрічку");
      h.expect((await h.count("[data-ask]")) === 8, "запитане питання не зникло з каталогу");

      await h.goto("?tab=chart&screen=ask", 1600);
      h.expect((await h.prop("#asksheet", "open")) === true, "?screen=ask не відкрив каталог");
      h.expect((await h.count("[data-asked]")) === 3, "стрічка не пережила перезавантаження");
      await h.back(); await h.wait(350);
      h.expect((await h.prop("#asksheet", "open")) !== true, "Back не закрив каталог");
      await h.goto("", 1200);
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

  // ── синастрія: дві карти, невідомий час, і повзунок, що робить цю невідомість видимою ──────────
  //
  // Числа тут пораховані наперед (packages/runtime/synastry.js на мок-датах 1992-03-22 × 1990-07-15) і
  // саме тому вони чогось варті: гейт ловить не «щось відрендерилось», а зміну самої моделі.
  {
    name: "сумісність: партнер стоїть ПЕРШИМ, і в полях, і в картках", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      h.expect((await h.count("[data-date-b] + [data-date-a]")) === 1, "поля дат не в порядку партнер→ти");
      h.expect((await h.count("[data-person-b] + [data-person-a]")) === 1, "картки не в порядку партнер→ти");
    },
  },
  {
    name: "сумісність: індекс і контакти пораховані з реальних довгот", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      h.expect((await h.text("[data-overall]")).trim() === "83", "індекс на мок-датах має бути 83");
      const n = await h.count("[data-contact]");
      h.expect(n > 0 && n <= 5, `контактів ${n}, очікувалось 1..5`);
    },
  },
  {
    // Те, заради чого повзунок існує: Місяць змінює знак усередині доби народження у 43.8% випадків, тож
    // без часу народження його знак — не факт про людину. У мок-парі це стосується ТЕБЕ, а не партнера.
    name: "сумісність: невизначений Місяць позначено там, де він справді невизначений", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      h.expect((await h.count("[data-person-a] [data-moon-open]")) === 1, "твій Місяць рухомий, але не позначений");
      h.expect((await h.count("[data-person-b] [data-moon-open]")) === 0, "Місяць партнера позначено помилково");
    },
  },
  {
    name: "сумісність: повзунок часу перераховує карту наживо", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      await h.type('[data-dial-b] input[type=range]', "1440"); await h.wait(400);
      h.expect((await h.text("[data-overall]")).trim() === "74", "зсув партнера на +24 год не перерахував індекс");
      // +24 год від полудня — це той самий годинник наступної доби, тож саме позначка дня доводить зсув.
      h.expect((await h.text("[data-dial-b]")).includes("+1"), "зсув на добу не показано в підписі");
      await h.type('[data-dial-b] input[type=range]', "0"); await h.wait(400);
      h.expect((await h.text("[data-overall]")).trim() === "83", "повернення повзунка не повернуло індекс");
    },
  },
  {
    name: "сумісність: календар відкривається, гортає роки і закривається на Back", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      await h.tap("[data-date-b]"); await h.wait(400);
      h.expect((await h.prop("#calsheet", "open")) === true, "календар не відкрився");
      await h.click("[data-cal-title]"); await h.wait(250);
      h.expect((await h.count("[data-cal-year]")) > 0, "заголовок не відкрив сітку років");
      await h.back(); await h.wait(400);
      h.expect((await h.prop("#calsheet", "open")) !== true, "Back не закрив календар");
    },
  },
  {
    name: "сумісність: трактування рендериться як текст, а не як скелет", run: async (h) => {
      await h.click('[data-tab="match"]'); await h.wait(600);
      h.expect((await h.count("[data-reading]")) === 1, "немає блоку трактування");
      h.expect((await h.text("[data-reading]")).length > 200, "трактування підозріло коротке");
    },
  },
];
