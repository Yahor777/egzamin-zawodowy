# Linux: права и владельцы (uprawnienia)

## Цифры

r = 4 (*odczyt*), w = 2 (*zapis*), x = 1 (*wykonanie*). Три цифры: **właściciel, grupa, pozostali**.

| слова в листе | цифра |
|---|---|
| odczyt, zapis i wykonanie (pełne prawa) | 7 |
| odczyt i zapis | 6 |
| odczyt i wykonanie | 5 |
| tylko odczyt | 4 |
| zapis i wykonanie | 3 |
| tylko zapis | 2 |
| tylko wykonanie (uruchomienie) | 1 |
| brak uprawnień | 0 |

Пример: «pełne prawa dla właściciela, odczyt i wykonanie dla grupy, brak dla pozostałych» → **750**.

```
chmod 750 katalog
chmod -R 750 katalog        # рекурсивно, со всем содержимым
ls -l                       # проверить (для каталога: ls -ld katalog)
```

## Буквы (notacja symboliczna)

`u` — właściciel, `g` — grupa, `o` — pozostali, `a` — wszyscy; `+` dodaj, `-` odbierz, `=` ustaw dokładnie.

```
chmod u+x skrypt.sh
chmod g+w,o-r plik
chmod u=rwx,g=rx,o= katalog
```

Если в листе сказано «notacją symboliczną» / «liczbową» — проверяется **сама команда** в истории, делай именно так.

## Владелец (właściciel) и группа

```
sudo chown anowak plik
sudo chown anowak:users plik      # владелец и группа
sudo chown -R anowak:users /dane  # рекурсивно
sudo chgrp pracownicy plik
```

## «Pełne prawa tylko dla użytkownika X»

```
sudo mkdir /dane
sudo chown X /dane
sudo chmod 700 /dane
```

## Чтение `ls -l`

`drwxr-x--- 2 anowak users ...` → `d` каталог, `rwx` właściciel, `r-x` grupa, `---` pozostali = 750.
