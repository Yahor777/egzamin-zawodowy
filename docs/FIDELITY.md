# FIDELITY — сверка симуляторов с реальными интерфейсами (Фаза C)

Дата сверки: 2026-11-25. Материалы: `work/refs/` (скриншоты и тексты только для сравнения; в приложение ничего оттуда не копировалось).
Список URL: `work/refs/URLS.md`.

## Что оказалось доступным

| Источник | Что есть | Чего нет |
|---|---|---|
| emulator.tp-link.com | **TL-WR841N v10 (FW 3.16.9 Build 150310)** — полный живой эмулятор, 43 страницы сняты (скриншоты + тексты + поля + списки значений); TL-WR841ND v8 | эмуляторов TL-WR840N и TL-SG108E / Easy Smart **нет** (ни в обычном, ни в `?type=smb`) |
| tp-link.com/document | Руководства: TL-WR840N **V4 / V5 / V6 / V7**, Easy Smart Switch UG (SG108E/SG1016PE…), по ним сверены меню, названия страниц, поля | скриншотов в текстовом виде нет |
| learn.microsoft.com/pl-pl | Текст пошаговых инструкций с польскими названиями страниц мастеров (Server Manager, Add Roles, AD DS, DHCP, DNS, GPMC, FSRM) | скриншотов почти нет (современные статьи) |
| zse.rzeszow.pl | **Публичные ćwiczenia школы** (Windows Server 2022/2019, Ubuntu 24.04, PSK: switch/VLAN/DrayTek) с польским интерфейсом | — |

Прошивки: эмулятор WR841N v10 = 3.16.9 (2015, UI «зелёный баннер, тёмное меню, help справа»); наш симулятор моделирует WR840N v4 (FW 0.9.1 4.16 v0001.0 Build 170622) — меню и тексты совпадают с руководствами V4/V5.

## Роутер (TL-WR840N-like) — `src/sim/router/*`

Источники: эмулятор WR841N v10, UG WR840N V4/V5/V6, строки локализации эмулятора (сообщения об ошибках).

| Область | Различие | Статус |
|---|---|---|
| Дерево меню | Совпадает с V4/V5 (Status, Quick Setup, Network, Wireless, Guest Network, DHCP, Forwarding, Security, Parental Controls, Access Control, Advanced Routing, Bandwidth Control, IP & MAC Binding, Dynamic DNS, IPv6, System Tools). WPS: в V4 пункт верхнего уровня, в V5+ внутри Wireless — у нас V5-вариант. «Operation Mode» (V5+) vs «Working Mode» (V4) — у нас V5-вариант | оставлено: версии, обе реальны |
| Bandwidth Control → «Rules List» | в V4/V10 называется **Rule List** (заголовок «Bandwidth Control Rule List») | **исправлено** |
| Status → Wireless → «Operation Mode: Access Point» в режиме роутера | ошибка: должно быть значение режима («Wireless Router Mode», как на странице Operation Mode) | **исправлено** |
| System Tools → Password, подсказка | реальный текст: «Username and password can contain between 1 - 15 characters and may not include spaces.» | **исправлено** |
| System Tools → Reboot / Factory Defaults | реальные тексты: «Click this button to reboot this device.», «Are you sure to reboot this device?», «Any settings you have saved will be lost if you restore Factory Defaults. Are you sure to continue?» | **исправлено** |
| DHCP Settings, lease out of range | реальное: «Address lease time is out of range (1 ~ 2880). Please input another time!» | **исправлено** |
| Network → LAN, подтверждение | реальное: «Modification of LAN Settings will result in the rebooting of this device, OK?» | **исправлено** |
| WAN: поля Detect, Host Name, Get IP with Unicast DHCP, BigPond, MTU 576–1500 («Bad MTU…») | в симуляторе MTU только для чтения, нет Detect/BigPond (в V5/V6 BigPond тоже есть, в V4 — есть) | оставлено: не встречается в листах CKE (WAN = Dynamic/Static/PPPoE) |
| Тексты ошибок валидации (Please input…, illegal characters, password less than 8) | у нас свои формулировки («Invalid X, please input another one.») по смыслу те же | оставлено: на экзамене важен результат, не текст алерта |
| Цвета/вёрстка | реальный UI WR841N v10: зелёный баннер, тёмно-серое меню, help-панель справа; наш — синий банер, светлое меню, help по «?» | оставлено: приблизительно (по заданию), структура страниц и порядок полей совпадают |
| Bandwidth Control Rule List: колонки Description / Egress Min/Max / Ingress Min/Max | у нас IP Range / Port Range / Max | оставлено: не в листах CKE |

