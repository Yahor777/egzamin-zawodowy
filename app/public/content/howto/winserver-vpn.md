# Windows Server: RRAS VPN — пул адресов и подключение Windows 11

В тренажёре VPN построен «по состоянию», как на экзамене: не важно, какими кликами ты пришёл к результату, важна итоговая конфигурация сервера и клиента.

## 1. Роль на сервере

**Menedżer serwera → Dodaj role i funkcje** и установи роль **Dostęp zdalny** со службой роли **DirectAccess i VPN (RAS)**.

## 2. Мастер RRAS

Открой **Narzędzia → Routing i dostęp zdalny**, правый клик по имени сервера → **Konfiguruj i włącz routing i dostęp zdalny**. В мастере выбери:

1. **Dostęp zdalny (połączenie telefoniczne lub sieć VPN)**;
2. на странице **Sieć** — сетевой интерфейс локальной сети;
3. на странице **Przypisywanie adresów IP**:
   - **Automatycznie** — адреса выдаёт DHCP;
   - **Z określonego zakresu adresów** — статический пул.

Для статического пула задай **Początkowy adres IP** и **Końcowy adres IP** точно по заданию.

## 3. Клиент Windows 11

На клиенте открой **Ustawienia → Sieć i Internet → VPN → Dodaj połączenie VPN** и заполни:

- **Nazwa połączenia** — имя из задания;
- **Nazwa lub adres serwera** — IP-адрес VPN-сервера;
- **Typ sieci VPN** — **Automatycznie**, **PPTP** или **SSTP** по заданию;
- имя пользователя и пароль.

Затем выбери соединение и нажми **Połącz**.

## 4. Проверка

На клиенте соединение должно показывать **Połączono** и полученный адрес. На сервере в **Routing i dostęp zdalny → Klienci dostępu zdalnego** должны быть имя компьютера, пользователь, адрес из пула и протокол PPTP/SSTP.

Типовые ошибки: роль **DirectAccess i VPN (RAS)** не установлена, выбран NAT вместо доступа VPN, пул не совпадает с заданием, ошибка в адресе сервера или пароле пользователя.
