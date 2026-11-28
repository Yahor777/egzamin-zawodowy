# Linux: SSH (zdalny terminal)

## Как читать команду

```text
ssh -p 2222 administrator@localhost hostname
│   │  │    │                     └─ CEL: polecenie do wykonania na serwerze
│   │  │    └─ użytkownik@host: zaloguj jako administrator na localhost
│   │  └─ WARTOŚĆ opcji -p: port 2222
│   └─ opcja -p = port SSH serwera
└─ program: ssh = secure shell, bezpieczna powłoka zdalna
```

- `ssh` to klient. Usługa serwera nazywa się `ssh`/`sshd`; końcówka **d** = daemon.
- Jeżeli nie podasz `-p`, klient używa portu 22.
- Pierwszy zapis `administrator@localhost` to login i host, nie jeden adres email.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zainstalować serwer SSH | `apt` | advanced package tool |
| uruchomić serwer | `systemctl` | systemd control |
| edytować konfigurację serwera | `nano` | edytor |
| połączyć się z serwerem | `ssh` | secure shell |
| sprawdzić port | `ss` | socket statistics |
| zobaczyć logi | `journalctl` | journal control |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `ssh` | `-p` | **p**ort | wybiera port serwera | `ssh -p 2222 user@host` |
| `ssh` | `-l` | **l**ogin | podaje login osobno | `ssh -l administrator host` |
| `ss` | `-t` | **T**CP | gniazda TCP | `ss -t` |
| `ss` | `-l` | **l**istening | tylko nasłuch | `ss -lt` |
| `ss` | `-n` | **n**umeric | numery portów | `ss -tln` |
| `journalctl` | `-u` | **u**nit | logi jednostki | `journalctl -u ssh` |
| `journalctl` | `-n` | **n** lines | liczba linii | `journalctl -u ssh -n 20` |

## 1. Instalacja i uruchomienie

```bash
sudo apt install openssh-server                  # zainstaluj serwer SSH albo potwierdź, że jest zainstalowany
sudo systemctl enable --now ssh                  # włącz autostart SSH i uruchom usługę od razu
systemctl status ssh                             # pokaż stan usługi SSH
ss -tln                                          # sprawdź, na którym porcie TCP nasłuchuje SSH
```

## 2. Pełny `/etc/ssh/sshd_config` z komentarzem do każdej linii

```bash
sudo nano /etc/ssh/sshd_config                   # otwórz konfigurację serwera SSH jako administrator
```

<!-- file: /etc/ssh/sshd_config -->
```sshconfig
# dołącz dodatkowe pliki konfiguracji z katalogu sshd_config.d
Include /etc/ssh/sshd_config.d/*.conf
# port, na którym serwer ma nasłuchiwać; zmiana z 22 wymaga -p u klienta
Port 2222
# rodzina adresów: any oznacza IPv4 i IPv6
AddressFamily any
# nasłuchuj na wszystkich adresach IPv4 serwera
ListenAddress 0.0.0.0
# zabroń bezpośredniego logowania użytkownika root
PermitRootLogin no
# zezwól na logowanie hasłem; na egzaminie zwykle potrzebne
PasswordAuthentication yes
# wyłącz uwierzytelnianie interaktywne klawiatura, zostaje zwykłe hasło
KbdInteractiveAuthentication no
# użyj modułów PAM systemu do kontroli logowania
UsePAM yes
# zezwól na przekierowanie X11; nie jest kluczowe w INF.02
X11Forwarding yes
# nie pokazuj komunikatu motd po zalogowaniu
PrintMotd no
# akceptuj zmienne językowe klienta
AcceptEnv LANG LC_*
# włącz podsystem SFTP do przesyłania plików
Subsystem sftp /usr/lib/openssh/sftp-server
# zezwól logowanie tylko użytkownikowi administrator
AllowUsers administrator
```

Linie z `#` są komentarzami. W typowym pliku Ubuntu wiele linii zaczyna się od `#`, więc pokazują wartości przykładowe, ale nie działają. Jeśli chcesz zmienić wartość, usuń `#` i zostaw jedną aktywną linię.

```bash
sudo systemctl restart ssh                       # zastosuj nową konfigurację SSH
ss -tln                                          # sprawdź, czy nasłuchuje port 2222
sudo journalctl -u ssh -n 20                     # zobacz ostatnie logi usługi SSH
```

## 3. Połączenie klientem

```bash
ssh -p 2222 administrator@localhost hostname     # połącz się z lokalnym serwerem SSH i wykonaj hostname
ssh -p 2222 -l administrator localhost hostname  # to samo, ale login podany osobną opcją -l
```

Przy pierwszym połączeniu klient pyta o klucz hosta. Na egzaminowej maszynie wpisuje się `yes`, potem hasło użytkownika. Hasło podczas wpisywania nie jest widoczne.

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `ssh: connect to host localhost port 22: Connection refused` | usługa nie działa albo port jest inny | `systemctl restart ssh`, sprawdź `Port` i `ss -tln` |
| `ssh: connect to host 192.0.2.10 port 2222: Connection timed out` | host nie odpowiada albo zły adres | sprawdź IP i trasę |
| `Host key verification failed.` | przy pierwszym połączeniu nie wpisano `yes` | połącz ponownie i wpisz dokładnie `yes` |
| `Permission denied, please try again.` | złe hasło albo użytkownik nie ma prawa logowania | sprawdź login, hasło i `AllowUsers` |
| `administrator@localhost: Permission denied (publickey,password).` | trzy błędne próby albo konfiguracja zabrania logowania | popraw hasło/`AllowUsers` i spróbuj ponownie |
| `Unit ssh.service could not be found.` | pakiet serwera SSH nie jest zainstalowany | `sudo apt install openssh-server` |

## Как проверить

```bash
systemctl is-active ssh                          # wypisz active, jeśli usługa działa
systemctl is-enabled ssh                         # wypisz enabled, jeśli autostart działa
ss -tln                                          # sprawdź nasłuchujący port SSH
ssh -p 2222 administrator@localhost hostname     # wykonaj testowe polecenie przez SSH
```

Oczekiwany fragment:

```text
active
enabled
LISTEN ... *:2222
serwer
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `zainstaluj i uruchom serwer SSH` | `sudo apt install openssh-server`, `systemctl enable --now ssh` |
| `zmień port nasłuchiwania` | `Port 2222` + restart + `ssh -p 2222` |
| `zabroń logowania użytkownika root` | `PermitRootLogin no` |
| `zezwól tylko wskazanym użytkownikom` | `AllowUsers administrator jkowalski` |
| `sprawdź działanie zdalnego dostępu` | `ssh -p PORT user@host hostname` |
