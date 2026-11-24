# Шпаргалка: роутер и коммутатор (web GUI)

Встречается в 98 % листов. Оценивают **в момент, когда ты поднял руку** — экзаменатор смотрит прямо в GUI. До этого всё должно быть сохранено.

## 0. Как попасть в устройство

1. Подключи ПК кабелем к **LAN-порту** роутера (не WAN!) / к любому порту коммутатора.
2. Посмотри в документации на флешке `DOKUMENTACJA/PROGRAMY` → папки `RUTER`, `PRZEŁĄCZNIK`: заводской IP, логин, пароль.
3. Если роутер раздаёт DHCP — достаточно «получить IP автоматически». Коммутатор DHCP **не раздаёт** → поставь ПК статический адрес из той же подсети:

| Устройство (заводское) | Типичный адрес | ПК временно |
|---|---|---|
| TP-Link роутер | `192.168.0.1` или `192.168.1.1`, `tplinkwifi.net` | DHCP |
| TP-Link Easy Smart (TL-SG105E/108E) | `192.168.0.1` | `192.168.0.10/24` |
| TP-Link JetStream (T1500/SG2xxx) | `192.168.0.1` | `192.168.0.10/24` |
| Cisco SG/CBS | `192.168.1.254` | `192.168.1.10/24` |
| MikroTik | `192.168.88.1` | DHCP |

```powershell
# временный адрес на ПК (Windows), потом вернуть на нужный по заданию
netsh interface ipv4 set address name="Ethernet" static 192.168.0.10 255.255.255.0
ping 192.168.0.1
```

> Если устройство требует сменить пароль при первом входе — ставь пароль «по требованиям устройства» (в листе так и написано) и **запиши его** на листе/в голове. Обычно используют `ZAQ!2wsx`.
> Если ничего не открывается — сброс кнопкой Reset (10 с) и заново.

## 1. Роутер

### 1.1 WAN

| В листе | Где в GUI TP-Link (PL/EN) | Что поставить |
|---|---|---|
| `adres IP interfejsu WAN: 100.100.100.9/28` | *Sieć → WAN* (*Network → WAN*), «Typ połączenia WAN: **Statyczny adres IP**» | IP `100.100.100.9`, maska из префикса |
| `brama domyślna: 100.100.100.1` | то же окно, *Brama domyślna* | `100.100.100.1` |
| `serwer DNS: 4.4.4.4, drugi 8.8.8.8 (jeżeli wymagany)` | *Podstawowy / Zapasowy DNS* | оба |
| `konfiguracja automatyczna` | «Dynamiczny adres IP» | — |

Таблица префиксов (WAN часто /27–/30):

| Префикс | Маска | Адресов в подсети |
|---|---|---|
| /24 | 255.255.255.0 | 256 |
| /25 | 255.255.255.128 | 128 |
| /26 | 255.255.255.192 | 64 |
| /27 | 255.255.255.224 | 32 |
| /28 | 255.255.255.240 | 16 |
| /29 | 255.255.255.248 | 8 |
| /30 | 255.255.255.252 | 4 |

### 1.2 LAN

*Sieć → LAN* (*Network → LAN*): IP `192.168.16.1`, maska `255.255.255.0`. После сохранения роутер **перезагрузится и сменит адрес** → обнови IP на ПК (`ipconfig /renew` или вручную) и зайди по новому адресу.

### 1.3 DHCP

*DHCP → Ustawienia DHCP* (*DHCP Settings*):

| Поле PL | EN | Пример из листа |
|---|---|---|
| Serwer DHCP: Włącz / Wyłącz | DHCP Server: Enable / Disable | «serwer DHCP wyłączony» → Wyłącz! |
| Początkowy adres IP | Start IP Address | 192.168.16.20 |
| Końcowy adres IP | End IP Address | 192.168.16.50 |
| Czas dzierżawy | Address Lease Time | 12 h = 720 min, 45 min, 2 h = 120 min |
| Brama domyślna | Default Gateway | IP LAN роутера |
| Podstawowy / Zapasowy DNS | Primary / Secondary DNS | «przekazywany serwer DNS 10.0.0.3» |

