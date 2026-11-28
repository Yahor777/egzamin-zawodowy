# DrayTek Vigor2927: роутер школьной лаборатории ZSE

Это роутер, с которым идут занятия PSK в **ZSE Rzeszów**: **DrayTek Vigor2927ac**. Интерфейс не похож на TP-Link WR840N: слева серое дерево меню, формы в рамках, кнопки **OK / Cancel / Back** внизу. Свитч из той же лаборатории описан в `switch-t2500g`.

Переключение: **Настройки → Оборудование в тренажёрах** → **«Как в моей школе: DrayTek + TP-Link T2500G»**. Домашняя пара — **«TP-Link: WR840N + SG108E»**. Переключение действует только на новые попытки; начатое задание нужно сбросить.

## 1. Сначала понять схему и термины

```
                 Интернет / sieć zewnętrzna
                            │
                     172.16.110.2
                            │
              WAN1 172.16.110.201/24
                  ┌────────────────┐
                  │ DrayTek Vigor  │ LAN1 172.16.111.10/24
                  └────────────────┘
                       P1  P2(trunk)
                        │   │ VLAN 11,222,333 tagged
                        │ ┌───────────────┐
                        └─│ T2500G-10TS   │
                          └───────────────┘
                             │        │
                         access    access
                         VLAN 11   VLAN 222
                             │        │
                            PC1      PC2
```

- **WAN** — интерфейс «наружу». У DrayTek основной порт называется **WAN1**.
- **NAT** — роутер подменяет адреса LAN внешним адресом WAN, поэтому вся локальная сеть может выходить через один адрес.
- **LAN1…LAN8** — отдельные внутренние подсети DrayTek. У каждой может быть свой адрес роутера и DHCP.
- **DHCP pool** — диапазон автоматически выдаваемых адресов. У DrayTek он задаётся **Start IP Address + IP Pool Counts**, то есть начало и **количество**, а не конец.
- **VLAN** — логическая сеть. На DrayTek строка VLAN объединяет порты/SSID и ведёт их в выбранную подсеть LANx.
- **Tagged/VID** — кадры с меткой VLAN. **VID** на DrayTek должен совпадать с **VLAN ID** на T2500G.
- **Untagged** — обычный кадр без метки; так работает порт конечного ПК.
- **PVID** — настройка свитча: в какую VLAN попадает нетегированный кадр. На DrayTek отдельного поля PVID нет.
- **Статический маршрут** — «сеть X искать через шлюз Y».
- **SSID** — имя Wi‑Fi; **WPA2/PSK** — вход по общему паролю.
- **Management IP** — адрес веб-панели роутера, то есть его LAN1 IP.

С завода: `192.168.1.1`, логин и пароль `admin` / `admin`, DHCP включён. Порты: **WAN1**, LAN-порты **P1–P5**. Порт **WAN2 / P6** становится LAN-портом **P6**, только если выключить WAN2.

На занятиях DrayTek часто начинают со сброса: **System Maintenance → Reboot System → Using factory default configuration → Reboot Now**.

## 2. Вход и главная страница

1. Подключи ПК в порт **P1–P5** (не WAN1).
2. Открой `http://192.168.1.1`.
3. Введи `admin` / `admin`.
4. На странице входа можно выбрать **Language**: English или Polski. Поля в этом документе названы как в английском интерфейсе тренажёра.

Ошибка входа показывает: `Username or Password error. Please try again.`

**Dashboard** показывает схему портов, адреса LAN/WAN и состояние. Щелчок по **WAN1** открывает настройки внешнего адреса.

## 3. WAN → Internet Access — внешний адрес

Путь: **WAN → Internet Access → Details Page у WAN1** или щелчок по **WAN1** на Dashboard. Страница имеет вкладки **PPPoE**, **Static or Dynamic IP**, а также недоступные в тренажёре PPTP/L2TP и IPv6.

### 3.1. Левая часть формы

