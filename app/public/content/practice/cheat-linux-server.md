# Шпаргалка: Linux Server INF.02

Логин в симуляторе: `administrator` / `zaq1@WSX`. На реальном листе пароль читай в treści zadania. Когда экзамен просит wpisać polecenie do tabeli, пиши полную команду с опциями и путями.

## Как читать команду

```text
sudo chmod -R 750 /home/zasob
│    │     │  │   └─ CEL: katalog lub plik, którego dotyczy zmiana
│    │     │  └─ WARTOŚĆ: prawa ósemkowo 750
│    │     └─ opcja -R = recursive, rekurencyjnie
│    └─ program: chmod = change mode, zmiana uprawnień
└─ uruchom jako administrator przez sudo
```

## Какую программу брать

| Zadanie w arkuszu | Program | Co znaczy nazwa |
|---|---|---|
| sprawdzić/adresować sieć Server | `ip`, `netplan` | internet protocol / network plan |
| konfiguracja sieci Desktop | `nmcli` | NetworkManager CLI |
| trasy | `ip route` | routing table |
| DHCP | `dhcpd`, `systemctl` | DHCP daemon / systemd control |
| strona WWW | `apache2ctl`, `a2ensite` | Apache control / enable site |
| użytkownicy/grupy | `useradd`, `usermod` | user add / user modify |
| prawa | `chmod`, `chown` | change mode / change owner |
| dyski | `fdisk`, `mkfs`, `mount` | fixed disk / make filesystem |
| usługi | `systemctl` | systemd control |
| automatyczne zadania | `crontab` | cron table |
| SMB | `testparm`, `smbpasswd` | test parameters / SMB password |
| SSH | `ssh`, `sshd_config` | secure shell |

## 1. Sieć — Server i Desktop

```bash
ip -br link                                      # pokaż interfejsy, MAC i stan krótko
ip -br address                                   # pokaż adresy IPv4 krótko
ip route show                                    # pokaż bramę i trasy
resolvectl status                                # pokaż serwery DNS
```

Ubuntu Server — netplan:

<!-- file: /etc/netplan/50-cloud-init.yaml -->
```yaml
# korzeń konfiguracji sieci
network:
  # format netplan 2
  version: 2
  # usługa networkd na serwerze
  renderer: networkd
  # sekcja interfejsów Ethernet
  ethernets:
    # pierwszy interfejs: WAN/ROUTER
    enp0s3:
      # wyłącz automatyczny DHCPv4
      dhcp4: false
      # adres z maską prefiksu
      addresses: [90.90.0.3/29]
      # sekcja tras
      routes:
        # trasa domyślna
        - to: default
          # brama domyślna
          via: 90.90.0.1
    # drugi interfejs: LAN bez bramy
    enp0s8:
      # wyłącz DHCPv4
      dhcp4: false
      # statyczny adres LAN
      addresses: [10.80.0.2/24]
      # sekcja DNS
      nameservers:
        # serwer DNS
        addresses: [10.80.0.2]
```

```bash
sudo nano /etc/netplan/50-cloud-init.yaml        # edytuj konfigurację netplan
sudo netplan generate                            # sprawdź składnię YAML
sudo netplan apply                               # zastosuj konfigurację
```

Ubuntu Desktop — NetworkManager:

```bash
nmcli device status                              # pokaż urządzenia i aktywne profile
nmcli connection show                            # pokaż nazwy profili połączeń
nmcli con mod "Wired connection 1" connection.id LAN  # zmień nazwę połączenia na LAN
nmcli con mod LAN ipv4.method manual ipv4.addresses 10.0.10.11/24 ipv4.gateway 10.0.10.1 ipv4.dns 10.0.10.1  # ustaw statyczny IPv4
nmcli connection up LAN                          # aktywuj profil LAN
nmcli con mod LAN ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns ""  # wróć do DHCP
```

## 2. Trasy

```bash
sudo ip route add 192.168.77.0/24 via 90.90.0.1  # dodaj trasę tymczasową do sieci przez bramę
ip route get 192.168.77.20                       # sprawdź wybór trasy dla adresu
sudo ip route del 192.168.77.0/24 via 90.90.0.1  # usuń tę trasę tymczasową
```

Stałe trasy wpisuj w netplan w `routes`, potem `sudo netplan apply`.

## 3. DHCP

