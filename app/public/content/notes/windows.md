# Windows: администрирование клиентской ОС (System Windows)

## Редакции и лицензии

- Windows 10/11: **Home**, **Pro** (BitLocker, присоединение к домену, gpedit.msc, хост RDP, Hyper-V), Enterprise, Education.
- Windows 7: Starter, Home Basic/Premium, Professional, Enterprise, **Ultimate** (BitLocker — в Enterprise/Ultimate). **Aero** — прозрачный «стеклянный» интерфейс Vista/7.
- Требования Win 7/10: CPU 1 GHz, RAM **1 GB (32-bit) / 2 GB (64-bit)**, диск 16/20 GB. 32-bit видит ≤ 4 GB RAM.
- **DirectX 12** → Windows 10+.
- **HCL** (Hardware Compatibility List) — список совместимого оборудования Microsoft.

| Лицензия | Суть |
|---|---|
| **OEM** | привязана к ПК (**płycie głównej**); нельзя заменить исправную плату на лучшую с переносом лицензии |
| BOX / Retail | можно переносить на другой ПК |
| MOLP / Volume | корпоративные |
| **CAL** | Client Access License — доступ клиентов к услугам **Windows Server** |
| Freeware | бесплатно |
| **Shareware** | бесплатно **на время тестов** перед покупкой (WinRAR) |
| **Trialware** | полный функционал, но **ограниченное число запусков/время** |
| Demo / **Liteware** | урезанная функциональность по сравнению с платной |
| Adware | бесплатно с рекламой |
| **Donationware** | можно менять/распространять, **добровольное пожертвование** автору |
| **Postcardware** | плата — **открытка автору** |
| GNU GPL / **MPL** | открытые (Firefox — **Mozilla Public License**) |

- Авторские имущественные права: **70 лет** после смерти (последнего живого соавтора). Публикация образа Windows 7 Home — нарушение.

## Файловые системы (systemy plików)

| ФС | Макс. файл | Особенности |
|---|---|---|
| FAT32 | **4 GB** | без прав и шифрования; Windows форматирует до 32 GB; сильно фрагментируется |
| exFAT | огромный | флешки, карты SDXC |
| **NTFS** | 16 TB+ | **права доступа (ACL)**, **EFS-шифрование**, сжатие, **przydziały dyskowe (квоты)**, журнал, хардлинки |
| ReFS | | серверы, устойчивость |
| ext2/3/4 | | Linux — **Windows по умолчанию не поддерживает** |

- Конвертация FAT32 → NTFS без потери данных: **`convert C: /fs:ntfs`** (обратно нельзя).
- Ограничить доступ к папкам/файлам/дискам пользователям — только на **NTFS**.

## Права NTFS и общий доступ

| Право NTFS | Что даёт |
|---|---|
| **Pełna kontrola** | всё + смена прав и владельца |
| **Modyfikacja** | чтение, запись, **удаление**, **переименование** |
| Odczyt i wykonanie | чтение + запуск |
| Wyświetlanie zawartości folderu | только для папок |
| Odczyt | чтение |
| Zapis | создание/запись (без удаления) |

- **Удалить папку** → Pełna kontrola **или** Modyfikacja. **Переименовать** файл → Modyfikacja.
- **Dziedziczenie** — права переходят с родительского объекта на дочерний. **Odmowa (Deny) важнее Zezwalaj**.
- Права udziału (share): Odczyt, Zmiana, Pełna kontrola. При доступе по сети действует **более строгое** из share и NTFS.
- Команды: **`icacls`** (просмотр/изменение ACL, напр. `icacls C:\Windows`), `takeown`, `cacls` (стар.).
- **Атрибуты**: `attrib +h -s +r +a plik` (h — ukryty, s — systemowy, r — tylko do odczytu, a — archiwalny). `ATTRIB -S +H TEST.TXT` → снять «системный», поставить «скрытый».
- **Ukryty udział**: имя заканчивается на **`$`** (dane$); административные C$, ADMIN$, IPC$.
- **UNC**: `\\nazwa_komputera\nazwa_zasobu`; профиль: `\\SERWER_2\egzamin$\%USERNAME%`.
- `net share test=C:\Dane` — общий доступ; `net use Z: \\srv\dane` — **mapowanie** (диск с буквой); `net view`.

