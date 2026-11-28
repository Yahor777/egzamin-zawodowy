# Роутер (ruter): WAN, LAN, DHCP, VLAN, резервирование

Эта страница — про **TP-Link TL-WR840N** в тренажёре. В школе ZSE Rzeszów на занятиях стоит **DrayTek Vigor2927**: у него другое меню, он подробно описан на странице «DrayTek Vigor2927» (`draytek`).

Переключение оборудования: **Настройки → Оборудование в тренажёрах** → кнопка **«TP-Link: WR840N + SG108E»** или **«Как в моей школе: DrayTek + TP-Link T2500G»**. Выбор действует на **новые** попытки; уже начатое задание надо сбросить кнопкой «Заново».

## 1. Сначала понять, что вообще настраиваем

Типичная схема из листа CKE:

```
                 Интернет / провайдер
                         │
                  100.100.100.1
                         │
             WAN 100.100.100.9/28
                ┌────────────────┐
                │     RUTER      │  LAN 192.168.16.1/24
                └────────────────┘
                         │
                ┌────────────────┐
                │  PRZEŁĄCZNIK   │  192.168.16.2/24
                └────────────────┘
                   │          │
                PC1        serwer
           DHCP/static   192.168.16.10
```

Коротко о словах, которые встречаются почти в каждом листе:

- **WAN** — порт роутера «наружу», к провайдеру или другой сети. У него свой IP, маска, шлюз и DNS.
- **NAT** — роутер подменяет частные адреса LAN своим адресом WAN. Благодаря этому много компьютеров выходят наружу через один внешний адрес.
- **LAN** — внутренняя сеть. **IP Address** на странице LAN — адрес самого роутера и одновременно шлюз компьютеров.
- **DHCP pool** — диапазон адресов, которые роутер выдаёт автоматически, например `192.168.16.20–192.168.16.50`. Адрес роутера в пул входить не должен.
- **Статический маршрут** — ручная инструкция «сеть X искать через шлюз Y».
- **SSID** — имя Wi‑Fi сети. **WPA2-PSK + AES** — обычный домашний способ защиты с одним паролем.
- **VLAN** — несколько логических сетей внутри одних кабелей. **Untagged/access** — порт конечного устройства, кадры без метки. **Tagged/trunk** — порт между роутером и свитчем, кадры идут с меткой VLAN. **PVID** — VLAN, в который попадают входящие кадры без метки.
- **Management IP** — адрес, по которому открывается веб-страница устройства. У роутера это адрес LAN, у свитча — отдельный адрес управления.

После изменения любой страницы TP-Link нажимай **Save**. Если значения «не применились», чаще всего просто не нажали Save.

## 2. WAN — Network → WAN — внешний адрес

Открывается: **Network → WAN**.

| Поле | Что значит | Что вводить в типичном задании | Типичная ошибка |
|---|---|---|---|
| **WAN Connection Type** | способ подключения к провайдеру | **Static IP**, если в листе дан адрес; **Dynamic IP**, если «konfiguracja automatyczna»; **PPPoE**, если даны логин и пароль провайдера | выбрать Dynamic IP, хотя адрес явно напечатан в задании |
| **IP Address** | внешний адрес роутера | например `100.100.100.9` | вписать адрес сети `.0` или broadcast `.15` |
| **Subnet Mask** | маска сети WAN | перевести префикс: `/28` → `255.255.255.240` | оставить `255.255.255.0`, потому что «так было» |
| **Default Gateway** | шлюз провайдера | например `100.100.100.1` | вписать адрес LAN роутера |
| **MTU Size (in bytes)** | размер кадра | не менять, оставить `1500` | менять «для скорости» без требования |
| **Primary DNS** | первый DNS | DNS из листа, например `4.4.4.4` | перепутать местами Primary и Secondary |
| **Secondary DNS** | запасной DNS | второй DNS, если он дан | оставить `0.0.0.0`, когда в листе два сервера |
| **Use These DNS Servers** | вручную заданные DNS для Dynamic IP | включать только если задание просит DNS при автоматическом адресе | включить и не заполнить адреса |
| **PPP Username** | логин PPPoE | логин из листа | вписать его в Wi-Fi пароль |
| **Password** | пароль PPPoE | пароль из листа | лишний пробел в конце |
| **Confirm Password** | повтор пароля PPPoE | тот же пароль | опечатка во втором поле |
| **Secondary Connection** | резервное подключение | в симуляторе не используется | искать тут статический IP |
| **Wan Connection Mode** | режим поддержания PPPoE | оставить по умолчанию | тратить время на экзамене |

