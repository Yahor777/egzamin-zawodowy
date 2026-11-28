# Linux: сеть через netplan (Ubuntu Server)

## 1. Посмотреть интерфейсы

```
ip a            # имена (enp0s3, enp0s8), адреса, MAC (link/ether)
ip r            # маршруты, default via = шлюз
resolvectl dns  # DNS
```

## 2. Открыть файл

```
ls /etc/netplan
sudo nano /etc/netplan/50-cloud-init.yaml
```

## 3. Статический адрес

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      addresses: [192.168.5.10/24]
      routes:
        - to: default
          via: 192.168.5.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

## 4. DHCP и второй интерфейс без шлюза

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    enp0s8:
      addresses: [10.5.0.1/24]
      nameservers:
        addresses: [127.0.0.1]
```

Шлюз (*brama domyślna*) пишется только у **одного** интерфейса. «Brama: brak» — блока `routes` нет.

## 5. Применить и проверить

```
sudo netplan apply     # ошибки в YAML будут показаны здесь
ip a
ping -c 4 192.168.5.1
```

## Ловушки YAML

- Отступы — **только пробелы**, одинаковые на одном уровне (обычно по 2).
- После двоеточия пробел: `dhcp4: true`.
- Адрес с маской: `/24`, не `255.255.255.0`.
- `nano`: сохранить **Ctrl+O, Enter**, выйти **Ctrl+X**.

## Имя хоста

```
sudo hostnamectl set-hostname serwer-5
hostname
```
