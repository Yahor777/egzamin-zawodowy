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
| Мастер New Scope: не было страницы WINS | добавлена страница **Serwery WINS** (2-я итерация сверки: страница активации названа по скриншотам школы — см. «Сверка по скриншотам ZSE» ниже) | ZSE lekcja 07 |
| Add Roles: в боковом списке и заголовке первой страницы | **Zanim rozpoczniesz** (первая итерация ошибочно ставила «Przed rozpoczęciem» по MS Learn; в WS2022 pl-PL на скриншотах школы — «Zanim rozpoczniesz») | скриншоты ZSE урок 02/07/08 |
| AD DS: «Usługi domenowe w usłudze Active Directory» | **Usługi domenowe Active Directory** | ZSE lekcja 02 (WS2022), MS Learn |
| AD DS: «Podwyższ poziom tego serwera do poziomu kontrolera domeny» | **Podnieś poziom tego serwera do kontrolera domeny** | ZSE lekcja 02 |
| AD DS DC-wizard: «Przegląd opcji» | **Przeglądanie opcji** | MS Learn install-adds |
| Server Manager (flag): «Ukończ konfigurację DHCP» | **Dokończ konfigurację funkcji DHCP** | ZSE lekcja 07 |
| GPMC: «Utwórz obiekt GPO w tej domenie i umieść tu link…», «Połącz istniejący obiekt GPO…», «Nowy GPO», «Starter GPO» | **Utwórz obiekt zasad grupy w tej domenie i umieść tu link…** (так же в листах CKE; первая итерация по MS Learn («…i połącz go tutaj») была неверна для WS2022), **Połącz z istniejącym obiektem zasad grupy…**, **Nowy obiekt zasad grupy** (поле «Źródłowy początkowy obiekt zasad grupy»), **Początkowe obiekty zasad grupy** | скриншоты ZSE урок 15, листы CKE |

Сверено без расхождений (проверено по текстам): Add Roles wizard (Typ instalacji / Wybór serwera / Role serwera / Funkcje / Potwierdzenie / Wyniki), AD DS wizard (Konfiguracja wdrożenia, Opcje kontrolera domeny, Opcje DNS, Opcje dodatkowe, Ścieżki, Sprawdzanie wymagań wstępnych), New Zone wizard (Typ strefy, Strefa wyszukiwania do przodu/wstecznego, Aktualizacja dynamiczna), FSRM (Zarządzanie przydziałami, Szablony przydziałów, Utwórz przydział…), NTFS/«Udostępnianie zaawansowane»/«Zaawansowane ustawienia zabezpieczeń», IPv4 properties (Win11, ncpa.cpl: все подписи), IIS («Dodaj witrynę sieci Web», «Edytuj powiązania», «Dodaj witrynę FTP»).

Оставлено / не проверено:
- Скриншоты Microsoft Learn почти отсутствуют; сверка по картинкам ZSE (30–60 на урок) выполнена для ключевых диалогов — см. раздел ниже.
- Не воспроизведено (не нужно для листов): Dostęp zdalny → «Wdróż DirectAccess», реальное прохождение VPN-трафика по туннелю (PPTP/SSTP — симуляция по состоянию), IPv6 в RRAS, профили NFS/«Udział SMB — aplikacje» в мастере нового udziału (выбор возможен, поведение как у «szybki»), Kreator interfejsu wybierania numeru, DFS, пользователи-списки «Rola»/«Czasowniki» в URL Authorization.

## Школа (ZSE Rzeszów) — ключевые находки

