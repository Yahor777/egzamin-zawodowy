# Смета (kosztorys) в Excel / LibreOffice Calc

37 % листов и ≈ 8 баллов: примерно 1 балл за таблицу, 3–4 — за нужные позиции, 2–3 — за формулы и формат. Экзаминатор **меняет цену или количество и смотрит, пересчиталось ли**: число вместо формулы = 0 баллов.

## 1. Порядок

1. Создай файл (Excel или Calc) и сразу сохрани: `Kosztorys.xlsx`/`.ods` на флешке `Egzamin-x`.
2. Строка заголовков точно как в «Wzór kosztorysu»: `Lp. | Nazwa usługi | Cena netto w zł | VAT w zł | Cena brutto w zł | Ilość | Wartość brutto w zł`.
3. Только услуги/детали, которые **реально были в задании** (лишние строки — минус балл). Повторяющуюся услугу — одна строка с `Ilość = 2`.
4. Цены netto — **из cennika** (числом), остальное — формулами.
5. Формулы в первой строке → протянуть вниз (маркер заполнения или Ctrl+D).
6. Сумма, rabat → формат walutowy → сохранить.

## 2. Формулы (строка 3, колонки C…G)

| Колонка | Формула | Пояснение |
|---|---|---|
| VAT w zł | `=C3*23%` или `=C3*0,23` | VAT 23 % |
| Cena brutto | `=C3+D3` (или `=C3*1,23`) | netto + VAT |
| Wartość brutto | `=E3*F3` | brutto × ilość |
| Razem | `=SUMA(G3:G7)` | сумма всей колонки |
| Rabat 10 % при > 450 zł | `=JEŻELI(G8>450;G8*10%;0)` | условие |
| Po rabacie / do zapłaty | `=G8-G9` | |
| Округление | `=ZAOKR(C3*23%;2)` | если просят «zaokrąglij» |
| Средняя | `=ŚREDNIA(C3:C7)` | |

Польский Excel и Calc: функции **SUMA, JEŻELI, ZAOKR, ŚREDNIA, MIN, MAX**, разделитель аргументов **`;`**, десятичная **запятая**. В английском: SUM, IF, ROUND, AVERAGE и `,`.

Абсолютная ссылка (не сдвигается при протягивании): `$C$1` — например, ставка VAT в отдельной ячейке: `=C3*$J$1`.

## 3. Формат

- **Format walutowy**: выделить все ячейки с деньгами (netto, VAT, brutto, wartość, суммы, rabat) → ПКМ → *Formatuj komórki* → **Walutowe**, 2 miejsca dziesiętne, symbol **zł** (Calc: *Format komórek → Waluta → PLN zł*). Księgowy тоже засчитывают.
- Иногда просят: obramowanie (*Wszystkie krawędzie*), pogrubienie nagłówków, scalenie, kolor wypełnienia, formatowanie warunkowe (*Formatowanie warunkowe → Reguły wyróżniania komórek → Większe niż…*).

## 4. Harmonogram

Таблица `Nazwa czynności | Czas wykonania [min]`, сумма `=SUMA(B2:B8)`; если просят «≤ 150 min — kolor zielony» — formatowanie warunkowe по ячейке суммы.

## 5. Ловушки

- Число, посчитанное на калькуляторе, вместо формулы.
- `=C3*23` (забыт `%`) — VAT в 100 раз больше.
- SUMA не по всем строкам (добавил строку — расширь диапазон).
- Формат «Liczbowe» с «zł», дописанным руками в текст — это текст, не число.
