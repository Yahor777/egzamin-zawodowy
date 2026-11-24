# Linux: администрирование (System Linux)

## Структура каталогов (FHS)

| Каталог | Содержимое |
|---|---|
| `/` | корень |
| `/bin`, `/sbin` | основные команды / команды администратора |
| `/boot` | ядро, initrd, GRUB |
| **`/dev`** | **pliki specjalne urządzeń** (`/dev/sda`, `/dev/sda2`, `/dev/nvme0n1p1`) |
| **`/etc`** | **конфигурация** (passwd, fstab, network/interfaces, default/grub) |
| **`/home`** | **домашние каталоги пользователей** (Fedora, Ubuntu…) |
| `/root` | домашний каталог root |
| `/lib` | библиотеки, модули ядра |
| `/media`, `/mnt` | точки монтирования (съёмные / временные) |
| `/opt` | дополнительное ПО |
| **`/proc`** | виртуальная ФС ядра: `/proc/meminfo` (RAM), `/proc/cpuinfo`, **`/proc/vmstat` (виртуальная память)** |
| `/sys` | устройства (sysfs) |
| `/tmp` | временные файлы |
| `/usr` | программы и данные пользователей (`/usr/share`) |
| **`/var`** | **изменяющиеся файлы**: логи `/var/log` (**`messages`**, `syslog`, `auth.log`), очереди, кэш |

- **swap** — раздел подкачки (данные при нехватке RAM). Устройства обслуживает **udev** (динамически).
- Диски: `sda` — 1-й SATA/SCSI диск, `sda2` — 2-й раздел.

## Базовые команды

| Команда | Действие |
|---|---|
| `pwd` | **текущий каталог** |
| `cd ~` / `cd ..` / `cd -` | **домой** / вверх / назад |
| `ls -l -a -h -R` | список (подробно, со скрытыми); аналоги: **`dir`, `tree`** |
| `ls /home/user/*abc*.txt` | файлы .txt с «abc» в имени |
| `ls /home/user/[a-c]*.txt` | .txt на a, b или c |
| `cp -r src dst` | копировать (рекурсивно), напр. на USB |
| `mv` | переместить / переименовать |
| `rm -r -f`, `rmdir`, `mkdir -p` | удаление, каталоги |
| **`touch plik`** | **создать файл** или обновить дату модификации/доступа |
| `cat`, `less`, `head -n`, `tail -n -f` | просмотр |
| **`grep -i -r -n -v`** | **строки с заданной подстрокой** в файлах |
| **`find / -name "*.conf"`** | **поиск файлов по имени** (и др. критериям) |
| `locate`, `which`, `whereis` | быстрый поиск / путь к программе |
| `wc`, `sort`, `uniq`, `cut` | обработка текста |
| **`tee`** | читает stdin, пишет **в stdout и в файлы** |
| `df -h` | **свободное место** на файловых системах |
| **`du -sh katalog`** | **размер каталога** |
| `free -h` | RAM и swap |
| **`uptime`** | **текущее время, время работы, число пользователей, load average** |
| `uname -a / -r / -s` | всё о системе / версия ядра / **имя ядра** |
| `tty` | **имя терминала** |
| `cal`, `date` | календарь / дата |
| `who`, `w`, `whoami`, **`id`** (UID, GID, группы) | пользователи |
| `man`, `--help`, `history`, `alias` | справка, история |
| `vi` / `vim` / `nano` | **редактирование конфигов** |

## Перенаправление и шаблоны

- `>` — перезаписать файл, **`>>` — дописать** (`dir /etc >> test.txt`), `2>` — ошибки, `|` — конвейер, `<` — ввод.
- `*` — любые символы, `?` — один символ, `[a-c]` — диапазон, `~` — домашний каталог.
- Скрипт: `#!/bin/bash`, `chmod +x skrypt.sh`, `./skrypt.sh`; `$1` — 1-й аргумент, `$#` — число аргументов, `$?` — код возврата.

## Права доступа (uprawnienia)

`-rwxr-xr--` → тип, **u** (właściciel) rwx, **g** (grupa) r-x, **o** (pozostali) r--.
r = **4**, w = **2**, x = **1**.