- Школа публикует полные ćwiczenia: Windows Server **2022** (лекции 01–15: VMware/VirtualBox, AD, пользователи/OU, клиент в домен, группы, скрипты, DHCP, RRAS, DNS, файловый сервер/FSRM, печать, MMC/RDP, IIS, FTP, GPO), Ubuntu Server 24.04, сети (теория zip), PSK.
- Оборудование PSK: **роутеры DrayTek Vigor** (сброс до заводских, DHCP, статическая аренда, VLAN на роутере, Wi-Fi) и **управляемый коммутатор** с веб-интерфейсом «System → System IP → Management VLAN», «VLAN → Port config (режимы ACCESS/GENERAL/TRUNK)», «VLAN config → CREATE» — это **не** TL-SG108E (Easy Smart); адрес по умолчанию 192.168.0.1, admin/admin. Если у школы экзамен на этом оборудовании, нужен отдельный симулятор (DrayTek + этот коммутатор).
- Ссылки добавлены на страницу «Теория» (блок «Материалы школы»).

## Сверка по скриншотам ZSE (WS2022, Фаза C2) — Windows

Скриншоты скачивались только в рабочую папку (в репозиторий и приложение не копировались); Playwright 1280 / iPhone 14 нашего симулятора сравнивались со скриншотами уроков 02, 03, 04, 07, 08, 09, 10, 13, 15.

### Подтверждено / исправлено термины (были «не подтверждены»)

| Термин | Итог | Источник |
|---|---|---|
| «Sprawdź przy zamykaniu poprawność ustawień» (IPv4) | **исправлено** → «Sprawdź przy zakończeniu poprawność ustawień» | скриншот урока 04, свойства TCP/IPv4 |
| «Kreator nowej strefy» vs «Kreator nowych stref» | **«Kreator nowych stref»** (заголовок окна, «Kreator nowych stref - Zapraszamy!», «Kończenie pracy Kreatora nowych stref»); пункт меню — «Nowa strefa…» | урок 09 |
| «Usługi plików i magazynowania» | **подтверждено** (список ролей: «…(Zainstalowano 2 z 12)», пункт меню навигации) | уроки 02, 08, 10 |
| «Kreator tworzenia folderów udostępnionych» | **«Kreator tworzenia folderu udostępnionego»** (единственное число, как в заголовке окна и в тексте урока 10); стартовая страница «… — Zapraszamy!» | урок 10 |

### Исправления, найденные при сверке

