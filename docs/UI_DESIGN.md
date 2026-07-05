# Telemetry Logger — UI Design Document

> Снимок дизайна интерфейса текущей версии приложения. Документ описывает то,
> что есть «как оно работает сейчас». В нескольких местах помечено `TODO/возможна
> нестыковка` — это места, где код ещё в движении и финального решения нет.

---

## 1. Обзор приложения

Telemetry Logger — это локальное Windows-приложение, которое:
- слушает UDP-телеметрию F1 25 / 2026 Season Pack на `0.0.0.0:20777`,
- держит in-memory state и параллельно пишет JSON-логи сессий на диск,
- раздаёт web-фронтенд по HTTP (`http://localhost:5000` по умолчанию),
- стримит данные в браузер через SignalR-хаб `/hub/telemetry`.

Хост запускается как **WPF tray-приложение** (`TelemetryTrayApp`): иконка в трее, всплывающее окно
`TrayPopup` со ссылкой на веб-интерфейс. Самостоятельного главного окна нет — весь UI это
браузерная одностраничка `wwwroot/index.html`.

Целевой пользователь:
- сим-рейсер на F1 25 / F1 26 Season Pack,
- хочет live-дашборд во время заездов и пост-аналитику записанных сессий,
- работает с одним монитором / одной вкладкой браузера за раз.

### 1.1 Архитектура слоёв (пунктиром, чтобы понимать контекст UI)

```
F1 25  ──UDP──►  F1Telemetry.Udp  ──►  F1Telemetry.Core (State, Packets, Protocol)
                                            │
                                            ▼
F1Telemetry.Host  ─► TelemetryHub (SignalR) ─► browser (wwwroot/*)
                  └─► REST /api/*           ┘
                  └─► SessionLogger ─► Logs/F1{yy}_{track}_{date}_{time}/
```

UI берёт данные двумя путями:
- **Live** — SignalR `ReceivePacket(packetType, header, data)` + REST `GetCurrentState`.
- **History** — REST `/api/sessions*` поверх записанных JSON-логов.

---

## 2. Информационная архитектура

Глобальная навигация — четыре верхние вкладки в `header`:

| Вкладка    | Назначение                                                     | Видна всегда |
| ---------- | -------------------------------------------------------------- | ------------- |
| Live       | Дашборд из перетаскиваемых виджетов, обновляемый по SignalR   | да           |
| History    | Сетка записанных «уикэндов» + детальный вид сессии            | да           |
| Settings   | UDP / Web-порт / Dashboard / History / Developer / Game memo  | да           |
| Debug      | Счётчики пакетов, лог-консоль, DRS-зоны                       | только когда `Debug Mode` включён |

Layout приложения единый:

```
┌─ <header class="app-header"> ──────────────────────────────────────┐
│ [logo]   Live  History  Settings  [Debug?]      ● Connecting…      │
├─ <main> ───────────────────────────────────────────────────────────┤
│  <section class="tab-panel active" id="panel-live">                │
│    ┌ widget-toolbar ──────────────────────────────────────────┐    │
│    │ [Practice][Qualifying][Race][Custom]  + Add Widget  …    │    │
│    │                                       Hide Header  Lock  │    │
│    └───────────────────────────────────────────────────────────┘    │
│    <div class="grid-stack" id="dashboardGrid"> … widgets … </div>  │
│  </section>                                                        │
│  <section id="panel-history"> … </section>                         │
│  <section id="panel-settings"> … </section>                        │
│  <section id="panel-debug"> … </section>                           │
└────────────────────────────────────────────────────────────────────┘
```

`<body>` получает классы-модификаторы, которые управляют глобальным состоянием:
- `on-live-tab` — текущая вкладка Live;
- `hide-header` — пользователь спрятал шапку (только Live);
- `dashboard-debug-layout` — Debug Mode добавляет к каждому виджету бэйдж `w{n} h{n}` с
  фактическим размером в сетке (для отладки лэйаута).

### 2.1 Connection pill

В правом верхнем углу шапки — индикатор состояния SignalR (`#connectionStatus`,
`data-state`):

| state         | label             | где задаётся                  |
| ------------- | ----------------- | ----------------------------- |
| `connecting`  | «Connecting…»     | начальное HTML-состояние      |
| `connected`   | «Connected»       | `connection.start().then()`   |
| `reconnecting`| «Reconnecting…»   | `onreconnecting`              |
| `offline`     | «Disconnected» / «Connection failed» | `onclose` / catch |

Это единый источник правды о связи с хостом — отдельных тостов на разрыв нет.

---

## 3. Визуальный язык (design tokens)

Источник: [`wwwroot/css/tokens.css`](../src/F1Telemetry.Host/wwwroot/css/tokens.css).
Использование при добавлении нового UI описано в
[`docs/design-tokens-guideline.md`](design-tokens-guideline.md).

### 3.1 Палитра

Поверхности (тёмная тема, без light-режима):
- `--color-bg-base` `#0d1117` — фон страницы
- `--color-bg-surface` `#161b22`
- `--color-bg-elevated` `#21262d`
- `--color-bg-card` `#1c2128` — основные карточки виджетов
- `--color-bg-card-alt` `#1a1d26`
- `--color-bg-card-hover` `#22262f`
- `--color-bg-header` `rgba(15,17,23,0.95)` — sticky-шапка

Текст:
- `primary #e6edf3` / `secondary #8b949e` / `muted #6e7681` / `dim #5f6368`

Акцент бренда (фиолетовый):
- `--color-accent-primary` `#9b3ff5`
- варианты: `hover #b56fff`, `glow rgba(...,0.35)`, `soft 0.08`, `muted 0.12`, `border 0.30`.

