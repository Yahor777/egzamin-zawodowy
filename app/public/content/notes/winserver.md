# Windows Server: роли и службы (Windows Server)

## Роли и компоненты (role i funkcje)

Добавляются в **Menedżer serwera (Server Manager)** → Dodaj role i funkcje (или PowerShell `Install-WindowsFeature`).

| Роль (польск.) | Англ. | Назначение |
|---|---|---|
| **Usługi domenowe Active Directory** | AD DS | учётные записи пользователей, компьютеров, объектов; **централизованное управление тождествами и правами**; сервер = **kontroler domeny** |
| **Serwer DNS** | DNS | имена → IP; **обязателен для AD** |
| **Serwer DHCP** | DHCP | централизованная раздача IP и параметров |
| **Serwer sieci Web (IIS)** | IIS | WWW (HTTP/HTTPS) и **FTP** (FTP — часть IIS) |
| Usługi plików i magazynowania | File and Storage Services | общие папки, DFS, **FSRM**, дедупликация |
| Usługi drukowania i zarządzania dokumentami | Print and Document Services | serwer wydruku |
| **Hyper-V** | | **виртуализация** (2012, 2016, 2019, 2022) |
| **Usługi wdrażania systemu Windows** | **WDS** | **сетевая / удалённая установка ОС** на рабочие станции (PXE) |
| Usługi WSUS | WSUS | централизованные обновления Windows |
| **Dostęp zdalny / Usługi zasad i dostępu sieciowego** | RRAS / NPS | **routing**, NAT, VPN, RADIUS (NPS) — дать клиентам Интернет |
| Usługi pulpitu zdalnego | RDS | терминальный доступ (**RDP, порт 3389**, `mstsc`) |
| Usługi certyfikatów AD | AD CS | PKI, сертификаты |
| Usługi federacyjne AD | AD FS | единый вход (SSO) между организациями |
| AD LDS / AD RMS | | облегчённый каталог / управление правами на документы |
| Kopia zapasowa systemu Windows Server | Windows Server Backup (компонент) | резервное копирование |

- Лицензия доступа клиентов: **CAL** (na użytkownika lub urządzenie). Редакции: Essentials, Standard, Datacenter; Server Core — без GUI.
- **ISA Server / TMG** — старый **firewall**/прокси Microsoft.
- **AppLocker** — **правила, разрешающие/запрещающие запуск приложений** для пользователей/групп.

## Active Directory (AD DS)

| Понятие | Польск. | Суть |
|---|---|---|
| Домен | domena | граница администрирования и безопасности (firma.local) |
| Дерево | drzewo | домены с общим непрерывным пространством имён |
| **Лес** | **las** | одно или несколько деревьев; **минимум одно drzewo domeny (один домен)** |
| **OU** | jednostka organizacyjna | контейнер для объектов; к OU привязывают GPO, делегируют права |
| Сайт | lokacja | физическое расположение (подсети), репликация |
| **Kontroler domeny (DC)** | | хранит **базу AD (NTDS.dit)** — там учётки доменных пользователей |
| Wykaz globalny (GC) | Global Catalog | частичная копия всех объектов леса |
| Role FSMO | | 5 специальных ролей мастеров операций |

- Установка AD DS требует **DNS** (записи SRV); клиент для присоединения к домену должен иметь в настройках **DNS = адрес DC** (напр. 10.0.0.1).
- Имя входа: UPN `jan@firma.local` (**может быть длиннее 100 байт**), pre-Windows 2000 (sAMAccountName) — до 20 знаков.
- Свойства учётки: профиль, домашняя папка, часы входа, срок действия, вкладка Dial-in (**номер для обратного звонка — oddzwanianie**).

### Группы

**Типы**: **zabezpieczeń (security)** — для назначения прав; **dystrybucyjne** — только списки рассылки e-mail.

| Область (zakres) | Члены | Где используется |
|---|---|---|
| **Lokalna domeny** (domain local) | из любого домена леса | права **только в своём домене** |
| **Globalna** | только из **своего** домена | в любом домене леса |
| **Uniwersalna** | из любого домена леса | во всём лесу (хранится в GC) |
| Lokalna komputera | | только на одном компьютере (SAM) |

- Стратегия **AGDLP**: Account → Global → Domain Local → Permission.
- Встроенные: Administratorzy domeny, Użytkownicy domeny, Operatorzy kont, Operatorzy kopii zapasowych, **Wszyscy (Everyone) — наименьшие права**.

### Команды AD (ds*)

| Команда | Действие |
|---|---|
| **`dsadd`** user/group/ou/computer/contact | **добавить объекты** (пользователей, группы, компьютеры, контакты, OU) |
| `dsmod` | изменить |
| **`dsrm`** | **удалить объект/OU** |
| `dsquery`, `dsget` | поиск / свойства |
| `dsmove` | переместить/переименовать |
| **`redircmp`** | **контейнер (OU) по умолчанию для новых компьютеров** |
| `redirusr` | то же для пользователей |
| `csvde`, `ldifde` | импорт/экспорт |
| `netdom join`, `dcdiag`, `repadmin` | присоединение, диагностика, репликация |
| `dsa.msc` | Użytkownicy i komputery usługi AD |

