# Шпаргалка: Windows 10/11 (станция, польский интерфейс)

Логин: `Administrator` / `ZAQ!2wsx`. Консоли — через **Win+R**. PowerShell/CMD — *Uruchom jako administrator*.

| Win+R | Что открывает |
|---|---|
| `ncpa.cpl` | Połączenia sieciowe |
| `sysdm.cpl` | Właściwości systemu (имя, группа, домен, защита системы) |
| `lusrmgr.msc` | Użytkownicy i grupy lokalne (нет в Home) |
| `gpedit.msc` | Edytor lokalnych zasad grupy |
| `secpol.msc` | Zasady zabezpieczeń lokalnych |
| `wf.msc` | Zapora z zabezpieczeniami zaawansowanymi |
| `diskmgmt.msc` | Zarządzanie dyskami |
| `devmgmt.msc` | Menedżer urządzeń |
| `msinfo32` | Informacje o systemie |
| `dxdiag` | Narzędzie diagnostyczne DirectX |
| `optionalfeatures` | Włącz lub wyłącz funkcje systemu Windows |
| `control userpasswords2` / `netplwiz` | Konta użytkowników (Ctrl+Alt+Del) |
| `perfmon` / `resmon` | Monitor wydajności / zasobów |

## 1. Сеть

`ncpa.cpl` → ПКМ **Zmień nazwę** → **Właściwości** → *Protokół internetowy w wersji 4 (TCP/IPv4)* → *Użyj następującego adresu IP* / *Uzyskaj adres IP automatycznie* + *Uzyskaj adres serwera DNS automatycznie*. Wi-Fi: значок сети → SSID → *Połącz* → ключ; имя адаптера Wi-Fi меняется так же.
«Wyłącz przewodowy interfejs» → ПКМ → *Wyłącz*.
Суффикс DNS: `sysdm.cpl` → *Zmień…* → *Więcej…* → *Podstawowy sufiks DNS tego komputera*.

```powershell
Get-NetAdapter
Rename-NetAdapter -Name "Ethernet" -NewName "LAN3"
New-NetIPAddress -InterfaceAlias "LAN3" -IPAddress 172.16.0.3 -PrefixLength 24 -DefaultGateway 172.16.0.1
Set-DnsClientServerAddress -InterfaceAlias "LAN3" -ServerAddresses 172.16.0.4
Set-DnsClientServerAddress -InterfaceAlias "LAN3" -ServerAddresses 8.8.8.8,1.1.1.1
Set-NetIPInterface -InterfaceAlias "LAN_S" -Dhcp Enabled ; Set-DnsClientServerAddress -InterfaceAlias "LAN_S" -ResetServerAddresses
```
```bat
netsh interface set interface name="Wi-Fi" newname="LAN_K"
netsh interface ipv4 set address name="LAN3" static 172.16.0.3 255.255.255.0 172.16.0.1
netsh interface ipv4 set dnsservers name="LAN3" static 172.16.0.4 primary
netsh interface ipv4 add dnsservers name="LAN3" 1.1.1.1 index=2
netsh interface ipv4 set address name="LAN_S" source=dhcp
netsh interface ipv4 set dnsservers name="LAN_S" source=dhcp
ipconfig /release & ipconfig /renew        & rem «odnów dzierżawę DHCP»
ipconfig /all                              & rem «wyświetl uzyskany adres IP»
netsh wlan show interfaces                 & rem Wi-Fi: SSID, kanał, szyfrowanie
```

## 2. Имя ПК, рабочая группа, домен

`sysdm.cpl` → вкладка *Nazwa komputera*: *Opis komputera* → **Zmień…** → *Nazwa komputera*, *Członek: Grupa robocza `INF02`* или *Domena `egzamin.local`* (логин `Administrator` + пароль домена) → перезагрузка. Перед присоединением: **DNS станции = IP контроллера домена**, иначе «nie można skontaktować się z kontrolerem domeny».

```powershell
Rename-Computer -NewName "STACJA05" -Restart
Add-Computer -WorkgroupName "INF02"
Add-Computer -DomainName "egzamin.local" -Credential EGZAMIN\Administrator -Restart
gpupdate /force ; gpresult /r          # «odśwież zasady grupy»
```

Вход доменным пользователем: *Inny użytkownik* → `EGZAMIN\jnowak` (или `jnowak@egzamin.local`).

## 3. Пользователи и группы

`lusrmgr.msc` → *Użytkownicy* → ПКМ *Nowy użytkownik…*: Nazwa użytkownika, Pełna nazwa, hasło; флажки *Użytkownik musi zmienić hasło…*, *Użytkownik nie może zmienić hasła*, *Hasło nigdy nie wygasa*, *Konto jest wyłączone* (снять, если «uczen nie może się zalogować»). Вкладка *Członek grupy*.

