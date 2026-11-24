# Аппаратное обеспечение ПК (Sprzęt komputerowy)

## Процессор (procesor, CPU)

| Блок | Польский термин | Что делает |
|---|---|---|
| ALU | jednostka arytmetyczno-logiczna | арифметика и логика |
| FPU | jednostka zmiennoprzecinkowa | операции с плавающей точкой |
| IU / CU | układ sterowania (Instruction Unit) | **pobiera rozkazy z pamięci**, декодирует, генерирует сигналы управления |
| Регистры | rejestry | быстрые ячейки из триггеров (przerzutniki typu D) |
| Флаговый регистр | rejestr flagowy (stanu) | флаги: знак, перенос, ноль, **parzystość** |
| Кэш | pamięć podręczna (cache L1/L2/L3) | буфер между медленной RAM и быстрым CPU; L1 — **самый короткий время доступа** |

- **CISC** — много сложных команд (duża liczba rozkazów, x86); **RISC** — мало простых команд (ARM).
- **Hyper-Threading** (Intel) — одно физическое ядро выполняет **два потока одновременно** (2 логических ядра).
- **Turbo Boost** (Intel) / Turbo Core / Precision Boost (AMD) — автоматическое повышение частоты при нагрузке.
- Маркировка Intel: `i7-4790K` → первая цифра после дефиса **4 = поколение (generacja)**; суффикс **K = odblokowany mnożnik (unlocked)** → разгон (overclocking); X/XE — экстремальные; U/H — мобильные; T — энергоэффективные.
- Квота времени процессора процессам выделяет **система (system operacyjny)**, не BIOS.
- `x2/4` в описании CPU = 2 ядра / 4 потока. TDP (W) — тепловыделение.

### Сокеты (gniazda procesora)

| Производитель | Сокет | Пример CPU |
|---|---|---|
| Intel (LGA — контакты в гнезде) | LGA 775 | Core 2 Duo, Pentium 4 |
| | LGA 1155 / 1156 | Core i 2–3 gen / 1 gen |
| | **LGA 1150** | Core i 4–5 gen (i3-4350, i7-4790), чипсеты H81/B85/Z97 |
| | LGA 1151 / 1200 / 1700 | Core 6–9 / 10–11 / 12–14 gen |
| | LGA 2011-v3 (X99), **LGA 2066** (X299) | HEDT, i5-7640X — s-2066 |
| | G2 (rPGA988B) — ноутбуки | **Intel Core i7** mobile |
| AMD (PGA — ножки на CPU) | AM2 → **AM2+** (обратно совместим) | Athlon 64 X2 |
| | **AM3+** | FX-6300, FX-8300 |
| | AM4 (Ryzen, A320/B450), AM5 (LGA, DDR5) | Ryzen |

- Перед заменой CPU (особенно в ноутбуке) **сначала проверить тип сокета и спецификацию płyty głównej** (поддержка BIOS/чипсетом).
- Монтаж LGA: открыть рычаг → рамку → вставить CPU по ключу (треугольник) → закрыть → **pasta termoprzewodząca** → кулер → подключить вентилятор к CPU_FAN.

## Чипсет и материнская плата (chipset, płyta główna)

- **Chipset** — отвечает за обмен данными CPU ↔ остальные элементы платы. Классически: **mostek północny (northbridge, MCH)** — CPU ↔ RAM ↔ шина видеокарты (AGP/PCIe x16); **mostek południowy (southbridge, ICH)** — SATA, USB, PCI, звук, LAN. Сейчас — один PCH; контроллер памяти в CPU.
- Перегрев чипсета → зависания и рестарты.
- Форм-факторы: **ATX** 305×244 мм, **microATX** 244×244, **mini-ITX** 170×170 (обязателен для корпусов **SFF**).
- **S/PDIF** — цифровой аудиовыход (cyfrowe złącze audio). **PXE** (Preboot Execution Environment) — загрузка по сети (бездисковые станции, WDS).
- Звуковая карта: **DAC** (przetwornik cyfrowo-analogowy) — воспроизведение MP3; ADC — запись; DSP. GPU в звуковой карте нет.
- Видеокарта: GPU, VRAM (GDDR3/5/6, HBM), **RAMDAC** — цифра → аналог (для VGA). OpenGL/DirectX — API графики. **SLI** (NVIDIA) и **CrossFire(X)** (AMD) — объединение **двух+ видеокарт**.

