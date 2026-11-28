# Шпаргалка: Linux (Ubuntu 24.04 Server/Desktop, кратко openSUSE)

Логин: `administrator` / `ZAQ!2wsx`, root через `sudo` (или `su -` с тем же паролем). В листе часто: «wykonaj zrzuty ekranu z widocznymi poleceniami» и «wpisz polecenie do tabeli» → пиши **полную** команду с опциями.

## 1. Сеть

### 1.1 Узнать интерфейсы

```bash
ip -br a                 # имена (enp0s3, ens33, eth0), IP
ip link                  # MAC: link/ether 08:00:27:aa:bb:cc  («adres fizyczny»)
ip r                     # шлюз: default via ...
resolvectl status        # DNS (Ubuntu); cat /etc/resolv.conf
nmcli dev status         # Desktop: какой интерфейс к какому соединению
```

Какой интерфейс куда подключён: `ip -br link` → у отключённого кабеля `NO-CARRIER`/`DOWN`.

### 1.2 Ubuntu Server — netplan (два интерфейса)

Файл: `/etc/netplan/50-cloud-init.yaml` (или `01-netcfg.yaml`). Отступы — **пробелы**, по 2.

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp0s3:                      # к роутеру
      dhcp4: false
      addresses: [90.90.0.3/29]
      routes:
        - to: default
          via: 90.90.0.1
    enp0s8:                      # к коммутатору, без шлюза
      dhcp4: false
      addresses: [10.80.0.2/24]
      nameservers:
        addresses: [10.80.0.2]   # «DNS: localhost» → [127.0.0.1]
```

DHCP-вариант и «второй интерфейс выключен»:

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
      nameservers:
        addresses: [192.168.7.3]
    enp0s8:
      activation-mode: off       # интерфейс выключен
```

```bash
sudo chmod 600 /etc/netplan/*.yaml
sudo netplan try          # откат через 120 с, если связь пропала
sudo netplan apply
sudo networkctl renew enp0s3     # «odśwież dzierżawę DHCP»
ip -br a ; ip r
```

> Если есть `/etc/cloud/cloud.cfg.d/` и cloud-init перезаписывает файл: `echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg`.

### 1.3 Ubuntu Desktop — NetworkManager (имя соединения!)

В листе «nazwa połączenia: LAN K» на Linux = **имя соединения NetworkManager**.
GUI: *Ustawienia → Sieć → ⚙ у Przewodowe* → вкладка *Tożsamość: Nazwa*, вкладка *IPv4: Ręcznie / Automatycznie (DHCP)*, адрес, maska, brama, DNS (снять «Automatycznie»).

```bash
nmcli con show
nmcli con mod "Połączenie przewodowe 1" connection.id "LAN K"          # переименовать
nmcli con mod "LAN K" ipv4.method manual ipv4.addresses 10.0.10.11/24 \
      ipv4.gateway 10.0.10.1 ipv4.dns 10.0.10.1
nmcli con mod "LAN K" ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns 192.168.7.3   # DHCP + свой DNS
nmcli con add type ethernet ifname enp0s3 con-name "LAN2" ipv4.method auto   # новое соединение
nmcli con down "LAN K" && nmcli con up "LAN K"                         # применить / обновить DHCP
nmcli dev disconnect enp0s8                                            # выключить интерфейс
```

### 1.4 Имя хоста, время

```bash
sudo hostnamectl set-hostname serwer-5      # + поправить 127.0.1.1 в /etc/hosts
hostnamectl
sudo timedatectl set-timezone Europe/Oslo   # 12-часовой формат — в GUI: Ustawienia → Data i czas
```

## 2. Пользователи и группы

| Задача | Команда |
|---|---|
| Пользователь с домашним каталогом | `sudo useradd -m jkowalski` |
| … с описанием, shell, UID, своим home, сроком | `sudo useradd -m -c "Jan Kowalski" -s /bin/sh -u 7777 -d /home/user -e 2029-02-15 tester` |
| Пароль | `sudo passwd tester` (или `echo 'tester:P@ss' \| sudo chpasswd`) |
| Интерактивно (Ubuntu) | `sudo adduser jkowalski` |
| Группа с GID | `sudo groupadd -g 1111 szkola` |
| Сменить GID группы | `sudo groupmod -g 1111 informatycy` |
| Добавить в группу | `sudo usermod -aG szkola student` / `sudo gpasswd -a student szkola` |
| Права sudo («wszystkie polecenia jako root») | `sudo usermod -aG sudo asystent` (openSUSE: `wheel` + раскомментировать `%wheel ALL=(ALL) ALL` в `visudo`) |
| Сменить shell | `sudo chsh -s /bin/sh asystent` / `usermod -s` |
| Срок действия учётки | `sudo chage -E 2029-02-15 egzamin` |
| Мин. дней между сменами пароля | `sudo chage -m 4 kadry` |
| Дней после истечения пароля до блокировки | `sudo chage -I 2 administrator` |
| Проверить | `id tester`, `getent passwd tester`, `getent group szkola`, `sudo chage -l tester` |
| Удалить | `sudo userdel -r tester`, `sudo groupdel szkola` |
| Принимает ли сообщения | `mesg` → «is y» = да |