Если выбрать **L2TP/Russia L2TP** или **PPTP/Russia PPTP**, симулятор честно сообщает: `This connection type is not available in the simulator — choose Dynamic IP, Static IP or PPPoE.`

### Пример Static IP

В листе: «adres IP interfejsu WAN `100.100.100.9/28`, brama `100.100.100.1`, DNS `4.4.4.4`».

Вводишь:

```
WAN Connection Type: Static IP
IP Address:         100.100.100.9
Subnet Mask:        255.255.255.240     (/28)
Default Gateway:    100.100.100.1
Primary DNS:        4.4.4.4
Secondary DNS:      0.0.0.0 или второй DNS из листа
```

## 3. LAN — Network → LAN — внутренний адрес роутера

Открывается: **Network → LAN**.

| Поле | Что значит | Что вводить | Типичная ошибка |
|---|---|---|---|
| **MAC Address** | физический адрес LAN роутера | только просмотр | пытаться изменить |
| **IP Address** | адрес роутера в локальной сети, он же шлюз ПК | например `192.168.16.1` | вписать адрес из WAN |
| **Subnet Mask** | маска локальной сети | например `255.255.255.0` | выбрать не ту маску из списка |
| **Custom Mask** | ручная маска, если в списке выбрано Custom | например `255.255.255.192` для `/26` | забыть пересчитать `/26` в decimal-маску |

После **Save** появляется вопрос: `Modification of LAN Settings will result in the rebooting of this device, OK?` Затем сообщение: `The LAN settings have been changed. The router is rebooting, please wait…`

Что делать дальше:

1. Старый адрес страницы больше не открывается — это нормально.
2. ПК с DHCP: `ipconfig /release`, потом `ipconfig /renew`.
3. ПК со статическим адресом: задай адрес из новой сети.
4. Открой роутер по **новому** адресу.
5. Проверь DHCP: тренажёр сдвигает пул в новую сеть, но в листе может требоваться другой диапазон.

## 4. DHCP — DHCP → DHCP Settings — автоматическая выдача адресов

DHCP отвечает на вопрос компьютера «дай мне адрес». Клиент получает IP, маску, шлюз и DNS.

| Поле | Что значит | Что вводить в типичном задании | Типичная ошибка |
|---|---|---|---|
| **DHCP Server** | включён ли сервер | **Enable** или **Disable** строго по листу | оставить Enable, когда написано «serwer DHCP wyłączony» |
| **Start IP Address** | первый адрес пула | например `192.168.16.20` | вписать адрес роутера `.1` |
| **End IP Address** | последний адрес пула | например `192.168.16.50` | вписать количество адресов, как в DrayTek, — здесь нужен именно конец |
| **Address Lease Time** | время аренды | в **минутах**: 45 → `45`, 12 ч → `720`, 24 ч → `1440` | вписать секунды, как в DrayTek |
| **Default Gateway** | шлюз, который получит клиент | обычно LAN IP роутера | оставить пустым, если в листе явно требуется шлюз |
| **Default Domain** | DNS-суффикс | обычно пусто, если не требуется | вписать туда IP |
| **Primary DNS** | первый DNS клиентов | DNS из листа | задать только на WAN, но забыть передать клиентам |
| **Secondary DNS** | запасной DNS клиентов | второй DNS, если дан | перепутать с DNS самого роутера |

Пример: «zakres `192.168.16.20 ÷ 192.168.16.50`, czas dzierżawy 45 minut»:

```
DHCP Server:         Enable
Start IP Address:    192.168.16.20
End IP Address:      192.168.16.50
Address Lease Time:  45
Default Gateway:     192.168.16.1
```