Семантические сигналы (флаги, статусы, телеметрия):
- success `#3fb950`, warning `#ff8c00`, info `#58a6ff`,
- danger `#e10600` / `--semantic-red`, danger-alt `#f85149`
- accent-green `#00d700`, accent-yellow `#ffd700`, accent-orange `#ff8c00`

Телеметрические каналы (используются в виджетах, тёрнах, графиках):
- `--throttle #00d700`, `--brake #e10600`, `--ers #ffd700`, `--drs #00d0ff`

### 3.2 Spacing / Radius / Motion / Typography

| Токен          | Значения                                                          |
| -------------- | ----------------------------------------------------------------- |
| spacing        | `--space-1..6` = 4 / 8 / 12 / 16 / 20 / 24 px                    |
| radius         | `--radius-sm 4`, `--radius-md 8`, `--radius-lg 10`               |
| motion         | `--motion-fast .15s`, `--motion-normal .2s`, `--motion-slow .25s` |
| font-sans      | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …`        |
| font-mono      | `Consolas, Monaco, 'Courier New'` — числа, тайминги, RPM         |

Правила:
- цифры (тайминги лапов, скорости, RPM, gap, дельты) — всегда mono;
- лейблы виджетов и UI-чипсы — sans;
- ширины фиксированы только там, где требуются «таблоидные» цифры (стендингы, lap times).

### 3.3 Compound colours (шины)

В коде есть два разных словаря «цвета компаундов» — это нормально:
- `COMPOUND_DOT_COLORS` / `_VISUAL_COMPOUND_INFO.dot` — точечный «свежий» цвет (визуальный
  компаунд: Soft = `#ff3333`, Medium = `#ffd700`, Hard = `#e0e0e0`, Inter `#00cc00`, Wet
  `#00a6ff`). Используются в стендингах, Lap Times, Available Tyre Sets.
- `TEMP_COLORS` — цветовая шкала температурного состояния шины: cold = голубой `#00a6ff`,
  normal = зелёный `#22c55e`, perfect = фиолетовый `#b85cff`, hot = жёлтый `#eab308`,
  critical = красный `#ef4444`. Управляет fill-полоской на тёрах.

### 3.4 Иконки / SVG

Все иконки — inline SVG, без иконочного шрифта. Логотип бренда — фигурный путь в шапке
(`logo.svg`). Флаги стран загружаются по коду ISO 3166-1 alpha-2
(`/assets/flags/<CC>.svg`), маппинг из `TRACK_FLAG_MAP`.

---

## 4. Команды цветов команд и линей

`teamAccentColor(teamId, liveryColor)` возвращает цвет, который используется во всех местах,
где надо показать «принадлежность» машины: точки в Gap Ring, цветные кружки в сайдбаре Lap
Chart, цветные имена соседей, swatch'и пикеров в Compare.

Источник цвета — `liveryColours` из пакета Participants (есть и для F1 25, и для F1 26
Season Pack). Конкретный «слот» livery определяется в `getLiveryColourSlot(gameYear,
teamId)`:
- по умолчанию слот 0;
- override: F1 25 / Haas → слот 1 (нулевой слот красный, Ferrari-подобный).

Если игра не прислала livery, fallback — нейтральный `#F5F5F5`. **Никогда не хардкодим
цвета команд/драйверов** — это противоречит решению, зафиксированному в auto-memory.

---

## 5. Глобальные UI-паттерны

### 5.1 Карточка виджета

Любой live-виджет рендерится в общую обёртку:

```html
<div class="widget-wrapper" data-widget-id="{id}">
  <div class="widget-header">
    <span class="widget-drag-handle">⠿</span>
    <span class="widget-header-title">{title}</span>
    <span class="widget-grid-size"></span>     <!-- виден только в Debug Mode -->
    {headerExtra}                              <!-- per-widget shortcuts -->
    <button class="widget-close-btn">✕</button>
  </div>
  <div class="widget-body">…template content…</div>
</div>
```

Особые шапки (`headerExtra`):
- **events** — кнопка фильтра событий (полигон-«воронка»).
- **session** — шестерёнка «настройки видимых полей».
- **pitPredictor** — часы «времена пит-стопа по всем трассам».
- **tyres** / **tyreSets** — `?` с легендой.
- **lapData** — переключатель «vs Prev / vs PB» + легенда мини-полос.

### 5.2 Tabs (sub-navigation в History)

В детальном виде сессии — вертикальный sidenav слева:
`Lap Times / Lap Chart / Telemetry Compare / Events`.
Вкладка **Lap Chart** скрыта, пока не доказано, что сессия гоночная (см. §7).

### 5.3 Modal / Picker

- **Session picker** (по клику на карточку уикэнда с >1 сессий) — overlay
  `.history-modal-overlay` с заголовком (флаг + название трассы) и списком сессионных строк
  (название типа + дата). Закрывается по `Esc`, клику на бэкграунд, кнопке `×`.
- **Pit times settings** — попап `pit-times-panel` (полная таблица трасс с inline-инпутом
  пит-таймов).
- **Event filter** — попап чек-боксов (List/All/None) с привязкой к кнопке фильтра.

### 5.4 Toggle-switch

Унифицированный «pill»-свич с классом `.toggle-switch` (на тулбаре Live —
`.toggle-switch-toolbar`). Используется в:
- header-toggle «Hide Header»,
- toolbar-toggle «Lock Layout»,
- Settings: Auto-switch Preset, Session Logging, Debug Mode,
- Debug-консоль: Auto-scroll.