| Поле | Что значит | Что делать |
|---|---|---|
| **Enable / Disable** | включён ли WAN1 | обычно **Enable** |
| **Enable PING to keep alive** | поддержание соединения ping | в тренажёре недоступно |
| **Mode** в **WAN Connection Detection** | способ проверки WAN | оставить `ARP Detect` |
| **MTU** | размер кадра | оставить `1500` |
| **Enable Bridge Mode** | режим моста | в тренажёре недоступно; на экзамене обычно не нужен |

### 3.2. Вкладка Static or Dynamic IP

| Поле | Что значит | Что вводить в типичном задании | Типичная ошибка |
|---|---|---|---|
| **Obtain an IP address automatically** | адрес от провайдера по DHCP | выбрать при «konfiguracja automatyczna» | выбрать, хотя задан статический адрес |
| **Router Name** | имя роутера для провайдера | обычно оставить `Vigor` | думать, что это SSID |
| **Domain Name** | домен провайдера | в тренажёре недоступно | искать сюда DNS |
| **Specify an IP address** | статический адрес | выбрать, если в листе есть IP/маска/шлюз | забыть выбрать и вводить поля вслепую |
| **IP Address** | адрес WAN1 | например `172.16.110.201` | вписать адрес LAN |
| **Subnet Mask** | маска WAN | например `255.255.255.0` | не перевести префикс |
| **Gateway IP Address** | шлюз провайдера | например `172.16.110.2` | вписать шлюз LAN |
| **Primary IP Address** в **DNS Server IP Address** | первый DNS | например `8.8.8.8` | перепутать со шлюзом |
| **Secondary IP Address** | запасной DNS | например `8.8.4.4` | оставить пустым, если требуется второй |

### 3.3. Вкладка PPPoE

| Поле | Что значит |
|---|---|
| **Username** | логин провайдера |
| **Password** | пароль провайдера |
| **PPP Authentication** | метод аутентификации; в тренажёре фиксированный `PAP or CHAP` |

После **OK** роутер спрашивает: `The router will restart to apply the WAN settings. Continue?` Нажми **OK** и подожди перезагрузку. Если ничего не изменилось, сообщение будет `No change.`

## 4. WAN → General Setup — как получить порт P6

Путь: **WAN → General Setup**.

В таблице есть строки WAN1/WAN2. Колонки:

| Колонка | Что значит |
|---|---|
| **Index** | имя WAN |
| **Enable** | включён ли интерфейс |
| **Physical Mode/Type** | тип порта |
| **Bandwidth(Kbps) DownLink/UpLink**, **Latency**, **Jitter**, **Pkt.Loss** | параметры линии, в тренажёре информационные |
| **Active Mode** | режим активности, обычно `Always On` |
| **Load Balance** | балансировка WAN |

Если снять **Enable** у **WAN2** и перезагрузить роутер, физический порт **WAN2 / P6** начинает работать как LAN-порт **P6**. Это нужно в листах, где VLAN разводится на 6 портов.

## 5. LAN → General Setup — LAN1…LAN8 и DHCP

### 5.1. Список сетей

Путь: **LAN → General Setup**.

Таблица показывает строки **LAN 1…LAN 8** и **DMZ Port**:

| Колонка | Что значит |
|---|---|
| **Index** | номер сети LAN |
| **Enable** | включена ли сеть |
| **DHCP** | есть ли DHCP |
| **DHCPv6** | DHCPv6, в заданиях не нужен |
| **IP Address** | адрес роутера в этой LAN |
| **Details Page** | страница настройки конкретной LAN |
| **IPv6** | в тренажёре недоступно |

У нужной строки нажми **Details Page**.

### 5.2. Details Page: Network Configuration

| Поле | Что значит | Что вводить | Типичная ошибка |
|---|---|---|---|
| **Enable / Disable** | включена ли LAN2–LAN8 | Enable, если нужна дополнительная подсеть | создать VLAN, но не включить нужную LAN |
| **For NAT Usage / For Routing Usage** | использовать NAT или чистую маршрутизацию | обычно `For NAT Usage` | менять без понимания |
| **IP Address** | адрес роутера в этой LAN | например `172.16.111.10` | вписать адрес хоста из пула |
| **Subnet Mask** | маска сети | например `255.255.255.0` | выбрать не тот префикс |
| **RIP Protocol Control** | протокол маршрутизации RIP | оставить Disable | включать без требования |