Резервирование: *DHCP → Rezerwacja adresów* (*Address Reservation*) → *Dodaj* → `Adres MAC` + `Zarezerwowany adres IP` → Status *Włączony*.

MAC нужного интерфейса узнаёшь на самом ПК/сервере:

```powershell
getmac /v /fo list           # Windows: имя соединения + "Adres fizyczny"
ipconfig /all                # "Adres fizyczny . . . : 00-1A-2B-..."
```
```bash
ip link                      # Linux: link/ether 08:00:27:..
```

> Типичная ловушка: резерв «для интерфейса сервера, подключённого к коммутатору» → бери MAC именно **этого** порта (LAN2/LANZ…), а не второго. Проверка: на клиенте `ipconfig /release` + `ipconfig /renew` → должен прийти зарезервированный адрес. *Lista klientów DHCP* в роутере показывает, кто что получил.

### 1.4 Wi-Fi

*Sieć bezprzewodowa → Ustawienia podstawowe* + *Zabezpieczenia*:

| Требование | Настройка |
|---|---|
| SSID `EGZAMIN_05` | Nazwa sieci (SSID) — регистр важен |
| WPA2-PSK, AES/CCMP, ключ `egzamin05` | WPA/WPA2-Personal → Wersja **WPA2-PSK** (не «Auto/WPA+WPA2») → Szyfrowanie **AES** → Hasło |
| pasmo 2,4 GHz | включить 2,4 GHz (5 GHz можно выключить) |
| kanał = numer stanowiska | Kanał: `5` (не «Auto»); каналы 1–13 |
| Режим | 802.11 b/g/n mixed — оставить |

Если у роутера нет Wi-Fi, лист предлагает **отдельную точку доступа**: IP из LAN роутера (любой свободный), шлюз = IP роутера, режим *Access Point*, DHCP на AP выключить.

### 1.5 VLAN на роутере (trunk к коммутатору) и маршрут

В 2025–2026 появляется: «interfejs VLAN o ID = 10, port 2 rutera z tagowaniem (trunk), adres 192.168.0.1/24, DHCP dla VLAN, ruting między VLAN».
Порядок: включить 802.1Q → создать VLAN ID → порт 2 = **Tagged** → создать интерфейс (IP) для VLAN → при необходимости DHCP-сервер на этом интерфейсе → включить *Inter-VLAN routing* (у многих моделей включено по умолчанию).

Пример для MikroTik (если на стенде он):

```bash
/interface vlan add name=vlan10 vlan-id=10 interface=ether2
/ip address add address=192.168.0.1/24 interface=vlan10
/ip pool add name=p10 ranges=192.168.0.10-192.168.0.100
/ip dhcp-server add name=d10 interface=vlan10 address-pool=p10 lease-time=45m disabled=no
/ip dhcp-server network add address=192.168.0.0/24 gateway=192.168.0.1 dns-server=8.8.8.8,1.1.1.1
/ip route add dst-address=10.0.0.64/26 gateway=10.0.0.4      # trasa statyczna
```

Статический маршрут в TP-Link: *Routing zaawansowany → Statyczna tablica routingu* — сеть назначения `10.0.0.64`, maska `255.255.255.192`, brama `10.0.0.4`.

### 1.6 Port forwarding (редко)

*Przekierowanie NAT → Serwery wirtualne* (*Virtual Servers*): Port usługi 80 → Adres IP serwera 192.168.0.10 → Port wewnętrzny 80 → Protokół TCP → Włączony.

### 1.7 Пароль администратора

*Narzędzia systemowe → Hasło* (*System Tools → Password / Administration*): старый пароль, новое имя/пароль. Сохранить.

## 2. Коммутатор (managed switch)

### 2.1 IP управления

| Требование | TP-Link Easy Smart | TP-Link JetStream | Cisco SG/CBS |
|---|---|---|---|
| IP 192.168.0.2/24, brama = IP rutera | *System → IP Setting*: DHCP **Disable**, IP, Mask, Gateway → Apply | *System → System Info → System IP* (L2) или *L3 Features → Interface* (L3: IP на VLAN-интерфейсе) | *Administration → Management Interface → IPv4 Interface* |