### 5.5 Buttons

Базовые классы: `.btn`, `.btn-small`, варианты `.btn-primary`, `.btn-secondary`,
`.btn-danger`, `.btn-ghost`. Sentry-кнопки в шапке виджетов (`.widget-close-btn`,
`.event-filter-toggle`, `.tyre-info-btn`, `.ld-ref-toggle`) — отдельные пайдинги, иконка
+ текст или эмодзи.

Дисклеймер по «restart required»: для `webPort` под полем появляется бэйдж
`Restart required` — настройка применится только после перезапуска приложения.

### 5.6 Empty / Loading / Error states

Унифицировано:
- *Loading*: `<div class="history-empty"><p>Loading…</p></div>` или `Waiting for …` в
  плейсхолдере виджета.
- *Empty*: иконка-эмодзи (`📊`, `🔍`) + заголовок + описание.
- *Error*: тот же контейнер, текст с конкретным сообщением. Settings и History показывают
  ошибку прямо в форме (под полем) — без всплывающих тостов.

---

## 6. Live-вкладка

Это «работа сейчас» — самая сложная по UI часть.

### 6.1 Тулбар

```
┌ widget-toolbar ──────────────────────────────────────────────────────┐
│ [Practice][Qualifying][Race][Custom]  [+ Add Widget]  [Save][Undo]   │
│                                              Hide Header  Lock Layout │
└──────────────────────────────────────────────────────────────────────┘
```

- **Preset selector** — четыре пресета лэйаута: `practice`, `qualifying`, `race`, `custom`.
  Активный — фиолетовый. Сохраняются в `localStorage` (`f1telemetry_presets_v2`,
  `f1telemetry_active_preset_v1`).
- **Auto-switch** — если в Settings включён `Auto-switch Preset`, при смене
  `m_sessionType` фронт сам подберёт пресет (`SESSION_TYPE_TO_PRESET`). Любой ручной
  клик по пресету «глушит» авто-свич до перезагрузки страницы.
- **Add Widget** — открывает дропдаун со списком всех 17 виджетов (`WIDGET_REGISTRY`).
  Уже добавленные отмечены галкой; клик переключает (добавляет/удаляет).
- **Save Preset / Undo** — появляются, когда текущий лэйаут отличается от сохранённого
  (dirty). «Saved» подсвечивается зелёным на 1.5 с. Undo возвращает к сохранённому.
- **Hide Header** — убирает шапку приложения целиком (для записи стрима с одним
  дашбордом). Состояние в `f1telemetry_hide_header_v1`.
- **Lock Layout** — отключает drag/resize у grid-stack'а и прячет кнопки `✕` и
  drag-handle (`f1telemetry_lock_layout_v1`).

### 6.2 Grid-stack

Сетка построена на [gridstack.js 10.3.1](https://gridstack.js/):

| Параметр       | Значение |
| -------------- | -------- |
| column         | **24**   |
| cellHeight     | 30 px    |
| margin         | 8 px     |
| handle         | `.widget-drag-handle` |
| float          | true     |
| animate        | true     |

Размер карточки задаётся в `WIDGET_REGISTRY[id]`:

| id                | title                  | дефолт `w × h` | мин |
| ----------------- | ---------------------- | --------------- | --- |
| session           | Session                | 4×9             | 1×1 |
| telemetry         | Car Telemetry          | 6×9             | 1×1 |
| tyres             | Tyres                  | 5×12            | 1×1 |
| tyreSets          | Available Tyre Sets    | 7×14            | 1×1 |
| pitPredictor      | Pit Stop Predictor     | 6×6             | 1×1 |
| fuelErs           | Fuel & ERS             | 6×7             | 1×1 |
| lapData           | Lap Data               | 4×9             | 1×1 |
| damage            | Damage                 | 4×5             | 1×1 |
| events            | Events                 | 8×6             | 1×1 |
| standings         | Standings              | 10×10           | 1×1 |
| weather           | Weather Forecast       | 8×8             | 1×1 |
| gapBoard          | Gap Board              | 8×7             | 1×1 |
| gapRing           | Gap Ring               | 6×16            | 1×1 |
| qualiStandings    | Quali Standings        | 10×10           | 1×1 |
| topSpeed          | Session Top Speeds     | 8×10            | 1×1 |
| topSpeedCompare   | Top Speed Comparison   | 4×10            | 1×1 |
| lapTimes          | Lap Times              | 10×10           | 1×1 |
| pitStopTimer      | Pit Stop Timer         | 4×9             | 1×1 |

Шаблоны HTML лежат в `<template id="tpl-…">` внутри `index.html`. JS-функции
`addWidget` / `removeWidget` / `applyLayout` создают `<div>` с клонированным content и
вызывают `wireWidgetEvents` для специфичных подписок (например, инициализация
event-фильтра в Events).

### 6.3 Поток обновления виджетов

Один shared `signalR.HubConnection` (см. `__f1TelemetryOnConnection`). Debug-консоль не
открывает отдельный сокет, а подписывается на тот же.

```
connection.on("ReceivePacket", (packetType, header, data) => {
    PACKET_HANDLERS[packetType]?.(data, header)
})
```

`PACKET_HANDLERS` маршрутизирует:

| packetType          | UI-функция                                                   |
| ------------------- | ------------------------------------------------------------ |
| `Session`           | `updateSession` → Session, Weather Forecast, sessionProgress, флаги, лайтоны Lap Times |
| `CarTelemetry25`    | `updateCarTelemetry25` → RPM, gear, скорость, педали, DRS    |
| `CarTelemetry26`    | `updateCarTelemetry26` → то же + Active Aero / Overtake / 2026 REGS / Wrong Way |
| `CarStatus`         | `updateCarStatus` → mix, ERS store/deploy/harvest, тёрс компаунд, fitted |
| `CarSetups`         | `updateCarSetups` → diff on throttle, brake bias setup       |
| `LapData`           | `updateLapData` + standings + gap ring + gap board + Lap Data widget + top-speed leaderboard |
| `CarDamage`         | `updateCarDamage` → бары damage                              |
| `Participants`      | `updateParticipants` → имена, командные цвета                |
| `Event`             | `updateEvent` → events list, прикреп penalty, served         |
| `TyreSets`          | `updateTyreSets` → панель tyres                              |
| `SessionHistory`    | `updateSessionHistory` → Lap Times для всех машин            |
| `TimeTrial`         | `updateTimeTrial` → time-trial-специфика                      |

Отдельные методы хаба (`GetCurrentState`, `GetSetupSnapshots`, `GetTyreSnapshots`)
вызываются один раз на `start()` и на `onreconnected`, чтобы получить «полный кадр»
текущей сессии без потери UI на ребуте сервера.

### 6.4 Каталог виджетов

Ниже — карта «что показывает» каждый виджет. Точные DOM-id и стили — в `index.html` и
`style.css`.

#### Session
Грид 7 «stat-box» полей: Track (с флагом), Session (тип), Weather (эмодзи + текст),
Track Temp / Air Temp (с трендом-стрелкой), Time / Laps (адаптивный лейбл — `Time` для
practice/quali/TT, `Laps` для race), Flags (цветной прямоугольник). Видимостью полей
управляет шестерёнка в шапке (массив `SESSION_FIELDS`, сохраняется
`f1telemetry_session_fields_v1`). Состояние трекового флага вычисляется из
`marshalZones[].zoneFlag` + `safetyCarStatus` — приоритет RED > SC > VSC > YELLOW >
FORMATION > BLUE > GREEN.

#### Car Telemetry
Главный «driving» виджет:
- **RPM strip** — горизонтальная полоса с тремя сегментами (green / gradient / red),
  обрезается по «лит-проценту» (`--rpm-pct`). Под полосой mono-строка `0 RPM`.
- **Middle row** — DRS tile, опциональные tile'ы для F1 26 (Active Aero, Overtake, 2026
  Regs marker, Wrong Way), Pit Limiter, gear (большой числовой/«N»/«R»), Speed (большая
  цифра + KM/H), правый столбец метрик (`BB` — front brake bias из CarStatus, `DIFF` —
  diff on throttle из CarSetups).
