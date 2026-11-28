# Linux: сеть через netplan (Ubuntu Server)

## Как читать команду

```text
sudo ip -br address show dev enp0s3
│    │  │   │       │    │   └─ CEL: tylko interfejs enp0s3
│    │  │   │       │    └─ słowo-klucz «dev» = device, urządzenie
│    │  │   │       └─ akcja: show = pokazać
│    │  │   └─ obiekt: address = adresy IP
│    │  └─ opcja: -br = brief, krótko; minus + litera
│    └─ program: ip — steruje adresami, interfejsami i trasami
└─ wykonaj jako administrator (poprosi o hasło administratora)
```

- **Program** — pierwsze słowo po `sudo`: `ip`, `netplan`, `hostnamectl`.
- **Opcja** — minus + litera: `-br`, `-4`. Po niej czasem stoi jej wartość.
- **Obiekt i akcja** — u `ip` najpierw obiekt (`address`, `link`, `route`), potem akcja (`show`, `add`, `del`).
- Cel (`dev enp0s3`) prawie zawsze jest na końcu.
- Wielkość liter ma znaczenie; `enp0s3` trzeba przepisać dokładnie z wyniku `ip -br link`.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zobaczyć interfejsy i adresy | `ip` | internet protocol |
| zmienić adres na stałe | `netplan` | plan sieci Ubuntu — czyta YAML i ustawia system |
| edytować plik konfiguracyjny | `nano` | mały edytor terminalowy |
| zastosować konfigurację | `netplan apply` | apply = zastosuj |
| sprawdzić błędy bez zmian | `netplan generate` | generate = wygeneruj konfigurację testowo |
| zmienić nazwę hosta | `hostnamectl` | hostname control |
| sprawdzić łączność | `ping` | dźwięk sonaru; wysyła ICMP echo |

## Program `ip`

| Opcja/fragment | Za co odpowiada litera/słowo | Co robi | Przykład |
|---|---|---|---|
| `-4` | IPv**4** | pokazuje tylko IPv4 | `ip -4 a` |
| `-br` | **br**ief | krótszy wynik | `ip -br a` |
| `a`, `address` | address | adresy IP | `ip address show` |
| `l`, `link` | link | warstwa interfejsu: up/down, MAC | `ip link show` |
| `r`, `route` | route | trasy/brama | `ip route show` |
| `dev` | device | wybiera urządzenie | `dev enp0s3` |
| `set ... up/down` | up/down | włącza/wyłącza interfejs do restartu | `sudo ip link set enp0s8 down` |

## Program `netplan`

| Polecenie | Znaczenie | Co robi |
|---|---|---|
| `netplan generate` | generate = generuj | sprawdza YAML i zgłasza błąd bez zmiany sieci |
| `netplan apply` | apply = zastosuj | zastosowuje plik z `/etc/netplan` |
| `sudo nano plik.yaml` | edytor | zapisuje plik konfiguracyjny |

## 1. Najpierw nazwy interfejsów

```bash
ip -br link                                      # pokaż krótko interfejsy, MAC i stan UP/DOWN
ip -br address                                   # pokaż krótko, który interfejs ma już jaki adres IPv4
ls /etc/netplan                                  # pokaż nazwę pliku netplan, zwykle 50-cloud-init.yaml
```

Nie zgaduj nazwy. `enp0s3` i `enp0s8` to tylko przykład: w VirtualBoxie zwykle pierwsza karta to `enp0s3`, druga `enp0s8`.

## 2. Pełny plik netplan z komentarzem do każdej linii

```bash
sudo nano /etc/netplan/50-cloud-init.yaml        # otwórz plik netplan jako administrator
```