<!-- file: /etc/dhcp/dhcpd.conf -->
```dhcpd
# serwer autorytatywny
authoritative;
# podsieć serwowana przez DHCP
subnet 10.80.0.0 netmask 255.255.255.0 {
  # pula adresów
  range 10.80.0.10 10.80.0.30;
  # brama klienta
  option routers 10.80.0.2;
  # DNS klienta
  option domain-name-servers 10.80.0.2;
  # czas dzierżawy
  default-lease-time 3600;
  # maksymalny czas
  max-lease-time 10800;
# koniec subnet
}
```

<!-- file: /etc/default/isc-dhcp-server -->
```sh
# interfejs IPv4 nasłuchujący DHCP
INTERFACESv4="enp0s8"
# IPv6 nieużywane
INTERFACESv6=""
```

```bash
sudo nano /etc/dhcp/dhcpd.conf                   # edytuj konfigurację DHCP
sudo nano /etc/default/isc-dhcp-server           # wybierz interfejs usługi DHCP
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf           # sprawdź składnię DHCP
sudo systemctl restart isc-dhcp-server           # uruchom DHCP ponownie
sudo systemctl enable isc-dhcp-server            # włącz autostart DHCP
```

## 4. WWW Apache

<!-- file: /etc/apache2/sites-available/010-www.conf -->
```apache
# witryna na porcie 80
<VirtualHost *:80>
    # katalog strony
    DocumentRoot /www
    # reguły katalogu
    <Directory /www>
        # zezwól odczyt wszystkim klientom
        Require all granted
    # koniec Directory
    </Directory>
# koniec VirtualHost
</VirtualHost>
```

```bash
sudo mkdir /www                                  # utwórz katalog strony
printf '<h1>INF.02</h1>\n' | sudo tee /www/index.html  # utwórz prostą stronę testową
sudo nano /etc/apache2/sites-available/010-www.conf  # edytuj definicję witryny
sudo a2ensite 010-www                            # włącz witrynę
sudo a2dissite 000-default                       # wyłącz domyślną witrynę
sudo apache2ctl -t                               # sprawdź składnię Apache
sudo systemctl reload apache2                    # przeładuj Apache bez zrywania połączeń
curl -s http://localhost/                        # pobierz stronę testowo
```

## 5. Użytkownicy, grupy, prawa

```bash
sudo useradd -m -s /bin/bash jkowalski           # utwórz użytkownika z home i powłoką bash
sudo passwd jkowalski                            # ustaw hasło użytkownika
sudo groupadd -g 1111 informatycy                # utwórz grupę z GID 1111
sudo usermod -aG informatycy jkowalski           # dodaj użytkownika do grupy dodatkowej
sudo chmod 770 /home/publiczny                   # ustaw rwx właścicielowi i grupie
sudo chown jkowalski:informatycy /home/publiczny # ustaw właściciela i grupę
stat -c %a /home/publiczny                       # pokaż uprawnienia cyframi
```

Prawa ósemkowo: `r=4`, `w=2`, `x=1`; kolejność `właściciel-grupa-inni`. Katalog bez `x` nie pozwala wejść do środka.

## 6. Dysk i montowanie

<!-- file: /etc/fstab -->
```fstab
# urządzenie punkt-montowania system-opcje dump pass
/dev/sdb1 /dane ext4 defaults 0 2
```

```bash
sudo fdisk -l /dev/sdb                           # pokaż partycje dysku sdb
printf 'g\nn\n1\n\n\nw\n' | sudo fdisk /dev/sdb  # utwórz GPT i jedną partycję na cały dysk
sudo mkfs.ext4 /dev/sdb1                         # sformatuj partycję jako ext4
sudo mkdir /dane                                 # utwórz punkt montowania
sudo mount /dev/sdb1 /dane                       # zamontuj partycję teraz
sudo nano /etc/fstab                             # dodaj montowanie stałe
sudo findmnt --verify                            # sprawdź fstab
sudo umount /dane                                # odmontuj testowo
sudo mount -a                                    # zamontuj wszystko z fstab
df -hT /dane                                     # sprawdź system plików i miejsce
```

## 7. Usługi, cron, logi

```bash
sudo systemctl restart ssh                       # zrestartuj usługę SSH
sudo systemctl enable --now cron                 # włącz i uruchom cron
systemctl is-active cron                         # sprawdź, czy cron działa
printf '30 2 * * 1 root /sbin/reboot\n' | sudo tee /etc/cron.d/reboot-test  # dodaj osobne zadanie roota bez kasowania crontab
sudo cat /etc/cron.d/reboot-test                 # sprawdź zawartość pliku zadania roota
sudo journalctl -u ssh -n 20                     # pokaż ostatnie logi SSH
```

