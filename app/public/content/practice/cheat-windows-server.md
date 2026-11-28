# Шпаргалка INF.02: Windows Server 2022

Краткая карта типичных формулировок CKE. Польские названия ролей, окон и вкладок оставлены как в польском Windows Server; объяснения — по-русски. Комментарии после `#` в командах не вводи в терминал.

| Консоль | Win+R | Что настраивает |
|---|---|---|
| Сеть | `ncpa.cpl` | карты, IPv4, DNS |
| Свойства системы | `sysdm.cpl` | имя сервера, домен, RDP |
| AD | `dsa.msc` | OU, пользователи, группы |
| DNS | `dnsmgmt.msc` | зоны и записи |
| DHCP | `dhcpmgmt.msc` | области и zastrzeżenia |
| GPO | `gpmc.msc` | объекты и связи групповых политик |
| IIS | `inetmgr` | WWW/FTP-сайты |
| Печать | `printmanagement.msc` | сервер печати |
| FSRM | `fsrm.msc` | квоты и osłony plików |
| RRAS | `rrasmgmt.msc` | маршрутизация, NAT, VPN |

## 1. Сеть

Сначала серверу задают статический IPv4, маску, шлюз и DNS. Для контроллера домена DNS часто указывает на сам сервер (`127.0.0.1` или его статический адрес). Путь: `ncpa.cpl` → ПКМ по карте → **Właściwości → Protokół internetowy w wersji 4 (TCP/IPv4)**.

<!-- e2:cmd:server -->
```cmd
ipconfig # базовая конфигурация
ipconfig /all # полная конфигурация
netsh interface show interface # имена карт
netsh interface ipv4 show config # конфигурация IPv4
netsh interface ipv4 set address name="Ethernet" static 192.168.5.1 255.255.255.0 192.168.5.254 # статический адрес
netsh interface ipv4 set dnsservers name="Ethernet" static 127.0.0.1 primary # DNS localhost
ping -n 2 192.168.5.1 # проверка связи
```

### NIC Teaming

Если лист просит объединить две карты: **Menedżer serwera → Serwer lokalny → Tworzenie zespołu kart interfejsu sieciowego: Wyłączone → ZADANIA → Nowy zespół**. Дай имя группе, отметь две карты; в **Właściwości dodatkowe** обычно выбирают **Niezależny od przełącznika** и **Dynamiczny**. IP-адрес потом настраивается на новой карте группы.

## 2. Установка ролей

Роль ставится мастером: **Menedżer serwera → Zarządzaj → Dodaj role i funkcje → Instalacja oparta na rolach lub funkcjach → сервер → роль → Dodaj funkcje → Zainstaluj**. После установки всегда смотри жёлтый флаг **⚑**: некоторые роли требуют завершения настройки.

| Роль в задании | Что отметить |
|---|---|
| kontroler domeny | **Usługi domenowe Active Directory** |
| DNS | **Serwer DNS** |
| DHCP | **Serwer DHCP** |
| WWW | **Serwer sieci Web (IIS)** |
| FTP | внутри IIS: **Serwer FTP → Usługa FTP** |
| print server | **Usługi drukowania i zarządzania dokumentami** |
| quota/file screen | **Menedżer zasobów serwera plików** |
| router/VPN/NAT | **Dostęp zdalny** + служба **Routing** или **DirectAccess i VPN (RAS)** |

<!-- e2:cmd:server -->
```cmd
servermanager # диспетчер сервера
dsa.msc # AD: пользователи и компьютеры
dnsmgmt.msc # DNS
dhcpmgmt.msc # DHCP
gpmc.msc # групповые политики
inetmgr # IIS
printmanagement.msc # печать
fsrm.msc # лимиты файлов
rrasmgmt.msc # маршрутизация/VPN
```

## 3. AD DS — контроллер домена

После установки **Usługi domenowe Active Directory** открой флаг **⚑ → Podnieś poziom tego serwera do kontrolera domeny**. Для первого домена выбери **Dodaj nowy las**, введи имя вроде `firma01.local` и пароль DSRM. Сервер перезагрузится.

| CKE пишет | Что сделать |
|---|---|
| `kontroler domeny` | роль AD DS → мастер повышения |
| `jednostka organizacyjna` | `dsa.msc` → ПКМ домен → **Nowy → Jednostka organizacyjna** |
| `użytkownik` | OU → **Nowy → Użytkownik** |
| `grupa globalna` | OU → **Nowy → Grupa** → **Globalna** + **Zabezpieczenia** |
| `dołącz klienta` | DNS клиента = сервер, затем `sysdm.cpl` или `netdom` |