### 5.3. Details Page: DHCP Server Configuration

| Поле | Что значит | Что вводить | Типичная ошибка |
|---|---|---|---|
| **Disable / Enable Server / Enable Relay Agent** | выключить DHCP, раздавать самому или пересылать запросы | обычно **Enable Server** | выбрать Relay без DHCP-сервера |
| **Start IP Address** | первый адрес пула | например `172.16.111.11` | вписать адрес роутера |
| **IP Pool Counts** | **количество** адресов в пуле | например `100` → `.11–.110` | вписать сюда конечный адрес `.110` |
| **Gateway IP Address** | шлюз клиентов | адрес LAN-интерфейса роутера | вписать WAN-шлюз |
| **Lease Time** | время аренды | в **секундах**: `86400` = 24 ч | вписать минуты, как у TP-Link |
| **Clear DHCP lease for inactive clients periodically** | очищать неактивные аренды | оставить включённым | тратить время на это поле |
| **Primary IP Address** в **DNS Server IP Address** | первый DNS клиентов | из задания | задать DNS только на WAN |
| **Secondary IP Address** | запасной DNS | из задания или пусто | перепутать порядок |

Пример урока: LAN1 `172.16.111.10/24`, DHCP старт `.11`, пул 100 адресов, lease 24 ч:

```
IP Address:             172.16.111.10
Subnet Mask:            255.255.255.0
Enable Server:          выбрано
Start IP Address:       172.16.111.11
IP Pool Counts:         100        → конец пула 172.16.111.110
Gateway IP Address:     172.16.111.10
Lease Time:             86400      (секунды)
Primary IP Address:     172.16.111.10
```

Формула конца пула:

```
конец = старт + IP Pool Counts − 1
```

## 6. LAN → Bind IP to MAC — резервация адреса

Это аналог TP-Link **Address Reservation**: устройство с конкретным MAC всегда получает один и тот же IP.

Путь: **LAN → Bind IP to MAC**.

| Поле/элемент | Что значит | Что делать |
|---|---|---|
| **Enable / Disable** | включена ли привязка | Enable |
| **Strict Bind** | жёстко ограничивать непривязанные адреса | только если требуется |
| **Apply Strict Bind to Subnet** | подсеть строгой привязки | в тренажёре недоступно |
| **ARP Table** | известные роутеру хосты | выбери хост; в тренажёре достаточно одиночного щелчка |
| **IP Address** | резервируемый адрес | например `172.16.111.55` |
| **Mac Address** | MAC устройства | например `08-00-27-AA-BB-CC` |
| **Comment** | комментарий | необязательно, до 12 символов |
| **Add** | добавить в список | обязательно нажать до OK |
| **Update** | изменить выбранную запись | сначала выбрать в IP Bind List |
| **Delete** | удалить выбранную запись | сначала выбрать |
| **IP Bind List** | фактические резервации | проверка перед OK |

Правильная последовательность:

1. Включи **Enable**.
2. Выбери хост в **ARP Table** — IP и MAC подставятся.
3. Исправь **IP Address** на требуемый.
4. Нажми **Add**.
5. Проверь, что строка появилась в **IP Bind List**.
6. Нажми **OK** внизу страницы.
7. На клиенте обнови адрес: `ipconfig /release`, затем `ipconfig /renew`.

Самая частая ошибка — пропустить **Add**. Тогда поля заполнены, но записи нет.

## 7. LAN → VLAN — порты и подсети

Путь: **LAN → VLAN**.

В верхней части есть **Enable**. Таблица VLAN0…VLAN15 — это группы портов и беспроводных сетей.

