# Windows Server: RRAS — маршрутизация LAN, NAT, статические маршруты

Сервер с двумя сетевыми картами может стать **маршрутизатором** между двумя сетями или **NAT-шлюзом** в «внешнюю» сеть (ćwiczenie nr 8 ZSE: *Serwer routingu i dostępu zdalnego*). Одной роли недостаточно: нужны **служба Routing**, мастер настройки и **запущенная** служба «Routing i dostęp zdalny».

## 1. Установка роли

*Menedżer serwera* → **Dodaj role i funkcje** → *Typ instalacji* (oparta na rolach) → *Wybieranie serwera* → *Role serwera*: **Dostęp zdalny** → *Funkcje* (Dalej) → страница **Dostęp zdalny** (описание) → **Wybieranie usług ról**: поставь **Routing** → в окне «Czy dodać funkcje wymagane przez funkcję Routing?» нажми **Dodaj funkcje** (автоматически отметятся *DirectAccess i VPN (RAS)* и роль *Serwer sieci Web (IIS)*) → *Potwierdzenie* → **Zainstaluj**.

Без флажка **Routing** (только *DirectAccess i VPN*) сервер пакеты между картами **не** пересылает.

## 2. Первая настройка (мастер Wprowadzenie)

После установки в Menedżerze serwera появится **флажок с жёлтым треугольником** → *Konfiguracja po wdrożeniu* → **Otwórz kreatora Wprowadzenie**. В окне «Konfiguruj dostęp zdalny» выбери **Wdróż tylko sieć VPN** — откроется консоль **Routing i dostęp zdalny** (то же: *Narzędzia* → *Routing i dostęp zdalny* или `rrasmgmt.msc`).

## 3. Мастер «Konfiguruj i włącz routing i dostęp zdalny»

В консоли: **ПКМ по имени сервера** (`WIN-… (lokalny)`) → **Konfiguruj i włącz routing i dostęp zdalny** → *Kreator instalacji serwera routingu i dostępu zdalnego* → Dalej → страница **Konfiguracja**:

| Нужно | Выбор в мастере |
|---|---|
| Станции за сервером выходят в Интернет / во внешнюю сеть | **Translator adresów sieciowych** → *Połączenie internetowe NAT*: **Użyj tego interfejsu publicznego…** и выбери карту, смотрящую «наружу» (WAN) |
| Две сети общаются между собой (без NAT) | **Konfiguracja niestandardowa** → отметь **Routing sieci LAN** |
| NAT вручную | **Konfiguracja niestandardowa** → **Translator adresów sieciowych (NAT)** (+ потом IPv4 → NAT → *Nowy interfejs…*) |

Дальше *Dalej* → **Zakończ** → «Uruchamianie Routing i dostęp zdalny» → у сервера зелёная стрелка вверх.

> Подсказка школы: в Windows Server 2022 на первом проходе список интерфейсов иногда пуст (ошибка установщика). Тогда **Zakończ**, снова ПКМ → *Konfiguruj i włącz…* — второй раз интерфейсы уже видны.

Выключить: ПКМ по серверу → **Wyłącz routing i dostęp zdalny** (конфигурация, в т. ч. маршруты и NAT, удаляется). Остановить/запустить: *Wszystkie zadania* → *Zatrzymaj / Uruchom*.

## 4. IPv4 → Ogólne, Trasy statyczne, NAT

* **IPv4 → Ogólne** — интерфейсы и их адреса.
* **IPv4 → Trasy statyczne** → ПКМ → **Nowa trasa statyczna…**: *Interfejs*, *Miejsce docelowe*, *Maska sieci*, *Brama*, *Metryka* (1), — маршрут в сеть за другим маршрутизатором. Брама должна лежать в подсети выбранного интерфейса.
* **IPv4 → Translator adresów sieciowych (NAT)** → *Nowy interfejs…* → *Właściwości*: **Interfejs prywatny** (карта к ЛВС) или **Interfejs publiczny** (карта наружу) + флажок *Włącz translator adresów sieciowych na tym interfejsie*.

## 5. Как это работает при проверке (и что ломает ping)

| Симптом | Причина |
|---|---|
| Станция не пингует сеть за сервером | нет роли/службы **Routing**, мастер не выполнен, служба остановлена, не включён *Routing sieci LAN* |
| Станция пингует сервер, но не «внешний» роутер (при NAT-схеме) | нет NAT: роутер не знает сеть станции и не может вернуть ответ — включи NAT на публичном интерфейсе |
| Без NAT: ping не возвращается | на втором роутере нет **маршрута обратно** в сеть станции (на TP-Link: Advanced Routing → Static Routing → Add New; на DrayTek: Routing → Static Route → номер строки → Enable; сеть станции, маска, шлюз = IP «внешней» карты сервера) |
| У станции не указан шлюз | **Brama domyślna** станции = IP внутренней карты сервера |
| У сервера нет шлюза «наружу» | в «внешней» карте сервера нужна **Brama domyślna** = IP роутера |

Проверка на станции: `ipconfig /all`, `ping` адреса роутера (например `192.168.0.1`), `tracert`. Отметь в sprawozdaniu: адреса обеих карт сервера, мастер (скриншот), результат ping.
