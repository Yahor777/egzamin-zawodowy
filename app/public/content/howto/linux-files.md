# Linux: файлы, архивы, ссылки, перенаправление

## Как читать команду

```text
tar -czf raport.tar.gz raport
│   │││  │              └─ CEL: katalog albo plik do spakowania
│   │││  └─ WARTOŚĆ opcji -f: nazwa tworzonego archiwum
│   ││└─ opcja -f = file; po niej musi być nazwa archiwum
│   │└─ opcja -z = gzip; kompresja .gz
│   └─ opcja -c = create; utwórz archiwum
└─ program: tar = tape archiver, archiwizator
```

- W `-czf` są trzy opcje razem: `-c -z -f`.
- `-f` jest ostatnią literą, bo zaraz po niej stoi jej wartość `raport.tar.gz`.
- `>` zapisuje wynik do pliku i nadpisuje; `>>` dopisuje na końcu.
- `|` przekazuje wynik jednego polecenia jako wejście następnego.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| pokazać pliki | `ls` | list |
| utworzyć katalog | `mkdir` | make directory |
| skopiować | `cp` | copy |
| przenieść/zmienić nazwę | `mv` | move |
| usunąć | `rm` | remove |
| utworzyć pusty plik/zmienić datę | `touch` | dotknij plik |
| pokazać cały plik | `cat` | concatenate |
| początek/koniec pliku | `head`, `tail` | głowa/ogon |
| znaleźć tekst | `grep` | global regular expression print |
| znaleźć plik | `find` | find = znajdź |
| dowiązanie symboliczne | `ln` | link |
| archiwum .tar/.tar.gz | `tar` | tape archiver |
| kompresja pojedynczego pliku | `gzip` | GNU zip |

## Opcje najważniejszych programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `ls` | `-l` | **l**ong | długi format: prawa, właściciel, rozmiar | `ls -l` |
| `ls` | `-a` | **a**ll | także pliki ukryte `.nazwa` | `ls -a` |
| `ls` | `-R` | **R**ecursive | rekurencyjnie podkatalogi | `ls -R katalog` |
| `mkdir` | `-p` | **p**arents | utwórz też katalogi rodzica | `mkdir -p a/b` |
| `cp` | `-r` | **r**ecursive | kopiuj katalog z zawartością | `cp -r a b` |
| `rm` | `-r` | **r**ecursive | usuń katalog z zawartością | `rm -r a` |
| `rm` | `-f` | **f**orce | nie pytaj, nie zgłaszaj braku pliku | `rm -f plik` |
| `ln` | `-s` | **s**ymbolic | dowiązanie symboliczne, nie twarde | `ln -s cel skrot` |
| `grep` | `-i` | **i**gnore case | bez wielkości liter | `grep -i error log` |
| `grep` | `-n` | **n**umber | numer linii | `grep -n root /etc/passwd` |
| `grep` | `-r` | **r**ecursive | szukaj w katalogu | `grep -r DocumentRoot /etc/apache2` |
| `find` | `-name` | name = nazwa | filtr nazwy pliku | `find /etc -name '*.conf'` |
| `tar` | `-c` | **c**reate | utwórz archiwum | `tar -cf a.tar a` |
| `tar` | `-x` | e**x**tract | rozpakuj | `tar -xf a.tar` |
| `tar` | `-t` | **t**est/list | pokaż zawartość | `tar -tf a.tar` |
| `tar` | `-z` | gzip | kompresja .gz | `tar -czf a.tar.gz a` |
| `tar` | `-v` | **v**erbose | wypisuj pliki | `tar -xvf a.tar` |
| `tar` | `-f` | **f**ile | nazwa archiwum | `tar -tf a.tar` |
| `gzip` | `-d` | **d**ecompress | rozpakuj | `gzip -d plik.gz` |

## 1. Pliki i katalogi

```bash
pwd                                              # pokaż bieżący katalog roboczy
mkdir -p ~/praca/raporty                         # utwórz katalog raporty razem z katalogiem rodzica praca
cd ~/praca                                       # przejdź do katalogu praca w katalogu domowym
echo "INF.02" > raporty/dane.txt                 # zapisz tekst do nowego pliku, nadpisując go jeśli istnieje
echo "druga linia" >> raporty/dane.txt           # dopisz kolejną linię na końcu pliku
cat raporty/dane.txt                             # wyświetl całą zawartość pliku
cp raporty/dane.txt raporty/kopia.txt            # skopiuj plik dane.txt pod nazwą kopia.txt
mv raporty/kopia.txt raporty/kopia2.txt          # zmień nazwę pliku kopia.txt na kopia2.txt
ls -l raporty                                    # pokaż szczegóły plików w katalogu raporty
```

