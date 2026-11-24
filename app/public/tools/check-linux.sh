#!/usr/bin/env bash
# =============================================================================
#  check-linux.sh — самопроверка Linux (Ubuntu 24.04 / openSUSE) для практики INF.02
#
#  Скрипт ТОЛЬКО ЧИТАЕТ систему и печатает отчёт на русском:
#     ✔ — есть/работает/ожидание выполнено, ✘ — нет/ожидание не выполнено, • — информация
#
#  Запуск:
#     sudo bash check-linux.sh                    # просто отчёт
#     sudo bash check-linux.sh oczekiwane.txt     # отчёт + проверка ожиданий
#     ASCII=1 sudo -E bash check-linux.sh ...     # маркеры [+] [-] [*] вместо ✔ ✘ •
#     sudo bash check-linux.sh oczekiwane.txt | tee raport.txt
#
#  Файл ожиданий — строки KEY=VALUE (пустые строки и # комментарии игнорируются):
#     HOSTNAME=serwer-5
#     IP_enp0s3=192.168.1.10/24          # адрес/префикс на интерфейсе
#     IP_enp0s8=dhcp                     # адрес получен по DHCP
#     DOWN=enp0s9                        # интерфейс выключен / без адреса
#     GW=192.168.1.1                     # шлюз по умолчанию
#     DNS=127.0.0.1                      # такой DNS-сервер настроен
#     CON=LAN K                          # соединение NetworkManager с таким именем
#     USER=uczen1                        # пользователь существует
#     USER_HOME=tester:/home/user        # домашний каталог (в passwd и существует)
#     USER_SHELL=student:/bin/sh
#     USER_UID=student:5555
#     USER_GECOS=jkowalski:Jan Kowalski
#     USER_EXPIRE=egzamin:2029-02-15     # срок действия учётной записи
#     USER_MINDAYS=kadry:4               # минимум дней между сменами пароля
#     USER_INACTIVE=administrator:2      # дней после истечения пароля до блокировки
#     GROUP=szkola
#     GROUP_GID=szkola:1111
#     MEMBER=student:szkola              # пользователь в группе
#     SUDO=asystent                      # может выполнять всё как root
#     SERVICE=isc-dhcp-server            # служба запущена (active)
#     ENABLED=ssh                        # служба включена при старте (enabled)
#     DIR=/dane                          # каталог существует
#     FILE=/home/administrator/Kopie/informatyk.tar
#     PERM=/home/zadanie:770             # права числом
#     OWNER=/home/zadanie:egzamin:root   # владелец[:группа]
#     LINK=/home/administrator/dowiazanie_dev:/dev
#     CONTAINS=/home/zadanie/dane:INF.02 # файл содержит текст
#     TAR_CONTAINS=/home/administrator/Kopie/informatyk.tar:inf02.txt
#     MOUNT=/dane                        # смонтировано
#     FSTAB=/dane                        # есть запись в /etc/fstab
#     FSTYPE=/dane:ext4
#     PORT=80                            # что-то слушает TCP-порт
#     DHCP_IFACE=enp0s8                  # INTERFACESv4 / DHCPD_INTERFACE
#     DHCP_RANGE=10.80.0.10 10.80.0.30   # строка range в dhcpd.conf
#     DHCP_OPTION=routers 10.80.0.2      # подстрока в dhcpd.conf
#     SAMBA_SHARE=dane
#     SAMBA_USER=jkowalski
#     APACHE_ROOT=/www
#     APACHE_PORT=8080
#     PKG=samba                          # пакет установлен
#     UFW=active                         # active | inactive
#     PING=192.168.1.1
# =============================================================================

set -u
LC_ALL_SAVED="${LC_ALL:-}"
export LC_ALL=C.UTF-8 2>/dev/null || true

EXPECT_FILE="${1:-}"
PASS=0
FAIL=0

if [ "${ASCII:-0}" = "1" ]; then
    M_OK='[+]'; M_BAD='[-]'; M_INFO='[*]'
else
    M_OK='✔'; M_BAD='✘'; M_INFO='•'
