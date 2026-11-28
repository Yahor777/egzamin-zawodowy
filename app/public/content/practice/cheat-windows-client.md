# Шпаргалка INF.02: Windows 11 klient

Краткая карта типичных формулировок CKE. Названия окон и checkboxów оставляй по-польски, объяснения читай по-русски.

## 1. Сеть

| CKE пишет | Что сделать |
|---|---|
| `zmień nazwę połączenia Ethernet na LAN_S` | `ncpa.cpl` → PPM karta → **Zmień nazwę** |
| `wyłącz interfejs` | `ncpa.cpl` → PPM → **Wyłącz** |
| `skonfiguruj statyczny adres IP` | karta → **Właściwości → Protokół internetowy w wersji 4 (TCP/IPv4)** |
| `adres ma być pobierany automatycznie` | **Uzyskaj adres IP automatycznie** + **Uzyskaj adres serwera DNS automatycznie** |
| `wyświetl konfigurację TCP/IP` | `ipconfig` / `ipconfig /all` |
| `wyświetl adres fizyczny` | `getmac` lub **Adres fizyczny** |

`/24` = `255.255.255.0`; `DNS: localhost` = `127.0.0.1`; `brama: brak` = пустое поле.

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

## 2. Брандмауэр

Чтобы компьютер отвечал на ping: `wf.msc` → **Reguły przychodzące** → włącz **Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)**.

<!-- e2:cmd:client -->
```cmd
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80 # правило TCP 80
netsh advfirewall firewall show rule name="HTTP" # просмотр правила
netsh advfirewall firewall delete rule name="HTTP" # удаление правила
netsh advfirewall show allprofiles # состояние брандмауэра
```

## 3. Учётные записи и группы

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

## 4. Pliki `.bat`

| Требование | Строка |
|---|---|
| ukryć echo | `@echo off` |
| komentarz | `rem tekst` |
| pytanie | `set /p imie=Podaj imię: ` |
| arytmetyka | `set /a x=2+3` |
| pętla 1–10 | `for /L %%i in (1,1,10) do …` |
| parametr | `%1` |
| zapis wyniku | `polecenie > plik.txt` |

Имя должно быть `C:\plik1.bat`, а не `plik1.bat.txt`.

## 5. Domena i zasoby

<!-- e2:cmd:domain -->
```cmd
netdom join %computername% /domain:firma01.local /userd:FIRMA01\Administrator /passwordd:ZAQ!2wsx # присоединение к домену
gpupdate /force # обновление GPO
gpresult /r # применённые политики
```

Вход после перезагрузки: **Inny użytkownik** → `FIRMA01\login`.

<!-- e2:cmd:shareclient -->
```cmd
net use P: \\192.168.5.1\Dane /user:FIRMA01\jkowalski Start#1234 /persistent:no # подключение
net view \\192.168.5.1 # общие ресурсы после сохранения учётных данных
dir P:\ # проверка чтения
echo test > P:\test.txt # проверка записи
net use P: /delete # отключение
```

## 6. Принтер

**Ustawienia → Bluetooth i urządzenia → Drukarki i skanery → Dodaj drukarkę lub skaner**. Если не найден: **Drukarki, której szukam, nie ma na liście** → **Wybierz drukarkę udostępnioną według nazwy** → `\\serwer\nazwa`.

## 7. Типичные ошибки

| Сообщение | Значение |
|---|---|
| `Adres IPv4 autokonfiguracji 169.254…` | brak odpowiedzi DHCP |
| `Nazwa pliku, nazwa katalogu lub składnia etykiety woluminu jest niepoprawna.` | zła nazwa karty |
| `Parametr jest niepoprawny.` | zła składnia/maska/IP |
| `Wystąpił błąd systemowy 53.` | nie znaleziono ścieżki |
| `Wystąpił błąd systemowy 1326.` | złe poświadczenia |
| `Wystąpił błąd systemowy 5.` | brak uprawnień |

## 8. Test końcowy

1. `ipconfig /all` — adres/maska/brama/DNS.
2. `ping` bramy i serwera.
3. Domena: `whoami`, `gpresult /r`.
4. Zasób: `dir`, test zapisu.
5. Konto: `net user login` i `lusrmgr.msc`.
