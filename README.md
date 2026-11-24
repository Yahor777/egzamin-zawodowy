# INF.02 Trener

Бесплатное приложение (PWA) для подготовки к экзамену **INF.02** (technik informatyk, formuła 2019).
Работает в браузере на ПК и телефоне, ставится как приложение, работает офлайн.

## Что уже есть

- **1456 уникальных вопросов** из официальных листов CKE (E.12, E.13, EE.08, 2013–2024) с официальными ключами ответов, с картинками.
  Вопросы, аннулированные CKE, исключены. Повторы объединены (видно, сколько раз вопрос был на экзамене).
- **Учёба** с интервальными повторениями (ошибки возвращаются через несколько минут, выученное — через дни).
- **Пробный экзамен**: 40 вопросов, 60 минут, порог 50%, разбор ответов.
- **Мои ошибки**, **избранное**, **статистика по темам**.
- **Тренажёры без конца**: подсети и маски, системы счисления и U2, `chmod` — с пошаговым объяснением.
- Интерфейс **RU / PL**. Перенос прогресса телефон ↔ ПК кодом (Настройки).

## План

См. [docs/PLAN.md](docs/PLAN.md).

## Структура

```
app/                 приложение (Vite + React + TypeScript, PWA)
  public/data/       база вопросов (questions.json)
  public/img/        рисунки к вопросам
tools/parse_sheets.py   PDF листов CKE + ключи → questions.raw.json + рисунки
tools/build_bank.py     дедупликация, темы → app/public/data/questions.json
```

## Запуск локально

```bash
cd app && npm install && npm run dev
```

## Пересборка базы вопросов

Исходные PDF — официальные листы CKE (например, из открытого репозитория ZSGrojec/Egzamin-Zawodowy).

```bash
pip install pymupdf pillow   # нужен также poppler-utils (pdftotext)
python3 -I tools/parse_sheets.py <папка с E.12/E.13/EE.08> /tmp/parsed
python3 -I tools/build_bank.py /tmp/parsed app/public
```

## Публикация

GitHub Actions (`.github/workflows/pages.yml`) собирает `app/` и публикует на GitHub Pages.
Один раз включить: **Settings → Pages → Source: GitHub Actions**.