fi
if [ -t 1 ]; then
    C_OK=$'\e[32m'; C_BAD=$'\e[31m'; C_INFO=$'\e[0m'; C_SUB=$'\e[90m'; C_HEAD=$'\e[36m'; C_WARN=$'\e[33m'; C_END=$'\e[0m'
else
    C_OK=''; C_BAD=''; C_INFO=''; C_SUB=''; C_HEAD=''; C_WARN=''; C_END=''
fi

section() { printf '\n%s=== %s ===%s\n' "$C_HEAD" "$1" "$C_END"; }
info()    { printf '  %s%s %s%s\n' "$C_INFO" "$M_INFO" "$1" "$C_END"; }
warn()    { printf '  %s%s %s%s\n' "$C_WARN" "$M_INFO" "$1" "$C_END"; }
ok()      { printf '  %s%s %s%s\n' "$C_OK" "$M_OK" "$1" "$C_END"; }
bad()     { printf '  %s%s %s%s\n' "$C_BAD" "$M_BAD" "$1" "$C_END"; }
sub()     { printf '      %s%s%s\n' "$C_SUB" "$1" "$C_END"; }
state()   { if [ "$1" -eq 0 ]; then ok "$2"; else bad "$2"; fi; }
have()    { command -v "$1" >/dev/null 2>&1; }

# expect <0|1 (0 = выполнено)> <описание> [фактическое значение]
expect() {
    if [ "$1" -eq 0 ]; then
        PASS=$((PASS + 1))
        printf '  %s%s [ожидание] %s%s\n' "$C_OK" "$M_OK" "$2" "$C_END"
    else
        FAIL=$((FAIL + 1))
        if [ -n "${3:-}" ]; then
            printf '  %s%s [ожидание] %s  — сейчас: %s%s\n' "$C_BAD" "$M_BAD" "$2" "$3" "$C_END"
        else
            printf '  %s%s [ожидание] %s%s\n' "$C_BAD" "$M_BAD" "$2" "$C_END"
        fi
    fi
}

indent() { sed 's/^/      /'; }
strip_zeros() { local v="$1"; while [ "${#v}" -gt 1 ] && [ "${v#0}" != "$v" ]; do v="${v#0}"; done; printf '%s' "$v"; }

DHCP_CONF=""
for f in /etc/dhcp/dhcpd.conf /etc/dhcpd.conf; do [ -f "$f" ] && { DHCP_CONF="$f"; break; }; done

# -----------------------------------------------------------------------------
printf '%sСамопроверка INF.02 — %s — %s%s\n' "$C_HEAD" "$(hostname)" "$(date '+%Y-%m-%d %H:%M')" "$C_END"
if [ "$(id -u)" -ne 0 ]; then
    warn "Скрипт запущен БЕЗ sudo — часть данных (shadow, sudoers, dhcpd.leases) недоступна. Запусти: sudo bash $0 ${EXPECT_FILE}"
fi
if [ -n "$EXPECT_FILE" ] && [ ! -r "$EXPECT_FILE" ]; then
    bad "Файл ожиданий не найден/не читается: $EXPECT_FILE"
    EXPECT_FILE=""
fi

# =============================================================================
section "Система"
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    info "ОС: ${PRETTY_NAME:-?}"
fi
info "Имя хоста: $(hostname)   (hostnamectl: $(hostnamectl --static 2>/dev/null || echo '?'))"
info "Ядро: $(uname -r)"
if have lscpu; then info "CPU: $(lscpu | sed -n 's/^Model name:[[:space:]]*//p' | head -n1), ядер всего: $(nproc)"; fi
info "RAM: $(free -h | awk '/^Mem:/{print $2}')"
info "Часовой пояс: $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo '?')"

# =============================================================================
section "Сеть: интерфейсы, адреса, маршруты, DNS"
for dev in $(ls /sys/class/net); do
    [ "$dev" = "lo" ] && continue
    st=$(cat "/sys/class/net/$dev/operstate" 2>/dev/null)
    mac=$(cat "/sys/class/net/$dev/address" 2>/dev/null)
    addrs=$(ip -4 -o addr show dev "$dev" 2>/dev/null | awk '{a=$4; if ($0 ~ /dynamic/) a=a" (DHCP)"; printf "%s ", a}')
    line="$dev [$st] MAC $mac  IPv4: ${addrs:-—}"
    if [ "$st" = "up" ]; then ok "$line"; else info "$line"; fi
