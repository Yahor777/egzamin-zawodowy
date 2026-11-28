# Шпаргалка INF.02: Windows 11 — рабочая станция

Краткая карта типичных формулировок CKE. Польские названия окон, флажков и сообщений не переводи: на экзамене интерфейс будет именно таким. Комментарии после `#` в командах — только объяснение, в терминал их не вводи.

| Win+R | Что открывает |
|---|---|
| `ncpa.cpl` | **Połączenia sieciowe** — сетевые адаптеры |
| `sysdm.cpl` | **Właściwości systemu** — имя ПК, группа, домен, RDP |
| `lusrmgr.msc` | **Użytkownicy i grupy lokalne** |
| `gpedit.msc` / `secpol.msc` | локальные политики |
| `wf.msc` | брандмауэр в расширенном режиме |
| `diskmgmt.msc` | **Zarządzanie dyskami** |

## 1. Сеть

Путь в GUI: **Win+R → `ncpa.cpl` → Połączenia sieciowe → ПКМ по карте → Właściwości → Protokół internetowy w wersji 4 (TCP/IPv4)**. Для статического адреса выбери **Użyj następującego adresu IP**, для DHCP — **Uzyskaj adres IP automatycznie** и **Uzyskaj adres serwera DNS automatycznie**.

| CKE пишет | Что сделать |
|---|---|
| `zmień nazwę połączenia Ethernet na LAN_S` | `ncpa.cpl` → ПКМ карта → **Zmień nazwę** |
| `wyłącz interfejs` | `ncpa.cpl` → ПКМ → **Wyłącz** |
| `skonfiguruj statyczny adres IP` | IPv4 → **Użyj następującego adresu IP** |
| `adres ma być pobierany automatycznie` | обе опции **automatycznie**, затем `ipconfig /renew` |
| `wyświetl konfigurację TCP/IP` | `ipconfig` или `ipconfig /all` |
| `wyświetl adres fizyczny` | `getmac` или поле **Adres fizyczny** |

Помни: `/24` = `255.255.255.0`; `DNS: localhost` = `127.0.0.1`; `brama: brak` = поле шлюза пустое.

<!-- e2:cmd:client -->
```cmd
ipconfig # базовая конфигурация
ipconfig /all # полная конфигурация
ipconfig /release # освобождение DHCP
ipconfig /renew # обновление DHCP
ping -n 2 192.168.1.1 # проверка шлюза
tracert 192.168.1.1 # маршрут
arp -a # таблица ARP
getmac # физические адреса
netsh interface show interface # имена карт
netsh interface ipv4 show config # конфигурация IPv4
netsh interface set interface name="Ethernet" newname="LAN_S" # переименование
netsh interface ipv4 set address name="LAN_S" static 192.168.1.10 255.255.255.0 192.168.1.1 # статический адрес
netsh interface ipv4 set dnsservers name="LAN_S" static 192.168.1.1 primary # статический DNS
netsh interface ipv4 set address name="LAN_S" source=dhcp # возврат к DHCP
netsh interface ipv4 set dnsservers name="LAN_S" source=dhcp # автоматический DNS
netsh interface set interface name="LAN_S" admin=enabled # включение
netsh interface set interface name="LAN_S" admin=disabled # отключение
```

<!-- e2:ps:client -->
```powershell
Get-NetAdapter # карты
Rename-NetAdapter -Name "Ethernet" -NewName "LAN" # переименование
Disable-NetAdapter -Name "LAN" -Confirm:$false # отключение
Enable-NetAdapter -Name "LAN" # включение
Get-NetIPAddress -AddressFamily IPv4 # адреса IPv4
New-NetIPAddress -InterfaceAlias "LAN" -IPAddress 192.168.1.11 -PrefixLength 24 -DefaultGateway 192.168.1.1 # статический IP
Set-DnsClientServerAddress -InterfaceAlias "LAN" -ServerAddresses 192.168.1.1 # DNS
Set-NetIPInterface -InterfaceAlias "LAN" -Dhcp Enabled # DHCP
Set-DnsClientServerAddress -InterfaceAlias "LAN" -ResetServerAddresses # автоматический DNS
Test-NetConnection 192.168.1.1 # проверка связи
```

## 2. Имя ПК, рабочая группа, домен

`sysdm.cpl` → вкладка **Nazwa komputera** → **Zmień…**. Там же меняются **Nazwa komputera**, **Grupa robocza** и **Domena**. Перед присоединением к домену DNS клиента обязан указывать на контроллер домена; иначе будет **Nie można skontaktować się z kontrolerem domeny Active Directory**.

<!-- e2:cmd:domain -->
```cmd
netdom join %computername% /domain:firma01.local /userd:FIRMA01\Administrator /passwordd:ZAQ!2wsx # присоединение к домену
gpupdate /force # обновление GPO
gpresult /r # применённые политики
```

После перезагрузки вход доменным пользователем: **Inny użytkownik** → `FIRMA01\login` или `login@firma01.local`.

## 3. Пользователи и группы

GUI: `lusrmgr.msc` → **Użytkownicy** → ПКМ → **Nowy użytkownik…**. Поле **Nazwa użytkownika** — логин; **Pełna nazwa** — отображаемое имя. Флажки:

- **Użytkownik musi zmienić hasło przy następnym logowaniu** — при первом входе Windows попросит новый пароль;
- **Użytkownik nie może zmienić hasła** — пользователь сам не сменит пароль;
- **Hasło nigdy nie wygasa** — пароль не устаревает;
- **Konto jest wyłączone** — учётная запись отключена.

