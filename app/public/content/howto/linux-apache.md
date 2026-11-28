# Linux: веб-сервер Apache (serwer HTTP)

## Как читать команду

```text
sudo tail -n 20 /var/log/apache2/error.log
│    │    │  │  └─ WARTOŚĆ opcji -n: dokładnie 20 ostatnich linii
│    │    │  └─ opcja -n = number of lines, liczba linii
│    │    └─ program: tail = koniec pliku
│    └─ CEL: plik z błędami Apache
└─ uruchom jako administrator, bo log jest systemowy
```

- Apache to usługa, a `apache2ctl` to narzędzie kontroli.
- Najczęściej wystarczy krótkie `apache2ctl configtest`; `configtest` to słowo polecenia, nie opcja.
- `-t` i `configtest` znaczą prawie to samo: sprawdź konfigurację.
- Jeżeli edytujesz plik w `/etc`, prawie zawsze potrzebujesz `sudo`.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zainstalować Apache | `apt` | advanced package tool |
| sprawdzić konfigurację | `apache2ctl` | Apache control |
| włączyć witrynę | `a2ensite` | Apache2 enable site |
| wyłączyć witrynę | `a2dissite` | Apache2 disable site |
| uruchomić usługę | `systemctl` | systemd control |
| pobrać stronę testowo | `curl` | client URL |
| zobaczyć port 80 | `ss` | socket statistics |
| kopiować plik strony | `cp` | copy |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `apache2ctl` | `-t` | **t**est | test składni | `apache2ctl -t` |
| `apache2ctl` | `configtest` | config test | czytelniejsza wersja testu | `apache2ctl configtest` |
| `curl` | `-I` | uppercase i = head | pobiera tylko nagłówki HTTP | `curl -I localhost` |
| `curl` | `-s` | **s**ilent | nie pokazuje postępu | `curl -s localhost` |
| `cp` | `-r` | **r**ecursive | kopiuje katalog z zawartością | `cp -r PLIKI /tmp/` |
| `ss` | `-t` | **T**CP | pokazuje TCP | `ss -t` |
| `ss` | `-l` | **l**istening | tylko porty nasłuchujące | `ss -lt` |
| `ss` | `-n` | **n**umeric | numery portów zamiast nazw | `ss -tln` |
| `systemctl` | `restart` | restart | przeładowuje usługę po zmianie | `systemctl restart apache2` |
| `tail` | `-n` | **n**umber | liczba ostatnich linii | `tail -n 20 /var/log/apache2/error.log` |

## 1. Instalacja i pierwszy test

```bash
sudo apt install apache2                         # zainstaluj serwer HTTP Apache lub potwierdź, że już jest
sudo apache2ctl configtest                       # sprawdź składnię konfiguracji Apache
systemctl status apache2                         # zobacz, czy usługa apache2 jest active (running)
curl -s localhost                                # pobierz stronę testową z lokalnego serwera
```

## 2. Gdzie jest root strony

`DocumentRoot` to katalog, z którego Apache oddaje pliki. W Ubuntu domyślnie jest to `/var/www/html`.

```bash
grep -R DocumentRoot /etc/apache2/sites-enabled  # znajdź aktywny DocumentRoot we włączonych witrynach
grep APACHE_RUN_USER /etc/apache2/envvars        # sprawdź użytkownika, jako który pracuje Apache
grep APACHE_RUN_GROUP /etc/apache2/envvars       # sprawdź grupę procesu Apache
```

Oczekiwane wartości: użytkownik `www-data`, grupa `www-data`.

## 3. Pełny virtual host z komentarzem do każdej linii

Przykład: strona ma być w `/www`, a Apache ma nasłuchiwać na porcie 80.

```bash
sudo mkdir /www                                  # utwórz katalog główny witryny
echo "<h1>EGZAMIN INF.02</h1>" | sudo tee /www/index.html  # zapisz prostą stronę jako administrator
sudo nano /etc/apache2/sites-available/000-default.conf    # otwórz domyślną witrynę Apache
```

<!-- file: /etc/apache2/sites-available/000-default.conf -->
```apache
# początek witryny nasłuchującej na wszystkich adresach, port 80
<VirtualHost *:80>
    # adres administratora widoczny w komunikatach serwera
    ServerAdmin webmaster@localhost
    # katalog, z którego Apache pobiera pliki strony
    DocumentRoot /www
    # początek reguł dostępu do katalogu /www
    <Directory /www>
        # zezwól Apache odczytywać pliki wszystkim klientom HTTP
        Require all granted
    # koniec reguł katalogu
    </Directory>
    # plik błędów; zmienna ścieżki jest zdefiniowana w envvars
    ErrorLog ${APACHE_LOG_DIR}/error.log
    # plik dostępu w formacie combined
    CustomLog ${APACHE_LOG_DIR}/access.log combined
# koniec definicji witryny
</VirtualHost>
```

