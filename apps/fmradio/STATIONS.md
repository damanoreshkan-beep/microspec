# Internet radio stations — повний реєстр з панелі `/radio`

> Рісерч для апки internet radio. Джерело: `~/.config/radio/stations.sh` (реєстр, який читає
> `radioctl` + waybar-модуль `custom/radio`). Панель має **4 режими** × ~8–10 станцій.
> Усі потоки — прямі ICEcast/Shoutcast URL (mp3/aac), придатні для `<audio src>` без проксі.

## Формат

Кожен режим — пара bash-масивів `<MODE>_NAMES` / `<MODE>_URLS` (назва ↔ URL за індексом).
State у `~/.cache/radio/state` (`MODE`, `INDEX`). Плеєр — `mpv` headless.

---

## 1. TECHNO — SomaFM (чиллаут/електроніка, ліцензований, без реклами)

Усі 128 kbps MP3, дзеркало `ice2.somafm.com`.

| # | Станція | Жанр | URL |
|---|---------|------|-----|
| 0 | DEF CON | dark/hacker electro | `https://ice2.somafm.com/defcon-128-mp3` |
| 1 | The Trip | prog house / trip-hop | `https://ice2.somafm.com/thetrip-128-mp3` |
| 2 | Beat Blender | deep house / downtempo | `https://ice2.somafm.com/beatblender-128-mp3` |
| 3 | Groove Salad | ambient / downtempo | `https://ice2.somafm.com/groovesalad-128-mp3` |
| 4 | Drone Zone | atmospheric ambient | `https://ice2.somafm.com/dronezone-128-mp3` |
| 5 | Cliqhop IDM | IDM / glitch | `https://ice2.somafm.com/cliqhop-128-mp3` |
| 6 | Space Station | space ambient | `https://ice2.somafm.com/spacestation-128-mp3` |
| 7 | Metal Detector | metal | `https://ice2.somafm.com/metal-128-mp3` |

**Примітка:** SomaFM віддає плейлисти й на `ice1.somafm.com`, `ice6.somafm.com`. Для веб-апки краще
`https://ice2.somafm.com/<id>-128-mp3` (CORS дозволено, HTTPS). Каталог id: `defcon`, `thetrip`,
`beatblender`, `groovesalad`, `dronezone`, `cliqhop`, `spacestation`, `metal`.

## 2. UA — українські FM (ретрансляція ефіру)

| # | Станція | URL |
|---|---------|-----|
| 0 | Хіт FM | `http://online.hitfm.ua/HitFM` |
| 1 | Радіо Рокс | `http://online.radioroks.ua/RadioROKS` |
| 2 | Люкс FM | `http://online.luxfm.ua/lux_fm` |
| 3 | Kiss FM | `http://online.kissfm.ua/KissFM` |
| 4 | Радіо Шансон | `http://online.radioshanson.ua/RadioShanson` |
| 5 | Перець FM | `http://online.perecfm.com.ua/PerecFM` |
| 6 | Best FM | `http://online.bestfm.ua/BestFM` |
| 7 | Наше Радіо | `http://online.nasheradio.ua/NasheRadio` |
| 8 | Українське Радіо (UR-1) | `http://radio.nrcu.gov.ua:8000/ur1-mp3` |
| 9 | Радіо Промінь (UR-2) | `http://radio.nrcu.gov.ua:8000/ur2-mp3` |

**⚠ Для веб-апки:** усі UA-URL — **HTTP** (не HTTPS). На HTTPS-сторінці браузер заблокує їх як
mixed-content. Потрібен HTTPS-проксі або пошук HTTPS-дзеркал. Провайдери часто міняють домен —
перед плеєм перевіряти `curl -sI URL`. Скіл `/radio` тримає це в правилі оновлення `stations.sh`.

## 3. RAVE — hard/DnB/техно (німецькі + UK bass)

| # | Станція | Жанр | URL |
|---|---------|------|-----|
| 0 | HardBase.FM | hardstyle | `http://listen.hardbase.fm/tunein-mp3` |
| 1 | TechnoBase.FM | techno/hands-up | `http://listen.technobase.fm/tunein-mp3` |
| 2 | TranceBase.FM | trance | `http://listen.trancebase.fm/tunein-mp3` |
| 3 | Bassdrive | drum & bass | `http://chi.bassdrive.co:80` |
| 4 | DFM Breakbeat | breakbeat (96k aacp) | `https://dfm-breakbeat.hostingradio.ru/breakbeat96.aacp` |
| 5 | Kool FM (Rinse) | jungle/DnB | `https://admin.stream.rinse.fm/proxy/kool/stream` |
| 6 | UK Bass Radio | UK bass | `https://www.ukbassradio.com/stream` |
| 7 | Renegade 107.2 | pirate/rave | `http://149.255.60.195:8085/stream` |
| 8 | RauteMusik Techno | techno (192k) | `https://streams.rautemusik.fm/techno/mp3-192` |

## 4. MEDITATION — ambient/sleep/spa

| # | Станція | Жанр | URL |
|---|---------|------|-----|
| 0 | Deep Space One | deep ambient (SomaFM) | `https://ice1.somafm.com/deepspaceone-128-mp3` |
| 1 | Mission Control | space ambient (SomaFM) | `https://ice1.somafm.com/missioncontrol-128-mp3` |
| 2 | Synphaera | modern space (SomaFM) | `https://ice1.somafm.com/synphaera-128-mp3` |
| 3 | Ambient Sleeping Pill | sleep ambient | `https://radio.stereoscenic.com/asp-h` |
| 4 | Gentle Giant Network | ambient | `https://radio.stereoscenic.com/ggn-h` |
| 5 | Calm Radio Sleep | sleep | `https://streams.calmradio.com/api/39/128/stream` |
| 6 | DI.FM Ambient | ambient (premium?) | `http://prem2.di.fm/ambient` |
| 7 | 1.FM Spa | spa | `https://strm112.1.fm/spa_mobile_mp3` |
| 8 | Radio Paradise Mellow | mellow mix | `https://stream.radioparadise.com/mellow-128` |

---

## Зведення для апки

- **Усього:** 4 режими, **36 станцій** (8 techno + 10 ua + 9 rave + 9 meditation).
- **Транспорт:** прямі ICEcast/Shoutcast стріми → `new Audio(url)` / `<audio>`. Метаданих треку
  панель не тягне (mpv грає, waybar показує лише назву станції). ICY-метадані (`icy-metadata: 1`
  header) можна читати лише через проксі — браузер їх не віддає з `<audio>`.
- **Категорії:** techno/rave = «signal», meditation = «ambient» — лягає під наявні farm-теми
  (`rave` вже streaming-app, `ambient` — sleep/soundscape).
- **HTTPS-ризик:** UA-режим і кілька rave-стрімів — HTTP → mixed-content на HTTPS-хості.
  Для PWA потрібен HTTPS-only список або edge-проксі.
- **CORS:** SomaFM/RadioParadise/RauteMusik віддають з CORS; `<audio>` grає й без CORS
  (медіа-елемент не обмежений same-origin, але Web Audio `AnalyserNode` над крос-орідж стрімом —
  потрібен CORS, інакше tainted). Для візуалізації спектра брати лише CORS-дружні стріми.

## Джерела реєстру
- `~/.config/radio/stations.sh` — реєстр (bash arrays)
- `~/.claude/commands/radio.md` — пресети/хоткеї (`Super+M` → toggle)
- SomaFM directory: https://somafm.com/ · RauteMusik: https://www.rautemusik.fm/ ·
  Radio Paradise: https://radioparadise.com/ · Calm Radio: https://calmradio.com/
