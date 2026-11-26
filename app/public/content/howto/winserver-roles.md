# Роли Windows Server: как запомнить порядок шагов

Роли сервера — 13 % баллов, но размазаны по 1–3 балла. Цель — знать **путь** к каждой роли и не перепутать порядок. Подробные клики — в шпаргалке «Windows Server».

## 1. Общая схема любой роли

1. **Подготовка**: статический IP, имя сервера, нужные папки/файлы.
2. **Установка роли**: *Menedżer serwera → Zarządzaj → Dodaj role i funkcje* → роль (или функция) → *Zainstaluj*.
3. **Пост-конфигурация** (жёлтый флажок): DC — *Podnieś poziom…*, DHCP — *Ukończ konfigurację DHCP*.
4. **Консоль роли** (`.msc`) → объект (зона, область, сайт, принтер, GPO…).
5. **Связи**: GPO → OU, DHCP → интерфейс, IIS → IP/порт, принтер → общий доступ.
6. **Проверка со станции** + скриншот: `nslookup`, `ipconfig /all`, браузер, `\\SERWER\udział`, `gpresult /r`.

## 2. Что от чего зависит

| Сначала | Потом | Почему |
|---|---|---|
| Статический IP, DNS 127.0.0.1 | AD DS | DC не может менять адрес |
| Переименовать сервер | AD DS | после повышения — сложно |
| Обратная зона | A‑запись с галкой PTR | иначе PTR не создастся |
| Папка + общий доступ | профиль, GPO с обоями/дисками | путь UNC должен существовать |
| OU, пользователи в OU | GPO, связанный с OU | GPO действует на объекты внутри OU |
| DNS станции = IP DC | присоединение к домену | домен ищется через DNS |
| Остановить Default Web Site | новый сайт на :80 | конфликт привязки |

## 3. Консоли

| Роль | Консоль |
|---|---|
| Пользователи, OU, группы | `dsa.msc` |
| DNS | `dnsmgmt.msc` |
| DHCP | `dhcpmgmt.msc` |
| GPO | `gpmc.msc` |
| IIS (WWW, FTP) | `inetmgr` |
| Принтеры | `printmanagement.msc` |
| Квоты на папки | `fsrm.msc` |
| Маршрутизация/NAT | `rrasmgmt.msc` |
| Резервное копирование | `wbadmin.msc` |
| Локальные политики | `secpol.msc`, `gpedit.msc` |

## 4. «Где эта настройка?» — правило двух веток GPO

- **Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń**: пароли, блокировка, аудит, права пользователей, Ctrl+Alt+Del при входе.
- **Konfiguracja użytkownika → Zasady → Szablony administracyjne**: Panel sterowania, обои, regedit, cmd, Menedżer zadań, меню Пуск.
- **Konfiguracja użytkownika → Preferencje → Ustawienia systemu Windows → Mapowania dysków**: сетевые диски.
- Не GPO, а свойства учётки: «nie może zmienić hasła», профиль, часы входа.

## Страницы мастера «Kreator dodawania ról i funkcji» (WS 2022)

*Zanim rozpoczniesz* → *Wybieranie typu instalacji* → *Wybieranie serwera docelowego* → *Wybieranie ról serwera* → *Wybieranie funkcji* → страница роли (описание) → **Wybieranie usług ról** (только у ролей с «службами ролей») → *Potwierdzanie opcji instalacji* → *Postęp instalacji*. Службы ролей: **Dostęp zdalny** → *DirectAccess i VPN (RAS)*, **Routing**, *Serwer proxy aplikacji sieci Web*; **Serwer sieci Web (IIS)** → *Wspólne funkcje HTTP* (в т. ч. **Przekierowanie HTTP**), *Zabezpieczenia* (в т. ч. **Autoryzacja adresów URL**), *Serwer FTP → Usługa FTP*. Окно «Czy dodać funkcje wymagane przez funkcję …?» → **Dodaj funkcje**. Если после установки в Menedżerze serwera жёлтый треугольник — открой флажок (⚑): *Dokończ konfigurację funkcji DHCP*, *Podnieś poziom tego serwera do kontrolera domeny*, *Otwórz kreatora Wprowadzenie* (Dostęp zdalny → RRAS, см. «Windows Server: RRAS»).