| Область | Было | Стало (по скриншотам WS2022 pl) |
|---|---|---|
| Add Roles: заголовки страниц | «Wybierz typ instalacji», «Wybierz serwer docelowy», «Wybierz role serwera», «Wybierz funkcje», «Potwierdź wybrane opcje instalacji»; пункт «Wybór serwera» | **Wybieranie typu instalacji / serwera docelowego / ról serwera / funkcji**, **Wybieranie usług ról**, **Potwierdzanie opcji instalacji**; пункт навигации **Wybieranie serwera** |
| Add Roles: список ролей | 20 ролей в произвольном порядке, нестандартные имена | **19 ролей в польском алфавитном порядке** (Dostęp zdalny, Hyper-V, Serwer DHCP, … Windows Server Update Services), имена: «Usługa Ochrona hosta», «Usługi federacyjne Active Directory (AD FS)», «Usługi LDS w usłudze Active Directory», «Usługi zarządzania prawami dostępu w usłudze Active Directory», «Usługi aktywacji zbiorczej», «Windows Deployment Services»; убран «Attestation kondycji urządzeń»; «Zdalny dostęp» → **Dostęp zdalny**; пометка **(Zainstalowano)** с заглавной |
| Add Roles: служебные окна | «Dodać funkcje wymagane dla X?»; чекбокс «W razie potrzeby automatycznie uruchom ponownie…» | **«Czy dodać funkcje wymagane przez funkcję X?»** (+ «Nie można zainstalować funkcji X, jeśli nie zostaną zainstalowane również…», «Dołącz narzędzia do zarządzania (jeśli dotyczy)»); **«Automatycznie uruchom ponownie serwer docelowy, jeśli będzie to potrzebne»** + предупреждение «Jeśli jest wymagane ponowne uruchomienie… Tak/Nie» |
| Add Roles: страницы ролей | у IIS подэлементы (FTP) были прямо в списке ролей; не было страницы «Usługi ról» | как в WS2022: страница роли (**«Dostęp zdalny»**, **«Rola Serwer sieci Web (IIS)»**) → **Wybieranie usług ról** (Routing + диалог «Dodaj funkcje», IIS: Wspólne funkcje HTTP/Przekierowanie HTTP, Zabezpieczenia/Autoryzacja adresów URL, Serwer FTP/Usługa FTP) |
| Server Manager: приветствие | «WITAMY W MENEDŻERZE SERWERA», синий блок | **«MENEDŻER SERWERA — ZAPRASZAMY!»**, оранжевые блоки SZYBKI START / CO NOWEGO / DOWIEDZ SIĘ WIĘCEJ слева, «1 Konfiguruj ten serwer lokalny»; разделитель «•» в строке «Menedżer serwera • Pulpit nawigacyjny» |
| DHCP: мастер зон | «Kreator nowego zakresu», «Dodawanie wykluczeń i opóźnienia», «Konfigurowanie opcji DHCP», «Aktywowanie zakresu», поле router/DNS одиночное | **«Kreator nowych zakresów»** (+ «… - Zapraszamy!», «Kończenie pracy Kreatora nowych zakresów»), **«Dodaj wykluczenia i opóźnienie»**, **«Konfiguruj opcje DHCP»**, **«Uaktywnij zakres»**, router и DNS — **списки с кнопками «Dodaj» / «Usuń»** (школа: «pamiętaj kliknąć Dodaj, a dopiero potem Dalej»: набранный, но не добавленный адрес не сохраняется) |
| DNS: мастер | «Kreator nowej strefy…» | **«Kreator nowych stref»**, чекбокс «Przechowuj strefę w usłudze Active Directory (dostępne, jeśli serwer DNS jest zapisywalnym kontrolerem domeny)», тексты страниц |
| GPMC | см. таблицу выше | «umieść tu link…», «Połącz z istniejącym obiektem zasad grupy…», «Źródłowy początkowy obiekt zasad grupy:» (тексты в quiz/howto/drill обновлены) |
| ADUC → новый пользователь | заголовок «Nowy obiekt — Użytkownik», не было «Inicjały» | **«Nowy obiekt - Użytkownik»**, поле **Inicjały** (в «Pełna nazwa»: «James JB. Bond») |
| IIS: «Dodawanie witryny sieci Web» | «Uruchom witrynę sieci Web natychmiast», не было подписей | **«Natychmiast uruchom witrynę sieci Web»**, «Uwierzytelnianie przekazywane», «Przykład: www.contoso.com lub marketing.contoso.com», пункты «Zarządzanie witryną sieci Web › Zatrzymaj/Uruchom/Ustawienia zaawansowane…»; FTP-мастер: «Bez protokołu SSL» |
| Nowy udział (Menedżer serwera) | трёхшаговый мини-мастер | **«Kreator nowego udziału»**: Wybieranie profilu → Lokalizacja udziału (wolumin / ścieżka niestandardowa, Przeglądaj…) → Nazwa udziału → Inne ustawienia (4 флажка) → Uprawnienia (+ «Dostosowywanie uprawnień…» = Zaawansowane ustawienia zabezpieczeń) → Potwierdzenie → Wyniki; профиль **Udział SMB — zaawansowany** добавляет страницы **Właściwości zarządzania udziałami** и **Klasyfikacja udziału** (FSRM-прототипы) |

## Закрыто в Фазе C2 (бывший список «кандидатов»)