«dla przełącznika L3 adres IP przypisany do VLAN o ID = 2» → на L3-свитче IP вешается **на интерфейс VLAN 2**, а не на VLAN 1. Плюс «ustaw VLAN 2 jako VLAN zarządzalny» (*Management VLAN*), если есть такая опция.

> Сменил IP/VLAN управления → связь со свитчем пропадёт. Перенастрой ПК и подключись в порт, который **в VLAN управления**.

### 2.2 VLAN 802.1Q — понятия

| Термин | PL в листе | Значение |
|---|---|---|
| Untagged / Access | «bez tagowania (tryb dostępu)» | порт принадлежит одному VLAN, кадры без метки; сюда ПК/сервер |
| Tagged / Trunk | «z tagowaniem (tryb trunk)» | порт несёт несколько VLAN с метками 802.1Q; к роутеру/другому свитчу |
| PVID | — | в какой VLAN попадают входящие нетегированные кадры порта. Для access-порта **PVID = ID его VLAN** |
| Not member | — | порт не входит в VLAN |

Порядок (Easy Smart):

1. *VLAN → 802.1Q VLAN* → **Enable** → Apply.
2. VLAN ID `2`, имя (любое) → порты 1,2,3 = **Untagged**, порт 4 = Tagged (если trunk), остальные Not Member → Add/Apply.
3. Удалить эти порты из VLAN 1 (в VLAN 1 сделать их *Not Member*), иначе часть моделей не даст сменить PVID.
4. *802.1Q PVID Setting*: порты 1–3 → PVID `2`. Trunk-порт обычно оставляют PVID 1.
5. *Save Config* (у JetStream/Cisco — обязательно «Save», иначе после перезагрузки всё пропадёт).

JetStream: *VLAN → 802.1Q VLAN → VLAN Config* (Create, VLAN ID, ports Untagged/Tagged) + *Port Config* (PVID, Link Type Access/Trunk/General).

Cisco-подобный CLI:

```bash
configure terminal
vlan 2
interface vlan 2
 ip address 192.168.1.2 255.255.255.0
exit
ip default-gateway 192.168.1.1
interface range gi1/0/1-3
 switchport mode access
 switchport access vlan 2
interface gi1/0/4
 switchport mode trunk
 switchport trunk allowed vlan add 2,3
end
copy running-config startup-config
```

### 2.3 Зеркалирование порта (port mirroring)

Easy Smart: *Monitoring → Port Mirror* → Enable → Mirroring Port (куда подключён Wireshark) → Mirrored Port(s) (за кем смотрим), Ingress/Egress.

## 3. Проверка

```powershell
ipconfig /all                    # свой IP/маска/шлюз/DNS
ping 192.168.16.1                # LAN роутера
ping 192.168.16.10               # коммутатор
ping -n 2 100.100.100.9          # WAN роутера (из LAN — отвечает)
tracert 8.8.8.8
arp -a                           # видны MAC соседей
```
```bash
ip a ; ip r ; ping -c 4 192.168.16.1
```

Если не пингуется:

| Симптом | Причина |
|---|---|
| Шлюз пингуется, коммутатор нет | у свитча другой IP/маска, ПК в другом VLAN, порт свитча не в VLAN управления |
| Сервер ↔ станция не пингуются | **брандмауэр Windows блокирует ICMP** (см. шпаргалку Windows) |
| После VLAN пропала связь | PVID не совпадает, порт оставлен в VLAN 1 |
| Клиент получает 169.254.x.x | DHCP выключен / порт в другом VLAN / резерв на чужой MAC |

## 4. Перед тем как поднять руку

- [ ] Все значения ровно как в листе (IP, маска, шлюз, DNS, диапазон DHCP, SSID регистр).
- [ ] DHCP **выключен**, если так написано.
- [ ] Конфигурация сохранена (Save Config), устройство не в режиме «ожидает перезагрузки».
- [ ] Кабели подключены **по схеме** (WAN↔порт, номера портов коммутатора!).
- [ ] Знаешь логин/пароль, чтобы быстро показать экзаменатору GUI.