<!-- e2:cmd:domain -->
```cmd
netdom join %computername% /domain:firma01.local /userd:FIRMA01\Administrator /passwordd:ZAQ!2wsx # присоединение клиента
gpupdate /force # обновление политик
gpresult /r # проверка GPO
```

### OU, пользователи, группы (`dsa.msc`)

OU — контейнер, к которому удобно привязывать GPO. Пользователь создаётся внутри OU: **Nowy → Użytkownik**. Обрати внимание на флажки пароля: **Użytkownik musi zmienić hasło…**, **Użytkownik nie może zmienić hasła**, **Hasło nigdy nie wygasa**, **Konto jest wyłączone**. Членство проверяется во вкладках **Członek grupy** пользователя или **Członkowie** группы.

## 4. DNS (`dnsmgmt.msc`)

Запись **A** переводит имя в IPv4, **PTR** — IPv4 в имя, **CNAME** — одно имя в другое. Прямая зона нужна для `www.firma01.local`, обратная — для проверки по IP.

<!-- e2:ps:dns -->
```powershell
Get-DnsServerZone # список зон
Add-DnsServerPrimaryZone -Name firma01.local # зона прямого просмотра
Add-DnsServerPrimaryZone -NetworkId 192.168.5.0/24 # зона обратного просмотра
Add-DnsServerResourceRecordA -ZoneName firma01.local -Name www -IPv4Address 192.168.5.1 -CreatePtr # запись A и PTR
Add-DnsServerResourceRecordCName -ZoneName firma01.local -Name ftp -HostNameAlias www.firma01.local. # запись CNAME
Get-DnsServerResourceRecord -ZoneName firma01.local # список записей
Add-DnsServerForwarder -IPAddress 8.8.8.8 # пересыльщик DNS
Get-DnsServerForwarder # проверка пересыльщиков
Resolve-DnsName www.firma01.local # проверка имени
```

В GUI: `dnsmgmt.msc` → сервер → **Strefy wyszukiwania do przodu/wstecznego** → **Nowa strefa…**. Для A-записи отметь **Utwórz skojarzony rekord wskaźnika (PTR)** только если обратная зона уже создана.

## 5. DHCP (`dhcpmgmt.msc`)

После роли DHCP заверши настройку через **⚑ → Dokończ konfigurację funkcji DHCP**. Область — это диапазон адресов, который сервер выдаёт клиентам; zastrzeżenie привязывает конкретный адрес к MAC.

| Элемент | Где |
|---|---|
| autoryzacja | **⚑ → Dokończ konfigurację funkcji DHCP** |
| zakres | `dhcpmgmt.msc → IPv4 → Nowy zakres…` |
| brama | опция **003 Router** |
| DNS | опция **006 Serwery DNS** |
| zastrzeżenie | **Zastrzeżenia → Nowe zastrzeżenie…** |

<!-- e2:cmd:dhcp -->
```cmd
ipconfig /release # освободить адрес
ipconfig /renew # обновить адрес
ipconfig /all # проверить DHCP/DNS/шлюз
```

Адрес `169.254.x.x` у клиента означает, что DHCP не ответил.

## 6. IIS — сайт WWW / FTP (`inetmgr`)

Для WWW ставится роль **Serwer sieci Web (IIS)**. Для FTP дополнительно нужна служба роли **Serwer FTP → Usługa FTP**. В консоли `inetmgr` сайт создаётся через **Witryny → Dodaj witrynę sieci Web…** или **Dodaj witrynę FTP…**.

- dokument startowy — **Dokument domyślny**;
- listowание каталога — **Przeglądanie katalogów**;
- host name `www.firma01.local` требует записи `A` в DNS;
- доступ из сети часто требует правила брандмауэра для TCP 80/21.

<!-- e2:cmd:iis -->
```cmd
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80 # HTTP
netsh advfirewall firewall add rule name="FTP" dir=in action=allow protocol=TCP localport=21 # FTP
netsh advfirewall firewall show rule name="HTTP" # проверка
```

## 7. Общие папки + NTFS

Для сетевого доступа действуют два независимых набора разрешений: **Uprawnienia udziału** и **Uprawnienia NTFS/Zabezpieczenia**. Итог — пересечение обоих; явное **Odmów** побеждает. Поэтому пользователь должен иметь доступ и к ресурсу, и к папке.

<!-- e2:cmd:shares -->
```cmd
mkdir C:\Dane # папка
net share Dane=C:\Dane /grant:Wszyscy,FULL # открытие общего доступа
net share # список
icacls C:\Dane # ACL
icacls C:\Dane /grant "FIRMA01\jkowalski:M" # разрешение modyfikacja NTFS
icacls C:\Dane /inheritance:d # отключение наследования
net share Dane /delete # удаление общего ресурса
```

Проверка с клиента:

