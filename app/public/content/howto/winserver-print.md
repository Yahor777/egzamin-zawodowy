# Windows Server: сервер печати — Usługi drukowania i zarządzania dokumentami

Сервер печати держит **очередь** сетевого принтера: клиенты печатают не напрямую на принтер, а в общий ресурс `\\SERWER\udział`, сервер сам отправляет задания на принтер по TCP/IP (порт RAW 9100). Так делается ćwiczenie nr 11 ZSE (*Serwer wydruku*) и задания CKE «zainstaluj i udostępnij drukarkę sieciową».

## 1. Установка роли

*Menedżer serwera* → **Dodaj role i funkcje** → *Typ instalacji* (oparta na rolach) → *Role serwera*: **Usługi drukowania i zarządzania dokumentami** → «Dodaj funkcje» (narzędzia) → *Usługi ról*: **Serwer wydruku** → **Zainstaluj**.

После установки: *Narzędzia* → **Zarządzanie drukowaniem** (или `printmanagement.msc` в «Uruchom»).

## 2. Дерево консоли

| Узел | Что там |
|---|---|
| Filtry niestandardowe | готовые фильтры: *Wszystkie drukarki*, *Drukarki nie gotowe*, *Drukarki z zadaniami* |
| Serwery wydruku → `WIN-… (lokalny)` | сам сервер |
| → Sterowniki | установленные драйверы (тип 3 / тип 4) |
| → Formularze | форматы бумаги (A4, A3…) |
| → Porty | LPT1:, COM1:, FILE: и **Standardowy port TCP/IP** к сетевым принтерам |
| → Drukarki | принтеры сервера и их очереди |

## 3. Kreator instalacji drukarki sieciowej

**ПКМ по «Drukarki»** → **Dodaj drukarkę…**:

1. *Metoda instalacji*: **Dodaj drukarkę TCP/IP lub usługi sieci Web przy użyciu adresu IP lub nazwy hosta** (или «Wyszukaj drukarki w sieci» — найдёт принтер, если он включён и в той же сети).
2. *Adres drukarki*: тип *Autowykrywanie*, **Nazwa hosta lub adres IP** = IP принтера (например `192.168.1.200`). Имя порта подставится само.
3. *Sterownik*: если принтер ответил — «Użyj sterownika drukarki wybranego przez kreatora», иначе **Zainstaluj nowy sterownik** → производитель → модель.
4. *Nazwa drukarki i ustawienia udostępniania*: имя, флажок **Udostępnij tę drukarkę**, **Nazwa udziału** (по ней подключаются клиенты), lokalizacja, komentarz.
5. Dalej → **Zakończ** (можно отметить «Wydrukuj stronę testową»).

Если принтер не ответил на адрес, мастер покажет «Wymagane dodatkowe informacje o porcie» — принтер добавится, но очередь будет **offline**: проверь кабель/питание принтера и адрес.

## 4. Właściwości drukarki

ПКМ по принтеру → **Właściwości…**:

- **Udostępnianie** — включить/выключить общий доступ, изменить имя ресурса. При включении общего доступа сервер включает «Udostępnianie plików i drukarek».
- **Porty** — какой порт использует принтер; «Włącz buforowanie drukarki» = пул из нескольких портов.
- **Zaawansowane** — «Dostępna od … do …» (часы работы), **Priorytet** 1–99, драйвер.
- **Zabezpieczenia** — права:

| Право | Что даёт |
|---|---|
| **Drukuj** | подключиться и печатать, управлять своими документами |
| **Zarządzaj dokumentami** | приостанавливать/отменять **чужие** задания в очереди |
| **Zarządzaj tą drukarką** | менять настройки, общий доступ и права |

По умолчанию: *Wszyscy* — Drukuj, *TWÓRCA-WŁAŚCICIEL* — Zarządzaj dokumentami, *Administratorzy* — всё. Пользователь добавляется кнопкой **Dodaj…** → имя → *Sprawdź nazwy*. «Odmów» сильнее «Zezwalaj».

## 5. Подключение с Windows 11

*Ustawienia* → **Bluetooth i urządzenia** → **Drukarki i skanery** → **Dodaj urządzenie** → «Drukarki, której szukam, nie ma na liście» → **Dodaj nowe urządzenie ręcznie** → **Wybierz drukarkę udostępnioną według nazwy** → `\\WIN-SERWER\drukarka` (или `\\192.168.1.1\drukarka`) → Dalej.

Если сервер спросит логин — введи учётку сервера (`WIN-SERWER\jnowak`). В списке появится «drukarka **na** WIN-SERWER». Открой её → **Drukuj stronę testową** → задание появится в очереди на сервере (*Zarządzanie drukowaniem* → ПКМ по принтеру → *Otwórz kolejkę drukarki*).

## 6. Типичные ошибки

| Сообщение | Причина |
|---|---|
| «Sprawdź nazwę drukarki i spróbuj ponownie» | неверное имя ресурса или принтер не udostępniona |
| «Odmowa dostępu» | нет права **Drukuj** (или стоит «Odmów») |
| «Nie odnaleziono ścieżki sieciowej» | нет связи с сервером, неверное имя/IP, брандмауэр блокирует SMB |
| Очередь «w trybie offline» | сервер не достаёт принтер по IP (кабель, адрес, другая сеть) |