<!-- file: /etc/netplan/50-cloud-init.yaml -->
```yaml
# korzeń pliku: wszystko dotyczy sieci
network:
  # wersja formatu netplan; na Ubuntu Server zawsze 2
  version: 2
  # sekcja kart przewodowych Ethernet
  ethernets:
    # nazwa pierwszego interfejsu dokładnie jak w ip -br link
    enp0s3:
      # false = nie pobieraj adresu automatycznie przez DHCP
      dhcp4: false
      # lista adresów; /29 to maska sieci, nie numer hosta
      addresses:
        # adres serwera z maską /29
        - 90.90.0.3/29
      # lista tras statycznych
      routes:
        # default = trasa domyślna, czyli brama domyślna
        - to: default
          # adres bramy musi należeć do tej samej sieci co 90.90.0.3/29
          via: 90.90.0.1
    # nazwa drugiego interfejsu; często idzie do przełącznika/ LAN
    enp0s8:
      # drugi interfejs też ma adres statyczny
      dhcp4: false
      # zapis w jednej linii oznacza to samo co lista z myślnikiem
      addresses: [10.80.0.2/24]
      # serwery DNS tylko na interfejsie LAN, jeśli tak wymaga arkusz
      nameservers:
        # jeden serwer DNS; bez bramy, bo drugi interfejs nie prowadzi do internetu
        addresses: [10.80.0.2]
```

YAML czyta wcięcia jak drzewo. Używaj **tylko spacji**, zwykle 2 spacje na poziom. `enp0s3` i `enp0s8` są na tym samym poziomie. `dhcp4`, `addresses`, `routes` należą do interfejsu, więc są 2 spacje głębiej. Jeżeli linia ma jedną spację za dużo, `netplan` zgłosi błąd albo klucz trafi do złego rodzica.

```bash
sudo netplan generate                            # sprawdź składnię YAML bez zastosowania zmian
sudo netplan apply                               # zastosuj nowe adresy i trasy
ip -br address                                   # sprawdź, czy oba adresy są widoczne
ip route                                         # sprawdź trasę default i sieci podłączone
ping -c 2 90.90.0.1                              # wyślij 2 pakiety testowe do bramy; -c = count
```

## 3. Tylko jeden interfejs i DNS

```bash
sudo ip link set enp0s8 down                     # wyłącz drugi interfejs do restartu, jeśli arkusz tego wymaga
sudo hostnamectl set-hostname serwer             # ustaw nazwę hosta serwer
hostnamectl                                      # pokaż nazwę hosta i wersję systemu
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `Error in network definition: unknown key 'adresses'` | literówka: `adresses` zamiast `addresses` | popraw klucz i uruchom ponownie `netplan generate` |
| `50-cloud-init.yaml:13:0: Invalid YAML: found character that cannot start any token` | w YAML jest tabulator | zamień tabulatory na spacje |
| `Invalid YAML: mapping values are not allowed in this context` | złe wcięcie albo brak spacji po dwukropku | wyrównaj wcięcia jak w przykładzie |
| `Error: Nexthop has invalid gateway.` | brama `via` nie jest w sieci adresu interfejsu | policz sieć/maskę i popraw bramę |
| `Device "enp0s9" does not exist.` | wybrano interfejs, którego nie ma | zobacz nazwy przez `ip -br link` |
| `RTNETLINK answers: Operation not permitted` | zmiana interfejsu bez `sudo` | dodaj `sudo` |

## Как проверить

```bash
ip -br address                                   # pokaż adresy po konfiguracji
ip route                                         # pokaż bramę default i trasy
hostnamectl                                      # pokaż nazwę hosta
```

Oczekiwany fragment wyniku:

```text
enp0s3           UP             90.90.0.3/29
enp0s8           UP             10.80.0.2/24
default via 90.90.0.1 dev enp0s3 proto static
10.80.0.0/24 dev enp0s8 proto kernel scope link src 10.80.0.2
Static hostname: serwer
```

Egzaminator patrzy na stan końcowy: adres, maska, brama, DNS i nazwa hosta — nie na to, czy użyłeś `nano` czy innego edytora.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `Skonfiguruj interfejsy sieciowe serwera w systemie Linux` | `ip -br link`, netplan YAML, `sudo netplan apply` |
| `adres IP, maska, brama domyślna i serwer DNS` | `addresses: [IP/maska]`, `routes: - to: default via ...`, `nameservers:` |
| `interfejs LAN ... pozostałe interfejsy wyłączone` | poprawny interfejs w netplan, potem `sudo ip link set ... down` |
| `ustaw nazwę hosta` | `sudo hostnamectl set-hostname NAZWA` |
| `wyświetl konfigurację interfejsu sieciowego` | `ip -br address` albo pełne `ip address` |