done
defgw=$(ip -4 route show default 2>/dev/null | awk '{print $3" ("$5")"}' | paste -sd' ' -)
info "Brama domyślna: ${defgw:-brak}"
ip -4 route 2>/dev/null | indent
if have resolvectl; then
    dnsinfo=$(resolvectl dns 2>/dev/null | grep -v '^Global: *$' | paste -sd';' -)
    info "DNS (resolvectl): ${dnsinfo:-brak}"
fi
info "/etc/resolv.conf: $(grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | paste -sd' ' -)"
if have nmcli && nmcli -t -f RUNNING general 2>/dev/null | grep -q running; then
    info "Соединения NetworkManager (NAME:DEVICE:TYPE):"
    nmcli -t -f NAME,DEVICE,TYPE con show 2>/dev/null | indent
fi

# =============================================================================
section "Файлы конфигурации сети"
found=0
for f in /etc/netplan/*.yaml /etc/netplan/*.yml; do
    [ -f "$f" ] || continue
    found=1
    info "$f  (права $(stat -c '%a' "$f"))"
    grep -v '^[[:space:]]*#' "$f" | grep -v '^[[:space:]]*$' | indent
done
for f in /etc/sysconfig/network/ifcfg-*; do
    [ -f "$f" ] || continue
    case "$f" in *ifcfg-lo) continue ;; esac
    found=1
    info "$f"
    grep -v '^[[:space:]]*#' "$f" | grep -v '^[[:space:]]*$' | indent
done
if [ -f /etc/sysconfig/network/routes ]; then info "/etc/sysconfig/network/routes:"; indent < /etc/sysconfig/network/routes; fi
[ "$found" -eq 0 ] && info "Нет файлов netplan/ifcfg (сеть, вероятно, через NetworkManager — см. nmcli выше)."

# =============================================================================
section "Службы"
svc_found=0
for s in isc-dhcp-server dhcpd apache2 httpd smbd nmbd smb nmb ssh sshd named bind9 vsftpd ufw firewalld; do
    ena=$(systemctl is-enabled "$s" 2>/dev/null)
    case "$ena" in ''|not-found) continue ;; esac
    svc_found=1
    act=$(systemctl is-active "$s" 2>/dev/null)
    [ "$s" = "ssh" ] && [ "$(systemctl is-enabled ssh.socket 2>/dev/null)" = "enabled" ] && ena="$ena (ssh.socket: enabled)"
    if [ "$act" = "active" ]; then ok "$s: $act, автозапуск: $ena"; else bad "$s: $act, автозапуск: $ena"; fi
done
[ "$svc_found" -eq 0 ] && info "Ни одна из типичных служб (DHCP, Apache, Samba, SSH, DNS, FTP) не установлена."
if have ss; then
    info "Слушающие TCP-порты: $(ss -Hltn 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | paste -sd' ' -)"
fi

# =============================================================================
section "DHCP-сервер (isc-dhcp-server / dhcpd)"
if [ -f /etc/default/isc-dhcp-server ]; then
    info "/etc/default/isc-dhcp-server: $(grep -E '^[[:space:]]*INTERFACES' /etc/default/isc-dhcp-server | paste -sd' ' -)"
fi
if [ -f /etc/sysconfig/dhcpd ]; then
    info "/etc/sysconfig/dhcpd: $(grep -E '^[[:space:]]*DHCPD_INTERFACE' /etc/sysconfig/dhcpd)"
fi
if [ -n "$DHCP_CONF" ]; then
    info "$DHCP_CONF (без комментариев):"
    sed 's/#.*//' "$DHCP_CONF" | grep -v '^[[:space:]]*$' | indent
    if have dhcpd; then
        if dhcpd -t -cf "$DHCP_CONF" >/dev/null 2>&1; then ok "Синтаксис dhcpd.conf OK (dhcpd -t)"; else bad "Ошибка синтаксиса: sudo dhcpd -t -cf $DHCP_CONF"; fi
    fi
    for lf in /var/lib/dhcp/dhcpd.leases /var/lib/dhcp/db/dhcpd.leases; do
        [ -r "$lf" ] && info "Выданные аренды ($lf): $(grep -c '^lease' "$lf")"
    done
