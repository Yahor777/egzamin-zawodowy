# Jak rozpoznać sprzęt, złącza i oznaczenia (identyfikacja sprzętu)

Ta strona pomaga w sytuacji, gdy w arkuszu CKE widzisz `DDR4-3200`, `SATA III`, `PCIe x16`, `U/UTP kat. 6` i nie wiesz, co to oznacza ani gdzie tego szukać. Najpierw przeczytaj oznaczenie, potem wypełniaj tabelę.

## Jak czytać pozycję z cennika

```
Pamięć RAM Kingston 16GB, 1x16GB, 3200MHz, DDR4
1      2   3        4     5       6        7
```

1. pozycja w cenniku
2. rodzaj podzespołu: pamięć operacyjna
3. producent
4. łączna pojemność zestawu
5. jeden moduł 16 GB
6. szybkość modułu
7. typ pamięci: DDR4

W nawiasach bywa krócej: `(DIMM DDR4, 2666 MHz)` albo `DDR4-2666 (PC4-21333)`. To ten sam parametr, tylko zapisany inaczej.

## Oznaczenie → co oznacza → jak odpowiadać w zadaniu

| Oznaczenie w arkuszu | Co oznacza prostymi słowami | Jak odpowiadać w zadaniu |
|---|---|---|
| `DDR3`, `DDR4`, `DDR5` | generacja pamięci RAM; moduły **nie są zamienne**, wcięcie jest w innym miejscu | w polu `typ pamięci` wpisz dokładnie `DDR4`; dobierając płytę sprawdź, czy obsługuje ten sam typ DDR |
| `DIMM` | długi moduł RAM do komputera stacjonarnego | nie mylić z `SO-DIMM` do laptopa |
| `SO-DIMM` | krótki moduł RAM do laptopa | nie wejdzie w zwykłe gniazdo DIMM |
| `8 GB (1x8GB)` | jeden moduł 8 GB | `liczba modułów: 1`, pojemność 8 GB |
| `16 GB (2x8GB)` | dwa moduły po 8 GB | dual channel zwykle jest możliwy we właściwych gniazdach |
| `3200 MHz`, `3200 MT/s` | efektywna szybkość pamięci | w CPU-Z `DRAM Frequency` wynosi około 1600 MHz — mnożymy przez 2 |
| `DDR4-3200` | DDR4 o szybkości 3200 MT/s | wybieraj płytę/procesor obsługujące DDR4 i taką częstotliwość |
| `PC4-25600` | inny zapis DDR4-3200: 25600 MB/s | `PC4` = DDR4; nie DDR5 |
| `PC3-12800` | DDR3-1600 | `PC3` = DDR3 |
| `CL16` | opóźnienie CAS latency; im mniejsze, tym szybsza reakcja | zwykle wystarczy przepisać `CL16`; nie mylić z częstotliwością |
| `1,2 V` | napięcie zasilania pamięci | przy zgodności porównuj z typem DDR |
| `SATA III` | złącze/interfejs dysku 6 Gb/s | HDD/SSD 2,5" i 3,5" podłączamy kablem SATA data i zasilaniem SATA |
| `SATA II` | starszy SATA 3 Gb/s | zgodny z SATA III, ale wolniejszy |
| `HDD` | mechaniczny dysk talerzowy | w parametrach szukaj `5400/7200 obr./min`, pojemności, SATA |
| `SSD` | dysk półprzewodnikowy bez części ruchomych | szybszy niż HDD; bywa SATA albo M.2/NVMe |
| `M.2` | małe złącze/format dysku na płycie | uwaga: M.2 bywa SATA i NVMe — czytaj dalszą część opisu |
| `M.2 PCIe NVMe` | szybki SSD działający przez linie PCIe | w odpowiedzi wpisz interfejs `NVMe/PCIe`, nie SATA |
| `NVMe 3.0 x4` | protokół NVMe, PCIe generacji 3, 4 linie | im większe `x`, tym szerszy kanał |
| `PCIe x16` | długie gniazdo/interfejs z 16 liniami; główne dla karty graficznej | kartę graficzną montuj w pierwszym długim PCIe x16 |
| `PCIe x1` | krótkie gniazdo dla karty sieciowej/dźwiękowej | kartę x1 można włożyć także do dłuższego gniazda |
| `PCI-E 8-pin (6+2)` | dodatkowe zasilanie karty graficznej | nie mylić z `EPS 8-pin` dla procesora |
| `ATX 24-pin (20+4)` | główny kabel zasilania płyty głównej | wpina się w najszersze złącze płyty |
| `EPS 12V 4/8-pin` | zasilanie procesora przy gnieździe CPU | nie wkładać zamiast PCIe 6+2 |
| `Molex` | stare złącze zasilania 4-pin | obecnie rzadkie, czasem do adapterów/wentylatorów |
| `USB 2.0` | wolny USB 480 Mb/s, często czarny | klawiatura/mysz — w porządku |
| `USB 3.0 / 3.1 Gen 1 / 3.2 Gen 1` | USB 5 Gb/s, często niebieski | to różne nazwy podobnej szybkości |
| `USB 3.1 Gen 2 / 3.2 Gen 2` | USB 10 Gb/s | szybsze niż Gen 1 |
| `USB-C` | kształt złącza, **nie gwarancja szybkości** | patrz obok na `Gen 1/Gen 2/Thunderbolt` |
| `Thunderbolt` | szybkie uniwersalne złącze, często USB-C | to nie jest zwykły USB-C |
| `RJ45` | gniazdo sieci Ethernet | pasuje do niego wtyk `8P8C`; potocznie oba nazywa się RJ45 |
| `8P8C` | wtyk z 8 stykami do skrętki | do zarabiania kabla sieciowego |
| `U/UTP` | skrętka bez ekranu | zwykły kabel sieciowy na egzaminie |
| `kat. 5e` | kategoria kabla do 1 Gb/s | wystarcza dla Gigabit Ethernet |
| `kat. 6` | wyższa kategoria, lepsza dla 1/10 Gb/s | jeśli wymagają kat. 6, nie bierz kat. 5e |
| `linka` | kabel wielodrutowy, giętki | używany do patchcordów |
| `drut` | kabel jednodrutowy, sztywny | używany do Keystone i panelu krosowego |
| `T568A`, `T568B` | dwa standardy kolejności kolorów | jeśli jest B — na module patrz na oznaczenie `B`; `T586B` w arkuszu to literówka, czytaj `T568B` |
| `HDMI` | obraz i dźwięk do monitora/TV | cyfrowe wyjście karty graficznej/płyty |
| `DisplayPort`, `DP` | cyfrowe wyjście wideo, często lepsze dla monitorów | nie mylić z USB-C, choć DP może działać przez USB-C |
| `DVI-D` | starsze cyfrowe wyjście wideo | bez dźwięku |
| `VGA` | stare analogowe niebieskie złącze wideo | najniższa jakość |
| `PS/2` | okrągłe złącze klawiatury/myszy | fioletowe — klawiatura, zielone — mysz |
| `s-1700`, `socket 1700`, `LGA1700` | socket procesora Intel | procesor i płyta muszą mieć ten sam socket |
| `AM4`, `s-AM4` | socket AMD Ryzen | AM4 nie jest zgodny z Intel LGA |
| `ATX`, `micro-ATX`, `Mini-ITX` | rozmiary płyty/obudowy | obudowa ATX zwykle przyjmuje micro-ATX i ITX; obudowa ITX — tylko małą płytę |
| `80 PLUS Bronze` | certyfikat sprawności zasilacza | to nie moc; moc sprawdź w watach `600 W` |
| `TDP 95 W`, `pobór mocy` | ile ciepła/energii pobiera podzespół | do obliczenia zasilacza sumuj moce i dodaj zapas |