- **Pedals panel** — компактный SVG-график истории throttle/brake (последние ~3 с) и
  две вертикальные полосы (throttle зелёный, brake красный) с подписями %.

#### Tyres
Квадратная 2×2 раскладка углов FL/FR/RL/RR (`.tc[data-tyre-corner]`). На каждом углу:
- цветной `tc-fill` фон, прозрачный по температуре поверхности (см. §3.3);
- две температуры — surface (заполненный кружок) и inner (контурный кружок);
- износ % (центральное число);
- блистеры (строка `Blisters …`);
- давление в psi.

Внизу — `tyre-info-row` с компаундом (точка + сокращение S/M/H/W/I, температурный
диапазон, возраст в кругах). Кнопка `?` в шапке открывает легенду с шкалой температур
и поясняющим текстом.

#### Available Tyre Sets
Запись «текущий fitted» + сетка групп по компаундам. Каждая «таблетка» — отдельный
набор шин: возраст, износ, прогноз grip (`formatTyreSetGrip`). Выводится только для
playerCarIndex.

#### Pit Stop Predictor
- Поле «Pit Time (s)» с кнопкой Save, статус сохранения. Pit-time персистится в
  `wwwroot/data/pit-times.json` через `PUT /api/pit-times/{trackId}` (трэк = текущая
  Session).
- Шестерёнка в шапке открывает «pit times для всех трасс» — full-list таблица.
- Прогноз: «Predicted Position» (большая цифра), карточка «Car Ahead» / «Car Behind»
  (имя водителя + gap), расчёт идёт из текущего gap + pit-time.

#### Fuel & ERS
Двухсекционная карточка:
- **FUEL** — текущий fuel-mix (badge), `Δ vs target` (если предсказание доступно),
  «In tank» и «Laps» (запас в кругах). Цвет badge по `data-mix`.
- **ERS** — режим (`data-mode`: 0..3 = Off / Medium / Hot / Overtake), три «бара»: Store,
  Deploy / lap, Harvest / lap.

#### Lap Data
Самый информативный виджет per-lap:
- Блок «Last Lap» — крупное время + дельта vs ref + мини-полоса с историей (вертикальные
  риски).
- Три «Sector» блока (S1/S2/S3) — каждый со своей дельтой и мини-полосой.
- Блок «Current Lap» — текущее время + предикт «est. finish» + бэйдж `INV`, если круг
  invalid.

Тоггл `vs Prev / vs PB` (кнопка `Reference`) выбирает ref-круг. Кнопка `?` показывает
объяснение цветов (purple = personal best, green = улучшение, red = ухудшение, white =
≈ratio).

#### Damage
6 горизонтальных баров: FL Wing / FR Wing / Rear Wing / Floor / Engine / Gearbox.
Цвет fill идёт от зелёного (0%) к красному (100%).

