# Windows: сетевой адаптер, IPv4, ping, брандмауэр

## Где настраивается

`Win+R` → **ncpa.cpl** → *Połączenia sieciowe* (Сетевые подключения).

- **Переименовать** (*nazwa połączenia*): ПКМ → *Zmień nazwę* → например `LAN_S`.
- **Отключить/включить** карту: ПКМ → *Wyłącz* / *Włącz*.
- **IPv4**: ПКМ → *Właściwości* → *Protokół internetowy w wersji 4 (TCP/IPv4)* → *Właściwości*:
  - «*Uzyskaj adres IP automatycznie*» + «*Uzyskaj adres serwera DNS automatycznie*» = DHCP;
  - «*Użyj następującego adresu IP*»: *Adres IP*, *Maska podsieci*, *Brama domyślna*; ниже *Preferowany / Alternatywny serwer DNS*.
- «DNS: localhost» = `127.0.0.1`. «Brama: brak» — поле оставить пустым.

## Какая карта какая

Если карт две: `ipconfig /all` → у каждой *Adres fizyczny* (MAC). Сравни с MAC из листа.

## Командная строка (cmd)

```
ipconfig            адрес, маска, шлюз
ipconfig /all       + MAC, DHCP, DNS, имя хоста
ipconfig /release   отдать адрес DHCP
ipconfig /renew     взять адрес заново
ping 192.168.0.1    проверить связь
getmac              MAC-адреса
netsh interface set interface name="Ethernet" newname="LAN_S"
netsh interface ip set address name="LAN_S" static 192.168.1.10 255.255.255.0 192.168.1.1
netsh interface ipv4 set address name="LAN_S" source=dhcp
```

## Ответ на ping (брандмауэр)

С завода Windows **не отвечает** на ping. Включить:

`Win+R` → **wf.msc** → *Reguły przychodzące* → «*Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)*» → ПКМ → *Włącz regułę*.

Проверка: с другого устройства `ping адрес_ПК` — есть ответы.

## Если нет связи

1. `ipconfig`: адрес вообще есть? `169.254.x.x` — DHCP не ответил (нет кабеля, нет сервера).
2. Адрес и маска в той же сети, что у второго устройства?
3. Кабель в правильном порту (лампочка)?
4. Брандмауэр второй стороны отвечает на ping?

<!-- pack-e2 -->
## Проверенные команды симулятора

`dhcp` в конце `set address` здесь записывается полностью как `source=dhcp` — так понимает и реальный netsh, и наш терминал.

<!-- e2:cmd:client -->
```cmd
ipconfig # базовая конфигурация
ipconfig /all # полная конфигурация, MAC, DHCP и DNS
ipconfig /release # освобождение аренды DHCP
ipconfig /renew # обновление аренды DHCP
ping -n 2 192.168.1.1 # только 2 запроса
tracert 192.168.1.1 # маршрут пакетов
arp -a # таблица ARP
getmac # физические адреса
netsh interface show interface # имена и состояние карт
netsh interface set interface name="Ethernet" newname="LAN_S" # переименование
netsh interface ipv4 set address name="LAN_S" static 192.168.1.10 255.255.255.0 192.168.1.1 # статический адрес
netsh interface ipv4 set dnsservers name="LAN_S" static 192.168.1.1 primary # статический DNS
netsh interface ipv4 set address name="LAN_S" source=dhcp # возврат к DHCP
netsh interface ipv4 set dnsservers name="LAN_S" source=dhcp # DNS автоматически
netsh interface set interface name="LAN_S" admin=disabled # отключение карты
netsh interface set interface name="LAN_S" admin=enabled # включение карты
netsh advfirewall firewall add rule name="pingi" dir=in action=allow protocol=icmpv4 # разрешение ping
netsh advfirewall firewall show rule name="pingi" # проверка правила
```

<!-- e2:ps:client -->
```powershell
Get-NetAdapter # список карт
Rename-NetAdapter -Name "Ethernet" -NewName "LAN_PS" # переименование
New-NetIPAddress -InterfaceAlias "LAN_PS" -IPAddress 192.168.2.10 -PrefixLength 24 -DefaultGateway 192.168.2.1 # статический IPv4
Set-DnsClientServerAddress -InterfaceAlias "LAN_PS" -ServerAddresses 192.168.2.1 # DNS
Set-NetIPInterface -InterfaceAlias "LAN_PS" -Dhcp Enabled # DHCP
Set-DnsClientServerAddress -InterfaceAlias "LAN_PS" -ResetServerAddresses # автоматический DNS
Test-NetConnection 192.168.2.1 # проверка связи
```

## Типичные формулировки CKE → что делать

| Treść zadania | Kroki |
|---|---|
| `zmień nazwę połączenia Ethernet na LAN_S` | `ncpa.cpl` → PPM → **Zmień nazwę** lub `netsh … newname` |
| `skonfiguruj statyczny adres IP` | IPv4 → **Użyj następującego adresu IP** lub `netsh … static` |
| `adres IP ma być pobierany automatycznie` | obie opcje `automatycznie`, potem `ipconfig /renew` |
| `wyłącz drugi interfejs sieciowy` | `ncpa.cpl` → PPM → **Wyłącz** |
| `w razie potrzeby zmień ustawienia zapory` | `wf.msc` → reguła ICMPv4 |

Проверка: `ipconfig /all` показывает требуемый адрес, маску, шлюз и DNS; `ping` шлюза даёт `Odpowiedź z …`.