## Оперативная память (pamięć operacyjna, RAM)

| Тип | Напряжение | Контакты DIMM / SO-DIMM | Примечание |
|---|---|---|---|
| SDR SDRAM | 3,3 V | 168 / 144 | одно зб. такта |
| **DDR** | 2,5 V | 184 / 200 | **оба фронта такта (wznoszące i opadające zbocze)** |
| DDR2 | 1,8 V | 240 / 200 | |
| DDR3 | **1,5 V** | 240 / 204 | |
| **DDR3L** | **1,35 V** | 240 / 204 | низковольтная (JEDEC) |
| **DDR4** | **1,2 V** | 288 / 260 | |
| DDR5 | 1,1 V | 288 / 262 | |

- Модули разных поколений **механически несовместимы** (ключ в разном месте).
- Ноутбук: **SO-DIMM**. Замена DDR3-1066 1,5 V → можно **DDR3-1333 SO-DIMM 1,5 V** (более быстрая работает на меньшей частоте).
- **ECC** — коррекция ошибок (серверы); **Registered / Load Reduced (LRDIMM)** — серверные. Плата X99 с ECC → модуль DDR4-2133 ECC LRDIMM.
- **Dual/Quad channel** — модули в одном банке должны быть **одинаковыми** (pojemność, częstotliwość, timingi).
- Перед апгрейдом проверить: тип, max ёмкость, число слотов, поддерживаемые частоты.

### Расчёт пропускной способности (przepustowość)

Шина модуля = 64 бит = **8 байт**.
`przepustowość [MB/s] = częstotliwość efektywna [MT/s] × 8 B`

- DDR3-1600: 1600 × 8 = 12 800 MB/s → обозначение **PC3-12800**.
- **PC3-16000** → 16 000 MB/s ≈ **16 GB/s** (это DDR3-2000).
- DDR4-2133: 2133 × 8 ≈ 17 064 → PC4-17000.
- Dual channel: умножить на 2.

### Тайминги (timingi)

Запись `CL-tRCD-tRP-tRAS`, напр. 15-15-15-35.
- **CL (CAS Latency)** — **czas dostępu**: такты от команды чтения до выдачи данных. Меньше = быстрее.
- Время в нс = CL / (частота реальная) → DDR4-2133 CL15: 15 / 1066,5 MHz ≈ 14 нс.

### Иерархия памяти и ROM

- Скорость: rejestry > **cache** > RAM > SSD > HDD.
- ROM (только чтение, производитель) → PROM (однократная запись) → **EPROM (стирание ультрафиолетом, UV)** → EEPROM (электрически) → Flash (BIOS).
- 32-битная ОС адресует 2³² B = **4 GiB** → апгрейд до 8 GB **не даст прироста** на Windows 32-bit.
- Минимум Windows 7: 32-bit — **1 GB RAM**, 64-bit — 2 GB.

## Шины расширения (magistrale)

| Шина | Тип | Параметры |
|---|---|---|
| ISA | параллельная | 16 бит |
| **PCI 2.2** | **параллельная** | **32 бита**, 33 MHz, 133 MB/s |
| AGP | параллельная | только видеокарта (устарела, на современных платах нет) |
| **PCI Express** | последовательная, **full duplex**, линии (lanes) x1/x4/x8/x16 | см. ниже |

Пропускная способность PCIe **на 1 линию в одну сторону**: 1.0 = 250 MB/s, 2.0 = 500 MB/s, 3.0 ≈ 1 GB/s, 4.0 ≈ 2 GB/s, 5.0 ≈ 4 GB/s.
- Пример: **PCIe 1.0 x16** = 16 × 250 MB/s = **4 GB/s в каждую сторону**. То же даёт 2.0 x8 или 3.0 x4.
- Видеокарта → слот **PCIe x16**. Карта захвата видео/ТВ-тюнер → PCIe/PCI.
- Питание: слот PCIe до 75 W; разъём **6-pin PCI-E = +12 V на 3 линиях** (75 W); 8-pin = 150 W.
- Ноутбук старый: **PCMCIA (PC Card)**, ExpressCard.

## Диски и интерфейсы (pamięci masowe)