#### Events
Список событий с серверного потока (см. §6.3, `EVENT_NAMES`). Каждая строка:
- цветной 2-символьный код события (`EVENT_CODE_COLORS`),
- имя события + детали (имя водителя, время лапа, скорость, и т. п.),
- timestamp (для race/TT в лапах; для остальных в session-time).

Закреплённые штрафы (PENA с типом 0/1/4) визуально выделяются и автоматически
«отлипают», когда приходит DTSV/SGSV (penalty served).

Фильтр (`f1telemetry_event_filter_v1`) — попап с чек-боксами для каждого кода;
по умолчанию `BUTN` (button status) выключен, остальные включены.

#### Standings (Race)
Таблица: `Pos / Driver / Gap / Last Lap / Tyre / Pit`. Игрок выделен `player-row`.
Шина — badge с двухбуквенным компаундом + цифра возраста. Pit-status: «Pitting» / «In Pit».

#### Quali Standings
Похожая таблица, но колонки: `Pos / Driver / Best Lap / Gap / Delta / Status /
S1 / S2 / S3`. Сектора подсвечиваются (best of session / personal best / regular) — это
типовая F1-«пурпурная/зелёная» подсветка.

#### Weather Forecast
- `Accuracy: Perfect / Approximate` (`forecastAccuracy`).
- Горизонтальный таймлайн карточек, по одной на семпл прогноза, релевантных текущей
  сессии. На карточке: смещение (`Now`, `+5m`, `+10m` …), иконка погоды, лейбл,
  rain%, track/air temp с трендом-стрелкой.

#### Gap Board
Двухколоночный список «впереди» / «позади» игрока с интервалами в секундах. Цвета
имён — командные.

#### Gap Ring
Круговая SVG-визуализация позиций на трассе:
- внешнее кольцо с точками = драйверы (точка = командный цвет, размер у player увеличен);
- spoke'и от центра к каждому;
- три «текстовых пояса»: snaружи — gap to leader, средний — driver-аббревиатура (3 буквы),
  внутри — interval to car ahead;
- маркер `S/F` (Start/Finish) вверху;
- в центре карточки — компактный блок: имя+gap соседа сверху, ник игрока (P{pos} ABC),
  имя+gap соседа снизу.

Размеры шрифтов адаптируются под количество машин (>12 / >16).

#### Top Speed (Session Top Speeds)
Лидерборд по максимальной скорости в сессии. Игрок подсвечен `player-row`.

#### Top Speed Comparison
Три блока: «Session best» / «Last lap» / «This lap» (live). С каждым — дельта (+/− vs
session best, или vs last lap). Метка `PB` если совпадает с сессионным максимумом.

#### Lap Times
Таблица всех кругов всех гонщиков с серверного `SessionHistory`. Колонки: `# / Car / Lap /
S1 / S2 / S3 / Setup`. По клику на иконку `Setup` выскакивает popover с заголовком
«Setup snapshot for lap N» — текущий setup из `LapSetupStore`. Аналогично tyre-popover.

Раскладка адаптируется по типу сессии (race / quali / practice / TT) — см. §7.3 — общая
табличная семантика та же, но для TT убраны колонки шин (нет износа в TT-режиме).

#### Pit Stop Timer
Сверху два «stat-box» — текущие Pit Lane / Pit Stall (живой счётчик секунд). Снизу
таблица истории пит-стопов: `# / Lap / Lane / Stall`.

---

## 7. History-вкладка

Имеет два режима: список и детальный вид. Переключение прячет/показывает
`#historyListView` и `#historyDetailView`.

### 7.1 Тулбар списка

```
┌ history-toolbar ─────────────────────────────────────────────────┐
│ Source folder: [ Logs                ]  📁 Select Folder  [Reset]│
│ Track: [All] Game: [All] From: [date] To: [date]  [Clear filters]│
└──────────────────────────────────────────────────────────────────┘
```

- **Source folder** — какой каталог сейчас читается. Имеет два варианта:
  - persistent default (из Settings → History folder, идёт через
    `HistoryRoot.PersistentDefault`),
  - per-session override через `POST /api/sessions/source` (не персистится).
  Badge `custom` появляется, когда сейчас включён override. Reset возвращает к
  persistent default.
- **Select Folder** — `POST /api/sessions/source/browse`. На tray-хосте открывает
  нативный WPF folder picker; на headless / при ошибке — фронт показывает
  `window.prompt('Enter the absolute path …')`.
- **Фильтры** — Track / Game (F1 25 / F1 26) / From / To. Все фильтруют клиентский
  список после fetch, без повторного запроса.

### 7.2 Список уикэндов (карточки)

`GET /api/sessions` возвращает массив:

```json
[{
  "folder": "F125_Spa_2026-04-12_18-30",
  "trackId": 10, "trackName": "Spa",
  "gameYear": 25, "formula": 0, "formulaName": "F1 Modern",
  "sessions": [
    { "slug": "race", "typeName": "Race", "savedAt": "2026-04-12T18:30:00Z" }
  ]
}]
```

Каждый weekend — `.history-card`:
- Заголовок: флаг (по `TRACK_FLAG_MAP[trackId]`) + название трассы;
- Теги: `F1 25` / `F1 Modern` / `Race` / `Q3` …;
- Дата (первой сессии);
- В правом верхнем углу — иконка «открыть в Explorer» и «удалить».

Удаление — `DELETE /api/sessions/{folder}` с подтверждением через `confirm`. UI
делает оптимистичное затемнение карточки до ответа.

Если в уикэнде ровно одна сессия — клик по карточке открывает её детальный вид. Если
больше — `openSessionPickerModal` показывает список сессий уикэнда для выбора.