| Колонка | Что значит | Что делать |
|---|---|---|
| **P1–P6** | какие физические LAN-порты входят в группу | отметь по схеме; P6 активен только при выключенном WAN2 |
| **Wireless LAN(2.4GHz) SSID1–SSID4** | какие SSID 2.4GHz входят в группу | отметь при необходимости |
| **Wireless LAN(5GHz) SSID1–SSID4** | какие SSID 5GHz входят в группу | отметь при необходимости |
| **Subnet** | какая подсеть обслуживает группу | LAN1…LAN8 |
| **VLAN Tag → Enable** | отправлять ли кадры с меткой | включить для trunk к свитчу |
| **VID** | номер метки VLAN | должен совпадать с VLAN ID на T2500G |
| **Priority** | приоритет 802.1p | обычно `0` |
| **Permit untagged device in P1 to access router** | разрешить обычному нетегированному устройству в P1 доступ к роутеру/LAN1 | включить, если ПК управления стоит в P1 |

Как понять строку:

```
VLAN0: P1+P2 отмечены, Subnet LAN1, Tag Enable, VID 11
```

Это значит: выбранные порты/SSID ведут в LAN1, а на проводных портах кадры этой группы помечаются VID 11. В тренажёре включение Tag для строки делает выбранные проводные порты tagged. Если Tag выключен — это access-порты без метки.

### Пример trunk к T2500G

Нужно: P2 роутера несёт VLAN 11, 222, 333; подсети LAN1/LAN2/LAN3.

1. В **LAN → General Setup** включи и настрой LAN2 и LAN3.
2. В **LAN → VLAN** включи **Enable**.
3. Настрой строки:

| строка | порты | Subnet | Tag Enable | VID |
|---|---|---|---|---|
| VLAN0 | P1, P2 | LAN1 | да | 11 |
| VLAN1 | P2 | LAN2 | да | 222 |
| VLAN2 | P2 | LAN3 | да | 333 |

4. Оставь **Permit untagged device in P1 to access router**, если ПК управления подключен в P1.
5. **OK**.
6. На T2500G создай VLAN `11`, `222`, `333`; порт к роутеру — TRUNK/TAG во всех этих VLAN.

VID должен быть уникальным в каждой строке. Wi‑Fi трафик всегда untagged, но SSID можно отнести к нужной VLAN-группе.

## 8. Wireless LAN (2.4 GHz / 5 GHz)

### 8.1. General Setup

Путь: **Wireless LAN (2.4 GHz) → General Setup** или **Wireless LAN (5 GHz) → General Setup**.

| Поле/колонка | Что значит | Что делать |
|---|---|---|
| **Enable Wireless LAN** | включено ли радио | отметить |
| **Mode** | стандарт Wi‑Fi | для 2.4GHz обычно `Mixed(11b+11g+11n)`; для 5GHz `Mixed(11a+11n+11ac)` |
| **Channel** | канал | Auto или конкретный канал из задания |
| **Enable** | включён ли SSID2–SSID4 | включить нужную дополнительную сеть |
| **Active** | работает ли сеть | только просмотр |
| **SSID** | имя сети | точно как в листе, до 31 символа |
| **Hide SSID** | скрытая сеть | включить, если «sieć ukryta» |
| **Isolate Member** | изолировать клиентов друг от друга | только по требованию |
| **Isolate VPN** | блокировать доступ к VPN | только по требованию |
| **Mesh Sync VLAN ID** | Mesh | не используется |
| **Schedule 1–4** | расписание | в тренажёре недоступно |

### 8.2. Security

Путь: **Wireless LAN (2.4 GHz) → Security** или **Wireless LAN (5 GHz) → Security**. Вкладки **SSID 1…SSID 4** настраиваются отдельно.

| Поле | Что значит | Что выбрать |
|---|---|---|
| **SSID** | имя настраиваемой сети | только просмотр |
| **Mode** | тип защиты | обычно **WPA2/PSK** |
| **Encryption Mode** | шифрование | в интерфейсе пояснение `TKIP for WPA/AES for WPA2 and WPA3` |
| **Pre-Shared Key(PSK)** | пароль | 8–63 ASCII или 64 hex |
| **Password Strength** | оценка сложности | только просмотр |
| **EAPOL Key Retry** | повтор обмена ключами | оставить включённым |

Не забудь вкладки SSID2–SSID4. Включить SSID2 в General Setup недостаточно: пароль задаётся на его собственной вкладке Security.

## 9. Routing → Static Route

Путь: **Routing → Static Route** → нажми номер строки **Index**.

