# Шпаргалка: кабели, монтаж компонентов, идентификация железа

Кабель — 77 % листов, монтаж компонента — 60 %, идентификация параметров — 92 %. Здесь же оценивают **«przebieg»** (процесс): инструменты, BHP/ESD, порядок на рабочем месте.

## 1. Цветовые схемы RJ45 (8P8C)

Защёлка вниз, контакты к себе, **pin 1 слева**.

| Pin | T568A | T568B | Сигнал 100BASE-TX |
|---|---|---|---|
| 1 | biało-zielony | **biało-pomarańczowy** | TX+ |
| 2 | zielony | **pomarańczowy** | TX− |
| 3 | biało-pomarańczowy | **biało-zielony** | RX+ |
| 4 | niebieski | niebieski | — |
| 5 | biało-niebieski | biało-niebieski | — |
| 6 | pomarańczowy | **zielony** | RX− |
| 7 | biało-brązowy | biało-brązowy | — |
| 8 | brązowy | brązowy | — |

Запоминалка: A и B отличаются только тем, что **пары зелёная и оранжевая поменялись местами** (пины 1-2 ↔ 3-6). Синяя (4-5) и коричневая (7-8) — всегда на месте.

| Тип кабеля | Концы | Где |
|---|---|---|
| Prosty (straight, «kabel krosowy prosty», patchcord) | B–B (или A–A) | ПК↔коммутатор, роутер↔коммутатор, патч-панель↔коммутатор |
| Skrosowany (crossover, «z przeplotem») | A–B | ПК↔ПК, коммутатор↔коммутатор (старые устройства без Auto-MDI/X) |

> В листах иногда опечатка «T586B» — это T568B.

## 2. Обжим патчкорда (wtyk 8P8C)

1. Отрезать кабель **U/UTP kat. 5e/6, linka** (многожильный — для патчкордов), длина ~1 м.
2. Снять оболочку ~3 см (*ściągacz izolacji*), не повредив жилы; срезать нить.
3. Раскрутить пары, выпрямить, разложить по схеме, **отрезать ровно ~12–13 мм**.
4. Вставить в коннектор до упора (жилы видны у торца, **оболочка заходит под фиксатор**).
5. Обжать *zaciskarką* (8P) до щелчка. То же со второй стороны.
6. Проверка тестером.

## 3. Патч-панель + Keystone (gniazdo naścienne)

Критерии оценки из `_zo` (одинаковые почти во всех листах):

- все жилы по нужной схеме (на модуле/панели есть цветная маркировка **A** и **B** — смотри нужную строку!);
- жилы выступают из оболочки **не более 25 мм**, пары раскручены **не более 13 мм**;
- для монтажа использован кабель **U/UTP typu drut** (одножильный — для инсталляции);
- гнездо собрано прочно (модуль защёлкнут в рамке, крышка);
- панель закреплена в шкафу/стойке RACK стабильно (4 винта с гайками-клетками), нужный порт (например, № 4);
- если требуется — органайзер кабелей, лишний кабель уложен в органайзер;
- тест тестером **в присутствии экзаминатора** — все 8 жил ОК.

Процесс: снять оболочку → разложить пары в прорези по цветам выбранной схемы, **не раскручивая пары до самого контакта** → забить *narzędziem uderowym LSA (punch-down)* ножом **наружу** (обрезает излишек) → закрыть колпачок модуля → защёлкнуть модуль в гнездо.

## 4. Тестер

| Индикация (master/remote) | Значит |
|---|---|
| 1-1, 2-2 … 8-8 по порядку | прямой кабель OK |
| 1-3, 2-6, 3-1, 6-2, 4-4, 5-5, 7-7, 8-8 | кроссовер (A–B) |
| Не загорается одна лампа | обрыв жилы (плохо обжата/не дошла) |
| Две горят одновременно | короткое замыкание |
| Порядок перепутан не по схеме | ошибка раскладки (split pair, A/B смешаны) |

Для панели+Keystone: тестер в порт панели и в гнездо через два коротких **заводских** патчкорда.

## 5. Монтаж компонентов + BHP/ESD

Общий порядок (за него дают баллы «przebieg»):

1. Выключить систему (*Zamknij*), **отключить кабель питания** (или выключатель на БП), нажать кнопку Power ~5 с — разрядить.
2. **Opaska antystatyczna** на запястье, зажим на неокрашенную часть корпуса; работать на антистатической мате.
3. Открыть корпус, компоненты держать за края, не касаться контактов и микросхем.
4. Смонтировать.
5. **Поднять руку → оценка монтажа ДО закрытия корпуса** (так в листе: «zgłoś gotowość… Po uzyskaniu zgody przystąp do dalszych czynności montażowych»).
6. Закрыть корпус, подключить, запустить, проверить в системе.
7. Убрать рабочее место (отдельный критерий «pozostawił uporządkowane stanowisko»).

| Компонент | Нюансы |
|---|---|
| RAM (DIMM) | раскрыть защёлки, совместить **вырез (klucz)** с перемычкой слота, вдавить двумя пальцами до щелчка защёлок. Тип DDR3/DDR4/DDR5 — несовместимы. Dual channel: слоты одного цвета (обычно A2+B2) |
| Dysk SATA (HDD/SSD 2,5"/3,5") | закрепить в отсеке винтами/салазками → кабель **SATA data** к плате + **SATA power** от БП. M.2 — под углом в слот, прижать винтом |
| Karta graficzna | слот **PCIe x16**, снять заглушку, защёлка слота, винт к корпусу, доп. питание 6/8-pin. Встроенную — отключить в BIOS (*Primary display / IGD*) или `devmgmt.msc` → *Wyłącz urządzenie*. Потом драйвер |
| Karta sieciowa | слот PCIe x1 (или любой PCIe), винт. Встроенную NIC — *BIOS: Onboard LAN = Disabled* или в Menedżerze urządzeń *Wyłącz* |

