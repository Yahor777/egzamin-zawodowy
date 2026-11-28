# Windows Server: домен — контроллер, DNS, присоединение клиента

Клиент находит домен **через DNS**. Поэтому первое правило: *предпочитаемый DNS клиента = IP контроллера домена*. Адрес роутера или 8.8.8.8 здесь не подходят — они не знают имени домена.

## 1. Контроллер домена (сервер)

1. `ncpa.cpl`: статический IP, **DNS = свой же адрес** (после повышения роль DNS на этом же сервере).
2. Переименуй сервер до повышения (по желанию): `sysdm.cpl` → *Zmień…*.
3. *Dodaj role i funkcje* → **Usługi domenowe w usłudze Active Directory** → *Dodaj funkcje* → *Zainstaluj*.
4. Флажок ⚑ → *Podnieś poziom tego serwera do kontrolera domeny* → **Dodaj nowy las** → имя корневого домена (например `firma.local`) → пароль DSRM → NetBIOS (`FIRMA`) → *Zainstaluj*. Сервер перезагрузится сам.
5. После входа `dsa.msc` (*Użytkownicy i komputery usługi Active Directory*):
   - ПКМ на домене → *Nowy* → *Jednostka organizacyjna* (OU);
   - ПКМ на OU → *Nowy* → *Użytkownik*: имя, фамилия, **nazwa logowania**, пароль (по умолчанию политика: 7+ знаков, 3 из 4 классов), флажок *Użytkownik musi zmienić hasło przy następnym logowaniu*.

## 2. Клиент (Windows 11)

1. `ncpa.cpl` → IPv4: адрес из той же сети, **Preferowany serwer DNS = IP контроллера**.
2. Проверка: `nslookup firma.local` должен вернуть адрес сервера. `ping` сервера работает только если на сервере включено правило echo.
3. `sysdm.cpl` → *Zmień…* → **Członek: Domeny** → `firma.local` → OK → окно «Zabezpieczenia systemu Windows»: **Administrator** / пароль → «Witamy w domenie firma.local» → **перезагрузка** обязательна.
4. Экран входа → **Inny użytkownik** → `FIRMA\jkowalski` (или `jkowalski@firma.local`). При первом входе система потребует **сменить пароль** (новый пароль должен пройти политику домена).
5. Компьютер появился в `dsa.msc` → контейнер **Computers**.

## 3. Ошибки и что они значат

| Сообщение | Причина |
|---|---|
| *Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC) dla domeny…* | DNS клиента не указывает на DC / опечатка в имени / DC выключен / нет кабеля |
| *Nieznana nazwa użytkownika lub nieprawidłowe hasło* | неверные данные учётки при присоединении |
| *Hasło użytkownika musi zostać zmienione…* | первый вход: смени пароль на экране входа |
| *Twoje konto zostało wyłączone* | в ADUC учётка отключена |
| Не вижу «Inny użytkownik» | компьютер ещё не перезагружали после присоединения |

## 4. То же из командной строки

```
netdom join %computername% /domain:firma.local /userd:FIRMA\Administrator /passwordd:ZAQ!2wsx
Add-Computer -DomainName firma.local -Credential FIRMA\Administrator     # PowerShell, спросит пароль
whoami                      # firma\jkowalski
gpresult /r
```

<!-- pack-e2 -->
## Проверенные команды присоединения

<!-- e2:cmd:domain -->
```cmd
netdom join %computername% /domain:firma01.local /userd:FIRMA01\Administrator /passwordd:ZAQ!2wsx # присоединение клиента
gpupdate /force # обновление политик после входа
gpresult /r # проверка применённых GPO
```

<!-- e2:ps:domain -->
```powershell
Add-Computer -DomainName firma01.local -Credential FIRMA01\Administrator # присоединение компьютера
```

## Типичные формулировки CKE → что делать

| Treść zadania | Kroki |
|---|---|
| `serwer ma pełnić rolę kontrolera domeny` | AD DS → **Podnieś poziom tego serwera do kontrolera domeny** |
| `utwórz jednostkę organizacyjną` | `dsa.msc` → **Nowy → Jednostka organizacyjna** |
| `utwórz konto użytkownika` | OU → **Nowy → Użytkownik** |
| `grupę globalną` | OU → **Nowy → Grupa** → **Globalna** + **Zabezpieczenia** |
| `dołącz stację roboczą do domeny` | DNS klienta na serwer, potem `sysdm.cpl` lub `netdom` |

Проверка: клиент показывает **Domena: firma01.local** в `sysdm.cpl`, а `whoami` после входа — `FIRMA01\login`.
