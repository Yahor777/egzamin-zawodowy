# Kosztorys w Excelu / LibreOffice Calc krok po kroku

`Kosztorys` to tabela, w której cena bez podatku (`netto`) jest przeliczana na cenę z podatkiem (`brutto`). Na egzaminie sprawdzane są nie tylko liczby, ale też **formuły**: egzaminator może zmienić cenę albo ilość i zobaczyć, czy tabela sama się przelicza.

## 1. Dokładny format tabeli CKE

Najczęstszy wzór wygląda tak:

| Lp. | Nazwa usługi / podzespołu | Cena netto w zł | VAT w zł | Cena brutto w zł | Ilość | Wartość brutto w zł |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Konfiguracja rutera | 33,00 | 7,59 | 40,59 | 1 | 40,59 |
| 2 | Montaż okablowania | 15,00 | 3,45 | 18,45 | 2 | 36,90 |

Poniżej zwykle są trzy wiersze podsumowania:

```
ŁĄCZNA WARTOŚĆ USŁUG / ZESTAWU
UDZIELONY RABAT
DO ZAPŁATY
```

Nagłówki przepisuj **dokładnie jak we wzorze arkusza**. Jeżeli jest `Nazwa podzespołu`, nie pisz `Nazwa usługi`. Jeżeli w nawiasie jest `(w zł)`, zachowaj to.

## 2. Co oznacza netto, VAT, brutto

| Pojęcie | Znaczenie | Wzór |
|---|---|---|
| `cena netto` | cena bez VAT | pochodzi z cennika |
| `VAT` | kwota podatku | `cena netto × 23%` |
| `cena brutto` | cena z VAT | `netto + VAT` |
| `ilość` | liczba sztuk/usług | liczba z zadania |
| `wartość brutto` | wartość wiersza | `cena brutto × ilość` |
| `rabat` | zniżka | zależy od warunku w arkuszu |
| `do zapłaty` | kwota końcowa | suma − rabat |

W tym zadaniu standardowa stawka VAT wynosi **23%**. W polskim Excelu/Calc separator dziesiętny to **przecinek**: `123,45`, nie `123.45`.

## 3. Jakie formuły wpisać

Załóżmy, że pierwszy wiersz danych to wiersz 3:

- `C3` — cena netto
- `D3` — VAT
- `E3` — cena brutto
- `F3` — ilość
- `G3` — wartość brutto

| Komórka | Polska formuła | Co robi |
|---|---|---|
| `D3` | `=C3*23%` | liczy VAT |
| `E3` | `=C3+D3` | netto + VAT |
| `G3` | `=E3*F3` | brutto × ilość |
| suma | `=SUMA(G3:G7)` | dodaje wszystkie wiersze |
| rabat 5% przy sumie powyżej 500 zł | `=JEŻELI(G8>500;G8*5%;0)` | warunek |
| do zapłaty | `=G8-G9` | suma minus rabat |
| zaokrąglenie | `=ZAOKR(C3*23%;2)` | zaokrąglij do 2 miejsc |

W angielskim Excelu funkcje to `SUM`, `IF`, `ROUND`. W polskiej wersji używaj `SUMA`, `JEŻELI`, `ZAOKR`. Argumenty oddzielamy **średnikiem** `;`.

Po wpisaniu formuł w pierwszym wierszu przeciągnij je w dół za mały kwadrat w prawym dolnym rogu komórki. Sprawdź: zmień jedną cenę netto — VAT, brutto i suma powinny zmienić się automatycznie.

## 4. Pełny przykład 1: usługa

Treść:

```
Konfiguracja rutera — 33,00 zł netto, 1 sztuka.
Montaż okablowania — 15,00 zł netto, 2 sztuki.
VAT 23%. Rabat 5%, gdy łączna wartość brutto przekracza 500 zł.
```

Tabela:

| Lp. | Nazwa usługi | Cena netto w zł | VAT w zł | Cena brutto w zł | Ilość | Wartość brutto w zł |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Konfiguracja rutera | 33,00 | 7,59 | 40,59 | 1 | 40,59 |
| 2 | Montaż okablowania | 15,00 | 3,45 | 18,45 | 2 | 36,90 |

Liczenie ręczne, żeby rozumieć formuły:

1. `VAT` pierwszego wiersza: `33,00 × 0,23 = 7,59 zł`.
2. `Cena brutto`: `33,00 + 7,59 = 40,59 zł`.
3. `Wartość brutto`: `40,59 × 1 = 40,59 zł`.
4. W drugim wierszu: `15,00 × 0,23 = 3,45`; brutto `18,45`; za 2 sztuki `36,90 zł`.
5. Łączna wartość: `40,59 + 36,90 = 77,49 zł`.
6. `77,49` nie jest większe niż `500`, więc rabat wynosi `0,00 zł`.
7. Do zapłaty: `77,49 − 0,00 = 77,49 zł`.

