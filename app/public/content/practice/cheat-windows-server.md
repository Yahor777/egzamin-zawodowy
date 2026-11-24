# Шпаргалка: Windows Server 2019/2022 (польский интерфейс)

Логин на экзамене: `Administrator` / `ZAQ!2wsx`. Все консоли быстрее открывать через **Win+R** (`ncpa.cpl`, `dsa.msc`…). PowerShell — **от имени администратора** (*Uruchom jako administrator*).

| Консоль | Win+R | Польское название |
|---|---|---|
| Сетевые подключения | `ncpa.cpl` | Połączenia sieciowe |
| Свойства системы (имя ПК, домен, RDP) | `sysdm.cpl` | Właściwości systemu |
| Пользователи AD | `dsa.msc` | Użytkownicy i komputery usługi Active Directory |
| GPO | `gpmc.msc` | Zarządzanie zasadami grupy |
| DNS | `dnsmgmt.msc` | Menedżer DNS |
| DHCP | `dhcpmgmt.msc` | DHCP |
| IIS | `inetmgr` | Menedżer Internetowych usług informacyjnych (IIS) |
| Принтеры | `printmanagement.msc` | Zarządzanie drukowaniem |
| Квоты FSRM | `fsrm.msc` | Menedżer zasobów serwera plików |
| Брандмауэр | `wf.msc` | Zapora Windows Defender z zabezpieczeniami zaawansowanymi |
| Маршрутизация | `rrasmgmt.msc` | Routing i dostęp zdalny |
| Диски | `diskmgmt.msc` | Zarządzanie dyskami |
| Локальные пользователи | `lusrmgr.msc` | Użytkownicy i grupy lokalne (нет на DC) |

## 1. Сеть

GUI: `ncpa.cpl` → ПКМ на адаптере → **Zmień nazwę** (LAN1, LAN_Z…) → **Właściwości** → *Protokół internetowy w wersji 4 (TCP/IPv4)* → *Użyj następującego adresu IP* / *Uzyskaj adres IP automatycznie*. «DNS: localhost» = `127.0.0.1`. «brama: brak» = поле пустое.
Какой адаптер куда подключён: выдерни кабель → у какого статус *Kabel sieciowy jest odłączony*.
«Wyłącz drugi interfejs» → ПКМ → **Wyłącz**.
«Wyłączona opcja Zarejestruj adresy tego połączenia w DNS» → TCP/IPv4 → *Zaawansowane…* → вкладка *DNS*.

```powershell
Get-NetAdapter                                          # имена, статус, MAC
Rename-NetAdapter -Name "Ethernet" -NewName "LAN1"
New-NetIPAddress -InterfaceAlias "LAN1" -IPAddress 192.168.0.10 -PrefixLength 24 -DefaultGateway 192.168.0.1
Set-DnsClientServerAddress -InterfaceAlias "LAN1" -ServerAddresses 127.0.0.1
# второй интерфейс без шлюза
New-NetIPAddress -InterfaceAlias "LAN2" -IPAddress 10.0.10.1 -PrefixLength 24
# обратно на DHCP
Remove-NetIPAddress -InterfaceAlias "LAN2" -Confirm:$false; Remove-NetRoute -InterfaceAlias "LAN2" -Confirm:$false
Set-NetIPInterface -InterfaceAlias "LAN2" -Dhcp Enabled
Set-DnsClientServerAddress -InterfaceAlias "LAN2" -ResetServerAddresses
ipconfig /renew "LAN2"                                  # "odnów dzierżawę"
Disable-NetAdapter -Name "Ethernet 2" -Confirm:$false
Set-DnsClient -InterfaceAlias "LAN1" -RegisterThisConnectionsAddress $false
Rename-Computer -NewName "SERWER05" -Restart
```

То же через `netsh`:

```powershell
netsh interface set interface name="Ethernet" newname="LAN1"
netsh interface ipv4 set address name="LAN1" static 192.168.0.10 255.255.255.0 192.168.0.1
netsh interface ipv4 set dnsservers name="LAN1" static 127.0.0.1 primary
netsh interface ipv4 set address name="LAN2" source=dhcp
```