### 7.3 Детальный вид сессии

```
History  ←  All Sessions  /  Spa  /  Race
┌─ sidenav ───┬─ history-detail-body ─────────────────────────┐
│ Lap Times  ●│  …                                            │
│ Lap Chart  ○│                                               │
│ Compare    ○│                                               │
│ Events     ○│                                               │
└─────────────┴───────────────────────────────────────────────┘
```

- **Breadcrumb**: `← All Sessions` / `{weekend}` / `{sessionType}`.
- **Actions bar** (рисуется через `ensureActionsBar`) — экспорт сессии в JSON, импорт
  ghost'а, и т. п.
- **Lap Chart** скрывается, пока `isRaceSession()` не вернёт true (для квали / FP /
  TT эта вкладка не имеет смысла). На init опера показывает «Loading…».
- Внутреннее состояние (`state.driverSelection`, `compareState`, `lapSamplesCache`) —
  module-local, поэтому переключение на Live и обратно не теряет выбранные ref-круги.

#### Lap Times

Сводный pivot:
- категория сессии резолвится через `resolveSessionCategory(meta)` — practice / qualifying
  / race / time_trial;
- `Race` сортирует драйверов по итоговой позиции (с учётом DNF/DSQ/Retired);
- `Practice / Qualifying` — по `finalClassification.position`, fallback к best-lap order;
- `TT` — одиночный драйвер.

Колонки зависят от категории; quali дополнительно показывает «virtual best» (best S1 +
best S2 + best S3 для каждой машины). Best-of-session и personal best подсвечиваются
по F1-конвенциям (purple / green).

`redFlagClearedAfterLap` определяет, после какого лапа была отмена красным флагом
лучшего времени — соответствующие круги становятся стандартными чёрно-белыми.

#### Lap Chart (Positions) — **только race**

Прокручиваемая SVG-диаграмма позиций по кругам (одна линия = драйвер, цвет = команда).
Слева — sidebar со списком драйверов и «глазком» (показать/скрыть линию). Сверху —
легенда (`SC`, `VSC`, `Red Flag`, `Pitstop`). При узких экранах подключается вертикальный
pan-слайдер (`#posChartVRange`).

`positionChartTotalLaps` берёт максимальный завершённый лап (а не `meta.totalLaps`),
потому что в F1 25 SessionPacket.TotalLaps на +1 длиннее реальной гонки — это закреплено
в auto-memory `project_f125_totallaps_offbyone`.

#### Telemetry Compare

Раскладка: `tc-side` (драйвер-пикер + sector-badges + панель настроек) | `tc-main` (стек
графиков) | `tc-rail` (track map + insights panel).

- **Drivers / laps picker** — отдельный модуль `HistoryDetail.DriverPicker`. Поддерживает
  выбор одного REF-круга (фиолетовая обводка) и нескольких compare-кругов.
- **Sector badges** — кнопки `S1 / S2 / S3` (или их suB-deltы — splits 9 или 12) zoom'ят
  графики до этого диапазона.
- **Toolbar** в сайде разбит на секции:
  - View — `Cumul. / Per Sec.` (delta-режим), Split (3/9/12), Zoom (`Reset`, `+2×`, `-2×`).
  - Sectors — кнопки секторов.
  - Channels — чипсы метрик (Δ / Speed / Throttle / Brake / Steering / Gear / RPM /
    ERS / DRS); кликом скрываем/показываем.
  - Display — `Values / Delta` (формат чипов на hover), Size preset (Compact / Normal /
    Tall, иконки), Insights On/Off.
- **Chart stack** — общий X (lap distance в метрах). На каждой метрике своя y-шкала,
  горизонтальная сетка, цветные линии по драйверам, hover-crosshair с чип-значениями.
  Sample-данные — `GET /api/sessions/{folder}/{slug}/lap-samples?carIdx=&lap=`. Клиент
  кеширует (`lapSamplesCache`) и инкрементирует `reloadGeneration`, чтобы поздний
  ответ не перезаписывал актуальные данные.
- **Track map** — SVG-проекция с моторными точками. Слои переключаются: `line`,
  `deltaHeat`, `events`, `dominance`, `loss`. Камера: pan/zoom, follow-cursor mode,
  снапшот настроек персистится в `localStorage['tcCompareUi']`.
- **Hover bridge** — единая точка X между chart-stack и map: hover на графике двигает
  маркер на карте и наоборот.

UI намеренно «компактный»: верхняя toolbar — узкая колонка, чтобы не съедать place под
графики и карту.

#### Events

Таблица `Time / Lap / Event / Driver / Details`. Сверху — кнопка-фильтр (отдельный ключ
`f1telemetry_event_filter_history_v1`, чтобы не смешивать с Live) и `search` по водителю.
Цветовые коды и `PENALTY_TYPES / INFRINGEMENT_TYPES` дублируют live-версию, но
рендерятся в табличном виде, а не списком.

---

## 8. Settings-вкладка

Структура — пять групп карточек на вертикальном скролле:

1. **UDP Connection**
   - UDP Listen IP (по умолчанию `0.0.0.0`),
   - UDP Listen Port (по умолчанию `20777`),
   - UDP Format — селект формата (`""` = Auto = newest registered plugin; явно `2025`
     или `2026`).
2. **F1 25 — telemetry in game** — memo-таблица с рекомендуемыми значениями игрового
   меню. Под таблицей — `Game version` select + кнопка **Auto-configure**: пишет блок
   `<udp>` в `Documents/My Games/F1 25/hardwaresettings/hardware_settings_config.xml`.
   Дополнительно показывается warning «закройте игру перед применением», иначе F1 25
   перезапишет XML на выходе.