| Пример | Расчёт | Права |
|---|---|---|
| 755 | 7=4+2+1, 5=4+1, 5 | rwxr-xr-x |
| 644 | 6=4+2, 4, 4 | rw-r--r-- |
| **541** | 5=4+1 r-x, 4 r--, 1 --x | **właściciel: odczyt i wykonanie** |
| **321** | 3=2+1 -wx, 2 -w-, 1 --x | **właściciel: zapis+wykonanie, grupa: zapis, pozostali: wykonanie** |
| 664 | | rw-rw-r-- |

- `chmod 754 plik`, `chmod u+x,g-w plik`, **`chmod +x test`** (= a+x, **запуск для всех**), **`chmod -R a+w /usr/share`** — запись всем рекурсивно, остальные права без изменений.
- `chown user:grupa plik`, `chgrp`. `umask 022` → новые файлы 644, каталоги 755.
- Специальные биты: SUID 4, SGID 2, sticky 1 (`/tmp`): `chmod 1777`.
- ACL: `getfacl` / `setfacl` (getfacl — **не** сетевая утилита).

## Пользователи и группы

| Команда | Действие |
|---|---|
| `useradd -m -d /home/jan -s /bin/bash -g grupa -G sudo jan` | создать (-m домашний каталог) |
| **`useradd -D -b /users/home/new`** | изменить **базовый домашний каталог по умолчанию** для новых |
| **`usermod -s /bin/sh egzamin`** | **сменить оболочку** |
| **`usermod -L egzamin`** / `-U` | **заблокировать** / разблокировать пароль |
| `usermod -aG grupa jan` | добавить в доп. группу |
| **`userdel student`** (`-r` — с домашним каталогом) | удалить |
| **`passwd egzamin`** | **задать/сменить пароль** пользователя (root); `passwd -l` — блокировка |
| `groupadd`, `groupdel`, `gpasswd -a` | группы |
| **`groups egzamin`** | группы пользователя |
| `su -`, **`sudo`** | сменить пользователя / **однократное повышение прав** |
| `chage -l jan` | срок действия пароля |

### Файлы учётных записей

| Файл | Формат / содержимое |
|---|---|
| **`/etc/passwd`** | `login:x:UID:GID:opis:katalog_domowy:powłoka` — **список всех учёток** (`cat /etc/passwd`); исторически хранил пароли |
| **`/etc/shadow`** | **хэши паролей**, сроки (только root) |
| `/etc/group` | `grupa:x:GID:członkowie` |
| `/etc/gshadow` | пароли групп |
| `/etc/sudoers` | права sudo (редактировать `visudo`) |
| `/etc/skel` | шаблон домашнего каталога |

- root: UID 0; обычные пользователи с 1000 (Ubuntu).

## Пакетные менеджеры

| Дистрибутив | Низкий уровень | Высокий уровень | GUI |
|---|---|---|---|
| Debian / **Ubuntu** | `dpkg -i pakiet.deb` | **`apt`/`apt-get`** | **Synaptic**, Ubuntu Software |
| Fedora / RHEL / CentOS | `rpm -ivh` | `dnf` / `yum` | |
| **openSUSE** | `rpm` | **`zypper`** | **YaST** (управление всей системой) |
| Arch | | `pacman` | |

- `apt-get update` — обновить списки пакетов; **`apt-get upgrade`** — обновить пакеты; **`apt-get dist-upgrade`** — **со сменой зависимостей/нового ядра, переход на новую версию**; `do-release-upgrade` — новая версия Ubuntu.
- `apt-get install python3`, `apt-get remove` / `purge`, `apt-cache search`.
- Репозитории: **`add-apt-repository`** (Ubuntu), **`zypper ar`** (openSUSE); `/etc/apt/sources.list`.
- Обновления системы: **apt-get и zypper**; в GUI — **Synaptic lub YaST**.

## Процессы и службы

