# Идентификация параметров (identyfikacja parametrów)

Есть в 87 % листов, это ≈ 5 баллов. Каждая строка таблицы — отдельный критерий T/N, и экзаминатор сверяет твою запись **со скриншотом** в папке `Identyfikacja` на флешке `Egzamin-x`. Нет скриншота, на котором видно значение, — критерий не засчитан, даже если число верное.

## 1. Порядок работы

1. Прочитай таблицу (Tabela N) целиком и выпиши, **какой инструмент** покажет каждый параметр.
2. Открой инструмент → сделай скриншот (`Win+Shift+S` или `PrtScn` → Paint → Zapisz jako → `Egzamin-x\Identyfikacja\cpu.png`; в Linux — `gnome-screenshot` или кнопка PrtSc).
3. Впиши значение в таблицу **так, как оно написано** в программе (с единицами: GHz, GB, MT/s).
4. Если параметр система не показывает — пиши `brak danych` (это засчитывают, если на скриншоте его правда нет).
5. Оценка («spełnia / nie spełnia wymagań»): сравни **каждое** требование отдельно. Хоть одно не выполнено → `nie spełnia`. Коротко обоснуй: «RAM 8 GB < 16 GB».

## 2. Windows — что где

| Параметр | Где смотреть |
|---|---|
| Процессор: модель, базовая частота, ядра, логические процессоры | `msinfo32` → Podsumowanie systemu → **Procesor** («…, 2500 MHz, Rdzenie: 6, Procesory logiczne: 12»); Menedżer zadań (`taskmgr`) → **Wydajność → Procesor CPU** → Szybkość podstawowa, Rdzenie |
| RAM: объём | `msinfo32` → **Zainstalowana pamięć fizyczna (RAM)**; Ustawienia → System → Informacje |
| RAM: гнёзда, скорость | Menedżer zadań → Wydajność → **Pamięć** → «Używane gniazda: 2 z 4», Szybkość |
| RAM: производитель, part number, серийный номер | `wmic memorychip get manufacturer,partnumber,serialnumber,capacity,speed` или CPU-Z → SPD |
| Płyta główna: производитель и модель | `msinfo32` → **Producent płyty głównej**, **Produkt płyty głównej**; `wmic baseboard get manufacturer,product` |
| BIOS | `msinfo32` → Wersja/data systemu BIOS; `wmic bios get smbiosbiosversion` |
| Видеокарта: модель, производитель, VRAM, DirectX | `dxdiag` → вкладка **Ekran 1** (Nazwa, Producent, **Pamięć wyświetlania (VRAM)**), вкладка **System** → **Wersja DirectX**; Menedżer zadań → GPU → Dedykowana pamięć GPU |
| Диск: модель, объём | `msinfo32` → Składniki → Magazyn → **Dyski** (Model, Rozmiar); Menedżer zadań → **Dysk 0**; `wmic diskdrive get model,size` |
| Свободное место на C: | Eksplorator plików → **Ten komputer** («41,8 GB wolnych z 126 GB») |
| Сетевая карта: модель, MAC | `ipconfig /all` → **Opis**, **Adres fizyczny**; Menedżer urządzeń (`devmgmt.msc`) → Karty sieciowe; `getmac /v` |
| Wi‑Fi: стандарты 802.11 | `netsh wlan show drivers` → **Obsługiwane typy radia** |
| Система: имя, версия, сборка, разрядность | `msinfo32` (Nazwa systemu operacyjnego, Wersja … Kompilacja …, Typ systemu x64); `winver`; `systeminfo` |

PowerShell (если просят «polecenie»): `Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,MaxClockSpeed`, `Get-CimInstance Win32_PhysicalMemory | Format-List Manufacturer,Capacity,Speed,PartNumber`, `Get-CimInstance Win32_VideoController`.

### Ловушки Windows

- **Базовая ≠ текущая частота.** В Menedżer zadań крупно написано «Szybkość» (текущая, турбо), а нужна **Szybkość podstawowa**. `MaxClockSpeed` в WMI — тоже базовая.
- **Ядра ≠ потоки.** i5‑12400: Rdzenie 6, Procesory logiczne 12.
- **VRAM больше 4 GB:** `msinfo32` (Pamięć karty) и `wmic … adapterram` показывают максимум 4 GB (32‑битное поле). Правильно — `dxdiag` → Pamięć wyświetlania или Menedżer zadań → GPU.
- **Объём диска:** Windows показывает GiB (500 GB «на коробке» = 465,76 GB в Windows). Пиши то, что на скриншоте.
- **Интерфейс диска в WMI:** SATA‑диск показан как `IDE`, NVMe — как `SCSI`. Тип SSD/HDD и NVMe смотри в Menedżer zadań → Dysk.

## 3. Linux — что где

| Параметр | Команда |
|---|---|
| Версия ядра | `uname -r` (или `uname -a`, `hostnamectl`) |
| Процессор: модель, ядра, потоки | `lscpu` → Model name, Core(s) per socket, Thread(s) per core, CPU(s) |
| Процессор: **базовая** частота | `sudo dmidecode -t processor` → **Current Speed** (Max Speed — турбо); `sudo lshw -C cpu` → size; у старых Intel она есть в Model name («@ 2.90GHz») |
| RAM: всего | `free -h` → total (чуть меньше установленной: 16 GB → 15Gi) |
| RAM: модули (объём, DDR, скорость, производитель, S/N, P/N) | `sudo dmidecode -t memory` (или `-t 17`) — блок нужного **Locator: DIMMx** |
| Видеокарта: производитель и модель | `lspci \| grep -i vga` → «NVIDIA Corporation GA106 [GeForce RTX 3060]»; `sudo lshw -C display` → vendor, product |
| Płyta główna, BIOS | `sudo dmidecode -t baseboard`, `sudo dmidecode -t bios` |
| Диск: модель, объём | `lsblk -d -o name,model,size`; `sudo lshw -short -C disk`; `sudo smartctl -i /dev/sda` |
| S.M.A.R.T. | `sudo smartctl -A /dev/sda` (пакет smartmontools) |
| Сетевая карта: модель, MAC | `lspci` (Ethernet/Network controller), `ip link` → link/ether |
| Всё сразу | `sudo lshw -short`, `inxi -F` |

### Ловушки Linux

- `dmidecode`, `smartctl`, полный `lshw` — **только через sudo** (иначе Permission denied или нет серийных номеров).
- `free -h` показывает Gi (гибибайты) — 7,8Gi ≈ 8 GB.
- В `smartctl -A` ID атрибутов **десятичные**, а в листе CKE они часто **шестнадцатеричные**: `0A` = 10 (Spin_Retry_Count), `C5` = 197 (Current_Pending_Sector), `C6` = 198, `C7` = 199. «Wartość bieżąca» = столбец **VALUE** (не RAW_VALUE).
- `lsblk` показывает GiB: диск 480 GB = 447,1G.

## 4. Оценка «spełnia wymagania?»

Пример: требования «Intel lub AMD, co najmniej 6 rdzeni, taktowanie 3 GHz lub wyższe». Процессор: AMD Ryzen 5 3600, 6 ядер, база 3,6 GHz → все три условия выполнены → **spełnia**. Если бы база была 2,5 GHz → **nie spełnia** (сравниваем именно базовую частоту, а не турбо).

Пиши обоснование одной строкой: «nie spełnia — RAM 8 GB, wymagane 16 GB».