### NIC Teaming
*Menedżer serwera → Serwer lokalny → Tworzenie zespołu kart interfejsu sieciowego: Wyłączone* → *ZADANIA → Nowy zespół* → имя `LAN12`, отметить LAN1+LAN2 → *Właściwości dodatkowe*: Tryb tworzenia zespołu **Niezależny od przełącznika**, Tryb równoważenia obciążenia **Dynamiczny**, Karta rezerwowa **Brak (wszystkie karty aktywne)**. IP задаётся уже на новом адаптере `LAN12`.

```powershell
New-NetLbfoTeam -Name LAN12 -TeamMembers LAN1,LAN2 -TeamingMode SwitchIndependent -LoadBalancingAlgorithm Dynamic -Confirm:$false
```

## 2. Установка ролей

*Menedżer serwera → Zarządzaj → Dodaj role i funkcje* → Instalacja oparta na rolach lub funkcjach → свой сервер → отметить роль → *Dodaj funkcje* → Dalej… → Zainstaluj.

| Роль (PL) | Имя для PowerShell |
|---|---|
| Usługi domenowe Active Directory | `AD-Domain-Services` |
| Serwer DNS | `DNS` |
| Serwer DHCP | `DHCP` |
| Serwer sieci Web (IIS) | `Web-Server` (+ FTP: `Web-Ftp-Server`) |
| Usługi drukowania i zarządzania dokumentami | `Print-Services` |
| Usługi plików i magazynowania → Menedżer zasobów serwera plików | `FS-Resource-Manager` |
| Dostęp zdalny → Routing | `Routing` |

```powershell
Install-WindowsFeature AD-Domain-Services,DNS,DHCP,Web-Server,Web-Ftp-Server,Print-Services,FS-Resource-Manager,Routing -IncludeManagementTools
Get-WindowsFeature | Where-Object Installed
```

## 3. AD DS — контроллер домена

1. Сначала: статический IP, DNS = `127.0.0.1`, имя сервера (переименование **до** повышения!).
2. Установить роль → жёлтый флажок в Menedżer serwera → **Podnieś poziom tego serwera do poziomu kontrolera domeny**.
3. *Dodaj nowy las* → *Nazwa domeny głównej*: `firma05.local`.
4. *Hasło trybu przywracania usług katalogowych (DSRM)*: из листа (`ZAQ!2wsx`, `egz@INF2`…).
5. Предупреждение о делегировании DNS — игнор → Dalej… → Zainstaluj → автоперезагрузка (~5 мин). Вход: `FIRMA05\Administrator`.

```powershell
Install-ADDSForest -DomainName "egzamin.local" -DomainNetbiosName "EGZAMIN" -InstallDns `
  -SafeModeAdministratorPassword (ConvertTo-SecureString 'ZAQ!2wsx' -AsPlainText -Force) -Force
```

> Если при старте DC требует сменить пароль Administrator — ставь пароль из листа (`zaq1@WSX`).

### OU, пользователи, группы (`dsa.msc`)

- ПКМ на домене → **Nowy → Jednostka organizacyjna** → имя.
- ПКМ на OU → **Nowy → Użytkownik**: *Imię*, *Nazwisko*, *Pełna nazwa*, *Nazwa logowania użytkownika* (`jkowalski`) → пароль + флажки:
  - *Użytkownik musi zmienić hasło przy następnym logowaniu* — **снять**, если в листе «wyłączona opcja…» или «hasło docelowe»;
  - *Użytkownik nie może zmienić hasła*; *Hasło nigdy nie wygasa*.
- Группа: **Nowy → Grupa** → *Zakres grupy*: Lokalny w domenie / **Globalny** / Uniwersalny; *Typ grupy*: **Zabezpieczenia**. Члены: свойства группы → *Członkowie → Dodaj*.
- Часы входа: свойства пользователя → *Konto → Godziny logowania…* (Пн/Ср/Пт 8–16 → выделить и *Logowanie dozwolone*).
- Перемещаемый профиль: свойства → вкладка **Profil** → *Ścieżka profilu*: `\\SERWER05\profile$\%username%` (после OK `%username%` заменится на логин).
- Перенос компьютера в OU: контейнер *Computers* → ПКМ на станции → **Przenieś…** → OU.

```powershell
New-ADOrganizationalUnit -Name "Pracownicy" -Path "DC=egzamin,DC=local"
$p = ConvertTo-SecureString 'Mojedlugiehaslo!' -AsPlainText -Force
New-ADUser -Name "Adam Nowak" -GivenName Adam -Surname Nowak -SamAccountName anowak `
  -UserPrincipalName anowak@egzamin.local -Path "OU=Pracownicy,DC=egzamin,DC=local" `
  -AccountPassword $p -Enabled $true -CannotChangePassword $true -PasswordNeverExpires $true `
  -ProfilePath "\\SERWER05\profiles$\anowak"
New-ADGroup -Name "Egzamin" -GroupScope Global -GroupCategory Security -Path "OU=Uczniowie,DC=egzamin,DC=local"
Add-ADGroupMember -Identity "Egzamin" -Members jabacki,zbabacki
Get-ADComputer STACJA05 | Move-ADObject -TargetPath "OU=Pracownicy,DC=egzamin,DC=local"
```

