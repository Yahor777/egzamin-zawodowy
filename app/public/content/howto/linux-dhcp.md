# Linux: DHCP-сервер (isc-dhcp-server)

## Как читать команду

```text
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf
│    │     │  │   └─ WARTOŚĆ opcji -cf: ścieżka do pliku konfiguracyjnego
│    │     │  └─ opcja -cf = config file; litera c + f razem oznaczają plik konfiguracji
│    │     └─ opcja -t = test; sprawdź konfigurację bez uruchamiania serwera
│    └─ program: dhcpd = DHCP daemon, demon/usługa DHCP
└─ uruchom jako administrator
```

- Demon to program działający w tle; końcówka **d** w `dhcpd` znaczy **daemon**.
- `-t` nie ma wartości — to przełącznik testu.
- `-cf` ma wartość — po spacji podajesz plik.
- Najpierw testuj `dhcpd -t`, dopiero potom restartuj usługę.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zainstalować serwer DHCP | `apt` | advanced package tool — instalator pakietów |
| ustawić adres IP serwera | `netplan` | stała konfiguracja sieci Ubuntu |
| edytować konfigurację DHCP | `nano` | edytor terminalowy |
| sprawdzić składnię `dhcpd.conf` | `dhcpd` | DHCP daemon |
| uruchomić/zatrzymać usługę | `systemctl` | systemd control |
| zobaczyć porty usługi | `ss` | socket statistics |
| zobaczyć błędy usługi | `journalctl` | journal control — dziennik systemd |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `dhcpd` | `-t` | **t**est | testuje konfigurację | `dhcpd -t` |
| `dhcpd` | `-cf` | **c**onfig **f**ile | wskazuje plik konfiguracji | `dhcpd -t -cf /etc/dhcp/dhcpd.conf` |
| `systemctl` | `start` | start | uruchamia usługę teraz | `systemctl start isc-dhcp-server` |
| `systemctl` | `restart` | restart | zatrzymuje i uruchamia ponownie | `systemctl restart isc-dhcp-server` |
| `systemctl` | `enable` | enable = włącz | dodaje autostart po restarcie | `systemctl enable isc-dhcp-server` |
| `systemctl` | `--now` | now = teraz | razem z `enable`: autostart i start od razu | `systemctl enable --now ssh` |
| `ss` | `-t` | **T**CP | pokazuje gniazda TCP | `ss -tln` |
| `ss` | `-u` | **U**DP | pokazuje gniazda UDP | `ss -u` |
| `ss` | `-l` | **l**istening | tylko nasłuchujące | `ss -l` |
| `ss` | `-p` | **p**rocess | pokazuje proces | `sudo ss -tulpn` |
| `journalctl` | `-u` | **u**nit | logi jednej usługi | `journalctl -u isc-dhcp-server` |
| `journalctl` | `-n` | **n** lines | liczba ostatnich linii | `journalctl -u ssh -n 20` |

## 1. DHCP nie może mieć adresu z DHCP

Serwer DHCP musi mieć **statyczny** adres w tej sieci, którą obsługuje.

```bash
sudo apt install isc-dhcp-server                 # zainstaluj pakiet serwera DHCP; jeśli jest, apt to potwierdzi
ip -br link                                      # sprawdź nazwy interfejsów przed edycją netplan
sudo nano /etc/netplan/50-cloud-init.yaml        # ustaw statyczny adres interfejsu LAN
```

<!-- file: /etc/netplan/50-cloud-init.yaml -->
```yaml
# korzeń konfiguracji sieci
network:
  # wersja formatu netplan
  version: 2
  # karty przewodowe
  ethernets:
    # interfejs do routera/internetu
    enp0s3:
      # adres statyczny zamiast DHCP
      dhcp4: false
      # adres serwera po stronie WAN z maską /29
      addresses: [90.90.0.3/29]
      # trasy tego interfejsu
      routes:
        # brama domyślna prowadzi przez router
        - to: default
          # adres routera WAN
          via: 90.90.0.1
    # interfejs do przełącznika i klientów LAN
    enp0s8:
      # ten interfejs też musi być statyczny
      dhcp4: false
      # adres serwera DHCP w sieci 10.80.0.0/24
      addresses: [10.80.0.2/24]
      # DNS tego serwera, jeśli arkusz go wymaga
      nameservers:
        # serwer sam jest DNS albo wskazuje siebie zgodnie z zadaniem
        addresses: [10.80.0.2]
```

```bash
sudo netplan apply                               # zastosuj statyczne adresy przed startem DHCP
ip -br address                                   # sprawdź, czy 10.80.0.2/24 istnieje na enp0s8
```

## 2. Pełny `/etc/dhcp/dhcpd.conf`

```bash
sudo nano /etc/dhcp/dhcpd.conf                   # otwórz główny plik konfiguracji DHCP
```

