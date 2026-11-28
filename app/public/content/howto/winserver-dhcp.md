# Windows Server: DHCP — роль, авторизация, область, клиент

Сервер раздаёт адреса только когда выполнены **все** условия: статический IP у сервера, роль установлена, настройка после установки завершена (авторизация), область создана и **активна**, а адрес сервера лежит **в той же подсети**, что и область. Нарушишь одно — клиент останется на 169.254.x.x (APIPA).

## 1. Порядок шагов

1. **Статический адрес сервера**: `ncpa.cpl` → *Ethernet* → *Właściwości* → *IPv4* → адрес, маска; DNS — `127.0.0.1` (или свой IP). Роль DHCP не ставят на динамическом адресе.
2. **Роль**: *Menedżer serwera* → *Zarządzaj* → *Dodaj role i funkcje* → *Serwer DHCP* → *Dodaj funkcje* → *Zainstaluj*.
3. **Пост-конфигурация**: жёлтый флажок ⚑ → *Dokończ konfigurację funkcji DHCP* → *Zatwierdź* (создаёт группы и авторизует сервер).
4. **Область**: `dhcpmgmt.msc` → *IPv4* → ПКМ → *Nowy zakres…*:
   - имя, **начальный и конечный адрес**, длина маски;
   - *Dodawanie wykluczeń* — адреса, которые сервер **не** выдаёт (например, адреса принтеров);
   - *Czas trwania dzierżawy* (по умолчанию 8 дней);
   - «Tak, chcę teraz skonfigurować te opcje» → **router** (brama), **DNS**, имя домена;
   - *Aktywuj ten zakres teraz*.
5. **Zastrzeżenie** (по MAC): *Zakres* → *Zastrzeżenia* → *Nowe zastrzeżenie…* — имя, IP, MAC (с дефисами/без), описание.

## 2. Проверка на клиенте

```
ipconfig /release
ipconfig /renew
ipconfig /all
```

В `ipconfig /all` смотри: **DHCP włączone: Tak**, **Serwer DHCP** = адрес сервера, **Brama domyślna** и **Serwery DNS** = опции области, **Dzierżawa uzyskana / wygasa**.

В консоли: `dhcpmgmt.msc` → *Zakres* → **Dzierżawy adresów** — список выданных адресов (имя компьютера, срок).

## 3. Если клиент не получил адрес

| Симптом | Причина |
|---|---|
| 169.254.x.x | область не активна / сервер не авторизован / кабель, питание |
| В консоли «[nie autoryzowany]» | не сделано *Dokończ konfigurację funkcji DHCP* |
| Адрес не из того диапазона | сервер отвечает в подсети своего адаптера: проверь IP сервера |
| Выдаётся не первый адрес пула | первые адреса в *wykluczeniach* или уже заняты |
| Нет шлюза / DNS | не заданы *Opcje zakresu* (003 Router, 006 DNS Servers) |

**Брандмауэр сервера** по умолчанию не отвечает на ping — для проверки включи правило «Udostępnianie plików i drukarek (Żądanie echa — ICMPv4)» в `wf.msc`.

<!-- pack-e2 -->
## Проверенные команды клиента

<!-- e2:cmd:dhcp -->
```cmd
ipconfig /release # освобождение аренды DHCP
ipconfig /renew # обновление аренды DHCP
ipconfig /all # проверка DHCP, адреса, шлюза и DNS
ping 192.168.5.1 # проверка связи
```

## Проверка перед сдачей

1. Serwer autoryzowany: wykonano **Dokończ konfigurację funkcji DHCP**.
2. Zakres istnieje i jest aktywny.
3. **Pula adresów**, wykluczenia, zastrzeżenia i opcje `003`/`006` są zgodne z zadaniem.
4. Klient po `ipconfig /renew` ma adres z zakresu, a nie `169.254.x.x`.

| Typowe sformułowanie | Kroki |
|---|---|
| `utwórz zakres` | **IPv4 → Nowy zakres…** |
| `zarezerwuj adres` | **Zastrzeżenia → Nowe zastrzeżenie…** |
| `serwer ma przydzielać bramę i DNS` | opcje zakresu `003 Router` i `006 Serwery DNS` |
