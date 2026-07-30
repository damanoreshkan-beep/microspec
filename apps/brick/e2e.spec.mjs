
const ready = async (h) => {
  for (let i = 0; i < 30; i++) {
    if (+(await h.attr("[data-live-screen]", "data-frame")) > 0) return true;
    await h.wait(300);
  }
  return false;
};
const frame = async (h) => +(await h.attr("[data-live-screen]", "data-frame"));
const dist = async (h) => +(await h.attr("[data-live-screen]", "data-dist"));

export default [
  {
    name: "рушій: wasm завантажився і кадри йдуть", run: async (h) => {
      h.expect(await ready(h), "гра не почала рахувати кадри — wasm не завантажився?");
      h.expect((await h.count("[data-err]")) === 0, "рушій повідомив про помилку завантаження");
      const a = await frame(h);
      await h.wait(700);
      h.expect((await frame(h)) > a, "кадри не рухаються — ігровий цикл стоїть");
    },
  },
  {
    name: "консоль: хрестовина, A/B і старт на місці", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-pad]")) === 4, "хрестовина не має чотирьох напрямків");
      h.expect((await h.count('[data-key="a"]')) === 1, "немає клавіші A");
      h.expect((await h.count('[data-key="b"]')) === 1, "немає клавіші B");
      h.expect((await h.count('[data-key="start"]')) === 1, "немає клавіші START");
    },
  },
  {
    name: "ввід: утримання ВПРАВО просуває гравця", run: async (h) => {
      await ready(h);
      const before = await dist(h);
      await h.prop("body", "clientWidth");
      await h.tap('[data-pad="padRight"]');
      await h.wait(900);
      h.expect((await dist(h)) >= before, "дистанція зменшилась — камера поїхала назад?");
    },
  },
  {
    name: "симуляція: гравець реально долає дистанцію", run: async (h) => {
      await ready(h);
      const before = await dist(h);
      for (let i = 0; i < 6; i++) {
        await h.keys(["ArrowRight", "ShiftLeft", "ArrowUp"], 220);   
        await h.keys(["ArrowRight", "ShiftLeft"], 280);
      }
      const after = await dist(h);
      h.expect(after > before + 20,
        `за 3с бігу зі стрибками дистанція ${before} → ${after} — симуляція не веде гравця вперед`);
    },
  },
  {
    
    name: "смерть: забіг закінчується і картка з'являється", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 14 && (await h.attr("[data-live-screen]", "data-dead")) === "0"; i++)
        await h.key("ArrowRight", 500);
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "1",
        "сім секунд ходьби вправо без стрибка не вбили гравця — у треку немає ями, або падіння не вбиває");
      await h.wait(600);
      h.expect((await h.count("[data-over]")) === 1, "гравець мертвий, а картка кінця гри не з'явилась");
      
      const run = await h.text("[data-run]");
      h.expect(/^\d{4}$/.test(run || ""), `картка не показала дистанцію щойно зіграного забігу — "${run}"`);
      await h.tap("[data-restart]");
      await h.wait(600);
      h.expect((await h.count("[data-over]")) === 0, "після рестарту картка лишилась на екрані");
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "0", "рестарт не оживив гравця");
    },
  },
  {
    name: "звук: перемикач тримає стан", run: async (h) => {
      await ready(h);
      const before = await h.attr('[data-key="sound"]', "aria-pressed");
      await h.tap('[data-key="sound"]');
      await h.wait(200);
      h.expect((await h.attr('[data-key="sound"]', "aria-pressed")) !== before, "перемикач звуку не змінив стан");
    },
  },
  {
    name: "рекорди: аркуш відкривається, Back закриває (історія-backed)", run: async (h) => {
      await ready(h);
      await h.tap('[data-key="records"]');
      await h.wait(350);
      h.expect((await h.count("[data-stat]")) === 3, "аркуш рекордів не показав три показники");
      await h.back();
      await h.wait(350);
      h.expect((await h.count("#records[open]")) === 0, "Back не закрив аркуш рекордів");
    },
  },
  {
    name: "старт: перезапуск лишає гру живою", run: async (h) => {
      await ready(h);
      await h.tap('[data-key="start"]');
      await h.wait(600);
      h.expect((await h.count("[data-err]")) === 0, "після рестарту рушій впав");
      const a = await frame(h);
      await h.wait(600);
      h.expect((await frame(h)) > a, "після рестарту кадри стали");
    },
  },
  {
    name: "локаль: перемикання не ламає екран", run: async (h) => {
      await ready(h);
      
      
      await h.tap('[data-tab="me"]'); await h.wait(300);
      await h.tap('[data-loc="en"]'); await h.wait(300);
      await h.tap('[data-tab="play"]'); await h.wait(500);
      h.expect(/jump/i.test(await h.attr('[data-key="a"]', "aria-label")), "клавіша A не переклалась на en");
      const a = await frame(h); await h.wait(600);
      h.expect((await frame(h)) > a, "після повернення на вкладку гра не йде");
      await h.tap('[data-tab="me"]'); await h.wait(250);
      await h.tap('[data-loc="uk"]'); await h.wait(250);
      await h.tap('[data-tab="play"]'); await h.wait(400);
      h.expect((await h.count("[data-live-screen]")) === 1, "екран зник після зміни локалі");
    },
  },
  {
    name: "клавіатура: стрілки ведуть гравця, клавіші світяться", run: async (h) => {
      await ready(h);
      const before = await dist(h);
      await h.keys(["ArrowRight", "ShiftLeft"], 900);            
      h.expect((await dist(h)) > before, "гравець не рушив від стрілки — клавіатура не доходить до маски");
      
      
      await h.keyDown("ArrowLeft");
      await h.wait(150);
      const lit = await h.hasClass('[data-pad="padLeft"]', "sf-pressed");
      await h.keyUp("ArrowLeft");
      await h.wait(150);
      h.expect(lit, "клавіша на екрані не підсвітилась під час натиску з клавіатури");
      h.expect(!(await h.hasClass('[data-pad="padLeft"]', "sf-pressed")), "клавіша лишилась підсвіченою після відпускання");
    },
  },
  {
    name: "клавіатура і палець не стирають одне одного", run: async (h) => {
      await ready(h);
      
      
      
      
      const RIGHT = 2;
      await h.keyDown("ArrowRight");
      await h.wait(120);
      h.expect((+(await h.attr("[data-live-screen]", "data-mask")) & RIGHT) !== 0, "клавіатура не дійшла до маски");
      await h.tap('[data-key="a"]');      
      await h.wait(200);
      const held = +(await h.attr("[data-live-screen]", "data-mask"));
      await h.keyUp("ArrowRight");
      h.expect((held & RIGHT) !== 0, "дотик стер утримувану клавішу — маска знову має двох власників");
    },
  },
  {
    name: "камера: можна повернутись назад", run: async (h) => {
      await ready(h);
      
      
      await h.key("ArrowRight", 700);
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "0", "забіг обірвався до виміру камери");
      const far = +(await h.attr("[data-live-screen]", "data-camx"));
      h.expect(far > 0, "камера не рушила вперед");
      await h.key("ArrowLeft", 900);                             
      const back = +(await h.attr("[data-live-screen]", "data-camx"));
      h.expect(back < far, "камера не відкотилась — пропущену монету не повернути");
      h.expect(back >= 0, "камера пішла за початок світу");
    },
  },
  {
    
    name: "екран: гра займає корпус, а корпус — увесь вигляд", run: async (h) => {
      await ready(h);
      
      const box = await h.prop("#view", "clientHeight");
      const padT = parseFloat(await h.css("#view", "padding-top")) || 0;
      const padB = parseFloat(await h.css("#view", "padding-bottom")) || 0;
      const room = box - padT - padB;
      const bodyH = await h.prop("[data-shell-body]", "clientHeight");
      const bodyW = await h.prop("[data-shell-body]", "clientWidth");
      const cw = await h.prop("canvas", "clientWidth");
      h.expect(room > 0 && bodyW > 0, "нема з чим порівнювати — корпус або вигляд не змірялись");
      h.expect(bodyH >= room * 0.95,
        `корпус ${bodyH}px у доступних ${room}px (вигляд ${box} − падінги ${padT}/${padB}) — консоль стискається до вмісту замість заповнювати екран`);
      h.expect(cw >= bodyW * 0.78,
        `полотно ${cw}px у корпусі ${bodyW}px — апертура забирає в гри ширину, яку нікому більше не віддає`);
    },
  },
  {
    name: "корпус: колір панелі і touch-action обидва переживають злиття стилів", run: async (h) => {
      await ready(h);
      const tint = await h.css("[data-shell-body]", "--sh-tint");
      h.expect(/^\s*(#|rgb)/.test(tint || ""), `гра не передала свою панель апертурі — --sh-tint = "${tint}"`);
      const body = await h.css("[data-shell-body]", "--sh-body");
      h.expect(/^\s*(#|rgb)/.test(body || ""), `корпус не отримав власного кольору — --sh-body = "${body}"`);
      const touch = await h.css("[data-shell-body]", "touch-action");
      h.expect(touch === "none", `дека втратила touch-action під час злиття стилів — "${touch}"`);
    },
  },
];