<!-- file: /etc/dhcp/dhcpd.conf -->
```dhcpd
# serwer jest autorytatywny dla tej sieci; w arkuszach CKE prawie zawsze wymagane
authoritative;
# początek deklaracji sieci, której dotyczy pul adresów
subnet 10.80.0.0 netmask 255.255.255.0 {
  # pierwszy i ostatni adres puli dla klientów
  range 10.80.0.10 10.80.0.30;
  # brama domyślna przekazywana klientom
  option routers 10.80.0.2;
  # serwery DNS przekazywane klientom
  option domain-name-servers 10.80.0.2;
  # sufiks domeny przekazywany klientom; nazwa w cudzysłowie
  option domain-name "egzamin.edu";
  # adres rozgłoszeniowy sieci /24
  option broadcast-address 10.80.0.255;
  # normalny czas dzierżawy: 3600 sekund = 1 godzina
  default-lease-time 3600;
  # maksymalny czas dzierżawy: 10800 sekund = 3 godziny
  max-lease-time 10800;
# koniec bloku subnet
}
```

Każde polecenie kończy się średnikiem `;`, oprócz linii z `{` i `}`. `subnet ... {` otwiera blok; wszystkie opcje do klientów tej sieci są w środku. Nie przestawiaj `range` poza blok — wtedy dhcpd nie wie, do jakiej sieci należy pula.

## 3. Na którym interfejsie nasłuchiwać

```bash
sudo nano /etc/default/isc-dhcp-server           # otwórz plik ustawień startowych usługi DHCP
```

<!-- file: /etc/default/isc-dhcp-server -->
```sh
# plik jest czytany przy starcie usługi isc-dhcp-server
# cudzysłów jest wymagany nawet dla jednej nazwy
# tutaj podaj interfejs do klientów LAN, nie interfejs do routera
INTERFACESv4="enp0s8"
# IPv6 nie jest używane w typowym arkuszu INF.02
INTERFACESv6=""
```

```bash
grep INTERFACESv4 /etc/default/isc-dhcp-server   # sprawdź, czy usługa nasłuchuje na enp0s8
```

## 4. Test, start, autostart

```bash
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf           # przetestuj składnię dhcpd.conf bez uruchamiania serwera
sudo systemctl restart isc-dhcp-server           # uruchom ponownie usługę z nową konfiguracją
sudo systemctl enable isc-dhcp-server            # włącz autostart usługi po restarcie serwera
systemctl status isc-dhcp-server                 # pokaż stan usługi i ostatnie logi
ss -tulpn                                        # pokaż nasłuchujące porty UDP/TCP; DHCP używa UDP 67
sudo journalctl -u isc-dhcp-server -n 20         # pokaż 20 ostatnich komunikatów usługi DHCP
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `/etc/dhcp/dhcpd.conf line 4: semicolon expected.` | brak `;` na końcu linii, najczęściej po `range` | dopisz średnik i zrób `dhcpd -t` |
| `No subnet declaration for enp0s8 (10.80.0.2).` | w `dhcpd.conf` nie ma `subnet` pasującej do adresu interfejsu | sprawdź adres interfejsu i adres sieci w `subnet` |
| `Not configured to listen on any interfaces!` | `INTERFACESv4` jest pusty albo wskazuje zły interfejs | ustaw `INTERFACESv4="enp0s8"` |
| `Job for isc-dhcp-server.service failed because the control process exited with error code.` | systemd nie mógł uruchomić dhcpd | czytaj `journalctl -u isc-dhcp-server` i popraw konfigurację |
| `Can't open /etc/dhcp/dhcpd.conf: Permission denied` | test czy edycja bez `sudo` | uruchom edytor/test przez `sudo` |
| `authoritative` zaczyna się od `#` | linia jest komentarzem i nie działa | usuń `#` z początku |

## Как проверить

```bash
systemctl is-active isc-dhcp-server              # wypisz słowo active, jeśli usługa działa
systemctl is-enabled isc-dhcp-server             # wypisz enabled, jeśli autostart jest włączony
ss -u -l -n                                      # pokaż nasłuch UDP; szukaj 0.0.0.0:67
```

Oczekiwany fragment:

```text
active
enabled
udp UNCONN 0 0 0.0.0.0:67 0.0.0.0:*
```

Na Windows klient powinien dostać adres z `10.80.0.10–10.80.0.30`, bramę `10.80.0.2`, DNS `10.80.0.2` i sufiks `egzamin.edu`.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `uruchom serwer DHCP na interfejsie podłączonym do przełącznika` | `INTERFACESv4="enp0s8"` + `systemctl restart isc-dhcp-server` |
| `serwer DHCP ma być autorytatywny` | linia `authoritative;` bez `#` |
| `pula adresów ..., maska ..., brama ..., DNS ...` | `range`, `option routers`, `option domain-name-servers` |
| `czas dzierżawy 1 godzina, maksymalny 3 godziny` | `default-lease-time 3600;`, `max-lease-time 10800;` |
| `adres rozgłoszeniowy` | `option broadcast-address 10.80.0.255;` |
| `nazwa domeny egzamin.edu` | `option domain-name "egzamin.edu";` |
