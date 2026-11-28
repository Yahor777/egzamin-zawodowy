# Linux Desktop: сеть через NetworkManager (nmcli)

## Как читать команду

```text
nmcli -p connection show IP_PC
│     │  │          │    └─ CEL: profil połączenia o nazwie IP_PC
│     │  │          └─ akcja: show = pokaż szczegóły
│     │  └─ obiekt: connection = profil połączenia
│     └─ opcja -p = pretty; ładniejszy, czytelny wynik
└─ program: nmcli = NetworkManager command line interface
```

- NetworkManager pracuje na **profilach**. Profil to zapisana konfiguracja: nazwa, interfejs, IP, brama, DNS.
- `connection` można skracać do `con`; `modify` do `mod`.
- Nazwa profilu ze spacją musi być w cudzysłowie: `"Wired connection 1"`.
- Na Ubuntu Server zwykle **nie ma** NetworkManagera — tam używa się netplan.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zarządzać siecią na Ubuntu Desktop | `nmcli` | NetworkManager command line interface |
| zobaczyć interfejsy i IP | `ip` | internet protocol |
| edytować profil tekstowo | `nano` | edytor; zwykle niepotrzebne, bo jest nmcli |
| tekstowe menu NetworkManagera | `nmtui` | NetworkManager text user interface |

## Opcje i skróty `nmcli`

| Opcja/słowo | Co znaczy | Co robi | Przykład |
|---|---|---|---|
| `-p` | **p**retty | czytelniejszy wynik | `nmcli -p con show IP_PC` |
| `-t` | **t**erse | wynik maszynowy, krótki | `nmcli -t con show` |
| `con`, `connection` | connection | profil połączenia | `nmcli con show` |
| `dev`, `device` | device | fizyczny interfejs | `nmcli dev status` |
| `show` | show | pokaż | `nmcli con show` |
| `mod`, `modify` | modify | zmień profil | `nmcli con mod IP_PC ipv4.dns 8.8.8.8` |
| `up` | up | aktywuj profil | `nmcli con up IP_PC` |
| `down` | down | dezaktywuj profil | `nmcli con down IP_PC` |
| `add` | add | dodaj nowy profil | `nmcli con add ...` |
| `delete` | delete | usuń profil | `nmcli con delete IP_PC` |

## 1. Zobacz stan i nazwę profilu

```bash
nmcli general                                    # pokaż ogólny stan NetworkManagera i łączności
nmcli device status                              # pokaż interfejsy, typ, stan i aktywny profil
nmcli connection show                            # wypisz wszystkie profile połączeń
ip -br address                                   # porównaj profile z faktycznymi adresami IP
```

Domyślny profil często nazywa się `Wired connection 1`. To **nie jest** nazwa interfejsu. Interfejs to np. `enp0s3`.

## 2. Zmień nazwę profilu i ustaw statyczny adres

```bash
nmcli con mod "Wired connection 1" connection.id IP_PC           # zmień nazwę profilu na IP_PC
nmcli con mod IP_PC ipv4.method manual ipv4.addresses 192.168.16.15/24 ipv4.gateway 192.168.16.1 ipv4.dns "8.8.8.8 8.8.4.4"  # ustaw statyczny adres, bramę i DNS w profilu
nmcli connection up IP_PC                                        # aktywuj profil, żeby zastosować ustawienia
ip -4 address show enp0s3                                        # sprawdź adres IPv4 na interfejsie
ip route                                                         # sprawdź bramę domyślną
```

Znaczenie pól:

| Pole | Znaczenie |
|---|---|
| `connection.id` | nazwa profilu |
| `ipv4.method manual` | adres ręczny/statyczny |
| `ipv4.method auto` | adres z DHCP |
| `ipv4.addresses` | adres IP z maską, np. `192.168.16.15/24` |
| `ipv4.gateway` | brama domyślna |
| `ipv4.dns` | serwery DNS; kilka w cudzysłowie przez spację |
| `+ipv4.dns` | dodaj kolejny DNS bez kasowania starych |
| `-ipv4.dns` | usuń wskazany DNS |

## 3. Dodaj i usuń DNS

