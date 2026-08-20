// reel — the headless gate seeds a 3-clip public-domain mock (never the network), so the reel always renders
// populated, and a DIVE lands on a second seeded batch ("Deeper …") so the drill-down is provable offline.
// We assert: the slide feed + its filters, the dive (chip, island, subscribe, back — by button AND by system
// Back), the grouped sources tab, and the Liked tab playing in place. We never assert a stream PLAYS —
// headless has no video. Drags aren't dispatchable from this surface; every gesture has a button, and that's
// what we tap (which is also the a11y contract: no navigation that only a finger can reach).
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-reel]")) > 0) break; await h.wait(300); } };
// the black-poster filter is async (loads the poster into a canvas) → poll until the feed settles
const settles = async (h, n) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-reel]")) === n) return true; await h.wait(200); } return false; };
// Три контроли переїхали з острівця у шторку «Ще» (він став схожий на панель керування). Функція нікуди не
// зникла — вона на один тап глибше, тож і тести дістають її через ці двері, а не через ослаблене твердження.
const openMore = async (h) => { await h.tap("[data-more]"); await h.wait(400); };
const has = async (h, re) => re.test(await h.bodyText());

export default [
  {
    name: "стрічка рендериться; биті чорні/пласкі постери й дублікати відфільтровано", run: async (h) => {
      await ready(h);
      // mock seeds 6: 3 good + a duplicate (dedupe drops) + a black-poster clip (black filter drops) +
      // a flat-grey placeholder poster (flat filter drops) → 3 clean
      // The COUNT is the whole claim, and it has to be: a slide renders no title text (by design — the
      // surface carries no captions), so the old `bodyText()` checks for the bad clips' names could never
      // have failed. 6 seeded → 3 slides is what actually proves all three filters ran.
      h.expect(await settles(h, 3), "фільтри не звели стрічку до 3 чистих слайдів (дубль/чорний/плаский постер лишились)");
    },
  },
  {
    /* Раніше тут стверджувалось `count("video") === 1` — і саме та одиниця БУЛА вадою. Один елемент означає,
       що кожен свайп знищує відео й будує нове: новий елемент, нове зʼєднання, очікування `loadeddata` — і
       проміжок, у якому нема чого показати. Це і є блимання, на яке скаржився власник.
       Тож інваріант перевернуто: сусідній слайд ПОВИНЕН мати свій елемент (він буферизується, поки ти
       дивишся поточний), і рівно один із них має грати. Обидві половини потрібні — вікно без «рівно одного
       гравця» це просто кілька відео, що грають одночасно. */
    name: "наступне відео вже змонтоване і буферизується; грає рівно одне", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      const mains = await h.count("video[data-main]");
      h.expect(mains >= 2, `змонтовано ${mains} відео — сусідній слайд не преload-иться, свайп знову почне з нуля`);
      h.expect(mains <= 3, `змонтовано ${mains} відео — вікно ширше за PRELOAD, це вже витрата декодерів`);
      /* Рівно один власник відтворення. `paused` — це властивість, не атрибут, тож жоден селектор його не
         бачить; застосунок дзеркалить стан у `data-playing`, і це те, що тут міряється. */
      const playing = await h.count("video[data-main][data-playing]");
      h.expect(playing === 1, `грає ${playing} відео замість одного — вікно преload має буферизувати, а не програвати`);
      /* …і те саме, але по ФАКТУ, а не за наміром. `data-playing` — це проп: він зловить «вікно вважає
         активними всіх» і НЕ зловить «прогрів узяв play() і забув віддати». Прогрів навмисне запускає
         сусіда на один кадр, щоб змусити декод, тож єдине, що тримає його від відтворення, — це pause()
         у тому ж ланцюжку. Читаємо справжню властивість першого неактивного елемента. */
      const neighbourPaused = await h.prop("video[data-main]:not([data-playing])", "paused");
      h.expect(neighbourPaused !== false, "сусідній слайд реально ГРАЄ — прогрів не повернув паузу, і у вікні тепер два відтворення");
    },
  },
  {
    /* Тап по слайду відкриває ПОВНИЙ кліп поверх стрічки. Раніше одиночний тап ставив на паузу, а сторінку
       відкривав у зовнішній вкладці й лише тоді, коли кліп не грав тут — тобто найцінніша дія на екрані
       діставалась тільки через збій. Під гейтом /feed/stream не смикається (мережі нема), і openFull
       підставляє превʼю, тож перевіряється саме ЗВʼЯЗКА: тап → оверлей → Back, а не сам стрім. */
    name: "тап по рілзу відкриває повний кліп поверх стрічки, і Back його закриває", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      h.expect((await h.count('[role="dialog"]')) === 0, "оверлей уже відкритий до тапу");
      await h.tap("[data-reel]"); await h.wait(500);
      h.expect((await h.count('[role="dialog"]')) === 1, "тап по слайду не відкрив повний кліп");
      /* І стрічка під ним МОВЧИТЬ. Два елементи одночасно — це дві звукові доріжки; превʼю, що грає поверх
         відкритого кліпа, це саме те, що суспension має прибирати. */
      h.expect((await h.count("video[data-main][data-playing]")) === 0, "стрічка продовжує грати під відкритим кліпом");
      await h.back(); await h.wait(500);
      h.expect((await h.count('[role="dialog"]')) === 0, "системний Back не закрив повний кліп");
      h.expect((await h.count("[data-reel]")) >= 1, "Back вийшов з апки замість закрити оверлей");
    },
  },
  {
    name: "hero: дубльованої кнопки джерел нема (лишився лише таб)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#source")) === 0, "плаваюча кнопка-дубль #source не прибрана з hero");
      h.expect((await h.count('[data-tab="sources"]')) === 1, "таб «Джерела» відсутній у доку");
    },
  },
  {
    // Слайд — це саме відео. Уся хромованка (чіп провалювання, посилання «відкрити оригінал», біла
    // пігулка «дивитись») зведена в ОДИН нижній острівець: одна заява замість однієї на кожен слайд,
    // і до неї дістає клавіатура. Тест міряє, що на слайді не лишилось нічого, і що функція не зникла.
    name: "поверхня: на слайді нема жодного контролу — все живе в нижньому острівці", run: async (h) => {
      await ready(h);
      await settles(h, 3);
      h.expect((await h.count("[data-reel] a")) === 0, "на слайді лишилось посилання (відкрити оригінал)");
      h.expect((await h.count("[data-reel] button")) === 0, "на слайді лишилась кнопка");
      // В ОСТРІВЦІ лишається тільки те, до чого тягнешся не думаючи: назва, шлях назад/вперед, play — і двері.
      for (const [sel, what] of [["[data-island-label]", "назва джерела"], ["[data-dive]", "провалювання"], ["[data-watch]", "повний кліп в апці"], ["[data-more]", "двері «Ще»"]]) {
        h.expect((await h.count(sel)) === 1, `в острівці немає контролу: ${what} (${sel})`);
      }
      // …а те, що є РІШЕННЯМ, а не рефлексом, з острівця прибрано. Це і є суть мінімалізації: якщо ці
      // селектори знову з'являться назовні, панель керування відросла.
      for (const [sel, what] of [["[data-clean]", "чистий екран"], ["[data-subscribe]", "підписка"], ["[data-open-page]", "відкрити сторінку"], ["[data-exp]", "експорт"]]) {
        h.expect((await h.count(sel)) === 0, `контрол лишився в острівці замість шторки: ${what} (${sel})`);
      }
      const isl = await h.attr("[data-island]", "class");
      h.expect(!/\bopacity-0\b/.test(isl || ""), "острівець не має бути прихованим");

      // …і кожна з них справді жива за дверима, а не просто видалена.
      await openMore(h);
      for (const [sel, what] of [["[data-clean]", "чистий екран"], ["[data-subscribe]", "підписка"], ["[data-open-page]", "відкрити сторінку"]]) {
        h.expect((await h.count(sel)) === 1, `функція зникла разом з переїздом у шторку: ${what} (${sel})`);
      }
      // Експорт: зберегти і поділитися, для обох форматів — чотири контроли, жодного менше.
      for (const key of ["gif-save", "gif-share", "mp4-save", "mp4-share"]) {
        h.expect((await h.count(`[data-exp="${key}"]`)) === 1, `у шторці немає кнопки експорту: ${key}`);
      }
      // Шторка dismissable, тож системний Back мусить її закрити, а не вийти з апки.
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-exp]")) === 0, "системний Back не закрив шторку «Ще»");
      h.expect((await h.count("[data-reel]")) >= 1, "Back вийшов з апки замість закрити шторку");
    },
  },
  {
    /* Чистий екран. Уся хромованка живе на ТРЬОХ елементах, і два з них — рантаймові (шапка, док + його
       градієнт), тож ховати їх зсередини застосунку не можна: --hdr-h/--dock-h вимірюються з них. Тому це
       режим рантайму (S.clean), а тут перевіряється рівно те, що власник побачить: після тапу на екрані не
       лишилось нічого, крім відео, свайп працює, і назад повертає ВСЕ — і кнопкою-дверима, і системним Back
       (док зник, тож без history-запису Back вийшов би з апки). */
    name: "чистий екран: тап прибирає шапку, док і острівець — лишається саме відео; Back повертає все", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("header.navbar")) === 1, "хромованки нема ще до входу в чистий екран");
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      for (const [sel, what] of [["header.navbar", "шапка"], ["nav[data-dock]", "док"], ["[data-island]", "острівець"]]) {
        h.expect((await h.count(sel)) === 0, `у чистому екрані лишилась ${what} (${sel})`);
      }
      h.expect((await h.count("[data-reel]")) === 3, "чистий екран знищив саму стрічку");
      h.expect((await h.count("[data-clean-exit]")) === 1, "у чистому екрані нема дверей назад — док прибрано, і вийти нема чим");
      /* Кнопка-двері — і тільки вона. Якщо їх дві (або нуль), «нічого не заважає» перестає бути правдою. */
      await h.tap("[data-clean-exit]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("[data-island]")) === 1, "двері не повернули хромованку");
      // …і те саме системним Back: без history-запису він вийшов би з апки, бо доку на екрані нема
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 0, "повторний вхід у чистий екран не спрацював");
      await h.back(); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 1, "системний Back не повернув док (або вийшов з апки)");
      h.expect((await h.count("[data-reel]")) === 3, "Back вийшов зі стрічки замість повернути керування");
    },
  },
  {
    name: "провалювання: свайп-чіп відкриває сторінку рілзу як нове джерело, назад — той самий список", run: async (h) => {
      await ready(h);
      await settles(h, 3);
      h.expect((await h.count("[data-dive]")) >= 1, "на слайді немає цілі провалювання (data-dive)");
      h.expect((await h.count("[data-feed-back]")) === 0, "на нульовому рівні не має бути кнопки «назад»");
      const root = await h.text("[data-island-label]");
      const chip = await h.attr("[data-dive]", "aria-label");
      h.expect(/Big Buck Bunny/.test(chip), `кнопка провалювання підписана «${chip}» — має нести назву самого рілзу, а не форму URL`);
      await h.tap("[data-dive]"); await h.wait(600);
      // the dived page seeds a DIFFERENT batch (2 slides) — the source label and the list both had to change
      h.expect(await settles(h, 2), "провалювання не завантажило стрічку сторінки, на якій лежить рілз");
      h.expect((await h.text("[data-island-label]")) !== root, `острівець лишився на «${root}» — джерело не змінилось`);
      // …and it is named by the PAGE, not by the shape of its URL. `/watch/10241/` derives only to "Mixkit";
      // the mock's page title is "Big%20Buck%20Bunny in 4K &amp; Friends — Mixkit", so the site chrome must
      // come off AND the machine text has to be decoded — a percent-escape and an entity, both of which
      // reached the screen raw before humanText existed.
      const lvl = await h.text("[data-island-label]");
      h.expect(lvl === "Big Buck Bunny in 4K & Friends", `острівець показує «${lvl}» замість справжньої назви сторінки «Big Buck Bunny in 4K & Friends»`);
      h.expect(!/%[0-9A-Fa-f]{2}|&[a-z]+;|&#/.test(lvl), `в назві джерела лишились нерозкодовані символи: «${lvl}»`);
      h.expect((await h.count("[data-feed-back]")) === 1, "після провалювання немає кнопки повернення");
      // …and back restores the ORIGINAL list (a restore, not a refetch)
      await h.tap("[data-feed-back]"); await h.wait(500);
      h.expect((await h.text("[data-island-label]")) === root, "повернення не відновило попереднє джерело");
      h.expect(await settles(h, 3), "повернувся не той самий список із 3 слайдів");
      h.expect((await h.count("[data-feed-back]")) === 0, "кнопка повернення лишилась на нульовому рівні");
    },
  },
  {
    name: "провалювання: системний Back відкручує рівень (а не виходить з апки)", run: async (h) => {
      await ready(h);
      const root = await h.text("[data-island-label]");
      await h.tap("[data-dive]"); await h.wait(600);
      const lvl1 = await h.text("[data-island-label]");
      h.expect(lvl1 !== root, "провалювання не спрацювало");
      await h.tap("[data-dive]"); await h.wait(600);                   // другий рівень — стек, а не один прапорець
      const lvl2 = await h.text("[data-island-label]");
      h.expect(lvl2 && lvl2 !== lvl1, `другий рівень не відкрився (острівець лишився на «${lvl1}»)`);
      await h.back(); await h.wait(500);
      h.expect((await h.text("[data-island-label]")) === lvl1, "перший системний Back мав відкрутити рівно один рівень, а не впасти в корінь");
      await h.back(); await h.wait(500);
      h.expect((await h.text("[data-island-label]")) === root, "другий системний Back не повернув у корінь стрічки");
      h.expect((await h.count("[data-reel]")) >= 1, "апка зникла — Back вийшов далі, ніж мав");
    },
  },
  {
    name: "провалювання: у джерело без підписки — кнопка «підписатись» додає його в таб джерел", run: async (h) => {
      await ready(h);
      await h.tap("[data-dive]"); await h.wait(600);
      // Назву читаємо ДО відкриття шторки: острівець лишається під нею, але міряти видиме крізь оверлей —
      // це вимірювати не те, що бачить власник.
      const island = await h.text("[data-island-label]");
      await openMore(h);
      h.expect((await h.count("[data-subscribe]")) === 1, "на непідписаному джерелі немає кнопки підписки");
      await h.tap("[data-subscribe]"); await h.wait(400);
      /* Підписка закриває шторку за собою, тож перевіряти «кнопка зникла» на закритій шторці — це
         твердження, яке правдиве завжди й не перевіряє нічого. Відкриваємо ще раз і міряємо ТАМ, де
         контрол живе: зник він через subbed, а не через те, що ми відвели очі. */
      await openMore(h);
      h.expect((await h.count("[data-subscribe]")) === 0, "після підписки кнопка мала зникнути");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-exp]")) === 0, "шторка лишилась відкритою над стрічкою");
      await h.tap('[data-tab="sources"]'); await h.wait(400);
      h.expect(await has(h, /Підписки|Subscriptions/), "таб джерел не відкрився");
      /* Рядок джерела і острівець — це ОДНА відповідь на питання «як зветься ця сторінка», тож звіряємо їх
         рядок у рядок, а не по підрядку. Саме тут вони й розходились: острівцю віддавали <title> сторінки,
         а список довіку показував здогад, зроблений з самого URL у мить підписки. */
      const row = await h.text("[data-src-title]");
      h.expect(row === island, `рядок джерела показує «${row}», а острівець — «${island}»: два різні імені однієї сторінки`);
      /* …і показує його ЦІЛКОМ. Текст у DOM нічого не доводить (innerText той самий і під `truncate`), тож
         міряємо: рядок переносить назву, а не ріже її — ширина вмісту не виходить за ширину елемента. */
      const [sw, cw] = [await h.prop("[data-src-title]", "scrollWidth"), await h.prop("[data-src-title]", "clientWidth")];
      h.expect(sw <= cw + 1, `назву джерела обрізано по горизонталі (${sw}px вмісту в ${cw}px рядка) — вона має переноситись, а не ховатись`);
      h.expect(!/…$/.test(row), `назву джерела вкорочено трикрапкою («${row}») — у рядку є місце на повну`);
      await h.tap('[data-tab="reel"]'); await h.wait(400);
      await h.tap("[data-feed-back]"); await h.wait(400);              // прибираємо за собою — далі тести чекають корінь
    },
  },
  {
    name: "джерела: канали згруповані по сайтах з людськими назвами сторінок (Back закриває шит)", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);           // reel → sources tab (dock)
      h.expect((await h.count("[data-src-row]")) >= 3, "немає готових каналів");
      const txt = await h.bodyText();
      h.expect(/mixkit\.co/.test(txt), "картка сайту не показує домен");
      h.expect(/Space/.test(txt) && !/free-stock-video\/space/.test(txt), "рядок сторінки має показувати назву, а не сирий URL");
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#src-input")) === 1, "шит додавання URL не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#src-input")) === 0, "Back не закрив шит");
    },
  },
  {
    name: "«відкрити сайт» відкриває зовнішній браузер — жодного iframe-оверлея в апці", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      h.expect((await h.count("[data-open-site]")) >= 1, "кнопки «відкрити сайт» немає");
      await h.tap("[data-open-site]"); await h.wait(400);               // opens the external browser (window.open)
      h.expect((await h.count("[data-frame]")) === 0, "iframe-оверлей більше не має існувати в апці");
    },
  },
  {
    name: "додати-URL: поле пошуку з'являється лише коли в URL є квері-параметри", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#sheet-search")) === 0, "поле пошуку показалось для порожнього URL");
      await h.type("#src-input", "site.com/search?q=cats"); await h.wait(200);   // resolver finds ?q= → searchable
      h.expect((await h.count("#sheet-search")) === 1, "поле пошуку не з'явилось для URL з квері-параметром");
      await h.back(); await h.wait(300);
    },
  },
  {
    /* Сесія сайту: ключ на картці МОГО сайту відкриває шит з одним полем (Cookie сайту) — history-backed, Back
       закриває. Збережена сесія позначає ключ (aria-pressed); «Забути» є лише коли сесія збережена. Пресети (Discover)
       ключа не мають — у чужого каналу нема твого акаунта. Мережі під гейтом немає, тож сам POST з кукі до
       /feed/videos доводиться unit-тестом на edge (pageHeaders/videosBody), а тут — тільки стан і маршрут. */
    name: "сесія сайту: ключ на картці → шит (Back закриває) → збережено → позначено → забути", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      h.expect((await h.count("[data-session]")) === 1, `ключ сесії має бути рівно на одній картці (мої сайти), є ${await h.count("[data-session]")}`);
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 0, "сесія позначена до збереження");
      await h.tap("[data-session]"); await h.wait(300);
      h.expect((await h.count("#sess-input")) === 1, "шит сесії не відкрився");
      h.expect((await h.count("[data-sess-forget]")) === 0, "«Забути» показано, хоча сесії ще нема");
      h.expect((await h.prop("#sess-save", "disabled")) === true, "«Зберегти» активна на порожньому полі");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#sess-input")) === 0, "Back не закрив шит сесії");
      await h.tap("[data-session]"); await h.wait(300);
      await h.type("#sess-input", "il=abc; ss=def"); await h.wait(150);
      await h.tap("#sess-save"); await h.wait(400);
      h.expect((await h.count("#sess-input")) === 0, "збереження не закрило шит");
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 1, "збережена сесія не позначила ключ");
      await h.tap("[data-session]"); await h.wait(300);
      h.expect((await h.prop("#sess-input", "value")) === "il=abc; ss=def", "шит не показав збережену сесію");
      h.expect((await h.count("[data-sess-forget]")) === 1, "«Забути» не показано для збереженої сесії");
      await h.tap("[data-sess-forget]"); await h.wait(400);
      h.expect((await h.count("#sess-input")) === 0, "«Забути» не закрило шит");
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 0, "«Забути» не зняло позначку з ключа");
    },
  },
  {
    name: "лайки: тайл відкриває стрічку ПРЯМО в табі лайків, системний Back повертає сітку", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="liked"]'); await h.wait(400);
      h.expect((await h.count("[data-liked-tile]")) === 3, "сітка лайків не заповнена сідованими записами");
      await h.tap("[data-liked-tile]"); await h.wait(600);
      h.expect((await h.count("[data-reel]")) >= 1, "тайл не відкрив стрічку");
      h.expect((await h.count("[data-liked-tile]")) === 0, "сітка лайків лишилась під стрічкою");
      h.expect((await h.attr('[data-tab="liked"]', "aria-current")) === "page", "стрічка перекинула нас в інший таб замість відкритись у лайках");
      await h.back(); await h.wait(500);
      h.expect((await h.count("[data-liked-tile]")) === 3, "системний Back не повернув сітку лайків");
      h.expect((await h.attr('[data-tab="liked"]', "aria-current")) === "page", "Back вискочив із таба лайків");
      /* Чистий екран помирає разом з поверхнею, яку він чистив. S.clean лежить НИЖЧЕ S.stack, тож Back із
         лайкової стрічки спершу знімає рівень стека — і сітка лайків відрендерилась би без шапки й доку, з
         однією маленькою кнопкою замість навігації. Це той самий Back, що й вище, тільки з увімкненим
         чистим екраном: заявка в тому, що виходиш у ПОВНОЦІННУ сітку, а не в обрізану. */
      await h.tap("[data-liked-tile]"); await h.wait(600);
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 0, "чистий екран не увімкнувся в лайковій стрічці");
      await h.back(); await h.wait(600);
      h.expect((await h.count("[data-liked-tile]")) === 3, "Back із чистого екрана не повернув сітку лайків");
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("header.navbar")) === 1, "сітка лайків повернулась без хромованки — чистий екран пережив поверхню, яку чистив");
      h.expect((await h.count("[data-clean-exit]")) === 0, "двері чистого екрана лишились над сіткою");
    },
  },
];