```bat
net user tester /add                                   & rem без пароля
net user EGZAMIN "INF@02egz#" /add /fullname:"EGZAMIN" /passwordchg:no
net user uczen1 zaq1@WSX /add /expires:25.11.2025      & rem формат даты как в системе (PL: dd.mm.rrrr)
net user uczen /active:yes                             & rem разблокировать
net user uczen QweRTY!1
net localgroup testerzy /add
net localgroup testerzy tester /add
net localgroup Administratorzy TESTY /add
net localgroup "Czytelnicy dzienników zdarzeń" EGZAMIN /add
net localgroup "Użytkownicy zaawansowani" WEBMASTER /add
net accounts /lockoutthreshold:4 /minpwlen:8           & rem blokada po 4 próbach, min. długość
net user tester ; net localgroup testerzy              & rem проверка
```
```powershell
Set-LocalUser -Name uczen -PasswordNeverExpires $true -UserMayChangePassword $false
Enable-LocalUser uczen
New-LocalUser -Name jnowak -FullName "Jan Kowalski" -Password (Read-Host -AsSecureString)
```

Стандартные группы PL: *Administratorzy, Użytkownicy, Goście, Użytkownicy pulpitu zdalnego, Użytkownicy zaawansowani, Czytelnicy dzienników zdarzeń, Operatorzy kopii zapasowych*.

## 4. Локальные политики (`gpedit.msc` / `secpol.msc`)

| Требование из листа | Путь |
|---|---|
| Wymóg złożonych haseł | *Konfiguracja komputera → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł → Hasło musi spełniać wymagania co do złożoności* = Włączone |
| Próg blokady konta (4/5 prób) | … *Zasady konta → Zasady blokady konta → Próg blokady konta* |
| Wymagaj Ctrl+Alt+Del przy logowaniu | … *Zasady lokalne → Opcje zabezpieczeń → Logowanie interakcyjne: nie wymagaj naciśnięcia klawiszy CTRL+ALT+DEL* = **Wyłączone** (или `netplwiz` → *Zaawansowane* → ☑ *Wymagaj od użytkowników naciskania klawiszy Ctrl+Alt+Delete*) |
| Komunikat przy logowaniu «Witamy na egzaminie» | … *Opcje zabezpieczeń → Logowanie interakcyjne: tekst komunikatu dla użytkowników próbujących się zalogować* (+ *tytuł komunikatu…*) |
| Rejestrowanie udanych i nieudanych logowań | … *Zasady lokalne → Zasady inspekcji → Przeprowadź inspekcję zdarzeń logowania* = Sukces + Niepowodzenie |
| Zakaz zmiany strefy czasowej dla Użytkownicy | … *Zasady lokalne → Przypisywanie praw użytkownika → Zmienianie strefy czasowej* → удалить *Użytkownicy* |
| Brak «Zablokuj ten komputer» po Ctrl+Alt+Del | *Konfiguracja użytkownika → Szablony administracyjne → System → Opcje klawiszy Ctrl+Alt+Del → Usuń opcję Zablokuj komputer* |
| Zablokuj uruchamianie WordPad | *Konfiguracja użytkownika → Szablony administracyjne → System → Nie uruchamiaj określonych aplikacji systemu Windows* → `wordpad.exe` |
| Ukryj aplet Mysz | *Konfiguracja użytkownika → Szablony administracyjne → Panel sterowania → Ukryj określone elementy Panelu sterowania* → `Microsoft.Mouse` |
| Zakaz zmiany tła pulpitu | *Konfiguracja użytkownika → Szablony administracyjne → Panel sterowania → Personalizacja → Uniemożliwiaj zmianę tła pulpitu* |
| Zabroń dostępu do Panelu sterowania | *Konfiguracja użytkownika → Szablony administracyjne → Panel sterowania → Zabroń dostępu do Panelu sterowania i ustawień komputera* |

Не через политики:
- Automatyczne ukrywanie paska zadań: *Ustawienia → Personalizacja → Pasek zadań → Zachowania paska zadań*.
- Rozszerzenia plików: Eksplorator → *Widok → Pokaż → Rozszerzenia nazw plików* (Win10: *Widok → ☑ Rozszerzenia nazw plików*).
- Ukryj litery dysków: Eksplorator → *Opcje folderów → Widok* → снять *Pokaż litery dysków*.
- Wskaźnik kursora tekstu (kolor zielony): *Ustawienia → Ułatwienia dostępu → Kursor tekstu*.
- Punkt przywracania: `sysdm.cpl` → *Ochrona systemu* → (*Konfiguruj → Włącz ochronę systemu*) → **Utwórz…** → `egzamin`.
- Tapeta: ПКМ на файле → *Ustaw jako tło pulpitu*.

## 5. Брандмауэр — ответ на ping

