# Шпаргалка: роутер + свитч (TP-Link и школьное оборудование)

Это короткая рабочая памятка для типового листа CKE. Полные объяснения — в разделах «Роутер», «Wi‑Fi», «Свитч SG108E», «Свитч T2500G», «DrayTek», «Подсети», «Стенд».

Оборудование меняется в **Настройки → Оборудование в тренажёрах**:

- **TP-Link: WR840N + SG108E** — домашняя пара;
- **Как в моей школе: DrayTek + TP-Link T2500G** — школьная пара ZSE Rzeszów.

Выбор действует на новые попытки.

## 1. Что должно быть в голове перед кликами

```
          WAN 100.100.100.9/28
                  │
             ┌─────────┐ LAN 192.168.16.1/24
             │ ROUTER  │ trunk VLAN 10,20
             └─────────┘
                  │
             ┌─────────┐
             │ SWITCH  │ management 192.168.16.2
             └─────────┘
               │     │
        VLAN10 PC1   VLAN20 PC2
        access       access
```

- **WAN** — внешняя сторона роутера; **NAT** там переводит частные адреса наружу.
- **LAN** — внутренняя сеть; обычно её адрес — шлюз клиентов.
- **DHCP pool** — диапазон свободных host-адресов. Он не должен включать адрес роутера.
- **Статический маршрут** = `сеть + маска + шлюз`.
- **SSID** — имя Wi‑Fi; **WPA2-PSK / AES** — правильная защита; ключ минимум 8 символов.
- **VLAN** — отдельная логическая сеть. Чаще всего VLAN 10 = одна IP-подсеть, VLAN 20 = другая.
- **Access / untagged** — порт конечного ПК.
- **Trunk / tagged** — порт между роутером и свитчём.
- **PVID** — VLAN нетегированных кадров. У access-порта PVID совпадает с его VLAN.
- **Management IP** — адрес веб-панели. На T2500G важна ещё **Management VLAN**.

## 2. Заводские адреса и первый вход

| Устройство | Адрес | Логин/пароль | Главная ловушка |
|---|---|---|---|
| TP-Link WR840N | `192.168.0.1` | `admin`/`admin` | LAN DHCP включён |
| TP-Link SG108E | `192.168.0.1` | `admin`/`admin` | DHCP нет; конфликтует с WR840N |
| DrayTek Vigor2927 | `192.168.1.1` | `admin`/`admin` | `P1–P5` — LAN; `P6` только если выключить WAN2 |
| TP-Link T2500G | `192.168.0.1` | `admin`/`admin` | DHCP нет; управление только из Management VLAN |

Для свитка без DHCP дай ПК статический адрес, например:

```
IP:   192.168.0.10
Mask: 255.255.255.0
```

## 3. Быстрый порядок действий в типовом задании

1. Подключи ПК к одному устройству и открой его.
2. Сначала задай management IP свитча, потом VLAN.
3. Настрой роутер: WAN → LAN → DHCP → Wi‑Fi → VLAN/резервации/маршруты.
4. Подключи trunk между роутером и свитчом.
5. Поставь access-порты ПК в нужные VLAN.
6. Обнови адрес ПК: `ipconfig /release` → `ipconfig /renew`, либо задай статику.
7. Проверь: `ipconfig /all`, `ping шлюз`, `ping другое устройство`.

## 4. TP-Link WR840N — коротко

### WAN

**Network → WAN**

| Поле | Что вводить |
|---|---|
| `WAN Connection Type` | `Static IP` или `Dynamic IP` по листу |
| `IP Address`, `Subnet Mask` | внешний адрес и маска |
| `Default Gateway` | шлюз провайдера, в той же подсети |
| `Primary DNS`, `Secondary DNS` | DNS из листа |

Проверка: **Network → WAN** после перезагрузки, `Status`.

### LAN

**Network → LAN**

| Поле | Что вводить |
|---|---|
| `IP Address` | шлюз LAN, например `192.168.16.1` |
| `Subnet Mask` | десятичная маска |
| `Custom Mask` | только если обычное поле не подходит |

После смены LAN роутер перезагружается, а ПК должен заново получить адрес.

### DHCP

**DHCP → DHCP Settings**

| Поле | Что вводить |
|---|---|
| `DHCP Server` | `Enable` |
| `Start IP Address` / `End IP Address` | пул, например `.100–.199` |
| `Address Lease Time` | минуты, максимум `2880` |
| `Default Gateway` | LAN-адрес роутера |
| `Primary DNS` | роутер или DNS из листа |

**DHCP → Address Reservation**: `MAC Address`, `Reserved IP Address`, `Description`, `Status` — фиксированный адрес для сервера/принтера.

### Wi‑Fi

**Wireless → Wireless Settings**

- `Wireless Network Name` — SSID;
- `Region` — `Poland`, если спрашивают;
- `Channel` — по заданию;
- `Enable Wireless Router Radio` — включено.

**Wireless → Wireless Security**

- `Security` — `WPA/WPA2 - Personal`;
- `Version` — `WPA2-PSK` или `Automatic`;
- `Encryption` — `AES`;
- `Wireless Password` — 8–63 ASCII символа.

