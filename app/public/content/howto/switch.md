# Свитч (przełącznik zarządzalny): IP управления и VLAN 802.1Q

Интерфейс как у TP-Link Easy Smart (TL-SG108E). С завода: `192.168.0.1`, `admin`/`admin`, **DHCP-сервера нет** — ПК нужен статический адрес `192.168.0.x/24`.

## IP управления — System → IP Setting

- *DHCP Setting*: **Disable**.
- *IP Address*, *Subnet Mask*, *Default Gateway* (обычно адрес LAN роутера).
- После **Apply** страница по старому адресу пропадёт: поменяй адрес ПК на сеть свитча (если сеть другая) и впиши новый адрес.

## Пароль — System → User Account

Старый пароль, новое имя, новый пароль ×2.

## Порты — Switching → Port Setting

*Status*: Disable — выключить порт. *Speed/Duplex* — скорость.

## Зеркалирование — Monitoring → Port Mirror

*Port Mirror*: Enable; *Mirroring Port* — куда копировать (порт анализатора); *Mirrored Port* — откуда, *Ingress/Egress* (*both* — обе галочки).

## VLAN 802.1Q

Термины:
- **untagged** (*bez tagowania, tryb dostępowy, access*) — порт для компьютера; кадры уходят без метки.
- **tagged** (*tagowany, trunk*) — порт к роутеру/другому свитчу, несёт несколько VLAN с метками.
- **PVID** — в какой VLAN попадает кадр **без метки**, пришедший на порт. Для access-порта PVID = номер его VLAN.

Порядок (**VLAN → 802.1Q VLAN**):
1. *802.1Q VLAN Configuration*: **Enable** → Apply.
2. *VLAN ID* (например 2), *VLAN Name*, для каждого порта выбрать **Untagged / Tagged / Not Member** → Add/Apply.
3. Убрать эти access-порты из VLAN 1 (в VLAN 1 отметить их *Not Member*). Порт, через который ты сам подключён, оставь в VLAN 1.
4. **VLAN → 802.1Q PVID Setting**: выбрать порты → *PVID* = номер VLAN → Apply. Без этого кадры с порта всё равно уйдут в VLAN 1.

Проверка: в таблице VLAN видно, какие порты Untagged/Tagged; ПК в порту VLAN 2 больше **не** открывает страницу свитча (управление во VLAN 1) — это нормально.