## Коммутатор (TL-SG108E / Easy Smart) — `src/sim/switch/*`

Источник: **Easy Smart Switch User Guide** (текст, глава System/Switching/Monitoring/VLAN/QoS). Эмулятора нет.

| Область | Различие | Статус |
|---|---|---|
| Меню System/Switching/Monitoring/VLAN/QoS | страницы и названия совпадают (System Info, IP Setting, User Account, Port Setting, IGMP Snooping, LAG, Port Statistics, Port Mirror, Cable Test, Loop Prevention, MTU/Port Based/802.1Q VLAN, 802.1Q PVID Setting, QoS Basic, Bandwidth Control, Storm Control). В реальном UI Backup/Reboot/Reset/Firmware сгруппированы в подменю **System Tools**; у нас лежат плоско в System | оставлено: 3-й уровень меню в DeviceLayout не поддерживается; пути в заданиях те же страницы |
| User Account | реальные поля: **New Username, Current Password, New Password, Confirm Password** (у нас были User Name / Old Password) | **исправлено** |
| MTU VLAN | реальное поле «Change Uplink Port» | **исправлено** |
| Port Based VLAN | колонка/поле **Member** (было «VLAN Member Ports») | **исправлено** |
| Storm Control | реальные: Status, **Total Rate (Kbit/sec)**, **Included Storm Type** (UL-Frame / Multicast / Broadcast) | **исправлено** (названия и порядок значений; нет отдельного Status) |
| Port Mirror | реально таблица по портам: Mirrored Port / Ingress / Egress (чекбоксы); у нас select «Direction» | оставлено: логика (mirroring port + набор mirrored ports + направление) та же |
| QoS Basic | реально ниже «Global Config» есть «Port-based Priority Setting» (очередь 1–4 на порт) | оставлено: не встречается в листах |
| IGMP Snooping | реально есть «Report Message Suppression» и таблица групп | оставлено |
| System Info | реально «Device Description» редактируется (Apply) | оставлено |
| Port Based VLAN по умолчанию | по UG: Enable, VLAN 1 = все порты; у нас стартует Disable (режим выбирается явно) | оставлено: совместимость с состоянием и заданиями |

## Windows Server 2022 / Windows 11 — `src/sim/pc/*`

Источники: Microsoft Learn pl-pl (текст), ZSE Rzeszów — уроки на Windows Server 2022 (польский интерфейс!), `work/refs/zse/pages/*.txt`.

Исправленная терминология (старые варианты — из WS2012/2016 или нашей выдумки):

| Было | Стало | Источник |
|---|---|---|
| DHCP: узел «Rezerwacje», «Nowa rezerwacja…», «Nazwa rezerwacji» | **Zastrzeżenia**, **Nowe zastrzeżenie…**, **Nazwa zastrzeżenia** | ZSE lekcja 07 (WS2022) |
| Мастер New Scope: не было страницы WINS; «Aktywuj zakres» | добавлена страница **Serwery WINS**; **Aktywowanie zakresu** | ZSE lekcja 07, MS Learn DHCP |
| Add Roles: в боковом списке «Zanim rozpoczniesz» | **Przed rozpoczęciem** | MS Learn, ZSE |
| AD DS: «Usługi domenowe w usłudze Active Directory» | **Usługi domenowe Active Directory** | ZSE lekcja 02 (WS2022), MS Learn |
| AD DS: «Podwyższ poziom tego serwera do poziomu kontrolera domeny» | **Podnieś poziom tego serwera do kontrolera domeny** | ZSE lekcja 02 |
| AD DS DC-wizard: «Przegląd opcji» | **Przeglądanie opcji** | MS Learn install-adds |
| Server Manager (flag): «Ukończ konfigurację DHCP» | **Dokończ konfigurację funkcji DHCP** | ZSE lekcja 07 |
| GPMC: «Utwórz obiekt GPO w tej domenie i umieść tu link…», «Połącz istniejący obiekt GPO…», «Nowy GPO», «Starter GPO» | **Utwórz obiekt zasad grupy w tej domenie i połącz go tutaj…**, **Połącz istniejący obiekt zasad grupy…**, **Nowy obiekt zasad grupy**, **Początkowe obiekty zasad grupy** | MS Learn GPMC |

