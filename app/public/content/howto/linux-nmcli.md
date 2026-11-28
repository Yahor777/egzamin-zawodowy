# Linux Desktop: сеть через NetworkManager (nmcli)

В листах 2025–26 рабочая станция часто на **Ubuntu Desktop**: там сеть ведёт **NetworkManager**, а не netplan-файл сервера. Критерии: «nazwa połączenia przewodowego: IP_PC», адрес/маска, шлюз, DNS. Проверяют в GUI (*Ustawienia → Sieć*) или `nmcli con show`.

## 1. Быстро через nmcli

```bash
nmcli con show                                   # имена соединений (обычно "Wired connection 1"
                                                 # или "Połączenie przewodowe 1")
nmcli dev status                                 # какое устройство к какому соединению
nmcli con mod "Wired connection 1" connection.id IP_PC          # переименовать
nmcli con mod IP_PC ipv4.method manual ipv4.addresses 192.168.16.15/24 \
      ipv4.gateway 192.168.16.1 ipv4.dns "8.8.8.8 8.8.4.4"
nmcli con up IP_PC                               # применить (без этого адрес не сменится!)
nmcli con show IP_PC | grep ipv4                 # проверка профиля
ip a ; ip route                                  # проверка на интерфейсе — скриншот
```

- Имя с пробелами — в кавычках. После переименования используешь **новое** имя.
- `ipv4.method manual` требует адрес в той же команде (или раньше), иначе ошибка «cannot be empty for method=manual».
- Вернуть DHCP: `nmcli con mod IP_PC ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns ""` и `nmcli con up IP_PC`.
- Добавить второй DNS к имеющимся: `nmcli con mod IP_PC +ipv4.dns 1.1.1.1`.
- Wi‑Fi выключить: `nmcli radio wifi off`.

Профили лежат в `/etc/NetworkManager/system-connections/*.nmconnection` (читать через `sudo`).

## 2. Через GUI

*Ustawienia → Sieć → Przewodowe → ⚙* → вкладка **Tożsamość**: *Nazwa* = `IP_PC` → вкладка **IPv4**: *Ręcznie*, Adres, Maska sieci (24 или 255.255.255.0), Brama, DNS (выключи «Automatycznie») → **Zastosuj** → выключи и включи переключатель соединения.

`nmtui` (текстовое меню) — то же самое: *Edit a connection → Profile name, IPv4 CONFIGURATION: Manual*.

## 3. netplan vs NetworkManager

| | Ubuntu Server | Ubuntu Desktop |
|---|---|---|
| Где настройки | `/etc/netplan/*.yaml` | NetworkManager (`nmcli`, GUI) |
| Применить | `sudo netplan apply` | `nmcli con up ИМЯ` |
| Имя соединения | нет (только интерфейс enp0s3) | есть — его и проверяют |