## 4. DNS (`dnsmgmt.msc`)

| Задача | GUI |
|---|---|
| Прямая зона | *Strefy wyszukiwania do przodu* → ПКМ **Nowa strefa…** → *Strefa podstawowa* → имя `egzamin.local` → (на не-DC: создать новый файл) → *Nie zezwalaj na aktualizacje dynamiczne* можно оставить по умолчанию |
| Обратная зона | *Strefy wyszukiwania wstecznego* → Nowa strefa → Strefa podstawowa → *Strefa wyszukiwania wstecznego IPv4* → *Identyfikator sieci*: `192.168.1` |
| A-запись | ПКМ на зоне → **Nowy host (A lub AAAA)…** → Nazwa `www`, adres IP → можно отметить *Utwórz skojarzony rekord wskaźnika (PTR)* |
| CNAME | **Nowy alias (CNAME)…** → Nazwa aliasu `INF02` → *W pełni kwalifikowana nazwa domeny hosta docelowego* `pracownia.egzamin.local` |
| PTR вручную | в обратной зоне **Nowy wskaźnik (PTR)…** |
| SOA (интервалы) | свойства зоны → *Źródło autorytatywne (SOA)*: *Interwał odświeżania*, *Interwał ponawiania prób*, *Wygasa po* |

```powershell
Add-DnsServerPrimaryZone -Name "egzamin.local" -ZoneFile "egzamin.local.dns"        # на DC: -ReplicationScope Domain
Add-DnsServerPrimaryZone -NetworkId "192.168.1.0/24" -ZoneFile "1.168.192.in-addr.arpa.dns"
Add-DnsServerResourceRecordA -ZoneName "egzamin.local" -Name "app" -IPv4Address 192.168.1.101 -CreatePtr
Add-DnsServerResourceRecordCName -ZoneName "egzamin.local" -Name "INF02" -HostNameAlias "pracownia.egzamin.local"
Add-DnsServerResourceRecordPtr -ZoneName "1.168.192.in-addr.arpa" -Name "101" -PtrDomainName "app.egzamin.local"
Resolve-DnsName www.egzamin.local ; nslookup 192.168.1.101
```

## 5. DHCP (`dhcpmgmt.msc`)

1. Установить роль → в Menedżer serwera флажок **Ukończ konfigurację DHCP** (создаёт группы, авторизует в AD).
2. *IPv4* → ПКМ **Nowy zakres…** → Nazwa → *Początkowy/Końcowy adres IP*, *Długość / Maska podsieci* → Wykluczenia (пропустить) → *Czas trwania dzierżawy* → **Tak, chcę teraz skonfigurować te opcje** → *Router (brama domyślna)* → *Nazwa domeny i serwery DNS* (*Domena nadrzędna*: `egzamin.local`, IP DNS) → WINS пропустить → **Tak, chcę teraz aktywować ten zakres**.
3. Привязка к одному интерфейсу: ПКМ на сервере → **Dodaj/usuń powiązania…** → оставить галку только у нужного (VLAN102).
4. Авторизация (если сервер в домене и значок красный): ПКМ на сервере → **Autoryzuj**.
5. Резерв: Zakres → *Rezerwacje* → **Nowa rezerwacja…** → Nazwa, Adres IP, Adres MAC (без разделителей или с `-`).

