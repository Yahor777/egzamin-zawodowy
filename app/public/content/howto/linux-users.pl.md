# Linux: konta użytkowników i grupy

## Jak czytać polecenie

```
sudo usermod -aG ksiegowiec anowak
│    │       │   │          └─ KOGO zmieniamy (użytkownik) — zawsze na końcu
│    │       │   └─ wartość opcji -G (nazwa grupy)
│    │       └─ opcje: -a i -G pisane razem (to samo co -a -G)
│    └─ program: usermod = „modyfikuj użytkownika”
└─ uruchom jako administrator (poprosi o hasło administratora)
```

- **Minus i litera** (`-m`, `-G`) to **opcja** programu. Znaczenie liter jest w tabelach niżej.
- Kilka opcji bez wartości można połączyć: `-a -G` = `-aG`.
- Jeżeli opcja wymaga wartości (grupa, katalog, data), wartość wpisujemy **bezpośrednio po niej**: `-G ksiegowiec`, `-d /home/inny`.
- Nazwa użytkownika albo grupy, którą tworzymy/zmieniamy, jest zwykle **ostatnim słowem**.
- Wielka i mała litera to **różne** opcje: `-g` ≠ `-G`.

Bez `sudo` zobaczysz `Only root may add a user or group` albo `Permission denied` — to znaczy, że brakuje `sudo`.
Podczas wpisywania hasła nic się nie pokazuje — to normalne.

## Którego programu użyć

| Zadanie | Program | Znaczenie nazwy |
|---|---|---|
| utworzyć grupę | `groupadd` | group add — dodaj grupę |
| zmienić grupę | `groupmod` | group modify |
| usunąć grupę | `groupdel` | group delete |
| utworzyć użytkownika | `useradd` | user add — tylko dla NOWEGO użytkownika |
| zmienić istniejącego użytkownika, także dodać go do grupy | `usermod` | user modify |
| usunąć użytkownika | `userdel` | user delete |
| ustawić hasło | `passwd` | password |
| ważność konta i hasła | `chage` | change age |

Częsty błąd: `useradd -a ...` — `useradd` nie ma opcji `-a` (`invalid option -- 'a'`).
Aby dodać **już istniejącego** użytkownika do grupy, użyj `usermod`, nie `useradd`.

## Grupy

```
sudo groupadd ksiegowiec            # utwórz grupę ksiegowiec
sudo groupadd -g 1500 ksiegowiec    # -g 1500 = numer grupy (GID) 1500
sudo groupmod -n nowa stara         # -n = new name: zmień nazwę „stara” na „nowa”
sudo groupmod -g 1111 ksiegowiec    # -g = zmień GID
sudo groupdel ksiegowiec            # usuń grupę
getent group ksiegowiec             # sprawdzenie: ksiegowiec:x:1001:anowak (na końcu członkowie)
```

`addgroup ksiegowiec` w Debianie/Ubuntu robi to samo co `groupadd`, ale pokazuje komunikaty `info: Adding group…`.

## Tworzenie użytkownika — `useradd`

| Opcja | Znaczenie | Przykład |
|---|---|---|
| `-m` | make home — utwórz katalog `/home/nazwa` | `-m` (bez tego katalogu nie będzie — częsta utrata punktów) |
| `-d` | directory — inna ścieżka katalogu domowego | `-d /home/inny` |
| `-g` | grupa podstawowa — jedna | `-g pracownicy` |
| `-G` | grupy dodatkowe — może być kilka po przecinku, bez spacji | `-G ksiegowiec,sudo` |
| `-c` | comment — opis konta, „Imię Nazwisko” | `-c "Anna Nowak"` |
| `-s` | shell — powłoka | `-s /bin/bash` |
| `-u` | UID — numer użytkownika | `-u 1600` |
| `-e` | expire — konto wygasa (data RRRR-MM-DD) | `-e 2027-06-30` |

```
sudo useradd -m -c "Anna Nowak" -G ksiegowiec -s /bin/bash anowak
sudo passwd anowak                  # ustaw hasło (dwa razy)
id anowak                           # sprawdzenie: uid=…(anowak) gid=…(anowak) groups=…,1001(ksiegowiec)
```

`adduser anowak` w Debianie/Ubuntu to wariant interaktywny: sam tworzy katalog i pyta o hasło oraz opis.

## Modyfikowanie istniejącego użytkownika — `usermod`

| Opcja | Znaczenie |
|---|---|
| `-aG grupa` | append + groups — **dodaj** do grupy dodatkowej, pozostałe grupy zostają |
| `-G grupa` bez `-a` | **zamień** wszystkie grupy dodatkowe na tę jedną — użytkownik zniknie z pozostałych |
| `-g grupa` | zmień grupę podstawową |
| `-c "tekst"` | zmień opis konta |
| `-s /bin/bash` | zmień powłokę |
| `-d /nowy -m` | zmień katalog domowy i przenieś pliki |
| `-l nowy` | zmień login (nazwę) |
| `-L` / `-U` | zablokuj (Lock) / odblokuj (Unlock) |
| `-e 2027-06-30` | data wygaśnięcia konta |

```
sudo usermod -aG ksiegowiec anowak  # dodaj anowak do grupy ksiegowiec
sudo adduser anowak ksiegowiec      # to samo innym sposobem (Debian/Ubuntu)
sudo gpasswd -a anowak ksiegowiec   # jeszcze jeden sposób
sudo gpasswd -d anowak ksiegowiec   # usuń anowak z grupy (-d = delete)
sudo userdel -r anowak              # usuń konto; -r = razem z /home/anowak
```

Kolejność: w `usermod -aG grupa użytkownik` najpierw grupa, potem użytkownik.
W `adduser użytkownik grupa` i `gpasswd -a użytkownik grupa` jest odwrotnie. Sprawdzaj wynik przez `id nazwa`.

## „Uprawnienia administratora / root”

```
sudo usermod -aG sudo asystent      # Ubuntu: grupa sudo = może wykonywać polecenia przez sudo
```

## Ważność konta i hasła — `chage`

| Opcja | Znaczenie | Przykład |
|---|---|---|
| `-E` | data wygaśnięcia konta | `chage -E 2027-06-30 anowak` |
| `-M` | Max — maksymalna liczba dni ważności hasła | `chage -M 30 anowak` |
| `-m` | min — minimalna liczba dni między zmianami | `chage -m 2 anowak` |
| `-W` | Warning — ile dni wcześniej ostrzegać | `chage -W 7 anowak` |
| `-d 0` | data ostatniej zmiany = 0 → zmiana hasła przy następnym logowaniu | `chage -d 0 anowak` |
| `-l` | list — pokaż ustawienia | `chage -l anowak` |

## Gdzie to jest zapisane (co sprawdza egzaminator)

- `/etc/passwd` — `login:x:UID:GID:opis:katalog:powłoka` → `grep anowak /etc/passwd`
- `/etc/shadow` — skróty haseł i daty ważności (tylko przez `sudo`)
- `/etc/group` — `grupa:x:GID:członkowie` → `grep ksiegowiec /etc/group`
