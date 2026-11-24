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
netsh interface ip set address name="LAN_S" dhcp
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