| Экран | Что сделано |
|---|---|
| **Routing i dostęp zdalny** | роль **Dostęp zdalny** → служба ролей **Routing**; флаг «Otwórz kreatora Wprowadzenie» («Wdróż tylko sieć VPN» → консоль); консоль `rrasmgmt.msc` (Narzędzia): ПКМ на сервере → «Konfiguruj i włącz routing i dostęp zdalny», «Kreator instalacji serwera routingu i dostępu zdalnego» (Dostęp zdalny / **Translator adresów sieciowych** / VPN+NAT / Bezpieczne połączenie / **Konfiguracja niestandardowa**; «Połączenie internetowe NAT» с выбором публичного интерфейса; «Kończenie pracy…», «Uruchamianie Routing i dostęp zdalny»), IPv4 → Ogólne / **Trasy statyczne** («Nowa trasa statyczna»: Interfejs, Miejsce docelowe, Maska sieci, Brama, Metryka) / IGMP / **NAT** (Nowy interfejs…, Właściwości: prywatny/publiczny), «Wyłącz…», Uruchom/Zatrzymaj, Właściwości. **Маршрутизация в `net.ts` требует настроенного и запущенного RRAS** (роль + служба Routing + мастер + Routing LAN); статические маршруты сервера участвуют в `canPing`; NAT: клиенты за сервером достигают «внешней» стороны (ответ идёт на публичный адрес). Лаба 26-06-10 и её эталонное решение обновлены |
| **RRAS: dostęp zdalny VPN** | вариант мастера **«Dostęp zdalny (połączenie telefoniczne lub sieć VPN)»**, страницы **Sieć** и **Przypisywanie adresów IP** (Automatycznie / Z określonego zakresu adresów), узел **Klienci dostępu zdalnego** (Nazwa / Użytkownik / Adres IP / Protokół / Czas trwania), вкладка IPv4 со статическим пулом; Windows 11: **Ustawienia → Sieć i Internet → VPN → Dodaj połączenie VPN**, поля Dostawca usługi VPN / Nazwa połączenia / Nazwa lub adres serwera / Typ sieci VPN / Typ informacji logowania / Zapamiętaj moje informacje logowania; подключение PPTP/SSTP по состоянию с проверкой сервера, роли, RRAS, логина и свободного адреса пула |
| **Zarządzanie komputerem → Foldery udostępnione** | Udziały (ADMIN$, C$, IPC$ + свои, «Liczba połączeń klienta»; Nowy udział…, Zatrzymaj udostępnianie, Właściwości: Ogólne/limit, Publikowanie, Uprawnienia udziału, Zabezpieczenia), **Kreator tworzenia folderu udostępnionego** (4 пресета разрешений), **Sesje** и **Otwarte pliki** — реальные сессии клиентов из SMB-модели (Проводник на `\\сервер\udział`/сетевой диск, Notatnik с файлом на udziale) |
| **IIS: Przekierowanie HTTP** | служба роли `Web-Http-Redirect`; плитка и форма (adres docelowy, «dokładne miejsce docelowe», «tylko zawartość w tym katalogu», 301/302/307); Edge клиента показывает содержимое цели (на том же сервере) либо страницу с адресом и кодом |
| **IIS: Autoryzacja adresów URL** | служба роли `Web-Url-Auth`; список правил, «Dodaj regułę zezwalania/odmowy…» (wszyscy / anonimowi / role / użytkownicy); Edge без логина получает **401.2** при правиле «Odmów — anonimowi» |
| **IIS: Dodaj publikację FTP…** | на существующем сайте (2 страницы мастера), привязка ftp + раздел FTP (Uwierzytelnianie FTP / Reguły autoryzacji FTP) на странице сайта |
| Служба ролей в мастере Add Roles | «Dostęp zdalny → Routing», IIS «Przekierowanie HTTP», «Autoryzacja adresów URL» — **требуются** для соответствующих функций |

## Что осталось

1. Роутер: скриншотное сравнение при реальных данных школы (какой именно WR840N — V4/V5/V6/V7 — и какой DrayTek).
2. Коммутатор: подтвердить по реальному железу школы модель (см. выше), при необходимости — отдельный стиль.
3. Windows: сверка остальных диалогов школы (точные записи на вкладке Inspekcja и редактирование аудита, FSRM-уведомления/правила классификации, серверы печати/lekcja 11, MMC-RDP/lekcja 12) — по скриншотам из `https://zse.rzeszow.pl/windows/2022/…`.
4. FTP-клиент (`ftp 192.168…`, браузер `ftp://`) в симуляторе клиента отсутствует: FTP-сайты и публикации только настраиваются.
5. Прогон 3 листов на реальном оборудовании (пункт 3 фазы C) — не выполнялся.