### VLAN на роутере

**Network → 802.1Q VLAN**

1. `802.1Q VLAN` → `Enable`.
2. Создай `VLAN ID` и `VLAN Name`.
3. Порт к свитчу: `Tagged (trunk)` в нужных VLAN.
4. Порт к обычному ПК: `Untagged (access)` только в его VLAN.
5. Убери лишние access-порты из VLAN 1.

**Network → VLAN Interfaces**

- `VLAN ID`, `IP Address`, `Subnet Mask` — шлюз этой VLAN;
- DHCP при необходимости: `DHCP Server`, `Start IP Address`, `End IP Address`, `Address Lease Time`, `Default Gateway`, DNS.

## 5. TP-Link SG108E — коротко

### IP

**System → IP Setting**

- `DHCP Setting` — `Disable` для статики или `Enable`, если свитч должен получать адрес;
- `IP Address` — management IP;
- `Subnet Mask` — маска;
- `Default Gateway` — роутер этой сети.

### VLAN

**VLAN → 802.1Q VLAN**

- включи `802.1Q VLAN Configuration` → `Enable`;
- создай `VLAN ID` и `VLAN Name`;
- у порта выбирай `Untagged`, `Tagged` или `Not Member`.

**VLAN → 802.1Q PVID Setting**

- `PVID` — VLAN untagged/access-порта;
- выбери порт и `Apply`.

Правило:

```
access: Untagged в VLAN X + PVID X
trunk:  Tagged в VLAN 10,20,..., PVID обычно 1
```

Частые сообщения:

- `Please enable 802.1Q VLAN first.`
- `VLAN N does not exist. Please create it first (VLAN → 802.1Q VLAN).`
- `Port N: PVID is X, but the port is an untagged member of VLAN Y.`

## 6. DrayTek Vigor2927 — школьный роутер

### WAN

**WAN → Internet Access → Details Page у WAN1 → Static or Dynamic IP**

| Поле | Что вводить |
|---|---|
| `Specify an IP address` | выбрать для статического WAN |
| `IP Address`, `Subnet Mask` | WAN-адрес |
| `Gateway IP Address` | шлюз провайдера |
| `Primary IP Address` / `Secondary IP Address` | DNS |
| `Enable / Disable` | включить WAN1 |

Если нужен PPPoE, вкладка **PPPoE**, поля `Username`, `Password`, `PPP Authentication`.

### LAN и DHCP

**LAN → General Setup → Details Page у LAN1**

| Поле | Что вводить |
|---|---|
| `IP Address`, `Subnet Mask` | шлюз локальной сети |
| `For NAT Usage` | обычный LAN за NAT |
| `Enable Server` | DHCP включён |
| `Start IP Address` | первый адрес пула |
| `IP Pool Counts` | сколько адресов в пуле — это не конечный IP |
| `Gateway IP Address` | адрес LAN интерфейса |
| `Lease Time` | секунды |
| `Primary IP Address` / `Secondary IP Address` | DNS |

**LAN → Bind IP to MAC** — резервирование: `IP Address`, `Mac Address`, `Comment`, затем `Add`.

### VLAN и Wi‑Fi

**LAN → VLAN**

- строка VLAN0–VLAN15 = группа портов;
- `P1–P6` — какие физические порты входят;
- `Subnet` — какая LANx соответствует группе;
- `VLAN Tag → Enable` и `VID` — номер VLAN;
- `Wireless LAN(2.4GHz) SSID1–SSID4` — привязка Wi‑Fi к VLAN.

**Wireless LAN (2.4 GHz) → General Setup** — SSID, канал, `Hide SSID`.

**Wireless LAN (2.4 GHz) → Security** — `WPA2`, `AES`, `Pre-Shared Key(PSK)`.

### Маршруты и NAT

**Routing → Static Route**

- `Enable`;
- `Destination IP Address` — именно network;
- `Subnet Mask`;
- `Gateway IP Address`;
- `Network Interface`.

**NAT → Port Redirection**

- `Enable`, `Service Name`, `Protocol`, `WAN Interface`;
- `Public Port` / диапазон;
- `Private IP`, `Private Port`.

## 7. TP-Link JetStream T2500G — школьный свитч

### Management IP

**System → System Info → System IP**

| Поле | Что вводить |
|---|---|
| `IP Address Mode` | `Static` или `DHCP` |
| `Management VLAN` | VLAN, из которой открывается свитч |
| `IP Address` | management IP |
| `Subnet Mask` | маска |
| `Default Gateway` | шлюз этой VLAN |

Ошибка `VLAN N does not exist. Create the VLAN first...` означает: сначала создай VLAN, потом назначай её Management VLAN.

### Link Type и PVID

**VLAN → 802.1Q VLAN → Port Config**

| Значение | Что значит |
|---|---|
| `ACCESS` | порт конечного ПК; untagged ровно в одной VLAN |
| `TRUNK` | магистраль; VLAN идут tagged |
| `GENERAL` | гибкий режим; для каждой VLAN отдельно `UNTAG` или `TAG` |
| `PVID` | VLAN нетегированных кадров |

