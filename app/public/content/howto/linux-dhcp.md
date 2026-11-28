# Linux: DHCP-сервер (isc-dhcp-server)

Порядок: адрес сервера → конфиг → интерфейс → перезапуск → проверка.

## 1. Статический адрес на интерфейсе, где будет DHCP

netplan (см. «Linux: сеть через netplan»), например `enp0s8: addresses: [10.80.0.2/24]`, затем `sudo netplan apply`.

## 2. /etc/dhcp/dhcpd.conf

```
sudo nano /etc/dhcp/dhcpd.conf
```

Добавь в конец (или замени примеры):

```
authoritative;
subnet 10.80.0.0 netmask 255.255.255.0 {
  range 10.80.0.10 10.80.0.30;
  option routers 10.80.0.2;
  option domain-name-servers 10.80.0.2;
  option domain-name "egzamin.edu";
  option broadcast-address 10.80.0.255;
  default-lease-time 3600;
  max-lease-time 10800;
}
```

- *serwer autorytatywny* → `authoritative;`
- *czas dzierżawy* — **в секундах**: 1 ч = 3600, 3 ч = 10800, 1 доба = 86400.
- *brama* → `option routers`, *DNS* → `option domain-name-servers`.
- Каждая строка внутри `{ }` заканчивается `;`. Строки домена — в кавычках.

## 3. На каком интерфейсе работать

```
sudo nano /etc/default/isc-dhcp-server
INTERFACESv4="enp0s8"
```

## 4. Запуск и автозапуск

```
sudo systemctl restart isc-dhcp-server
sudo systemctl enable isc-dhcp-server
systemctl status isc-dhcp-server      # active (running)?
```

Если *failed*: `journalctl -u isc-dhcp-server` — там строка с ошибкой (чаще всего забытая `;` или подсеть не совпадает с адресом интерфейса).

## 5. Проверка с клиента

Windows: `ipconfig /renew` → адрес из диапазона; `ipconfig /all` → DHCP-сервер = адрес Linux.