## 3. Права

| Число | rwx | Смысл |
|---|---|---|
| 7 | rwx | полные |
| 6 | rw- | чтение+запись |
| 5 | r-x | чтение+выполнение |
| 4 | r-- | чтение |
| 1 | --x | выполнение («tylko uruchomienie») |
| 0 | --- | нет |

Порядок: **владелец – группа – остальные**. Примеры из листов:

```bash
chmod 754 ~/architekt        # u=rwx g=r-x o=r--
chmod 710 konta.sh           # rwx для владельца, только выполнение для группы
chmod 740 ~/ELEKTRONIKA      # 7 / 4 / 0  («właściciel pełne, grupa odczyt, inni brak»)
chmod 741 ~/ELEKTRONIKA      # «… inni – wykonanie»
chmod 666 konfiguracja       # чтение+запись всем
chmod 770 /home/zadanie ; chmod 660 /home/zadanie/dane
chmod u=rwx,g=rx,o= /kopie_strony     # символьно = 750
chmod -R 755 /www            # рекурсивно
sudo chown egzamin:root /home/zadanie
sudo chown -R www-data:www-data /strona
sudo chown jkowalski /dane && sudo chmod 700 /dane     # «pełne prawa tylko dla jkowalski»
ls -ld /dane ; stat -c '%a %U %G %n' /dane
```

Полезное: `mkdir ~/.INF02` (скрытый каталог), `ln -s /dev ~/dowiazanie_dev`, `ls -d /sbin/n* > ~/Letter_n`, `df -h > ~/dysk`, `ip a > ~/konfiguracja`, `alias godz='date +%H-%M'` (+ в `~/.bashrc`), `cp /etc/ssh/sshd_config ~/KOPIE/ssh_old`.

## 4. Скрипты bash

Создание: `nano ~/skrypty_admina/konta.sh` → первая строка `#!/bin/bash` → `chmod +x` (или число из листа) → запуск `./konta.sh uczen 3TI` или `sudo bash konta.sh uczen 3TI`.

```bash
#!/bin/bash
# konta.sh <nazwa_bazowa_uzytkownika> <nazwa_bazowa_katalogu>
# tworzy uczen1..uczen5 z katalogami /home/3TI1../home/3TI5
if [ $# -ne 2 ]; then
  echo "Użycie: $0 nazwa_uzytkownika nazwa_katalogu"; exit 1
fi
for i in $(seq 1 5); do
  useradd -m -d "/home/$2$i" -s /bin/bash "$1$i"
  echo "Utworzono $1$i z katalogiem /home/$2$i"
done
```

```bash
#!/bin/bash
# konfiguracja.sh — grupa, członek, zmiana GID
groupadd informatycy
usermod -aG informatycy administrator
groupmod -g 1111 informatycy
getent group informatycy
```

```bash
#!/bin/bash
# wzorce: pętla while, warunek, odczyt z klawiatury
read -p "Podaj imię: " imie
echo "Witaj $imie"
n=1
while [ $n -le 10 ]; do mkdir -p "/TEST/STUDENT$n"; n=$((n+1)); done
for plik in /home/administrator/Kopie/*.txt; do echo "$plik"; done
[ -d /dane ] && echo "jest" || echo "brak"
```

Переменные: `$0` имя скрипта, `$1..$9` параметры, `$#` их число, `$@` все, `$?` код возврата.

## 5. Архивы

```bash
tar -cvf informatyk.tar inf02.txt inf03.txt     # c=create v=widoczne nazwy f=plik
tar -czvf kopia.tar.gz katalog/                 # + gzip
tar -cjvf kopia.tar.bz2 katalog/                # + bzip2
tar -tvf informatyk.tar                         # lista
tar -xvf inf02.tar -C ~/egzamin                 # rozpakuj do katalogu
gzip plik ; gunzip plik.gz ; zip -r a.zip dir ; unzip a.zip
tar -cvf ~/egzamin.tar ~/Obrazy/Zrzuty\ ekranu/*.png   # архив скриншотов
```

