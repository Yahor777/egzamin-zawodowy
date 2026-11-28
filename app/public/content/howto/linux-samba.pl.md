# Linux: folder udostępniony Samba (udostępnianie SMB)

## Jak czytać polecenie

```text
sudo smbpasswd -a egzamin
1    2         3  4
```

1. wymagane uprawnienia administratora
2. program: smbpasswd = hasło użytkownika Samby
3. opcja -a = add, dodaj użytkownika do bazy SMB
4. CEL: użytkownik Linux, który ma dostać hasło Samby

- Linuxowe hasło i hasło Samby to **dwie osobne rzeczy**.
- Użytkownik najpierw musi istnieć w Linuxie (`useradd`), dopiero potem dostaje `smbpasswd -a`.
- Zasób `[nazwa]` w `smb.conf` to nazwa widoczna w sieci jako `\\serwer\nazwa`.

## Jaki program wybrać

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zainstalować Sambę | `apt` | advanced package tool |
| sprawdzić `smb.conf` | `testparm` | test parameters |
| dodać użytkownika SMB | `smbpasswd` | SMB password |
| uruchomić usługi | `systemctl` | systemd control |
| utworzyć katalog zasobu | `mkdir` | make directory |
| ustawić prawa/właściciela | `chmod`, `chown` | change mode/owner |
| zobaczyć porty 139/445 | `ss` | socket statistics |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `testparm` | `-s` | **s**uppress prompt | nie czeka na Enter | `testparm -s` |
| `smbpasswd` | `-a` | **a**dd | dodaje użytkownika SMB | `smbpasswd -a egzamin` |
| `smbpasswd` | `-x` | delete/disable | usuwa użytkownika SMB | `smbpasswd -x egzamin` |
| `chmod` | `-R` | **R**ecursive | rekurencyjnie | `chmod -R 770 /home/publiczny` |
| `chown` | `-R` | **R**ecursive | rekurencyjnie właściciel/grupa | `chown -R egzamin:egzamin katalog` |
| `ss` | `-t` | **T**CP | porty TCP | `ss -tln` |
| `ss` | `-l` | **l**istening | tylko nasłuchujące | `ss -l` |
| `ss` | `-n` | **n**umeric | porty liczbowo | `ss -tln` |

## 1. Użytkownik i katalog zasobu

```bash
sudo apt install samba                           # zainstaluj pakiet Samba albo potwierdź, że jest zainstalowany
sudo useradd -m -s /bin/bash egzamin             # utwórz linuksowe konto egzamin z katalogiem domowym
sudo mkdir /home/publiczny                       # utwórz katalog, który będzie udostępniony
sudo chmod 770 /home/publiczny                   # ustaw rwx dla właściciela i grupy, brak dla pozostałych
sudo chown egzamin:egzamin /home/publiczny       # ustaw właściciela i grupę katalogu na egzamin
ls -ld /home/publiczny                           # sprawdź prawa i właściciela katalogu
```

## 2. Pełny `/etc/samba/smb.conf` z komentarzem do każdej linii

```bash
sudo nano /etc/samba/smb.conf                    # otwórz główny plik konfiguracji Samby
```

<!-- file: /etc/samba/smb.conf -->
```ini
# sekcja globalna dotyczy całego serwera SMB
[global]
# grupa roboczca musi zwykle zgadzać się z klientem Windows
workgroup = WORKGROUP
# opis serwera widoczny w sieci; %h oznacza nazwę hosta
server string = %h server (Samba, Ubuntu)
# Samba działa jako samodzielny serwer, nie kontroler domeny
server role = standalone server
# loguj do plików w katalogu Samby
log file = /var/log/samba/log.%m
# maksymalny rozmiar jednego logu w KiB
max log size = 1000
# początek zasobu publiczny, widocznego jako \\serwer\publiczny
[publiczny]
# komentarz/opis zasobu
comment = Zasob egzaminacyjny
# rzeczywisty katalog na dysku Linux
path = /home/publiczny
# zasób ma być widoczny podczas przeglądania sieci
browseable = yes
# zasób ma pozwalać na zapis
read only = no
# tylko użytkownicy uwierzytelnieni, bez gościa
guest ok = no
# tylko wskazany użytkownik ma dostęp do zasobu
valid users = egzamin
# prawa nowo tworzonych plików
create mask = 0660
# prawa nowo tworzonych katalogów
directory mask = 0770
```