| Интерфейс | Скорость | Примечания |
|---|---|---|
| PATA / IDE / **UDMA** | до 133 MB/s | **параллельный**, заменён SATA; питание **Molex** (4-pin, +5/+12 V); master/slave |
| SATA I / II / III | 1,5 / 3 / **6 Gb/s** (150/300/600 MB/s) | последовательный; питание SATA 15-pin (3,3/5/12 V) |
| **eSATA** | как SATA | внешний, **без питания** устройства (eSATAp — с питанием) |
| SATA Express | до 16 Gb/s | PCIe 2 линии |
| **M.2** | SATA **или** PCIe/**NVMe** | SSD; NVMe по PCIe — самый быстрый |
| **mSATA** | SATA | малый SSD в ноутбуке — **второй диск при одной zatoce HDD** |
| **SAS** | 6/12 Gb/s | серверы; диск SAS ↔ контроллер SAS (SAS-контроллер принимает и SATA) |
| SCSI | параллельная | шина с **terminatorem** на конце |

- **AHCI** — режим SATA с NCQ и hot-plug; даёт драйверам ОС доступ к SATA. Смена AHCI → IDE после установки Windows → **BSOD/постоянный рестарт** при загрузке.
- **Hot plugging / hot swap** — подключение/замена диска **при включённом питании** (серверы rack: диск меняется без снятия крышки).
- Самый быстрый SSD в ПК: **PCI Express (NVMe)**.

### HDD vs SSD

- HDD: talerze, głowice, RPM (5400/7200/10k/15k), cache, czas dostępu. **MTBF** (среднее время наработки на отказ) **не влияет на производительность**.
- Механические повреждения и повреждения поверхности — типичны для **HDD** (перегрев, удары). Стук + медленная работа → сделать копию и **заменить диск**.
- **S.M.A.R.T.** — самодиагностика **дисков** (HDD/SSD).
- Низкоуровневое форматирование делает **производитель**.
- SSD: NAND (SLC/MLC/TLC/QLC), TRIM, **не дефрагментировать**.
- **Fragmentacja** — файлы на **несмежных кластерах** (частое удаление/запись, особенно FAT32). **Defragmentacja** — упорядочивание → ускорение.

### Кластеры (jednostka alokacji)

Файл занимает целое число кластеров: `klastry = ⌈rozmiar / klaster⌉`.
- 2570 B при кластере 1024 B → ⌈2,51⌉ = 3 кластера = 3072 B.
- Сравнение для 100 000 файлов по 2570 B: кластер 2048 → 2×2048 = 4096 B/файл; **3072 → 3072 B/файл (минимум)**; 4096 → 4096; 8192 → 8192.

### Оптические носители (prędkość 1x)

| | 1x | Ёмкость |
|---|---|---|
| CD | 150 kB/s | 700 MB |
| DVD | 1350 kB/s | 4,7 GB (DL 8,5) |
| **Blu-ray** | **4,5 MB/s** | 25 GB (DL 50) |

### Разделы (partycje)

- **MBR**: макс. **4 partycje podstawowe** (или 3 podstawowe + 1 rozszerzona с логическими); макс. раздел/диск **2 TB**. Нельзя: 1 podstawowa + 2 rozszerzone (расширенная только одна).
- **GPT** (GUID): до 128 разделов, **разделы > 2 TB** (диск 3 TB, 8 TB = 2×4 TB → GPT), UEFI.
- Конвертация GPT ↔ MBR: **diskpart** (`convert gpt` / `convert mbr`, после `clean`).

## RAID (macierze dyskowe)

| Уровень | Мин. дисков | Ёмкость | Отказоустойчивость | Суть |
|---|---|---|---|---|
| **RAID 0** | 2 | n × C | **нет** — отказ 1 диска = потеря всех данных | striping (paskowanie), скорость |
| **RAID 1** | 2 | C (n/2 при 2) | 1 диск | **mirroring, replikacja**; надёжность + быстрее чтение |
| **RAID 5** | **3** | (n − 1) × C | 1 диск | striping + rozproszona parzystość |
| RAID 6 | 4 | (n − 2) × C | 2 диска | двойная чётность |
| RAID 10 (1+0) | 4 | n/2 × C | 1 в каждой зеркальной паре | зеркала + striping |

Расчёты (C — ёмкость наименьшего диска):
- RAID 5 из 4 × 2 TB: (4 − 1) × 2 = **6 TB** полезно, 2 TB на чётность.
- RAID 1 из 2 × 1 TB: **1 TB**.
- RAID 0 из 3 × 500 GB: 3 × 500 = **1,5 TB**, без защиты.
- RAID 6 из 5 × 4 TB: (5 − 2) × 4 = **12 TB**.
- Ровно 3 диска + максимальная безопасность → **RAID 5**. RAID 5 не вызывает потерю данных при отказе одного HDD.
- RAID ≠ kopia zapasowa.

## BIOS / UEFI / POST

- **BIOS** (Flash/EEPROM) + настройки в **CMOS** (питание — батарейка CR2032). **UEFI** — преемник: GPT, Secure Boot, графический интерфейс.
- **POST** (Power-On Self Test) — самотестирование при включении.
- `CMOS checksum error – press F1 to continue, DEL to setup` → **DEL = вход в BIOS (Setup)**; причина — севшая батарейка. Ошибка чтения/записи CMOS → **заменить батарейку** (или плату).
- **ACPI** (Advanced Configuration and Power Interface) — **zaawansowany interfejs zarządzania konfiguracją i energią**. Состояния: S0 работа, S3 sleep (Suspend to RAM, **stan wstrzymania**), S4 **hibernacja** (`hiberfil.sys`), S5 выключение.
- **Plug and Play** — обнаружение нового устройства и автоматическое выделение ресурсов (IRQ, DMA, I/O).
- Загрузчики (programy rozruchowe): **GRUB, LILO** (Linux), **NTLDR** (XP), BOOTMGR (Vista+). Bootstrap loader находит MBR и загружает систему с активного раздела.

### Сигналы и сообщения POST

| Сигнал / сообщение | Значение |
|---|---|
| AWARD: **1 długi, 2 krótkie** | **ошибка видеокарты** (karta graficzna) |
| AWARD: długi ciągły | ошибка RAM |
| AMI: 1 krótki | ошибка odświeżania DRAM |
| AMI: 8 krótkich | ошибка памяти видеокарты |
| `Primary/Secondary master/slave hard disk fail` | **dysk twardy** |
| `KB/Interface error` (AMI) | **kontroler klawiatury** |
| `Display switch is set incorrectly` | неверный режим отображения |
| `Non-system disk or disk error` | в приводе **дискета/носитель без системы** (неверный порядок загрузки) |
| `NIC ERROR` | **karta sieciowa** |

- **Karta diagnostyczna POST** (на PCI/PCIe) — показывает коды POST на дисплее (когда нет изображения).

## Блок питания (zasilacz)

| Разъём | Назначение |
|---|---|
| ATX 20+4 pin | материнская плата |
| **ATX12V 4/8-pin (EPS)** | **питание процессора** |
| PCI-E 6/8 pin | видеокарта (+12 V) |
| SATA 15-pin | SATA-диски, приводы |
| **Molex** 4-pin | **IDE-диски**, старые приводы, вентиляторы |
| Berg | дисковод FDD |

- Напряжения: **+3,3 V (оранж.), +5 V (красн.), +12 V (жёлт.), −12 V (синий), +5 VSB (фиолет., дежурное), PS_ON (зелёный), PWR_OK (серый), GND (чёрн.)**.
- Защиты: OVP (перенапряжение), UVP, OCP (перегрузка по току), OPP (мощность), SCP (КЗ), **OTP — перегрев (Over Temperature Protection)**.
- 80 PLUS — КПД (sprawność).
- Блок-схема линейного БП: transformator → prostownik → filtr → **stabilizator (regulator) napięcia DC**. Импульсный БП (impulsowy) — с transformatorem impulsowym.

### Расчёт мощности

- `P = U × I`; 1 W = 1 J / 1 s; **450 W = 0,45 kW**.
- Номинальная мощность по таблице: сложить мощности линий с учётом общих ограничений (напр. +3,3 V и +5 V combined), не просто U×I всех строк.
- Пример: +12 V 30 A → 360 W; +5 V 20 A и +3,3 V 20 A, combined 120 W; +5VSB 2,5 A → 12,5 W → итого ≈ 360 + 120 + 12,5 = 492,5 W.
- Подбор БП: суммировать потребление компонентов + запас ~20–30%; мощная новая видеокарта → часто **нужна замена zasilacza**.
- Без БП, вентилятора CPU — комплект неполный.

## Охлаждение (chłodzenie)

- Pasywne (radiator, heatpipe, без вентилятора), aktywne (radiator + wentylator), wodne.
- Вентиляторы: 3-pin (частота через напряжение), **4-pin PWM**.
- Перегрев CPU → **самопроизвольный жёсткий reset**; перегрев видеокарты → проверить вентилятор и пыль.
- Радиаторы на чипы памяти видеокарты → **taśma termoprzewodząca**.

## Ноутбуки (laptopy)

- Цвета искажены/нет одного цвета, полосы → **taśma matrycy** (шлейф матрицы ↔ плата).
- Вздутые конденсаторы в питании LCD → повреждение **inwertera i podświetlenia** (CCFL).
- Подготовка нового ноутбука: **bateria → zasilanie sieciowe → włączenie → instalacja systemu/sterowników**.
- Внутренний второй диск при одной zatoce → **mSATA / M.2**.
- Замена RAM: **mata antystatyczna (uziemiona) + opaska na nadgarstek** (ESD).

## Диагностика и инструменты (narzędzia)

| Инструмент | Для чего |
|---|---|
| **multimetr / woltomierz** | напряжения БП, проверка диодов, транзисторов, резисторов |
| **watomierz** | **moc czynna**, потребляемая компьютером |
| tester zasilacza ATX | проверка БП |
| **oscyloskop** | форма сигналов (przebiegi) и напряжения |
| **sonda logiczna** | состояние выхода цифровой схемы |
| **impulsator** | подаёт на вход схемы высокий уровень/импульсы |
| karta POST | коды POST |
| lutownica + cyna + kalafonia | замена конденсаторов |
| **stacja lutownicza Hot Air** | нагрев/выпайка элементов **SMD** |
| pęseta | зворки, мелкие элементы |
| wkrętak **Philips** (krzyżak), Torx (звезда) | винты |
| sprężone powietrze, izopropanol | чистка пыли / оптики |

- Электроника: **czynne** (aktywne) — **tranzystor**, dioda; **bierne** — **kondensator (gromadzi ładunek, farad F)**, rezystor (Ω), cewka (H, indukcyjność); fotodioda.
- Упаковка в **metalizowaną folię** — защита от **ładunków elektrostatycznych**.
- Неправильные напряжения → **puchnięcie kondensatorów**, зависания, рестарты.

### Программы диагностики

| Программа | Назначение |
|---|---|
| **MemTest86** | ошибки RAM |
| CPU-Z, **HWiNFO** | подробно о CPU (HWiNFO — больше всего данных) |
| GPU-Z | видеокарта |
| Everest / AIDA64, HWMonitor | температуры, сведения |
| **SuperPi** | производительность (разогнанных) CPU |
| HD Tune, CrystalDiskInfo, **Acronis Drive Monitor** | состояние дисков (S.M.A.R.T.) |
| **Acronis True Image**, Clonezilla, `dd` | **obraz dysku** |
| **Recuva** | восстановление удалённых файлов |
| chkdsk (Win) / **fsck** (Linux) | **логическая структура** ФС, bad-сектора |
| Linux: `lshw`, `lscpu`, `dmidecode` (данные BIOS), `hdparm -T /dev/sda` (скорость), `smartctl`, `cat /proc/meminfo` | |

- Восстановление удалённых данных: **сразу прекратить запись на диск**, подключить диск к другому ПК с программой recovery. **Formatowanie** при повреждённой ФС и особенно **zerowanie** — необратимы.

## Частые ловушки на экзамене

- **PC3-16000** = 16 000 MB/s = **16 GB/s**, а не 16000 MHz.
- Стирание **ультрафиолетом** — **EPROM**, электрически — EEPROM.
- Файлы на несмежных кластерах — это **fragmentacja**; defragmentacja — лечение.
- **DDR4 = 1,2 V, DDR3L = 1,35 V, DDR3 = 1,5 V**; DDR передаёт данные на обоих фронтах.
- **CL** — это «czas dostępu»; **MTBF не влияет на wydajność**.
- **RAID 0** — нет отказоустойчивости; RAID 1 — replikacja; для ровно 3 дисков — **RAID 5**.
- PCIe — **последовательная full duplex**; **PCI — параллельная 32 bit**; 4 GB/s в каждую сторону = **PCIe 1.0 x16**.
- eSATA/SATA — передача данных **без питания** внешнего устройства; IDE питается от **Molex**.
- MBR — макс. **4 первичных** раздела и 2 TB; раздел 3 TB → **GPT**.
- AWARD **1 длинный + 2 коротких = видеокарта**; CMOS checksum → батарейка, DEL → BIOS.
