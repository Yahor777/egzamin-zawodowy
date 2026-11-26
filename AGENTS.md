# Руководство для ИИ-агентов (Devin, Claude и др.)

Тренажёр к польскому экзамену **INF.02** (technik informatyk): теория, путь обучения, симуляторы
роутера/свитча/Linux/Windows 11/Windows Server с автопроверкой по критериям CKE.
Ученик — русскоязычный, учится в ZSE Rzeszów, экзамен — июнь 2027, основное устройство — **iPhone 14**.

## Ветки и PR
- Рабочая ветка проекта: **`claude/lucid-darwin-jey0v9`** (с неё публикуется сайт на GitHub Pages).
- Каждое задание: новая ветка `devin/<короткое-имя>` **от `claude/lucid-darwin-jey0v9`**, PR **в `claude/lucid-darwin-jey0v9`**.
- Не пушить напрямую в `claude/lucid-darwin-jey0v9` и `main`. Не коммитить секреты, сторонние картинки/CSS/JS.

## Структура
- `app/` — Vite + React 19 + TypeScript PWA (hash-роутер `src/router.ts`, страницы `src/pages/*`).
  - `src/sim/net.ts` — общая модель сети (L2-домены, VLAN, маршрутизация, DHCP, DNS, домен, SMB).
  - `src/sim/router/*` (TP-Link WR840N), `src/sim/switch/*` (TP-Link SG108E),
    `src/sim/draytek/*` (DrayTek Vigor2927, как в школе), `src/sim/jetstream/*` (TP-Link T2500G, как в школе),
    `src/sim/models.ts` — выбор модели.
  - `src/sim/linux/*` — симулятор Ubuntu Server (shell, netplan, isc-dhcp, apache, samba, nmcli…), без React в логике.
  - `src/sim/pc/*` — Windows 11 и Windows Server 2022 (`os: 'server2022'`): Menedżer serwera, роли, AD, DHCP, DNS,
    GPO, IIS, RRAS, общие папки/NTFS/FSRM, cmd/PowerShell (`shell.ts`, `shell-srv.ts`).
  - `src/sim/bench/*` — стол: питание, кабели, браузер Edge на ПК, диагностика «Почему не открывается».
  - `src/sim/labs/*` — полные листы CKE (`labs.ts`, `labs-more*.ts`), эталонные решения (`solutions*.ts`).
  - `src/sim/drills/*` — задания на один навык (реестр `index.ts`, решения `solutions*.ts`).
  - `src/quiz/*` — интерактивные упражнения (реестр `registry.ts`).
  - `src/path/*` — путь обучения (план до экзамена, шаги, подсказки в 3 ступени).
  - `src/sheets/*` — самооценка по критериям CKE для 52 листов.
  - `public/content/*` — данные: вопросы, заметки, `howto/*.md` (документация на русском с польскими терминами).
- `work/` — исходники анализа (тексты листов CKE, критерии, учебный план), `docs/` — план (`ROADMAP.md`),
  сверка с реальными интерфейсами (`FIDELITY.md`), аудит (`AUDIT.md`), задания для агентов (`DEVIN_TASKS.md`).
- `vm-image/` — сборка образа Debian для браузерной ВМ (CI, mmdebstrap).

## Команды (из `app/`)
```
npm ci
npx tsc -b            # типы — должно быть чисто
npm run test:sim      # все симуляторные тесты — должны быть зелёными
npm run build         # сборка
npx vite --port 5190  # dev-сервер для ручной/Playwright-проверки
```
Node ≥ 22 (тесты запускаются нативно, без tsx).

## Обязательные правила
1. Проверка заданий — **по итоговому состоянию** устройств (любой правильный способ засчитывается), а не по нажатым кнопкам.
2. Каждый новый лист/задание: эталонное решение в `solutions*.ts`, headless-тест «решение = 100 %, с нуля < 75 %».
3. Тексты интерфейса устройств — **как в реальной польской системе** (источники: уроки ZSE Rzeszów, Microsoft Learn pl-pl,
   руководства TP-Link/DrayTek; список в `work/refs/URLS.md`). Пояснения для ученика — по-русски.
4. Телефон прежде всего: на iPhone страница работает под CSS `zoom` (см. `app/index.html`), поэтому компактный режим
   определяется через `html.phone` / JS (`src/sim/bench/useCompact.ts`), а не только media queries.
   Тач-цели ≥ 44 px, поля ввода 16 px, без горизонтальной прокрутки.
5. Новые поля состояния — только необязательные (старые сохранения в localStorage должны открываться).
6. Перед PR: `tsc -b`, `test:sim`, `build` — зелёные; скриншоты Playwright (iPhone 14 и 1280 px) изменённых экранов в описании PR.
7. Дизайн спокойный: без эмодзи, неона и декоративного «ИИ-шлака».