else
    info "dhcpd.conf не найден — DHCP-сервер не настроен."
fi

# =============================================================================
section "Apache / Samba"
APACHE_TXT=""
for d in /etc/apache2 /etc/httpd; do
    [ -d "$d" ] || continue
    APACHE_TXT=$(grep -rhsE '^[[:space:]]*(DocumentRoot|Listen|<VirtualHost)' "$d/sites-enabled" "$d/ports.conf" "$d/listen.conf" "$d/default-server.conf" "$d/conf/httpd.conf" "$d/vhosts.d" 2>/dev/null | sed 's/^[[:space:]]*//' | sort -u)
    info "Apache ($d):"
    printf '%s\n' "$APACHE_TXT" | indent
    if [ -f "$d/envvars" ]; then info "Пользователь/группа: $(grep -E 'APACHE_RUN_(USER|GROUP)=' "$d/envvars" | sed 's/export //' | paste -sd' ' -)"; fi
    if [ -f "$d/uid.conf" ]; then info "Пользователь/группа: $(grep -vE '^[[:space:]]*#' "$d/uid.conf" | paste -sd' ' -)"; fi
done
[ -z "$APACHE_TXT" ] && info "Apache не найден."
if [ -f /etc/samba/smb.conf ]; then
    info "Samba — разделы smb.conf:"
    if have testparm; then
        testparm -s 2>/dev/null | grep -E '^\[|path|valid users|read only|writ|browseable' | indent
    else
        grep -E '^\[|path|valid users|read only|writ' /etc/samba/smb.conf | indent
    fi
    if have pdbedit && [ "$(id -u)" -eq 0 ]; then info "Пользователи Samba: $(pdbedit -L 2>/dev/null | cut -d: -f1 | paste -sd' ' -)"; fi
else
    info "Samba не настроена (/etc/samba/smb.conf нет)."
fi

# =============================================================================
section "Пользователи (UID 1000–59999) и группы"
while IFS=: read -r name _ uid gid gecos home shell; do
    [ "$uid" -ge 1000 ] 2>/dev/null || continue
    [ "$uid" -ge 60000 ] && continue
    hd="есть"; [ -d "$home" ] || hd="НЕТ"
    exp=""
    if [ -r /etc/shadow ]; then
        sh_line=$(grep "^${name}:" /etc/shadow)
        e_days=$(printf '%s' "$sh_line" | cut -d: -f8)
        mn=$(printf '%s' "$sh_line" | cut -d: -f4)
        ina=$(printf '%s' "$sh_line" | cut -d: -f7)
        pw=$(printf '%s' "$sh_line" | cut -d: -f2)
        [ -n "$e_days" ] && exp=" срок_учётки=$(date -u -d "@$((e_days * 86400))" +%F)"
        [ -n "$mn" ] && [ "$mn" != "0" ] && exp="$exp мин_дней=$mn"
        [ -n "$ina" ] && exp="$exp неактивность=$ina"
        case "$pw" in '!'*|'*'*|'') exp="$exp пароль=НЕ_ЗАДАН/заблокирован" ;; esac
    fi
    info "$name uid=$uid gid=$gid «$gecos» home=$home($hd) shell=$shell"
    sub "группы: $(id -nG "$name" 2>/dev/null)${exp}"
done < <(getent passwd)
info "Группы с GID 1000–59999 (имя:GID:члены):"
getent group | awk -F: '$3>=1000 && $3<60000 {print $1":"$3":"$4}' | indent
for g in sudo wheel admin; do
    getent group "$g" >/dev/null 2>&1 && info "Группа $g (права root через sudo): $(getent group "$g" | cut -d: -f4)"