| CKE пишет | Минимальная команда |
|---|---|
| `utwórz konto` | `net user login haslo /add` |
| `nie może zmienić hasła` | `/passwordchg:no` |
| `musi zmienić hasło` | `/logonpasswordchg:yes` |
| `wyłącz konto` | `/active:no` |
| `konto wygasa` | `/expires:dd.mm.rrrr` |
| `utwórz grupę` | `net localgroup grupa /add` |
| `dodaj użytkownika do grupy` | `net localgroup grupa login /add` |

<!-- e2:cmd:client -->
```cmd
net user # учётные записи
net user jkowalski Start#1234 /add /fullname:"Jan Kowalski" /comment:"Biuro" # новая учётная запись
net user jkowalski /logonpasswordchg:yes # принудительная смена
net user jkowalski /passwordchg:no # запрет изменения
net user jkowalski /active:no # отключение
net user jkowalski /active:yes # включение
net user jkowalski # просмотр
net localgroup # группы
net localgroup Biuro /add # новая группа
net localgroup Biuro jkowalski /add # член
net localgroup Biuro # члены
net user jkowalski /delete # удаление учётной записи
net localgroup Biuro /delete # удаление группы
```

## 4. Локальные политики (`gpedit.msc` / `secpol.msc`)

Локальная политика действует только на этот компьютер; доменная GPO может её переопределить. Пароли и блокировка находятся в `secpol.msc` → **Zasady konta**:

- **Zasady haseł** — минимальная длина, сложность, срок действия пароля;
- **Zasady blokady konta** — порог и время блокировки;
- **Zasady lokalne → Opcje zabezpieczeń** — Ctrl+Alt+Del, сообщение при входе, переименование Administrator/Gość;
- **Zasady lokalne → Zasady inspekcji** — аудит входа и событий.

Проверка результата: выйди/войди или выполни `gpupdate /force`, затем проверь поведение системы.

## 5. Брандмауэр — ответ на ping

По умолчанию клиент может не отвечать на ICMP. Чтобы разрешить проверку связи: `wf.msc` → **Reguły przychodzące** → включи **Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)**.

<!-- e2:cmd:client -->
```cmd
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80 # правило TCP 80
netsh advfirewall firewall show rule name="HTTP" # просмотр правила
netsh advfirewall firewall delete rule name="HTTP" # удаление правила
netsh advfirewall show allprofiles # состояние брандмауэра
```

## 6. Диски, квоты, шифрование

`diskmgmt.msc` показывает диски, разделы, буквы и файловые системы. В типовом листе чаще всего требуются только проверка буквы/ФС и форматирование нового тома. Если в задании есть квота на профиль пользователя, смотри также раздел про FSRM на сервере — на клиенте она обычно не настраивается.

## 7. Общие папки и сетевые диски

Сетевой диск — это буква, подключённая к UNC-пути `\\serwer\udział`. Для скрытого ресурса имя заканчивается на `$`. После `net use` с логином и паролем Windows сохраняет poświadczenia, поэтому следующий `net view` уже не должен давать ошибку доступа.

<!-- e2:cmd:shareclient -->
```cmd
net use P: \\192.168.5.1\Dane /user:FIRMA01\jkowalski Start#1234 /persistent:no # подключение
net view \\192.168.5.1 # общие ресурсы после сохранения учётных данных
dir P:\ # проверка чтения
echo test > P:\test.txt # проверка записи
net use P: /delete # отключение
```

## 8. Принтер

**Ustawienia → Bluetooth i urządzenia → Drukarki i skanery → Dodaj drukarkę lub skaner**. Если принтер не найден автоматически: **Drukarki, której szukam, nie ma na liście** → **Wybierz drukarkę udostępnioną według nazwy** → `\\serwer\nazwa`.

## 9. Пакетные файлы (.bat)

| Требование | Строка |
|---|---|
| скрыть echo | `@echo off` |
| комментарий | `rem tekst` |
| вопрос пользователю | `set /p imie=Podaj imię: ` |
| арифметика | `set /a x=2+3` |
| цикл 1–10 | `for /L %%i in (1,1,10) do …` |
| параметр запуска | `%1` |
| записать вывод в файл | `polecenie > plik.txt` |

Файл должен называться например `C:\plik1.bat`, а не `plik1.bat.txt`. В **Eksplorator plików → Widok** включи **Rozszerzenia nazw plików**, чтобы видеть настоящее расширение.

## 10. Идентификация и диагностика

Для ответа «какая карта/порт/параметр» используй `msinfo32`, `devmgmt.msc`, `diskmgmt.msc`, `dxdiag` и `ipconfig /all`. Если в задании просят показать физический адрес, достаточно `getmac` или строки **Adres fizyczny** в `ipconfig /all`.

## 11. Типичные ошибки

| Сообщение | Что оно значит |
|---|---|
| `Adres IPv4 autokonfiguracji 169.254…` | DHCP не ответил, Windows выдал адрес APIPA |
| `Nazwa pliku, nazwa katalogu lub składnia etykiety woluminu jest niepoprawna.` | неправильное имя карты или пути |
| `Parametr jest niepoprawny.` | ошибка в IP, маске или синтаксисе |
| `Wystąpił błąd systemowy 53.` | сетевой путь не найден |
| `Wystąpił błąd systemowy 1326.` | неправильный логин или пароль |
| `Wystąpił błąd systemowy 5.` | недостаточно прав |

## 12. Финальная проверка

1. `ipconfig /all` — адрес, маска, шлюз и DNS соответствуют таблице листа.
2. `ping` шлюза и сервера успешен.
3. Для домена: `whoami` и `gpresult /r`.
4. Для сетевого диска: чтение и запись проверены файлом.
5. Для учётной записи: `net user login` и **Członek grupy** показывают требуемые параметры.