```powershell
Add-DhcpServerv4Scope -Name "LAN" -StartRange 192.168.0.10 -EndRange 192.168.0.99 -SubnetMask 255.255.255.0 -LeaseDuration 1.00:00:00 -State Active
Set-DhcpServerv4OptionValue -ScopeId 192.168.0.0 -Router 192.168.0.1 -DnsServer 192.168.0.1 -DnsDomain "egzamin.local" -Force
Add-DhcpServerv4Reservation -ScopeId 192.168.0.0 -IPAddress 192.168.0.50 -ClientId "00-15-5D-01-02-03" -Name "stacja"
Set-DhcpServerv4Binding -InterfaceAlias "VLAN101" -BindingState $false
Add-DhcpServerInDC -DnsName "serwer.egzamin.local" -IPAddress 192.168.0.1
```

## 6. IIS — сайт WWW / FTP (`inetmgr`)

Подготовка: папка `C:\www`, скопировать/переименовать файл (включи *Widok → Rozszerzenia nazw plików*, чтобы не получить `egzamin.html.txt`).

**Сайт:** *Witryny* → ПКМ **Dodaj witrynę sieci Web…**:

| Поле | Значение |
|---|---|
| Nazwa witryny | `egzamin` |
| Ścieżka fizyczna | `C:\www` |
| Powiązanie → Typ / Adres IP / Port | `http` / IP интерфейса (LAN_S) / `80` (или 8080) |
| Nazwa hosta | `www.egzamin.local` — только если требуется (нужна A-запись в DNS!) |

**Документ по умолчанию:** выбрать сайт → *Dokument domyślny* → справа *Dodaj…* → `egzamin.html` (можно *Przenieś w górę*).
Конфликт с *Default Web Site* на :80 → выбрать его → *Zatrzymaj* (Stop) справа.
Права папки (если задано): `IUSR` – *Odczyt i wykonanie*, `IIS_IUSRS`.

```powershell
Import-Module WebAdministration
New-Website -Name "egzamin" -PhysicalPath "C:\www" -IPAddress 192.168.0.205 -Port 80 -HostHeader "www.egzamin.local"
Add-WebConfigurationProperty -PSPath "IIS:\Sites\egzamin" -Filter "system.webServer/defaultDocument/files" -AtIndex 0 -Name "Collection" -Value "egzamin.html"
Stop-Website "Default Web Site"
Start-Process "http://www.egzamin.local"
```

**FTP:** роль *Serwer FTP → Usługa FTP*. *Witryny* → ПКМ **Dodaj witrynę FTP…** → имя, путь → *Powiązanie i protokół SSL*: Adres IP, Port 21, **Bez protokołu SSL** → *Uwierzytelnianie*: ☑ Anonimowe ☑ Podstawowe → *Autoryzacja*: «Użytkownicy anonimowi» Odczyt; вторую правило добавить потом: сайт → *Reguły autoryzacji FTP* → *Dodaj regułę zezwalającą* → *Określeni użytkownicy*: `Administrator` → Odczyt + Zapis. Брандмауэр: правила «Serwer FTP» включаются сами; если нет — открыть порт 21.

## 7. Общие папки + NTFS

**Общий доступ** (*Uprawnienia udostępniania*): свойства папки → *Udostępnianie* → **Udostępnianie zaawansowane…** → ☑ *Udostępnij ten folder* → *Nazwa udziału* (`profile$` — `$` делает ресурс скрытым) → *Ogranicz liczbę równoczesnych użytkowników do* → *Komentarz* → **Uprawnienia** (Pełna kontrola / Zmiana / Odczyt).

**NTFS** (*Zabezpieczenia*): вкладка *Zabezpieczenia* → *Zaawansowane* → **Wyłącz dziedziczenie** → *Usuń wszystkie odziedziczone uprawnienia z tego obiektu* (или *Konwertuj…*, затем удалить лишнее) → *Dodaj* → *Wybierz podmiot zabezpieczeń* → права. Для «tylko ten folder»: *Dotyczy: Tylko ten folder*, особое право *Tworzenie folderów / dołączanie danych*. Владелец: *Zaawansowane → Właściciel: Zmień*.

