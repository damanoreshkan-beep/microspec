# ElenaJS проти нашого стека — порівняння

Дослідницька нотатка на запит: *«хочу мігрувати на elenajs.com, у них є MCP і все необхідне — таким чином
вичистимо наш код від кастомщини»*.

Кожен факт нижче або **перевірений** проти першоджерела (сайт, репозиторій, вихідний код, GitHub/npm API),
або явно позначений як неперевірений. Дата зрізу — **2026-08-02**.

## Вердикт

**Міграція не робить того, заради чого її пропонують.** Elena — це базовий клас для custom elements
(2.9 kB), а не заміна нашому runtime. Вона перекриває ~12% нашого коду (`ui.js` + частину `render.js`), і
жодного рядка домену. Те, що ми називаємо «кастомщиною», на 88% є доменною математикою (WMM, SGP4, DSP,
астро, melody) і shell-механікою (роутинг, вимірювання хрому, fit-екрани, i18n, install) — Elena не має
відповіді на жодну з цих задач і прямо виносить роутинг та стан за межі свого скоупу.

Ціна при цьому реальна: ми міняємо keyed VDOM + hooks + реактивний стор на unkeyed positional morph без
стану, і тягнемо npm-білд у zero-build ферму — бо MCP, заради якого все затівається, читає Custom Elements
Manifest, який генерує саме `elena build`.

**Але дещо з Elena варте копіювання** — див. останній розділ. Ідея свого MCP над `ui.js` + `SCHEMA.md` —
теж.

## Що таке Elena (перевірені факти)

| | |
|---|---|
| Репозиторій | `github.com/arielsalminen/elena`, створений **2026-04-13** (переїхав з `getelena/elena`) |
| Вік на дату зрізу | **~3.5 місяці** |
| Соціальні сигнали | 86 зірок, 2 форки, **0 watchers**, 0 відкритих issue, фактично один автор (Viljami Salminen) |
| Версія / ліцензія | `@elenajs/core` **1.0.1**, MIT |
| Розмір | 2.9 kB min+gzip, нуль runtime-залежностей |
| Завантаження за місяць (npm) | `@elenajs/core` **1437**, `@elenajs/mcp` **272** |
| Тести | 1000+ тестів у 57 файлах, 100% покриття `core` |

Модель компонента:

```js
import { Elena, html } from "@elenajs/core";

export default class MyGreeting extends Elena(HTMLElement) {
  static tagName = "my-greeting";
  static props = ["name"];
  name = "Somebody";

  render() {
    return html`<p>Hello, ${this.name}!</p>`;
  }
}
MyGreeting.define();
```

Стилі — через нативний `@scope`, **без Shadow DOM** (свідомий вибір заради доступності й каскаду):

```css
@scope (my-stack) {
  :scope { display: flex; }
  :scope[direction="row"] { flex-direction: row; }
}
```

Головна ідея — **Progressive Web Components**: HTML і CSS рендеряться першими (в тому числі на сервері), JS
доганяє й гідратує. Це прицільна відповідь на болі великих enterprise design systems: FOUC, layout shift,
SSR, доступність, крос-фреймворкова сумісність.

## Побіч: наш стек проти Elena

| Вимір | microspec (зараз) | Elena |
|---|---|---|
| Роль у стеці | повний runtime апки | базовий клас компонента |
| View-шар | Preact 10 + htm (keyed VDOM) | tagged template → `patch` / positional `morph` |
| Стан | nanostores (+ persistent, + preact-binding) | **немає** (props + локальні поля класу) |
| Роутинг | history-backed через atom (`S.screen`, `S.stack`) | **немає** (прямо поза скоупом у FAQ) |
| Логіка в'юшки | hooks (`useState`/`useEffect`/`useRef`) | lifecycle-методи класу |
| Стилі | Tailwind v4 + DaisyUI 5 + `theme.css` токени | `@scope`-блоки, свій CSS на компонент |
| Готові компоненти | `ui.js`: Sheet, Segmented, Island, Panel, Slider + DaisyUI | `@elenajs/components`: Button, Spinner, Stack, VisuallyHidden — і це **приклад**, а не кіт |
| Білд | **немає** (import map + esm.sh) | не обов'язковий для рантайму, **обов'язковий для CEM/MCP** (`@elenajs/bundler` + `elena.config.mjs`) |
| Пакетний менеджер | немає npm, немає `node_modules` | npm/yarn/pnpm/bun |
| SSR | не потрібен (статичний GitHub Pages + PWA) | ключова фіча |
| Прогресивне покращення | не застосовне (апки на 100% JS-рендер) | ключова фіча |
| Зрілість | ферма на 64 апки, свої гейти | 1.0.1, «young project», автор попереджає про невідомі баги |

Дві найсильніші сторони Elena — **SSR** і **progressive enhancement до JS** — для нас не мають цінності за
побудовою: наші апки це offline-first PWA на статичному хостингу, які без JS не мають екрана взагалі. Ми
платили б архітектурний податок за фічі, яких не спожили б.

## Що саме Elena замінила б у нас

`packages/runtime` — **11 705 рядків коду** (+ 4 902 рядки тестів). Розкладка:

