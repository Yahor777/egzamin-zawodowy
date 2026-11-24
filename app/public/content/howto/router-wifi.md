# Роутер: Wi‑Fi, проброс портов, пароль, удалённое управление

## Wi‑Fi — Wireless

**Wireless → Wireless Settings** (2,4 ГГц; у двухдиапазонных — отдельно 5 ГГц):
- *Wireless Network Name* = **SSID**.
- *Channel* — канал (*kanał*), *Channel Width* — ширина.
- *Enable SSID Broadcast* — снять галочку = сеть **ukryta / nierozgłaszana**.
- Выключить радио: *Enable Wireless Router Radio* (или *Wireless Radio: Disable*) для ненужного диапазона.

**Wireless → Wireless Security**:
- **WPA/WPA2 – Personal (Recommended)** = WPA2-PSK (*Personal*).
- *Version*: **WPA2-PSK**, *Encryption*: **AES** (не TKIP).
- *Wireless Password* — ключ (*hasło, klucz*). Минимум 8 символов.

## Проброс порта — Forwarding → Virtual Servers

«Przekieruj ruch z portu X interfejsu WAN do serwera Y na port Z»:
- *Service Port* = X (внешний), *Internal Port* = Z, *IP Address* = Y, *Protocol* TCP / UDP / ALL, *Status* Enabled.

## Пароль администратора — System Tools → Password

Старое имя и пароль (`admin`/`admin`), новое имя (можно оставить admin), новый пароль два раза. После сохранения — вход заново.

## Удалённое управление — Security → Remote Management

- *Web Management Port* — порт (например 8080).
- *Remote Management IP Address*: `0.0.0.0` = выключено, `255.255.255.255` = с любого адреса, конкретный адрес = только с него.

## Статический маршрут — Advanced Routing → Static Routing List

**Add New**: *Destination Network* (адрес сети, например `10.5.0.0`), *Subnet Mask* (`/16` = `255.255.0.0`), *Default Gateway* — следующий маршрутизатор, он должен быть в сети WAN или LAN роутера.