## Zasady grupy (GPO)

- Управление: **konsola GPMC (`gpmc.msc`)**; редактирование: Edytor zarządzania zasadami grupy; локально — `gpedit.msc`.
- Порядок применения **LSDOU**: Lokalne → Lokacja (Site) → Domena → OU (последняя побеждает). Blokowanie dziedziczenia, **Wymuszone (Enforced)**.
- Две части: **Konfiguracja komputera** и **Konfiguracja użytkownika**.
- Применить сразу: **`gpupdate /force`**; результат: **`gpresult /r`** — **wynikowy zestaw zasad (RSoP)**.
- Задачи GPO: ярлык на рабочих столах всех пользователей домена (**самый быстрый способ**), установка ПО (.msi), перенаправление папок, скрипты входа, путь профиля, меню Start, ограничения, AppLocker, **аудит** (→ журнал **Zabezpieczenia**).

### Политика паролей (Zasady haseł) и блокировки

| Параметр | По умолчанию в домене |
|---|---|
| Wymuszaj tworzenie historii haseł | 24 |
| Maksymalny okres ważności hasła | 42 дня (0 = **пароль никогда не истекает**) |
| Minimalny okres ważności hasła | 1 день |
| Minimalna długość hasła | 7 |
| **Hasło musi spełniać wymagania co do złożoności** | вкл.: **≥ 6 знаков**, 3 из 4 категорий, без имени пользователя |
| Próg blokady konta / czas blokady | 0 / 30 мин |

- Локальные серверы: принудительная смена/длина → **zasady haseł w zasadach zabezpieczeń lokalnych** (`secpol.msc`).

## Профили пользователей (profile)

| Профиль | Где хранится | Особенность |
|---|---|---|
| **Lokalny** | на диске ПК (`C:\Users\…`) | создаётся при первом входе |
| **Mobilny (roaming)** | **на сервере**, копируется при входе/выходе | изменения сохраняются на сервере; доступен на любом ПК |
| **Obowiązkowy (mandatory)** | на сервере | **NTUSER.DAT → NTUSER.MAN**; изменения не сохраняются, меняет только админ |
| **Tymczasowy (temporary)** | локально, TEMP | загружается, **если профиль mobilny не удалось загрузить**; **удаляется после выхода**, изменения не сохраняются |

- Путь профиля в учётке: `\\serwer1\dane$\%username%` (`$` — скрытый ресурс). При политике «Ustaw ścieżkę profilu mobilnego» `\\serwer\profile` → профиль jkowal в `\profile\jkowal`.
- Folder redirection (Перенаправление папок), Folder macierzysty (home folder) — подключается буквой.

## DNS

| Запись | Назначение |
|---|---|
| **A** | имя → **IPv4 (32 бита)** |
| **AAAA** | имя → IPv6 |
| **CNAME** | **алиас** для записи A |
| **MX** | почтовый сервер домена |
| **NS** | авторитетный сервер имён (создаётся **автоматически** со strefą) |
| **SOA** | начало полномочий зоны (создаётся автоматически) |
| **PTR** | IP → имя (зона обратного просмотра, `in-addr.arpa`) |
| **SRV** | службы (AD: `_ldap._tcp`) |
| TXT | текст (SPF) |

- Зоны: **strefa wyszukiwania do przodu** (имя → IP), **wsteczna** (IP → имя); podstawowa, pomocnicza, skrótowa, zintegrowana z AD.
- `nslookup nazwa` — запрос к зоне **прямого** просмотра; `nslookup -type=mx domena` — MX.
- Клиент: `ipconfig /flushdns`, `/displaydns`, `/registerdns`. Порт **53** UDP/TCP.

## DHCP

- Процесс **DORA**: Discover → Offer → Request → Acknowledge (UDP 67 сервер / 68 клиент).
- **Zakres (scope)** — пул адресов; **wykluczenia** — исключения; **zastrzeżenie (rezerwacja)** — **конкретный IP по MAC-адресу**; czas dzierżawy (аренда).
- Opcje: 003 Router (brama), 006 Serwery DNS, 015 Nazwa domeny.
- В домене сервер DHCP нужно **autoryzować** в AD. Неактивный zakres — значок с **красной стрелкой вниз**.
- Нет DHCP → **APIPA 169.254.0.1 – 169.254.255.254** (/16).
- Проверка работы DHCP на клиенте: `ipconfig /release` + `ipconfig /renew`. DHCP relay — агент для другой подсети.

## IIS, FTP, WWW

- WWW: HTTP **80**, HTTPS **443**; FTP: **20 (dane), 21 (sterowanie)**; witryna FTP создаётся в **IIS (serwer sieci Web)**.
- FTP: tryb aktywny/pasywny; uwierzytelnianie anonimowe (выключено → нужен логин/пароль) / podstawowe; FTPS — шифрование.

## Файловые службы