Важно: когда ACCESS-порт добавляют в VLAN, T2500G сам меняет PVID и убирает порт из других VLAN. У GENERAL такого автоматизма нет — проверь PVID вручную.

### Создание VLAN

**VLAN → 802.1Q VLAN → VLAN Config**

1. `VLAN ID:` — например `10`.
2. `Description:` — короткое имя.
3. В `VLAN Members` выбери порты.
4. Для ACCESS обычно `Egress Rule = UNTAG`; для TRUNK `TAG` или используй Link Type TRUNK.
5. `Create` или `Apply`.

После настройки не забудь **Save Config** — иначе перезагрузка потеряет изменения.

## 8. Мини-таблица масок

| Префикс | Маска | Host |
|---:|---|---:|
| `/24` | `255.255.255.0` | 254 |
| `/25` | `255.255.255.128` | 126 |
| `/26` | `255.255.255.192` | 62 |
| `/27` | `255.255.255.224` | 30 |
| `/28` | `255.255.255.240` | 14 |
| `/29` | `255.255.255.248` | 6 |
| `/30` | `255.255.255.252` | 2 |

Правило: network — первый адрес, broadcast — последний, устройствам — только host range.

## 9. Точные ошибки, которые чаще всего встречаются

| Сообщение | Смысл |
|---|---|
| `Invalid subnet mask.` / `Invalid subnet mask, please input another one.` / `Invalid Subnet Mask.` / `The subnet mask is invalid.` | неправильная маска |
| `The IP address is not a valid host address for this subnet mask.` | введён network или broadcast |
| `The default gateway must be in the same subnet as the IP address.` | шлюз из другой сети |
| `The WAN IP address and the LAN IP address cannot be in the same subnet. Please change the WAN or LAN settings.` | WAN и LAN пересекаются |
| `The LAN IP address of the router cannot be within the address pool.` | DHCP pool включает адрес роутера |
| `Address lease time is out of range (1 ~ 2880). Please input another time!` | lease в минутах у WR840N вне диапазона |
| `IP Pool Counts is out of range (1 ~ N).` | у DrayTek счётчик пула выходит за подсеть |
| `The wireless password must be 8–63 ASCII characters (or 64 hexadecimal characters).` | короткий/недопустимый WPA2-ключ |
| `The destination network does not match the subnet mask (network address would be ...).` | в static route host вместо network |
| `The destination must be a network address for this mask (host bits must be 0).` | то же на DrayTek |
| `The service port conflicts with an existing entry.` | порт уже проброшен |
| `Please enable 802.1Q VLAN first.` | на SG108E сначала включи 802.1Q |
| `Invalid VLAN ID. The valid range is 1–4094.` | VLAN вне диапазона |
| `VLAN N does not exist.` / `VLAN N does not exist. Create it first (VLAN Config).` | сначала создай VLAN |
| `VLAN 1 (Default VLAN) cannot be deleted.` | VLAN 1 нельзя удалить |
| `VLAN N is the Management VLAN and cannot be deleted.` | сначала смени Management VLAN |
| `There are unsaved changes. They will be lost after a reboot.` | T2500G не сохранён — `Save Config` |
| `ПК без DHCP-адреса (169.254.x.x)` | DHCP не отвечает |
| `ПК и устройство в разных VLAN` | VLAN/PVID/Management VLAN неправильные |
| `разные подсети` | адрес ПК не из сети устройства |

## 10. Проверка за 60 секунд

На Windows:

```powershell
ipconfig /all
ping 192.168.16.1
ping 192.168.16.2
```

Должно быть:

- IPv4 не `169.254.x.x`;
- маска совпадает с заданием;
- `Default Gateway` — роутер;
- DNS — по листу;
- ping шлюза проходит;
- панель роутера/свитча открывается по правильному management IP;
- на T2500G нажат **Save Config**;
- если устройство не открывается на Столе — сначала читать **«Почему не открывается?»**, а не гадать.

## 11. Самый короткий алгоритм VLAN

Если в листе написано «port 1 trunk, ports 2–4 VLAN 10, ports 5–8 VLAN 20»:

### SG108E

```
VLAN → 802.1Q VLAN → Enable
VLAN 10: port 1 Tagged; ports 2–4 Untagged
VLAN 20: port 1 Tagged; ports 5–8 Untagged
ports 2–8: Not Member в VLAN 1
VLAN → 802.1Q PVID Setting:
  ports 2–4 PVID 10
  ports 5–8 PVID 20
```

### T2500G

```
VLAN → 802.1Q VLAN → Port Config
  port 1 Link Type TRUNK
  ports 2–4 Link Type ACCESS
  ports 5–8 Link Type ACCESS

VLAN → VLAN Config
  VLAN 10: port 1 TAG + ports 2–4 UNTAG
  VLAN 20: port 1 TAG + ports 5–8 UNTAG

System IP → Management VLAN: та VLAN, где должен открываться свитч
Save Config
```

Если после этого свитч не открывается — чаще всего ПК остался не в Management VLAN, а не «свитч сломался».
