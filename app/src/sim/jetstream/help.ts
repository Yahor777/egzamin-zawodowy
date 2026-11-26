// Short Russian explanations for the "?" / Help button on each page of the JetStream switch UI.
export const JS_HELP: Record<string, string> = {
  'sys-info':
    'System → System Info — вкладки: System Summary (сводка и картинка портов: зелёный = есть линк), Device Description, System Time, System IP. На экзамене нужна вкладка «System IP»: IP-адрес управления и Management VLAN. Заводской адрес — 192.168.0.1/24, admin/admin; DHCP-сервера у свитча нет, ПК нужен статический адрес из той же сети (например 192.168.0.10).',
  'sys-info/ip':
    'System IP: IP Address Mode = Static IP, затем IP Address (например 192.168.1.201), Subnet Mask 255.255.255.0, при необходимости Default Gateway → Apply. «Management VLAN» — в каком VLAN доступно управление свитчем (с завода 1). Создай этот VLAN заранее (VLAN → 802.1Q VLAN → Create), иначе свитч ответит ошибкой. После Apply страница по старому адресу замолчит; если ПК стоит в порту не из Management VLAN, свитч перестанет быть доступен — переткни кабель в порт этого VLAN.',
  'sys-user': 'System → User Management: единственная учётная запись admin. Edit → новый Password и Confirm Password → Apply (после смены пароль нужно ввести заново).',
  'sys-tools': 'System → System Tools: System Reboot (перезагрузка) и System Reset (сброс к заводским настройкам: 192.168.0.1, admin/admin, все порты в VLAN 1). Config Backup/Restore — файл конфигурации.',
  'sys-access': 'System → Access Security: ограничение доступа к веб-интерфейсу (HTTP, HTTPS, SSH, Telnet). На экзамене не нужно.',
  'sw-port': 'Switching → Port → Port Config: включение/выключение портов (Status), скорость и дуплекс. Отметь порты, выбери значение в верхней строке и нажми Apply. Выключенный порт не передаёт кадры.',
  'vlan-q':
    'VLAN → 802.1Q VLAN. Две вкладки.\n1) Port Config: выбери режим порта (Link Type). ACCESS — порт доступа, компьютер (при добавлении в VLAN PVID меняется сам, порт покидает остальные VLAN). GENERAL — порт можно добавить в несколько VLAN, у каждого свой Egress Rule (UNTAG/TAG), PVID не меняется сам — например порт с интернетом. TRUNK — порт к другому свитчу/роутеру, в добавленных VLAN идёт с меткой (TAG). Выбери порты → Link Type → Apply.\n2) VLAN Config → Create: VLAN ID, Description, отметь порты → Apply. В таблице: Edit — изменить состав, Detail — посмотреть.\nУправление: System → System Info → System IP → Management VLAN. Порты, которые ты поставил в другой VLAN, теряют доступ к управлению — переткнись в порт Management VLAN.',
  save: 'Save Config: сохранить текущую конфигурацию в память свитча. На реальном оборудовании без сохранения настройки пропадут после перезагрузки (в тренажёре состояние сохраняется само).',
}