Самое частое: «w razie potrzeby zmień ustawienia zapory» → разрешить **ICMPv4 echo request**.

```powershell
New-NetFirewallRule -DisplayName "test" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow
Set-NetFirewallProfile -All -Enabled True                         # «włącz zaporę, jeśli wyłączona»
Get-NetFirewallRule -Direction Inbound | Disable-NetFirewallRule  # «wyłącz wszystkie reguły przychodzące»
```
```bat
netsh advfirewall firewall add rule name="pingi" dir=in action=allow protocol=icmpv4:8,any
```
GUI: `wf.msc` → *Reguły przychodzące* → **Nowa reguła…** → *Niestandardowa* → *Wszystkie programy* → *Typ protokołu: ICMPv4* → *Dostosuj…* → *Określone typy ICMP* ☑ *Żądanie echa* → *Zezwalaj na połączenie* → Domena/Prywatny/Publiczny → Nazwa.
Или включить готовое правило *Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)*.

## 6. Диски, квоты, шифрование

**Разделы** (`diskmgmt.msc`): новый диск → *Inicjowanie dysku* (**GPT**/MBR) → ПКМ на *Nieprzydzielone* → **Nowy wolumin prosty…** → размер в МБ (40 % от 51200 МБ = 20480) → *Przypisz następującą literę dysku* → *System plików NTFS*, *Etykieta woluminu* `Dysk2_1` → ☑ *Wykonaj szybkie formatowanie*.

```bat
diskpart
list disk
select disk 1
clean
convert gpt
create partition primary size=20480
format fs=ntfs label=Dysk2_1 quick
assign letter=P
create partition primary
format fs=ntfs label=Dysk2_2 quick
assign letter=R
exit
```
Форматирование флешки: ПКМ → *Formatuj…* → NTFS, *Etykieta woluminu* `USB`.

**Квоты** (ПКМ на диске → *Właściwości* → **Przydział**): ☑ *Włącz zarządzanie przydziałami*, ☑ *Odmów miejsca na dysku użytkownikom przekraczającym limit przydziału* → *Wpisy przydziałów…* → *Przydział → Nowy wpis przydziału…* → пользователь → *Ogranicz miejsce na dysku do* 8 GB, *Ustaw poziom ostrzeżeń na* 7 GB. «20 % pojemności dysku» — посчитай от ёмкости в *Właściwości*.

```bat
fsutil quota enforce C:
fsutil quota modify C: 7516192768 8589934592 asystent
fsutil quota query C:
```

**Запрет доступа к диску M: для Praktykant**: *Właściwości → Zabezpieczenia → Edytuj → Dodaj* `Praktykant` → ☑ *Odmów* у *Pełna kontrola*.

**EFS**: файл → *Właściwości → Zaawansowane…* → ☑ *Szyfruj zawartość, aby zabezpieczyć dane* (`cipher /e C:\PLIKI\tapeta.jpg`). Только Pro/Enterprise/Education.
**BitLocker**: ПКМ на R: → *Włącz funkcję BitLocker* → ☑ *Użyj hasła do odblokowania dysku* → *Zapisz w pliku* (на флешку `Egzamin-x`) → *Szyfruj tylko zajęte miejsce* → Rozpocznij. Проверка: `manage-bde -status`.

## 7. Общие папки и сетевые диски

Общий доступ: папка → *Właściwości → Udostępnianie → Udostępnianie zaawansowane…* (имя, *Ogranicz liczbę równoczesnych użytkowników do 10*, *Komentarz*, *Uprawnienia*). Права NTFS — вкладка *Zabezpieczenia* (см. шпаргалку сервера).

```bat
net share INF02=C:\Obrazy /GRANT:Wszyscy,CHANGE /USERS:10
net share DRUGI=M:\ /GRANT:Administratorzy,FULL
net use K: \\STACJA\DRUGI /persistent:yes
net use M: \\192.168.0.3\jkowalski /user:jkowalski XSW@3edc /persistent:yes
net use                                     & rem lista
```
GUI: *Ten komputer* → *Mapuj dysk sieciowy* → litera, `\\serwer\zasób`, ☑ *Połącz ponownie przy logowaniu*. FTP в Проводнике: `ftp://10.10.2.20` в адресной строке.
Сетевой принтер с сервера: `\\SERWER\drukarka_05` в *Uruchom* → двойной клик, или *Drukarki i skanery → Dodaj*. Принтер по IP — см. шпаргалку сервера (TCP/IP, RAW, 9100).

## 8. Функции Windows (WSL, Hyper-V)

`optionalfeatures` → ☑ *Podsystem Windows dla systemu Linux* (+ *Platforma maszyny wirtualnej*) → перезагрузка.

```powershell
dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All
Get-WindowsOptionalFeature -Online | Where-Object State -eq Enabled
```