## Учётные записи и UAC

- Встроенные: **Administrator** (по умолчанию отключён; после отключения **доступен в trybie awaryjnym**), **Gość** (Guest), DefaultAccount. Учётки «Admin» встроенной нет.
- Группы: Administratorzy, Użytkownicy, Goście, Użytkownicy zaawansowani, Operatorzy kopii zapasowych, Użytkownicy pulpitu zdalnego.
- **UAC** (User Account Control) — запрос подтверждения при действиях, требующих прав администратора.
- Инструменты: `lusrmgr.msc`, **`control userpasswords2`** (учётки, автологон), `netplwiz`.

### net user / net accounts

| Команда | Действие |
|---|---|
| `net user egzamin qwerty /add` | создать пользователя с паролем |
| `net user GRACZ * /add` | **запросит ввод пароля** |
| `net user test /delete` | удалить |
| `net user test /active:no` | отключить |
| `net user Test /expires:12/31/2025` | **дата истечения** учётки |
| `net user test /logonpasswordchg:yes` | **сменить пароль при следующем входе** |
| `net user Gość` | показать сведения об учётке |
| `net localgroup Administratorzy jan /add` | добавить в группу |
| `net accounts /minpwlen:11` | **мин. длина пароля** = 11 |
| `net accounts /maxpwage:30` | **макс. срок действия** пароля (дни) |
| `net accounts /minpwage:1` | **мин. срок** — сменить можно через 1 день |
| `net accounts /uniquepw:5` | история паролей |
| `net accounts /lockoutthreshold:3` | блокировка после N попыток |
| `net accounts` | показать текущие правила |

- **Złożoność hasła** (complexity): **мин. 6 знаков**, 3 из 4 категорий (A-Z, a-z, 0-9, спецзнаки), не содержит имя пользователя.
- `secpol.msc` (Zasady zabezpieczeń lokalnych): zasady haseł, blokady konta, **przypisywanie praw użytkownika** (напр. **zmiana czasu systemowego**), audyt.

## Реестр (rejestr)

| Куст | Содержимое |
|---|---|
| **HKCR** (HKEY_CLASSES_ROOT) | **ассоциации типов файлов с приложениями**, COM |
| **HKCU** (HKEY_CURRENT_USER) | настройки **текущего пользователя** |
| **HKLM** (HKEY_LOCAL_MACHINE) | оборудование, ПО, настройки всей машины |
| HKU (HKEY_USERS) | профили всех пользователей |
| HKCC (HKEY_CURRENT_CONFIG) | текущий аппаратный профиль |

- `regedit`: **Eksportuj** — копия (.reg); **Importuj** — восстановление.
- Файлы кустов: `%SystemRoot%\System32\config`; профиль пользователя — `NTUSER.DAT`.
- Ассоциации из командной строки: **`assoc`** (.txt=txtfile), `ftype`.

## Консоли *.msc и утилиты

| Команда | Что открывает |
|---|---|
| `mmc` | пустая консоль для оснасток (przystawki) |
| **`devmgmt.msc`** | **Menedżer urządzeń** — список устройств, драйверы (обновить/откатить), конфликты IRQ/DMA/память; «!» = проблема |
| **`diskmgmt.msc`** | **Zarządzanie dyskami** — разделы, буквы, форматирование |
| `compmgmt.msc` | Zarządzanie komputerem (всё вместе) |
| **`services.msc`** | службы: запуск/остановка, тип запуска |
| **`eventvwr.msc`** | **Podgląd zdarzeń**: Aplikacja, **Zabezpieczenia (попытки входа, аудит)**, System |
| **`perfmon.msc`** / `perfmon` | **Monitor wydajności** (и niezawodności: `perfmon /rel`) |
| `gpedit.msc` | **Edytor lokalnych zasad grupy** (меню Start, панель задач, «Wszystkie programy») |
| `secpol.msc` | локальная политика безопасности |
| `lusrmgr.msc` | локальные пользователи и группы |
| `taskschd.msc` | **Harmonogram zadań** (запуск программы при входе, много триггеров) |
| `fsmgmt.msc` | общие папки |
| `wf.msc` | брандмауэр в режиме повышенной безопасности |
| `certmgr.msc` | сертификаты |
| `msconfig` | **Konfiguracja systemu**: опции загрузки (safe boot, лог), службы, автозапуск (Win 7) |
| `taskmgr` (Ctrl+Shift+Esc) | **Menedżer zadań**: процессы, нагрузка CPU/RAM, **завершить зависшее приложение**, автозапуск (Win 8+) |
| **`resmon`** | Monitor zasobów — влияние процессов на CPU, RAM, диск, сеть |
| `msinfo32` | сведения о системе |
| `systeminfo` | ОС, патчи, RAM, сеть (**число разделов не показывает**) |
| **`dxdiag`** | **DirectX** — параметры видеокарты, звука; проблемы игр/видео |
| `verifier` | **проверка драйверов** |
| `rstrui` | **Przywracanie systemu** (точка восстановления) |
| `cleanmgr`, `dfrgui`/`defrag` | очистка диска, дефрагментация |
| `powershell` | командлеты (cmdlet), объектная логика |
| `wuauclt` / `usoclient` | Windows Update из командной строки |