Проверка: **DHCP → DHCP Clients List** — таблица `Client Name`, `MAC Address`, `Assigned IP`, `Lease Time`.

## 5. Резервирование — DHCP → Address Reservation — всегда один и тот же IP

Резервация привязывает IP к MAC-адресу. Устройство всё равно использует DHCP, но сервер каждый раз даёт ему один и тот же адрес.

1. Узнай MAC нужного интерфейса:
   - Windows: `ipconfig /all` → строка **Adres fizyczny**;
   - Linux: `ip link` или `ip a` → `link/ether`.
2. Открой **DHCP → Address Reservation → Add New…**.
3. Заполни форму **Add or Modify an Address Reservation Entry**:

| Поле | Что значит | Что вводить | Типичная ошибка |
|---|---|---|---|
| **MAC Address** | физический адрес устройства | `08-00-27-AA-BB-CC` или через двоеточия — симулятор нормализует | взять MAC другого интерфейса сервера |
| **Reserved IP Address** | закреплённый IP | адрес из LAN-подсети, обычно внутри пула | зарезервировать адрес роутера |
| **Description** | комментарий | необязательно | думать, что это имя DNS |
| **Status** | активна ли запись | **Enabled** | сохранить Disabled |

4. **Save**. Симулятор пишет: `Settings saved successfully. The changes will take effect after the router reboots.`
5. На клиенте обнови аренду: `ipconfig /release`, затем `ipconfig /renew`. В Linux можно переподключить интерфейс или выполнить `sudo netplan apply`.

Проверка: клиент получил именно зарезервированный адрес, а в **DHCP Clients List** виден правильный MAC.

## 6. Network → 802.1Q VLAN и VLAN Interfaces

Это нужно, когда в листе есть «VLAN o ID…», «port … z tagowaniem», «ruting między sieciami VLAN».

### 6.1. Network → 802.1Q VLAN

Сначала глобальные настройки:

| Поле | Что значит | Что делать |
|---|---|---|
| **802.1Q VLAN** | включены ли VLAN на роутере | **Enable** |
| **Inter-VLAN Routing** | может ли роутер маршрутизировать между VLAN | включить, если требуется «ruting między sieciami VLAN» |

Затем **Add New…** → форма **Add or Modify a VLAN Entry**:

| Поле | Что значит | Что вводить |
|---|---|---|
| **VLAN ID** | номер VLAN | число из листа, например `10` |
| **VLAN Name** | короткое имя | например `VLAN10` |
| **Port 1…Port 4** | роль каждого LAN-порта | **Not member** — не участвует; **Tagged (trunk)** — к свитчу/другому роутеру; **Untagged (access)** — к ПК или серверу |

В таблице **VLAN List** сокращения: `T` = Tagged, `U` = Untagged, `–` = не входит.

Важно: у TP-Link в этом симуляторе порт может быть **untagged только в одном VLAN**. Если сделать его untagged в новом VLAN, он автоматически убирается из untagged-членства в старом. Для trunk-порта выбирай **Tagged**.

### 6.2. Network → VLAN Interfaces

VLAN сам по себе — только «отдельная сеть на втором уровне». Чтобы роутер был шлюзом в этой сети, нужен интерфейс.

**Add New…** → форма **Add or Modify a VLAN Interface**:

| Поле | Что значит | Что вводить |
|---|---|---|
| **VLAN ID** | к какому VLAN относится интерфейс | существующий VLAN, но не VLAN 1 |
| **IP Address** | адрес роутера в этом VLAN | например `192.168.10.1` |
| **Subnet Mask** | маска этой сети | например `255.255.255.0` |
| **DHCP Server** | раздавать ли адреса в этом VLAN | **Enable**, если требуется |
| **Start IP Address** | начало пула VLAN | например `192.168.10.10` |
| **End IP Address** | конец пула VLAN | например `192.168.10.100` |
| **Address Lease Time** | аренда | в минутах |
| **Default Gateway** | шлюз клиентов | обычно IP интерфейса VLAN |
| **Primary DNS** | DNS клиентов | из задания |
| **Secondary DNS** | запасной DNS | из задания или пусто |