| Шар | Файли | Рядків | Чи закриває Elena |
|---|---|---|---|
| UI-кіт | `ui.js` | 376 | **частково** — вона дає базовий клас, компоненти все одно писати нам |
| Shell / роутинг / хром | `render.js` | 1 025 | **ні** — роутингу, `--hdr-h`/`--dock-h`, fit-екранів, i18n, install у неї немає |
| Домен і платформа | решта ~85 модулів | ~10 300 | **ні** — geomag (WMM), orbit (SGP4), natal/astro, demod/rds/ook/lora/fmradio/spectrum/sweep, melody, signif, v2m, hackrf, sw-core, sensors, gesture… |

Тобто теоретичний максимум перетину — **~1.4k з 11.7k рядків (12%)**, і навіть у цих 12% Elena замінює лише
*спосіб оголошення* компонента, а не самі компоненти. Sheet із drag-to-dismiss, Island, Segmented, Slider
довелося б переписати з нуля на її API.

Плюс ~13 100 рядків коду апок (`apps/*/view.js` + `data.js`) — це 64 переписані в'юшки, кожна з яких зараз
збудована на hooks і `useStore`.

## Технічні дельти, які болітимуть

Ці пункти зчитані з вихідного коду `@elenajs/core` (`src/elena.js`, `src/common/render.js`), не з
маркетингу.

1. **Diffing є, але unkeyed і позиційний.** `renderTemplate` спершу пробує `patch()` — швидкий шлях, який
   міняє лише текстові вузли й атрибути, коли форма шаблону та сама. Якщо не вийшло — `morph()`, який
   позиційно порівнює `childNodes` і править атрибути на місці (`morphContent` / `morphAttributes`,
   render.js:243-294). **Ключів немає.** Вставка елемента на початок списку зсуває все вниз і перезаписує
   атрибути на кожному наявному вузлі — для списків з `<video>`/`<img>` (reel, iptv, pins) це означає
   перезапис `src` на існуючих елементах, тобто перезавантаження медіа там, де Preact просто пересунув би
   вузол. Це не теорія, це прямий наслідок алгоритму.
2. **`patch()` зривається на raw-значеннях** (render.js:55-57) і падає в повний `morph`. Наші в'юшки рясно
   інтерполюють вкладені шаблони.
3. **Стану немає взагалі.** nanostores довелося б лишити (що вже суперечить меті «вичистити») або писати
   свій міст prop↔store для кожного компонента.
4. **Роутингу немає.** `S.screen` / `S.stack` / history-invariant лишаються повністю нашими — а це якраз та
   частина `render.js`, яку найважче було зробити правильно.
5. **MCP вимагає npm-білду.** `@elenajs/mcp` читає Custom Elements Manifest, який генерує `elena build`.
   Zero-build ферма без `node_modules` цей маніфест не має звідки взяти. Сам пакет позначено як
   **experimental, «not yet ready for production, APIs may change without notice»**.
6. **CDN-шлях автори не рекомендують для продакшену** — а це єдиний шлях, сумісний з нашим import map.
7. **`@scope` набагато новіший за заявлений фундамент.** Заявлена підтримка (Chrome 71+, Safari 12.1+,
   Firefox 69+) — це floor для Custom Elements, не для `@scope`. Реальний floor стилів треба перевірити
   окремо, перш ніж на це спиратися. *(не перевірено)*
8. **`@elenajs/components` містить Spinner** — компонент, заборонений у нас правилом «без порожніх
   спінерів, тільки скелетони».

## Що з Elena варте того, щоб узяти

Це не «нічого корисного» — просто цінність не в міграції:

- **`@scope` замість наших конвенцій ізоляції.** Нативний scoping без Shadow DOM — рівно та задача, яку ми
  розв'язуємо трирівневим `.aw-scope` у віджетах. Варте окремої перевірки як механізм.
- **Custom Elements Manifest як формат.** Машинно-читаний опис компонентів — саме те, чого бракує агенту,
  який авторить апку. Нам не потрібна Elena, щоб його мати.
- **MCP над власним кітом.** Правильне прочитання запиту «у них є MCP і все необхідне»: цінність не в
  Elena, а в тому, що агент має інструмент, який знає компоненти. Наш еквівалент — MCP-сервер над `ui.js`,
  `packages/schema/SCHEMA.md` і `docs/AUTHORING.md`: `lookup-component`, `scaffold-app`, `get-invariants`.
  Це дає ту саму вигоду без жодної міграції й без npm.
- **Дисципліна progressive enhancement** — не для апок, але наш `#boot` overlay уже є її кустарною версією.

## Коли до цього варто повернутися

Elena стане релевантною, якщо зміняться передумови:

- ми почнемо віддавати компоненти назовні, у чужі стеки (React/Vue/Angular) — саме її сценарій;
- нам знадобиться SSR або робочий екран без JS;
- проєкт дозріє (роки, а не місяці; більше одного автора; MCP вийде з experimental).

Доти правильний хід — **звузити свій `ui.js` і дати агентам MCP над ним**, а не міняти фундамент.

## Джерела

- <https://elenajs.com/> · <https://elenajs.com/start/> · <https://elenajs.com/advanced/faq>
- <https://github.com/arielsalminen/elena> — README `core`, `components`, `mcp`; вихідники
  `packages/core/src/elena.js`, `packages/core/src/common/render.js`
- GitHub REST API (метадані репозиторію), npm downloads API
- Наші дані: `packages/runtime/*` (`wc -l`), `apps/breathe/index.html` (import map), `rules/stack.md`
