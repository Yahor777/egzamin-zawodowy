// Short Russian explanations for the "?" button on each DrayTek page (what it does, what CKE asks).
export const DT_HELP: Record<string, string> = {
  dashboard:
    'Главная страница: схема портов (WAN1, P1–P5), версия прошивки, адреса LAN1–LAN8 и состояние WAN. Нажми на порт WAN1 (или на ссылку WAN1) — откроются настройки внешнего адреса. Сюда смотрят, чтобы проверить, что настройки применились.',
  online: 'Online Status → Physical Connection: текущие LAN- и WAN-адреса, режим WAN, DNS. Только просмотр.',
  'wan-general':
    'WAN → General Setup: включение WAN-интерфейсов. Если снять галку Enable у WAN2 и перезагрузить роутер, порт «WAN2 / P6» начинает работать как LAN-порт P6 (нужно для листа с VLAN на 6 портах).',
  'wan-internet': 'WAN → Internet Access: список WAN и способ подключения. «Details Page» открывает настройки WAN1.',
  'wan-detail':
    'WAN1: вкладка «Static or Dynamic IP» — либо «Obtain an IP address automatically» (DHCP от провайдера), либо «Specify an IP address» (IP, маска, шлюз) и DNS (Primary/Secondary) — как в задании, например 172.16.110.201/24, шлюз 172.16.110.2, DNS 8.8.8.8 и 8.8.4.4. Вкладка PPPoE — логин и пароль провайдера. После OK роутер просит перезагрузиться.',
  'lan-general':
    'LAN → General Setup: список сетей LAN1–LAN8. «Details Page» у LAN1 — адрес самого роутера (он же шлюз) и DHCP-сервер. Частое задание: IP 172.16.111.10/24; DHCP: Start IP Address 172.16.111.11, IP Pool Counts 100 (сколько адресов в пуле, а не «конец пула»), Gateway 172.16.111.10, Lease Time 86400 с (24 ч), DNS 172.16.111.10. LAN2…LAN8 включаются радиокнопкой Enable на своей странице и нужны для VLAN в разных подсетях.',
  'lan-vlan':
    'LAN → VLAN: отметь Enable. Строка VLANx = группа: какие порты (P1–P6) в ней и в какую подсеть (LAN1–LAN8) она ведёт. Без метки (Tag) — порты доступа: компьютер в порту получает адрес от DHCP своей подсети. С Enable в «VLAN Tag» и VID — порты отправляют кадры с меткой (trunk к свитчу): VID должен совпадать с ID VLAN на свитче. «Permit untagged device in P1…» — к P1 можно подключить обычный ПК и попасть в сеть роутера (LAN1). Каждый VID уникален. P6 доступен после отключения WAN2.',
  'lan-bind':
    'LAN → Bind IP to MAC = резервация адреса (как «Address Reservation» у TP-Link). Включи Enable, дважды щёлкни хост в ARP Table (IP и MAC подставятся), впиши нужный IP (из подсети LAN), нажми Add и затем OK внизу. Хост получит этот адрес при следующем обновлении DHCP (ipconfig /renew).',
  'routing-static':
    'Routing → Static Route: статический маршрут. Нажми номер строки (Index) → Enable, Destination IP Address (адрес СЕТИ, например 10.10.0.0), Subnet Mask, Gateway IP Address (следующий роутер) → OK. Применяется, когда в задании нужно достучаться до сети за другим роутером.',
  'nat-redirect':
    'NAT → Port Redirection = проброс портов: запросы на Public Port (из WAN) уходят на Private IP и Private Port в LAN. Нажми номер строки → Service Name, Protocol (TCP), Public Port, Private IP, Private Port, Enable → OK. Пример: порт 80 → 192.168.1.10:80.',
  'wl24-general':
    'Wireless LAN (2.4 GHz) → General Setup: Enable Wireless LAN, режим и канал, список SSID (до 4 сетей на диапазон). Для каждой: имя в колонке SSID, Enable (для SSID2–4), Hide SSID = скрытая сеть. После OK открой Security и задай пароль.',
  'wl24-security':
    'Wireless LAN (2.4 GHz) → Security: вкладки SSID 1–4, у каждого свой Mode: Disable = открытая сеть; WPA2/PSK + Pre-Shared Key (8–63 символа) — то, что просят на экзамене. Настрой каждую вкладку отдельно, потом OK (вкладки SSID 2–4 нужно настроить вручную).',
  'wl5-general': 'Wireless LAN (5 GHz) → General Setup: то же, что для 2.4 GHz, но для диапазона 5 GHz (режим и каналы другие).',
  'wl5-security': 'Wireless LAN (5 GHz) → Security: как для 2.4 GHz — WPA2/PSK и пароль для каждого SSID.',
  'sys-status': 'System Maintenance → System Status: модель, версия прошивки, MAC, адреса. Только просмотр.',
  'sys-password': 'System Maintenance → Administrator Password: старый пароль (по умолчанию admin), новый пароль дважды → OK. После смены нужно войти заново.',
  'sys-backup': 'System Maintenance → Configuration Backup: сохранить конфигурацию в файл (Backup) или загрузить из файла (Restore). Для заводских настроек используй Reboot System → Using factory default configuration.',
  'sys-reboot':
    'System Maintenance → Reboot System: «Using current configuration» — обычная перезагрузка; «Using factory default configuration» — сброс на заводские настройки (192.168.1.1, admin/admin). На занятиях по DrayTek каждое занятие начинается со сброса: выбери factory default → Reboot Now.',
  'diag-routing': 'Diagnostics → Routing Table: таблица маршрутов (подключённые сети C, статические S).',
  'diag-arp': 'Diagnostics → ARP Cache Table: какие IP и MAC роутер видит в сети. Отсюда удобно взять MAC для Bind IP to MAC.',
  'diag-dhcp': 'Diagnostics → DHCP Table: кому роутер выдал адреса (IP, MAC, время аренды, имя).',
  'diag-ping': 'Diagnostics → Ping Diagnosis: проверка связи с самого роутера. Впиши IP → Run. Reply = есть связь, Request timed out = нет.',
}