## Jak rozpoznawać podzespoły wzrokowo

| Podzespół | Jak wygląda | Co sprawdzić przed montażem |
|---|---|---|
| Płyta główna | duża płytka ze slotami RAM, PCIe, SATA | socket procesora, typ DDR, format ATX/mATX/ITX |
| Procesor CPU | kwadratowa metalowa nakładka; od spodu styki lub nóżki | socket, znaczniki kierunku, nie dotykać styków |
| Pamięć RAM | długa wąska listwa z układami | DDR3/4/5, wcięcie-klucz, liczba modułów |
| Karta graficzna | duża karta z wentylatorem i złączami HDMI/DP | PCIe x16, dodatkowe zasilanie 6/8-pin |
| Karta sieciowa | mała karta z RJ45 lub antenami | zwykle PCIe x1; sterownik po uruchomieniu |
| HDD 3,5" | ciężka metalowa obudowa | SATA data + SATA power |
| SSD 2,5" | cienka lekka obudowa | te same kable SATA, mocowanie w zatoce 2,5" |
| SSD M.2 | mała listwa | klucz/typ SATA albo NVMe, śrubka mocująca |
| Zasilacz | metalowy blok z wiązką kabli | moc W, ATX 24-pin, EPS CPU, PCIe GPU, SATA power |
| Obudowa | skrzynka komputera | obsługa rozmiaru płyty, miejsca na dyski, długość karty graficznej |