### Командная строка (cmd)

| Команда | Действие |
|---|---|
| `md` / `mkdir`, `rd /s` | создать / удалить каталог |
| `copy`, **`xcopy c:\test f:\test /E`** | копирование, **/E — с подкаталогами (и пустыми)**, /S — без пустых |
| `robocopy` | надёжное копирование/зеркалирование |
| **`move`** | **перенос и переименование** файла; `ren` — только переименование |
| `del`, `dir`, `cd`, `tree`, `cls`, `type` | |
| `color 0A` | **временно** меняет цвет текста/фона окна cmd |
| `tasklist`, `taskkill /PID 123 /F`, `/IM app.exe` | процессы (кто ест память — tasklist) |
| `shutdown /s /r /t 0` | выключение / перезагрузка |
| `chkdsk C: /f /r` | исправление ошибок / поиск bad-секторов (логическая структура) |
| `sfc /scannow`, `DISM /RestoreHealth` | восстановление системных файлов |
| **`cipher`** | **EFS-шифрование** файлов/папок |
| `compact` / **`expand`** | сжатие NTFS / распаковка .cab |
| `whoami`, **`getmac`** | текущий пользователь / MAC-адреса |
| `gpupdate /force`, `gpresult /r` | применить GPO / итоговые политики |
| **`diskpart`** | list disk, select disk 1, clean, `convert gpt`/`convert mbr`, create partition primary, format fs=ntfs quick, assign letter=E |

### Сетевые команды

| Команда | Действие |
|---|---|
| `ipconfig /all` | полная конфигурация (MAC, **DNS**, DHCP) |
| `ipconfig /release` / **`/renew`** | освободить / **обновить аренду DHCP** |
| `ipconfig /flushdns` / **`/displaydns`** | очистить / показать **кэш DNS** |
| `ipconfig /registerdns` | обновить аренду и **зарегистрировать имя в DNS** |
| `ping -t -n 5 -l 1000 -a` | бесконечно / число / **размер пакета** / имя |
| **`tracert`** | **trasa pakietów, число маршрутизаторов** |
| `pathping` | трасса + потери |
| **`netstat`** `-a -n -o -r -e` | **активные соединения**; -r = таблица маршрутов; -e = статистика интерфейса |
| `route print` | таблица маршрутизации |
| `arp -a` | таблица ARP (IP ↔ MAC) |
| `nslookup` | запрос к DNS |
| **`netsh`** | конфигурация сетевых интерфейсов (DHCP → статический IP), Wi-Fi, firewall |

## Загрузка и восстановление

- **Tryb awaryjny** (Safe Mode) — минимальный набор драйверов; наименее инвазивная диагностика. Win 7: F8; Win 10: Shift + Uruchom ponownie / WinRE.
- Дополнительные варианты: **rejestrowanie rozruchu** (файл `ntbtlog.txt` со списком загруженных драйверов), **Ostatnia znana dobra konfiguracja**, **tryb debugowania** (устранение ошибок), wyłącz automatyczne ponowne uruchamianie.
- **WinRE** → wiersz poleceń: **`bootrec /fixmbr`** (MBR), `/fixboot`, `/rebuildbcd`, `/scanos`; `bcdedit`; **System Image Recovery** — восстановление из **образа системы**.
- **Shift + F10** во время установки → командная строка.
- Unattended install: файл ответов **`unattend.xml`/`autounattend.xml`** (в старых тестах — `unattend.txt`).
- Dual boot: переустановка Windows затирает загрузчик → **заново установить GRUB**.
- **STOP-ошибки (BSOD)**: `PAGE_FAULT_IN_NONPAGED_AREA` — обращение к неверным данным в памяти; `0xF3 DISORDERLY_SHUTDOWN` — **недостаточно виртуальной памяти**; `INACCESSIBLE_BOOT_DEVICE` — смена AHCI↔IDE; старые/повреждённые драйверы — частая причина.