| Шаблон NTFS (PL) | EN | icacls |
|---|---|---|
| Pełna kontrola | Full control | `F` |
| Modyfikacja | Modify | `M` |
| Odczyt i wykonywanie | Read & execute | `RX` |
| Wyświetlanie zawartości folderu | List folder contents | `RX` (только папки) |
| Odczyt | Read | `R` |
| Zapis | Write | `W` |

| Группа PL | SID (не зависит от языка) |
|---|---|
| Wszyscy | `*S-1-1-0` |
| Użytkownicy uwierzytelnieni | `*S-1-5-11` |
| Administratorzy | `*S-1-5-32-544` |
| Użytkownicy | `*S-1-5-32-545` |
| TWÓRCA-WŁAŚCICIEL | `*S-1-3-0` |

```powershell
New-Item C:\Profiles -ItemType Directory
New-SmbShare -Name 'profiles$' -Path C:\Profiles -FullAccess 'Wszyscy'    # на англ. системе 'Everyone'
New-SmbShare -Name 'Rysunki' -Path C:\NASZE_PRACE -FullAccess 'Wszyscy' -ConcurrentUserLimit 10 -Description 'Dokumenty publiczne'
icacls C:\Profiles /inheritance:r
icacls C:\Profiles /grant '*S-1-5-32-544:(OI)(CI)F'
icacls C:\Profiles /grant '*S-1-5-11:(AD)'          # «Tworzenie folderów», tylko ten folder (без OI/CI)
icacls C:\Projekty /grant 'jnowak:(OI)(CI)M'
icacls C:\WSPOLNY /setowner uczen1
Get-SmbShareAccess 'profiles$' ; icacls C:\Profiles
```
```powershell
net share NASZ_EGZAMIN=C:\WSPÓLNY /GRANT:Wszyscy,FULL /USERS:10 /REMARK:"Materiały egzaminacyjne zdających"
```

Итоговый доступ по сети = **минимум** из share и NTFS.

## 8. Квоты

**NTFS-квоты тома** (на пользователя): *Ten komputer* → ПКМ на C: → *Właściwości* → **Przydział** → *Pokaż ustawienia przydziałów* → ☑ *Włącz zarządzanie przydziałami* → ☑ *Odmów miejsca na dysku użytkownikom przekraczającym limit przydziału* → *Ogranicz miejsce na dysku do* 1 GB, *Ustaw poziom ostrzeżeń na* 900 MB → *Wpisy przydziałów…* → *Przydział → Nowy wpis przydziału* → пользователь → *Nie ograniczaj użycia dysku* / свой лимит.

```powershell
fsutil quota enforce C:
fsutil quota modify C: 7516192768 8589934592 asystent    # ostrzeżenie 7 GB, limit 8 GB (в байтах)
fsutil quota query C:
```

**FSRM** (лимит на папку): `fsrm.msc` → *Zarządzanie przydziałami → Przydziały* → **Utwórz przydział…** → ścieżka → *Zdefiniuj właściwości przydziału niestandardowego* → Limit 100 MB, *Przydział twardy*.
Вариант из листа «zainstaluj usługę serwera plików i udostępnij… limit 100 MB, przeznaczenie: pliki użytkowników»: *Menedżer serwera → Usługi plików i magazynowania → Udziały → ZADANIA → Nowy udział…* → **Udział SMB — zaawansowany** → путь → имя → *Właściwości zarządzania: Przeznaczenie folderu = Pliki użytkowników* → *Przydział: Limit 100 MB* → права.

```powershell
New-FsrmQuota -Path "C:\DOKUMENTY" -Size 100MB
```

## 9. GPO (`gpmc.msc`)

*Las → Domeny → egzamin.local* → ПКМ на OU (или на домене = «korzeń domeny») → **Utwórz obiekt GPO w tej domenie i połącz go tutaj…** → имя → ПКМ на GPO → **Edytuj**. На станции: `gpupdate /force`, проверка `gpresult /r`.