3. **Web Server** — Web Port + бейдж `Restart required`.
4. **Dashboard** — Auto-switch Preset (по сессии).
5. **History** — Session Logging toggle + History Folder (текстовое поле + Browse… +
   Reset; под полем — `Resolved: …` и опциональная ошибка).
6. **Developer** — Debug Mode toggle.

Все настройки автосохраняются через debounce 400 мс (`autoSaveSettings`). При ошибке
сохранения History Folder ошибка показывается прямо под полем.

---

## 9. Debug-вкладка

Доступна только при включённом Debug Mode.

### 9.1 Packet stats + console (левая/правая колонка)
- Total Packets (counter) + список «PacketName: count» (отсортирован по убыванию).
- Console: live-поток `DebugPacket` с временной меткой и именем. Хранится до 2000
  записей; есть auto-scroll, Clear, Download Log, Reset.

> **DRS-зоны.** Ранее здесь был инспектор DRS Zones с автозахватом по кругам и кнопкой
> `Re-capture`. Он удалён: зоны берутся напрямую из статических геометрий трасс
> `wwwroot/data/track-geometry/{trackId}.json` (поля `drsZones` и `xModeZones`). По версии
> игры выбирается нужный набор — DRS (формат ≤ 2025) или Straight Mode / active-aero
> (`xModeZones`, формат 2026+). Их же рисует 3D-карта трассы.

---

## 10. Контракты данных (UI side)

### 10.1 SignalR

Хаб: `/hub/telemetry`. Реконнект-расписание `[0, 1000, 2000, 5000, 10000]`. Уровень
логирования — `Warning`.

| Метод (S→C)               | Сигнатура                                                                 |
| ------------------------- | ------------------------------------------------------------------------- |
| `ReceivePacket`           | `(packetType: string, header: TelemetryPacketHeader, data: object)`       |
| `ReceiveSetupSnapshot`    | `(carIndex: byte, lapIndex: int, setup: object)`                          |
| `ReceiveTyreSnapshot`     | `(carIndex: byte, lapIndex: int, snapshot: object)`                       |
| `DebugPacket`             | `(data: object)` — только для Debug-консоли                                |

| Метод (C→S)               | Сигнатура                                  |
| ------------------------- | ------------------------------------------ |
| `GetCurrentState()`       | `Dictionary<packetType, latest data>`      |
| `GetSetupSnapshots(carIdx)` | snapshots по lap                          |
| `GetTyreSnapshots(carIdx)` | snapshots по lap                           |

Хаб использует CamelCase JSON, и кастомные конвертеры для NaN/Infinity → null
(`FiniteSingleJsonConverter` / `FiniteDoubleJsonConverter`).

### 10.2 REST (то, что использует UI)

| Метод | Endpoint                                                | Где используется UI |
| ----- | ------------------------------------------------------- | ------------------- |
| GET   | `/api/health`                                           | (не используется фронтом) |
| GET   | `/api/info`                                             | (служебный)         |
| GET   | `/api/state`                                            | (служебный)         |
| GET   | `/api/state/{packetType}`                               | (служебный)         |
| GET   | `/api/settings`                                         | Settings + connection-pill / auto-switch init |
| POST  | `/api/settings`                                         | Settings autosave   |
| POST  | `/api/game/configure-udp`                               | Settings: «Auto-configure» |
| GET   | `/api/pit-times` / `/api/pit-times/{trackId}`           | Pit Stop Predictor   |
| PUT   | `/api/pit-times/{trackId}`                              | Pit Stop Predictor + pit-times панель |
| GET   | `/api/debug/stats`                                      | Debug: счётчики      |
| GET   | `/api/debug/log` / `…/download`                         | Debug: download log  |
| POST  | `/api/debug/reset`                                      | Debug: reset stats   |
| GET   | `/api/sessions`                                         | History: список уикэндов |
| GET   | `/api/sessions/{folder}/{slug}`                         | History: детальный JSON |
| GET   | `/api/sessions/{folder}/{slug}/laps`                    | (запасной путь, фронт чаще берёт laps из detail) |
| GET   | `/api/sessions/{folder}/{slug}/lap-samples?carIdx&lap`  | Telemetry Compare    |
| GET   | `/api/sessions/{folder}/{slug}/events`                  | History: вкладка Events |
| GET   | `/api/sessions/{folder}/{slug}/export?carIdx`           | actions bar: «Export driver» |
| POST  | `/api/history/import?folder&slug`                       | actions bar: «Import ghost» |
| GET   | `/api/sessions/{folder}/{slug}/track-svg`               | Compare/Lap Chart background |
| GET   | `/api/sessions/{folder}/{slug}/ghosts`                  | список загруженных ghost'ов |
| POST  | `/api/sessions/open-folder`                             | «открыть папку в Explorer» |
| DELETE| `/api/sessions/{folder}`                                | удалить уикэнд        |
| GET   | `/api/sessions/source`                                  | History toolbar        |
| POST  | `/api/sessions/source` / `…/browse`                     | History toolbar + Settings |

### 10.3 Локальное состояние (`localStorage`)

