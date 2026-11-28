# Linux: скрипты bash (skrypty powłoki)

## Как читать команду

```text
sudo ./konta.sh uczen 3TI
│    │          │     └─ PARAMETR 2: początek nazwy katalogu, trafi do $2
│    │          └─ PARAMETR 1: początek nazwy użytkownika, trafi do $1
│    └─ CEL/program: skrypt konta.sh w bieżącym katalogu
└─ uruchom jako administrator, bo skrypt tworzy konta
```

- `./` znaczy: uruchom plik z **bieżącego katalogu**. Bez `./` shell szuka tylko w PATH.
- `$1` to pierwszy parametr po nazwie skryptu, `$2` — drugi, `$#` — liczba parametrów.
- Aby `./konta.sh` działało, plik musi mieć prawo `x`, np. przez `chmod 710` albo `chmod +x`.
- `bash konta.sh` uruchomi skrypt nawet bez prawa `x`, ale egzaminator często chce normalnego wykonania.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| utworzyć/edytować skrypt | `nano` | edytor terminalowy |
| nadać prawo wykonywania | `chmod` | change mode |
| uruchomić skrypt | `bash` lub `./nazwa` | Bourne Again Shell |
| utworzyć użytkownika w pętli | `useradd` | user add |
| sprawdzić wynik | `tail`, `ls`, `id` | koniec pliku / lista / identity |

## Najważniejsze opcje i elementy

| Element | Co znaczy | Co robi | Przykład |
|---|---|---|---|
| `#!/bin/bash` | shebang | wybiera interpreter bash | pierwsza linia skryptu |
| `$1`, `$2` | parameter | parametry wywołania | `./konta.sh uczen 3TI` |
| `$#` | number | liczba parametrów | `echo $#` |
| `for` | for = dla | pętla po liście/zakresie | `for i in {1..5}` |
| `while` | while = dopóki | pętla warunkowa | `while [ $n -gt 0 ]` |
| `if` | if = jeżeli | warunek | `if [ -z "$1" ]` |
| `-z` | zero length | prawda, gdy tekst pusty | `[ -z "$1" ]` |
| `-d` | directory | prawda, gdy istnieje katalog | `[ -d /etc ]` |
| `-gt` | greater than | większe niż | `[ $n -gt 0 ]` |
| `chmod` `+x` | execute | dodaj prawo uruchamiania | `chmod +x konta.sh` |
| `useradd` `-m` | **m**ake home | utwórz katalog domowy | `useradd -m uczen1` |
| `useradd` `-d` | **d**irectory | własna ścieżka home | `useradd -d /home/3TI1` |
| `useradd` `-s` | **s**hell | powłoka logowania | `useradd -s /bin/bash` |

## 1. Skrypt z paramétrami i pętlą — typowe zadanie CKE

```bash
mkdir ~/skrypty_admina                           # utwórz katalog na skrypty administratora
nano ~/skrypty_admina/konta.sh                   # otwórz nowy skrypt konta.sh w edytorze
```

<!-- file: /home/administrator/skrypty_admina/konta.sh -->
```bash-file
#!/bin/bash                                      # użyj interpretera bash do wykonania skryptu
for i in {1..5}                                  # wykonaj blok pięć razy: i = 1,2,3,4,5
do                                               # początek bloku pętli
  useradd -m -d /home/${2}${i} -s /bin/bash ${1}${i}  # utwórz użytkownika z numerem i własnym home
done                                             # koniec bloku pętli
```

Każda linia ma znaczenie:

| Linia | Wyjaśnienie |
|---|---|
| `for i in {1..5}` | pętla po liczbach 1–5 |
| `do` / `done` | początek i koniec powtarzanego bloku |
| `${1}${i}` | parametr 1 + numer, np. `uczen` + `1` = `uczen1` |
| `${2}${i}` | parametr 2 + numer, np. `3TI` + `1` = `3TI1` |
| `-m` | bez tego katalog domowy może nie powstać |
| `-d /home/${2}${i}` | dokładna ścieżka `/home/3TI1` itd. |

```bash
chmod 710 ~/skrypty_admina/konta.sh              # ustaw prawa rwx dla właściciela, x dla grupy, brak innym
cd ~/skrypty_admina                              # przejdź do katalogu skryptu
sudo ./konta.sh uczen 3TI                        # utwórz uczen1..uczen5 z katalogami /home/3TI1..5
tail -5 /etc/passwd                              # pokaż pięć nowych kont w pliku użytkowników
ls -ld /home/3TI*                                # sprawdź, czy katalogi domowe istnieją
```

