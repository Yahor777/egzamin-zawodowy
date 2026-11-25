// Russian help for the self-assessment checklist of a CKE sheet: what each criterion skill means
// and what the examiner looks at, plus which skills the simulator labs grade automatically.

/** short Russian explanation of a criterion by its skill (classification of work/curriculum/analysis/classify.py) */
export const SKILL_RU: Record<string, string> = {
  cable: 'Кабель/розетка: все 8 жил по схеме T568A или T568B (как в листе), жилы не торчат из оболочки больше 25 мм, пары не раскручены, затем тестер показывает «ОК» при экзаменаторе.',
  connect: 'Подключение устройств по схеме из приложения: каждый кабель в правильный порт (WAN, LAN, номер порта свитча).',
  ident: 'Таблица параметров ПК (серийный номер, ядра, RAM, диск, видеокарта…): значения из системы (msinfo32, dxdiag, wmic, CPU-Z, lscpu) и скриншоты в нужной папке.',
  hw_mount: 'Монтаж компонента (RAM, видеокарта, сетевая карта, диск): правильное гнездо, защёлки, питание выключено; после — ПК стартует и видит компонент.',
  bhp: 'Ход работы (BHP): инструмент по назначению, ПК выключен при монтаже, антистатика, порядок на стенде, без спешки и риска. Оценивает наблюдатель; отметь, если делал именно так.',
  spreadsheet: 'Смета (kosztorys) в таблице: нужные колонки, формулы вместо ручных чисел, цена брутто с VAT, итоги, формат валюты, сохранение под нужным именем.',
  advice: 'Письменные рекомендации пользователю (пароли, учётные записи, резервные копии): коротко и по делу, в нужном файле.',
  rt_wan: 'Роутер, WAN: статический IP, маска, шлюз и DNS как в листе (маску /29 → 255.255.255.248 и т. п.).',
  rt_lan: 'Роутер, LAN: IP и маска интерфейса LAN; после смены адреса заходи в веб-панель по новому.',
  rt_dhcp: 'Роутер, DHCP: включить или выключить, пул адресов, аренда, шлюз и DNS, как требует лист.',
  rt_reservation: 'Роутер, резервирование адреса: MAC нужной сетевой карты → нужный IP (Address Reservation), запись включена.',
  rt_wifi: 'Роутер, Wi-Fi: SSID, защита WPA2-PSK/AES (или сильнее), пароль и номер канала из листа.',
  rt_vlan_route: 'Роутер: статический маршрут или интерфейс VLAN (сеть, маска, шлюз) как в листе.',
  sw_ip: 'Свитч: IP управления, маска и шлюз; без этого веб-панель свитча недоступна.',
  sw_vlan: 'Свитч, VLAN: включить 802.1Q, создать VLAN с нужным ID, порты untagged, PVID порта = ID VLAN.',
  sw_trunk: 'Свитч: порт с тегами (tagged/trunk) для нескольких VLAN, второй конец — на роутер/сервер с VLAN-интерфейсом.',
  win_net: 'Windows, сеть: имя подключения (ncpa.cpl), IP/маска/шлюз/DNS или «автоматически», как в листе; при необходимости правило ICMP в брандмауэре.',
  wifi_client: 'Windows, беспроводной адаптер: имя, подключение к сети с нужным SSID и паролем, адрес по DHCP или статический.',
  ping: 'Проверка связи при экзаменаторе: ping нужных адресов (роутер, свитч, станция, принтер) — устройства отвечают; результат остаётся на экране.',
  hostname: 'Имя компьютера или подключения (в Linux: hostnamectl set-hostname; в Windows: sysdm.cpl / имя адаптера).',
  lx_net: 'Linux, сеть: netplan (адрес/префикс, шлюз, DNS) и sudo netplan apply; проверь ip a.',
  lx_users: 'Linux, учётки и каталоги: groupadd/useradd/passwd/usermod, каталоги в нужном месте с нужным именем.',
  lx_perms: 'Linux, права: chmod (цифры или u=rwx,g=r,o=x), chown владелец:группа; проверь ls -l.',
  lx_service: 'Linux, службы: установить/включить/перезапустить (systemctl enable --now), конфигурация сервиса (DHCP, Apache, SSH, Samba) и её проверка.',
  lx_tar: 'Linux, архив: tar -cvf / -czvf из нужных файлов в нужном каталоге; проверь tar -tf.',
  lx_script: 'Linux, скрипт .sh: #!/bin/bash, нужные команды/цикл, chmod +x, запуск с параметрами.',
  lx_disk: 'Linux, диск: fdisk (раздел), mkfs.ext4, mkdir + mount в нужную точку.',
  disk_part: 'Разметка диска (Windows: Управление дисками; Linux: fdisk) и форматирование в нужной файловой системе.',
  ad_dc: 'Windows Server: роль AD DS и повышение до контроллера домена (новый лес, имя домена, пароль DSRM).',
  ad_ou_users: 'Active Directory: подразделения (OU) и учётные записи (полное имя, логин, пароль, смена при входе).',
  ad_join: 'Компьютер-член домена: DNS на контроллер, sysdm.cpl → домен, вход доменной учёткой.',
  win_users: 'Windows: пользователи и группы (lusrmgr.msc / dsa.msc / net user), нужные права и пароли.',
  win_localpol: 'Локальная политика (gpedit.msc / secpol.msc): параметр включён/отключён так, как требует лист.',
  win_script: 'Пакетный файл .bat: нужное имя и место (рабочий стол), команды (mkdir, net user, echo…), запуск и результат.',
  gpo: 'Групповая политика (gpmc.msc): создать GPO, привязать к домену/OU, настроить параметр, проверить на клиенте (gpupdate).',
  dns: 'DNS на сервере: роль, прямая зона, записи A/CNAME, проверка nslookup.',
  ws_dhcp_role: 'Windows Server DHCP: роль, авторизация, область (диапазон, маска), опции router и DNS, активация.',
  ws_routing: 'Windows Server: роль «Dostęp zdalny» → Routing, включение маршрутизации LAN.',
  iis: 'IIS: роль «Serwer sieci Web», сайт (имя, физический путь, привязка IP:порт), документ по умолчанию, проверка в браузере; FTP, если требует лист.',
  files: 'Файлы и папки в нужном месте (C:\\…), с нужными именами и содержимым.',
  share: 'Общая папка: поделиться под нужным именем, права общего доступа, проверка \\\\сервер\\ресурс.',
  ntfs: 'Права NTFS (Безопасность): нужные группы/пользователи и уровни доступа; форматирование NTFS, метка тома.',
  quota: 'Квоты (FSRM или квоты диска): лимит, предупреждение, запрет при превышении, записи для пользователей.',
  profile: 'Профиль пользователя: общая папка profile$, путь профиля в учётной записи, права на папку.',
  printer: 'Принтер: порт TCP/IP с нужным адресом, драйвер, имя, общий доступ, параметры печати по умолчанию.',
  firewall: 'Брандмауэр (wf.msc): правило (ICMPv4, порт, программа) входящее/исходящее с нужным именем.',
  desktop_misc: 'Прочие настройки Windows/Linux (курсор, тема, шифрование атрибутами, часовой пояс…): параметры из листа, скриншот при необходимости.',
  registry: 'Реестр: экспорт ветки или запрет редактора реестра, документирование скриншотом.',
  backup: 'Копия: архив с паролем (7-Zip) или точка восстановления с нужным именем.',
  vm: 'Виртуальная машина (VirtualBox): образ ISO, ресурсы, сетевой режим (bridged/NAT) как в листе.',
  encrypt: 'Шифрование (BitLocker): диск защищён, ключ восстановления сохранён на носитель Egzamin-x.',
  UNCLASSIFIED: 'Прочая настройка из листа: сделай ровно так, как написано в формулировке.',
}