| Что просят | Путь в Edytor zarządzania zasadami grupy |
|---|---|
| Zabroń dostępu do Panelu sterowania | *Konfiguracja użytkownika → Zasady → Szablony administracyjne → Panel sterowania → Zabroń dostępu do Panelu sterowania i ustawień komputera* = Włączone |
| Polityka haseł (длина, сложность) | *Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł*: *Hasło musi spełniać wymagania co do złożoności*, *Minimalna długość hasła* |
| Blokada konta (3 попытки, 15 мин) | … *Zasady konta → Zasady blokady konta*: *Próg blokady konta* = 3, *Czas trwania blokady konta* = 15, *Wyzeruj licznik… po* = 15 |
| Brak Zablokuj/Wyloguj po Ctrl+Alt+Del | *Konfiguracja użytkownika → … Szablony administracyjne → System → Opcje klawiszy Ctrl+Alt+Del* → *Usuń opcję Zablokuj komputer*, *Usuń opcję Wyloguj* |
| Zakaz zmiany tła pulpitu | *Konfiguracja użytkownika → … Panel sterowania → Personalizacja → Uniemożliwiaj zmianę tła pulpitu* |
| Obowiązkowa instalacja 7-Zip | *Konfiguracja komputera → Zasady → Ustawienia oprogramowania → Instalacja oprogramowania* → ПКМ *Nowy → Pakiet…* → путь **UNC** `\\SERWER\programy\7-Zip.msi` → **Przypisany** (на станции перезагрузка 1–2 раза) |
| Zakaz instalowania .msi | *Konfiguracja komputera → … Ustawienia zabezpieczeń → Zasady sterowania aplikacjami → AppLocker → Reguły Instalatora Windows* → *Utwórz reguły domyślne* + правило *Odmów* (для `7-Zip.msi`) + *Ustawienia systemu → Usługi systemowe → Tożsamość aplikacji* = Automatyczny (так в критериях оценки). Проще-альтернатива: *Szablony administracyjne → Składniki systemu Windows → Instalator Windows → Wyłącz Instalatora Windows* |
| Rozmieść drukarkę przez GPO | `printmanagement.msc` → ПКМ на принтере → **Wdróż przy użyciu zasad grupy…** → выбрать GPO → ☑ *Użytkownicy, do których ma zastosowanie ten obiekt GPO (na użytkownika)* → Dodaj → OK |

> Политика паролей для **доменных** пользователей работает только на уровне **домена** (GPO, связанный с корнем домена, или *Default Domain Policy*). Связанная с OU — не действует на доменные учётки.

```powershell
New-GPO -Name "Panel" | New-GPLink -Target "OU=Uczniowie,DC=inf02,DC=local"
Set-GPRegistryValue -Name "Panel" -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" -ValueName NoControlPanel -Type DWord -Value 1
Get-GPO -All ; (Get-GPInheritance "OU=Uczniowie,DC=inf02,DC=local").GpoLinks
```

## 10. Принтер (print server)

Добавить: `printmanagement.msc` → *Serwery wydruku → SERWER → Drukarki* → ПКМ **Dodaj drukarkę…** → *Dodaj nową drukarkę przy użyciu adresu IP lub nazwy hosta* → Typ: *Urządzenie TCP/IP*, adres `192.168.0.200` → снять «automatycznie wykryj sterownik» → *Niestandardowe → Ustawienia…* → Protokół **Raw**, port **9100** → драйвер *Z dysku…* (папка `DRUKARKA`) → имя → ☑ *Udostępnij tę drukarkę*, *Nazwa udziału*.
(Через *Ustawienia → Drukarki i skanery → Dodaj → Drukarki, której szukam, nie ma na liście → Dodaj drukarkę przy użyciu adresu TCP/IP…* — то же самое.)

*Właściwości drukarki*:

| Требование | Вкладка → поле |
|---|---|
| Udostępnij jako `INF02` | Udostępnianie → Nazwa udziału |
| Dostępność 6:00–22:00 | Zaawansowane → *Dostępna od … do* |
| Priorytet 2 / «najwyższy» | Zaawansowane → *Priorytet* (1 = najniższy, **99 = najwyższy**) |
| Orientacja pozioma, 2 kopie, oszczędność tonera | Zaawansowane → **Domyślne ustawienia drukowania…** |
| Только `Drukarz` печатает, TWÓRCA-WŁAŚCICIEL – dokumenty, Administrator – pełna | Zabezpieczenia: удалить *Wszyscy*; Drukarz → *Drukuj*; TWÓRCA-WŁAŚCICIEL → *Zarządzaj dokumentami*; Administratorzy → все три |
| Strona testowa | Ogólne → **Drukuj stronę testową** |