done
if [ -r /etc/sudoers ]; then
    extra=$(grep -hvE '^[[:space:]]*(#|$|Defaults)' /etc/sudoers /etc/sudoers.d/* 2>/dev/null | grep -v '^@includedir')
    [ -n "$extra" ] && { info "Правила sudoers:"; printf '%s\n' "$extra" | indent; }
fi

# =============================================================================
section "Права в /home и нестандартные каталоги в /"
for p in /home/* /home/*/*; do
    [ -e "$p" ] || continue
    case "$(basename "$p")" in snap) continue ;; esac
    sub "$(stat -c '%A %a %U:%G' "$p")  $p$( [ -L "$p" ] && printf ' -> %s' "$(readlink "$p")")"
done
std=" bin boot cdrom dev etc home lib lib32 lib64 libx32 lost+found media mnt opt proc root run sbin snap srv swap.img sys tmp usr var "
for p in /*; do
    b=$(basename "$p")
    case "$std" in *" $b "*) continue ;; esac
    sub "$(stat -c '%A %a %U:%G' "$p")  $p"
done

# =============================================================================
section "Недавние скрипты и архивы (последние 14 дней)"
cnt=0
while IFS= read -r f; do
    cnt=$((cnt + 1))
    [ "$cnt" -gt 10 ] && break
    info "$(stat -c '%a %U:%G' "$f")  $f"
    head -n 15 "$f" | indent
done < <(find /home /root /usr/local/bin -xdev -maxdepth 4 -type f -not -path '*/.*' \( -name '*.sh' -o -name '*.bash' \) -mtime -14 2>/dev/null)
[ "$cnt" -eq 0 ] && info "Скриптов *.sh не найдено."
while IFS= read -r f; do
    info "Архив: $f"
    case "$f" in
        *.zip) have unzip && unzip -l "$f" 2>/dev/null | head -n 12 | indent ;;
        *) tar -tvf "$f" 2>/dev/null | head -n 10 | indent ;;
    esac
done < <(find /home /root -xdev -maxdepth 4 -type f \( -name '*.tar' -o -name '*.tar.gz' -o -name '*.tgz' -o -name '*.tar.bz2' -o -name '*.tar.xz' -o -name '*.zip' \) -mtime -14 2>/dev/null | head -n 10)

# =============================================================================
section "Диски, монтирование, fstab"
if have lsblk; then lsblk -e7 -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT 2>/dev/null | indent; fi
info "Смонтированные ФС (без системных):"
findmnt -rn -o TARGET,SOURCE,FSTYPE 2>/dev/null | grep -vE '^/(proc|sys|dev|run|snap|boot/efi)|^/ |^/sys|^/proc|tmpfs|squashfs|cgroup|overlay' | indent
info "/etc/fstab:"
grep -vE '^[[:space:]]*(#|$)' /etc/fstab 2>/dev/null | indent

# =============================================================================
section "Брандмауэр"
if have ufw; then
    ufw_state=$(ufw status 2>/dev/null | head -n1)
    info "ufw: ${ufw_state:-нет данных (нужен sudo)}"
    ufw status verbose 2>/dev/null | sed -n '2,30p' | indent
fi
if have firewall-cmd; then
    info "firewalld: $(firewall-cmd --state 2>&1)"
    firewall-cmd --list-all 2>/dev/null | indent
fi
have ufw || have firewall-cmd || info "Ни ufw, ни firewalld не найдены."