Проверка после монтажа: RAM — `Menedżer zadań → Pamięć` / `free -h`; диск — `diskmgmt.msc` / `lsblk`; GPU/NIC — `devmgmt.msc` (без жёлтого «!») / `lspci`.

## 6. Идентификация параметров — какой инструмент что показывает

Правило оценки: **значение в таблице листа должно совпадать со скриншотом** в указанной папке флешки. Нет данных — пиши «brak danych» (и это должно быть видно на скриншоте).

### Windows

| Параметр | Инструмент (где именно) |
|---|---|
| Система, версия (22H2), 64-bit | `winver`; `msinfo32` → *Nazwa systemu operacyjnego, Wersja, Typ systemu*; *Ustawienia → System → Informacje* |
| CPU: nazwa, taktowanie bazowe, rdzenie, procesory logiczne | *Menedżer zadań → Wydajność → Procesor*; CPU-Z → *CPU* (Name, Specification, Cores, Threads) |
| Wirtualizacja TAK/NIE | *Menedżer zadań → Procesor → Wirtualizacja: Włączone*; `msinfo32` → *Wirtualizacja włączona w oprogramowaniu układowym: Tak* |
| RAM: rozmiar, typ, częstotliwość, gniazda | Menedżer zadań → *Pamięć* (Szybkość, Użyte gniazda); CPU-Z → *Memory* (Type, Size, **Channel # Dual**, DRAM Frequency ×2 = MT/s) |
| RAM: producent, numer seryjny/part number | CPU-Z → *SPD* (Module Manuf., Part Number, Serial Number); `Get-CimInstance Win32_PhysicalMemory` |
| Płyta główna, BIOS | CPU-Z → *Mainboard*; `msinfo32` |
| Karta graficzna: producent, model, pamięć VRAM | `dxdiag` → *Ekran* (*Nazwa, Producent, Pamięć wyświetlania*); GPU-Z (*Name, Memory Size, Memory Type, Bus Width, DirectX Support*); Menedżer zadań → *GPU* (*Dedykowana pamięć GPU*) |
| Wersja DirectX | `dxdiag` → *System* |
| Rozdzielczość ekranu | *Ustawienia → System → Ekran*; `dxdiag` → *Ekran → Bieżący tryb wyświetlania* |
| Dysk: model, pojemność, typ (SSD/HDD), interfejs, S.M.A.R.T., temperatura | CrystalDiskInfo; *Menedżer zadań → Dysk*; `diskmgmt.msc`; `Get-PhysicalDisk` |
| Wolne miejsce | Eksplorator → *Ten komputer* |
| Karta sieciowa: producent, model, MAC, prędkość | `devmgmt.msc` → *Karty sieciowe → Właściwości*; `ipconfig /all` (*Opis, Adres fizyczny*); `getmac /v`; *Stan połączenia → Szybkość*; PCI-Z (vendor, device) |
| Karta Wi-Fi: standardy, pasma | `netsh wlan show drivers` (*Obsługiwane typy radia*) ; `netsh wlan show interfaces` |
| Pamięć wirtualna, wątki, % czasu zapisu | `msinfo32`; Menedżer zadań; `perfmon` |
| Nośnik USB: system plików, pojemność | ПКМ → *Właściwości*; `diskmgmt.msc` |

### Linux

| Параметр | Команда |
|---|---|
| Dystrybucja, wersja | `cat /etc/os-release` / `lsb_release -a` |
| Wersja jądra | `uname -r` |
| CPU | `lscpu` |
| RAM rozmiar | `free -h` |
| RAM typ, częstotliwość, producent, S/N | `sudo dmidecode -t memory` / `sudo lshw -C memory` |
| GPU | `lspci \| grep -i vga`, `sudo lshw -C display` |
| Dysk | `lsblk -d -o NAME,MODEL,SIZE,ROTA`, `sudo smartctl -i /dev/sda` |
| NIC + MAC | `ip link`, `sudo lshw -C network` |
| Max rozdzielczość | `xrandr` |

### Оценка «spełnia wymagania?»

Пиши вывод **с обоснованием по каждому параметру**: «Procesor Intel Core i5-10400 2,9 GHz — spełnia (wym. i3); RAM 8 GB — nie spełnia (wym. 16 GB); …; **Wniosek: NIE**, wymagana rozbudowa RAM do 16 GB». Частые ловушки: базовая частота vs. turbo (сравнивай **базовую**, если не сказано иначе), GB vs GiB, встроенная GPU без своей VRAM («brak danych»/«współdzielona»), Windows 10 vs 11, версия 21H2/22H2.

## 7. Блок питания (табличка)

Читай с наклейки: *Moc maksymalna (W)*, *Napięcie wejściowe (V AC)*, *Prąd na liniach +3,3 V/+5 V/+12 V (A)*, *Moc łączna +12 V*, sertyfikat (80 PLUS Bronze). Расчёт в таблице: сумма мощностей компонентов + 20 % запаса ≤ мощность БП.