/** Skills of the criteria that the simulator labs grade automatically (so the checklist of a lab sheet skips them). */
export const SIM_SKILLS = new Set([
  'rt_wan', 'rt_lan', 'rt_dhcp', 'rt_reservation', 'rt_wifi', 'rt_vlan_route',
  'sw_ip', 'sw_vlan', 'sw_trunk',
  'win_net', 'wifi_client', 'ping', 'connect', 'hostname',
  'lx_net', 'lx_users', 'lx_perms', 'lx_service', 'lx_tar', 'lx_script', 'lx_disk',
])

/** Russian name of a result block of the grading card (Polish title as printed in the card) */
export function blockRu(title: string, sect: string): string {
  const t = title.toLowerCase()
  const kind = sect.startsWith('P') ? 'Ход работы' : ''
  const pick: [RegExp, string][] = [
    [/kosztorys/, 'Смета (kosztorys)'],
    [/harmonogram/, 'График работ'],
    [/wskazania/, 'Рекомендации пользователю'],
    [/plik wsadowy/, 'Пакетный файл .bat'],
    [/skrypt/, 'Скрипт'],
    [/okablowani|montaż|montażu|montażem|podzespo/, sect.startsWith('P') ? 'Ход работы: монтаж и кабель (BHP)' : 'Кабель, монтаж, подключение устройств'],
    [/diagnos|identyfikac|parametr/, 'Диагностика и таблица параметров'],
    [/urządzeni.*sieciow|ruter|przełącznik|router/, 'Роутер и свитч'],
    [/serwer/, 'Сервер'],
    [/stacj|zmodernizowan/, 'Рабочая станция'],
    [/interfejs/, 'Сетевые интерфейсы'],
  ]
  return pick.find(([re]) => re.test(t))?.[1] ?? (kind || title)
}