| Ключ                                       | Что хранит                                  |
| ------------------------------------------ | ------------------------------------------- |
| `f1telemetry_presets_v2`                   | сохранённые лэйауты по пресетам              |
| `f1telemetry_active_preset_v1`             | активный пресет                              |
| `f1telemetry_autoswitch_v1`                | auto-switch preset (включено/выключено)      |
| `f1telemetry_lock_layout_v1`               | lock layout toggle                           |
| `f1telemetry_hide_header_v1`               | hide-header toggle                           |
| `f1telemetry_session_fields_v1`            | видимость полей Session widget               |
| `f1telemetry_session_field_order_v1`       | порядок полей Session widget                 |
| `f1telemetry_event_filter_v1`              | фильтр Events (Live)                         |
| `f1telemetry_event_filter_history_v1`      | фильтр Events (History) — намеренно отдельный |
| `f1telemetry_gameversion_v1`               | выбранная версия игры в Settings memo        |
| `tcCompareUi`                              | UI-state Telemetry Compare (метрики, scale, map…) |

---

## 11. Особенности и приёмы, важные для будущей работы

- **HideHeader / LockLayout** действуют только на Live. Они нужны под запись стрима с
  фиксированным дашбордом.
- Все live-виджеты делают «cold render» из плейсхолдера `Waiting for …` и обновляются
  по мере прихода первых пакетов. Не нужно бороться с «мерцанием» — пустое состояние
  это нормально.
- Тёмная тема единственная. Светлой нет, и не планируется (вечером гоняют, ярко в глаз
  не надо).
- Числа всегда mono. Лейблы — UPPERCASE small (`stat-label`, `tc-stb-label`,
  `cs-micro-label` и т. п.).
- Tray-приложение никогда не закрывается при минимизации браузера: web-host работает
  независимо, иконка остаётся.
- Хост сериализует CamelCase, поэтому фронт читает поля как `trackId`, `sessionType`,
  `carPosition`, `lapTimeInMs`, и т. д. — все поля F1 UDP-спецификации в нижнем верблюде.
- Цвет команд **всегда** через `extractLiveryColor(participant, gameYear)` + override
  слот; запрет хардкодить цвета — закреплено в auto-memory
  `project_livery_colours_primary`.
- F2 (formula 2) логи 2020+ — у них `PitReleaseTemperature = 0 K`, потому что **F2
  отказался от тёрс-уормеров**. Виджет шин это учитывает (не показывает «холодный»
  warning сразу после выезда из пита). Тоже в auto-memory `project_f2_no_tyre_warmers`.

---

## 12. Известные несогласованности / TODO

(Поля, которые сейчас могут «протекать» между состояниями; уточнить, если будет нужно
финальное решение.)

- **Format2025 / Format2026 переименование** — на момент написания docs ветка main
  держит миграцию `F125 → Protocol.Format2025/2026`. Внутри `index.html` всё ещё
  встречается заголовок `2026 REGS` в Car Telemetry и подсказка
  `format 2026` — это намерено и оставлено как маркер «новый формат», но если в
  будущем появится формат 2027, понадобится унифицировать названия (telemetry.js и
  README уже на это намекают комментарием в начале справочников).
- **`DEFAULT_GAME_VERSION` в Settings memo жёстко `f1_25`** — есть `gameVersionSelect`,
  но в html сейчас один option `F1 25`. Логика готова к добавлению F1 26, нужно лишь
  пополнить XML-путь и опцию.
- **GameMode lookup** (`GAME_MODE_NAMES`) и часть полей (`pitLimit`, `aiLevel`,
  `equalCars`) присутствуют как поля видимости Session, но в карточке Session ещё
  опциональны — UI плавно разрастается, и какие поля считать «дефолтно
  показанными» — открытый вопрос.

---

## 13. Где что лежит

| Раздел              | Файл                                                    |
| ------------------- | ------------------------------------------------------- |
| HTML каркас + tpl   | `src/F1Telemetry.Host/wwwroot/index.html`               |
| Дизайн-токены       | `src/F1Telemetry.Host/wwwroot/css/tokens.css`           |
| Общие компоненты    | `src/F1Telemetry.Host/wwwroot/css/app.css`              |
| Виджет-стили        | `src/F1Telemetry.Host/wwwroot/css/style.css`            |
| Tabs / Settings / History list / Debug | `wwwroot/js/app.js`                  |
| Реестр виджетов + пресеты + gridstack | `wwwroot/js/widgets.js`               |
| Все Live-виджеты    | `wwwroot/js/telemetry.js`                               |
| History detail view | `wwwroot/js/historyDetail.js`                           |
| Telemetry Compare   | `wwwroot/js/telemetryCompare.js`                        |
| SignalR контракт    | `src/F1Telemetry.Host/Hubs/TelemetryHub.cs`             |
| REST endpoints      | `src/F1Telemetry.Host/Program.cs`                       |
| Tray-приложение     | `src/F1Telemetry.Host/Tray/TelemetryTrayApp.cs`         |

---

## 14. Изменение / добавление UI — короткий чек-лист

1. Новый виджет → добавить `<template id="tpl-{id}">` в `index.html`, запись в
   `WIDGET_REGISTRY` (title + дефолтный grid размер) и handler в `wireWidgetEvents`,
   если нужны специальные подписки.
2. Новый пакет → добавить в `PACKET_HANDLERS` (telemetry.js) функцию `update{X}` и
   обновлять только те DOM-элементы, которые есть в активных виджетах.
3. Новый цвет / spacing → только через токены из `tokens.css`. Не хардкодить hex
   в `style.css`, кроме уж совсем case-by-case графиков.
4. Новые поля в settings → добавить input в html, маппинг в `loadSettings` /
   `autoSaveSettings`, поле в `SettingsUpdateRequest` (Program.cs), сохранение в
   `appsettings.user.json`.
5. Любой текст для пользователя — по-прежнему английский (фронт). Русским пишем только
   код-комментарии / docs.