## Złącza na tylnym panelu

- `PS/2` — okrągłe stare złącze klawiatury/myszy.
- `USB 2.0/3.x` — prostokątne USB; niebieskie często oznacza USB 3.x.
- `USB-C` — małe symetryczne owalne złącze; szybkość zależy od specyfikacji.
- `HDMI`, `DisplayPort`, `DVI`, `VGA` — wyjścia wideo. Jeżeli jest karta graficzna, monitor zwykle podłączamy **do karty**, nie do płyty.
- `RJ45` — gniazdo sieciowe z dwiema lampkami.
- `Audio` — okrągłe gniazda 3,5 mm: zielone — głośniki/słuchawki, różowe — mikrofon.
- `S/PDIF` — dźwięk cyfrowy, często optyczny.

## Gdzie sprawdzić parametry w systemie

Zasada egzaminacyjna: jeżeli arkusz wymaga zrzutu ekranu, wartość w tabeli musi być widoczna na zrzucie. Jeżeli wartości nie ma — wpisz `brak danych`, nie zgaduj.

| Parametr | Windows | Linux |
|---|---|---|
| procesor: model, rdzenie, procesory logiczne | `Menedżer zadań → Wydajność → Procesor CPU` albo `msinfo32` | `lscpu` |
| taktowanie podstawowe CPU | `Menedżer zadań → Szybkość podstawowa` | `sudo dmidecode -t processor` |
| RAM: rozmiar, szybkość, gniazda | `Menedżer zadań → Pamięć` | `free -h`, `sudo dmidecode -t memory` |
| płyta główna, BIOS | `msinfo32` | `sudo dmidecode -t baseboard`, `-t bios` |
| karta graficzna, VRAM | `dxdiag → Ekran` | `lspci \| grep -i vga` |
| dysk: model, pojemność, typ | `Menedżer zadań → Dysk`, `diskmgmt.msc` | `lsblk -d -o NAME,MODEL,SIZE,ROTA` |
| karta sieciowa, MAC | `ipconfig /all` | `ip link` |
| wersja systemu | `winver`, `msinfo32` | `cat /etc/os-release`, `uname -r` |

Pułapka: `free -h` i Windows czasem pokazują GiB, więc 16 GB może wyglądać jak 15,6 GiB. Przepisuj wartość z ekranu i nie zaokrąglaj „od siebie”, jeśli tabela wymaga dokładnego parametru.

## Jak odpowiadać na „spełnia / nie spełnia wymagań”

1. Wypisz każde wymaganie z arkusza.
2. Porównaj je z parametrem z systemu lub z etykiety.
3. Jeżeli **wszystkie** wymagania są spełnione — `spełnia wymagania`.
4. Jeżeli choć jedno nie jest spełnione — `nie spełnia wymagań` i krótko dlaczego.

Przykład zapisu:

```
Procesor: 6 rdzeni, 3,6 GHz — spełnia (wymagane min. 4 rdzenie, 3,0 GHz).
RAM: 8 GB — nie spełnia (wymagane 16 GB).
Wniosek: komputer nie spełnia wymagań, konieczna rozbudowa RAM do 16 GB.
```

Porównuj te same wielkości: taktowanie podstawowe z podstawowym, GB z GB, typ DDR z typem DDR. `Turbo` nie jest taktowaniem podstawowym.
