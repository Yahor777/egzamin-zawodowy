# DrayTek Vigor2927 (роутер из школьной лаборатории ZSE)

Это роутер, на котором идут занятия PSK (уроки 4–8): **DrayTek Vigor2927ac**, прошивка 4.3.2. Интерфейс отличается от TP-Link: тёмно-красная шапка, серое дерево меню слева, формы в рамках, кнопки **OK / Cancel** внизу. В тренажёре включается на странице *Настройки → Оборудование* («Как в моей школе») и в заданиях со стендом.

С завода: адрес **`192.168.1.1`**, логин и пароль **`admin` / `admin`**, DHCP включён (пул от `192.168.1.10`, 200 адресов). Порты: **WAN1** («в Интернет»), **P1–P5** (LAN), «WAN2 / P6» (становится LAN-портом P6, если выключить WAN2).

> На каждом занятии с DrayTek начинают со сброса: **System Maintenance → Reboot System → Using factory default configuration → Reboot Now** (или удержать кнопку *Factory Reset* на устройстве).

## Вход

Впиши адрес в браузер (`http://192.168.1.1`), логин и пароль, при желании выбери *Language* (English / Polski). ПК должен получить адрес по DHCP от роутера: смотри `ipconfig` → «Brama domyślna» = адрес роутера.

## WAN (внешний адрес) — WAN → Internet Access

Нажми «Details Page» у WAN1 (или щёлкни порт WAN1 на главной странице). Вкладка **Static or Dynamic IP**:

- *Obtain an IP address automatically* — адрес от провайдера по DHCP;
- *Specify an IP address* → **IP Address**, **Subnet Mask**, **Gateway IP Address** (например `172.16.110.201`, `255.255.255.0`, `172.16.110.2`);
- **DNS Server IP Address**: *Primary* `8.8.8.8`, *Secondary* `8.8.4.4`;
- **OK** → роутер спросит про перезагрузку — согласись.

Вкладка **PPPoE** — *Username* / *Password* провайдера.

## LAN: адрес роутера и DHCP — LAN → General Setup

Таблица LAN1…LAN8, у LAN1 нажми **Details Page**.

**Network Configuration** (слева): *IP Address* и *Subnet Mask* самого роутера, например `172.16.111.10 / 255.255.255.0 / 24`.

**DHCP Server Configuration** (справа), *Enable Server* («Włącz serwer»):

| поле | значение из урока 4 | что значит |
|---|---|---|
| **Start IP Address** («Początkowy adres IP») | `172.16.111.11` | первый выдаваемый адрес |
| **IP Pool Counts** («Rozmiar puli IP») | `100` | сколько адресов в пуле (**не** последний адрес!) → пул `.11–.110` |
| **Gateway IP Address** («Adres IP bramy») | `172.16.111.10` | шлюз для клиентов, обычно адрес роутера |
| **Lease Time** («Czas dzierżawy») | `86400` | аренда в **секундах** (86400 = 24 ч) |
| **DNS Server IP Address** → *Primary* | `172.16.111.10` | DNS |

Нажми **OK**. После смены адреса страница по старому адресу замолчит: на ПК сделай `ipconfig /renew` (или переподключи кабель) и открой роутер по новому адресу.

Чтобы перейти от «Początkowy adres + Rozmiar puli» к «конец пула»: конец = старт + число − 1 (`.11` + 100 − 1 = `.110`).

## Резервация адреса — LAN → Bind IP to MAC

1. *Bind IP to MAC*: **Enable**.
2. В **ARP Table** дважды щёлкни хост — IP и MAC попадут в поля справа.
3. Впиши нужный **IP Address** (например `172.16.111.55`), при желании *Comment*, нажми **Add** — запись появится в *IP Bind List*.
4. Нажми **OK** внизу страницы. На ПК: `ipconfig /release` и `/renew`.

Аналог TP-Link: *DHCP → Address Reservation*.

## VLAN — LAN → VLAN (урок 5 и 8)

1. Если нужны подсети LAN2, LAN3…: *LAN → General Setup → Details Page* у LAN2 (IP, DHCP) — радиокнопка **Enable** («Włącz») на этой странице. Пример урока 5: LAN2 `172.16.112.10`, DHCP `.11`, 100 адресов.
2. *LAN → VLAN* → **Enable**. Строки VLAN0…VLAN15 = группы:
   - отметь **порты** P1…P6 группы (P6 доступен, если выключен WAN2: *WAN → General Setup*, снять Enable у WAN2, перезагрузить);
   - **Subnet** — в какую подсеть (LAN1…LAN8) ведёт эта группа;
   - **VLAN Tag → Enable** + **VID** — порты отправляют кадры с меткой (trunk к свитчу). VID должен **совпадать с VLAN ID на свитче** и быть уникальным;
   - без *Tag* — порты доступа: ПК получает адрес из подсети группы.
3. *Permit untagged device in P1 to access router* — в P1 можно включить обычный ПК и попасть в сеть роутера (LAN1).
4. **OK**.

**Trunk к свитчу (урок 8):** VLAN0: P1, P2, подсеть LAN1, Tag VID `11`; VLAN1: P2, LAN2, VID `222`; VLAN2: P2, LAN3, VID `333`; VLAN3: P2, LAN4, VID `444`. На свитче создай VLAN 11, 222, 333, 444, порт, воткнутый в P2 роутера, поставь в **TRUNK** и добавь его во все VLAN.

## Wi-Fi — Wireless LAN (2.4 GHz) (урок 6)

- **General Setup**: *Enable Wireless LAN*; таблица SSID 1–4: имя в колонке **SSID**, *Enable* для SSID2–4, **Hide SSID** = скрытая сеть. **OK**.
- **Security**: вкладки *SSID 1…4*; *Mode* → **WPA2/PSK**, *Pre-Shared Key (PSK)* 8–63 символа. **Каждую вкладку настрой отдельно**, затем **OK**.
- 5 GHz — то же в *Wireless LAN (5 GHz)*.
- Скрытая сеть: на клиенте «подключиться к скрытой сети» и ввести имя SSID.

## Маршрут и проброс портов

- *Routing → Static Route*: нажми номер строки → **Destination IP Address** (адрес сети, например `10.10.0.0`), **Subnet Mask**, **Gateway IP Address**, **OK**.
- *NAT → Port Redirection*: номер строки → *Service Name*, *Protocol*, **Public Port**, **Private IP**, **Private Port**, *Enable*, **OK**.

## Пароль, перезагрузка, проверка

- *System Maintenance → Administrator Password*: Old Password, New Password, Retype New Password → **OK** (потом войти заново).
- *System Maintenance → Reboot System*: *Using current configuration* или *Using factory default configuration* → **Reboot Now**.
- *Diagnostics → Ping Diagnosis*: IP → **Run**. *DHCP Table* и *ARP Cache Table* показывают, кто что получил.

## Типичные ошибки

- Пул задан числом, а не последним адресом (**IP Pool Counts**).
- Lease Time вписан в минутах — поле в секундах.
- Забыли *Add* перед **OK** в Bind IP to MAC (запись не попадёт в список).
- VID на роутере и ID VLAN на свитче разные — по trunk ничего не ходит.
- Не настроили SSID 2 на странице *Security* (по умолчанию он открытый).