## Память и энергосбережение

- **`pagefile.sys`** — **plik wymiany** (виртуальная память). Сообщения о нехватке виртуальной памяти → увеличить RAM / plik stronicowania.
- **`hiberfil.sys`** — копия RAM при **hibernacji**. **Stan wstrzymania (sleep)** — быстрый возврат к работе.
- Размер файла подкачки — **не** персонализация. Персонализация: тема (**kompozycje** — фон, цвета, звуки, заставка), фон, **obszar powiadomień** (иконки на панели задач).

## Копии и восстановление

- **Punkt przywracania** (System Restore, `rstrui`) — откатывает системные файлы, реестр, программы; **личные файлы не затрагивает**.
- **Historia plików** (Win 10) + **Kopia zapasowa** — восстановление личных файлов/папок.
- **Kopia zapasowa i przywracanie (Windows 7)** — образ системы; `wbadmin`.
- Удалённые файлы → программа recovery (Recuva); после удаления учётки без удаления папки — данные доступны только через recovery (по варианту CKE).
- FileCleaner — **не** восстанавливает из копии.

## Обновления и защита

- **Windows Update**: **godziny aktywnego użytkowania** (не перезагружать во время работы), **połączenie taryfowe** (лимитное), **aktualizacje opcjonalne** (драйверы, новое ПО Microsoft). Отключение автообновления — система сама не скачивает обновления.
- **Windows Defender** (антивирус в Win 10), **Windows SmartScreen** (предупреждение о нераспознанных приложениях из Интернета), Zapora systemu Windows, **BitLocker** (шифрование дисков; Pro/Enterprise/Ultimate), **EFS** (атрибут «zaszyfrowany» — конфиденциальность между пользователями одного ПК).
- Microsoft Security Essentials — нельзя в государственных/образовательных учреждениях (лицензия).

## Управление дисками

- Diski **podstawowe**: partycje podstawowe / rozszerzona / dyski logiczne (MBR — 4 первичных; GPT — 128).
- Diski **dynamiczne**: wolumin prosty, **łączony** (spanned), **rozłożony** (striped = RAID 0), **dublowany** (mirrored = RAID 1), RAID-5 (только Server, ≥ 3 диска).
- Defragmentacja HDD ускоряет; для SSD — TRIM/оптимизация.

## Горячие клавиши Explorer

- **F5** — обновить окно, **F2** — переименовать, Win+E — Проводник, Win+R — Выполнить, Win+L — блокировка, Alt+Tab — переключение.

## Частые ловушки на экзамене

- Новый раздел → **diskmgmt.msc** (dsa.msc — это AD Users and Computers!).
- **`perfmon` = Monitor wydajności**, а не резервная копия; стабильность — **Monitor niezawodności**.
- **HKCR** — связи типов файлов с программами; **HKCU** — текущий пользователь.
- Копия реестра — **Eksportuj**, восстановление — **Importuj**.
- `/MAXPWAGE` — макс. срок пароля; `net accounts /minpwlen:11` — мин. длина 11; сложность — **мин. 6 знаков**.
- `xcopy /E` — с подкаталогами; `move` — и перенос, и смена имени.
- Удалить папку: **Pełna kontrola или Modyfikacja**; переименовать: **Modyfikacja**; скрытый ресурс — **`$`**.
- Точка восстановления **не трогает личные файлы**; MBR → **`bootrec /fixmbr`**; Shift+F10 → cmd в установщике.
- Попытки входа — журнал **Zabezpieczenia**; конфликты IRQ/DMA — **Menedżer urządzeń**.
- `ipconfig /displaydns` — показать кэш DNS; `/flushdns` — очистить; `/registerdns` — регистрация в DNS.
