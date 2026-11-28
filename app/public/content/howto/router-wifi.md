# Роутер: Wi‑Fi, проброс портов, маршруты и пароль

Здесь две части:

- **TP-Link TL-WR840N** — домашний вариант в тренажёре;
- **DrayTek Vigor2927** — роутер школьной лаборатории ZSE Rzeszów.

Переключение: **Настройки → Оборудование в тренажёрах** → **«TP-Link: WR840N + SG108E»** или **«Как в моей школе: DrayTek + TP-Link T2500G»**. На уже начатую попытку переключение не действует — задание надо начать заново.

## 1. Понятия простыми словами

```
                Интернет
                   │
             WAN 100.100.100.9
             ┌────────────┐
             │   RUTER    │ LAN 192.168.16.1/24
             └────────────┘
                │       │
          кабель/LAN   Wi-Fi
                │       │
              PC1     laptop
```

- **SSID** — имя Wi‑Fi сети, например `EGZAMIN_05`. Оно чувствительно к регистру: `Egzamin_05` и `EGZAMIN_05` — разные сети.
- **WPA2-PSK** — вход в Wi‑Fi по одному общему паролю. **AES** — современное шифрование; TKIP на экзамене не выбирай без прямого требования.
- **Скрытая сеть** — роутер не рассылает SSID в эфир. Клиент должен вручную ввести точное имя сети.
- **NAT** — роутер переводит адреса частной LAN во внешний адрес WAN.
- **Проброс порта** — обратная операция к NAT: соединение, пришедшее снаружи на порт роутера, перенаправляется на конкретный компьютер LAN.
- **Статический маршрут** — запись «чтобы попасть в сеть X, отправляй пакеты шлюзу Y».
- **VLAN** — отдельная логическая сеть. На роутере trunk-порт помечается **Tagged**, а доступ-порт — **Untagged**; PVID важен на свитче.
- **Management IP** — адрес, по которому открывается панель устройства. У роутера это его LAN-адрес.

## 2. Wi‑Fi — Wireless

### 2.1. Wireless → Wireless Settings

Путь: **Wireless → Wireless Settings**.

| Поле | Что значит | Что вводить в типичном задании | Типичная ошибка |
|---|---|---|---|
| **Wireless Network Name** | SSID | точно как в листе, с регистром | другое имя из-за автозамены телефона |
| **Region** | страна радиоканала | в симуляторе `Poland`, только просмотр | искать тут SSID |
| **Mode** | стандарты Wi‑Fi | обычно `11bgn mixed` | выбрать `11n only`, если старый клиент не подключается |
| **Channel Width** | ширина канала | обычно `Automatic`/`20MHz` | ставить `40MHz` без требования |
| **Channel** | номер канала | «kanał = numer stanowiska» → например `5` | оставить `Auto`, когда требуется конкретный канал |
| **Enable Wireless Router Radio** | включено ли радио | включить нужный диапазон; выключить, если лист просит не использовать его | настроить SSID, но оставить радио выключенным |
| **Enable SSID Broadcast** | видна ли сеть в списке | снять галочку для «sieć ukryta / nierozgłaszana» | думать, что скрытая сеть не требует пароля |
| **Enable WDS Bridging** | мост между точками | на экзамене обычно выключено | включить случайно |

После изменений — **Save**.

### 2.2. Wireless → Wireless Security

Путь: **Wireless → Wireless Security**.

| Поле | Что значит | Что выбрать | Типичная ошибка |
|---|---|---|---|
| **Security** | тип защиты | **WPA/WPA2 - Personal(Recommended)** | выбрать `Disable Security` |
| **Version** | версия WPA | **WPA2-PSK** | оставить `Automatic`, если лист прямо требует WPA2 |
| **Encryption** | шифрование | **AES** | выбрать TKIP |
| **Wireless Password** | ключ сети | пароль из листа, обычно 8–63 символа | опечатка или пробел в конце |
| **Group Key Update Period** | период обновления группового ключа | не менять, оставить `0` | случайно изменить |

Для задания «WPA2-PSK, AES/CCMP, hasło `egzamin05`» настройки такие:

```
Security:            WPA/WPA2 - Personal(Recommended)
Version:             WPA2-PSK
Encryption:          AES
Wireless Password:   egzamin05
```

### 2.3. Wireless → Wireless MAC Filtering и Statistics

- **Wireless → Wireless MAC Filtering** — ограничение по MAC-адресам. В типичных листах не нужно, если прямо не попросили фильтрацию.
- **Wireless → Wireless Statistics** — список подключённых беспроводных клиентов: `MAC Address`, `Current Status`, `Received Packets`, `Sent Packets`, `SSID`. Это проверка, что клиент реально подключился к правильной сети.

## 3. TP-Link: проброс порта — Forwarding → Virtual Servers

Задача звучит так: «przekieruj ruch z portu X interfejsu WAN do serwera Y na port Z».

Путь: **Forwarding → Virtual Servers → Add New…**, форма **Add or Modify a Virtual Server Entry**.