| Команда | Действие |
|---|---|
| **`ps aux`** / `ps -ef` | **все процессы** (не только свои) — снимок |
| **`top`** / htop | **мониторинг в реальном времени**: CPU, RAM, процессы, load |
| **`kill PID`**, `kill -9 PID` | **завершить процесс** (-9 SIGKILL) |
| `killall nazwa`, `pkill` | по имени |
| `nice -n 10 cmd`, `renice` | приоритет |
| `cmd &`, `jobs`, `bg`, `fg`, `nohup` | фоновые задачи |
| `systemctl start/stop/restart/status nazwa` | управление службой (systemd) |
| `systemctl enable/disable nazwa` | автозапуск при загрузке |
| `service apache2 restart` | старый стиль (SysV) |
| `journalctl -u nazwa`, `dmesg` | журналы, сообщения ядра |

- Разница **ps** (снимок) vs **top** (обновляет в реальном времени).

## Сеть

| Команда | Действие |
|---|---|
| **`ifconfig`** | показать/настроить интерфейсы; `ifconfig eth0 172.16.31.1 netmask 255.255.0.0` |
| **`ip addr add 152.168.1.200/16 dev eth1`** | назначить IP (iproute2) |
| `ip link set eth0 up` | включить интерфейс; **`ip link add link eth0 name eth0.10 type vlan id 10`** — VLAN |
| `ip route add default via 10.0.0.10` | шлюз; `route` — **показать/изменить таблицу маршрутов** |
| **`ifup eth0`** / `ifdown` | **включить** / выключить интерфейс |
| `ping -c 4 -i 3 host` | 4 пакета, **интервал 3 с** |
| **`traceroute`** | трасса; **`mtr`** — трасса + % потерь + задержки |
| `netstat -tulpn` / `ss` | соединения, порты |
| `nslookup`, `dig`, `host` | DNS |
| `hostname` | имя хоста |
| **`nmap`** | **сканирование сети/портов** |
| **`iftop`** | мониторинг соединений/трафика интерфейса |
| **`ntop`** | статистика трафика в реальном времени |
| **Nagios** | мониторинг сети, устройств, серверов |
| **`nmon`** | комплексный мониторинг (CPU, сеть, ФС…) |
| tcpdump, Wireshark | снифферы |

- Конфигурация: **`/etc/network/interfaces`** (Debian/старый Ubuntu), `/etc/netplan/*.yaml` (Ubuntu 18+), `/etc/resolv.conf` (DNS), `/etc/hosts`, `/etc/hostname`.
- Пример `/etc/network/interfaces`:
  ```
  auto eth0
  iface eth0 inet static
    address 10.0.0.100
    netmask 255.255.255.0
    gateway 10.0.0.10
  ```

### Серверы

| Служба | Программа (демон) |
|---|---|
| WWW | **Apache** (`httpd`/`apache2`, `httpd.conf`, `Listen 8012` → `http://localhost:8012`), nginx |
| DNS | **BIND** (`named`) |
| DHCP | **`isc-dhcp-server`** (`sudo apt-get install isc-dhcp-server`, `dhcpd.conf`: `range 176.16.20.50 176.16.20.250;`) |
| Файлы/принтеры для Windows | **Samba**: **`smbd`** (файлы, принтеры), `nmbd` (NetBIOS); `/etc/samba/smb.conf` |
| Печать | CUPS |
| БД | MySQL (**`mysqld`**), MariaDB |
| FTP | vsftpd, ProFTPD |
| SSH | `sshd` (OpenSSH) |
| Firewall | iptables, nftables, ufw |
| LDAP | OpenLDAP (атрибут `sn` = **nazwisko**) |

## Архивы и сжатие

| Команда | Действие |
|---|---|
| `tar -cvf arch.tar katalog` | создать архив (c — create, v — verbose, f — file) |
| **`tar -zcvf arch.tar.gz katalog`** | **сжатый архив gzip** |
| `tar -jcvf arch.tar.bz2 …` / `-J` | bzip2 / xz |
| **`tar -xvf dane.tar`** (`tar -xf`) | **извлечь** |
| **`tar -xvjf wazne_pliki.tar.bz2`** | извлечь .tar.bz2 |
| `tar -tvf arch.tar` | список содержимого |
| **`gzip`** / `gunzip`, `bzip2`, `xz`, `zip`/`unzip` | сжатие |

- **tar** — архивация (без сжатия), gzip — сжатие.

## Диски, монтирование, fstab