<!-- e2:cmd:shareclient -->
```cmd
net use P: \\192.168.5.1\Dane /user:FIRMA01\jkowalski Start#1234 /persistent:no # подключение
net view \\192.168.5.1 # общие ресурсы после учётных данных
dir P:\ # чтение
echo test > P:\test.txt # запись
net use P: /delete # отключение
```

## 8. Квоты

Квота ограничивает размер папки. **Twardy przydział** не даёт записать больше лимита, **miękki** только отмечает превышение. В консоли `fsrm.msc` используй **Zarządzanie przydziałami**; для запрета типов файлов — **Zarządzanie osłanianiem plików**.

<!-- e2:cmd:fsrm -->
```cmd
dirquota quota add /Path:C:\Dane /Limit:10MB /Type:Hard # жёсткий лимит
dirquota quota list # список лимитов
fsutil file createnew C:\Dane\test.dat 1048576 # тестовый файл
dirquota quota delete /Path:C:\Dane # удаление лимита
```

## 9. GPO (`gpmc.msc`)

GPO — объект с настройками. Он начинает действовать только после **link** к домену, сайту или OU. Парольные политики домена редактируют на уровне домена; обои, запреты и подключение дисков обычно на уровне OU пользователей.

| Задание | Путь |
|---|---|
| minimalna długość hasła | **Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł** |
| blokada konta | **… → Zasady konta → Zasady blokady konta** |
| tapeta | **Konfiguracja użytkownika → Szablony administracyjne → Pulpit → Pulpit → Tapeta pulpitu** |
| blokada Panelu | **Konfiguracja użytkownika → Szablony administracyjne → Panel sterowania → Zabroń dostępu do Panelu sterowania i ustawień komputera** |
| dysk sieciowy | **Konfiguracja użytkownika → Preferencje → Ustawienia systemu Windows → Mapowania dysków** |

Проверка: `gpupdate /force`, затем `gpresult /r` на клиенте.

## 10. Принтер (print server)

1. Установи роль **Usługi drukowania i zarządzania dokumentami**.
2. Открой `printmanagement.msc → Serwery wydruku → сервер → Drukarki`.
3. Добавь принтер TCP/IP или локальный порт по заданию.
4. Включи **Udostępnij tę drukarkę** и впиши точную **Nazwa udziału**.
5. Во вкладке **Zabezpieczenia** проверь право **Drukowanie** для нужной группы.
6. На клиенте подключи `\\serwer\nazwa` и напечатай пробную страницу, если это требуется.

## 11. RDP, брандмауэр, маршрутизация

RDP включается в `sysdm.cpl` → **Zdalny** / **Zdalny pulpit**. На брандмауэре должны быть разрешены правила **Pulpit zdalny**. Для RRAS роль ставится через **Dostęp zdalny**, а настройка начинается в `rrasmgmt.msc` → **Konfiguruj i włącz Routing i dostęp zdalny**.

| Cel | Wybór |
|---|---|
| router między sieciami | **Routing LAN** |
| NAT | **Routing** + publiczny интерфейс в **NAT** |
| VPN | **DirectAccess i VPN (RAS)** |
| trasa statyczna | **IPv4 → Trasy statyczne** |

<!-- e2:cmd:rras -->
```cmd
ipconfig /all # адреса интерфейсов
route print # маршруты
ping 192.168.5.1 # связь
tracert 192.168.5.1 # путь
```

## 12. Пакетные файлы (на сервере тоже просят)

Для `.bat` действуют те же правила, что на клиенте: `@echo off`, `rem`, `set /a`, `for /L`, `%1`. Перед сдачей запусти файл и проверь фактический результат командами `dir`, `type` или `net user` — экзаменатор оценивает состояние, а не красивый текст скрипта.

## 13. Финальная проверка

1. В **Menedżer serwera** нет жёлтого уведомления о незавершённой настройке.
2. Объект имеет точное имя из задания: OU, пользователь, группа, зона, область, ресурс, сайт или принтер.
3. Клиент перезагружен после смены имени или присоединения к домену.
4. Результат проверен на клиенте, а не только создан на сервере.
5. Скриншоты показывают критерий: `ipconfig /all`, успешный `ping`, список пользователей/групп, запись DNS, область DHCP, ресурс или страницу IIS.

## Типичные ошибки

| Сообщение | Наиболее частая причина |
|---|---|
| `Nie można skontaktować się z kontrolerem domeny Active Directory` | DNS клиента не указывает на контроллер домена |
| `Wystąpił błąd systemowy 53.` | нет маршрута или неправильный UNC-путь |
| `Wystąpił błąd systemowy 1326.` | неправильный логин или пароль |
| `Wystąpił błąd systemowy 5.` | недостаточно прав |
| `nie można skontaktować się z serwerem DHCP` | DHCP недоступен или неавторизован |