W `smb.conf` parametr ma postać `klucz = wartość`. Sekcja zaczyna się od `[nazwa]` i działa do następnej sekcji. Wcięcia nie są wymagane, ale poprawiają czytelność.

## 3. Test konfiguracji, hasło SMB, start usług

```bash
sudo testparm -s                                 # sprawdź składnię smb.conf bez pytania o Enter
sudo smbpasswd -a egzamin                        # ustaw osobne hasło Samby dla istniejącego użytkownika egzamin
sudo systemctl restart smbd nmbd                 # zrestartuj demon SMB i demon nazw NetBIOS
sudo systemctl enable smbd nmbd                  # włącz autostart obu usług Samby
systemctl status smbd                            # pokaż stan głównej usługi SMB
ss -tln                                          # sprawdź nasłuch TCP; Samba używa portów 139 i 445
```

## 4. Jak podłączyć z Windows

Na stacji Windows użyj w Eksploratorze adresu `\\ADRES_SERWERA\publiczny` albo zmapuj dysk. Login: `egzamin`; hasło: to ustawione przez `smbpasswd`, nie koniecznie hasło logowania do Linuxa.

## Częste błędy

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `testparm: [global] section missing in /etc/samba/smb.conf` | brak sekcji `[global]` | dodaj ją na początku pliku |
| `testparm: syntax error in /etc/samba/smb.conf line ...` | linia nie jest sekcją ani `klucz = wartość` | popraw wskazaną linię |
| `testparm: parameter outside section in /etc/samba/smb.conf line ...` | parametr stoi przed pierwszą sekcją | przenieś go do `[global]` albo zasobu |
| `smbpasswd: user 'egzamin' does not exist.` | nie ma linuksowego konta | najpierw `sudo useradd -m egzamin` |
| `smbpasswd: Mismatch - password unchanged.` | dwa hasła wpisane różnie | powtórz dokładnie to samo hasło |
| `Unit smbd.service could not be found.` | pakiet Samby nie jest zainstalowany | `sudo apt install samba` |
| klient nie widzi zasobu | zły `path`, usługa nie działa albo `valid users` nie pasuje | `testparm -s`, `systemctl status smbd`, `ls -ld` |

## Jak sprawdzić

```bash
sudo testparm -s                                 # wypisz załadowaną konfigurację bez błędu
systemctl is-active smbd                         # sprawdź, czy demon SMB jest active
systemctl is-enabled smbd                        # sprawdź, czy autostart SMB jest enabled
ls -ld /home/publiczny                           # sprawdź katalog zasobu
ss -tln                                          # sprawdź porty TCP 139 i 445
```

Oczekiwany fragment:

```text
Loaded services file OK.
active
enabled
drwxrwx--- ... egzamin egzamin ... /home/publiczny
LISTEN ... *:445
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `skonfiguruj serwer Samba` | `smb.conf`, `testparm -s`, restart `smbd` |
| `udostępnij katalog ...` | `[nazwa]` + `path = katalog` |
| `zasób ma być dostępny do zapisu` | `read only = no` |
| `dostęp tylko dla użytkownika ...` | `valid users = login` + `smbpasswd -a login` |
| `grupa robocza WORKGROUP` | `workgroup = WORKGROUP` w `[global]` |
| `usługa ma uruchamiać się automatycznie` | `sudo systemctl enable smbd nmbd` |