Jeżeli formuły są poprawne, w tabeli będą dokładnie takie wartości.

## 5. Pełny przykład 2: podzespoły i rabat

Treść:

```
Pamięć RAM — 180,00 zł netto, 2 sztuki.
Dysk SSD — 319,00 zł netto, 1 sztuka.
VAT 23%. Rabat 6%, gdy łączna wartość zestawu jest powyżej 3000 zł.
```

Tabela:

| Lp. | Nazwa podzespołu | Cena netto w zł | VAT w zł | Cena brutto w zł | Ilość | Wartość brutto w zł |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Pamięć RAM | 180,00 | 41,40 | 221,40 | 2 | 442,80 |
| 2 | Dysk SSD | 319,00 | 73,37 | 392,37 | 1 | 392,37 |

Obliczenia:

1. RAM VAT: `180,00 × 0,23 = 41,40 zł`.
2. RAM brutto: `180,00 + 41,40 = 221,40 zł`.
3. RAM wartość: `221,40 × 2 = 442,80 zł`.
4. SSD VAT: `319,00 × 0,23 = 73,37 zł`.
5. SSD brutto: `319,00 + 73,37 = 392,37 zł`.
6. Razem: `442,80 + 392,37 = 835,17 zł`.
7. `835,17` nie jest powyżej `3000`, więc rabat wynosi `0,00 zł`.
8. Do zapłaty `835,17 zł`.

Gdyby suma wynosiła `4000 zł`, rabat liczono by tak: `4000 × 6% = 240 zł`, a `do zapłaty = 4000 − 240 = 3760 zł`.

## 6. Zasady zaokrąglania

- Kwoty pokazuj z **dwoma miejscami po przecinku**: `7,59 zł`.
- Jeżeli arkusz nie wymaga osobnego zaokrąglania, wystarczy format komórki `Walutowe` z 2 miejscami.
- Jeżeli w arkuszu jest napisane `zaokrąglij`, użyj `=ZAOKR(formuła;2)`.
- Nie zaokrąglaj ręcznie i nie wpisuj gotowej liczby zamiast formuły — zniknie automatyczne przeliczanie.

Format komórki zmienia tylko sposób wyświetlania. W środku może być `7,5900`, a na ekranie `7,59 zł`. Zwykle jest to poprawne i oczekiwane.

## 7. Jak sformatować

1. Wpisz `Cena netto` jako liczbę z cennika.
2. Wszystkie pozostałe kwoty zrób formułami.
3. Zaznacz komórki z kwotami.
4. Prawy przycisk myszy → `Formatuj komórki` → `Walutowe` → 2 miejsca dziesiętne → symbol `zł` albo `PLN`.
5. Jeżeli wymagają, dodaj `obramowanie`, `pogrubienie` nagłówków i `kolor wypełnienia`.
6. Zapisz plik pod dokładną nazwą, najczęściej `Kosztorys`, na nośniku `EGZAMIN-x` / `Egzamin-x`.

## 8. Typowe błędy

- Wpisanie wyniku z kalkulatora jako liczby zamiast formuły.
- Napisanie `=C3*23` zamiast `=C3*23%` — VAT będzie 100 razy za duży.
- Użycie kropki `123.45` tam, gdzie polski program oczekuje przecinka `123,45`.
- Zły separator argumentów: w polskiej wersji jest to `;`.
- Policzenie `wartości brutto` jako `netto × ilość`, bez VAT.
- Zsumowanie nie wszystkich wierszy: zakres `=SUMA(G3:G5)` musi obejmować ostatnią pozycję.
- Policzenie rabatu zawsze, mimo że warunek nie jest spełniony. Potrzebny jest `JEŻELI`.
- Dopisanie `zł` ręcznie w tej samej komórce co liczba. Wtedy komórka staje się tekstem i nie liczy się. Poprawny jest format walutowy.
- Zapisanie pliku w złym miejscu albo pod złą nazwą.

## 9. Szybka kontrola przed oddaniem

- [ ] Nagłówki są jak we `Wzorze kosztorysu`.
- [ ] Wszystkie pozycje rzeczywiście występowały w zadaniu.
- [ ] Powtarzająca się usługa jest jednym wierszem z poprawną `Ilością`.
- [ ] `VAT`, `Cena brutto`, `Wartość brutto`, suma i rabat są formułami.
- [ ] Po zmianie ceny netto suma przelicza się automatycznie.
- [ ] Komórki z kwotami mają format `zł` albo `PLN`.
- [ ] Plik jest zapisany jako `Kosztorys` na właściwym nośniku USB.