Порядок правильный:

1. Создать VLAN в **802.1Q VLAN**.
2. Назначить порт к свитчу **Tagged (trunk)**.
3. Создать интерфейс в **VLAN Interfaces**.
4. Включить DHCP интерфейса, если нужно.
5. Включить **Inter-VLAN Routing**, если VLAN должны видеть друг друга.
6. На свитче создать тот же VLAN ID и сделать порт к роутеру trunk/tagged.

## 7. Частые ошибки и точные сообщения симулятора

| Сообщение симулятора | Почему появилось | Как исправить |
|---|---|---|
| `Invalid IP address, please input another one.` | адрес не похож на IPv4 | проверь четыре числа 0–255 и точки |
| `Invalid subnet mask, please input another one.` | маска невозможна | используй правильную маску префикса, например `/28` → `255.255.255.240` |
| `The IP address is not a valid host address for this subnet mask.` | вписан адрес сети или broadcast | возьми адрес хоста внутри диапазона |
| `The default gateway must be in the same subnet as the WAN IP address.` | шлюз из другой сети | шлюз WAN должен быть в той же сети WAN |
| `The default gateway cannot be the same as the WAN IP address.` | шлюз равен адресу роутера | в листе шлюз обычно соседний адрес провайдера |
| `The WAN IP address and the LAN IP address cannot be in the same subnet. Please change the WAN or LAN settings.` | WAN и LAN пересекаются | сети должны быть разными |
| `The LAN IP address and the WAN IP address cannot be in the same subnet. Please input another one.` | то же при смене LAN | измени LAN или WAN |
| `The start IP address cannot be greater than the end IP address.` | пул перевёрнут | Start меньше End |
| `The LAN IP address of the router cannot be within the address pool.` | `.1` попал в пул | начни пул после адреса роутера |
| `Address lease time is out of range (1 ~ 2880). Please input another time!` | аренда вне диапазона | 1–2880 минут |
| `Invalid MAC address. Use the format XX-XX-XX-XX-XX-XX (or XX:XX:XX:XX:XX:XX).` | ошибка в MAC | 6 пар hex-символов |
| `The reserved IP address cannot be the LAN IP address of the router.` | зарезервирован адрес роутера | выбери адрес хоста |
| `This MAC address already has a reservation.` | запись уже есть | нажми Modify у существующей записи |
| `This IP address is already reserved for another device.` | IP занят другой резервацией | выбери свободный адрес или исправь старую запись |
| `Invalid VLAN ID. Enter a number between 1 and 4094.` / `The VLAN ID must be between 1 and 4094.` | неверный номер VLAN | используй ID из листа в диапазоне 1–4094 |
| `Select an existing VLAN (create it first on the 802.1Q VLAN page).` | интерфейс создан раньше VLAN | сначала создай VLAN |
| `The DHCP pool must be in the interface subnet (...)` | пул VLAN не из его сети | пересчитай сеть интерфейса |
| `The interface IP address cannot be within the address pool.` | адрес шлюза в пуле | начни пул после адреса интерфейса |

## 8. Как проверить и что смотрит экзаменатор

На ПК Windows:

```powershell
ipconfig /all
ping 192.168.16.1
```

Смотри:

- IPv4 Address — из нужной подсети или зарезервированный;
- Subnet Mask — соответствует префиксу;
- Default Gateway — адрес LAN роутера;
- DNS Servers — как в листе;
- `ping` до шлюза отвечает.

На самом роутере экзаменатор обычно открывает:

- **Status** — совпадают ли LAN, WAN, SSID и защита;
- **Network → WAN / LAN** — значения из листа;
- **DHCP → DHCP Settings** — включён/выключен, пул и аренда;
- **DHCP → DHCP Clients List** — клиенты реально получили адреса;
- **DHCP → Address Reservation** — MAC, IP, Enabled;
- **Network → 802.1Q VLAN / VLAN Interfaces** — ID, tagged/untagged, IP интерфейсов;
- **System Tools → Password** — фактически проверяется новым входом.

Главное правило: экзаменатору важно **итоговое состояние**, а не то, каким путём по меню ты до него дошёл.
