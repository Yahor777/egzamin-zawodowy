# Роутер (ruter): WAN, LAN, DHCP, резервирование

> В школе ZSE Rzeszów на занятиях стоит **DrayTek Vigor2927** — другое меню (LAN → General Setup, Bind IP to MAC, LAN → VLAN…). См. страницу «DrayTek Vigor2927» (`draytek`). Тренажёр переключается в *Настройки → Оборудование*.

Меню как у TP-Link (классический интерфейс). После каждого изменения — **Save** (*Zapisz*).

## WAN — Network → WAN

- *WAN Connection Type*: **Static IP** (*Statyczny IP*), если в задании дан адрес; **Dynamic IP** — «adres uzyskiwany automatycznie».
- *IP Address*, *Subnet Mask*, *Default Gateway* (*brama domyślna*), *Primary/Secondary DNS*.
- Маска по префиксу:

| префикс | маска | адресов |
|---|---|---|
| /24 | 255.255.255.0 | 256 |
| /25 | 255.255.255.128 | 128 |
| /26 | 255.255.255.192 | 64 |
| /27 | 255.255.255.224 | 32 |
| /28 | 255.255.255.240 | 16 |
| /29 | 255.255.255.248 | 8 |
| /30 | 255.255.255.252 | 4 |

## LAN — Network → LAN

- *IP Address* роутера в локальной сети и маска. Это адрес, который потом вписываешь в браузер.
- После **Save** роутер перезагрузится. Дальше заходи по **новому** адресу; ПК на DHCP возьмёт адрес из новой сети (`ipconfig /renew`).
- TP-Link сам сдвигает пул DHCP в новую сеть — проверь его после смены LAN.

## DHCP — DHCP → DHCP Settings

- *DHCP Server*: **Enable** / **Disable** (*serwer DHCP włączony / wyłączony*).
- *Start/End IP Address* — пул (*zakres*, «192.168.1.101 ÷ 192.168.1.150»).
- *Address Lease Time* — **в минутах**: 1 ч = 60, 12 ч = 720, 24 ч = 1440.
- *Default Gateway*, *Primary DNS* — что получат клиенты (если в задании дан DNS для клиентов).

## Резервирование — DHCP → Address Reservation

1. Узнай MAC клиента: Windows `ipconfig /all` → *Adres fizyczny*; Linux `ip a` → `link/ether`.
2. **Add New**: *MAC Address* (формат `08-00-27-AA-BB-CC`), *Reserved IP Address*, *Status: Enabled* → Save.
3. Клиент должен заново взять адрес: Windows `ipconfig /release` + `ipconfig /renew`; Linux `sudo netplan apply`.

Резервированный адрес обычно должен лежать **внутри** пула (так требуют листы CKE).

## Проверка

- *Status* — сводка WAN/LAN.
- *DHCP → DHCP Clients List* — кто какой адрес получил.