```bash
nmcli con mod IP_PC +ipv4.dns 1.1.1.1            # dodaj serwer DNS 1.1.1.1 do istniejącej listy
nmcli -p con show IP_PC                          # pokaż szczegóły profilu w czytelnym formacie
nmcli con mod IP_PC -ipv4.dns 1.1.1.1            # usuń serwer DNS 1.1.1.1 z profilu
nmcli connection down IP_PC                      # dezaktywuj profil przed ponownym zastosowaniem
nmcli connection up IP_PC                        # aktywuj profil ponownie po zmianach
```

## 4. Plik profilu NetworkManagera

NetworkManager zapisuje profil w `/etc/NetworkManager/system-connections/NAZWA.nmconnection`. Normalnie nie edytujesz go ręcznie — edycja przez `nmcli` jest bezpieczniejsza.

```bash
sudo cat /etc/NetworkManager/system-connections/IP_PC.nmconnection  # pokaż zapisany profil IP_PC
```

Przykład z komentarzem do każdej linii:

```ini
# sekcja opisująca sam profil połączenia
[connection]
# nazwa profilu widoczna w nmcli
id=IP_PC
# losowy identyfikator profilu
uuid=8d2d7f10-1111-4222-8333-abcdefabcdef
# typ połączenia przewodowego
type=ethernet
# nazwa fizycznego interfejsu
interface-name=enp0s3
# profil ma włączać się automatycznie
autoconnect=true
# sekcja IPv4
[ipv4]
# manual = statyczna konfiguracja
method=manual
# adres z maską i brama po przecinku
address1=192.168.16.15/24,192.168.16.1
# serwery DNS rozdzielone średnikami
dns=8.8.8.8;8.8.4.4;
```

Wartości w pliku są w formacie `klucz=wartość`. Sekcja `[ipv4]` dotyczy tylko IPv4. Nie przestawiaj DNS do sekcji `[connection]`.

## 5. Powrót do DHCP

```bash
nmcli con mod IP_PC ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns ""  # przełącz profil z powrotem na DHCP
nmcli connection up IP_PC                                        # aktywuj profil po przełączeniu na auto
nmcli device show enp0s3                                         # pokaż aktualne IP, bramę i DNS interfejsu
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `Command 'nmcli' not found, but can be installed with:` | to Ubuntu Server albo brak NetworkManagera | na serwerze użyj netplan |
| `Error: unknown connection 'IP_PC'.` | literówka albo profil jeszcze nie zmieniony | zobacz dokładne nazwy przez `nmcli con show` |
| `Error: Failed to modify connection: ipv4.addresses: this property cannot be empty for 'method=manual'` | wybrano `manual`, ale nie podano adresu | dodaj `ipv4.addresses IP/maska` |
| `Error: argument 'modyfikuj' not understood. Try passing --help instead.` | polecenie nmcli musi być po angielsku | użyj `mod`, `show`, `up`, `down` |
| `Error: 'IP_PC' is not an active connection.`<br>`Error: no active connection provided.` | próbujesz `down` na wyłączonym profilu | najpierw zobacz stan przez `nmcli dev status` |

## Как проверить

```bash
nmcli device status                              # pokaż, czy enp0s3 jest connected i ma profil IP_PC
nmcli -p con show IP_PC                          # pokaż zapisane wartości profilu
ip -4 address show enp0s3                        # pokaż faktycznie ustawiony adres IPv4
ip route                                         # pokaż faktyczną bramę domyślną
```

Oczekiwany fragment:

```text
enp0s3  ethernet  connected  IP_PC
ipv4.method: manual
inet 192.168.16.15/24
default via 192.168.16.1 dev enp0s3
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `skonfiguruj przewodowy interfejs sieciowy` | `nmcli con mod ...` + `nmcli con up ...` |
| `ustaw nazwę połączenia LAN 3` | `nmcli con mod "Wired connection 1" connection.id "LAN 3"` |
| `adres IP, maska, brama i serwer DNS` | `ipv4.method manual ipv4.addresses ... ipv4.gateway ... ipv4.dns ...` |
| `adresowanie automatyczne` | `ipv4.method auto` i wyczyść addresses/gateway/dns |
| `wyświetl konfigurację interfejsu` | `nmcli device show enp0s3` albo `ip -4 a show enp0s3` |