## 6. Диски

```bash
lsblk -f                                   # новый диск, например /dev/sdb
sudo fdisk /dev/sdb                        # g (GPT) / o (MBR) → n → Enter×3 → w
# или без диалога:
sudo parted -s /dev/sdb mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L DANE /dev/sdb1
sudo mkdir /dane
sudo mount /dev/sdb1 /dane
sudo blkid /dev/sdb1                       # UUID
echo 'UUID=xxxx-xxxx /dane ext4 defaults 0 2' | sudo tee -a /etc/fstab
sudo mount -a && df -h /dane
```

Тест скорости: приложение **Dyski** (`gnome-disks`) → выбрать раздел → меню ⋮ → *Test wydajności partycji…* → *Rozpocznij test wydajności…* → снять «test zapisu», задать *Liczba próbek / Rozmiar próbki*. CLI: `sudo hdparm -t /dev/sda`.
Флешка `Egzamin-x` монтируется в `/media/administrator/Egzamin-x`.

## 7. Службы

```bash
sudo systemctl status ssh
sudo systemctl enable --now ssh            # «uruchamia się po starcie» + uruchom
sudo systemctl restart apache2
systemctl is-enabled smbd ; systemctl is-active smbd
journalctl -u isc-dhcp-server -n 30        # почему не стартует
ss -tulpn                                  # кто слушает порты
```

### 7.1 isc-dhcp-server (полный пример)

```bash
sudo apt install isc-dhcp-server           # если не установлен
sudo nano /etc/default/isc-dhcp-server
#   INTERFACESv4="enp0s8"                  # интерфейс к коммутатору
sudo nano /etc/dhcp/dhcpd.conf
```
```conf
option domain-name "egzamin.edu";
option domain-name-servers 10.80.0.2;
default-lease-time 3600;          # 1 h
max-lease-time 10800;             # 3 h
authoritative;                    # «serwer autorytatywny» — раскомментировать

subnet 10.80.0.0 netmask 255.255.255.0 {
  range 10.80.0.10 10.80.0.30;
  option routers 10.80.0.2;
  option broadcast-address 10.80.0.255;
  option subnet-mask 255.255.255.0;
}

host stacja {                     # резервирование
  hardware ethernet 08:00:27:aa:bb:cc;
  fixed-address 10.80.0.20;
}
```
```bash
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf     # проверка синтаксиса
sudo systemctl restart isc-dhcp-server && systemctl status isc-dhcp-server
cat /var/lib/dhcp/dhcpd.leases             # выданные адреса
```
Интерфейс сервера должен иметь **статический IP из этой подсети**, иначе служба не стартует.

### 7.2 Apache (HTTP)

| | Ubuntu | openSUSE |
|---|---|---|
| Пакет/служба | `apache2` | `apache2` |
| Корень сайта по умолчанию | `/var/www/html` | `/srv/www/htdocs` |
| Конфиг сайта | `/etc/apache2/sites-available/000-default.conf` | `/etc/apache2/default-server.conf` |
| Порт | `/etc/apache2/ports.conf` (`Listen 80`) | `/etc/apache2/listen.conf` |
| Пользователь/группа | `www-data` / `www-data` (`/etc/apache2/envvars`) | `wwwrun` / `www` (`/etc/apache2/uid.conf`) |

Смена корня на `/www` и порта на 8080 (Ubuntu):

```bash
grep -E 'APACHE_RUN_(USER|GROUP)' /etc/apache2/envvars     # «odczytaj użytkownika i grupę»
sudo sed -i 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf
sudo sed -i 's#<VirtualHost \*:80>#<VirtualHost *:8080>#; s#DocumentRoot /var/www/html#DocumentRoot /www#' \
     /etc/apache2/sites-available/000-default.conf
sudo tee -a /etc/apache2/apache2.conf <<'EOF'
<Directory /www/>
    Options Indexes FollowSymLinks
    AllowOverride None
    Require all granted
</Directory>
EOF
sudo apache2ctl configtest && sudo systemctl restart apache2
curl http://localhost:8080
```

Замена главной страницы: `sudo cp /media/administrator/DOKUMENTACJA*/PLIKI/index.html /var/www/html/index.html`.

### 7.3 Samba