| Поле | Что значит | Что вводить |
|---|---|---|
| **Enable** | активен ли маршрут | включить |
| **Destination IP Address** | адрес **сети** назначения | например `10.10.0.0` |
| **Subnet Mask** | маска сети назначения | например `255.255.0.0` |
| **Gateway IP Address** | следующий роутер | адрес соседнего роутера |
| **Network Interface** | через какой интерфейс идти | обычно LAN |

В таблице **Static Route Configuration** колонки `Status`, `Destination Address`, `Gateway` показывают результат.

Не вписывай в Destination адрес хоста. Если задание говорит о сети `10.0.0.64/26`, адрес назначения именно `10.0.0.64`, маска `255.255.255.192`.

## 10. NAT → Port Redirection

Путь: **NAT → Port Redirection** → нажми номер строки **Index**.

| Поле | Что значит | Пример |
|---|---|---|
| **Enable** | активно ли правило | включить |
| **Mode** | один порт или диапазон | `Single` |
| **Service Name** | имя правила | `HTTP` |
| **Protocol** | протокол | `TCP`, `UDP` или `TCP/UDP` |
| **WAN Interface** | внешний интерфейс | `All` или WAN1 |
| **Public Port / Public Port Start** | внешний порт | `80` |
| **Public Port End** | конец диапазона | только для `Range` |
| **Private IP** | сервер в LAN | `192.168.1.10` |
| **Private Port / Private Port Start** | внутренний порт | `80` |

Таблица **Port Redirection** показывает `Service Name`, `Protocol`, `Public Port`, `Private IP`, `Status`.

## 11. System Maintenance и Diagnostics

### 11.1. System Maintenance → Administrator Password

| Поле | Что вводить |
|---|---|
| **Old Password** | текущий пароль, с завода `admin` |
| **New Password** | новый пароль из задания |
| **Password Strength** | только индикатор |
| **Retype New Password** | повтор нового пароля |

После **OK** нужно войти заново.

### 11.2. System Maintenance → Reboot System

- **Using current configuration** — обычная перезагрузка.
- **Using factory default configuration** — сброс к заводским настройкам (`192.168.1.1`, `admin/admin`).

### 11.3. System Maintenance → Configuration Backup

- **Backup** — сохранить конфигурацию.
- **Restore** — восстановить из файла. Если файл не выбран, тренажёр пишет `Please select a configuration file first.`

### 11.4. Diagnostics

- **Routing Table** — таблица маршрутов: подключённые сети `C`, статические `S`.
- **ARP Cache Table** — IP ↔ MAC, полезно для Bind IP to MAC.
- **DHCP Table** — выданные адреса: `IP Address`, `MAC Address`, `Leased Time`, `HOST ID`.
- **Ping Diagnosis** — поля **Ping through** и **IP Address**, затем **Run**. `Reply` = есть связь, `Request timed out` = нет.

## 12. Частые ошибки и точные сообщения симулятора