VirtualBox: сетевая карта ВМ в режиме **Mostkowana karta sieciowa (bridged)** — для доступа к физической LAN.

## 9. Пакетные файлы (.bat)

```bat
@echo off
rem plik1.bat — kopiuj wszystko z dane do archiwum1
copy C:\Wsadowe\dane\*.* C:\Wsadowe\archiwum1\
```
```bat
@echo off
rem plik2.bat txt — kopiuj pliki o rozszerzeniu z parametru
copy C:\Wsadowe\dane\*.%1 C:\Wsadowe\archiwum2\
```
```bat
@echo off
rem plik3.bat — dopisz datę i listę C:\
echo Nowy wpis w dniu: >> C:\Wsadowe\dane\informacje.txt
echo %date% >> C:\Wsadowe\dane\informacje.txt
dir C:\ /b >> C:\Wsadowe\dane\informacje.txt
```
```bat
@echo off
rem powitanie.bat
cls
set /p imie=Podaj imię: 
echo Witaj %imie%
pause
```
```bat
@echo off
rem konto.bat
net user tester /add
net localgroup testerzy /add
net localgroup testerzy tester /add
```
Цикл: `for /L %%i in (1,1,10) do mkdir C:\TEST\STUDENT%%i` (в .bat — `%%i`, в командной строке — `%i`). Запуск с параметром: `plik2.bat txt`. Польские буквы в .bat могут ломаться — сохраняй файл в ANSI или пиши без диакритики.

## 10. Идентификация и диагностика

| Что | Где |
|---|---|
| Версия Windows (22H2), разрядность | `winver`; *Ustawienia → System → Informacje* (*Typ systemu*, *Wersja*) |
| CPU модель, базовая частота, ядра, потоки, **Wirtualizacja: Włączone** | *Menedżer zadań (Ctrl+Shift+Esc) → Wydajność → Procesor* |
| RAM объём, скорость, слоты, форма | *Menedżer zadań → Wydajność → Pamięć*; `msinfo32` |
| Диск: тип SSD/HDD, ёмкость, «Czas aktywności» | *Menedżer zadań → Wydajność → Dysk*; `diskmgmt.msc`; `Get-PhysicalDisk` |
| GPU: модель, производитель, VRAM, DirectX | `dxdiag` → *Ekran* (*Pamięć wyświetlania*), *System* (*Wersja DirectX*); *Menedżer zadań → GPU* |
| Разрешение экрана | *Ustawienia → System → Ekran → Rozdzielczość* |
| Сетевая карта: производитель, модель, MAC, скорость | `devmgmt.msc` → *Karty sieciowe* → *Właściwości* (*Ogólne*, *Szczegóły*); `getmac /v`; `Get-NetAdapter` (*LinkSpeed*) |
| Pamięć wirtualna, liczba wątków | `msinfo32` (*Całkowita pamięć wirtualna*); Menedżer zadań → *Wątki* |
| % czasu zapisu dysku | `perfmon` → *Monitor wydajności* → licznik *Dysk fizyczny → % czasu zapisu dysku* |
| Pamięć RAM dual channel, SPD | CPU-Z → *Memory* (*Channel #: Dual*), *SPD* (producent, part number, serial) |

Подробная таблица «что каким инструментом» — в шпаргалке по железу.

```powershell
Get-CimInstance Win32_Processor | Select Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,VirtualizationFirmwareEnabled
Get-CimInstance Win32_PhysicalMemory | Select Capacity,Speed,Manufacturer,PartNumber,SerialNumber
Get-CimInstance Win32_VideoController | Select Name,AdapterRAM,DriverVersion,VideoModeDescription
```

## 11. Скриншоты (оцениваются по ним!)

| Способ | Результат |
|---|---|
| **Win+Shift+S** (Wycinanie) → уведомление → *Zapisz jako* | PNG/JPG — можно выбрать тип |
| **PrtScn** → Paint (`mspaint`) → Ctrl+V → *Plik → Zapisz jako → Obraz JPEG* | ровно `ram.jpg` |
| **Win+PrtScn** | PNG в *Obrazy → Zrzuty ekranu* |
| **Alt+PrtScn** | только активное окно в буфер |

Сохраняй **сразу на флешку `Egzamin-x`** в папку с именем из листа (`Identyfikacja`, `PARAMETRY`, `Diagnostyka`…). Отметить красным в Paint: *Kształty → prostokąt*, цвет красный.

## 12. Тест связи

```bat
ping 192.168.0.1
ping -n 2 192.168.0.200
ping -4 serwer.egzamin.local
tracert 10.0.0.65
nslookup www.egzamin.local
```
Если не отвечает: адрес/маска, кабель/порт, VLAN, **брандмауэр на цели** (см. п. 5).
