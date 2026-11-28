# Linux: права и владельцы (uprawnienia)

## Как читать команду

```text
stat -c %a /home/zadanie
│    │  │  └─ WARTOŚĆ opcji -c: %a = pokaż prawa jako cyfry, np. 770
│    │  └─ opcja -c = format; po niej podajesz format wyniku
│    └─ CEL: katalog albo plik do sprawdzenia
└─ program: stat = status pliku
```

- Prawa `770` to trzy cyfry: **właściciel**, **grupa**, **pozostali**.
- `r` = read/odczyt = 4, `w` = write/zapis = 2, `x` = execute/wejście w katalog lub uruchomienie = 1.
- `7` = 4+2+1 = `rwx`; `5` = 4+1 = `r-x`; `0` = brak praw.
- U katalogu `x` nie znaczy „uruchom katalog”, tylko **wolno wejść** do środka.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zobaczyć prawa | `ls -l` | list long |
| zmienić prawa | `chmod` | change mode |
| zmienić właściciela i grupę | `chown` | change owner |
| zmienić tylko grupę | `chgrp` | change group |
| zobaczyć prawa jako cyfry | `stat` | status |
| utworzyć katalog/plik testowy | `mkdir`, `touch` | make directory / touch |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `chmod` | `-R` | **R**ecursive | zmienia także zawartość katalogu | `chmod -R 750 /dane` |
| `chown` | `-R` | **R**ecursive | zmienia właściciela w całym drzewie | `chown -R egzamin:root /home/zadanie` |
| `stat` | `-c` | format **c**ustom | wypisuje wybrany format | `stat -c %a plik` |
| `ls` | `-l` | **l**ong | długi format z prawami | `ls -l /home` |
| `ls` | `-d` | **d**irectory | pokazuje sam katalog, nie zawartość | `ls -ld /home/zadanie` |

## 1. Przeczytaj `ls -l`

```bash
sudo mkdir /home/zadanie                         # utwórz katalog zadania jako administrator
echo "INF.02" | sudo tee /home/zadanie/dane      # utwórz plik dane z wymaganym tekstem
ls -ld /home/zadanie                             # pokaż prawa samego katalogu, nie jego zawartości
ls -l /home/zadanie                              # pokaż prawa plików wewnątrz katalogu
```

Przykładowa linia:

```text
drwxrwx--- 2 egzamin root 4096 ... /home/zadanie
│└┬┘└┬┘└┬┘    │    │    └─ grupa
│ │  │  │     │    └─ właściciel
│ │  │  └─ prawa pozostałych
│ │  └─ prawa grupy
│ └─ prawa właściciela
└─ d = directory/katalog; - = zwykły plik; l = link
```

## 2. Prawa cyfrowe

| Liczba | Skład | Zapis | Znaczenie dla pliku | Znaczenie dla katalogu |
|---|---|---|---|---|
| 7 | 4+2+1 | rwx | czytaj, zmieniaj, uruchamiaj | zobacz, twórz/usuwaj, wejdź |
| 6 | 4+2 | rw- | czytaj i zmieniaj | rzadko używane |
| 5 | 4+1 | r-x | czytaj i uruchom | zobacz nazwy i wejdź |
| 4 | 4 | r-- | tylko czytaj | zobacz nazwy, ale nie wejdziesz bez x |
| 1 | 1 | --x | tylko uruchom | tylko wejdź, jeśli znasz nazwy plików |
| 0 | 0 | --- | brak | brak |

```bash
sudo chmod 770 /home/zadanie                     # ustaw katalogowi rwx dla właściciela i grupy, brak dla innych
sudo chmod 660 /home/zadanie/dane                # ustaw plikowi rw dla właściciela i grupy, brak dla innych
stat -c %a /home/zadanie                         # wypisz prawa katalogu cyframi, oczekiwane 770
stat -c %a /home/zadanie/dane                    # wypisz prawa pliku cyframi, oczekiwane 660
```