## 8. Samba

<!-- file: /etc/samba/smb.conf -->
```ini
# sekcja globalna
[global]
# grupa robocza
workgroup = WORKGROUP
# rola serwera
server role = standalone server
# zasób publiczny
[publiczny]
# ścieżka katalogu
path = /home/publiczny
# widoczny w sieci
browseable = yes
# zezwól zapis
read only = no
# dostęp tylko dla egzamin
valid users = egzamin
```

```bash
sudo apt install samba                           # zainstaluj Sambę
sudo useradd -m -s /bin/bash egzamin             # utwórz użytkownika linuksowego egzamin
sudo mkdir /home/publiczny                       # utwórz katalog zasobu
sudo chown egzamin:egzamin /home/publiczny       # ustaw właściciela zasobu
sudo chmod 770 /home/publiczny                   # ustaw prawa zasobu
sudo nano /etc/samba/smb.conf                    # edytuj konfigurację Samby
sudo testparm -s                                 # sprawdź konfigurację Samby
sudo smbpasswd -a egzamin                        # ustaw osobne hasło SMB
sudo systemctl restart smbd nmbd                 # zrestartuj usługi Samby
```

## 9. SSH

<!-- file: /etc/ssh/sshd_config -->
```sshconfig
# port serwera
Port 2222
# zablokuj roota
PermitRootLogin no
# zezwól hasła
PasswordAuthentication yes
# zezwól tylko administratorowi
AllowUsers administrator
```

```bash
sudo apt install openssh-server                  # zainstaluj serwer SSH
sudo nano /etc/ssh/sshd_config                   # edytuj konfigurację SSH
sudo systemctl restart ssh                       # zastosuj konfigurację SSH
ss -tln                                          # sprawdź port nasłuchu
ssh -p 2222 administrator@localhost hostname     # wykonaj testowe polecenie przez SSH
```

## 10. Skrypty

<!-- file: /home/administrator/skrypty_admina/konta.sh -->
```bash-file
#!/bin/bash                                      # interpreter bash
for i in {1..5}                                  # powtórz dla 1..5
do                                               # początek pętli
  useradd -m -d /home/${2}${i} -s /bin/bash ${1}${i}  # utwórz konto z parametrów
done                                             # koniec pętli
```

```bash
mkdir ~/skrypty_admina                           # utwórz katalog skryptów
nano ~/skrypty_admina/konta.sh                   # utwórz skrypt konta.sh
chmod 710 ~/skrypty_admina/konta.sh              # nadaj wymagane uprawnienia 710
cd ~/skrypty_admina                              # przejdź do katalogu skryptu
sudo ./konta.sh uczen 3TI                        # uruchom skrypt z parametrami uczen i 3TI
tail -5 /etc/passwd                              # sprawdź utworzone konta
```

## Najczęstsze teksty błędów

| Tekst z symulatora | Szybka naprawa |
|---|---|
| `command not found` | zainstaluj pakiet albo popraw literówkę |
| `Permission denied` | dodaj `sudo` albo popraw `chmod`/`chown` |
| `No such file or directory` | sprawdź ścieżkę przez `ls` i `pwd` |
| `invalid option` | sprawdź minus i literę opcji |
| `Incorrect indentation` | w YAML użyj spacji, nie tabulatora |
| `Syntax error on line ...` | w Apache popraw wskazany numer linii |
| `bad minute` / `errors in crontab file` | popraw pięć pól czasu cron |
| `you must specify a filesystem type` | dodaj `-t ext4` albo wpis w fstab |
| `must be superuser` | uruchom przez `sudo` |

## Jak sprawdzić przed oddaniem zrzutów

```bash
ip -br address                                   # zrzut adresów IP
ip route show                                    # zrzut bramy i tras
systemctl is-active ssh cron apache2             # zrzut stanu kluczowych usług
ls -l /home                                      # zrzut katalogów i praw
sudo crontab -l                                  # zrzut zadań cron
df -hT                                           # zrzut zamontowanych systemów plików
```

Na zrzucie musi być widoczne **polecenie i wynik**. Jeśli wynik jest długi, użyj `-br`, `-n`, `tail` albo `grep`, ale nie ukrywaj samego polecenia.