| Поле | Что значит | Пример | Типичная ошибка |
|---|---|---|---|
| **Service Port** | внешний порт на WAN | `80` или диапазон `8000-8010` | перепутать с внутренним |
| **Internal Port** | порт службы внутри LAN | `80`; можно оставить пустым для одиночного Service Port | заполнить диапазон — симулятор не примет |
| **IP Address** | сервер в LAN | `192.168.16.10` | вписать адрес самого роутера |
| **Protocol** | протокол | `TCP` для HTTP/FTP/RDP; `UDP`, если требуется; `All` — оба | выбрать UDP для обычного сайта |
| **Status** | активно ли правило | **Enabled** | сохранить Disabled |
| **Common Service Port** | шаблон известной службы | например `HTTP` подставит порт 80 | думать, что выбор шаблона уже сохранил запись — надо Save |

Пример: внешний порт `8080` перенаправить на сервер `192.168.16.10:80`:

```
Service Port:    8080
Internal Port:   80
IP Address:      192.168.16.10
Protocol:        TCP
Status:          Enabled
```

Список **Virtual Servers** показывает `Service Port`, `Internal Port`, `IP Address`, `Protocol`, `Status`.

## 4. Статический маршрут — Advanced Routing → Static Routing List

Путь: **Advanced Routing → Static Routing List → Add New…**.

| Поле | Что значит | Что вводить |
|---|---|---|
| **Destination Network** | адрес **сети**, а не одного компьютера | например `10.0.0.64` |
| **Subnet Mask** | маска этой сети | `/26` → `255.255.255.192` |
| **Default Gateway** | следующий роутер | например `10.0.0.4`; он должен быть достижим в LAN или WAN |
| **Status** | активен ли маршрут | **Enabled** |

Проверка: **Advanced Routing → System Routing Table**. Колонки: `Destination Network`, `Subnet Mask`, `Gateway`, `Interface`.

Частая ошибка: написать адрес хоста вместо адреса сети. Для `10.0.0.70/26` сеть — `10.0.0.64`, а не `.70`.

## 5. TP-Link: пароль и удалённое управление

### 5.1. System Tools → Password

| Поле | Что вводить |
|---|---|
| **Old User Name** | текущий логин, с завода `admin` |
| **Old Password** | текущий пароль, с завода `admin` |
| **New User Name** | обычно оставить `admin`, если новое имя не требуется |
| **New Password** | новый пароль из листа |
| **Confirm New Password** | тот же пароль ещё раз |

После Save тренажёр выходит на страницу входа — это правильно. Войди новыми данными.

### 5.2. Security → Remote Management

| Поле | Что значит | Что вводить |
|---|---|---|
| **Web Management Port** | порт панели со стороны WAN | например `8080` |
| **Remote Management IP Address** | кому разрешено управлять | `0.0.0.0` = выключено; `255.255.255.255` = всем; конкретный IP = только ему |
| **Status** | текущее состояние | только просмотр, показывает адрес вида `http://WAN:порт` |

На экзамене удалённое управление включай только по прямому требованию: это небезопасно.

## 6. DrayTek Vigor2927: Wi‑Fi

Подробная страница по всему DrayTek — `draytek`; здесь только Wi‑Fi для сравнения.

### 6.1. Wireless LAN (2.4 GHz) → General Setup

| Поле | Что значит | Что делать |
|---|---|---|
| **Enable Wireless LAN** | включено ли радио | отметить |
| **Mode** | стандарт Wi‑Fi | обычно `Mixed(11b+11g+11n)` |
| **Channel** | канал | `Auto` или `Channel N, …MHz` по заданию |
| **Enable** в строке SSID2–SSID4 | включена ли дополнительная сеть | включить только нужные SSID |
| **Active** | работает ли сейчас | только просмотр (`V` / `-`) |
| **SSID** | имя сети | точное имя, до 31 символа |
| **Hide SSID** | скрытая сеть | отметить, если требуется |
| **Isolate Member** | запрет клиентам одной сети видеть друг друга | только по требованию |
| **Isolate VPN** | запрет доступа клиентов к VPN | только по требованию |
| **Mesh Sync VLAN ID** | синхронизация Mesh | в заданиях не используется |
| **Schedule 1–4** | расписание работы Wi‑Fi | в симуляторе недоступно |

### 6.2. Wireless LAN (2.4 GHz) → Security

Вкладки **SSID 1…SSID 4** настраиваются отдельно.

| Поле | Что значит | Что выбрать |
|---|---|---|
| **SSID** | какая сеть настраивается | только просмотр |
| **Mode** | тип защиты | **WPA2/PSK** |
| **Encryption Mode** | шифрование | подсказка в интерфейсе: `TKIP for WPA/AES for WPA2 and WPA3` |
| **Pre-Shared Key(PSK)** | пароль сети | 8–63 символа |
| **Password Strength** | оценка пароля | только просмотр |
| **EAPOL Key Retry** | повтор ключевого обмена | оставить как есть |