| Команда | Действие |
|---|---|
| **`fdisk /dev/sda`**, `parted`, `gparted` | **таблица разделов** |
| `mkfs.ext4 /dev/sdb1`, `mkswap`, `swapon` | форматирование / swap |
| **`mount /dev/sda2 /mnt/flash`** | **подключить раздел (SATA-диск sda) к каталогу** `/mnt/flash` |
| `mount -t cifs //srv/dane /mnt/dane` | смонтировать **сетевой ресурс** |
| `umount` | отмонтировать |
| `lsblk`, `blkid` | блочные устройства, UUID |
| **`fsck`** | **проверка/ремонт ФС и bad-секторов** (аналог **chkdsk**), на отмонтированном разделе |
| **`dd if=/dev/sda of=obraz.img`** | **побитовая копия, образ носителя** |
| **`hdparm -T /dev/sda`** (`-t`) | **тест скорости диска** (кэш / чтение) |
| `smartctl -a /dev/sda` | S.M.A.R.T. |

**/etc/fstab** — 6 полей:
```
UUID=…  /home  ext4  defaults  0  2
<urządzenie> <punkt montowania> <typ fs> <opcje> <dump> <kolejność fsck>
```

## Аппаратная информация

- **`lshw`** — подробно об установленном оборудовании; **`lscpu`** — процессор; `lspci`, `lsusb`; **`dmidecode`** — данные из **BIOS (DMI/SMBIOS)**; `cat /proc/cpuinfo`, `cat /proc/meminfo`.
- `ls` — **не** диагностика оборудования.

## Планировщик cron

- **`cron`** — планирование задач; `crontab -e` (редактировать), `crontab -l` (список), `/etc/crontab`.
- Формат: `min godz dzień_mies miesiąc dzień_tyg polecenie`
  - `30 2 * * 1 /backup.sh` — каждый понедельник в 2:30.
  - `*/15 * * * * cmd` — каждые 15 мин; `0 0 1 * *` — 1-го числа в полночь.
  - День недели: 0 (или 7) = воскресенье.
- `at 18:00` — однократно.

## GRUB и графические среды

- Загрузчики: **GRUB 2** (LILO — старый). Меню выбора ОС настраивается в GRUB.
- **`/etc/default/grub`**: **`GRUB_TIMEOUT`** — время ожидания меню; **`GRUB_DEFAULT`** — ОС по умолчанию (напр. Windows). Скрипты — **`/etc/grub.d/`** (порядок пунктов). После правки — `update-grub`.
- Переустановили Windows → **`grub-install /dev/sda`** + `update-grub`.
- Среды: GNOME (**GNOME Tweak Tool**), KDE Plasma, **XFCE (наименьшие требования к RAM)**, LXDE/LXQt. **Unity Tweak Tool / Narzędzia dostrajania** — **персонализация** системы.
- Мультимедиа: Banshee, Rhythmbox (музыка), VLC.

## Частые ловушки на экзамене

- **chmod 541**: владелец **r-x** (чтение и выполнение); **321**: -wx / -w- / --x.
- **`chmod -R a+w`** — добавить запись всем, не трогая остальное; `chmod +x` — запуск всем.
- Хэши паролей — в **`/etc/shadow`**, но если в вариантах только `users/groups/passwd/password` — выбирать **passwd**; список учёток — `cat /etc/passwd`.
- **`usermod -L`** — блокировка; **`usermod -s`** — оболочка; `useradd -D -b` — базовый каталог для новых.
- `>>` дописывает, `>` перезаписывает; **tee** — в stdout **и** файл.
- **`apt-get dist-upgrade`** — с новым ядром/зависимостями; `upgrade` — обычное обновление.
- **fsck = chkdsk**; `dd` — образ носителя; **`df` — свободное место**, **`du` — размер каталога**.
- **`uptime`** — время, аптайм, пользователи, load; **`tty`** — имя терминала; **`id`** — UID.
- Samba-демон — **smbd**; DNS-сервер — **BIND**; DHCP — **isc-dhcp-server**; WWW — **Apache**.
- `GRUB_TIMEOUT` — время меню, `GRUB_DEFAULT` — ОС по умолчанию; файл **`/etc/default/grub`**.