W Apache wcięcia nie zmieniają znaczenia jak w YAML, ale robimy je dla czytelności. Każdy blok `<VirtualHost ...>` musi mieć zamknięcie `</VirtualHost>`. Każdy `<Directory ...>` musi mieć `</Directory>`.

```bash
sudo apache2ctl configtest                       # sprawdź, czy wirtualny host nie ma błędu składni
sudo systemctl restart apache2                   # zastosuj nową konfigurację przez restart usługi
curl -s localhost                                # sprawdź, czy Apache zwraca nową stronę
ss -tln                                          # sprawdź, czy serwer nasłuchuje na porcie 80
```

## 4. Katalog na kopie z uprawnieniami 750

```bash
sudo mkdir /kopie_strony                         # utwórz katalog na kopie strony
sudo chmod 750 /kopie_strony                     # ustaw prawa rwx właściciel, r-x grupa, brak innym
sudo chown www-data:www-data /kopie_strony       # ustaw właściciela i grupę procesu Apache
ls -ld /kopie_strony                             # sprawdź prawa, właściciela i grupę katalogu
```

## 5. Włączanie i wyłączanie osobnej witryny

```bash
sudo a2ensite 000-default                        # włącz witrynę z sites-available do sites-enabled
sudo systemctl reload apache2                    # przeładuj Apache bez zatrzymywania usługi
sudo a2dissite 000-default                       # wyłącz witrynę; w prawdziwej pracy zrób to tylko dla innej witryny
sudo a2ensite 000-default                        # włącz domyślną witrynę z powrotem po ćwiczeniu
sudo systemctl reload apache2                    # zastosuj zmianę linków witryn
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `AH00526: Syntax error on line 3 of /etc/apache2/sites-available/010-www.conf:` | literówka albo zła linia w pliku Apache | otwórz wskazaną linię i popraw dyrektywę |
| `Invalid command 'DocumentRot', perhaps misspelled or defined by a module not included in the server configuration` | `DocumentRoot` zapisane z błędem | popraw nazwę dyrektywy |
| `<VirtualHost> was not closed.` | brak `</VirtualHost>` albo `</Directory>` | dopisz zamknięcie bloku |
| `Job for apache2.service failed because the control process exited with error code.` | systemd nie uruchomił Apache po błędnej zmianie | wykonaj `apache2ctl configtest` i popraw plik |
| `403 Forbidden` | Apache nie ma dostępu do katalogu albo brak `Require all granted` | dodaj `<Directory>` i sprawdź prawa `755/750` |
| `curl: (7) Failed to connect to localhost port 80` | usługa nie działa albo port jest inny | `systemctl restart apache2`, potem `ss -tln` |

## Как проверить

```bash
systemctl is-active apache2                      # wypisz active, jeśli usługa działa
sudo apache2ctl configtest                       # wypisz Syntax OK dla poprawnej konfiguracji
curl -s -I localhost                             # pokaż nagłówki HTTP bez pobierania całej strony
ls -ld /kopie_strony                             # sprawdź katalog kopii i jego prawa
```

Oczekiwany fragment:

```text
active
Syntax OK
HTTP/1.1 200 OK
drwxr-x--- 2 www-data www-data ... /kopie_strony
```

Egzaminator zwykle sprawdza: strona otwiera się w przeglądarce, `DocumentRoot` zapisany w tabeli, usługa działa, katalog ma właściwego właściciela i prawa.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `serwer HTTP jest zainstalowany w systemie` | `systemctl status apache2`, `curl localhost` |
| `odnajdź i zapisz ścieżkę katalogu, w którym znajduje się strona` | `grep -R DocumentRoot /etc/apache2/sites-enabled` |
| `zamień zawartość strony internetowej` | skopiuj nowy `index.html` do `DocumentRoot` |
| `uruchom usługę serwera HTTP` | `sudo systemctl restart apache2` |
| `wyświetl opublikowaną stronę` | `curl -s localhost` albo przeglądarka na stacji |
| `pełne prawa dla użytkownika i grupy serwera HTTP` | `sudo chown www-data:www-data ...` + `sudo chmod ...` |