```powershell
pnputil /add-driver D:\DRUKARKA\*.inf /install
Add-PrinterPort -Name "IP_192.168.0.200" -PrinterHostAddress "192.168.0.200"
Add-PrinterDriver -Name "HP Universal Printing PCL 6"          # точное имя из .inf
Add-Printer -Name "Egzamin_druk" -DriverName "HP Universal Printing PCL 6" -PortName "IP_192.168.0.200" -Shared -ShareName "Egzamin_druk"
Get-Printer | Format-Table Name,ShareName,PortName,Shared
```

## 11. RDP, брандмауэр, маршрутизация

**RDP:** *Serwer lokalny → Pulpit zdalny: Wyłączony* → ☑ *Zezwalaj na połączenia zdalne z tym komputerem* + ☑ *Zezwalaj na połączenia tylko z komputerów, na których jest uruchomiony Pulpit zdalny z uwierzytelnianiem na poziomie sieci*. Клиент: `mstsc`.

```powershell
Set-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28752"      # группа «Pulpit zdalny»
```

**Ping (ICMPv4 echo):** `wf.msc` → *Reguły przychodzące* → включить **Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)**. Или **Nowa reguła…** → *Niestandardowa* → Wszystkie programy → *Typ protokołu: ICMPv4* → *Dostosuj…* → *Określone typy ICMP: Żądanie echa* → любые адреса → *Zezwalaj na połączenie* → все профили → Nazwa `pingi`.
«Wyłącz wszystkie reguły przychodzące» → выделить всё (Ctrl+A) в *Reguły przychodzące* → *Wyłącz regułę*.

```powershell
New-NetFirewallRule -DisplayName "pingi" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow
netsh advfirewall firewall add rule name="pingi" dir=in action=allow protocol=icmpv4:8,any
Get-NetFirewallRule -Direction Inbound | Disable-NetFirewallRule      # «wyłącz wszystkie przychodzące»
Set-NetFirewallProfile -All -Enabled True                             # «włącz zaporę»
```

**Routing LAN / NAT:** роль *Dostęp zdalny* → usługa *Routing* → `rrasmgmt.msc` → ПКМ на сервере → **Konfiguruj i włącz routing i dostęp zdalny** → *Konfiguracja niestandardowa* → ☑ *Routing sieci LAN* (и ☑ *NAT*, если нужно) → Uruchom usługę. NAT: *IPv4 → NAT* → ПКМ *Nowy interfejs…* → публичный (LAN_ruter) → *Interfejs publiczny połączony z Internetem* + ☑ *Włącz NAT na tym interfejsie*; добавить частный интерфейс как *Interfejs prywatny*.

## 12. Пакетные файлы (на сервере тоже просят)

```bat
@echo off
rem plik1.bat — 10 папок
echo tworzenie folderow dla studentow
mkdir C:\TEST
for /L %%i in (1,1,10) do mkdir C:\TEST\STUDENT%%i
```
```bat
@echo off
rem student.cmd — 5 учёток student_1..student_5
for /L %%i in (1,1,5) do net user student_%%i ZAQ!2wsx /add
```

Больше шаблонов `.bat` — в шпаргалке Windows-клиента.

## 13. Финальная проверка

```powershell
ipconfig /all ; Get-NetAdapter ; hostname
Get-ADOrganizationalUnit -Filter * | Select Name ; Get-ADUser -Filter * | Select SamAccountName
Get-SmbShare ; Get-DnsServerZone ; Get-Website ; Get-Printer ; Get-GPO -All | Select DisplayName
ping 192.168.0.1 ; ping 192.168.0.200
```

Скрипт самопроверки: `tools/check-winserver.ps1` (запуск: `Set-ExecutionPolicy -Scope Process Bypass; .\check-winserver.ps1`).