```bash
sudo apt install samba
sudo nano /etc/samba/smb.conf
```
```conf
[homes]
   comment = Katalogi domowe
   browseable = no
   read only = no
   valid users = %S

[dane]
   path = /dane
   valid users = jkowalski
   read only = no
```
```bash
sudo smbpasswd -a jkowalski          # пользователь Samba (должен существовать в системе)
testparm -s
sudo systemctl enable --now smbd nmbd
smbclient -L localhost -U jkowalski
```
Windows: `net use M: \\192.168.0.3\jkowalski /user:jkowalski /persistent:yes`, `net use P: \\192.168.0.3\dane`.
DNS-служба на Ubuntu = `bind9`: `sudo systemctl enable --now named`.

### 7.4 SSH

```bash
sudo apt install openssh-server
sudo systemctl enable --now ssh
echo 'AllowUsers jkowalski administrator' | sudo tee -a /etc/ssh/sshd_config
sudo systemctl restart ssh
ssh jkowalski@192.168.0.3            # с Windows: ssh / PuTTY
```

### 7.5 Брандмауэр ufw

```bash
sudo ufw status verbose        # в Ubuntu обычно inactive — ping работает
sudo ufw allow 22/tcp ; sudo ufw allow 80/tcp ; sudo ufw allow Samba
sudo ufw enable
```

## 8. Идентификация железа в Linux

| Параметр | Команда |
|---|---|
| ОС, версия | `cat /etc/os-release`, `lsb_release -a`, `hostnamectl` |
| Ядро | `uname -r` |
| CPU: модель, ядра, частота | `lscpu` (*Model name*, *Core(s) per socket*, *CPU max MHz*), `cat /proc/cpuinfo` |
| RAM: объём | `free -h` |
| RAM: тип, частота, производитель, S/N, part number | `sudo dmidecode -t memory` (*Size, Type: DDR4, Speed, Manufacturer, Serial Number, Part Number*) |
| Всё оборудование | `sudo lshw -short`, `sudo lshw -C memory`, `-C display`, `-C network`, `-C disk` |
| GPU | `lspci \| grep -i vga`, `sudo lshw -C display` (*vendor*, *product*) |
| Диски | `lsblk -d -o NAME,MODEL,SIZE,ROTA` (ROTA 0 = SSD), `sudo fdisk -l`, `sudo smartctl -i /dev/sda` |
| Сетевая карта, MAC | `ip link`, `sudo lshw -C network` |
| Разрешение монитора | `xrandr` (строка `maximum`, режимы со `*` = текущий) |
| Свободное место | `df -h` |

Результат в файл: `sudo lshw -short > ~/Identyfikacja_serwera/lshw.txt`.
Скриншот: клавиша **PrtSc** (сохраняет PNG в `~/Obrazy/Zrzuty ekranu`). Нужен `.jpg` → открыть в GIMP → *Eksportuj jako* `ram.jpg`, или `convert a.png ram.jpg` (ImageMagick, если есть).

## 9. Тесты

```bash
ip -br a ; ip r ; resolvectl status
ping -c 4 192.168.0.1
ping -c 4 192.168.0.200
nslookup www.egzamin.local
curl -I http://192.168.1.101
```

## 10. openSUSE — отличия

| Тема | openSUSE Leap |
|---|---|
| Пакеты | `sudo zypper in apache2 samba dhcp-server` |
| Центр настройки | `sudo yast` (TUI), `yast lan`, `yast users` |
| Сеть (server) | **wicked**: `/etc/sysconfig/network/ifcfg-eth0`, `routes`, DNS в `/etc/sysconfig/network/config`; `sudo wicked ifreload all` |
| Сеть (desktop / Leap 16) | NetworkManager → те же команды `nmcli` |
| Интерфейсы | чаще `eth0`, `eth1` |
| sudo-группа | `wheel` (включить в `visudo`) |
| DHCP-сервер | пакет `dhcp-server`, `/etc/sysconfig/dhcpd` → `DHCPD_INTERFACE="eth1"`, служба `dhcpd` |
| Apache | пользователь `wwwrun`, группа `www`, корень `/srv/www/htdocs` |
| Samba | службы `smb`, `nmb` |
| SSH | служба `sshd` |
| Брандмауэр | firewalld: `sudo firewall-cmd --add-service=ssh --permanent && sudo firewall-cmd --reload` |
| Железо | `hwinfo --short`, `sudo lshw` |

```ini
# /etc/sysconfig/network/ifcfg-eth0
BOOTPROTO='static'
IPADDR='192.168.0.4/24'
STARTMODE='auto'
# /etc/sysconfig/network/routes
default 192.168.0.1 - -
# /etc/sysconfig/network/config
NETCONFIG_DNS_STATIC_SERVERS="4.4.4.4"
```

Скрипт самопроверки: `sudo bash tools/check-linux.sh [oczekiwane.txt]`.
