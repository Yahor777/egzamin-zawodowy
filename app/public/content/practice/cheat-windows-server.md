# Шпаргалка INF.02: Windows Server 2022

## 1. Постоянный порядок действий

1. Имя сервера и статический адрес IP.
2. **Menedżer serwera → Zarządzaj → Dodaj role i funkcje**.
3. Жёлтое уведомление **⚑** — завершить настройку.
4. Объекты в консоли роли.
5. Проверка с клиента.

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

## 2. AD DS i domena

| CKE пишет | Шаги |
|---|---|
| `kontroler domeny` | rola **Usługi domenowe Active Directory** → **Podnieś poziom tego serwera do kontrolera domeny** |
| `jednostka organizacyjna` | `dsa.msc` → PPM domena → **Nowy → Jednostka organizacyjna** |
| `użytkownik` | OU → **Nowy → Użytkownik** |
| `grupa globalna` | OU → **Nowy → Grupa** → **Globalna** + **Zabezpieczenia** |
| `dołącz klienta` | DNS klienta = serwer, potem `sysdm.cpl` lub `netdom` |

<!-- e2:cmd:domain -->
```cmd
netdom join %computername% /domain:firma01.local /userd:FIRMA01\Administrator /passwordd:ZAQ!2wsx # присоединение клиента
gpupdate /force # обновление политик
gpresult /r # проверка GPO
```

## 3. DHCP

| Элемент | Где |
|---|---|
| autoryzacja | **⚑ → Dokończ konfigurację funkcji DHCP** |
| zakres | `dhcpmgmt.msc → IPv4 → Nowy zakres…` |
| brama | opcja `003 Router` |
| DNS | opcja `006 Serwery DNS` |
| rezerwacja | **Zastrzeżenia → Nowe zastrzeżenie…** |

<!-- e2:cmd:dhcp -->
```cmd
ipconfig /release # освободить адрес
ipconfig /renew # обновить адрес
ipconfig /all # проверить DHCP/DNS/шлюз
```

Адрес `169.254.x.x` = DHCP не ответил.

## 4. DNS

`A` заменяет имя на IP, `PTR` — IP на имя, `CNAME` — имя на другое имя.

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

## 5. Групповые политики

| Задание | Путь |
|---|---|
| minimalna długość hasła | **Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł** |
| blokada konta | **… → Zasady konta → Zasady blokady konta** |
| tapeta | **Konfiguracja użytkownika → Szablony administracyjne → Pulpit → Pulpit → Tapeta pulpitu** |
| blokada Panelu | **Konfiguracja użytkownika → Szablony administracyjne → Panel sterowania → Zabroń dostępu…** |
| dysk sieciowy | **Konfiguracja użytkownika → Preferencje → Ustawienia systemu Windows → Mapowania dysków** |

Не забудь про связь с доменом/OU.

## 6. Общие ресурсы и NTFS

Итог = разрешения ресурса ∩ NTFS; **Odmów** побеждает.

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

<!-- e2:cmd:shareclient -->
```cmd
net use P: \\192.168.5.1\Dane /user:FIRMA01\jkowalski Start#1234 /persistent:no # подключение
net view \\192.168.5.1 # общие ресурсы после учётных данных
dir P:\ # чтение
echo test > P:\test.txt # запись
net use P: /delete # отключение
```

## 7. FSRM

В консоли `fsrm.msc` используй названия **Zarządzanie przydziałami** и **Zarządzanie osłanianiem plików**.

<!-- e2:cmd:fsrm -->
```cmd
dirquota quota add /Path:C:\Dane /Limit:10MB /Type:Hard # жёсткий лимит
dirquota quota list # список лимитов
fsutil file createnew C:\Dane\test.dat 1048576 # тестовый файл
dirquota quota delete /Path:C:\Dane # удаление лимита
```

## 8. IIS и FTP

- WWW: **Serwer sieci Web (IIS)** → `inetmgr → Witryny → Dodaj witrynę sieci Web…`.
- FTP: dodatkowo **Serwer FTP → Usługa FTP** → **Dodaj witrynę FTP…**.
- dokument startowy: **Dokument domyślny**;
- listowanie: **Przeglądanie katalogów**;
- nazwa `www.firma01.local` wymaga rekordu `A` w DNS.

<!-- e2:cmd:iis -->
```cmd
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80 # HTTP
netsh advfirewall firewall add rule name="FTP" dir=in action=allow protocol=TCP localport=21 # FTP
netsh advfirewall firewall show rule name="HTTP" # проверка
```

## 9. Drukowanie

1. Rola **Usługi drukowania i zarządzania dokumentami**.
2. `printmanagement.msc → Serwery wydruku → serwer → Drukarki`.
3. Dodaj drukarkę TCP/IP.
4. **Udostępnij tę drukarkę** i wpisz **Nazwa udziału**.
5. W **Zabezpieczenia** nadaj **Drukowanie**.
6. Klient: `\\serwer\nazwa`.

## 10. RRAS / VPN / NAT

| Cel | Wybór |
|---|---|
| router między sieciami | **Dostęp zdalny → Routing** → **Routing LAN** |
| NAT | **Routing** + publiczny interfejs w **NAT** |
| VPN | **DirectAccess i VPN (RAS)** |
| trasa statyczna | **IPv4 → Trasy statyczne** |

<!-- e2:cmd:rras -->
```cmd
ipconfig /all # адреса интерфейсов
route print # маршруты
ping 192.168.5.1 # связь
tracert 192.168.5.1 # ścieżka
```

## 11. Типичные ошибки

| Сообщение | Наиболее частая причина |
|---|---|
| `Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC)` | zły DNS klienta |
| `Wystąpił błąd systemowy 53.` | brak trasy/zła nazwa |
| `Wystąpił błąd systemowy 1326.` | zły login/hasło |
| `Wystąpił błąd systemowy 5.` | brak uprawnień |
| `nie można skontaktować się z serwerem DHCP` | DHCP niedostępny |

## 12. Kontrola końcowa

1. Brak żółtego powiadomienia.
2. Obiekt ma dokładną nazwę z zadania.
3. Klient zrestartowany po zmianie nazwy/domeny.
4. Efekt sprawdzony na kliencie.