## 2. Potok, filtr i liczba linii

```bash
cat /etc/passwd | grep administrator             # znajdź w pliku passwd linie zawierające administrator
grep -n root /etc/passwd                         # pokaż linie z root razem z numerami linii
cat /etc/passwd | grep bash | wc -l              # policz użytkowników mających bash w linii konta
head -3 /etc/passwd                              # pokaż pierwsze 3 linie pliku passwd
tail -n 2 /etc/passwd                            # pokaż ostatnie 2 linie pliku passwd
```

## 3. Dowiązania

```bash
ln -s ~/praca/raporty/dane.txt ~/dane-link       # utwórz dowiązanie symboliczne do pliku dane.txt
ls -l ~/dane-link                                # zobacz strzałkę link -> cel w długim listingu
readlink ~/dane-link                             # wypisz cel dowiązania symbolicznego
cat ~/dane-link                                  # przeczytaj plik przez dowiązanie
```

Dowiązanie symboliczne to jak skrót w Windows. Jeśli usuniesz oryginał, link zostaje, ale przestaje działać.

## 4. Archiwum tar.gz

```bash
tar -czf raporty.tar.gz raporty                  # spakuj katalog raporty do archiwum gzip
tar -tzf raporty.tar.gz                          # wypisz zawartość archiwum bez rozpakowania
rm -r raporty                                    # usuń katalog testowo, żeby sprawdzić rozpakowanie
tar -xzf raporty.tar.gz                          # rozpakuj archiwum z powrotem do bieżącego katalogu
cat raporty/dane.txt                             # sprawdź, czy plik po rozpakowaniu ma tę samą zawartość
```

## 5. gzip pojedynczego pliku

```bash
cp raporty/dane.txt raporty/dane-do-gzip.txt     # przygotuj kopię pliku do kompresji
gzip raporty/dane-do-gzip.txt                    # skompresuj plik i zamień go na dane-do-gzip.txt.gz
ls -l raporty/dane-do-gzip.txt.gz                # zobacz powstały plik .gz
gzip -d raporty/dane-do-gzip.txt.gz              # rozpakuj .gz z powrotem do zwykłego pliku
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `cp: cannot stat 'plik': No such file or directory` | źródło nie istnieje albo literówka w nazwie | sprawdź `ls` i ścieżkę |
| `rm: cannot remove 'katalog': Is a directory` | katalog nie usunie się bez rekurencji | użyj `rm -r` tylko wtedy, gdy na pewno wolno usunąć |
| `mkdir: cannot create directory ‘/etc/x’: Permission denied` | zapis w katalogu systemowym bez `sudo` | użyj `sudo` albo pracuj w katalogu domowym |
| `bash: /etc/plik: Permission denied` | przekierowanie `>` wykonuje zwykła powłoka, nie `sudo` | użyj `echo ... \| sudo tee /etc/plik` |
| `tar: raporty: Cannot stat: No such file or directory` | archiwizowany katalog nie istnieje | sprawdź bieżący katalog przez `pwd` i `ls` |
| `ls: cannot access 'plik': No such file or directory` | nie ma takiego pliku | popraw nazwę; Linux rozróżnia wielkość liter |

## Как проверить

```bash
ls -l raporty                                    # pokaż finalne pliki, prawa i rozmiary
cat raporty/dane.txt                             # pokaż finalną zawartość pliku
tar -tzf raporty.tar.gz                          # sprawdź, jakie pliki są w archiwum
```

Oczekiwany fragment:

```text
INF.02
druga linia
raporty/
raporty/dane.txt
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `utwórz katalog ...` | `mkdir` albo `mkdir -p` dla ścieżki z rodzicem |
| `utwórz plik ... zawierający wpis ...` | `echo "tekst" > plik` |
| `skopiuj plik ...` | `cp źródło cel` |
| `utwórz dowiązanie symboliczne` | `ln -s cel nazwa_linku` |
| `spakuj katalog do archiwum` | `tar -czf archiwum.tar.gz katalog` |
| `zapisz wynik działania polecenia do pliku` | `polecenie > plik` albo `polecenie >> plik` |