Важно: если включил SSID2 в **General Setup**, но не открыл вкладку **SSID 2** в **Security**, сеть может остаться открытой (`Disable`). Это частая потеря балла.

Для 5 GHz меню аналогичное: **Wireless LAN (5 GHz) → General Setup / Security**, только другие режимы и каналы.

## 7. DrayTek: Static Route и Port Redirection коротко

- **Routing → Static Route** → номер строки → **Enable**, **Destination IP Address**, **Subnet Mask**, **Gateway IP Address**, **Network Interface**, **OK**.
- **NAT → Port Redirection** → номер строки → **Enable**, **Service Name**, **Protocol**, **WAN Interface**, **Public Port**, **Private IP**, **Private Port**, **OK**.

Подробные таблицы и ошибки — в `draytek`.

## 8. Частые ошибки и точные сообщения симулятора

| Сообщение | Где | Почему | Что делать |
|---|---|---|---|
| `The wireless network name (SSID) must be 1–32 characters long.` | TP-Link Wireless Settings | пустое или слишком длинное имя | 1–32 символа |
| `The SSID is too long (max. 32 bytes).` | TP-Link Wireless Settings | 32 байта, не 32 «видимых» символа; польские буквы длиннее | сократи имя |
| `Invalid channel.` | TP-Link Wireless Settings | канал не существует для диапазона | выбери канал из списка |
| `80MHz channel width is available only in a mode with 802.11ac.` | TP-Link Wireless Settings | ширина 80MHz без 802.11ac | смени Mode или ширину |
| `40MHz channel width requires 802.11n mode.` | TP-Link Wireless Settings | ширина 40MHz без 802.11n | смени Mode или ширину |
| `The wireless password must be 8–63 ASCII characters (or 64 hexadecimal characters).` | TP-Link Wireless Security | короткий/неподходящий пароль | 8–63 ASCII |
| `WEP is insecure and is not supported in 802.11n mode. Please choose WPA/WPA2 - Personal.` | TP-Link Wireless Security | выбран WEP | выбери WPA2-PSK |
| `WPA/WPA2 - Enterprise requires a RADIUS server, which is not available here. Please choose WPA/WPA2 - Personal.` | TP-Link Wireless Security | выбран Enterprise | выбери Personal |
| `Invalid service port. Use a port (1–65535) or a range, e.g. 8000-8010.` | TP-Link Virtual Servers | неправильный внешний порт | один порт или диапазон |
| `Invalid internal port (1–65535).` | TP-Link Virtual Servers | неправильный внутренний порт | число 1–65535 |
| `The internal port must be empty when the service port is a range.` | TP-Link Virtual Servers | для диапазона задан один внутренний порт | оставь Internal Port пустым |
| `The IP address must be a host in the LAN subnet (...)` | TP-Link Virtual Servers | сервер не из LAN | проверь IP сервера и LAN роутера |
| `The service port conflicts with an existing entry.` | TP-Link Virtual Servers | порт уже занят правилом | измени или удали старое правило |
| `The destination network does not match the subnet mask (network address would be ...).` | TP-Link Static Routing | вписан хост, а не адрес сети | вычисли network address |
| `The default gateway must be in the same subnet as the LAN or WAN IP address of the router.` | TP-Link Static Routing | следующий шлюз недостижим напрямую | укажи шлюз из подключенной сети |
| `This entry already exists.` | TP-Link Static Routing | такой маршрут уже есть | измени старую запись |
| `The old user name or old password is incorrect, please input again.` | TP-Link Password | неверные старые данные | заводские: `admin`/`admin`, если не менял |
| `The new password and the confirmed password do not match.` | TP-Link Password | опечатка в повторе | введи одинаково |
| `Invalid port. The valid range is 1–65535.` | TP-Link Remote Management | порт вне диапазона | например `8080` |
| `SSID1: the name must be 1 ~ 31 characters.` | DrayTek General Setup | пустой или слишком длинный SSID | 1–31 символ |
| `SSID 2: the Pre-Shared Key must be 8 ~ 63 ASCII characters (or 64 hexadecimal digits).` | DrayTek Security | неправильный ключ конкретного SSID | открой указанную вкладку и исправь пароль |

## 9. Как проверить и что смотрит экзаменатор

На ПК/ноутбуке:

```powershell
ipconfig /all
ping 192.168.16.1
```

Для Wi‑Fi в тренажёре важно:

1. Имя сети точно совпадает.
2. Сеть не скрыта, если этого не требовали; если скрыта — клиент подключается ручным вводом SSID.
3. Пароль WPA2 принят.
4. В **Wireless Statistics** появился клиент.

Экзаменатор обычно открывает:

- **Wireless Settings** — SSID, канал, радио, broadcast;
- **Wireless Security** — WPA2-PSK, AES, пароль;
- **Virtual Servers** — порт, IP сервера, протокол, Enabled;
- **Static Routing List / System Routing Table** — сеть, маска, шлюз, Enabled;
- затем проверяет с клиента связь или доступ к службе.

Не показывай экзаменатору незавершённую форму: сначала **Save/OK**, потом рука вверх.
