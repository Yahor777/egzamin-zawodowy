# Linux: trasy statyczne

## Jak czytać polecenie

```text
sudo ip route add 192.168.77.0/24 via 90.90.0.1
1    2  3     4   5               6   7
```

1. wymagane uprawnienia administratora
2. program: ip — konfiguruje routing
3. obiekt: route = tabela tras
4. akcja: add = dodaj trasę
5. CEL: sieć docelowa z maską /24
6. słowo «via» = przez którą bramę
7. WARTOŚĆ po «via»: brama/następny skok

- `/24` nie jest adresem hosta, tylko długością maski: `255.255.255.0`.
- `via` zawsze wskazuje **adres routera**, nie własny adres serwera.
- `default` oznacza trasę domyślną `0.0.0.0/0`.
- Polecenie `ip route add` działa tylko do restartu; stała trasa musi trafić do netplan.

## Jaki program wybrać

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zobaczyć trasy | `ip route` | internet protocol + route = trasa |
| dodać trasę tymczasowo | `ip route add` | add = dodaj |
| usunąć trasę tymczasową | `ip route del` | del/delete = usuń |
| zapisać trasę na stałe | `netplan` | trwała konfiguracja sieci Ubuntu |
| sprawdzić stare wyjście jak w Windows | `route -n` | route + numeric; wymaga pakietu net-tools |
| sprawdzić drogę do adresu | `ip route get` | get = policz, którędy pójdzie pakiet |

## Opcje i słowa programu `ip route`

| Opcja/słowo | Za co odpowiada | Co robi | Przykład |
|---|---|---|---|
| `add` | add = dodaj | dodaje trasę do restartu | `ip route add 10.0.0.0/24 via 192.168.1.1` |
| `del` | delete = usuń | usuwa dokładnie wskazaną trasę | `ip route del 10.0.0.0/24 via 192.168.1.1` |
| `replace` | replace = zamień | zmienia trasę bez błędu „już istnieje” | `ip route replace default via 192.168.1.1` |
| `show` | show = pokaż | wypisuje tablicę tras | `ip route show` |
| `get` | get = pobierz decyzję | pokazuje, jak system wyśle pakiet do IP | `ip route get 8.8.8.8` |
| `via` | przez | adres następnego skoku/routera | `via 90.90.0.1` |
| `dev` | device | interfejs wyjściowy | `dev enp0s3` |
| `-n` u `route` | numeric | nie zamienia numerów na nazwy | `route -n` |

## 1. Najpierw zobacz stan

```bash
ip route show                                    # pokaż wszystkie trasy IPv4
ip -br address                                   # sprawdź, jakie adresy mają interfejsy
```

## 2. Stała trasa w netplan

Załóżmy: serwer ma `90.90.0.3/29`, brama/router to `90.90.0.1`, a za routerem jest sieć `192.168.77.0/24`.

```bash
sudo nano /etc/netplan/50-cloud-init.yaml        # otwórz konfigurację netplan jako administrator
```

<!-- file: /etc/netplan/50-cloud-init.yaml -->
```yaml
# korzeń konfiguracji sieci
network:
  # wersja formatu netplan
  version: 2
  # interfejsy przewodowe
  ethernets:
    # nazwa interfejsu z wyniku ip -br link
    enp0s3:
      # adres statyczny, nie DHCP
      dhcp4: false
      # własny adres serwera wraz z maską /29
      addresses: [90.90.0.3/29]
      # trasy statyczne tego interfejsu
      routes:
        # trasa domyślna przez router 90.90.0.1
        - to: default
          # adres następnego skoku dla trasy domyślnej
          via: 90.90.0.1
        # sieć oddalona 192.168.77.0/24 też jest za tym routerem
        - to: 192.168.77.0/24
          # ta sama brama, bo to router zna drogę dalej
          via: 90.90.0.1
      # DNS nie jest wymagany dla samej trasy; zostawiony pusty przykład bez DNS
```

```bash
sudo netplan generate                            # sprawdź składnię tras przed zastosowaniem
sudo netplan apply                               # zastosuj stałe trasy z pliku netplan
ip route show                                    # sprawdź, czy 192.168.77.0/24 jest widoczna
```

## 3. Trasa tymczasowa — tylko do restartu

```bash
sudo ip route add 172.31.0.0/16 via 90.90.0.1    # dodaj tymczasową trasę do 172.31.0.0/16 przez bramę
ip route show                                    # zobacz trasę z proto boot, czyli dodaną ręcznie
sudo ip route del 172.31.0.0/16 via 90.90.0.1    # usuń tę samą tymczasową trasę
ip route get 192.168.77.20                       # sprawdź, przez którą bramę system wyśle pakiet
```

## 4. Jak czytać `ip route`

```text
default via 90.90.0.1 dev enp0s3 proto static
│       │   │          │          └─ skąd trasa: static = z netplan
│       │   │          └─ wyjście przez interfejs enp0s3
│       │   └─ następny skok/router
│       └─ słowo «via»
└─ trasa domyślna: wszystko, co nie pasuje dokładniej

192.168.77.0/24 via 90.90.0.1 dev enp0s3 proto static
└─ do tej sieci idziemy przez router, nie bezpośrednio

10.80.0.0/24 dev enp0s8 proto kernel scope link src 10.80.0.2
└─ sieć podłączona bezpośrednio; brama nie jest potrzebna
```

## Częste błędy

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `Error: Nexthop has invalid gateway.` | adres po `via` nie leży w żadnej bezpośrednio podłączonej sieci | popraw własny IP/maskę albo bramę |
| `RTNETLINK answers: File exists` | taka trasa już istnieje | użyj `replace` albo najpierw `del` |
| `RTNETLINK answers: No such process` | próbujesz usunąć trasę, której nie ma | sprawdź dokładny zapis przez `ip route show` |
| `Error: inet prefix is expected rather than "192.168.77".` | brak maski w zapisie sieci | dopisz `/24`, `/16` itd. |
| `route must include both a 'to' and 'via' IP` | w netplan jest `to`, ale nie ma `via` | dopisz `via` z poprawną bramą |
| `invalid IPv4 address '90.90.0.999'` | oktett IP większy niż 255 | popraw adres bramy |

## Jak sprawdzić

```bash
ip route show                                    # pokaż finalną tablicę tras
ip route get 192.168.77.20                       # pokaż decyzję routingu dla hosta z sieci oddalonej
ping -c 2 90.90.0.1                              # sprawdź najpierw samą bramę; -c = count
```

Oczekiwany fragment:

```text
default via 90.90.0.1 dev enp0s3 proto static
192.168.77.0/24 via 90.90.0.1 dev enp0s3 proto static
192.168.77.20 via 90.90.0.1 dev enp0s3 src 90.90.0.3 uid 1000
```

`proto boot` przy trasie z `ip route add` oznacza trasę tymczasową. `proto static` oznacza trasę z konfiguracji netplan.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `skonfiguruj bramę domyślną` | w netplan `to: default` i `via: <adres routera>` |
| `dodaj trasę statyczną do sieci ...` | w netplan kolejne `- to: sieć/maska` i `via: brama` |
| `wyświetl tablicę routingu` | `ip route show` |
| `sprawdź łączność z interfejsem LAN rutera` | `ping -c 4 <adres bramy>` |
| `zapisz użyte polecenie z wszystkimi opcjami` | zapisz dokładnie np. `sudo ip route add 192.168.77.0/24 via 90.90.0.1` |
