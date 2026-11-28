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

<!-- pack-e2 -->
## Проверенные команды клиента

<!-- e2:cmd:vpnclient -->
```cmd
ipconfig /all # адреса и интерфейс VPN
ping 192.168.5.1 # проверка внутреннего ресурса
ipconfig # быстрый просмотр
```

## Проверка перед сдачей

1. Rola **Dostęp zdalny** ma usługę **DirectAccess i VPN (RAS)**.
2. RRAS został skonfigurowany i uruchomiony.
3. Na kliencie **Sieć i Internet → VPN** istnieje połączenie z poprawnym adresem serwera.
4. Po **Połącz** status jest połączony, a `ipconfig /all` pokazuje interfejs/adres VPN.