## 2. Warunek i pętla while

```bash
nano ~/skrypty_admina/test.sh                    # otwórz drugi skrypt testowy
```

<!-- file: /home/administrator/skrypty_admina/test.sh -->
```bash-file
#!/bin/bash                                      # użyj interpretera bash
if [ -z "${1}" ]                                 # sprawdź, czy pierwszy parametr jest pusty
then                                             # początek gałęzi spełnionego warunku
  echo "Podaj parametr"                          # wypisz instrukcję, gdy brak parametru
  exit 1                                         # zakończ skrypt z kodem błędu 1
fi                                               # koniec warunku if
n=3                                              # ustaw licznik pętli na 3
while [ ${n} -gt 0 ]                             # powtarzaj, dopóki n jest większe od zera
do                                               # początek bloku while
  echo "${1}:${n}"                               # wypisz parametr i bieżący licznik
  n=$((n-1))                                     # zmniejsz licznik o 1
done                                             # koniec bloku while
```

```bash
chmod 700 ~/skrypty_admina/test.sh               # nadaj skryptowi prawo wykonania tylko właścicielowi
sudo ~/skrypty_admina/test.sh egzamin            # uruchom skrypt z parametrem egzamin
bash ~/skrypty_admina/test.sh test               # uruchom ten sam skrypt przez bash bez użycia prawa x
```

## 3. Typowe błędy składni

- `if` kończymy odwróconym słowem `fi`.
- `for` i `while` zamykamy parą `do` ... `done`.
- W warunku `[` potrzebuje spacji: `[ -z "$1" ]`, nie `[-z "$1"]`.
- Zmienne z wartością ze spacją trzymaj w cudzysłowie: `"$1"`.
- W pliku Windows mogą zostać niewidoczne znaki `\r`; twórz skrypt w `nano` na Linuxie.

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `bash: ./konta.sh: Permission denied` | brak prawa `x` | `chmod 710 konta.sh` albo `chmod +x konta.sh` |
| `bash: ./brak.sh: No such file or directory` | zła nazwa albo nie jesteś w katalogu skryptu | `pwd`, `ls`, potem `./poprawna-nazwa` |
| `useradd: Permission denied.` | skrypt uruchomiony bez `sudo` | `sudo ./konta.sh uczen 3TI` |
| `syntax error: unexpected end of file` | brak `done`, `fi` albo cudzysłowu | sprawdź pary bloków od końca pliku |
| `useradd: user 'uczen1' already exists` | skrypt już raz wykonano | usuń konta albo użyj innego parametru |
| `useradd: invalid user name 'uc zen': use --badname to ignore` | w parametrze są niedozwolone znaki/spacje | użyj małych liter bez spacji |

## Как проверить

```bash
ls -l ~/skrypty_admina/konta.sh                  # sprawdź prawa skryptu, np. -rwx--x---
tail -5 /etc/passwd                              # sprawdź utworzone konta
ls -ld /home/3TI*                                # sprawdź utworzone katalogi domowe
id uczen1                                        # sprawdź UID, GID i grupy pierwszego użytkownika
```

Oczekiwany fragment:

```text
-rwx--x--- 1 administrator administrator ... konta.sh
uczen1:x:...
drwxr-x--- ... uczen1 uczen1 ... /home/3TI1
uid=...(uczen1) gid=...(uczen1) groups=...(uczen1)
```

Egzaminator może uruchomić Twój skrypt z **innymi** parametrami. Dlatego nie wpisuj `uczen` i `3TI` na sztywno w środku — używaj `$1` i `$2`.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `utwórz skrypt powłoki ... przyjmujący dwa parametry` | plik z `#!/bin/bash`, użyj `$1` i `$2` |
| `pierwszym parametrem jest nazwa bazowa użytkownika` | login buduj jako `${1}${i}` |
| `drugim parametrem jest nazwa bazowa katalogu` | home buduj jako `/home/${2}${i}` |
| `skrypt ma utworzyć pięć kont` | `for i in {1..5}` + `useradd` |
| `nadaj prawa 710` | `chmod 710 konta.sh` |
| `uruchom skrypt z parametrami uczen 3TI` | `sudo ./konta.sh uczen 3TI` |
