# Windows Server: FTP — witryna FTP, uprawnienia, ftp.exe

FTP в IIS нужен, чтобы раздавать файлы по сети. На экзамене важно не только «создать сайт», а связать четыре слоя:

1. **Usługa FTP** установлена.
2. **Witryna FTP** слушает правильный адрес и порт.
3. **Uwierzytelnianie i autoryzacja** решают, кто может войти и что может делать.
4. **Uprawnienia NTFS** реально разрешают чтение или запись файлов.

## 1. Установка роли

**Menedżer serwera → Dodaj role i funkcje → Role serwera**:

- **Serwer sieci Web (IIS)**
- внутри **Serwer FTP**:
  - **Usługa FTP**
  - при необходимости **Rozszerzalność FTP** не обязательна

После установки открой **Menedżer internetowych usług informacyjnych (IIS)**.

## 2. Создание witryny FTP

В IIS: **Witryny → Dodaj witrynę FTP…**

Поля мастера:

- **Nazwa witryny FTP** — например `Publikacja FTP 7`
- **Ścieżka fizyczna** — например `C:\ftpfiles7`
- **Powiązanie**: тип `ftp`, адрес `Wszystkie nieprzypisane` или конкретный IP, порт **21**
- **SSL**: для учебного задания обычно **Bez SSL**

На следующем шаге:

- **Uwierzytelnianie**:
  - **Anonimowe** — вход без личной учётной записи;
  - **Podstawowe** — вход логином и паролем Windows.
- **Autoryzacja**:
  - **Wszyscy użytkownicy**;
  - **Wszyscy użytkownicy anonimowi**;
  - **Określeni użytkownicy** — конкретный логин;
  - права **Odczyt** и/или **Zapis**.

Для задания вида «пользователь `jnowak` может загружать файлы» обычно выбирай:

- **Anonimowe — wyłączone**
- **Podstawowe — włączone**
- **Określeni użytkownicy: `jnowak`**
- **Odczyt + Zapis**

## 3. NTFS — без этого будет 550

Правила IIS не заменяют права файловой системы.

Открой папку: **Właściwości → Zabezpieczenia → Edytuj… → Dodaj…**

Добавь пользователя и дай минимум:

- **Odczyt i wykonanie**
- **Odczyt**
- **Zapis**
- обычно удобнее дать **Modyfikacja**

Если reguła autoryzacji FTP разрешает запись, а NTFS не разрешает — клиент получит ошибку **550 Access is denied**.

## 4. Проверка ftp.exe с Windows 11

Открой **Wiersz polecenia**:

```bat
ftp 192.168.7.1
```

Пример правильного диалога:

```text
220 Microsoft FTP Service
Użytkownik (192.168.7.1:(none)): jnowak
331 Password required
Hasło:
230 User logged in.
ftp> binary
200 Type set to I.
ftp> put raport7.txt
226 Transfer complete.
ftp> ls
150 Opening ASCII mode data connection.
raport7.txt
226 Transfer complete.
ftp> get raport7.txt pobrany7.txt
226 Transfer complete.
ftp> bye
221 Goodbye.
```

Полезные команды:

| команда | действие |
|---|---|
| `open 192.168.7.1` | подключиться к серверу |
| `user jnowak` | выбрать пользователя |
| `pass` / ввод пароля | войти |
| `ls`, `dir` | список файлов |
| `cd folder`, `pwd` | сменить / показать удалённый каталог |
| `put plik` | загрузить файл на сервер |
| `get plik lokalny` | скачать файл |
| `mkdir nazwa` | создать каталог |
| `delete plik` | удалить файл |
| `binary`, `ascii` | тип передачи |
| `bye`, `quit` | выйти |

## 5. Типичные ошибки

| ответ | причина |
|---|---|
| `530 Login incorrect` | неверный логин/пароль или wyłączone uwierzytelnianie podstawowe |
| `530 User cannot log in` | anonymous выключен, а вошли как anonymous |
| `550 Access is denied` | нет Odczyt/Zapis в regule autoryzacji или нет NTFS |
| `550 Nie można odnaleźć określonego pliku` | файла нет в FTP-каталоге |
| timeout | нет маршрута, выключен serwer, zapora блокирует TCP 21 |
| connection refused | до сервера дошли, но witryna FTP не запущена или порт другой |

## 6. Edge и `ftp://`

Адрес вида:

```text
ftp://192.168.7.1/
```

показывает список файлов FTP. Если **Anonimowe** выключено, браузер попросит логин и пароль. Для учебного IIS в симуляторе это тот же механизм: сначала uwierzytelnianie, затем autoryzacja и NTFS.

## 7. Быстрый чек-лист

1. `ping` до сервера работает.
2. Роль **Serwer FTP → Usługa FTP** установлена.
3. Witryna FTP запущена, binding `ftp`, port `21`.
4. Ścieżka fizyczна указывает на нужную папку.
5. Podstawowe включено, если вход должен быть по логину.
6. Reguła autoryzacji даёт пользователю **Odczyt** и **Zapis**.
7. NTFS на папке даёт пользователю **Modyfikacja** или хотя бы Odczyt + Zapis.
8. На клиенте файл лежит в текущем каталоге `cmd`, иначе `put` его не найдёт.

<!-- pack-e2 -->
## Проверенная команда клиента

<!-- e2:cmd:ftpclient -->
```cmd
echo test > C:\klient.txt # подготовка файла
ftp 192.168.5.1 # запуск FTP-клиента
```

После запуска `ftp` интерактивно введи login, hasło, затем `put`, `ls`, `get` и `bye` — как в диалоге выше.

## Проверка перед сдачей

1. W IIS zainstalowano **Serwer FTP → Usługa FTP**.
2. Witryna FTP jest uruchomiona, port `21`, właściwa **Ścieżka fizyczna**.
3. **Uwierzytelnianie FTP** i **Reguły autoryzacji FTP** są zgodne z zadaniem.
4. NTFS folderu pozwala na zapis, jeśli zadanie wymaga zapisu.
5. Z klienta `put` kończy się bez `530`/`550`, a `ls` pokazuje plik.