Сверено без расхождений (проверено по текстам): Add Roles wizard (Typ instalacji / Wybór serwera / Role serwera / Funkcje / Potwierdzenie / Wyniki), AD DS wizard (Konfiguracja wdrożenia, Opcje kontrolera domeny, Opcje DNS, Opcje dodatkowe, Ścieżki, Sprawdzanie wymagań wstępnych), New Zone wizard (Typ strefy, Strefa wyszukiwania do przodu/wstecznego, Aktualizacja dynamiczna), FSRM (Zarządzanie przydziałami, Szablony przydziałów, Utwórz przydział…), NTFS/«Udostępnianie zaawansowane»/«Zaawansowane ustawienia zabezpieczeń», IPv4 properties (Win11, ncpa.cpl: все подписи), IIS («Dodaj witrynę sieci Web», «Edytuj powiązania», «Dodaj witrynę FTP»).

Оставлено / не проверено:
- Не подтверждены источником (возможны мелкие расхождения): «Sprawdź przy zamykaniu poprawność ustawień» (IPv4), «Kreator nowej strefy» vs «Kreator nowych stref» (ZSE пишет по-разному), «Usługi plików i magazynowania».
- В ZSE-уроках есть пункты, которых нет у нас в явном виде: IIS «Przekierowania HTTP», «Autoryzacja adresów URL» (у нас «Autoryzacja» только в FTP); Computer Management → «Foldery udostępnione» / «Kreator tworzenia folderu udostępnionego»; «Dodaj publikację FTP…»; Routing i dostęp zdalny; serwer wydruku — **кандидаты на Фазу B/C2**.
- Скриншоты Microsoft Learn почти отсутствуют, поэтому расположение элементов в диалогах сверено по памяти/ZSE-описаниям, а не по картинкам.

## Школа (ZSE Rzeszów) — ключевые находки

- Школа публикует полные ćwiczenia: Windows Server **2022** (лекции 01–15: VMware/VirtualBox, AD, пользователи/OU, клиент в домен, группы, скрипты, DHCP, RRAS, DNS, файловый сервер/FSRM, печать, MMC/RDP, IIS, FTP, GPO), Ubuntu Server 24.04, сети (теория zip), PSK.
- Оборудование PSK: **роутеры DrayTek Vigor** (сброс до заводских, DHCP, статическая аренда, VLAN на роутере, Wi-Fi) и **управляемый коммутатор** с веб-интерфейсом «System → System IP → Management VLAN», «VLAN → Port config (режимы ACCESS/GENERAL/TRUNK)», «VLAN config → CREATE» — это **не** TL-SG108E (Easy Smart); адрес по умолчанию 192.168.0.1, admin/admin. Если у школы экзамен на этом оборудовании, нужен отдельный симулятор (DrayTek + этот коммутатор).
- Ссылки добавлены на страницу «Теория» (блок «Материалы школы»).

## Что осталось (для «Готово, когда список расхождений пуст»)

1. Роутер: скриншотное сравнение при реальных данных школы (какой именно WR840N — V4/V5/V6/V7 — и какой DrayTek).
2. Коммутатор: подтвердить по реальному железу школы модель (см. выше), при необходимости — отдельный стиль.
3. Windows: сверить расположение элементов с реальными скриншотами (ZSE-страницы содержат 30–60 картинок на урок — их можно открывать вручную по ссылкам); добавить недостающие экраны (RRAS, Computer Management → Shared Folders, IIS Redirect/URL Authorization).
4. Прогон 3 листов на реальном оборудовании (пункт 3 фазы C) — не выполнялся.