# =============================================================================
#  Проверка ожиданий
# =============================================================================
if [ -n "$EXPECT_FILE" ]; then
    section "Проверка ожиданий: $EXPECT_FILE"
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        case "$line" in ''|'#'*) continue ;; esac
        case "$line" in *=*) ;; *) warn "Пропущена строка без '=': $line"; continue ;; esac
        key="${line%%=*}"; val="${line#*=}"
        key="$(printf '%s' "$key" | tr -d '[:space:]')"
        val="${val%%[[:space:]]#*}"
        val="$(printf '%s' "$val" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
        case "$key" in
            HOSTNAME)
                h=$(hostname)
                [ "${h,,}" = "${val,,}" ]; expect $? "имя хоста = $val" "$h" ;;
            IP_*)
                dev="${key#IP_}"
                if [ ! -e "/sys/class/net/$dev" ]; then expect 1 "интерфейс $dev существует" "$(ls /sys/class/net | paste -sd' ' -)"; continue; fi
                cur=$(ip -4 -o addr show dev "$dev" 2>/dev/null)
                if [ "${val,,}" = "dhcp" ]; then
                    printf '%s' "$cur" | grep -q 'dynamic'; expect $? "$dev: адрес по DHCP" "$(printf '%s' "$cur" | awk '{print $4}')"
                else
                    printf '%s\n' "$cur" | awk '{print $4}' | grep -qxF "$val"; expect $? "$dev: IP $val" "$(printf '%s\n' "$cur" | awk '{print $4}' | paste -sd' ' -)"
                fi ;;
            DOWN)
                cur=$(ip -4 -o addr show dev "$val" 2>/dev/null | awk '{print $4}')
                st=$(cat "/sys/class/net/$val/operstate" 2>/dev/null)
                { [ -z "$cur" ] || [ "$st" = "down" ]; }; expect $? "$val выключен/без адреса" "$st ${cur}" ;;
            GW)
                ip -4 route show default | awk '{print $3}' | grep -qxF "$val"; expect $? "шлюз по умолчанию $val" "$(ip -4 route show default | awk '{print $3}' | paste -sd' ' -)" ;;
            DNS)
                alldns="$( (resolvectl dns 2>/dev/null; grep -E '^nameserver' /etc/resolv.conf 2>/dev/null) | tr ' ' '\n')"
                [ "$val" = "localhost" ] && val="127.0.0.1"
                printf '%s\n' "$alldns" | grep -qxF "$val"; expect $? "DNS-сервер $val" "$(printf '%s\n' "$alldns" | grep -E '^[0-9a-f:.]+$' | sort -u | paste -sd' ' -)" ;;
            CON)
                nmcli -t -f NAME con show 2>/dev/null | grep -qxF "$val"; expect $? "соединение NetworkManager «$val»" "$(nmcli -t -f NAME con show 2>/dev/null | paste -sd',' -)" ;;
            USER)
                getent passwd "$val" >/dev/null; expect $? "пользователь $val существует" ;;
            USER_HOME)
                u="${val%%:*}"; v="${val#*:}"; h=$(getent passwd "$u" | cut -d: -f6)
                { [ "$h" = "$v" ] && [ -d "$v" ]; }; expect $? "$u: домашний каталог $v (существует)" "$h" ;;
            USER_SHELL)
                u="${val%%:*}"; v="${val#*:}"; s=$(getent passwd "$u" | cut -d: -f7)
                [ "$s" = "$v" ]; expect $? "$u: shell $v" "$s" ;;
            USER_UID)
                u="${val%%:*}"; v="${val#*:}"; s=$(getent passwd "$u" | cut -d: -f3)
                [ "$s" = "$v" ]; expect $? "$u: UID $v" "$s" ;;
            USER_GECOS)
                u="${val%%:*}"; v="${val#*:}"; s=$(getent passwd "$u" | cut -d: -f5 | cut -d, -f1)
                [ "$s" = "$v" ]; expect $? "$u: opis «$v»" "$s" ;;
            USER_EXPIRE|USER_MINDAYS|USER_INACTIVE)
                u="${val%%:*}"; v="${val#*:}"
                if [ ! -r /etc/shadow ]; then expect 1 "$key $u (нужен sudo для /etc/shadow)"; continue; fi
                sl=$(grep "^${u}:" /etc/shadow)
                case "$key" in
                    USER_EXPIRE)  d=$(printf '%s' "$sl" | cut -d: -f8); s=""; [ -n "$d" ] && s=$(date -u -d "@$((d * 86400))" +%F)
                                  [ "$s" = "$v" ]; expect $? "$u: konto wygasa $v" "${s:-nigdy}" ;;
                    USER_MINDAYS) s=$(printf '%s' "$sl" | cut -d: -f4); [ "$s" = "$v" ]; expect $? "$u: min. dni między zmianami hasła $v" "$s" ;;
                    USER_INACTIVE) s=$(printf '%s' "$sl" | cut -d: -f7); [ "$s" = "$v" ]; expect $? "$u: dni nieaktywności po wygaśnięciu hasła $v" "$s" ;;
                esac ;;
            GROUP)
                getent group "$val" >/dev/null; expect $? "группа $val существует" ;;
            GROUP_GID)
                g="${val%%:*}"; v="${val#*:}"; s=$(getent group "$g" | cut -d: -f3)
                [ "$s" = "$v" ]; expect $? "группа $g: GID $v" "$s" ;;
            MEMBER)
                u="${val%%:*}"; g="${val#*:}"
                id -nG "$u" 2>/dev/null | tr ' ' '\n' | grep -qxF "$g"; expect $? "$u в группе $g" "$(id -nG "$u" 2>/dev/null)" ;;
            SUDO)
                r=1
                for g in sudo wheel admin; do id -nG "$val" 2>/dev/null | tr ' ' '\n' | grep -qxF "$g" && r=0; done
                [ "$r" -ne 0 ] && sudo -l -U "$val" 2>/dev/null | grep -qE '\(ALL( : ALL)?\) ALL|\(ALL\) ALL' && r=0
                expect "$r" "$val может выполнять команды как root (sudo)" "$(id -nG "$val" 2>/dev/null)" ;;
            SERVICE)
                s=$(systemctl is-active "$val" 2>/dev/null); [ "$s" = "active" ]; expect $? "служба $val запущена" "$s" ;;
            ENABLED)
                s=$(systemctl is-enabled "$val" 2>/dev/null); case "$s" in enabled|alias|static|indirect) r=0 ;; *) r=1 ;; esac
                [ "$val" = "ssh" ] && [ "$r" -ne 0 ] && [ "$(systemctl is-enabled ssh.socket 2>/dev/null)" = "enabled" ] && r=0
                expect "$r" "служба $val включена при старте" "$s" ;;
            DIR)
                [ -d "$val" ]; expect $? "каталог $val существует" ;;
            FILE)
                [ -f "$val" ]; expect $? "файл $val существует" ;;
            PERM)
                p="${val%:*}"; m="$(strip_zeros "${val##*:}")"
                if [ -e "$p" ]; then s=$(stat -c '%a' "$p"); [ "$(strip_zeros "$s")" = "$m" ]; expect $? "права $p = $m" "$s"
                else expect 1 "права $p = $m" "нет такого пути"; fi ;;
            OWNER)
                p="${val%%:*}"; rest="${val#*:}"; u="${rest%%:*}"; g=""
                [ "$rest" != "$u" ] && g="${rest#*:}"
                if [ -e "$p" ]; then
                    su_=$(stat -c '%U' "$p"); sg_=$(stat -c '%G' "$p")
                    { [ "$su_" = "$u" ] && { [ -z "$g" ] || [ "$sg_" = "$g" ]; }; }; expect $? "владелец $p = $u${g:+:$g}" "$su_:$sg_"
                else expect 1 "владелец $p" "нет такого пути"; fi ;;
            LINK)
                p="${val%%:*}"; t="${val#*:}"
                { [ -L "$p" ] && [ "$(readlink "$p")" = "$t" ]; }; expect $? "dowiązanie $p -> $t" "$(readlink "$p" 2>/dev/null)" ;;
            CONTAINS)
                p="${val%%:*}"; t="${val#*:}"
                grep -qF -- "$t" "$p" 2>/dev/null; expect $? "$p zawiera «$t»" ;;
            TAR_CONTAINS)
                p="${val%%:*}"; t="${val#*:}"
                tar -tf "$p" 2>/dev/null | grep -qE "(^|/)$(printf '%s' "$t" | sed 's/[.[\*^$]/\\&/g')$"; expect $? "archiwum $p zawiera $t" "$(tar -tf "$p" 2>/dev/null | paste -sd' ' -)" ;;
            MOUNT)
                findmnt -rn "$val" >/dev/null 2>&1; expect $? "$val zamontowany" "$(findmnt -rn -o SOURCE "$val" 2>/dev/null)" ;;
            FSTAB)
                awk -v m="$val" '$1 !~ /^#/ && $2 == m {f=1} END {exit !f}' /etc/fstab; expect $? "wpis w /etc/fstab dla $val" ;;
            FSTYPE)
                p="${val%%:*}"; t="${val#*:}"; s=$(findmnt -rn -o FSTYPE "$p" 2>/dev/null)
                [ "$s" = "$t" ]; expect $? "$p ma system plików $t" "${s:-nie zamontowany}" ;;
            PORT)
                ss -Hltn 2>/dev/null | awk '{print $4}' | sed 's/.*://' | grep -qxF "$val"; expect $? "nasłuch na porcie TCP $val" ;;
            DHCP_IFACE)
                s=$(grep -hE '^[[:space:]]*(INTERFACESv4|DHCPD_INTERFACE)=' /etc/default/isc-dhcp-server /etc/sysconfig/dhcpd 2>/dev/null | head -n1)
                printf '%s' "$s" | grep -qw -- "$val"; expect $? "DHCP nasłuchuje na $val" "$s" ;;
            DHCP_RANGE)
                read -r a b <<< "$val"
                [ -n "$DHCP_CONF" ] && sed 's/#.*//' "$DHCP_CONF" | grep -qE "range[[:space:]]+(dynamic-bootp[[:space:]]+)?${a//./\\.}[[:space:]]+${b//./\\.}[[:space:]]*;"
                expect $? "range $a $b w dhcpd.conf" "$( [ -n "$DHCP_CONF" ] && sed 's/#.*//' "$DHCP_CONF" | grep -E 'range' | paste -sd' ' -)" ;;
            DHCP_OPTION)
                [ -n "$DHCP_CONF" ] && sed 's/#.*//' "$DHCP_CONF" | grep -qF -- "$val"; expect $? "dhcpd.conf zawiera «$val»" ;;
            SAMBA_SHARE)
                if have testparm; then testparm -s 2>/dev/null | grep -qxF "[$val]"; else grep -qF "[$val]" /etc/samba/smb.conf 2>/dev/null; fi
                expect $? "udział Samba [$val]" ;;
            SAMBA_USER)
                pdbedit -L 2>/dev/null | cut -d: -f1 | grep -qxF "$val"; expect $? "użytkownik Samba $val (smbpasswd -a)" ;;
            APACHE_ROOT)
                printf '%s\n' "$APACHE_TXT" | grep -qE "DocumentRoot[[:space:]]+\"?${val}/?\"?$"; expect $? "Apache DocumentRoot $val" "$(printf '%s\n' "$APACHE_TXT" | grep DocumentRoot | paste -sd' ' -)" ;;
            APACHE_PORT)
                printf '%s\n' "$APACHE_TXT" | grep -qE "^Listen[[:space:]]+([0-9.]+:)?${val}\$"; expect $? "Apache Listen $val" "$(printf '%s\n' "$APACHE_TXT" | grep Listen | paste -sd' ' -)" ;;
            PKG)
                if have dpkg-query; then dpkg-query -W -f='${Status}' "$val" 2>/dev/null | grep -q 'install ok installed'
                else rpm -q "$val" >/dev/null 2>&1; fi
                expect $? "pakiet $val zainstalowany" ;;
            UFW)
                s=$(ufw status 2>/dev/null | head -n1 | awk '{print $2}'); [ "${s,,}" = "${val,,}" ]; expect $? "ufw $val" "$s" ;;
            PING)
                ping -c 2 -W 2 "$val" >/dev/null 2>&1; expect $? "ping $val odpowiada" ;;
            *)
                warn "Неизвестный ключ: $key" ;;
        esac
    done < "$EXPECT_FILE"
fi

# =============================================================================
section "ИТОГ"
if [ -n "$EXPECT_FILE" ]; then
    total=$((PASS + FAIL))
    pct=0
    [ "$total" -gt 0 ] && pct=$((100 * PASS / total))
    if [ "$pct" -ge 75 ]; then
        ok "Ожиданий выполнено: $PASS из $total ($pct %). Порог экзамена — 75 %."
    else
        bad "Ожиданий выполнено: $PASS из $total ($pct %). Порог экзамена — 75 %."
    fi
    [ "$FAIL" -gt 0 ] && warn "Ищи строки с $M_BAD [ожидание] выше."
else
    info "Отчёт готов. Для автоматической проверки: sudo bash $0 oczekiwane.txt"
fi
[ -n "$LC_ALL_SAVED" ] && export LC_ALL="$LC_ALL_SAVED"
exit 0