| Сообщение | Где | Почему | Как исправить |
|---|---|---|---|
| `Please input the username.` | WAN PPPoE | пустой логин PPPoE | введи Username |
| `Invalid IP Address.` | WAN/LAN/Bind | адрес не IPv4 или недопустимый host | проверь адрес и маску |
| `Invalid Subnet Mask.` | WAN/LAN/Static Route | неверная маска | переведи префикс правильно |
| `Gateway IP Address is invalid or not in the same subnet as the IP Address.` | WAN | шлюз не из сети WAN | исправь шлюз или адрес |
| `Primary DNS server address is invalid.` / `Secondary DNS server address is invalid.` | WAN | DNS не является IPv4 | проверь DNS |
| `No change.` | WAN | нажал OK без изменений | это не ошибка |
| `The IP address / subnet overlaps with another LAN subnet.` | LAN | LANx пересекается с другой сетью | выбери другую подсеть или маску |
| `Start IP Address is invalid or outside the LAN subnet.` | LAN DHCP | старт пула не из сети LAN | пересчитай подсеть |
| `IP Pool Counts is out of range (1 ~ N).` | LAN DHCP | количество слишком большое/неверное | уменьши число, учитывая маску |
| `Gateway IP Address is invalid or outside the LAN subnet.` | LAN DHCP | шлюз не из LAN | обычно шлюз — IP роутера в этой LAN |
| `Lease Time is out of range.` | LAN DHCP | аренда вне диапазона | секунды 1–31536000 |
| `DNS Server IP Address is invalid.` | LAN DHCP | неверный DNS | проверь адрес |
| `Invalid MAC Address.` | Bind IP to MAC | MAC не в формате hex | 6 пар hex через `-` или `:` |
| `This MAC address is already in the IP Bind List.` | Bind IP to MAC | MAC уже привязан | измени существующую строку |
| `This IP address is already in the IP Bind List.` | Bind IP to MAC | IP уже привязан | выбери свободный IP |
| `Select an entry of the IP Bind List first.` | Update/Delete | не выбрана строка | щёлкни запись в IP Bind List |
| `VID must be a number between 0 and 4095.` | LAN VLAN | неверный VID | 0–4095 |
| `Each VID must be unique.` | LAN VLAN | одинаковый VID в двух строках | назначь разные VID |
| `Each VLAN group needs its own subnet (LANx) in this router: choose a different subnet for one of the groups.` | LAN VLAN | две tagged-группы ведут в одну LANx | выбери разные подсети LANx |
| `Invalid Destination IP Address.` | Static Route | неверная сеть назначения | IPv4-адрес сети |
| `The destination must be a network address for this mask (host bits must be 0).` | Static Route | вписан host вместо network | вычисли адрес сети |
| `Invalid Gateway IP Address.` | Static Route | неверный шлюз | проверь следующий роутер |
| `Please input the Service Name.` | Port Redirection | пустое имя правила | введи Service Name |
| `Invalid Public Port.` | Port Redirection | неверный внешний порт/диапазон | 1–65535, конец не меньше начала |
| `Invalid Private IP.` | Port Redirection | неверный сервер | IPv4 сервера LAN |
| `Invalid Private Port.` | Port Redirection | неверный внутренний порт | 1–65535 |
| `SSID1: the name must be 1 ~ 31 characters.` | Wi‑Fi General | пустой/длинный SSID | 1–31 символ |
| `SSID 2: the Pre-Shared Key must be 8 ~ 63 ASCII characters (or 64 hexadecimal digits).` | Wi‑Fi Security | неверный пароль конкретной вкладки | исправь именно этот SSID |
| `The old password is incorrect.` | Administrator Password | неверный старый пароль | заводской `admin` или твой текущий |
| `Please input the new password.` | Administrator Password | пустой новый пароль | введи пароль |
| `The password may contain up to 23 characters and no spaces.` | Administrator Password | слишком длинный/с пробелом | до 23 символов без пробелов |
| `The new password and the confirmation do not match.` | Administrator Password | повтор не совпал | введи одинаково |

## 13. Как проверить и что смотрит экзаменатор

На ПК:

```powershell
ipconfig /all
ping 172.16.111.10
```

Проверяй по порядку:

1. ПК получил адрес из правильной LAN/VLAN.
2. Шлюз — адрес DrayTek в этой LAN.
3. DNS — как требует лист.
4. `ping` до шлюза успешен.
5. Для Wi‑Fi клиент подключен к правильному SSID и получил адрес из правильной подсети.

Экзаменатор обычно открывает:

- **Online Status → Physical Connection** или **Dashboard** — применились ли WAN/LAN;
- **WAN → Internet Access → Details Page** — тип WAN, IP, маска, шлюз, DNS;
- **LAN → General Setup → Details Page** — LAN IP, DHCP start, pool count, lease, gateway, DNS;
- **LAN → Bind IP to MAC** — есть ли строка в IP Bind List и включён ли Enable;
- **LAN → VLAN** — порты, Subnet, VID;
- **Wireless LAN … → General Setup / Security** — SSID, Hide SSID, WPA2/PSK;
- **Diagnostics → DHCP Table / Ping Diagnosis** — реальную выдачу адресов и связь.

Перед поднятием руки проверь, что нажат именно **OK**, а не только заполнены поля, и что после перезагрузки страница открывается по новому адресу.