## 3. Prawa literowe

| Zapis | Znaczenie |
|---|---|
| `u` | user/właściciel |
| `g` | group/grupa |
| `o` | others/pozostali |
| `a` | all/wszyscy |
| `+x` | dodaj execute |
| `-w` | zabierz write |
| `=r` | ustaw dokładnie tylko read |

```bash
sudo chmod u+x /home/zadanie/dane                # dodaj właścicielowi prawo wykonania pliku
sudo chmod g-w /home/zadanie/dane                # zabierz grupie prawo zapisu pliku
sudo chmod o= /home/zadanie/dane                 # usuń wszystkie prawa pozostałych użytkowników
stat -c %a /home/zadanie/dane                    # zobacz wynik zmian literowych jako cyfry
sudo chmod 660 /home/zadanie/dane                # przywróć wymagane prawa 660 po ćwiczeniu
```

## 4. Właściciel i grupa

```bash
sudo useradd -m egzamin                          # utwórz użytkownika egzamin z katalogiem domowym
sudo chown egzamin:root /home/zadanie            # ustaw właściciela egzamin i grupę root dla katalogu
sudo chown egzamin:root /home/zadanie/dane       # ustaw tego samego właściciela i grupę dla pliku
sudo chgrp root /home/zadanie                    # zmień tylko grupę katalogu na root
ls -ld /home/zadanie                             # sprawdź właściciela, grupę i prawa katalogu
ls -l /home/zadanie                              # sprawdź właściciela, grupę i prawa pliku
sudo chown -R egzamin:root /home/zadanie         # ustaw właściciela rekurencyjnie dla katalogu i zawartości
```

`chown użytkownik:grupa cel` — najpierw login, potem grupa. Dwukropek jest obowiązkowy. Bez `-R` zmieniasz tylko sam katalog, a pliki w środku zostają bez zmian.

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `chmod: cannot access '/home/zadanie': No such file or directory` | katalog nie istnieje albo literówka | sprawdź `ls /home` |
| `chown: invalid user: ‘egzamin’` | użytkownik nie istnieje | najpierw `sudo useradd -m egzamin` |
| `chown: invalid group: ‘rootx’` | grupa nie istnieje | sprawdź `getent group root` |
| `chmod: changing permissions of '/home/zadanie': Operation not permitted` | nie jesteś właścicielem albo brak root | użyj `sudo` |
| `bash: cd: /home/zadanie: Permission denied` | brak `x` na katalogu | dodaj execute odpowiedniej cyfrze, np. 770 |
| `cat: /home/zadanie/dane: Permission denied` | brak `r` na pliku albo brak `x` na katalogu | popraw prawa pliku i katalogu |

## Как проверить

```bash
ls -ld /home/zadanie                             # pokaż prawa katalogu w formacie drwx...
ls -l /home/zadanie                              # pokaż prawa pliku wewnątrz katalogu
stat -c '%a %U:%G' /home/zadanie                 # wypisz prawa cyframi oraz właściciela i grupę katalogu
stat -c '%a %U:%G' /home/zadanie/dane            # wypisz prawa cyframi oraz właściciela i grupę pliku
```

Oczekiwany wynik dla typowego arkusza:

```text
drwxrwx--- ... egzamin root ... /home/zadanie
-rw-rw---- ... egzamin root ... dane
770 egzamin:root
660 egzamin:root
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `nadaj uprawnienia 770` | `sudo chmod 770 katalog` |
| `użytkownik i grupa mają pełne prawa, pozostali żadnych` | cyfry `770` |
| `plik ma uprawnienia 660` | `sudo chmod 660 plik` |
| `właścicielem ma być egzamin, a grupą root` | `sudo chown -R egzamin:root katalog` |
| `pełne prawa tylko dla użytkownika X` | właściciel X + `chmod 700` albo `600` dla pliku |
| `rekurencyjnie` | dodaj `-R` do `chmod`/`chown` |