- Udostępnianie: права udziału + NTFS (действует более строгое). Ukryty udział `nazwa$`. **Mapowanie** — `net use Z: \\serwer\dane` или GPO.
- **DFS**: przestrzenie nazw (единое дерево общих папок) + replikacja.
- **FSRM (Menedżer zasobów serwera plików)**:
  - **Przydziały (quotas)** на папку: **twardy** (запрещает запись сверх лимита) / **miękki** (только уведомление/мониторинг);
  - **Ekranowanie plików** — блокировка типов файлов (напр. .mp3, .exe);
  - **Raporty magazynu**.
- **Przydziały dyskowe NTFS** — на том и на пользователя (Właściwości dysku → Przydział).
- **Kopie w tle (Shadow Copies)** — предыдущие версии файлов.

## Серверы печати

- `printmanagement.msc` (Zarządzanie drukowaniem); развёртывание принтеров через GPO.
- Права: **Drukuj**, **Zarządzaj dokumentami**, **Zarządzaj drukarką**. Группа с «Zarządzaj dokumentami» не может печатать → дать **Drukuj**.
- Właściwości → Zaawansowane: доступность по часам, приоритет, пул принтеров.

## Hyper-V

- Гипервизор **типа 1** (bare-metal); требует **VT-x / AMD-V** (+ SLAT), 64-bit.
- Диски **VHD/VHDX**; **przełączniki wirtualne**: **zewnętrzny** (физическая сеть), **wewnętrzny** (ВМ + хост), **prywatny** (только ВМ); **punkty kontrolne (checkpoints)**; Generacja 1 (BIOS) / 2 (UEFI).
- Альтернативы на клиенте: VirtualBox, VMware (VirtualBox — **не** инструмент удалённого администрирования).

## WDS и WSUS

- **WDS**: установка ОС по сети через **PXE**; образы `boot.wim` (rozruchowy) и `install.wim` (instalacyjny); требует AD DS, **DHCP**, DNS. Карта сети с PXE позволяет загрузку без диска.
- **WSUS**: сервер скачивает обновления Microsoft, админ их **zatwierdza**, клиенты получают из LAN (настройка через GPO).

## Резервное копирование и RAID в Windows Server

- **Kopia zapasowa systemu Windows Server** (`wbadmin`): pełna, przyrostowa, **stan systemu (System State)**, **odtworzenie bare-metal**; восстановление AD — режим **DSRM**.
- Нельзя делать периодические копии на **DVD-ROM** (только чтение).
- RAID программно — **dyski dynamiczne** (`diskmgmt.msc`/diskpart):

| Wolumin | RAID | Мин. дисков | Ёмкость |
|---|---|---|---|
| prosty | — | 1 | |
| łączony (spanned) | JBOD | 2 | сумма |
| **rozłożony (striped)** | **RAID 0** | 2 | сумма, без защиты |
| **dublowany (mirrored)** | **RAID 1** | 2 | половина |
| **RAID-5** | RAID 5 | **3** | (n−1) × C — только Server |

- **Storage Spaces (Miejsca do magazynowania)**: simple, two-way/three-way mirror, parity.
- Надёжность + производительность на сервере → **RAID 1** (в вариантах CKE); hot-swap диски.

## Мониторинг и удалённое управление

- **Podgląd zdarzeń → Zabezpieczenia** — **успешные/неудачные входы** и операции с файлами (после включения аудита).
- **Monitor niezawodności** — **indeks stabilności** (1–10); Monitor wydajności (`perfmon`); Menedżer zadań; Monitor zasobów.
- RDP (3389), PowerShell Remoting, RSAT; VNC (RealVNC — полный удалённый контроль).
- SNMP: менеджер ↔ агент; агент сам сообщает о событии сообщением **trap**.

## Частые ловушки на экзамене

- Лес = **минимум одно дерево (один домен)**; учётки домена хранятся в **базе данных DC**.
- Перед AD DS нужен **DNS**; клиент в домен — его DNS должен указывать на DC.
- **Lokalna domeny** — права только в своём домене; **globalna** — члены только из своего домена; Wszyscy — наименьшие права.
- **Mandatory = NTUSER.MAN**; **tymczasowy** — когда mobilny не загрузился, удаляется после выхода.
- Новая зона прямого просмотра автоматически создаёт **SOA и NS**; имя → IPv4 = **A**, алиас = **CNAME**.
- Конкретный IP для ПК по MAC → **zastrzeżenie (rezerwacja) DHCP**; без DHCP → **169.254.x.x (APIPA)**.
- FTP-сайт создаётся в роли **IIS (serwer sieci Web)**; порты FTP **20 и 21**.
- Установка ОС по сети → **WDS**; маршрутизация → **Usługi zasad i dostępu sieciowego / Routing i dostęp zdalny**.
- **`dsrm`** удаляет OU; **`redircmp`** — OU по умолчанию для компьютеров; **`gpresult`** — итоговые политики.
- Сложность пароля → **минимум 6 знаков**; maks. okres 0 → пароль никогда не истекает.
